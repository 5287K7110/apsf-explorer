import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { ExecuteRequest, StreamEvent } from '../types/index.js';
import { PhaseDetector, resolveRunDir, PhaseInfo } from './apsf-native/phase-detector.js';
import { NativeApsfExecutor } from './apsf-native/native-executor.js';
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
 * 設定:
 * - APSF_ROOT: ワークスペースのパス（runs/ を含むディレクトリ。
 *   既存の APSF framework checkout でも、runs/ だけの空ディレクトリでも良い。
 *   specialist 定義・テンプレートは workspace に framework/ があればそれを、
 *   なければ Explorer 同梱コンテンツ backend/content/ を使用）
 *
 * NOTE: runs/ への書き込みは Explorer に一本化する。python 版 apsf CLI との
 * 並用は run 状態の drift を招くため非推奨。
 */
/** run 名の許容形式（YYYY-MM-DD(-NNN)_case_topic）— パス片として使うため厳格に検証 */
export const RUN_NAME_RE = /^\d{4}-\d{2}-\d{2}(-\d{3})?_[A-Za-z0-9._-]+$/;

/**
 * phase として読み書きを許可するファイル名（ホワイトリスト）。
 * *_review.md 系は Judge 差し戻し理由等の読み取り用（書き込みは
 * write-phase の PHASE_TARGET が現在フェーズの対象のみに制約する）
 */
export const PHASE_FILES = [
  'task.md', 'goal.md', 'execution-assignment.md', 'plan.md', 'build.md',
  'review.md', 'improve-plan.md', 'improve.md', 'verify.md', 'result.md',
  'handoff.md', 'transcript.md',
  'plan_review.md', 'build_review.md', 'review_review.md', 'improve_review.md',
  'model-assignment.md',
] as const;

/**
 * 実行キュー（モジュールレベル共有）。
 * ExecutionModeRouter は getExecutor 毎に新しい APSFRunBridge を作るため、
 * キュー・実行中状態・二重実行ガードはインスタンスを跨いで共有する必要がある。
 *
 * 設計判断: 同時実行は 1 件に制限し、以降の要求は FIFO で直列処理する
 * （複数 run の並行実行はイベント混線・CLI リソース競合が未設計のため）。
 * キューはメモリのみ — プロセス再起動で消えるのは意図的（再起動時は
 * crash recovery が実行中だった run を failed 化するため、キュー残余の
 * 復元よりも「ユーザーが再要求する」方が状態として誠実）。
 */
interface QueueEntry {
  request: ExecuteRequest;
  bridge: APSFRunBridge;
}
const executionQueue: QueueEntry[] = [];
let runningEntry: { runId: string; executor: NativeApsfExecutor } | null = null;
let drainActive = false;

export class APSFRunBridge extends EventEmitter {

  // NOTE: コンストラクタでキャッシュしない。ESM の import ホイスティングにより
  // モジュールレベルのインスタンス化が dotenv.config() より先に走るため、
  // env はアクセス時に遅延評価する（統合テストと dev で挙動が割れたバグの修正）
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
   *
   * 旧実装は `apsf next --phase-only` を spawn していた（python 起動 ~500ms/回）。
   * apsf-native/phase-detector.ts が同一規則を実装しており、全 29 run で
   * parity 検証済み（run-apsf-parity-test.ts: 29 match, 0 mismatch）。
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
   * PhaseDetector の existingFiles ではなく読み取りホワイトリスト
   * （PHASE_FILES）を基準にする — detector の KNOWN_FILES は python parity
   * を維持する検出用リストであり、閲覧対象の定義とは責務が異なる
   * （review_review.md のように detector 未走査でも閲覧可能にすべきものがある）
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
   * 実 APSF run を実行し、進捗を StreamEvent で配信する（TS ネイティブ・ps1 不使用）
   *
   * - request.runId = 実 APSF の run 名
   * - command 'full-cycle' → human フェーズまで auto-loop
   * - それ以外（plan/build/review 等）→ 現在フェーズを 1 回だけ実行
   * - request.context.dryRun = true でプロンプト組み立てのみ（AI 実行なし）
   */
  async execute(request: ExecuteRequest): Promise<void> {
    // 検証と二重実行/二重キューのガード（同期プロローグ — enqueue 前に決着）
    if (!this.isAvailable()) {
      this.emitError(request.runId, 'APSF framework not available. Set APSF_ROOT to the framework repository.');
      return;
    }
    if (!RUN_NAME_RE.test(request.runId)) {
      this.emitError(request.runId, `Invalid run name: ${request.runId}`);
      return;
    }
    if (
      runningEntry?.runId === request.runId ||
      executionQueue.some((e) => e.request.runId === request.runId)
    ) {
      this.emitError(
        request.runId,
        `Run ${request.runId} is already executing or queued. Cancel it first or wait for completion.`
      );
      return;
    }

    executionQueue.push({ request, bridge: this });
    // 待たされる場合は順番を通知（実行中 + 自分より前の待機数）
    if (runningEntry || executionQueue.length > 1) {
      const position = executionQueue.length - 1 + (runningEntry ? 1 : 0);
      this.emit('event', {
        type: 'queued',
        runId: request.runId,
        timestamp: Date.now(),
        data: {
          mode: 'apsf-run',
          position,
          message: `[queue] waiting at position ${position} (running: ${runningEntry?.runId ?? '(draining)'})`,
        },
      } as StreamEvent);
    }
    this.broadcastQueueState(request.runId);
    void APSFRunBridge.drain();
  }

  /**
   * canonical なキュー状態イベント（enqueue / started / cancel / 完了で配信）。
   * 個別の queued(position) 通知は dequeue やキャンセルで stale になるため、
   * UI はこのイベントを正とする。
   */
  private broadcastQueueState(runId: string): void {
    this.emit('event', {
      type: 'queue',
      runId,
      timestamp: Date.now(),
      data: { mode: 'apsf-run', ...this.getQueueState() },
    } as StreamEvent);
  }

  /** FIFO drain — 常に 1 件だけ実行。1 件の失敗は次の実行を止めない */
  private static async drain(): Promise<void> {
    if (drainActive) return;
    drainActive = true;
    try {
      while (executionQueue.length > 0) {
        const { request, bridge } = executionQueue.shift()!;
        const executor = new NativeApsfExecutor(bridge.apsfRoot);
        runningEntry = { runId: request.runId, executor };
        bridge.emit('event', {
          type: 'started',
          runId: request.runId,
          timestamp: Date.now(),
          data: { mode: 'apsf-run', command: request.command, message: '[queue] execution started' },
        } as StreamEvent);
        bridge.broadcastQueueState(request.runId);
        try {
          await bridge.runExecution(request, executor);
        } catch (error) {
          // runExecution は自前で error イベントを出す — ここは queue 継続の防波堤
          console.error('[APSF-RUN] drain caught unexpected error:', error);
        } finally {
          runningEntry = null;
          bridge.broadcastQueueState(request.runId);
        }
      }
    } finally {
      drainActive = false;
    }
  }

  /** 1 件の実行本体（例外は error イベントに変換して外へ漏らさない） */
  private async runExecution(request: ExecuteRequest, executor: NativeApsfExecutor): Promise<void> {
    try {
      const provider = request.provider === 'codex' ? 'codex' : 'claude';
      const dryRun = Boolean(request.context && (request.context as any).dryRun);
      const isLoop = request.command === 'full-cycle';

      console.log(
        `[APSF-RUN] native ${isLoop ? 'auto-loop' : 'single-phase'} ${request.runId}${dryRun ? ' (DryRun)' : ''}`
      );

      executor.on('event', (event: StreamEvent) => this.emit('event', event));

      const opts = { runId: request.runId, provider, dryRun } as const;
      let phase: string;
      let detail: Record<string, unknown> = {};

      if (isLoop) {
        const result = await executor.executeLoop(opts);
        phase = result.phase;
        detail = { cycles: result.cycles, stopReason: result.stopReason };
      } else {
        phase = await executor.executePhase(opts);
      }

      this.emit('event', {
        type: 'complete',
        runId: request.runId,
        timestamp: Date.now(),
        data: { mode: 'apsf-run', engine: 'native', exitCode: 0, phase, ...detail },
      } as StreamEvent);
    } catch (error) {
      this.emitError(request.runId, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private emitError(runId: string, message: string): void {
    this.emit('event', {
      type: 'error',
      runId,
      timestamp: Date.now(),
      data: { error: message },
    } as StreamEvent);
  }

  /** 実行中の処理をキャンセル（待機列からの除去も含む） */
  cancelExecution(runId: string): void {
    if (runningEntry?.runId === runId) {
      runningEntry.executor.cancel();
      return;
    }
    const idx = executionQueue.findIndex((e) => e.request.runId === runId);
    if (idx >= 0) {
      const [entry] = executionQueue.splice(idx, 1);
      entry.bridge.emitError(runId, 'Cancelled while queued.');
      entry.bridge.broadcastQueueState(runId);
    }
  }

  /** 実行中 + 待機中の run 一覧（二重実行ガード・UI の executing 表示用） */
  listExecuting(): string[] {
    return [
      ...(runningEntry ? [runningEntry.runId] : []),
      ...executionQueue.map((e) => e.request.runId),
    ];
  }

  /** キュー状態（GET /api/runs/queue） */
  getQueueState(): { running: string | null; queued: string[] } {
    return {
      running: runningEntry?.runId ?? null,
      queued: executionQueue.map((e) => e.request.runId),
    };
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
   * 新しい run を作成（TS ネイティブ run-store — python start-run と
   * バイト一致 parity 検証済み）
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
   * （TS ネイティブ write-phase — 上書き保護・run_state 遷移・
   * judge advisory。python 版と parity 検証済み）
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
   * IMPROVE_NEEDED 以外では JudgeDecisionConflictError（statusCode=409）。
   */
  judgeDecision(runName: string, decision: string, reason?: string): JudgeDecisionResult {
    this.assertRunName(runName);
    const runDir = resolveRunDir(this.apsfRoot, runName);
    if (!runDir) throw new Error(`Run not found: ${runName}`);
    // 実行中の run への裁定は状態競合を招くため拒否（実行中ガード再利用）
    if (this.listExecuting().includes(runName)) {
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

  /** 実行トランスクリプトの読み出し（ファイル名はホワイトリスト検証） */
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
