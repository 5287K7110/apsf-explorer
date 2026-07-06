/**
 * APSF Native Executor — 完全 TypeScript ネイティブ実行
 *
 * 依存ゼロ構成（python / apsf CLI / PowerShell いずれも不要）:
 *   1. プロンプト組み立て : prompt-builder.ts（renderer.py と parity 検証済み 6/6）
 *   2. AI 実行           : claude/codex を直接 spawn（BUILD はツール有効）
 *   3. 保存              : write-phase.ts（上書き保護・run_state 遷移・
 *                          judge advisory — python 版と parity 検証済み 12/12）
 *   4. ループ            : TS ネイティブ（HUMAN_OWNED_PHASES 停止・max cycles）
 *
 * runs/ ディレクトリへの書き込みは Explorer に一本化されている前提
 * （python 版 apsf CLI との並用は run 状態の drift を招くため非推奨）。
 */
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { PhaseDetector, resolveRunDir } from './phase-detector.js';
import { isHumanPhase, AUTO_OWNED_PHASES, ApsfPhase } from './phases.js';
import { buildPhasePrompt } from './prompt-builder.js';
import { writePhase } from './write-phase.js';
import { resolveFrameworkRoot } from './content-root.js';
import { StreamEvent } from '../../types/index.js';

export interface NativeExecuteOptions {
  runId: string;
  provider: 'claude' | 'codex';
  maxCycles?: number;
  dryRun?: boolean;
  timeoutMs?: number;
}

interface CmdResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export class NativeApsfExecutor extends EventEmitter {
  private cancelled = false;

  constructor(private apsfRoot: string) {
    super();
  }

  cancel(): void {
    this.cancelled = true;
  }

  private progress(runId: string, message: string, extra: Record<string, unknown> = {}): void {
    this.emit('event', {
      type: 'progress',
      runId,
      timestamp: Date.now(),
      data: { message, mode: 'apsf-native', ...extra },
    } as StreamEvent);
  }

  /** 子プロセス実行（stdin 供給・API キー env 除去・stdout/stderr 収集） */
  private run(
    command: string,
    args: string[],
    opts: { stdin?: string; timeoutMs?: number; onStdout?: (chunk: string) => void } = {}
  ): Promise<CmdResult> {
    return new Promise((resolve, reject) => {
      // CLI セッション認証を使う（.env のプレースホルダーキー継承で
      // "Invalid API key" になる事故を防ぐ — ps1 時代と同じ対策）
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;
      delete env.OPENAI_API_KEY;
      delete env.GEMINI_API_KEY;
      env.PYTHONIOENCODING = 'utf-8';

      const child = spawn(command, args, {
        cwd: this.apsfRoot,
        shell: true, // Windows の .cmd/.exe シム対応
        env,
        timeout: opts.timeoutMs ?? 15 * 60 * 1000,
      });

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d) => {
        const chunk = d.toString();
        stdout += chunk;
        opts.onStdout?.(chunk);
      });
      child.stderr?.on('data', (d) => (stderr += d.toString()));
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, stdout, stderr }));

      if (opts.stdin !== undefined) {
        child.stdin?.write(opts.stdin);
      }
      child.stdin?.end();
    });
  }

  /** フェーズプロンプトの組み立て（TS ネイティブ・renderer parity 検証済み） */
  private getPrompt(runId: string): string {
    const runDir = resolveRunDir(this.apsfRoot, runId);
    if (!runDir) throw new Error(`Run not found: ${runId}`);
    return buildPhasePrompt(runDir, resolveFrameworkRoot(this.apsfRoot)).prompt;
  }

  /** claude -p でプロンプトを実行（BUILD はツール有効） */
  private async invokeAI(
    runId: string,
    phase: ApsfPhase,
    prompt: string,
    provider: 'claude' | 'codex',
    timeoutMs: number
  ): Promise<string> {
    const isBuild = phase === 'BUILD_NEEDED';
    const permissionMode = process.env.APSF_PERMISSION_MODE || 'acceptEdits';

    let command: string;
    let args: string[];
    if (provider === 'codex') {
      command = 'codex';
      args = ['exec', '--skip-git-repo-check', '-'];
    } else {
      command = 'claude';
      args = [
        '-p',
        '--output-format', 'text',
        '--no-session-persistence',
        '--disable-slash-commands',
        ...(isBuild
          ? ['--allowedTools', 'Bash,Edit,Glob,Grep,Read,Write', '--permission-mode', permissionMode]
          : ['--permission-mode', 'dontAsk']),
      ];
    }

    this.progress(runId, `[native] invoking ${command} (phase=${phase}, tools=${isBuild ? 'on' : 'off'})`, { phase });

    const res = await this.run(command, args, {
      stdin: prompt,
      timeoutMs,
      onStdout: (chunk) => this.progress(runId, chunk, { phase, stream: 'ai' }),
    });
    if (res.code !== 0) {
      throw new Error(
        `${command} exited with code ${res.code}: ${(res.stderr || res.stdout).slice(0, 300)}`
      );
    }
    if (!res.stdout.trim()) {
      throw new Error(`${command} returned empty output`);
    }
    return res.stdout;
  }

  /** 正規永続化（TS ネイティブ write-phase — 上書き保護・遷移・advisory 込み） */
  private savePhaseOutput(runId: string, content: string): void {
    const runDir = resolveRunDir(this.apsfRoot, runId);
    if (!runDir) throw new Error(`Run not found: ${runId}`);
    writePhase(runDir, content);
  }

  /** 現在フェーズ（TS ネイティブ検出・parity 検証済み） */
  private detectPhase(runId: string) {
    const runDir = resolveRunDir(this.apsfRoot, runId);
    if (!runDir) throw new Error(`Run not found: ${runId}`);
    return new PhaseDetector(runDir).detect();
  }

  /**
   * 1 フェーズを実行（PLAN / BUILD / REVIEW のみ。human フェーズなら何もしない）
   * @returns 実行後のフェーズ
   */
  async executePhase(opts: NativeExecuteOptions): Promise<string> {
    const { runId, provider, dryRun, timeoutMs = 15 * 60 * 1000 } = opts;
    const info = this.detectPhase(runId);

    if (isHumanPhase(info.phase)) {
      this.progress(runId, `[native] phase=${info.phase} is human-owned; nothing to execute`, {
        phase: info.phase,
      });
      return info.phase;
    }
    if (!AUTO_OWNED_PHASES.has(info.phase)) {
      throw new Error(`Phase ${info.phase} is not auto-executable`);
    }

    this.progress(runId, `[native] phase=${info.phase} → assembling prompt (native builder)`, {
      phase: info.phase,
    });
    const prompt = this.getPrompt(runId);

    if (dryRun) {
      this.progress(runId, `[native] DryRun — prompt assembled (${prompt.length} chars). Not executing AI.`, {
        phase: info.phase,
        promptPreview: prompt.slice(0, 500),
      });
      return info.phase;
    }

    const output = await this.invokeAI(runId, info.phase, prompt, provider, timeoutMs);

    this.progress(runId, `[native] saving ${info.fileToWrite} (native write-phase)`, {
      phase: info.phase,
    });
    this.savePhaseOutput(runId, output);

    return this.detectPhase(runId).phase;
  }

  /**
   * auto-loop: human フェーズに到達するまで PLAN/BUILD/REVIEW を反復
   * （apsf-auto-loop.ps1 の TS ネイティブ置き換え）
   */
  async executeLoop(opts: NativeExecuteOptions): Promise<{ phase: string; cycles: number; stopReason: string }> {
    const maxCycles = opts.maxCycles ?? 10;
    this.cancelled = false;
    let cycles = 0;

    for (;;) {
      const info = this.detectPhase(opts.runId);

      if (isHumanPhase(info.phase)) {
        return { phase: info.phase, cycles, stopReason: 'human_phase' };
      }
      if (this.cancelled) {
        return { phase: info.phase, cycles, stopReason: 'cancelled' };
      }
      if (cycles >= maxCycles) {
        return { phase: info.phase, cycles, stopReason: 'max_cycles' };
      }

      cycles++;
      this.progress(opts.runId, `[native] cycle=${cycles}/${maxCycles} phase=${info.phase}`, {
        phase: info.phase,
        cycle: cycles,
      });

      const before = info.phase;
      const after = await this.executePhase(opts);

      if (opts.dryRun) {
        return { phase: after, cycles, stopReason: 'dry_run' };
      }
      if (after === before) {
        // 保存されたのにフェーズが進まない = 出力が不十分（無限ループ防止）
        return { phase: after, cycles, stopReason: 'phase_not_advanced' };
      }
    }
  }
}
