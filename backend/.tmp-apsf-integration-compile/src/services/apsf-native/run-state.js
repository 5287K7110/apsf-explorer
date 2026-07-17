/**
 * RunState / TransitionService — TypeScript ネイティブ移植
 *
 * 参照仕様: ai-problem-solving-framework
 *   src/apsf/core/state/run_state.py
 *   src/apsf/core/state/run_state_repository.py
 *   src/apsf/core/state/transition_service.py
 *   src/apsf/core/ownership/record.py (transition_outcome.json)
 *   src/apsf/core/storage/artifact_repository.py (atomic write + lock)
 */
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { isValidTransition } from './phases.js';
// ── Atomic write（temp + exclusive .lock + rename）──────────────
export function atomicWrite(filePath, content) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmpPath = filePath.replace(/(\.[^./\\]+)?$/, `.${randomUUID().slice(0, 8)}.tmp`);
    const lockPath = filePath.replace(/\.[^./\\]+$/, '') + '.lock';
    fs.writeFileSync(tmpPath, content, 'utf-8');
    let lockFd = null;
    try {
        try {
            lockFd = fs.openSync(lockPath, 'wx'); // exclusive create
        }
        catch {
            fs.rmSync(tmpPath, { force: true });
            throw new Error(`Cannot write ${path.basename(filePath)}: lock file exists (${lockPath})`);
        }
        fs.renameSync(tmpPath, filePath); // atomic replace
    }
    finally {
        if (lockFd !== null) {
            fs.closeSync(lockFd);
            fs.rmSync(lockPath, { force: true });
        }
    }
}
/** フェーズごとのデフォルト owner（transition_service.py _PHASE_OWNER） */
export const PHASE_OWNER = {
    TASK_NEEDED: 'Human',
    GOAL_NEEDED: 'Human',
    SETUP_NEEDED: 'Human',
    PLAN_NEEDED: 'Planner',
    IMPROVE_PLAN_OPTIONAL: 'Human',
    BUILD_NEEDED: 'Builder',
    REVIEW_NEEDED: 'Critic',
    IMPROVE_NEEDED: 'Human',
    VERIFY_OPTIONAL: 'Human',
    RESULT_NEEDED: 'Human',
    TRANSCRIPT_RECOMMENDED: 'Human',
    COMPLETE: '(none)',
};
/** 遷移ルールを迂回できる actor（transition_service.py _UNCONSTRAINED_ACTORS） */
const UNCONSTRAINED_ACTORS = new Set(['Judge', 'rerun', 'system']);
const STATE_FILENAME = 'run_state.json';
export function loadRunState(runDir) {
    const p = path.join(runDir, STATE_FILENAME);
    if (!fs.existsSync(p))
        return null;
    try {
        const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
        return {
            run_id: String(data.run_id ?? ''),
            run_type: String(data.run_type || 'heavy'),
            current_phase: String(data.current_phase ?? ''),
            phase_status: String(data.phase_status ?? 'pending'),
            current_owner: String(data.current_owner ?? ''),
            retry_count: Number(data.retry_count ?? 0),
            last_error: String(data.last_error ?? ''),
            active_handoff_id: String(data.active_handoff_id ?? ''),
            gate_failures: Array.isArray(data.gate_failures) ? data.gate_failures : [],
            phase_entered_at: String(data.phase_entered_at ?? ''),
            error_timestamp: String(data.error_timestamp ?? ''),
        };
    }
    catch {
        return null;
    }
}
export function saveRunState(runDir, state) {
    atomicWrite(path.join(runDir, STATE_FILENAME), JSON.stringify(state, null, 2));
}
/**
 * phase_status / last_error のみ更新する（遷移しない）。
 * クラッシュ回復（orphaned run の failed 化）用。run_state.json がない run は無視。
 */
export function setPhaseStatus(runDir, status, lastError = '') {
    const state = loadRunState(runDir);
    if (!state)
        return false;
    saveRunState(runDir, {
        ...state,
        phase_status: status,
        last_error: lastError,
        error_timestamp: status === 'failed' ? new Date().toISOString() : state.error_timestamp,
    });
    return true;
}
// ── transition_outcome.json（ownership/record.py） ───────────────
export function writeTransitionOutcome(runDir, opts) {
    // 任意の新遷移は旧 ownership を supersede。BUILD_NEEDED のみ record を書く
    const outcomePath = path.join(runDir, 'transition_outcome.json');
    if (opts.toPhase !== 'BUILD_NEEDED') {
        fs.rmSync(outcomePath, { force: true });
        return;
    }
    const record = {
        run_id: path.basename(runDir),
        transition_type: opts.actor === 'rerun' ? 'RERUN_REQUESTED' : 'BUILD_NEEDED',
        transitioned_at: new Date().toISOString(),
        transitioned_by: opts.actor,
        blocker_owner: 'SYSTEM',
        source_phase: opts.fromPhase,
        target_phase: opts.toPhase,
    };
    atomicWrite(outcomePath, JSON.stringify(record, null, 2));
}
export function transition(runDir, opts) {
    const state = loadRunState(runDir);
    const actualFrom = state?.current_phase ?? '';
    // Transition validation（unconstrained actor は迂回可）
    if (!UNCONSTRAINED_ACTORS.has(opts.actor)) {
        if (!isValidTransition(actualFrom, opts.toPhase)) {
            return {
                success: false,
                fromPhase: actualFrom,
                toPhase: opts.toPhase,
                error: `Invalid transition: ${actualFrom || '(bootstrap)'} -> ${opts.toPhase}`,
            };
        }
    }
    const nowIso = new Date().toISOString();
    const owner = PHASE_OWNER[opts.toPhase] ?? '';
    const next = state
        ? {
            ...state,
            current_phase: opts.toPhase,
            phase_status: opts.phaseStatus ?? 'pending',
            current_owner: owner,
            retry_count: 0,
            last_error: '',
            active_handoff_id: '',
            gate_failures: [],
            phase_entered_at: nowIso,
        }
        : {
            run_id: path.basename(runDir),
            run_type: opts.runType ?? 'heavy',
            current_phase: opts.toPhase,
            phase_status: opts.phaseStatus ?? 'pending',
            current_owner: owner,
            retry_count: 0,
            last_error: '',
            active_handoff_id: '',
            gate_failures: [],
            phase_entered_at: nowIso,
            error_timestamp: '',
        };
    saveRunState(runDir, next);
    writeTransitionOutcome(runDir, {
        fromPhase: actualFrom,
        toPhase: opts.toPhase,
        actor: opts.actor,
    });
    return { success: true, fromPhase: actualFrom, toPhase: opts.toPhase };
}
/** bootstrap（TransitionService.bootstrap 相当）: run 作成時の初期 state */
export function bootstrapRunState(runDir, opts) {
    const state = {
        run_id: path.basename(runDir),
        run_type: opts.runType,
        current_phase: opts.phase,
        phase_status: 'pending',
        current_owner: PHASE_OWNER[opts.phase] ?? '',
        retry_count: 0,
        last_error: '',
        active_handoff_id: '',
        gate_failures: [],
        phase_entered_at: new Date().toISOString(),
        error_timestamp: '',
    };
    saveRunState(runDir, state);
}
// ── セッションイベントログ（session_event_repository.py） ─────────
export function appendSessionEvent(runDir, eventType, runId, payload) {
    const event = {
        event_id: randomUUID(),
        timestamp: new Date().toISOString(),
        event_type: eventType,
        run_id: runId,
        payload,
    };
    fs.appendFileSync(path.join(runDir, 'session_events.jsonl'), JSON.stringify(event) + '\n', 'utf-8');
}
