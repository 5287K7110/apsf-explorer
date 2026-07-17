import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { PhaseDetector, resolveRunDir } from './apsf-native/phase-detector.js';
import { startRun } from './apsf-native/run-store.js';
import { writePhase as nativeWritePhase, resolveWriteTarget } from './apsf-native/write-phase.js';
import { isHumanPhase } from './apsf-native/phases.js';
import { applyJudgeDecision } from './apsf-native/judge-decision.js';
import { loadRunState } from './apsf-native/run-state.js';
import { listTranscripts, readTranscript, } from './apsf-native/execution-transcript.js';
import { PTYPE_TO_SPECIALIST, CTYPE_TO_SPECIALIST, } from './apsf-native/specialist-registry.js';
import { enqueue, cancelExecution, listExecuting, getQueueState, } from './execution-queue.js';
export const RUN_NAME_RE = /^\d{4}-\d{2}-\d{2}(-\d{3})?_[A-Za-z0-9._-]+$/;
export class PhaseFileMismatchError extends Error {
    constructor() {
        super(...arguments);
        this.status = 409;
    }
}
export class AutoOwnedPhaseError extends Error {
    constructor() {
        super(...arguments);
        this.status = 403;
    }
}
export const PHASE_FILES = [
    'task.md', 'goal.md', 'execution-assignment.md', 'plan.md', 'build.md',
    'review.md', 'improve-plan.md', 'improve.md', 'verify.md', 'result.md',
    'handoff.md', 'transcript.md',
    'plan_review.md', 'build_review.md', 'review_review.md', 'improve_review.md',
    'model-assignment.md',
];
function validateExecuteSpecialists(specialists) {
    if (!specialists)
        return null;
    const checks = [
        { role: 'planner', value: specialists.planner, valid: Object.keys(PTYPE_TO_SPECIALIST).sort() },
        { role: 'critic', value: specialists.critic, valid: Object.keys(CTYPE_TO_SPECIALIST).sort() },
    ];
    for (const check of checks) {
        if (check.value === undefined || check.value === null)
            continue;
        const code = check.value.trim().toUpperCase();
        if (!code || !check.valid.includes(code)) {
            return `Invalid ${check.role} specialist code '${check.value}'. Valid ${check.role} codes: ${check.valid.join(', ')}`;
        }
    }
    return null;
}
export class APSFRunBridge extends EventEmitter {
    get apsfRoot() {
        return process.env.APSF_ROOT || '';
    }
    isAvailable() {
        return (this.apsfRoot.length > 0 &&
            fs.existsSync(path.join(this.apsfRoot, 'runs')));
    }
    listRuns() {
        if (!this.isAvailable())
            return [];
        const runsDir = path.join(this.apsfRoot, 'runs');
        const isRunName = (name) => /^\d{4}-\d{2}-\d{2}/.test(name);
        const results = [];
        for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
            if (!entry.isDirectory())
                continue;
            if (isRunName(entry.name)) {
                results.push(entry.name);
            }
            else if (['fw-improvement', 'work'].includes(entry.name)) {
                const sub = path.join(runsDir, entry.name);
                for (const child of fs.readdirSync(sub, { withFileTypes: true })) {
                    if (child.isDirectory() && isRunName(child.name)) {
                        results.push(child.name);
                    }
                }
            }
        }
        return results.sort();
    }
    async getPhase(runName) {
        return this.getPhaseInfo(runName).phase;
    }
    getPhaseInfo(runName) {
        const runDir = resolveRunDir(this.apsfRoot, runName);
        if (!runDir) {
            throw new Error(`Run not found: ${runName}`);
        }
        return new PhaseDetector(runDir).detect();
    }
    getRunDir(runName) {
        return resolveRunDir(this.apsfRoot, runName);
    }
    getTargetWorkdir(runName) {
        const runDir = resolveRunDir(this.apsfRoot, runName);
        if (runDir) {
            const p = path.join(runDir, 'run_config.json');
            try {
                if (fs.existsSync(p)) {
                    const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
                    if (cfg.target_workdir && fs.existsSync(cfg.target_workdir))
                        return cfg.target_workdir;
                }
            }
            catch { }
        }
        return this.apsfRoot;
    }
    listArtifacts(runName) {
        this.assertRunName(runName);
        const runDir = resolveRunDir(this.apsfRoot, runName);
        if (!runDir)
            throw new Error(`Run not found: ${runName}`);
        return PHASE_FILES.filter((f) => fs.existsSync(path.join(runDir, f)));
    }
    getRunStateMeta(runName) {
        this.assertRunName(runName);
        const runDir = resolveRunDir(this.apsfRoot, runName);
        if (!runDir)
            throw new Error(`Run not found: ${runName}`);
        const state = loadRunState(runDir);
        return {
            phaseStatus: state?.phase_status ?? 'pending',
            lastError: state?.last_error ?? '',
        };
    }
    async execute(request) {
        if (!this.isAvailable()) {
            this.emitError(request.runId, 'APSF framework not available. Set APSF_ROOT to the framework repository.');
            return;
        }
        if (!RUN_NAME_RE.test(request.runId)) {
            this.emitError(request.runId, `Invalid run name: ${request.runId}`);
            return;
        }
        const specialistError = validateExecuteSpecialists(request.specialists);
        if (specialistError) {
            this.emitError(request.runId, specialistError);
            return;
        }
        enqueue({ request, emitter: this, apsfRoot: this.apsfRoot });
    }
    emitError(runId, message) {
        this.emit('event', {
            type: 'error',
            runId,
            timestamp: Date.now(),
            data: { error: message },
        });
    }
    cancelExecution(runId) {
        cancelExecution(runId);
    }
    listExecuting() {
        return listExecuting();
    }
    getQueueState() {
        return getQueueState();
    }
    assertPhaseFile(filename) {
        if (!PHASE_FILES.includes(filename)) {
            throw new Error(`Not a phase file: ${filename}`);
        }
    }
    assertRunName(runName) {
        if (!RUN_NAME_RE.test(runName)) {
            throw new Error(`Invalid run name: ${runName}. ` +
                'Expected format: YYYY-MM-DD_topic (e.g. 2026-07-10_fix-readme-typo).');
        }
    }
    async createRun(runName, options = {}) {
        this.assertRunName(runName);
        if (options.taxonomy && !['fw-improvement', 'work'].includes(options.taxonomy)) {
            throw new Error(`Invalid taxonomy: ${options.taxonomy}`);
        }
        let workdir;
        if (options.workdir) {
            workdir = path.resolve(options.workdir);
            if (!fs.existsSync(workdir) || !fs.statSync(workdir).isDirectory()) {
                throw new Error(`workdir does not exist or is not a directory: ${options.workdir}`);
            }
        }
        startRun(this.apsfRoot, runName, {
            light: options.light,
            taxonomy: options.taxonomy,
        });
        if (workdir) {
            const runDir = resolveRunDir(this.apsfRoot, runName);
            if (runDir) {
                fs.writeFileSync(path.join(runDir, 'run_config.json'), JSON.stringify({ target_workdir: workdir }, null, 2), 'utf-8');
            }
        }
    }
    readPhaseFile(runName, filename) {
        this.assertRunName(runName);
        this.assertPhaseFile(filename);
        const runDir = resolveRunDir(this.apsfRoot, runName);
        if (!runDir)
            throw new Error(`Run not found: ${runName}`);
        const p = path.join(runDir, filename);
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
    }
    async writePhase(runName, content, options = {}) {
        this.assertRunName(runName);
        const runDir = resolveRunDir(this.apsfRoot, runName);
        if (!runDir)
            throw new Error(`Run not found: ${runName}`);
        const target = resolveWriteTarget(runDir);
        if (target) {
            if (options.filename && options.filename !== target.file) {
                throw new PhaseFileMismatchError(`Phase moved on: current phase ${target.phase} writes ${target.file}, ` +
                    `not ${options.filename}. Nothing saved — reload the run and retry.`);
            }
            if (!isHumanPhase(target.phase) && !options.allowAutoOwned) {
                throw new AutoOwnedPhaseError(`${target.file} is owned by ${target.role} (auto phase ${target.phase}). ` +
                    'Set allowAutoOwned to write it manually.');
            }
        }
        const result = nativeWritePhase(runDir, content, {
            force: options.force,
            forceReason: options.forceReason,
        });
        return { fileWritten: result.fileWritten, phase: result.phaseAfter };
    }
    judgeDecision(runName, decision, reason) {
        this.assertRunName(runName);
        const runDir = resolveRunDir(this.apsfRoot, runName);
        if (!runDir)
            throw new Error(`Run not found: ${runName}`);
        if (listExecuting().includes(runName)) {
            throw new Error(`Run ${runName} is currently executing or queued. Wait for completion or cancel first.`);
        }
        return applyJudgeDecision(runDir, decision, reason);
    }
    listExecutions(runName) {
        this.assertRunName(runName);
        const runDir = resolveRunDir(this.apsfRoot, runName);
        if (!runDir)
            throw new Error(`Run not found: ${runName}`);
        return listTranscripts(runDir);
    }
    readExecution(runName, filename) {
        this.assertRunName(runName);
        const runDir = resolveRunDir(this.apsfRoot, runName);
        if (!runDir)
            throw new Error(`Run not found: ${runName}`);
        return readTranscript(runDir, filename);
    }
    getAdvisory(runName) {
        this.assertRunName(runName);
        const runDir = resolveRunDir(this.apsfRoot, runName);
        if (!runDir)
            throw new Error(`Run not found: ${runName}`);
        const p = path.join(runDir, 'judge_advisory.json');
        if (!fs.existsSync(p))
            return null;
        try {
            return JSON.parse(fs.readFileSync(p, 'utf-8'));
        }
        catch {
            return null;
        }
    }
}
