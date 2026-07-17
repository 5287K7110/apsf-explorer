import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PhaseDetector } from './phase-detector.js';
import { isValidTransition } from './phases.js';
import { atomicWrite, appendSessionEvent, loadRunState, transition } from './run-state.js';
export const JUDGE_DECISIONS = ['Accept', 'Return to Build', 'Return to Plan'];
export class JudgeDecisionConflictError extends Error {
    constructor() {
        super(...arguments);
        this.statusCode = 409;
    }
}
const RETURN_TARGETS = {
    'Return to Build': {
        toPhase: 'BUILD_NEEDED',
        reasonFile: 'build_review.md',
        title: 'Build Review',
    },
    'Return to Plan': {
        toPhase: 'PLAN_NEEDED',
        reasonFile: 'plan_review.md',
        title: 'Plan Review',
    },
};
const SUPERSEDE_TARGETS = {
    'Return to Build': ['build.md', 'review.md'],
    'Return to Plan': ['plan.md', 'build.md', 'review.md'],
};
function supersedeDownstream(runDir, decision) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const superseded = [];
    for (const file of SUPERSEDE_TARGETS[decision] ?? []) {
        const src = path.join(runDir, file);
        if (!fs.existsSync(src))
            continue;
        const archived = file.replace(/\.md$/, `.superseded-${stamp}.md`);
        fs.renameSync(src, path.join(runDir, archived));
        superseded.push(archived);
    }
    fs.rmSync(path.join(runDir, 'judge_advisory.json'), { force: true });
    return superseded;
}
function readAdvisoryRecommendation(runDir) {
    const p = path.join(runDir, 'judge_advisory.json');
    if (!fs.existsSync(p))
        return null;
    try {
        const advisory = JSON.parse(fs.readFileSync(p, 'utf-8'));
        const rec = String(advisory?.recommendation ?? '').trim();
        return rec || null;
    }
    catch {
        return null;
    }
}
function buildReasonDocument(opts) {
    return [
        `# ${opts.title} — Judge Decision`,
        '',
        '## Decision',
        '',
        opts.decision,
        '',
        '## Context',
        '',
        `- decided_at: ${new Date().toISOString()}`,
        `- critic_recommendation: ${opts.advisoryRecommendation ?? '(none)'}`,
        `- matches_advisory: ${opts.matchesAdvisory ?? 'n/a'}`,
        '',
        '## Reason',
        '',
        opts.reason.trim(),
        '',
    ].join('\n');
}
export function applyJudgeDecision(runDir, decision, reason) {
    if (!JUDGE_DECISIONS.includes(decision)) {
        throw new Error(`Invalid judge decision: ${decision}. Must be one of: ${JUDGE_DECISIONS.join(', ')}`);
    }
    const detector = new PhaseDetector(runDir);
    const phaseBefore = detector.detect().phase;
    if (phaseBefore !== 'IMPROVE_NEEDED') {
        throw new JudgeDecisionConflictError(`Judge decision requires IMPROVE_NEEDED, but run is at ${phaseBefore}.`);
    }
    const advisoryRecommendation = readAdvisoryRecommendation(runDir);
    const matchesAdvisory = advisoryRecommendation === null ? null : advisoryRecommendation === decision;
    const runId = path.basename(runDir);
    if (decision === 'Accept') {
        appendSessionEvent(runDir, 'judge_decision', runId, {
            decision,
            reason: reason?.trim() || null,
            advisory_recommendation: advisoryRecommendation,
            matches_advisory: matchesAdvisory,
        });
        return {
            decision,
            phaseBefore,
            phaseAfter: phaseBefore,
            reasonFile: null,
            advisoryRecommendation,
            matchesAdvisory,
            supersededFiles: [],
        };
    }
    const trimmedReason = (reason ?? '').trim();
    if (!trimmedReason) {
        throw new Error(`A reason is required for "${decision}".`);
    }
    const runType = loadRunState(runDir)?.run_type;
    if (decision === 'Return to Plan' && runType === 'light') {
        throw new Error('Return to Plan is not available for light runs (no plan phase). Use Return to Build.');
    }
    const target = RETURN_TARGETS[decision];
    if (!isValidTransition('IMPROVE_NEEDED', target.toPhase)) {
        throw new Error(`Transition IMPROVE_NEEDED->${target.toPhase} is not in VALID_TRANSITIONS.`);
    }
    let doc = buildReasonDocument({
        title: target.title,
        decision: decision,
        reason: trimmedReason,
        advisoryRecommendation,
        matchesAdvisory,
    });
    if (!PhaseDetector.isMeaningfulText(doc)) {
        throw new Error(`Reason for ${target.reasonFile} is empty or template-only.`);
    }
    const reasonPath = path.join(runDir, target.reasonFile);
    if (detector.hasAnyContent(target.reasonFile)) {
        const existing = fs.readFileSync(reasonPath, 'utf-8').replace(/\s+$/, '');
        doc = `${existing}\n\n---\n\n${doc.replace(/^# .*\n\n/, `## ${target.title} — Judge Decision (repeat)\n\n`)}`;
    }
    const supersededFiles = supersedeDownstream(runDir, decision);
    const osDoc = os.EOL === '\n' ? doc : doc.replace(/\r?\n/g, os.EOL);
    atomicWrite(reasonPath, osDoc);
    const result = transition(runDir, {
        toPhase: target.toPhase,
        actor: 'Judge',
        reason: `judge decision: ${decision}`,
        runType,
    });
    if (!result.success) {
        throw new Error(result.error ?? 'judge transition failed');
    }
    appendSessionEvent(runDir, 'judge_decision', runId, {
        decision,
        to_phase: target.toPhase,
        reason_file: target.reasonFile,
        advisory_recommendation: advisoryRecommendation,
        matches_advisory: matchesAdvisory,
        superseded_files: supersededFiles,
    });
    return {
        decision: decision,
        phaseBefore,
        phaseAfter: target.toPhase,
        reasonFile: target.reasonFile,
        advisoryRecommendation,
        matchesAdvisory,
        supersededFiles,
    };
}
