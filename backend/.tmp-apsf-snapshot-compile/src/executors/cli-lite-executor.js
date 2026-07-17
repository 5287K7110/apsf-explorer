import { spawn } from 'child_process';
import { EventEmitter } from 'events';
/**
 * CLI Lite Executor
 * - Artifact を保存しない（軽量）
 * - 結果は一時的（WebSocket で配信するだけ）
 * - 低コスト・制限付き権限（dontAsk: 許可外ツールは自動拒否）
 *
 * NOTE:
 * - prompt は argv ではなく stdin で渡す（shell 経由 spawn でのインジェクション防止）
 * - テストでは env APSF_CLI_OVERRIDE で CLI コマンドを差し替え可能
 */
export class CLILiteExecutor extends EventEmitter {
    constructor(config) {
        super();
        this.activeProcesses = new Map();
        this.config = config;
    }
    async execute(request) {
        const processId = `${request.runId}-${Date.now()}`;
        try {
            const cliCommand = this.selectCli(request.provider);
            const prompt = await this.buildPrompt(request);
            // 実 claude CLI (2.x) で有効なフラグのみを使用
            // 読み取り系ツールのみ許可 + dontAsk（許可外は自動拒否）で「制限モード」を実現
            // （旧実装の --permission-mode restrictive は存在しない値だった）
            const args = [
                '-p',
                '--output-format', 'text',
                '--no-session-persistence',
                '--disable-slash-commands',
                '--allowedTools', 'Read,Grep,Glob',
                '--permission-mode', 'dontAsk',
            ];
            console.log(`[CLI-LITE] Spawning ${cliCommand} (no artifact save, restricted tools)`);
            const child = spawn(cliCommand, args, {
                shell: true,
                timeout: this.config.timeout,
            });
            child.stdin?.write(prompt);
            child.stdin?.end();
            this.activeProcesses.set(processId, child);
            // 🔹 Artifact を保存しない
            await this.handleProcessLite(child, request, processId);
        }
        catch (error) {
            // 'event' として emit（'error' emit は未処理時にプロセスをクラッシュさせる）
            this.emit('event', {
                type: 'error',
                runId: request.runId,
                timestamp: Date.now(),
                data: {
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
            });
        }
    }
    /**
     * 🔹 軽量処理（保存なし）
     */
    async handleProcessLite(child, request, processId) {
        let errOutput = '';
        child.stdout?.on('data', (data) => {
            // WebSocket で配信するだけ（保存しない）
            this.emit('event', {
                type: 'progress',
                runId: request.runId,
                timestamp: Date.now(),
                data: { message: data.toString(), mode: 'cli-lite' },
            });
        });
        child.stderr?.on('data', (data) => {
            errOutput += data.toString();
        });
        return new Promise((resolve, reject) => {
            child.on('close', (code) => {
                this.activeProcesses.delete(processId);
                if (code === 0) {
                    // ✅ 結果は破棄（一時的のみ）
                    this.emit('event', {
                        type: 'complete',
                        runId: request.runId,
                        timestamp: Date.now(),
                        data: {
                            mode: 'cli-lite',
                            exitCode: code,
                            message: 'Execution completed (no artifacts saved)',
                        },
                    });
                    resolve();
                }
                else {
                    reject(new Error(`CLI exited with code ${code}${errOutput ? `: ${errOutput.slice(0, 300)}` : ''}`));
                }
            });
            child.on('error', reject);
        });
    }
    selectCli(provider) {
        // テスト/カスタム環境用オーバーライド（例: "python /path/fake_cli.py"）
        if (process.env.APSF_CLI_OVERRIDE) {
            return process.env.APSF_CLI_OVERRIDE;
        }
        const clis = {
            claude: 'claude',
            codex: 'codex',
            gemini: 'gemini',
        };
        return clis[provider] || 'claude';
    }
    async buildPrompt(request) {
        return `Quick analysis: ${request.goal || 'No goal specified'}`;
    }
}
