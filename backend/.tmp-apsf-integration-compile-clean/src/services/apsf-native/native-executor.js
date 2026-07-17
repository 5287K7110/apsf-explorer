import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PhaseDetector, resolveRunDir } from './phase-detector.js';
import { isHumanPhase, AUTO_OWNED_PHASES } from './phases.js';
import { buildPhasePrompt } from './prompt-builder.js';
import { writePhase, nextPhaseAfterWrite } from './write-phase.js';
import { transition, atomicWrite, setPhaseStatus } from './run-state.js';
import { TranscriptWriter } from './execution-transcript.js';
import { resolveFrameworkRoot } from './content-root.js';
import { workdirGitStatus, workdirGitDiff, dirtySummary } from './workdir-git.js';
function phaseToRoleKey(phase) {
    switch (phase) {
        case 'PLAN_NEEDED': return 'plan';
        case 'BUILD_NEEDED': return 'build';
        case 'REVIEW_NEEDED': return 'review';
        default: return null;
    }
}
function resolveProvider(phase, fallback, providers) {
    if (!providers)
        return fallback;
    const key = phaseToRoleKey(phase);
    if (!key)
        return fallback;
    const v = providers[key];
    if (v === 'claude' || v === 'codex')
        return v;
    return fallback;
}
function fmtDuration(ms) {
    return ms >= 90000 ? `${Math.round(ms / 60000)}m` : `${Math.round(ms / 1000)}s`;
}
export function defaultExecTimeoutMs() {
    const raw = Number(process.env.APSF_EXEC_TIMEOUT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : 15 * 60 * 1000;
}
export const EXECUTOR_MARKER = 'executor_state.json';
export class NativeApsfExecutor extends EventEmitter {
    constructor(apsfRoot) {
        super();
        this.apsfRoot = apsfRoot;
        this.cancelled = false;
        this.markerHeldFor = null;
        this.transcript = null;
    }
    cancel() {
        this.cancelled = true;
    }
    async withTranscript(runId, meta, fn) {
        if (this.transcript)
            return fn();
        const runDir = resolveRunDir(this.apsfRoot, runId);
        if (!runDir)
            return fn();
        this.transcript = new TranscriptWriter(runDir, { runId, ...meta });
        try {
            const result = await fn();
            this.transcript.append('complete', { result: result });
            return result;
        }
        catch (e) {
            this.transcript.append('error', { error: e instanceof Error ? e.message : String(e) });
            throw e;
        }
        finally {
            this.transcript = null;
        }
    }
    markerPath(runId) {
        const runDir = resolveRunDir(this.apsfRoot, runId);
        return runDir ? path.join(runDir, EXECUTOR_MARKER) : null;
    }
    writeMarker(runId, phase) {
        const p = this.markerPath(runId);
        if (!p)
            return false;
        try {
            let startedAt = new Date().toISOString();
            if (fs.existsSync(p)) {
                try {
                    const prev = JSON.parse(fs.readFileSync(p, 'utf-8'));
                    if (prev.startedAt)
                        startedAt = prev.startedAt;
                }
                catch { }
            }
            atomicWrite(p, JSON.stringify({ runId, pid: process.pid, phase, startedAt }, null, 2));
            return true;
        }
        catch {
            return false;
        }
    }
    clearMarker(runId) {
        const p = this.markerPath(runId);
        if (!p)
            return;
        try {
            fs.rmSync(p, { force: true });
        }
        catch { }
    }
    async withMarker(runId, phase, fn) {
        if (this.markerHeldFor === runId) {
            this.writeMarker(runId, phase);
            return fn();
        }
        const owned = this.writeMarker(runId, phase);
        if (owned)
            this.markerHeldFor = runId;
        try {
            return await fn();
        }
        catch (e) {
            try {
                const runDir = resolveRunDir(this.apsfRoot, runId);
                if (runDir) {
                    setPhaseStatus(runDir, 'failed', `Execution failed: ${e instanceof Error ? e.message : String(e)}`);
                }
            }
            catch { }
            throw e;
        }
        finally {
            if (owned) {
                this.clearMarker(runId);
                this.markerHeldFor = null;
            }
        }
    }
    progress(runId, message, extra = {}) {
        this.transcript?.append('progress', { message, ...extra });
        this.emit('event', {
            type: 'progress',
            runId,
            timestamp: Date.now(),
            data: { message, mode: 'apsf-native', ...extra },
        });
    }
    run(command, args, opts = {}) {
        return new Promise((resolve, reject) => {
            const startedAt = Date.now();
            const env = { ...process.env };
            delete env.ANTHROPIC_API_KEY;
            delete env.OPENAI_API_KEY;
            delete env.GEMINI_API_KEY;
            env.PYTHONIOENCODING = 'utf-8';
            const child = spawn(command, args, {
                cwd: opts.cwd ?? this.apsfRoot,
                shell: true,
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
            child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr, durationMs: Date.now() - startedAt }));
            child.stdin?.on('error', () => { });
            if (opts.stdin !== undefined) {
                child.stdin?.write(opts.stdin);
            }
            child.stdin?.end();
        });
    }
    getPrompt(runId, specialists) {
        const runDir = resolveRunDir(this.apsfRoot, runId);
        if (!runDir)
            throw new Error(`Run not found: ${runId}`);
        const built = buildPhasePrompt(runDir, resolveFrameworkRoot(this.apsfRoot), { specialists });
        const s = built.specialist;
        return {
            prompt: built.prompt,
            specialistNote: s
                ? `[native] specialist: ${s.kind} ${s.ptype}${s.file ? ` (${s.file})` : ''} — ${s.mode}: ${s.reason}`
                : null,
        };
    }
    async invokeAI(runId, phase, prompt, provider, timeoutMs) {
        const isBuild = phase === 'BUILD_NEEDED';
        const permissionMode = process.env.APSF_PERMISSION_MODE || 'acceptEdits';
        const cwd = this.resolveTargetWorkdir(runId);
        if (isBuild) {
            try {
                const st = await workdirGitStatus(cwd);
                const dirty = dirtySummary(st);
                if (dirty) {
                    this.progress(runId, `[git] ⚠ workdir is dirty before BUILD — ${dirty} (AI の変更と混ざるため、コミットしてからの実行を推奨)`, { phase, git: 'dirty-warning' });
                }
                else if (st.isRepo) {
                    this.progress(runId, `[git] workdir clean (branch: ${st.branch})`, { phase });
                }
            }
            catch {
            }
        }
        let command;
        let args;
        const override = process.env.APSF_NATIVE_CLI_OVERRIDE;
        if (override) {
            this.progress(runId, `[native] CLI override active: ${override}`, { phase });
            const res = await this.run(override, [], { stdin: prompt, timeoutMs, cwd });
            if (res.code !== 0) {
                throw new Error(`override CLI exited with code ${res.code}: ${(res.stderr || res.stdout).slice(0, 300)}`);
            }
            if (!res.stdout.trim())
                throw new Error('override CLI returned empty output');
            return res.stdout;
        }
        let codexOutFile = null;
        if (provider === 'codex') {
            command = 'codex';
            codexOutFile = path.join(os.tmpdir(), `apsf-codex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.md`);
            args = [
                'exec', '--skip-git-repo-check',
                '-s', isBuild ? 'workspace-write' : 'read-only',
                '-o', `"${codexOutFile}"`,
                '-',
            ];
        }
        else {
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
        this.progress(runId, `[native] invoking ${command} (phase=${phase}, tools=${isBuild ? 'on' : 'off'}, workdir=${cwd})`, { phase });
        try {
            const res = await this.run(command, args, {
                stdin: prompt,
                timeoutMs,
                cwd,
                onStdout: (chunk) => this.progress(runId, chunk, { phase, stream: 'ai' }),
            });
            if (res.code !== 0) {
                const partial = (codexOutFile && fs.existsSync(codexOutFile)
                    ? fs.readFileSync(codexOutFile, 'utf-8')
                    : res.stdout).trim();
                if (partial) {
                    const salvaged = this.salvagePartialOutput(runId, phase, partial);
                    if (salvaged) {
                        this.progress(runId, `[native] partial output salvaged to ${salvaged}`, { phase });
                    }
                }
                const detail = (res.stderr || res.stdout).slice(0, 300);
                const timedOut = res.code === null && res.durationMs >= timeoutMs - 1000;
                if (timedOut) {
                    throw new Error(`${command} timed out after ${fmtDuration(res.durationMs)} ` +
                        `(limit ${fmtDuration(timeoutMs)} — raise with APSF_EXEC_TIMEOUT_MS): ${detail}`);
                }
                if (res.code === null) {
                    throw new Error(`${command} was killed after ${fmtDuration(res.durationMs)}` +
                        `${res.signal ? ` (signal ${res.signal})` : ''}: ${detail}`);
                }
                throw new Error(`${command} exited with code ${res.code}: ${detail}`);
            }
            const output = codexOutFile && fs.existsSync(codexOutFile)
                ? fs.readFileSync(codexOutFile, 'utf-8')
                : res.stdout;
            if (!output.trim()) {
                throw new Error(`${command} returned empty output`);
            }
            if (isBuild) {
                try {
                    const d = await workdirGitDiff(cwd);
                    if (d.isRepo) {
                        const statLine = d.stat.split('\n').pop()?.trim() || 'no changes';
                        const untrackedNote = d.untracked.length ? ` / untracked: ${d.untracked.length} file(s)` : '';
                        this.progress(runId, `[git] BUILD による変更: ${statLine}${untrackedNote} — 詳細は Workdir Diff パネルで確認`, {
                            phase,
                            git: 'post-build-diff',
                        });
                    }
                }
                catch {
                }
            }
            return output;
        }
        finally {
            if (codexOutFile)
                fs.rmSync(codexOutFile, { force: true });
        }
    }
    resolveTargetWorkdir(runId) {
        const runDir = resolveRunDir(this.apsfRoot, runId);
        if (runDir) {
            const p = path.join(runDir, 'run_config.json');
            try {
                if (fs.existsSync(p)) {
                    const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
                    if (cfg.target_workdir && fs.existsSync(cfg.target_workdir)) {
                        return cfg.target_workdir;
                    }
                }
            }
            catch {
            }
        }
        return this.apsfRoot;
    }
    salvagePartialOutput(runId, phase, content) {
        const runDir = resolveRunDir(this.apsfRoot, runId);
        if (!runDir)
            return null;
        const name = `salvage-${phase}-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
        try {
            fs.writeFileSync(path.join(runDir, name), content, 'utf-8');
            return name;
        }
        catch {
            return null;
        }
    }
    savePhaseOutput(runId, content, force) {
        const runDir = resolveRunDir(this.apsfRoot, runId);
        if (!runDir)
            throw new Error(`Run not found: ${runId}`);
        const result = writePhase(runDir, content, force ? { force: true, forceReason: force.forceReason } : {});
        try {
            const prefix = `salvage-${result.phaseBefore}-`;
            for (const f of fs.readdirSync(runDir)) {
                if (f.startsWith(prefix) && f.endsWith('.md')) {
                    fs.rmSync(path.join(runDir, f), { force: true });
                }
            }
        }
        catch {
        }
    }
    detectPhase(runId) {
        const runDir = resolveRunDir(this.apsfRoot, runId);
        if (!runDir)
            throw new Error(`Run not found: ${runId}`);
        return new PhaseDetector(runDir).detect();
    }
    async executePhase(opts) {
        return this.withTranscript(opts.runId, { command: 'phase', provider: opts.provider, ...(opts.providers ? { providers: opts.providers } : {}), dryRun: Boolean(opts.dryRun) }, () => this.executePhaseCore(opts));
    }
    async executePhaseCore(opts) {
        const { runId, provider, providers, specialists, dryRun, timeoutMs = defaultExecTimeoutMs() } = opts;
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
        const effectiveProvider = resolveProvider(info.phase, provider, providers);
        const providerNote = effectiveProvider !== provider
            ? ` (role override: ${effectiveProvider})`
            : '';
        this.progress(runId, `[native] phase=${info.phase} provider=${effectiveProvider}${providerNote} → assembling prompt`, {
            phase: info.phase,
            provider: effectiveProvider,
        });
        const { prompt, specialistNote } = this.getPrompt(runId, specialists);
        if (specialistNote) {
            this.progress(runId, specialistNote, { phase: info.phase });
        }
        if (dryRun) {
            this.progress(runId, `[native] DryRun — prompt assembled (${prompt.length} chars). Not executing AI.`, {
                phase: info.phase,
                promptPreview: prompt.slice(0, 500),
            });
            return info.phase;
        }
        return this.withMarker(runId, info.phase, async () => {
            const runDir = resolveRunDir(this.apsfRoot, runId);
            const targetPath = path.join(runDir, info.fileToWrite);
            const mtimeBefore = fs.existsSync(targetPath) ? fs.statSync(targetPath).mtimeMs : null;
            const hadContentBefore = new PhaseDetector(runDir).hasAnyContent(info.fileToWrite);
            const output = await this.invokeAI(runId, info.phase, prompt, effectiveProvider, timeoutMs);
            const mtimeAfter = fs.existsSync(targetPath) ? fs.statSync(targetPath).mtimeMs : null;
            const writtenByTools = mtimeAfter !== null && mtimeAfter !== mtimeBefore;
            if (writtenByTools && new PhaseDetector(runDir).isFilledPublic(info.fileToWrite)) {
                this.progress(runId, `[native] ${info.fileToWrite} already written by AI tools — syncing state only`, { phase: info.phase });
                const next = nextPhaseAfterWrite(runDir, info.phase);
                const result = transition(runDir, {
                    toPhase: next,
                    actor: 'system',
                    reason: 'builder wrote target file directly via tools',
                });
                if (!result.success)
                    throw new Error(result.error ?? 'state sync failed');
            }
            else {
                this.progress(runId, `[native] saving ${info.fileToWrite} (native write-phase)`, {
                    phase: info.phase,
                });
                this.savePhaseOutput(runId, output, hadContentBefore
                    ? { forceReason: `rerun of ${info.phase}: overwrite previous ${info.fileToWrite}` }
                    : undefined);
            }
            return this.detectPhase(runId).phase;
        });
    }
    async executeLoop(opts) {
        return this.withTranscript(opts.runId, { command: 'full-cycle', provider: opts.provider, ...(opts.providers ? { providers: opts.providers } : {}), dryRun: Boolean(opts.dryRun) }, () => {
            if (opts.dryRun)
                return this.loopCore(opts);
            const initial = this.detectPhase(opts.runId);
            return this.withMarker(opts.runId, initial.phase, () => this.loopCore(opts));
        });
    }
    async loopCore(opts) {
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
                return { phase: after, cycles, stopReason: 'phase_not_advanced' };
            }
        }
    }
}
