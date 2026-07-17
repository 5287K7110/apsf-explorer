import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
export class CLIFullExecutor extends EventEmitter {
    constructor(config) {
        super();
        this.activeProcesses = new Map();
        this.config = config;
        this.runsDir = process.env.RUNS_DIR || './runs';
    }
    async execute(request) {
        const processId = `${request.runId}-${Date.now()}`;
        try {
            const cliCommand = this.selectCli(request.provider);
            const prompt = await this.buildPrompt(request);
            const permissionMode = process.env.APSF_PERMISSION_MODE || 'acceptEdits';
            const args = [
                '-p',
                '--output-format', 'text',
                '--no-session-persistence',
                '--disable-slash-commands',
                '--allowedTools', 'Bash,Edit,Glob,Grep,Read,Write',
                '--permission-mode', permissionMode,
            ];
            console.log(`[CLI-FULL] Spawning ${cliCommand} (permission: ${permissionMode}, artifacts: on)`);
            const child = spawn(cliCommand, args, {
                shell: true,
                timeout: this.config.timeout,
            });
            child.stdin?.write(prompt);
            child.stdin?.end();
            this.activeProcesses.set(processId, child);
            await this.handleProcessWithArtifactSave(child, request, processId);
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
    async handleProcessWithArtifactSave(child, request, processId) {
        let output = '';
        let errOutput = '';
        const artifacts = [];
        child.stdout?.on('data', (data) => {
            const chunk = data.toString();
            output += chunk;
            const artifactMatch = chunk.match(/\[ARTIFACT:([^\]]+)\]/);
            if (artifactMatch) {
                artifacts.push({
                    id: artifactMatch[1],
                    timestamp: Date.now(),
                    content: chunk,
                });
            }
            this.emit('event', {
                type: 'progress',
                runId: request.runId,
                timestamp: Date.now(),
                data: { message: chunk, mode: 'cli-full' },
            });
        });
        child.stderr?.on('data', (data) => {
            errOutput += data.toString();
        });
        return new Promise((resolve, reject) => {
            child.on('close', (code) => {
                this.activeProcesses.delete(processId);
                if (code === 0) {
                    this.saveArtifacts(request.runId, artifacts, output);
                    this.emit('event', {
                        type: 'complete',
                        runId: request.runId,
                        timestamp: Date.now(),
                        data: {
                            mode: 'cli-full',
                            artifactCount: artifacts.length,
                            exitCode: code,
                            message: 'Execution completed with artifacts saved',
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
    saveArtifacts(runId, artifacts, output) {
        const runDir = path.join(this.runsDir, runId);
        const buildPath = path.join(runDir, 'build.md');
        if (!fs.existsSync(runDir)) {
            fs.mkdirSync(runDir, { recursive: true });
        }
        let content = '# Build Output\n\n';
        content += `Generated at: ${new Date().toISOString()}\n\n`;
        content += `## Artifacts (${artifacts.length})\n\n`;
        artifacts.forEach((artifact, i) => {
            content += `### Artifact ${i + 1}\n`;
            content += `ID: ${artifact.id}\n`;
            content += `Time: ${new Date(artifact.timestamp).toISOString()}\n\n`;
        });
        content += '## Full Output\n\n';
        content += output;
        fs.writeFileSync(buildPath, content, 'utf-8');
        console.log(`✅ Artifacts saved to ${buildPath}`);
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
        return `Execute command: ${request.command}\nProvider: ${request.provider}\nRoles: ${request.roles.join(', ')}\nGoal: ${request.goal || 'No goal specified'}`;
    }
}
