import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { bootstrapRunState } from './run-state.js';
import { resolveRunTemplateDir } from './content-root.js';
function toOsNewlines(text) {
    return os.EOL === '\n' ? text : text.replace(/\n/g, os.EOL);
}
export const LIGHT_RUN_FILES = {
    'execution-assignment.md': '# Execution Assignment\n\n' +
        '---\n\n' +
        '## Run Name\n\n' +
        '<!-- Fill in the run name if needed. -->\n\n' +
        '## Task Summary\n\n' +
        '<!-- Summarize the task once task.md is authored. -->\n\n' +
        '---\n\n' +
        '## Role Execution Assignments\n\n' +
        '| Role    | Execution Type | Tool / Method | Notes |\n' +
        '|---------|----------------|---------------|-------|\n' +
        '| Builder | cli            | claude / codex | Main implementation |\n' +
        '| Critic  | human / cli    | Human / Codex  | Independent review |\n',
    'task.md': '# Task\n\n' +
        '## What\n\n' +
        '<!-- Write the task in 1-3 sentences. -->\n\n' +
        '## Context\n\n' +
        '<!-- Put only the minimum background and constraints here. -->\n\n' +
        '-\n\n' +
        '## Done Criteria\n\n' +
        '- [ ]\n',
    'build.md': '# Build\n\n' +
        '## What was built\n\n' +
        '<!-- Builder records the actual implementation here. -->\n\n' +
        '## Files changed\n\n' +
        '<!-- List changed or created files here. -->\n\n' +
        '## Decisions made\n\n' +
        '<!-- Record implementation decisions and reasons here. -->\n\n' +
        '## Open issues\n\n' +
        '<!-- Record unresolved issues or follow-up points here. -->\n',
    'review.md': '# Review\n\n' +
        '## Summary\n\n' +
        '<!-- PASS / CONDITIONAL PASS / FAIL -->\n\n' +
        '## Findings\n\n' +
        '<!-- Review against task.md and build.md here. -->\n\n' +
        '## Notes\n\n' +
        '<!-- Optional reviewer notes. -->\n',
};
function runParentDir(apsfRoot, taxonomy) {
    const runsDir = path.join(apsfRoot, 'runs');
    return taxonomy ? path.join(runsDir, taxonomy) : runsDir;
}
function nextRunSeq(apsfRoot, dateStr) {
    const runsDir = path.join(apsfRoot, 'runs');
    const dirs = [runsDir, path.join(runsDir, 'fw-improvement'), path.join(runsDir, 'work')];
    let maxSeq = 0;
    const re = new RegExp(`^${dateStr}-(\\d+)_`);
    for (const dir of dirs) {
        if (!fs.existsSync(dir))
            continue;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (!e.isDirectory())
                continue;
            const m = e.name.match(re);
            if (m)
                maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
        }
    }
    return maxSeq + 1;
}
function localToday() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function normalizeRunName(apsfRoot, rawName) {
    if (/^\d{4}-\d{2}-\d{2}(?:-\d+)?_/.test(rawName))
        return rawName;
    const today = localToday();
    const seq = nextRunSeq(apsfRoot, today);
    return `${today}-${String(seq).padStart(3, '0')}_${rawName}`;
}
export function startRun(apsfRoot, rawName, options = {}) {
    const runName = normalizeRunName(apsfRoot, rawName);
    const runDir = path.join(runParentDir(apsfRoot, options.taxonomy), runName);
    if (fs.existsSync(runDir)) {
        if (!options.force) {
            throw new Error(`Run directory already exists: ${runDir}`);
        }
        fs.rmSync(runDir, { recursive: true, force: true });
    }
    if (options.light) {
        fs.mkdirSync(runDir, { recursive: true });
        for (const [filename, content] of Object.entries(LIGHT_RUN_FILES)) {
            fs.writeFileSync(path.join(runDir, filename), toOsNewlines(content), 'utf-8');
        }
        bootstrapRunState(runDir, { phase: 'TASK_NEEDED', runType: 'light' });
    }
    else {
        const templateDir = resolveRunTemplateDir(apsfRoot);
        if (!fs.existsSync(templateDir)) {
            throw new Error(`Template directory not found: ${templateDir}`);
        }
        fs.cpSync(templateDir, runDir, {
            recursive: true,
            filter: (src) => !src.endsWith('.seed.json'),
        });
    }
    return runName;
}
