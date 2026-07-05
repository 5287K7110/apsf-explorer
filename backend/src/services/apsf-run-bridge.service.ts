import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { ExecuteRequest, StreamEvent } from '../types/index.js';

/**
 * APSFRunBridge: 実 APSF Framework (ai-problem-solving-framework) との通信層
 *
 * 実 APSF のプロトコル（scripts/ から追跡した実仕様）:
 * - 状態     : <APSF_ROOT>/runs/<run-name>/ ディレクトリ（goal.md, plan.md, build.md...）
 * - フェーズ  : `apsf next <run> --phase-only` → PLAN_NEEDED / BUILD_NEEDED / ... / COMPLETE
 * - 実行     : ps1 ラッパー（apsf-claude-act.ps1, apsf-codex-build.ps1 等）が
 *              プロンプトを組み立て claude/codex CLI に流し込む
 * - ループ    : apsf-auto-loop.ps1 が human フェーズまで PLAN→BUILD→REVIEW を反復
 *
 * 旧 APSFBridgeService の `python -m apsf.cli execute --format json` は
 * 実 APSF に存在しない架空のプロトコルだったため、本クラスが実仕様で置き換える。
 *
 * 設定:
 * - APSF_ROOT: 実 APSF リポジトリのパス（未設定なら isAvailable() が false）
 * - APSF_BIN : apsf CLI コマンド名（デフォルト 'apsf'）
 */
export class APSFRunBridge extends EventEmitter {
  private apsfRoot: string;
  private apsfBin: string;
  private activeProcesses: Map<string, ChildProcess> = new Map();

  constructor() {
    super();
    this.apsfRoot = process.env.APSF_ROOT || '';
    this.apsfBin = process.env.APSF_BIN || 'apsf';
  }

  /** 実 APSF が利用可能か（APSF_ROOT が実在し scripts/ を持つか） */
  isAvailable(): boolean {
    return (
      this.apsfRoot.length > 0 &&
      fs.existsSync(path.join(this.apsfRoot, 'runs')) &&
      fs.existsSync(path.join(this.apsfRoot, 'scripts'))
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

  /** `apsf next <run> --phase-only` で現在フェーズを取得（実 CLI 実行） */
  getPhase(runName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.apsfBin, ['next', runName, '--phase-only'], {
        cwd: this.apsfRoot,
        shell: true,
        timeout: 30000,
      });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d) => (stdout += d.toString()));
      child.stderr?.on('data', (d) => (stderr += d.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          // 最終行がフェーズトークン（typer が警告等を先行出力する場合がある）
          const lines = stdout.trim().split(/\r?\n/);
          resolve(lines[lines.length - 1].trim());
        } else {
          reject(new Error(`apsf next failed (exit=${code}): ${stderr.slice(0, 200)}`));
        }
      });
    });
  }

  /**
   * command → 実 APSF ラッパースクリプトのマッピング
   * （apsf-auto-loop.ps1 のデフォルト構成に準拠）
   */
  private selectScript(request: ExecuteRequest): { script: string; extraArgs: string[] } {
    const provider = request.provider === 'codex' ? 'codex' : 'claude';
    switch (request.command) {
      case 'plan':
      case 'review':
      case 'judge':
        return provider === 'codex'
          ? { script: request.command === 'plan' ? 'apsf-codex-plan.ps1' : 'apsf-codex-review.ps1', extraArgs: [] }
          : { script: 'apsf-claude-act.ps1', extraArgs: [] };
      case 'build':
      case 'retry':
        return provider === 'codex'
          ? { script: 'apsf-codex-build.ps1', extraArgs: [] }
          : { script: 'apsf-claude-build.ps1', extraArgs: [] };
      case 'full-cycle':
        return { script: 'apsf-auto-loop.ps1', extraArgs: [] };
      default:
        throw new Error(`Unknown command: ${request.command}`);
    }
  }

  /**
   * 実 APSF ラッパーを実行し、進捗を StreamEvent で配信する
   * - request.runId = 実 APSF の run 名
   * - request.context.dryRun = true でラッパーの -DryRun（プロンプト組み立てのみ、AI 実行なし）
   */
  async execute(request: ExecuteRequest): Promise<void> {
    const processId = `${request.runId}-${Date.now()}`;

    try {
      if (!this.isAvailable()) {
        throw new Error('APSF framework not available. Set APSF_ROOT to the framework repository.');
      }

      const { script, extraArgs } = this.selectScript(request);
      const scriptPath = path.join(this.apsfRoot, 'scripts', script);
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`APSF wrapper script not found: ${scriptPath}`);
      }

      const args = [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        request.runId,
        ...extraArgs,
      ];
      if (request.context && (request.context as any).dryRun) {
        args.push('-DryRun');
      }

      console.log(`[APSF-RUN] ${script} ${request.runId}${args.includes('-DryRun') ? ' (DryRun)' : ''}`);

      const child = spawn('powershell', args, {
        cwd: this.apsfRoot,
        timeout: 30 * 60 * 1000, // auto-loop は長時間になり得る
      });

      this.activeProcesses.set(processId, child);

      child.stdout?.on('data', (data) => {
        this.emit('event', {
          type: 'progress',
          runId: request.runId,
          timestamp: Date.now(),
          data: {
            message: data.toString(),
            mode: 'apsf-run',
            script,
            provider: request.provider,
          },
        } as StreamEvent);
      });

      child.stderr?.on('data', (data) => {
        this.emit('event', {
          type: 'log',
          runId: request.runId,
          timestamp: Date.now(),
          data: { message: data.toString(), stream: 'stderr' },
        } as StreamEvent);
      });

      child.on('error', (err) => {
        this.activeProcesses.delete(processId);
        this.emit('event', {
          type: 'error',
          runId: request.runId,
          timestamp: Date.now(),
          data: { error: `Failed to spawn APSF wrapper: ${err.message}` },
        } as StreamEvent);
      });

      child.on('close', async (code) => {
        this.activeProcesses.delete(processId);

        if (code === 0) {
          // 実行後の実フェーズを取得して complete に含める
          let phase = 'UNKNOWN';
          try {
            phase = await this.getPhase(request.runId);
          } catch { /* phase 取得失敗は complete 自体を妨げない */ }

          this.emit('event', {
            type: 'complete',
            runId: request.runId,
            timestamp: Date.now(),
            data: { mode: 'apsf-run', script, exitCode: code, phase },
          } as StreamEvent);
        } else {
          this.emit('event', {
            type: 'error',
            runId: request.runId,
            timestamp: Date.now(),
            data: { error: `APSF wrapper exited with code ${code}`, script },
          } as StreamEvent);
        }
      });
    } catch (error) {
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

  /** 実行中プロセスをキャンセル */
  cancelExecution(runId: string): void {
    for (const [processId, child] of this.activeProcesses.entries()) {
      if (processId.startsWith(runId)) {
        child.kill();
        this.activeProcesses.delete(processId);
      }
    }
  }
}
