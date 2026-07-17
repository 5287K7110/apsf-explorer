import { Router } from 'express';
import { execSync } from 'child_process';
import { APSFRunBridge, PhaseFileMismatchError, AutoOwnedPhaseError, } from '../services/apsf-run-bridge.service.js';
import { ExecutionModeRouter } from '../services/execution-mode-router.js';
import { executionEvents } from '../services/event-bus.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { workdirGitDiff } from '../services/apsf-native/workdir-git.js';
import { PTYPE_TO_SPECIALIST, CTYPE_TO_SPECIALIST, } from '../services/apsf-native/specialist-registry.js';
import { proposeSplit } from '../services/split-planner.js';
import { PhaseDetector } from '../services/apsf-native/phase-detector.js';
const router = Router();
const apsfRun = new APSFRunBridge();
const modeRouter = new ExecutionModeRouter(process.env.EXECUTION_MODE || 'cli-full');
function validateExecuteSpecialists(specialists) {
    if (specialists === undefined || specialists === null)
        return null;
    if (typeof specialists !== 'object' || Array.isArray(specialists)) {
        return 'specialists must be an object with optional planner and critic fields';
    }
    const input = specialists;
    const checks = [
        { role: 'planner', value: input.planner, valid: Object.keys(PTYPE_TO_SPECIALIST).sort() },
        { role: 'critic', value: input.critic, valid: Object.keys(CTYPE_TO_SPECIALIST).sort() },
    ];
    for (const check of checks) {
        if (check.value === undefined || check.value === null)
            continue;
        if (typeof check.value !== 'string' || !check.value.trim()) {
            return `Invalid ${check.role} specialist code '${String(check.value)}'. Valid ${check.role} codes: ${check.valid.join(', ')}`;
        }
        const code = check.value.trim().toUpperCase();
        if (!check.valid.includes(code)) {
            return `Invalid ${check.role} specialist code '${check.value}'. Valid ${check.role} codes: ${check.valid.join(', ')}`;
        }
    }
    return null;
}
router.use(authenticateToken);
router.post('/:id/execute', async (req, res) => {
    try {
        const { command, provider, providers, specialists, roles, goal, context, mode } = req.body;
        const runId = req.params.id;
        if (!command || !provider) {
            res.status(400).json({
                error: 'command and provider are required',
            });
            return;
        }
        const specialistError = validateExecuteSpecialists(specialists);
        if (specialistError) {
            res.status(400).json({ error: specialistError });
            return;
        }
        const effectiveMode = mode || process.env.EXECUTION_MODE || 'cli-full';
        if (process.env.NODE_ENV === 'production' && effectiveMode !== 'apsf-run') {
            res.status(400).json({
                error: `Execution mode '${effectiveMode}' is demo/test-only. Use mode 'apsf-run' in production.`,
            });
            return;
        }
        const executeRequest = {
            runId,
            command,
            provider,
            ...(providers && typeof providers === 'object' ? { providers } : {}),
            ...(specialists && typeof specialists === 'object' ? { specialists } : {}),
            roles: roles || [],
            goal,
            context,
            mode: effectiveMode,
        };
        const executor = modeRouter.getExecutor(executeRequest);
        executor.on('event', (event) => {
            executionEvents.emit('event', event);
        });
        executor.execute(executeRequest).catch(() => {
        });
        res.json({
            runId,
            status: 'executing',
            provider,
            mode: effectiveMode,
            message: `Executing ${command} with ${provider} (mode: ${effectiveMode})`,
        });
    }
    catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.post('/:id/cancel', (req, res) => {
    try {
        const runId = req.params.id;
        apsfRun.cancelExecution(runId);
        res.json({
            runId,
            status: 'cancelled',
        });
    }
    catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.get('/queue', (req, res) => {
    res.json(apsfRun.getQueueState());
});
router.get('/apsf', (req, res) => {
    const available = apsfRun.isAvailable();
    res.json({
        available,
        apsfRoot: process.env.APSF_ROOT || null,
        runs: available ? apsfRun.listRuns() : [],
    });
});
router.post('/apsf', async (req, res) => {
    try {
        if (!apsfRun.isAvailable()) {
            res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
            return;
        }
        const { runName, light, taxonomy, workdir } = req.body || {};
        if (!runName) {
            res.status(400).json({ error: 'runName is required' });
            return;
        }
        await apsfRun.createRun(runName, {
            light: Boolean(light),
            taxonomy,
            workdir: typeof workdir === 'string' && workdir.trim() ? workdir.trim() : undefined,
        });
        const info = apsfRun.getPhaseInfo(runName);
        res.json({ runName, phase: info.phase, fileToWrite: info.fileToWrite });
    }
    catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.get('/apsf/:id/files/:filename', (req, res) => {
    try {
        if (!apsfRun.isAvailable()) {
            res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
            return;
        }
        const content = apsfRun.readPhaseFile(req.params.id, req.params.filename);
        if (content === null) {
            res.status(404).json({ error: `File not found: ${req.params.filename}` });
            return;
        }
        res.json({ runId: req.params.id, filename: req.params.filename, content });
    }
    catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.post('/apsf/:id/write-phase', async (req, res) => {
    try {
        if (!apsfRun.isAvailable()) {
            res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
            return;
        }
        const { content, filename, force, forceReason, allowAutoOwned } = req.body || {};
        if (!content || typeof content !== 'string') {
            res.status(400).json({ error: 'content (string) is required' });
            return;
        }
        const result = await apsfRun.writePhase(req.params.id, content, {
            filename: typeof filename === 'string' ? filename : undefined,
            force: Boolean(force),
            forceReason: typeof forceReason === 'string' ? forceReason : undefined,
            allowAutoOwned: Boolean(allowAutoOwned),
        });
        res.json({ runId: req.params.id, ...result });
    }
    catch (error) {
        const status = error instanceof PhaseFileMismatchError || error instanceof AutoOwnedPhaseError
            ? error.status
            : 400;
        res.status(status).json({
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.get('/apsf/:id/workdir-diff', async (req, res) => {
    try {
        if (!apsfRun.isAvailable()) {
            res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
            return;
        }
        const workdir = apsfRun.getTargetWorkdir(req.params.id);
        const diff = await workdirGitDiff(workdir);
        res.json({ runId: req.params.id, workdir, ...diff });
    }
    catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.post('/apsf/:id/split-proposal', async (req, res) => {
    try {
        if (!apsfRun.isAvailable()) {
            res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
            return;
        }
        if (apsfRun.listExecuting().length > 0) {
            res.status(409).json({ error: 'An execution is in progress. Wait for it to finish first.' });
            return;
        }
        const runDir = apsfRun.getRunDir(req.params.id);
        if (!runDir) {
            res.status(404).json({ error: `Run not found: ${req.params.id}` });
            return;
        }
        const provider = req.body?.provider === 'codex' ? 'codex' : 'claude';
        const workdir = apsfRun.getTargetWorkdir(req.params.id);
        const result = await proposeSplit(runDir, provider, workdir);
        res.json({ runId: req.params.id, provider, proposals: result.proposals });
    }
    catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.post('/apsf/:id/split-apply', async (req, res) => {
    try {
        if (!apsfRun.isAvailable()) {
            res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
            return;
        }
        const runs = req.body?.runs;
        if (!Array.isArray(runs) || runs.length === 0 || runs.length > 8) {
            res.status(400).json({ error: 'runs (array of 1-8 {name, task}) is required' });
            return;
        }
        const parentWorkdir = apsfRun.getTargetWorkdir(req.params.id);
        const today = new Date().toISOString().slice(0, 10);
        const created = [];
        const errors = [];
        for (const r of runs) {
            const name = String(r.name ?? '').trim().toLowerCase();
            if (!/^[a-z0-9][a-z0-9._-]{1,60}$/.test(name)) {
                errors.push(`invalid name: ${r.name}`);
                continue;
            }
            const runName = `${today}_${name}`;
            if (PhaseDetector.countMeaningfulLines(String(r.task ?? '')) <= 3) {
                errors.push(`${runName}: task body too thin (needs more than 3 meaningful lines — ` +
                    'headings and unchecked checkboxes do not count)');
                continue;
            }
            try {
                await apsfRun.createRun(runName, {
                    light: true,
                    taxonomy: 'work',
                    workdir: parentWorkdir !== process.env.APSF_ROOT ? parentWorkdir : undefined,
                });
                await apsfRun.writePhase(runName, String(r.task ?? ''), { filename: 'task.md' });
                created.push(runName);
            }
            catch (e) {
                errors.push(`${runName}: ${e instanceof Error ? e.message : 'failed'}`);
            }
        }
        res.json({ runId: req.params.id, created, errors });
    }
    catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.post('/apsf/:id/judge', (req, res) => {
    try {
        if (!apsfRun.isAvailable()) {
            res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
            return;
        }
        const { decision, reason } = req.body || {};
        if (!decision || typeof decision !== 'string') {
            res.status(400).json({ error: 'decision (string) is required' });
            return;
        }
        const result = apsfRun.judgeDecision(req.params.id, decision, reason);
        res.json({ runId: req.params.id, ...result });
    }
    catch (error) {
        const status = error && typeof error === 'object' && error.statusCode === 409 ? 409 : 400;
        res.status(status).json({
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.get('/apsf/:id/executions', (req, res) => {
    try {
        if (!apsfRun.isAvailable()) {
            res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
            return;
        }
        res.json({ runId: req.params.id, executions: apsfRun.listExecutions(req.params.id) });
    }
    catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.get('/apsf/:id/executions/:file', (req, res) => {
    try {
        if (!apsfRun.isAvailable()) {
            res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
            return;
        }
        const events = apsfRun.readExecution(req.params.id, req.params.file);
        if (events === null) {
            res.status(404).json({ error: `Transcript not found: ${req.params.file}` });
            return;
        }
        res.json({ runId: req.params.id, file: req.params.file, events });
    }
    catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.get('/apsf/:id/advisory', (req, res) => {
    try {
        if (!apsfRun.isAvailable()) {
            res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
            return;
        }
        const advisory = apsfRun.getAdvisory(req.params.id);
        res.json({ runId: req.params.id, advisory });
    }
    catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.get('/apsf/:id/phase', async (req, res) => {
    try {
        if (!apsfRun.isAvailable()) {
            res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
            return;
        }
        const info = apsfRun.getPhaseInfo(req.params.id);
        const meta = apsfRun.getRunStateMeta(req.params.id);
        res.json({
            runId: req.params.id,
            phase: info.phase,
            fileToWrite: info.fileToWrite,
            nextRole: info.nextRole,
            humanOwned: info.humanOwned,
            executing: apsfRun.listExecuting().includes(req.params.id),
            phaseStatus: meta.phaseStatus,
            lastError: meta.lastError,
            existingFiles: apsfRun.listArtifacts(req.params.id),
        });
    }
    catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.get('/providers', (req, res) => {
    const checkCmd = process.platform === 'win32' ? 'where' : 'which';
    const providers = ['claude', 'codex', 'gemini'].filter((cli) => {
        try {
            execSync(`${checkCmd} ${cli}`, { stdio: 'pipe' });
            return true;
        }
        catch {
            return false;
        }
    });
    res.json({
        providers,
        count: providers.length,
    });
});
router.get('/execution-modes', (req, res) => {
    const available = modeRouter.getAvailableModes();
    res.json({
        current: process.env.EXECUTION_MODE || 'cli-full',
        available,
        modes: {
            'cli-full': 'Full execution with artifact storage',
            'cli-lite': 'Lightweight execution without storage',
            'api': 'API mode (coming in v2.0)',
            'apsf-run': 'Real APSF framework (run dirs + phase detection + wrappers)',
        },
    });
});
router.post('/execution-mode', (req, res) => {
    try {
        const { mode } = req.body;
        if (!mode) {
            res.status(400).json({
                error: 'mode is required',
            });
            return;
        }
        modeRouter.setMode(mode);
        res.json({
            mode,
            message: `Execution mode changed to ${mode}`,
        });
    }
    catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
export default router;
