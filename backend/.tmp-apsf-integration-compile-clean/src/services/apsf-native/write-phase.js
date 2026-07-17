import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PhaseDetector } from './phase-detector.js';
import { PHASE_TARGET } from './phases.js';
import { transition, loadRunState, atomicWrite, appendSessionEvent } from './run-state.js';
const TRANSPORT_LINE_RE = new RegExp('^\\s*(?:' +
    '\\[APSF\\]|\\[Step \\d+/\\d+\\]|\\[Done\\]|\\[Note\\]|\\[FAIL\\]|\\[Error\\]|\\[Warn\\]|' +
    'Do you want to allow|Allow this action|Permission required|Approval required' +
    ')', 'i');
export function sanitizePhaseInput(text) {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let lines = normalized.split('\n');
    let firstHeadingIndex = null;
    for (let i = 0; i < lines.length; i++) {
        if (/^\s*#\s+\S/.test(lines[i])) {
            firstHeadingIndex = i;
            break;
        }
    }
    if (firstHeadingIndex !== null &&
        lines.slice(0, firstHeadingIndex).some((l) => l.trim())) {
        lines = lines.slice(firstHeadingIndex);
    }
    while (lines.length) {
        const s = lines[0].trim();
        if (!s) {
            lines.shift();
            continue;
        }
        if (TRANSPORT_LINE_RE.test(s)) {
            lines.shift();
            continue;
        }
        break;
    }
    const joined = lines.join('\n').trim();
    return joined + (lines.length ? '\n' : '');
}
export function nextPhaseAfterWrite(runDir, phase) {
    const exists = (f) => fs.existsSync(path.join(runDir, f));
    const filled = (f) => new PhaseDetector(runDir).isFilledPublic(f);
    switch (phase) {
        case 'TASK_NEEDED':
            return 'BUILD_NEEDED';
        case 'SETUP_NEEDED':
            return 'GOAL_NEEDED';
        case 'GOAL_NEEDED':
            return 'PLAN_NEEDED';
        case 'PLAN_NEEDED':
            return 'BUILD_NEEDED';
        case 'BUILD_NEEDED':
            return 'REVIEW_NEEDED';
        case 'REVIEW_NEEDED':
            return exists('improve-plan.md') && !filled('improve-plan.md')
                ? 'IMPROVE_PLAN_OPTIONAL'
                : 'IMPROVE_NEEDED';
        case 'IMPROVE_PLAN_OPTIONAL':
            return 'IMPROVE_NEEDED';
        case 'IMPROVE_NEEDED':
            return exists('verify.md') && !filled('verify.md')
                ? 'VERIFY_OPTIONAL'
                : 'RESULT_NEEDED';
        case 'VERIFY_OPTIONAL':
            return 'RESULT_NEEDED';
        case 'RESULT_NEEDED':
            return !filled('transcript.md') ? 'TRANSCRIPT_RECOMMENDED' : 'COMPLETE';
        case 'TRANSCRIPT_RECOMMENDED':
            return 'COMPLETE';
        default:
            throw new Error(`No next phase defined after write for: ${phase}`);
    }
}
const ADVISORY_BLOCK_RE = /```apsf-judge-advisory\s+(\{[\s\S]*?\})\s+```/gi;
const ADVISORY_RECOMMENDATIONS = new Set(['Return to Build', 'Return to Plan', 'Accept']);
export function parseReviewJudgeAdvisory(reviewText) {
    const matches = [...reviewText.matchAll(ADVISORY_BLOCK_RE)];
    if (matches.length === 0) {
        throw new Error('review.md must include exactly one ```apsf-judge-advisory``` JSON block ' +
            'with recommendation and human_owned_blocker.');
    }
    if (matches.length !== 1) {
        throw new Error('review.md must include exactly one ```apsf-judge-advisory``` JSON block; ' +
            'multiple blocks are not allowed.');
    }
    let payload;
    try {
        payload = JSON.parse(matches[0][1]);
    }
    catch {
        throw new Error('review.md advisory block must contain valid JSON.');
    }
    const recommendation = String(payload?.recommendation ?? '').trim();
    if (!ADVISORY_RECOMMENDATIONS.has(recommendation)) {
        throw new Error('review.md advisory recommendation must be one of: Return to Build, Return to Plan, Accept.');
    }
    if (typeof payload.human_owned_blocker !== 'boolean') {
        throw new Error('review.md advisory human_owned_blocker must be true or false.');
    }
    return { recommendation, human_owned_blocker: payload.human_owned_blocker };
}
function writeCanonicalJudgeAdvisory(runDir, opts) {
    let ownershipStatus = 'UNRECORDED';
    let ownershipDetail = `transition outcome record not found for run '${path.basename(runDir)}'`;
    const outcomePath = path.join(runDir, 'transition_outcome.json');
    if (fs.existsSync(outcomePath)) {
        try {
            const rec = JSON.parse(fs.readFileSync(outcomePath, 'utf-8'));
            ownershipStatus = String(rec.blocker_owner ?? 'UNRECORDED');
            ownershipDetail = null;
        }
        catch { }
    }
    const payload = {
        recommendation: opts.recommendation,
        human_owned_blocker: opts.humanOwnedBlocker,
        human_owned_blocker_state: 'valid',
        advisory_source: 'judge_structured',
        run_id: path.basename(runDir),
        generated_at: new Date().toISOString(),
        phase: opts.phase,
        ownership_status: ownershipStatus,
        ownership_detail: ownershipDetail,
        source: 'write-phase review completion',
        freshness_token: opts.freshnessToken,
    };
    fs.writeFileSync(path.join(runDir, 'judge_advisory.json'), JSON.stringify(payload, null, 2), 'utf-8');
}
export function resolveWriteTarget(runDir) {
    const info = new PhaseDetector(runDir).detect();
    const target = PHASE_TARGET[info.phase];
    if (!target || target.file === '(none)')
        return null;
    return { phase: info.phase, role: target.role, file: target.file };
}
export function writePhase(runDir, rawContent, options = {}) {
    const detector = new PhaseDetector(runDir);
    const info = detector.detect();
    const phase = info.phase;
    const target = PHASE_TARGET[phase];
    if (!target || target.file === '(none)') {
        throw new Error(`No writable target file for phase: ${phase}`);
    }
    const content = sanitizePhaseInput(rawContent);
    if (!PhaseDetector.isMeaningfulText(content)) {
        throw new Error(`Content for ${target.file} is empty or template-only ` +
            '(more than 3 non-heading, non-empty lines are required). Nothing saved.');
    }
    if (detector.hasAnyContent(target.file)) {
        if (!options.force) {
            throw new Error(`${target.file} already has content. Use force with a reason to overwrite.`);
        }
        if (!options.forceReason) {
            throw new Error('forceReason is required when force is set.');
        }
    }
    let reviewAdvisory = null;
    if (target.file === 'review.md') {
        reviewAdvisory = parseReviewJudgeAdvisory(content);
    }
    const osContent = os.EOL === '\n' ? content : content.replace(/\n/g, os.EOL);
    atomicWrite(path.join(runDir, target.file), osContent);
    const nextPhase = nextPhaseAfterWrite(runDir, phase);
    const result = transition(runDir, {
        toPhase: nextPhase,
        actor: 'system',
        reason: 'write-phase canonical state sync',
        runType: loadRunState(runDir)?.run_type,
    });
    if (!result.success) {
        throw new Error(result.error ?? 'transition failed');
    }
    if (nextPhase === 'IMPROVE_NEEDED' && reviewAdvisory) {
        const state = loadRunState(runDir);
        writeCanonicalJudgeAdvisory(runDir, {
            recommendation: reviewAdvisory.recommendation,
            humanOwnedBlocker: reviewAdvisory.human_owned_blocker,
            phase: nextPhase,
            freshnessToken: state?.phase_entered_at || null,
        });
    }
    if (options.force) {
        appendSessionEvent(runDir, 'force_override', path.basename(runDir), {
            command: 'write-phase',
            target_file: target.file,
            reason: options.forceReason,
            override_kind: 'overwrite',
        });
    }
    return { fileWritten: target.file, phaseBefore: phase, phaseAfter: nextPhase };
}
