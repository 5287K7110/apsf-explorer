import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ExecuteRequest, StreamEvent } from '../types/index.js';
import { PhaseDetector, resolveRunDir, PhaseInfo } from './apsf-native/phase-detector.js';
import { NativeApsfExecutor } from './apsf-native/native-executor.js';

/**
 * APSFRunBridge: 実 APSF Framework (ai-problem-solving-framework) との通信層
 *
 * TS ネイティブ実装（ps1/PowerShell 依存なし・クロスプラットフォーム）:
 * - 状態       : <APSF_ROOT>/runs/<run-name>/ ディレクトリ（goal.md, plan.md, build.md...）
 * - フェーズ検出: apsf-native/phase-detector.ts（`apsf next` と parity 検証済み 29/29）
 * - 実行       : apsf-native/native-executor.ts
 *                （prompt = `apsf act --print-prompt` → claude/codex spawn →
 *                  保存 = `apsf write-phase --stdin`。ps1 ラッパーの置き換え）
 * - ループ      : NativeApsfExecutor.executeLoop（apsf-auto-loop.ps1 の置き換え）
 *
 * 設定:
 * - APSF_ROOT: 実 APSF リポジトリのパス（未設定なら isAvailable() が false）
 * - APSF_BIN : apsf CLI コマンド名（デフォルト 'apsf'）
 */
/** run 名の許容形式（YYYY-MM-DD(-NNN)_case_topic）— パス片として使うため厳格に検証 */
export const RUN_NAME_RE = /^\d{4}-\d{2}-\d{2}(-\d{3})?_[A-Za-z0-9._-]+$/;

/** phase として読み書きを許可するファイル名（ホワイトリスト） */
export const PHASE_FILES = [
  'task.md', 'goal.md', 'execution-assignment.md', 'plan.md', 'build.md',
  'review.md', 'improve-plan.md', 'improve.md', 'verify.md', 'result.md',
  'handoff.md', 'transcript.md',
] as const;

/**
 * 実行中 executor のレジストリ。
 * ExecutionModeRouter は getExecutor 毎に新しい APSFRunBridge を作るため、
 * 二重実行ガード・キャンセルはインスタンスを跨いで共有する必要がある。
 */
const activeExecutors: Map<string, NativeApsfExecutor> = new Map();

export class APSFRunBridge extends EventEmitter {

  // NOTE: コンストラクタでキャッシュしない。ESM の import ホイスティングにより
  // モジュールレベルのインスタンス化が dotenv.config() より先に走るため、
  // env はアクセス時に遅延評価する（統合テストと dev で挙動が割れたバグの修正）
  private get apsfRoot(): string {
    return process.env.APSF_ROOT || '';
  }

  private get apsfBin(): string {
    return process.env.APSF_BIN || 'apsf';
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
   * 実 APSF run を実行し、進捗を StreamEvent で配信する（TS ネイティブ・ps1 不使用）
   *
   * - request.runId = 実 APSF の run 名
   * - command 'full-cycle' → human フェーズまで auto-loop
   * - それ以外（plan/build/review 等）→ 現在フェーズを 1 回だけ実行
   * - request.context.dryRun = true でプロンプト組み立てのみ（AI 実行なし）
   */
  async execute(request: ExecuteRequest): Promise<void> {
    let registered = false;
    try {
      if (!this.isAvailable()) {
        throw new Error('APSF framework not available. Set APSF_ROOT to the framework repository.');
      }
      if (!RUN_NAME_RE.test(request.runId)) {
        throw new Error(`Invalid run name: ${request.runId}`);
      }
      // 同一 run への二重実行を防止
      if (activeExecutors.has(request.runId)) {
        throw new Error(`Run ${request.runId} is already executing. Cancel it first or wait for completion.`);
      }

      const provider = request.provider === 'codex' ? 'codex' : 'claude';
      const dryRun = Boolean(request.context && (request.context as any).dryRun);
      const isLoop = request.command === 'full-cycle';

      console.log(
        `[APSF-RUN] native ${isLoop ? 'auto-loop' : 'single-phase'} ${request.runId}${dryRun ? ' (DryRun)' : ''}`
      );

      const executor = new NativeApsfExecutor(this.apsfRoot, this.apsfBin);
      activeExecutors.set(request.runId, executor);
      registered = true;
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

      activeExecutors.delete(request.runId);
      this.emit('event', {
        type: 'complete',
        runId: request.runId,
        timestamp: Date.now(),
        data: { mode: 'apsf-run', engine: 'native', exitCode: 0, phase, ...detail },
      } as StreamEvent);
    } catch (error) {
      // 二重実行拒否のエラーで先行実行のレジストリを消さないこと
      if (registered) activeExecutors.delete(request.runId);
      this.emit('event', {
        type: 'error',
        runId: request.runId,
        timestamp: Date.now(),
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      } as StreamEvent);
    }
  }

  /** 実行中の処理をキャンセル */
  cancelExecution(runId: string): void {
    activeExecutors.get(runId)?.cancel();
    activeExecutors.delete(runId);
  }

  /** 実行中の run 一覧 */
  listExecuting(): string[] {
    return [...activeExecutors.keys()];
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
   * 新しい run を作成（`apsf start-run` 経由 — テンプレート複製・
   * run_state 初期化は framework の正規経路に委ねる）
   */
  createRun(runName: string, options: { light?: boolean; taxonomy?: string } = {}): Promise<void> {
    this.assertRunName(runName);
    const args = ['start-run', runName];
    if (options.light) args.push('--light');
    if (options.taxonomy) {
      if (!['fw-improvement', 'work'].includes(options.taxonomy)) {
        throw new Error(`Invalid taxonomy: ${options.taxonomy}`);
      }
      args.push('--taxonomy', options.taxonomy);
    }

    return new Promise((resolve, reject) => {
      const child = spawnApsf(this.apsfBin, args, this.apsfRoot);
      let stderr = '';
      let stdout = '';
      child.stdout?.on('data', (d) => (stdout += d.toString()));
      child.stderr?.on('data', (d) => (stderr += d.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`apsf start-run failed (exit=${code}): ${(stderr || stdout).slice(0, 300)}`));
      });
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
   * （`apsf write-phase --stdin` 経由 — 上書き保護・run_state 遷移・
   * イベントログは framework の正規経路に委ねる）
   */
  writePhase(runName: string, content: string): Promise<{ fileWritten: string; phase: string }> {
    this.assertRunName(runName);
    const target = this.getPhaseInfo(runName);

    return new Promise((resolve, reject) => {
      const child = spawnApsf(this.apsfBin, ['write-phase', runName, '--stdin'], this.apsfRoot);
      let stderr = '';
      let stdout = '';
      child.stdout?.on('data', (d) => (stdout += d.toString()));
      child.stderr?.on('data', (d) => (stderr += d.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ fileWritten: target.fileToWrite, phase: this.getPhaseInfo(runName).phase });
        } else {
          reject(new Error(`apsf write-phase failed (exit=${code}): ${(stderr || stdout).slice(0, 300)}`));
        }
      });
      child.stdin?.write(content);
      child.stdin?.end();
    });
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

/** apsf CLI を API キー env 除去 + UTF-8 で spawn する共通ヘルパー */
function spawnApsf(bin: string, args: string[], cwd: string) {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.OPENAI_API_KEY;
  delete env.GEMINI_API_KEY;
  env.PYTHONIOENCODING = 'utf-8';
  return spawn(bin, args, { cwd, shell: true, env, timeout: 60000 });
}
