import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { ExecuteRequest, StreamEvent } from '../types/index.js';
import { ExecutionModeConfig } from '../types/execution-mode.js';

/**
 * CLI Lite Executor
 * - Artifact を保存しない（軽量）
 * - 結果は一時的（WebSocket で配信するだけ）
 * - 低コスト運用
 */
export class CLILiteExecutor extends EventEmitter {
  private config: ExecutionModeConfig;
  private activeProcesses: Map<string, NodeJS.Process> = new Map();

  constructor(config: ExecutionModeConfig) {
    super();
    this.config = config;
  }

  async execute(request: ExecuteRequest): Promise<void> {
    const processId = `${request.runId}-${Date.now()}`;

    try {
      const cliCommand = this.selectCli(request.provider);
      const prompt = await this.buildPrompt(request);

      const args = [
        '-p',
        '--tools',
        'Bash,Edit,Glob,Grep,Read,Write',
        '--permission-mode',
        'restrictive', // ← 制限モード
        '--output-format',
        'text',
        '--no-session-persistence',
        '--max-turns',
        String(this.config.maxTurns),
        '--disable-slash-commands',
        prompt,
      ];

      console.log(
        `[CLI-LITE] Spawning ${cliCommand} (No artifact save, low cost)`
      );

      const process = spawn(cliCommand, args, {
        timeout: this.config.timeout,
      });

      this.activeProcesses.set(processId, process);

      // 🔹 Artifact を保存しない
      await this.handleProcessLite(process, request, processId);
    } catch (error) {
      this.emit('error', {
        type: 'error',
        runId: request.runId,
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      } as StreamEvent);
    }
  }

  /**
   * 🔹 軽量処理（保存なし）
   */
  private async handleProcessLite(
    process: NodeJS.Process,
    request: ExecuteRequest,
    processId: string
  ): Promise<void> {
    process.stdout?.on('data', (data) => {
      // WebSocket で配信するだけ（保存しない）
      this.emit('event', {
        type: 'progress',
        runId: request.runId,
        timestamp: Date.now(),
        data: { message: data.toString() },
      } as StreamEvent);
    });

    return new Promise((resolve, reject) => {
      process.on('close', (code) => {
        this.activeProcesses.delete(processId);

        if (code === 0) {
          // ✅ 結果は破棄（一時的のみ）
          this.emit('event', {
            type: 'complete',
            runId: request.runId,
            timestamp: Date.now(),
            data: {
              mode: 'cli-lite',
              message: 'Execution completed (no artifacts saved)',
            },
          } as StreamEvent);

          resolve();
        } else {
          reject(new Error(`CLI exited with code ${code}`));
        }
      });

      process.on('error', reject);
    });
  }

  private selectCli(provider: string): string {
    const clis: Record<string, string> = {
      claude: 'claude',
      codex: 'codex',
      gemini: 'gemini',
    };

    return clis[provider] || 'claude';
  }

  private async buildPrompt(request: ExecuteRequest): Promise<string> {
    return `Quick analysis: ${request.goal || 'No goal specified'}`;
  }
}
