import * as fs from 'fs';
import * as path from 'path';
import { PHASES, PHASE_TARGET, isValidTransition, isHumanPhase } from './phases.js';
import { VENDORED_CONTENT_DIR } from './content-root.js';
const KNOWN_FILES = [
    'task.md',
    'execution-assignment.md',
    'model-assignment.md',
    'goal.md',
    'plan_review.md',
    'plan.md',
    'handoff.md',
    'build_review.md',
    'improve-plan.md',
    'build.md',
    'review.md',
    'improve_review.md',
    'improve.md',
    'verify.md',
    'result.md',
    'transcript.md',
];
export class PhaseDetector {
    constructor(runDir) {
        this.runDir = runDir;
    }
    exists(filename) {
        return fs.existsSync(path.join(this.runDir, filename));
    }
    readText(filename) {
        return fs.readFileSync(path.join(this.runDir, filename), 'utf-8');
    }
    loadRunState() {
        const p = path.join(this.runDir, 'run_state.json');
        if (!fs.existsSync(p))
            return null;
        try {
            return JSON.parse(fs.readFileSync(p, 'utf-8'));
        }
        catch {
            return null;
        }
    }
    findRunsRoot() {
        let dir = path.resolve(this.runDir);
        for (;;) {
            if (path.basename(dir) === 'runs')
                return dir;
            const parent = path.dirname(dir);
            if (parent === dir)
                return null;
            dir = parent;
        }
    }
    matchesRunTemplate(filename) {
        const filePath = path.join(this.runDir, filename);
        if (!fs.existsSync(filePath))
            return false;
        const runsRoot = this.findRunsRoot();
        if (!runsRoot)
            return false;
        const candidates = [
            path.join(runsRoot, '_template', filename),
            path.join(path.dirname(runsRoot), 'framework', 'templates', filename),
            path.join(VENDORED_CONTENT_DIR, 'runs-template', filename),
        ];
        const templatePath = candidates.find((p) => fs.existsSync(p));
        if (!templatePath)
            return false;
        try {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const templateContent = fs.readFileSync(templatePath, 'utf-8');
            if (fileContent === templateContent)
                return true;
            if (templatePath.startsWith(VENDORED_CONTENT_DIR)) {
                const norm = (s) => s.replace(/\r\n/g, '\n');
                return norm(fileContent) === norm(templateContent);
            }
            return false;
        }
        catch {
            return false;
        }
    }
    static countMeaningfulLines(text) {
        const lines = text.split(/\r?\n/);
        let count = 0;
        let inHtmlComment = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const s = line.trim();
            if (inHtmlComment) {
                if (line.includes('-->'))
                    inHtmlComment = false;
                continue;
            }
            if (s.includes('<!--')) {
                if (!s.includes('-->'))
                    inHtmlComment = true;
                continue;
            }
            if (!s)
                continue;
            if (s.startsWith('#'))
                continue;
            if (/^[-*_]{3,}$/.test(s))
                continue;
            if (/^-\s*$/.test(s))
                continue;
            if (/^-\s*\[\s*\]/.test(s))
                continue;
            if (/^-\s*(なし|none|N\/A)\s*$/i.test(s))
                continue;
            if (s.startsWith('|') && s.endsWith('|')) {
                const cells = s.slice(1, -1).split('|');
                if (cells.every((c) => /^[\s:\-=]+$/.test(c)))
                    continue;
                if (cells.every((c) => c.trim() === ''))
                    continue;
                if (i + 1 < lines.length) {
                    const nextS = lines[i + 1].trim();
                    if (nextS.startsWith('|') && nextS.endsWith('|')) {
                        const nextCells = nextS.slice(1, -1).split('|');
                        if (nextCells.every((c) => /^[\s:\-=]+$/.test(c)))
                            continue;
                    }
                }
            }
            if (/^\*\*[^*]+\*\*:?\s*$/.test(s))
                continue;
            if (/^-\s+\S{1,6}:\s*$/.test(s))
                continue;
            if (/^[`~]{3,}/.test(s))
                continue;
            if (/^（.+）$/.test(s))
                continue;
            if (/^[═─━╔╗╚╝║╠╣╦╩╬]+$/.test(s))
                continue;
            count++;
        }
        return count;
    }
    hasMarkerLine(content, marker) {
        return content.split(/\r?\n/).some((l) => l.trim() === marker);
    }
    isFilled(filename) {
        if (!this.exists(filename))
            return false;
        if (this.matchesRunTemplate(filename))
            return false;
        const content = this.readText(filename);
        if (filename === 'build.md' &&
            this.hasMarkerLine(content, '<!-- apsf-build-status: in_progress -->') &&
            !this.hasMarkerLine(content, '<!-- apsf-build-status: completed -->')) {
            return false;
        }
        if (filename === 'transcript.md') {
            return content.includes('Generated:');
        }
        return PhaseDetector.countMeaningfulLines(content) > 3;
    }
    isFilledPublic(filename) {
        return this.isFilled(filename);
    }
    hasAnyContent(filename) {
        if (!this.exists(filename))
            return false;
        if (this.matchesRunTemplate(filename))
            return false;
        return PhaseDetector.countMeaningfulLines(this.readText(filename)) > 0;
    }
    static isMeaningfulText(text) {
        return PhaseDetector.countMeaningfulLines(text) > 3;
    }
    detectAdvisory() {
        const existing = KNOWN_FILES.filter((f) => this.exists(f));
        const filled = KNOWN_FILES.filter((f) => this.isFilled(f));
        const info = (phase, nextRole, fileToWrite, filesToRead, decisionReason) => ({
            phase,
            nextRole,
            fileToWrite,
            filesToRead,
            humanOwned: isHumanPhase(phase),
            source: 'advisory',
            decisionReason,
            existingFiles: [...existing],
            filledFiles: [...filled],
        });
        const state = this.loadRunState();
        const declaredType = String(state?.run_type ?? '').trim().toLowerCase();
        const isLightRun = declaredType ? declaredType === 'light' : this.exists('task.md');
        if (isLightRun) {
            if (!this.isFilled('task.md')) {
                return info('TASK_NEEDED', 'Human', 'task.md', ['task.md'], 'light run; task.md not filled (TASK_NEEDED)');
            }
            if (!this.isFilled('build.md')) {
                return info('BUILD_NEEDED', 'Builder', 'build.md', ['task.md', ...(this.exists('build_review.md') ? ['build_review.md'] : [])], 'task.md filled; build.md not filled (light run)');
            }
            if (!this.isFilled('review.md')) {
                return info('REVIEW_NEEDED', 'Critic', 'review.md', ['task.md', 'build.md'], 'build.md filled; review.md not filled (light run)');
            }
            if (!this.isFilled('improve.md')) {
                return info('IMPROVE_NEEDED', 'Judge (Human)', 'improve.md', ['review.md', 'build.md', 'improve_review.md'], 'light run; review.md filled; improve.md not filled');
            }
            if (!this.isFilled('result.md')) {
                return info('RESULT_NEEDED', 'Human', 'result.md', ['improve.md', 'build.md', 'task.md'], 'light run; improve.md filled; result.md not filled');
            }
            return info('COMPLETE', '(none)', '(none)', [], 'All light run files filled');
        }
        if (!this.isFilled('execution-assignment.md')) {
            const anyLater = ['goal.md', 'plan.md', 'build.md', 'review.md', 'result.md']
                .some((f) => this.isFilled(f));
            if (!anyLater) {
                return info('SETUP_NEEDED', 'Human', 'execution-assignment.md', ['framework/templates/execution-assignment.md'], 'execution-assignment.md is missing or unfilled');
            }
        }
        if (!this.isFilled('goal.md')) {
            return info('GOAL_NEEDED', 'Human', 'goal.md', ['framework/templates/goal.md'], 'execution-assignment.md filled; goal.md not filled');
        }
        if (!this.isFilled('plan.md')) {
            return info('PLAN_NEEDED', 'Planner', 'plan.md', ['goal.md', 'execution-assignment.md', 'plan_review.md'], 'goal.md filled; plan.md not filled');
        }
        if (!this.isFilled('build.md')) {
            return info('BUILD_NEEDED', 'Builder', 'build.md', ['plan.md', ...(this.exists('handoff.md') ? ['handoff.md'] : []), 'build_review.md', 'execution-assignment.md'], 'plan.md filled; build.md not filled');
        }
        if (!this.isFilled('review.md')) {
            return info('REVIEW_NEEDED', 'Critic', 'review.md', ['build.md', 'plan.md', ...(this.exists('handoff.md') ? ['handoff.md'] : []), 'goal.md', 'review_review.md'], 'build.md filled; review.md not filled');
        }
        if (this.exists('improve-plan.md') && !this.isFilled('improve-plan.md')) {
            return info('IMPROVE_PLAN_OPTIONAL', 'Judge (Human)', 'improve-plan.md', ['review.md', ...(this.exists('handoff.md') ? ['handoff.md'] : []), 'build.md', 'improve_review.md'], 'review.md filled; improve-plan.md exists but not filled');
        }
        if (!this.isFilled('improve.md')) {
            return info('IMPROVE_NEEDED', 'Judge (Human)', 'improve.md', ['review.md', ...(this.exists('handoff.md') ? ['handoff.md'] : []), 'build.md', 'improve_review.md'], 'review.md filled; improve.md not filled');
        }
        if (this.exists('verify.md') && !this.isFilled('verify.md') && !this.isFilled('result.md')) {
            return info('VERIFY_OPTIONAL', 'Judge (Human)', 'verify.md', ['improve-plan.md', 'build.md', ...(this.exists('handoff.md') ? ['handoff.md'] : [])], 'improve.md filled; verify.md exists but not filled');
        }
        if (!this.isFilled('result.md')) {
            return info('RESULT_NEEDED', 'Human', 'result.md', ['improve.md', 'build.md', 'goal.md'], 'improve.md filled; result.md not filled');
        }
        if (!this.isFilled('transcript.md')) {
            return info('TRANSCRIPT_RECOMMENDED', 'Human (optional)', 'transcript.md', ['result.md', 'goal.md', 'build.md', 'review.md'], 'result.md filled; transcript.md not generated');
        }
        return info('COMPLETE', '(none)', '(none)', [], 'All required files are filled including transcript.md');
    }
    detect() {
        const advisory = this.detectAdvisory();
        const state = this.loadRunState();
        if (!state?.current_phase)
            return advisory;
        const canonical = state.current_phase;
        if (!PHASES.includes(canonical)) {
            return { ...advisory, source: 'canonical' };
        }
        if (canonical === advisory.phase) {
            return { ...advisory, source: 'canonical' };
        }
        const advisoryIsForward = isValidTransition(canonical, advisory.phase);
        const inProgress = String(state.phase_status ?? '').trim().toLowerCase() === 'in_progress';
        if (advisoryIsForward && !inProgress) {
            return { ...advisory, source: 'canonical' };
        }
        const target = PHASE_TARGET[canonical];
        return {
            ...advisory,
            phase: canonical,
            humanOwned: isHumanPhase(canonical),
            ...(target && target.file !== '(none)'
                ? { fileToWrite: target.file, nextRole: target.role }
                : {}),
            source: 'canonical',
            decisionReason: `canonical run_state.json phase (advisory=${advisory.phase})`,
        };
    }
}
export function resolveRunDir(apsfRoot, runName) {
    const candidates = [
        path.join(apsfRoot, 'runs', runName),
        path.join(apsfRoot, 'runs', 'fw-improvement', runName),
        path.join(apsfRoot, 'runs', 'work', runName),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c))
            return c;
    }
    return null;
}
