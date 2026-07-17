import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { defaultExecTimeoutMs } from './apsf-native/native-executor.js';
import { PhaseDetector } from './apsf-native/phase-detector.js';
const SPLIT_BLOCK_RE = /```apsf-split\s+(\[[\s\S]*?\])\s+```/i;
function buildSplitPrompt(taskContent) {
    return ('You are a planning assistant for the APSF workflow.\n' +
        'The following task is too large for a single run. Split it into 2-6 smaller,\n' +
        'independently completable tasks. Each sub-task must:\n' +
        '- be completable on its own (no circular dependencies; if ordering matters, note it in the task body)\n' +
        '- have concrete Done Criteria\n' +
        '- contain at least 4 substantive body lines. Headings, empty lines, horizontal rules, and\n' +
        "  unchecked checkboxes ('- [ ] ...') do NOT count as substantive — write real prose/bullets too\n" +
        '- follow the same Markdown structure (# Task / ## What / ## Scope / ## Done Criteria)\n\n' +
        '## Original Task\n\n' +
        taskContent +
        '\n\n---\n\n' +
        'Output format: Return a short reasoning (a few lines), then EXACTLY ONE ```apsf-split``` code block\n' +
        'containing a JSON array like:\n' +
        '```apsf-split\n' +
        '[{"name": "kebab-case-short-name", "task": "# Task\\n\\n## What\\n\\n..."}]\n' +
        '```\n' +
        'The name must be short kebab-case (a-z, 0-9, hyphen). The task value is the full Markdown for task.md.\n' +
        'Do not create or modify any files.');
}
function spawnPrompt(command, args, prompt, cwd, timeoutMs) {
    return new Promise((resolve, reject) => {
        const env = { ...process.env };
        delete env.ANTHROPIC_API_KEY;
        delete env.OPENAI_API_KEY;
        const child = spawn(command, args, { cwd, shell: true, env, timeout: timeoutMs });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (d) => (stdout += d.toString()));
        child.stderr?.on('data', (d) => (stderr += d.toString()));
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, stdout, stderr }));
        child.stdin?.on('error', () => { });
        child.stdin?.write(prompt);
        child.stdin?.end();
    });
}
export function parseSplitProposals(raw) {
    const m = raw.match(SPLIT_BLOCK_RE);
    if (!m) {
        throw new Error('AI output did not contain an ```apsf-split``` JSON block.');
    }
    let arr;
    try {
        arr = JSON.parse(m[1]);
    }
    catch {
        throw new Error('apsf-split block is not valid JSON.');
    }
    if (!Array.isArray(arr) || arr.length < 2 || arr.length > 8) {
        throw new Error('apsf-split must be a JSON array of 2-8 proposals.');
    }
    return arr.map((p, i) => {
        const o = p;
        const name = String(o.name ?? '').trim().toLowerCase();
        const task = String(o.task ?? '').trim();
        if (!/^[a-z0-9][a-z0-9._-]{1,60}$/.test(name)) {
            throw new Error(`Proposal ${i + 1}: invalid name '${name}' (kebab-case a-z0-9 expected).`);
        }
        if (!task.startsWith('# Task')) {
            throw new Error(`Proposal ${i + 1} ('${name}'): task must start with '# Task'.`);
        }
        if (PhaseDetector.countMeaningfulLines(task) <= 3) {
            throw new Error(`Proposal ${i + 1} ('${name}'): task body is too thin ` +
                '(needs more than 3 meaningful lines — headings and unchecked checkboxes do not count).');
        }
        return { name, task };
    });
}
export async function proposeSplit(runDir, provider, workdir) {
    const taskPath = ['task.md', 'goal.md']
        .map((f) => path.join(runDir, f))
        .find((p) => fs.existsSync(p));
    if (!taskPath)
        throw new Error('task.md / goal.md not found — nothing to split.');
    const taskContent = fs.readFileSync(taskPath, 'utf-8');
    const prompt = buildSplitPrompt(taskContent);
    const timeoutMs = defaultExecTimeoutMs();
    const override = process.env.APSF_NATIVE_CLI_OVERRIDE;
    let res;
    if (override) {
        res = await spawnPrompt(override, [], prompt, workdir, timeoutMs);
    }
    else if (provider === 'codex') {
        res = await spawnPrompt('codex', ['exec', '--skip-git-repo-check', '-s', 'read-only', '-'], prompt, workdir, timeoutMs);
    }
    else {
        res = await spawnPrompt('claude', ['-p', '--output-format', 'text', '--no-session-persistence', '--disable-slash-commands', '--permission-mode', 'dontAsk'], prompt, workdir, timeoutMs);
    }
    if (res.code !== 0) {
        throw new Error(`split planner ${provider} exited with code ${res.code}: ${(res.stderr || res.stdout).slice(0, 300)}`);
    }
    const proposals = parseSplitProposals(res.stdout);
    fs.writeFileSync(path.join(runDir, 'split_proposal.json'), JSON.stringify({ generated_at: new Date().toISOString(), provider, proposals }, null, 2), 'utf-8');
    return { proposals, raw: res.stdout };
}
