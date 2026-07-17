import { spawn } from 'child_process';
import { EventEmitter } from 'events';
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
            await this.handleProcessLite(child, request, processId);
        }
        catch (error) {
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
    async handleProcessLite(child, request, processId) {
        let errOutput = '';
        child.stdout?.on('data', (data) => {
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
