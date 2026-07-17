import * as fs from 'fs';
import * as path from 'path';
import { PhaseDetector } from './phase-detector.js';
import { resolvePlannerSpecialist, resolveCriticSpecialist, } from './specialist-registry.js';
function section(title, content) {
    if (!content.trim())
        return '';
    return `## ${title}\n\n${content.trim()}\n\n`;
}
export function renderPlanPrompt(opts) {
    let prompt = 'Produce the final contents of plan.md as markdown text only, based on the following Goal.\n\n' +
        section('Goal', opts.goalContent);
    if (opts.specialistSelectionNote) {
        prompt += section('Planner Specialist Selection', opts.specialistSelectionNote);
    }
    if (opts.specialistContent) {
        prompt += section('Planner Specialist Guidance', opts.specialistContent);
    }
    if (opts.planReviewContent) {
        prompt += section('Plan Review Feedback', opts.planReviewContent);
    }
    prompt +=
        '---\n\n' +
            'Output format: Return ONLY the raw Markdown content for plan.md.\n' +
            "Start immediately with '# Plan'. Do not include meta-commentary, file paths, save locations,\n" +
            'code fences, or explanatory text before or after the Markdown.\n' +
            'If Plan Review Feedback is provided, reflect it in the revised plan.md while still returning the full final document.\n' +
            'Required sections: Goal Readiness Check, Problem Structure, Hypotheses,\n' +
            'Options (minimum 2), Selected Approach with reasoning,\n' +
            'Implementation Readiness, Execution Plan, Assumptions & Open Questions.\n';
    return prompt;
}
export function renderBuildPrompt(opts) {
    let prompt = 'Create the final deliverable and build.md based on the following inputs.\n\n' +
        section('Plan', opts.planContent);
    if (opts.handoffContent) {
        prompt += section('Handoff', opts.handoffContent);
    }
    if (opts.buildReviewContent) {
        prompt += section('Build Review Feedback', opts.buildReviewContent);
    }
    if (opts.draftContent) {
        prompt += section('JuniorBuilder Draft (for reference)', opts.draftContent);
    }
    if (opts.salvageContent) {
        prompt += section('Previous Interrupted Attempt (salvaged partial output)', opts.salvageContent +
            '\n\nNOTE: The previous attempt was interrupted (timeout/kill). ' +
            'Reuse whatever is already correct instead of redoing it from scratch, then complete the remaining work.');
    }
    prompt +=
        '---\n\n' +
            'Output format: Return ONLY the raw Markdown content for build.md.\n' +
            "Start immediately with '# Build'. Do not include meta-commentary, code fences around the document, or explanatory text before or after the Markdown.\n" +
            'If Build Review Feedback is provided, reflect it in the revised build while still returning the full final document.\n' +
            'Do not dump the full deliverable into build.md. Put real implementation in real files and use build.md as the build record.\n' +
            'Do NOT create or edit a build.md file in the working directory yourself — return the build record as your response text only; the framework persists it into the run folder.\n' +
            'build.md must include: What was built, Inputs received, ' +
            'Decisions made, Deviations from Plan, Open Issues.\n';
    return prompt;
}
export function renderReviewPrompt(opts) {
    let prompt = 'Review the Build output against the Goal\'s success criteria.\n' +
        'Classify issues as Critical / Major / Minor.\n\n' +
        section('Goal', opts.goalContent) +
        section('Build Record', opts.buildContent);
    if (opts.handoffContent) {
        prompt += section('Handoff from Builder', opts.handoffContent);
    }
    if (opts.reviewReviewContent) {
        prompt += section('Re-review Feedback', opts.reviewReviewContent);
    }
    if (opts.specialistSelectionNote) {
        prompt += section('Critic Specialist Selection', opts.specialistSelectionNote);
    }
    if (opts.specialistContent) {
        prompt += section('Critic Specialist Guidance', opts.specialistContent);
    }
    prompt +=
        '---\n\n' +
            'Output format: Follow the review.md template.\n' +
            'Return ONLY the raw Markdown content for review.md.\n' +
            'REQUIRED: Include exactly one ```apsf-judge-advisory``` JSON block at the END of review.md.\n' +
            'Zero blocks or multiple blocks are invalid and will cause a hard failure.\n' +
            'The block must contain {"recommendation": "Return to Build" | "Return to Plan" | "Accept", "human_owned_blocker": true|false}.\n' +
            'This block is the canonical structured recommendation source for the current review completion flow.\n' +
            'Do not infer it from free-form prose; state the recommendation directly in the block.\n' +
            'Do not include meta-commentary, file paths, or explanatory text before or after the Markdown.\n' +
            'If Re-review Feedback is provided, address its requested revisions while still producing a full independent review.\n' +
            'Provide specific, actionable improvement suggestions for each issue.\n' +
            '\n' +
            'The advisory block MUST appear at the very end of the document, like this:\n' +
            '```apsf-judge-advisory\n' +
            '{"recommendation": "Accept", "human_owned_blocker": false}\n' +
            '```\n';
    return prompt;
}
function readContextFiles(info, runDir) {
    const context = {};
    const filesToRead = [...info.filesToRead];
    if (!filesToRead.includes('execution-assignment.md') &&
        fs.existsSync(path.join(runDir, 'execution-assignment.md'))) {
        filesToRead.push('execution-assignment.md');
    }
    for (const filename of filesToRead) {
        const p = path.join(runDir, filename);
        if (fs.existsSync(p)) {
            context[filename] = fs.readFileSync(p, 'utf-8');
        }
    }
    return context;
}
function latestSalvage(runDir, phase) {
    try {
        const prefix = `salvage-${phase}-`;
        const files = fs
            .readdirSync(runDir)
            .filter((f) => f.startsWith(prefix) && f.endsWith('.md'))
            .sort();
        if (files.length === 0)
            return undefined;
        const content = fs.readFileSync(path.join(runDir, files[files.length - 1]), 'utf-8').trim();
        return content || undefined;
    }
    catch {
        return undefined;
    }
}
function selectionNote(selection, frameworkRoot, kind) {
    const posixPath = selection.specialistPath
        ? path.relative(frameworkRoot, selection.specialistPath).split(path.sep).join('/')
        : '(none)';
    return (`- Mode: ${selection.mode}\n` +
        `- Selected ${kind}-TYPE: ${selection.ptype || '(none)'}\n` +
        `- Specialist Path: ${posixPath}\n` +
        `- Reason: ${selection.reason}\n`);
}
function specialistSummary(kind, selection, frameworkRoot) {
    return {
        kind,
        ptype: selection.ptype || '(generic)',
        file: selection.specialistPath
            ? path.relative(frameworkRoot, selection.specialistPath).split(path.sep).join('/')
            : null,
        mode: selection.mode,
        reason: selection.reason,
    };
}
export function buildPhasePrompt(runDir, frameworkRoot, opts = {}) {
    const detector = new PhaseDetector(runDir);
    const info = detector.detect();
    const context = readContextFiles(info, runDir);
    const get = (f) => context[f] ?? '';
    switch (info.phase) {
        case 'PLAN_NEEDED': {
            const assignmentContent = get('execution-assignment.md');
            const goalContent = get('goal.md');
            const explicitAssignment = opts.specialists?.planner
                ? `P-TYPE: ${opts.specialists.planner}`
                : assignmentContent;
            const selection = resolvePlannerSpecialist(goalContent, explicitAssignment, frameworkRoot);
            const note = selectionNote(selection, frameworkRoot, 'P');
            return {
                phase: info.phase,
                specialist: specialistSummary('Planner', selection, frameworkRoot),
                prompt: renderPlanPrompt({
                    goalContent,
                    specialistContent: selection.specialistContent,
                    specialistSelectionNote: note,
                    planReviewContent: get('plan_review.md'),
                }),
            };
        }
        case 'BUILD_NEEDED': {
            const planContent = get('plan.md') || get('task.md');
            return {
                phase: info.phase,
                prompt: renderBuildPrompt({
                    planContent,
                    handoffContent: get('handoff.md'),
                    buildReviewContent: get('build_review.md'),
                    salvageContent: latestSalvage(runDir, 'BUILD_NEEDED'),
                }),
            };
        }
        case 'REVIEW_NEEDED': {
            const assignmentContent = get('execution-assignment.md');
            const goalContent = get('goal.md') || get('task.md');
            const explicitAssignment = opts.specialists?.critic
                ? `C-TYPE: ${opts.specialists.critic}`
                : assignmentContent;
            const selection = resolveCriticSpecialist(goalContent, explicitAssignment, frameworkRoot);
            const note = selectionNote(selection, frameworkRoot, 'C');
            return {
                phase: info.phase,
                specialist: specialistSummary('Critic', selection, frameworkRoot),
                prompt: renderReviewPrompt({
                    goalContent,
                    buildContent: get('build.md'),
                    handoffContent: get('handoff.md'),
                    specialistContent: selection.specialistContent,
                    specialistSelectionNote: note,
                    reviewReviewContent: get('review_review.md'),
                }),
            };
        }
        default:
            throw new Error(`No prompt builder defined for phase: ${info.phase}`);
    }
}
