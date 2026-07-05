import { EventEmitter } from 'events';
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
export class APSFRunBridge extends EventEmitter {
  private activeExecutors: Map<string, NativeApsfExecutor> = new Map();

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
    try {
      if (!this.isAvailable()) {
        throw new Error('APSF framework not available. Set APSF_ROOT to the framework repository.');
      }

      const provider = request.provider === 'codex' ? 'codex' : 'claude';
      const dryRun = Boolean(request.context && (request.context as any).dryRun);
      const isLoop = request.command === 'full-cycle';

      console.log(
        `[APSF-RUN] native ${isLoop ? 'auto-loop' : 'single-phase'} ${request.runId}${dryRun ? ' (DryRun)' : ''}`
      );

      const executor = new NativeApsfExecutor(this.apsfRoot, this.apsfBin);
      this.activeExecutors.set(request.runId, executor);
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

      this.activeExecutors.delete(request.runId);
      this.emit('event', {
        type: 'complete',
        runId: request.runId,
        timestamp: Date.now(),
        data: { mode: 'apsf-run', engine: 'native', exitCode: 0, phase, ...detail },
      } as StreamEvent);
    } catch (error) {
      this.activeExecutors.delete(request.runId);
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
    this.activeExecutors.get(runId)?.cancel();
    this.activeExecutors.delete(runId);
  }
}
