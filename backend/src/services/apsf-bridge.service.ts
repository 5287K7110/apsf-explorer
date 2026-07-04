import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { ExecuteRequest, StreamEvent } from '../types/index.js';

/**
 * APSFBridgeService: APSF Framework との通信層
 * Provider (Claude/Codex) を抽象化し、切り替え可能にする
 *
 * 思想: AI プロバイダーは代替可能なコンポーネント
 * - 新しい LLM が出ても、ここに Provider を追加するだけ
 * - コアロジックは変わらない
 */
export class APSFBridgeService extends EventEmitter {
  private apsfCliPath: string;
  private pythonPath: string;
  private apiKeys: Record<string, string>;
  private activeProcesses: Map<string, ChildProcess> = new Map();

  constructor() {
    super();
    this.apsfCliPath = process.env.APSF_CLI_PATH || '/path/to/apsf';
    this.pythonPath = process.env.APSF_PYTHON_PATH || 'python';
    this.apiKeys = {
      anthropic: process.env.ANTHROPIC_API_KEY || '',
      openai: process.env.OPENAI_API_KEY || '',
      gemini: process.env.GEMINI_API_KEY || '',
    };
  }

  /**
   * Execute command with specified provider
   * AI プロバイダーを指定して実行
   */
  async execute(request: ExecuteRequest): Promise<void> {
    const processId = `${request.runId}-${Date.now()}`;

    try {
      // Validate provider API key
      this.validateProvider(request.provider);

      // Map provider to APSF provider name
      const providerArg = this.mapProviderToAPSF(request.provider);

      // Build command
      const args = this.buildCommandArgs(request, providerArg);

      // Setup environment
      const env = this.buildEnvironment(request.provider);

      // Spawn process
      const process = spawn(this.pythonPath, args, {
        env,
        cwd: this.apsfCliPath,
      });

      this.activeProcesses.set(processId, process);

      // Setup event handlers
      this.setupProcessHandlers(process, request, processId);

    } catch (error) {
      // NOTE: 'event' として emit する（'error' を emit すると EventEmitter の
      // unhandled-error 仕様で backend プロセス全体がクラッシュする）
      this.emit('event', {
        type: 'error',
        runId: request.runId,
        timestamp: Date.now(),
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
          provider: request.provider,
        },
      } as StreamEvent);
    }
  }

  /**
   * 🔴 Provider を検証（API キー確認）
   */
  private validateProvider(provider: string): void {
    const apiKey = this.apiKeys[provider];

    if (!apiKey) {
      throw new Error(`Missing API key for provider: ${provider}`);
    }

    if (apiKey.length === 0) {
      throw new Error(
        `API key for ${provider} is empty. Set ${provider.toUpperCase()}_API_KEY`
      );
    }
  }

  /**
   * 🔌 Provider 名をマッピング (Frontend → APSF)
   * claude → anthropic
   * codex → openai
   * gemini → gemini
   */
  private mapProviderToAPSF(provider: string): string {
    const mapping: Record<string, string> = {
      claude: 'anthropic',
      codex: 'openai',
      gemini: 'gemini',
    };
    return mapping[provider] || provider;
  }

  /**
   * 🔨 コマンド引数を構築
   */
  private buildCommandArgs(request: ExecuteRequest, providerArg: string): string[] {
    const args = [
      '-m', 'apsf.cli',
      'execute',
      '--provider', providerArg,
      '--command', request.command,
      '--agents', request.roles.join(','),
      '--format', 'json',  // JSON 出力
    ];

    if (request.goal) {
      args.push('--goal', request.goal);
    }

    if (request.context) {
      args.push('--context', JSON.stringify(request.context));
    }

    return args;
  }

  /**
   * 🌍 環境変数を構築
   */
  private buildEnvironment(provider: string): Record<string, string> {
    return {
      ...process.env,
      ANTHROPIC_API_KEY: this.apiKeys.anthropic,
      OPENAI_API_KEY: this.apiKeys.openai,
      GEMINI_API_KEY: this.apiKeys.gemini,
    } as Record<string, string>;
  }

  /**
   * 📡 プロセスイベントハンドラーを設定
   */
  private setupProcessHandlers(
    process: ChildProcess,
    request: ExecuteRequest,
    processId: string
  ): void {
    // stdout: APSF からの JSON 出力
    process.stdout?.on('data', (data) => {
      const output = data.toString();

      try {
        // JSON として解析
        const event = JSON.parse(output);
        this.emit('event', {
          type: 'progress',
          runId: request.runId,
          timestamp: Date.now(),
          data: {
            ...event,
            provider: request.provider,
            agentsUsed: request.roles,
          },
        } as StreamEvent);
      } catch (e) {
        // JSON でない場合はログ
        this.emit('event', {
          type: 'log',
          runId: request.runId,
          timestamp: Date.now(),
          data: { message: output },
        } as StreamEvent);
      }
    });

    // stderr: エラー出力
    process.stderr?.on('data', (data) => {
      this.emit('event', {
        type: 'error',
        runId: request.runId,
        timestamp: Date.now(),
        data: {
          error: data.toString(),
          provider: request.provider,
        },
      } as StreamEvent);
    });

    // error: spawn 失敗（例: python が PATH にない）
    // ハンドラーがないと ChildProcess の 'error' が未処理となり backend が落ちる
    process.on('error', (err) => {
      this.activeProcesses.delete(processId);
      this.emit('event', {
        type: 'error',
        runId: request.runId,
        timestamp: Date.now(),
        data: {
          error: `Failed to spawn APSF process: ${err.message}`,
          provider: request.provider,
        },
      } as StreamEvent);
    });

    // close: プロセス終了
    process.on('close', (code) => {
      this.activeProcesses.delete(processId);

      if (code === 0) {
        this.emit('event', {
          type: 'complete',
          runId: request.runId,
          timestamp: Date.now(),
          data: {
            provider: request.provider,
            agentsUsed: request.roles,
            exitCode: code,
          },
        } as StreamEvent);
      } else {
        this.emit('event', {
          type: 'error',
          runId: request.runId,
          timestamp: Date.now(),
          data: {
            error: `APSF process exited with code ${code}`,
            provider: request.provider,
          },
        } as StreamEvent);
      }
    });
  }

  /**
   * 実行中のプロセスをキャンセル
   */
  cancelExecution(runId: string): void {
    for (const [processId, process] of this.activeProcesses.entries()) {
      if (processId.startsWith(runId)) {
        process.kill();
        this.activeProcesses.delete(processId);
      }
    }
  }

  /**
   * Provider が利用可能か確認
   */
  isProviderAvailable(provider: string): boolean {
    const apiKey = this.apiKeys[provider];
    return apiKey !== undefined && apiKey.length > 0;
  }

  /**
   * 利用可能な Provider リストを取得
   */
  getAvailableProviders(): string[] {
    return Object.keys(this.apiKeys).filter(
      (provider) => this.apiKeys[provider]?.length > 0
    );
  }
}
