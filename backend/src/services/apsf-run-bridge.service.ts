import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { ExecuteRequest } from '../types/index.js';
import { PhaseDetector, resolveRunDir, PhaseInfo } from './apsf-native/phase-detector.js';
import { startRun } from './apsf-native/run-store.js';
import { writePhase as nativeWritePhase } from './apsf-native/write-phase.js';
import { applyJudgeDecision, JudgeDecisionResult } from './apsf-native/judge-decision.js';
import { loadRunState } from './apsf-native/run-state.js';
import {
  listTranscripts,
  readTranscript,
  TranscriptMeta,
  TranscriptEvent,
} from './apsf-native/execution-transcript.js';
import {
  enqueue,
  cancelExecution,
  listExecuting,
  getQueueState,
} from './execution-queue.js';

/**
 * APSFRunBridge: APSF ワークフローのワークスペース操作層
 *
 * 完全 TypeScript ネイティブ（python / apsf CLI / PowerShell いずれも不要）:
 * - 状態       : <APSF_ROOT>/runs/<run-name>/（goal.md, plan.md, run_state.json...）
 * - フェーズ検出: phase-detector.ts（python `apsf next` と parity 30/30）
 * - run 作成   : run-store.ts（python `apsf start-run` とバイト一致 parity）
 * - phase 保存 : write-phase.ts（python `apsf write-phase` と parity 12/12 —
 *                上書き保護・run_state 遷移・judge advisory 含む）
 * - プロンプト  : prompt-builder.ts（python `apsf act --print-prompt` と
 *                parity 6/6 バイト一致 — specialist 選択含む）
 * - 実行/ループ : native-executor.ts（AI CLI 直接 spawn + human フェーズ停止）
 *
 * NOTE: 実行キューは execution-queue.ts に委譲（モジュールレベル共有状態）
 */
/** run 名の許容形式（YYYY-MM-DD(-NNN)_case_topic）— パス片として使うため厳格に検証 */
export const RUN_NAME_RE = /^\d{4}-\d{2}-\d{2}(-\d{3})?_[A-Za-z0-9._-]+$/;

/**
 * phase として読み書きを許可するファイル名（ホワイトリスト）。
 */
export const PHASE_FILES = [
  'task.md', 'goal.md', 'execution-assignment.md', 'plan.md', 'build.md',
  'review.md', 'improve-plan.md', 'improve.md', 'verify.md', 'result.md',
  'handoff.md', 'transcript.md',
  'plan_review.md', 'build_review.md', 'review_review.md', 'improve_review.md',
  'model-assignment.md',
] as const;

export class APSFRunBridge extends EventEmitter {

  // NOTE: コンストラクタでキャッシュしない。ESM の import ホイスティングにより
  // モジュールレベルのインスタンス化が dotenv.config() より先に走るため、
  // env はアクセス時に遅延評価する
  private get apsfRoot(): string {
    return process.env.APSF_ROOT || '';
  }

  /** 実 APSF が利用可能か（APSF_ROOT の runs/ が実在するか） */
  isAvailable(): boolean {
    return (
      this.apsfRoot.length > 0 &&
      fs.existsSync(path.join(this.apsfRoot, 'runs'))
    );
  }

  /**
   * runs/ 配下の run 一覧を取得
   * （実 APSF の配置: runs/ 直下、runs/fw-improvement/, runs/work/）
   */
  listRuns(): string[] {
    if (!this.isAvailable()) return [];
    const runsDir = path.join(this.apsfRoot, 'runs');
    const isRunName = (name: string) => /^\d{4}-\d{2}-\d{2}/.test(name);
    const results: string[] = [];

    for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (isRunName(entry.name)) {
        results.push(entry.name);
      } else if (['fw-improvement', 'work'].includes(entry.name)) {
        const sub = path.join(runsDir, entry.name);
        for (const child of fs.readdirSync(sub, { withFileTypes: true })) {
          if (child.isDirectory() && isRunName(child.name)) {
            results.push(child.name);
          }
        }
      }
    }
    return results.sort();
  }

  /**
   * 現在フェーズを取得（TS ネイティブ検出）
   */
  async getPhase(runName: string): Promise<string> {
    return this.getPhaseInfo(runName).phase;
  }

  /** フェーズ + メタ情報（next role / 読み書きファイル / human 判定） */
  getPhaseInfo(runName: string): PhaseInfo {
    const runDir = resolveRunDir(this.apsfRoot, runName);
    if (!runDir) {
      throw new Error(`Run not found: ${runName}`);
    }
    return new PhaseDetector(runDir).detect();
  }

  /** run ディレクトリの絶対パス */
  getRunDir(runName: string): string | null {
    return resolveRunDir(this.apsfRoot, runName);
  }

  /**
   * run に実在する読み取り可能な成果物ファイル一覧（成果物ビューア用）。
   */
  listArtifacts(runName: string): string[] {
    this.assertRunName(runName);
    const runDir = resolveRunDir(this.apsfRoot, runName);
    if (!runDir) throw new Error(`Run not found: ${runName}`);
    return PHASE_FILES.filter((f) => fs.existsSync(path.join(runDir, f)));
  }

  /** run_state.json の実行ステータス（failed 表示・回復 UI 用） */
  getRunStateMeta(runName: string): { phaseStatus: string; lastError: string } {
    this.assertRunName(runName);
    const runDir = resolveRunDir(this.apsfRoot, runName);
    if (!runDir) throw new Error(`Run not found: ${runName}`);
    const state = loadRunState(runDir);
    return {
      phaseStatus: state?.phase_status ?? 'pending',
      lastError: state?.last_error ?? '',
    };
  }

  /**
   * 実 APSF run を実行し、進捗を StreamEvent で配信する（TS ネイティブ）
   */
  async execute(request: ExecuteRequest): Promise<void> {
    if (!this.isAvailable()) {
      this.emitError(request.runId, 'APSF framework not available. Set APSF_ROOT to the framework repository.');
      return;
    }
    if (!RUN_NAME_RE.test(request.runId)) {
      this.emitError(request.runId, `Invalid run name: ${request.runId}`);
      return;
    }
    enqueue({ request, emitter: this, apsfRoot: this.apsfRoot });
  }

  private emitError(runId: string, message: string): void {
    this.emit('event', {
      type: 'error',
      runId,
      timestamp: Date.now(),
      data: { error: message },
    });
  }

  /** 実行中の処理をキャンセル（待機列からの除去も含む） */
  cancelExecution(runId: string): void {
    cancelExecution(runId);
  }

  /** 実行中 + 待機中の run 一覧 */
  listExecuting(): string[] {
    return listExecuting();
  }

  /** キュー状態（GET /api/runs/queue） */
  getQueueState(): { running: string | null; queued: string[] } {
    return getQueueState();
  }

  // ── Run 作成・phase ファイル・advisory ─────────────────────────

  /** phase ファイル名の検証（パストラバーサル防止のホワイトリスト） */
  private assertPhaseFile(filename: string): void {
    if (!(PHASE_FILES as readonly string[]).includes(filename)) {
      throw new Error(`Not a phase file: ${filename}`);
    }
  }

  private assertRunName(runName: string): void {
    if (!RUN_NAME_RE.test(runName)) {
      throw new Error(`Invalid run name: ${runName}`);
    }
  }

  /**
   * 新しい run を作成（TS ネイティブ run-store）
   */
  async createRun(
    runName: string,
    options: { light?: boolean; taxonomy?: string } = {}
  ): Promise<void> {
    this.assertRunName(runName);
    if (options.taxonomy && !['fw-improvement', 'work'].includes(options.taxonomy)) {
      throw new Error(`Invalid taxonomy: ${options.taxonomy}`);
    }
    startRun(this.apsfRoot, runName, {
      light: options.light,
      taxonomy: options.taxonomy as 'fw-improvement' | 'work' | undefined,
    });
  }

  /** phase ファイルの内容を読む（存在しなければ null） */
  readPhaseFile(runName: string, filename: string): string | null {
    this.assertRunName(runName);
    this.assertPhaseFile(filename);
    const runDir = resolveRunDir(this.apsfRoot, runName);
    if (!runDir) throw new Error(`Run not found: ${runName}`);
    const p = path.join(runDir, filename);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
  }

  /**
   * 現在フェーズの対象ファイルに内容を保存
   */
  async writePhase(
    runName: string,
    content: string
  ): Promise<{ fileWritten: string; phase: string }> {
    this.assertRunName(runName);
    const runDir = resolveRunDir(this.apsfRoot, runName);
    if (!runDir) throw new Error(`Run not found: ${runName}`);
    const result = nativeWritePhase(runDir, content);
    return { fileWritten: result.fileWritten, phase: result.phaseAfter };
  }

  /**
   * Judge 裁定（Accept / Return to Build / Return to Plan）を適用する。
   */
  judgeDecision(runName: string, decision: string, reason?: string): JudgeDecisionResult {
    this.assertRunName(runName);
    const runDir = resolveRunDir(this.apsfRoot, runName);
    if (!runDir) throw new Error(`Run not found: ${runName}`);
    if (listExecuting().includes(runName)) {
      throw new Error(`Run ${runName} is currently executing or queued. Wait for completion or cancel first.`);
    }
    return applyJudgeDecision(runDir, decision, reason);
  }

  /** 過去の実行トランスクリプト一覧（新しい順） */
  listExecutions(runName: string): TranscriptMeta[] {
    this.assertRunName(runName);
    const runDir = resolveRunDir(this.apsfRoot, runName);
    if (!runDir) throw new Error(`Run not found: ${runName}`);
    return listTranscripts(runDir);
  }

  /** 実行トランスクリプトの読み出し */
  readExecution(runName: string, filename: string): TranscriptEvent[] | null {
    this.assertRunName(runName);
    const runDir = resolveRunDir(this.apsfRoot, runName);
    if (!runDir) throw new Error(`Run not found: ${runName}`);
    return readTranscript(runDir, filename);
  }

  /** judge_advisory.json を読む（存在しなければ null） */
  getAdvisory(runName: string): Record<string, unknown> | null {
    this.assertRunName(runName);
    const runDir = resolveRunDir(this.apsfRoot, runName);
    if (!runDir) throw new Error(`Run not found: ${runName}`);
    const p = path.join(runDir, 'judge_advisory.json');
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch {
      return null;
    }
  }
}
