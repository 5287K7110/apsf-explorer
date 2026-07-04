import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { ExecuteRequest, StreamEvent } from '../types/index.js';
import { ExecutionModeConfig } from '../types/execution-mode.js';

/**
 * CLI Full Executor
 * - Artifact を保存
 * - Tool output を記録
 * - 完全なログを保持
 */
export class CLIFullExecutor extends EventEmitter {
  private config: ExecutionModeConfig;
  private runsDir: string;
  private activeProcesses: Map<string, NodeJS.Process> = new Map();

  constructor(config: ExecutionModeConfig) {
    super();
    this.config = config;
    this.runsDir = process.env.RUNS_DIR || './runs';
  }

  async execute(request: ExecuteRequest): Promise<void> {
    const processId = `${request.runId}-${Date.now()}`;

    try {
      const cliCommand = this.selectCli(request.provider);
      const prompt = await this.buildPrompt(request);

      const args = [
        '-p',
        '--tools',
        'Bash,Edit,Glob,Grep,Read,Write,mcp__filesystem__*',
        '--permission-mode',
        'bypassPermissions',
        '--output-format',
        'text',
        '--no-session-persistence',
        '--max-turns',
        String(this.config.maxTurns),
        '--disable-slash-commands',
        prompt,
      ];

      console.log(
        `[CLI-FULL] Spawning ${cliCommand} (Artifact will be saved)`
      );

      const process = spawn(cliCommand, args, {
        timeout: this.config.timeout,
      });

      this.activeProcesses.set(processId, process);

      // 🔹 Artifact を保存
      await this.handleProcessWithArtifactSave(process, request, processId);
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
   * 🔹 Artifact を保存
   */
  private async handleProcessWithArtifactSave(
    process: NodeJS.Process,
    request: ExecuteRequest,
    processId: string
  ): Promise<void> {
    let output = '';
    const artifacts: any[] = [];

    process.stdout?.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;

      // Artifact を検出（Claude CLI のネイティブ形式）
      const artifactMatch = chunk.match(/\[ARTIFACT:([^\]]+)\]/);
      if (artifactMatch) {
        artifacts.push({
          id: artifactMatch[1],
          timestamp: Date.now(),
          content: chunk,
        });
      }

      // WebSocket で配信
      this.emit('event', {
        type: 'progress',
        runId: request.runId,
        timestamp: Date.now(),
        data: { message: chunk },
      } as StreamEvent);
    });

    return new Promise((resolve, reject) => {
      process.on('close', (code) => {
        this.activeProcesses.delete(processId);

        if (code === 0) {
          // ✅ Artifact を build.md に保存
          this.saveArtifacts(request.runId, artifacts, output);

          this.emit('event', {
            type: 'complete',
            runId: request.runId,
            timestamp: Date.now(),
            data: {
              artifactCount: artifacts.length,
              message: 'Execution completed with artifacts saved',
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

  /**
   * 🔹 Artifact を build.md に保存
   */
  private saveArtifacts(
    runId: string,
    artifacts: any[],
    output: string
  ): void {
    const runDir = path.join(this.runsDir, runId);
    const buildPath = path.join(runDir, 'build.md');

    // ディレクトリが存在しなければ作成
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

  private selectCli(provider: string): string {
    const clis: Record<string, string> = {
      claude: 'claude',
      codex: 'codex',
      gemini: 'gemini',
    };

    return clis[provider] || 'claude';
  }

  private async buildPrompt(request: ExecuteRequest): Promise<string> {
    // plan.md を読んで prompt を組み立て
    return `Execute command: ${request.command}\nProvider: ${request.provider}\nRoles: ${request.roles.join(
      ', '
    )}\nGoal: ${request.goal || 'No goal specified'}`;
  }
}
