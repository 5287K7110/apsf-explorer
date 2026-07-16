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
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PhaseDetector, resolveRunDir } from './phase-detector.js';
import { isHumanPhase, AUTO_OWNED_PHASES, type ApsfPhase } from './phases.js';
import { buildPhasePrompt } from './prompt-builder.js';
import { writePhase, nextPhaseAfterWrite } from './write-phase.js';
import { transition, atomicWrite, setPhaseStatus } from './run-state.js';
import { TranscriptWriter } from './execution-transcript.js';
import { resolveFrameworkRoot } from './content-root.js';
import { type StreamEvent, type RoleProviders } from '../../types/index.js';

export interface NativeExecuteOptions {
  runId: string;
  provider: 'claude' | 'codex';
  /** 役割別プロバイダー（未指定の役割は provider にフォールバック） */
  providers?: RoleProviders;
  maxCycles?: number;
  dryRun?: boolean;
  timeoutMs?: number;
}

interface CmdResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/** フェーズ → 役割キー（providers map の lookup 用） */
function phaseToRoleKey(phase: string): keyof RoleProviders | null {
  switch (phase) {
    case 'PLAN_NEEDED': return 'plan';
    case 'BUILD_NEEDED': return 'build';
    case 'REVIEW_NEEDED': return 'review';
    default: return null;
  }
}

/** 役割別プロバイダーを解決（未指定は fallback） */
function resolveProvider(
  phase: string,
  fallback: 'claude' | 'codex',
  providers?: RoleProviders
): 'claude' | 'codex' {
  if (!providers) return fallback;
  const key = phaseToRoleKey(phase);
  if (!key) return fallback;
  const v = providers[key];
  if (v === 'claude' || v === 'codex') return v;
  return fallback;
}

/** 経過時間の表示（90 秒未満は秒、それ以上は分） */
function fmtDuration(ms: number): string {
  return ms >= 90_000 ? `${Math.round(ms / 60000)}m` : `${Math.round(ms / 1000)}s`;
}

/** 実行タイムアウト（ms）。APSF_EXEC_TIMEOUT_MS で上書き可（既定 15 分） */
export function defaultExecTimeoutMs(): number {
  const raw = Number(process.env.APSF_EXEC_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 15 * 60 * 1000;
}

/** 実行マーカーのファイル名（クラッシュ回復用。正常終了で削除される） */
export const EXECUTOR_MARKER = 'executor_state.json';

export class NativeApsfExecutor extends EventEmitter {
  private cancelled = false;
  /** 実行マーカーを保持中の runId（loop → phase のネストで二重管理しない） */
  private markerHeldFor: string | null = null;
  /** 実行中のトランスクリプト書き込み器（loop → phase のネストで共有） */
  private transcript: TranscriptWriter | null = null;

  constructor(private apsfRoot: string) {
    super();
  }

  cancel(): void {
    this.cancelled = true;
  }

  /**
   * 1 実行 = 1 トランスクリプト（runs/<run>/executions/<ts>.jsonl）。
   * ネスト（executeLoop → executePhase）では外側が所有する。
   * 記録失敗は実行を止めない（TranscriptWriter 側で握る）。
   */
  private async withTranscript<T>(
    runId: string,
    meta: Record<string, unknown>,
    fn: () => Promise<T>
  ): Promise<T> {
    if (this.transcript) return fn(); // 外側（loop）が所有
    const runDir = resolveRunDir(this.apsfRoot, runId);
    if (!runDir) return fn(); // run 不在エラーは fn 側で投げる
    this.transcript = new TranscriptWriter(runDir, { runId, ...meta });
    try {
      const result = await fn();
      this.transcript.append('complete', { result: result as unknown as Record<string, unknown> });
      return result;
    } catch (e) {
      this.transcript.append('error', { error: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally {
      this.transcript = null;
    }
  }

  // ── 実行マーカー（クラッシュ回復） ────────────────────────────
  // backend がクラッシュすると実行レジストリ（メモリ）は消え、run は
  // 「永遠に Executing」に見える。実行中であることを run ディレクトリに
  // 永続化し、起動時の recoverOrphanedRuns が stale マーカーを failed 化する。
  // マーカー書き込みの失敗は実行自体を妨げない（best-effort）。

  private markerPath(runId: string): string | null {
    const runDir = resolveRunDir(this.apsfRoot, runId);
    return runDir ? path.join(runDir, EXECUTOR_MARKER) : null;
  }

  /** マーカーを書く/更新する（best-effort）。保持者になったら true */
  private writeMarker(runId: string, phase: string): boolean {
    const p = this.markerPath(runId);
    if (!p) return false;
    try {
      // ネスト更新（ループ中のフェーズ表示更新）では startedAt を保持する
      // 「実行がいつ始まったか」の意味を壊さないため
      let startedAt = new Date().toISOString();
      if (fs.existsSync(p)) {
        try {
          const prev = JSON.parse(fs.readFileSync(p, 'utf-8'));
          if (prev.startedAt) startedAt = prev.startedAt;
        } catch { /* 壊れた既存マーカーは新規扱い */ }
      }
      atomicWrite(p, JSON.stringify({ runId, pid: process.pid, phase, startedAt }, null, 2));
      return true;
    } catch {
      return false; // マーカー失敗で実行を止めない
    }
  }

  private clearMarker(runId: string): void {
    const p = this.markerPath(runId);
    if (!p) return;
    try {
      fs.rmSync(p, { force: true });
    } catch { /* best-effort */ }
  }

  /** マーカーの書き込み〜削除で fn を包む（ネスト時は外側が所有） */
  private async withMarker<T>(runId: string, phase: string, fn: () => Promise<T>): Promise<T> {
    if (this.markerHeldFor === runId) {
      // 外側（executeLoop）が所有 — フェーズ表示のみ更新
      this.writeMarker(runId, phase);
      return fn();
    }
    const owned = this.writeMarker(runId, phase);
    if (owned) this.markerHeldFor = runId;
    try {
      return await fn();
    } catch (e) {
      // backend 存命中の実行失敗（AI 非ゼロ終了・タイムアウト等）も
      // durable に記録する — WS の error イベントは揮発性で、リロード後に
      // 失敗が見えなくなるため（クラッシュ回復と同じ可視性に揃える）
      try {
        const runDir = resolveRunDir(this.apsfRoot, runId);
        if (runDir) {
          setPhaseStatus(
            runDir,
            'failed',
            `Execution failed: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      } catch { /* best-effort */ }
      throw e;
    } finally {
      if (owned) {
        this.clearMarker(runId);
        this.markerHeldFor = null;
      }
    }
  }

  private progress(runId: string, message: string, extra: Record<string, unknown> = {}): void {
    // ライブ配信（WS）と同時にトランスクリプトへ永続化（best-effort）
    this.transcript?.append('progress', { message, ...extra });
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
    opts: {
      stdin?: string;
      timeoutMs?: number;
      onStdout?: (chunk: string) => void;
      cwd?: string;
    } = {}
  ): Promise<CmdResult> {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      // CLI セッション認証を使う（.env のプレースホルダーキー継承で
      // "Invalid API key" になる事故を防ぐ — ps1 時代と同じ対策）
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;
      delete env.OPENAI_API_KEY;
      delete env.GEMINI_API_KEY;
      env.PYTHONIOENCODING = 'utf-8';

      const child = spawn(command, args, {
        cwd: opts.cwd ?? this.apsfRoot,
        shell: true, // Windows の .cmd/.exe シム対応
        env,
        timeout: opts.timeoutMs ?? defaultExecTimeoutMs(),
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
      child.on('close', (code, signal) =>
        resolve({ code, signal, stdout, stderr, durationMs: Date.now() - startedAt })
      );

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

  /** AI CLI でプロンプトを実行（BUILD はツール有効） */
  private async invokeAI(
    runId: string,
    phase: ApsfPhase,
    prompt: string,
    provider: 'claude' | 'codex',
    timeoutMs: number
  ): Promise<string> {
    const isBuild = phase === 'BUILD_NEEDED';
    const permissionMode = process.env.APSF_PERMISSION_MODE || 'acceptEdits';
    // run_config.json の target_workdir（未指定は APSF_ROOT）
    const cwd = this.resolveTargetWorkdir(runId);

    let command: string;
    let args: string[];

    // テスト用オーバーライド: 実 CLI の代わりに任意コマンドを spawn する
    // （実行中クラッシュ・失敗経路の統合テストで、制御可能な fake provider を使う）
    const override = process.env.APSF_NATIVE_CLI_OVERRIDE;
    if (override) {
      this.progress(runId, `[native] CLI override active: ${override}`, { phase });
      const res = await this.run(override, [], { stdin: prompt, timeoutMs, cwd });
      if (res.code !== 0) {
        throw new Error(`override CLI exited with code ${res.code}: ${(res.stderr || res.stdout).slice(0, 300)}`);
      }
      if (!res.stdout.trim()) throw new Error('override CLI returned empty output');
      return res.stdout;
    }
    // codex の stdout はセッションログ混じりのため、最終メッセージは
    // --output-last-message で temp ファイルに受け取る
    let codexOutFile: string | null = null;
    if (provider === 'codex') {
      command = 'codex';
      codexOutFile = path.join(
        os.tmpdir(),
        `apsf-codex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.md`
      );
      // BUILD はワークスペース書込可、PLAN/REVIEW は読み取りのみ
      // （claude 側の acceptEdits / dontAsk と同じ思想）
      args = [
        'exec', '--skip-git-repo-check',
        '-s', isBuild ? 'workspace-write' : 'read-only',
        '-o', `"${codexOutFile}"`,
        '-',
      ];
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

    this.progress(
      runId,
      `[native] invoking ${command} (phase=${phase}, tools=${isBuild ? 'on' : 'off'}, workdir=${cwd})`,
      { phase }
    );

    try {
      const res = await this.run(command, args, {
        stdin: prompt,
        timeoutMs,
        cwd,
        onStdout: (chunk) => this.progress(runId, chunk, { phase, stream: 'ai' }),
      });
      if (res.code !== 0) {
        // 部分出力のサルベージ — タイムアウト等で数分ぶんの生成物を破棄しない
        const partial = (
          codexOutFile && fs.existsSync(codexOutFile)
            ? fs.readFileSync(codexOutFile, 'utf-8')
            : res.stdout
        ).trim();
        if (partial) {
          const salvaged = this.salvagePartialOutput(runId, phase, partial);
          if (salvaged) {
            this.progress(runId, `[native] partial output salvaged to ${salvaged}`, { phase });
          }
        }
        const detail = (res.stderr || res.stdout).slice(0, 300);
        const timedOut = res.code === null && res.durationMs >= timeoutMs - 1000;
        if (timedOut) {
          throw new Error(
            `${command} timed out after ${fmtDuration(res.durationMs)} ` +
              `(limit ${fmtDuration(timeoutMs)} — raise with APSF_EXEC_TIMEOUT_MS): ${detail}`
          );
        }
        if (res.code === null) {
          throw new Error(
            `${command} was killed after ${fmtDuration(res.durationMs)}` +
              `${res.signal ? ` (signal ${res.signal})` : ''}: ${detail}`
          );
        }
        throw new Error(`${command} exited with code ${res.code}: ${detail}`);
      }
      const output = codexOutFile && fs.existsSync(codexOutFile)
        ? fs.readFileSync(codexOutFile, 'utf-8')
        : res.stdout;
      if (!output.trim()) {
        throw new Error(`${command} returned empty output`);
      }
      return output;
    } finally {
      if (codexOutFile) fs.rmSync(codexOutFile, { force: true });
    }
  }

  /**
   * run の対象プロジェクトディレクトリを解決する。
   * run_config.json の target_workdir が存在すればそれを AI の cwd に使い、
   * なければ従来どおり APSF_ROOT（workdir 誤爆防止 — 別 repo を書き換えない）。
   */
  private resolveTargetWorkdir(runId: string): string {
    const runDir = resolveRunDir(this.apsfRoot, runId);
    if (runDir) {
      const p = path.join(runDir, 'run_config.json');
      try {
        if (fs.existsSync(p)) {
          const cfg = JSON.parse(fs.readFileSync(p, 'utf-8')) as { target_workdir?: string };
          if (cfg.target_workdir && fs.existsSync(cfg.target_workdir)) {
            return cfg.target_workdir;
          }
        }
      } catch {
        // 壊れた run_config.json は無視して APSF_ROOT にフォールバック
      }
    }
    return this.apsfRoot;
  }

  /** 失敗した実行の部分出力を runDir に保存する（レビュー・再利用のため） */
  private salvagePartialOutput(runId: string, phase: string, content: string): string | null {
    const runDir = resolveRunDir(this.apsfRoot, runId);
    if (!runDir) return null;
    const name = `salvage-${phase}-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
    try {
      fs.writeFileSync(path.join(runDir, name), content, 'utf-8');
      return name;
    } catch {
      return null;
    }
  }

  /** 正規永続化（TS ネイティブ write-phase — 上書き保護・遷移・advisory 込み） */
  private savePhaseOutput(
    runId: string,
    content: string,
    force?: { forceReason: string }
  ): void {
    const runDir = resolveRunDir(this.apsfRoot, runId);
    if (!runDir) throw new Error(`Run not found: ${runId}`);
    writePhase(runDir, content, force ? { force: true, forceReason: force.forceReason } : {});
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
    return this.withTranscript(
      opts.runId,
      { command: 'phase', provider: opts.provider, ...(opts.providers ? { providers: opts.providers } : {}), dryRun: Boolean(opts.dryRun) },
      () => this.executePhaseCore(opts)
    );
  }

  private async executePhaseCore(opts: NativeExecuteOptions): Promise<string> {
    const { runId, provider, providers, dryRun, timeoutMs = defaultExecTimeoutMs() } = opts;
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

    // 役割別プロバイダー解決
    const effectiveProvider = resolveProvider(info.phase, provider, providers);

    const providerNote = effectiveProvider !== provider
      ? ` (role override: ${effectiveProvider})`
      : '';
    this.progress(runId, `[native] phase=${info.phase} provider=${effectiveProvider}${providerNote} → assembling prompt`, {
      phase: info.phase,
      provider: effectiveProvider,
    });
    const prompt = this.getPrompt(runId);

    if (dryRun) {
      this.progress(runId, `[native] DryRun — prompt assembled (${prompt.length} chars). Not executing AI.`, {
        phase: info.phase,
        promptPreview: prompt.slice(0, 500),
      });
      return info.phase;
    }

    // AI 実行〜保存は実行マーカーで包む（クラッシュ時に回復可能にする）
    return this.withMarker(runId, info.phase, async () => {

    // rerun 検出（Judge の Return to Build/Plan 後は対象ファイルが前サイクルの
    // 内容で埋まっている）: 実行前の mtime を記録し、AI がツールで直接更新した
    // のか・前回の残存内容なのかを区別する
    const runDir = resolveRunDir(this.apsfRoot, runId)!;
    const targetPath = path.join(runDir, info.fileToWrite);
    const mtimeBefore = fs.existsSync(targetPath) ? fs.statSync(targetPath).mtimeMs : null;
    const hadContentBefore = new PhaseDetector(runDir).hasAnyContent(info.fileToWrite);

    const output = await this.invokeAI(runId, info.phase, prompt, effectiveProvider, timeoutMs);

    // ツール有効の BUILD では、AI が対象ファイル（build.md）を直接書き込む
    // ことがある（codex workspace-write / ps1 時代の claude build と同じ流儀）。
    // その場合 stdout を二重保存せず、canonical state の前進のみ行う。
    // 実行中に mtime が変わったファイルのみ「AI が直接書いた」と判定する
    // （rerun で残存する前回内容を誤って「AI が書いた」と見なさないため）
    const mtimeAfter = fs.existsSync(targetPath) ? fs.statSync(targetPath).mtimeMs : null;
    const writtenByTools = mtimeAfter !== null && mtimeAfter !== mtimeBefore;
    if (writtenByTools && new PhaseDetector(runDir).isFilledPublic(info.fileToWrite)) {
      this.progress(
        runId,
        `[native] ${info.fileToWrite} already written by AI tools — syncing state only`,
        { phase: info.phase }
      );
      const next = nextPhaseAfterWrite(runDir, info.phase);
      const result = transition(runDir, {
        toPhase: next,
        actor: 'system',
        reason: 'builder wrote target file directly via tools',
      });
      if (!result.success) throw new Error(result.error ?? 'state sync failed');
    } else {
      this.progress(runId, `[native] saving ${info.fileToWrite} (native write-phase)`, {
        phase: info.phase,
      });
      // rerun（Judge 差し戻し後の再実行）では対象ファイルに前回内容が残るため、
      // 上書き保護を監査記録付きで迂回する
      this.savePhaseOutput(
        runId,
        output,
        hadContentBefore
          ? { forceReason: `rerun of ${info.phase}: overwrite previous ${info.fileToWrite}` }
          : undefined
      );
    }

    return this.detectPhase(runId).phase;
    });
  }

  /**
   * auto-loop: human フェーズに到達するまで PLAN/BUILD/REVIEW を反復
   * （apsf-auto-loop.ps1 の TS ネイティブ置き換え）
   */
  async executeLoop(opts: NativeExecuteOptions): Promise<{ phase: string; cycles: number; stopReason: string }> {
    return this.withTranscript(
      opts.runId,
      { command: 'full-cycle', provider: opts.provider, ...(opts.providers ? { providers: opts.providers } : {}), dryRun: Boolean(opts.dryRun) },
      () => {
        if (opts.dryRun) return this.loopCore(opts);
        // ループ全体を 1 つの実行マーカーで包む（サイクル間のクラッシュも回復対象）
        const initial = this.detectPhase(opts.runId);
        return this.withMarker(opts.runId, initial.phase, () => this.loopCore(opts));
      }
    );
  }

  private async loopCore(opts: NativeExecuteOptions): Promise<{ phase: string; cycles: number; stopReason: string }> {
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
