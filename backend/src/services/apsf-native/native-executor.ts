/**
 * APSF Native Executor — ps1 ラッパーの TypeScript 置き換え
 *
 * 旧構成（Windows 専用）:
 *   apsf-claude-act.ps1 / apsf-claude-build.ps1 / apsf-auto-loop.ps1
 *   （PowerShell がプロンプト組み立て → claude 実行 → 保存）
 *
 * 新構成（クロスプラットフォーム）:
 *   1. プロンプト取得 : `apsf act <run> --print-prompt`
 *      （specialist 選択・テンプレート合成を含む framework の正規組み立て）
 *   2. AI 実行        : claude -p を直接 spawn（BUILD はツール有効）
 *   3. 保存           : `apsf write-phase <run> --stdin`
 *      （上書き保護・run_state 遷移・イベントログを含む framework の正規永続化）
 *   4. ループ         : TS ネイティブ（PhaseDetector + HUMAN_OWNED_PHASES 停止）
 *
 * 再構築境界の設計判断:
 *   1 と 3 は run 状態を正しく変異させる framework の中核契約であり、
 *   TS で再実装すると drift・状態破壊リスクがあるため `apsf` CLI
 *   （pip 導入・クロスプラットフォーム）を薄く呼ぶ。PowerShell 依存はゼロ。
 */
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { PhaseDetector, resolveRunDir } from './phase-detector.js';
import { isHumanPhase, AUTO_OWNED_PHASES, ApsfPhase } from './phases.js';
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

  constructor(
    private apsfRoot: string,
    private apsfBin: string = process.env.APSF_BIN || 'apsf'
  ) {
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

  /** `apsf act <run> --print-prompt` でフェーズプロンプトを取得 */
  private async getPrompt(runId: string): Promise<string> {
    const res = await this.run(this.apsfBin, ['act', runId, '--print-prompt'], {
      timeoutMs: 60000,
    });
    if (res.code !== 0 || !res.stdout.trim()) {
      throw new Error(
        `apsf act --print-prompt failed (exit=${res.code}): ${res.stderr.slice(0, 300)}`
      );
    }
    return res.stdout;
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

  /** `apsf write-phase <run> --stdin` で正規永続化 */
  private async savePhaseOutput(runId: string, content: string): Promise<void> {
    const res = await this.run(this.apsfBin, ['write-phase', runId, '--stdin'], {
      stdin: content,
      timeoutMs: 60000,
    });
    if (res.code !== 0) {
      throw new Error(
        `apsf write-phase failed (exit=${res.code}): ${(res.stderr || res.stdout).slice(0, 300)}`
      );
    }
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

    this.progress(runId, `[native] phase=${info.phase} → assembling prompt (apsf act --print-prompt)`, {
      phase: info.phase,
    });
    const prompt = await this.getPrompt(runId);

    if (dryRun) {
      this.progress(runId, `[native] DryRun — prompt assembled (${prompt.length} chars). Not executing AI.`, {
        phase: info.phase,
        promptPreview: prompt.slice(0, 500),
      });
      return info.phase;
    }

    const output = await this.invokeAI(runId, info.phase, prompt, provider, timeoutMs);

    this.progress(runId, `[native] saving ${info.fileToWrite} (apsf write-phase --stdin)`, {
      phase: info.phase,
    });
    await this.savePhaseOutput(runId, output);

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
