import { spawn, execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.TEST_PORT || 3111);
const BASE = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}`;
const wsAuthUrl = () => `${WS_URL}/?token=${encodeURIComponent(jwt.sign({ userId: 'test-user' }, JWT_SECRET))}`;
const JWT_SECRET = 'integration-test-secret';
const FIXTURE_DIR = resolve(__dirname, '__tests__/fixtures');
const APSF_ROOT_DEFAULT = 'C:/Users/PC_User/PRJ/ai-problem-solving-framework';
const results = [];
let backend;
async function test(name, fn) {
    const start = Date.now();
    try {
        await fn();
        results.push({ name, status: 'PASS', duration: Date.now() - start });
        console.log(`笨・PASS  ${name} (${Date.now() - start}ms)`);
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        results.push({ name, status: 'FAIL', duration: Date.now() - start, message });
        console.log(`笶・FAIL  ${name} 窶・${message}`);
    }
}
function assert(cond, msg) {
    if (!cond)
        throw new Error(msg);
}
function authHeader() {
    const token = jwt.sign({ userId: 'test-user' }, JWT_SECRET);
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
function startBackend() {
    return new Promise((res, reject) => {
        backend = spawn('node src/index.js', {
            cwd: __dirname,
            shell: true,
            env: {
                ...process.env,
                PORT: String(PORT),
                JWT_SECRET,
                APSF_CLI_OVERRIDE: `python "${resolve(FIXTURE_DIR, 'fake_cli.py')}"`,
                RUNS_DIR: resolve(__dirname, 'runs'),
                APSF_ROOT: process.env.APSF_ROOT || APSF_ROOT_DEFAULT,
                APSF_NATIVE_CLI_OVERRIDE: `python "${resolve(FIXTURE_DIR, 'slow_native_cli.py')}" 1`,
            },
        });
        backend.stdout?.on('data', (d) => process.env.DEBUG_BACKEND && console.log(`[backend] ${d}`));
        backend.stderr?.on('data', (d) => console.error(`[backend:err] ${d}`));
        backend.on('exit', (code) => {
            if (code !== null && code !== 0)
                console.error(`[backend] exited with code ${code}`);
        });
        const deadline = Date.now() + 15000;
        const poll = async () => {
            try {
                const r = await fetch(`${BASE}/health`);
                if (r.ok)
                    return res();
            }
            catch { }
            if (Date.now() > deadline)
                return reject(new Error('Backend did not start within 15s'));
            setTimeout(poll, 300);
        };
        poll();
    });
}
function stopBackend() {
    if (!backend || backend.pid === undefined)
        return;
    if (process.platform === 'win32') {
        try {
            execSync(`taskkill /pid ${backend.pid} /T /F`, { stdio: 'pipe' });
        }
        catch { }
    }
    else {
        backend.kill('SIGTERM');
    }
}
function waitForEvent(predicate, timeoutMs = 10000) {
    return new Promise((res, reject) => {
        const ws = new WebSocket(wsAuthUrl());
        const received = [];
        const timer = setTimeout(() => {
            ws.close();
            reject(new Error(`Timeout waiting for broadcast. Received: ${received.join(', ') || '(none)'}`));
        }, timeoutMs);
        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                received.push(msg.type);
                if (predicate(msg)) {
                    clearTimeout(timer);
                    ws.close();
                    res(msg);
                }
            }
            catch { }
        });
        ws.on('error', (err) => { clearTimeout(timer); reject(err); });
    });
}
function executeAndWaitFor(payload, predicate, timeoutMs = 10000) {
    return new Promise((res, reject) => {
        const ws = new WebSocket(wsAuthUrl());
        const received = [];
        const timer = setTimeout(() => {
            ws.close();
            reject(new Error(`Timeout waiting for event. Received: ${received.join(', ') || '(none)'}`));
        }, timeoutMs);
        ws.on('open', () => ws.send(JSON.stringify({ type: 'execute', payload })));
        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                received.push(msg.type);
                if (predicate(msg)) {
                    clearTimeout(timer);
                    ws.close();
                    res(msg);
                }
            }
            catch { }
        });
        ws.on('error', (err) => { clearTimeout(timer); reject(err); });
    });
}
async function main() {
    console.log('噫 Backend Integration Tests 窶・REAL backend/src/index.ts\n');
    const { rmSync } = await import('fs');
    rmSync(resolve(__dirname, 'runs'), { recursive: true, force: true });
    await startBackend();
    console.log(`笨・Real backend started on port ${PORT}\n`);
    await test('Backend startup: GET /health', async () => {
        const r = await fetch(`${BASE}/health`);
        const body = await r.json();
        assert(r.status === 200 && body.status === 'ok', `unexpected: ${r.status}`);
    });
    await test('Auth middleware: rejects request without token (401)', async () => {
        const r = await fetch(`${BASE}/api/runs/providers`);
        assert(r.status === 401, `expected 401, got ${r.status}`);
    });
    await test('Auth middleware: rejects invalid token (403)', async () => {
        const r = await fetch(`${BASE}/api/runs/providers`, {
            headers: { Authorization: 'Bearer invalid-token' },
        });
        assert(r.status === 403, `expected 403, got ${r.status}`);
    });
    await test('GET /api/runs/providers detects real CLIs on PATH', async () => {
        const r = await fetch(`${BASE}/api/runs/providers`, { headers: authHeader() });
        const body = await r.json();
        assert(r.status === 200, `expected 200, got ${r.status}`);
        assert(Array.isArray(body.providers), 'providers missing');
        assert(typeof body.count === 'number' && body.count === body.providers.length, 'count mismatch');
    });
    await test('GET /api/runs/execution-modes lists real CLI availability', async () => {
        const r = await fetch(`${BASE}/api/runs/execution-modes`, { headers: authHeader() });
        const body = await r.json();
        assert(r.status === 200, `expected 200, got ${r.status}`);
        assert(Array.isArray(body.available), 'available missing');
        assert(body.modes && body.current, 'modes/current missing');
    });
    await test('POST execute (CLI-FULL mode): real executor runs 竊・complete via WS', async () => {
        const wsEvents = waitForEvent((m) => m.type === 'complete' && m.runId === 'rest-full-1' && m.data?.mode === 'cli-full');
        const r = await fetch(`${BASE}/api/runs/rest-full-1/execute`, {
            method: 'POST',
            headers: authHeader(),
            body: JSON.stringify({ command: 'plan', provider: 'claude', roles: ['judge'], mode: 'cli-full' }),
        });
        const body = await r.json();
        assert(r.status === 200 && body.status === 'executing' && body.mode === 'cli-full', `unexpected: ${r.status} ${JSON.stringify(body)}`);
        const evt = await wsEvents;
        assert(evt.data.artifactCount >= 1, `artifactCount: ${evt.data.artifactCount}`);
    });
    await test('CLI-FULL mode: artifacts saved to runs/<id>/build.md', async () => {
        const { existsSync, readFileSync } = await import('fs');
        const buildPath = resolve(__dirname, 'runs/rest-full-1/build.md');
        assert(existsSync(buildPath), `${buildPath} not created`);
        const content = readFileSync(buildPath, 'utf-8');
        assert(content.includes('fake-artifact-1'), 'artifact ID missing in build.md');
    });
    await test('POST execute (CLI-LITE mode): real executor runs 竊・complete via WS', async () => {
        const wsEvents = waitForEvent((m) => m.type === 'complete' && m.runId === 'rest-lite-1' && m.data?.mode === 'cli-lite');
        const r = await fetch(`${BASE}/api/runs/rest-lite-1/execute`, {
            method: 'POST',
            headers: authHeader(),
            body: JSON.stringify({ command: 'plan', provider: 'claude', roles: ['judge'], mode: 'cli-lite', goal: 'quick check' }),
        });
        const body = await r.json();
        assert(r.status === 200 && body.mode === 'cli-lite', `unexpected: ${JSON.stringify(body)}`);
        await wsEvents;
    });
    await test('CLI-LITE mode: no artifacts saved', async () => {
        const { existsSync } = await import('fs');
        assert(!existsSync(resolve(__dirname, 'runs/rest-lite-1')), 'cli-lite should not save artifacts');
    });
    await test('WS execute (CLI-FULL mode) with failing CLI 竊・error event', async () => {
        const msg = await executeAndWaitFor({ runId: 'ws-mode-fail', provider: 'claude', command: 'plan', roles: [], mode: 'cli-full', goal: 'fail' }, (m) => m.type === 'error' && m.runId === 'ws-mode-fail');
        assert(String(msg.data.error).includes('exited with code 1'), `error: ${msg.data.error}`);
    });
    await test('API mode: returns error event (not implemented, no crash)', async () => {
        await executeAndWaitFor({ runId: 'ws-api-1', provider: 'claude', command: 'plan', roles: [], mode: 'api' }, (m) => m.type === 'error' && m.runId === 'ws-api-1');
        const r = await fetch(`${BASE}/health`);
        assert(r.ok, 'backend crashed after api-mode execution');
    });
    await test('POST execute without mode defaults to cli-full', async () => {
        const r = await fetch(`${BASE}/api/runs/rest-default-1/execute`, {
            method: 'POST',
            headers: authHeader(),
            body: JSON.stringify({ command: 'plan', provider: 'claude' }),
        });
        const body = await r.json();
        assert(r.status === 200 && body.mode === 'cli-full', `unexpected: ${JSON.stringify(body)}`);
    });
    await test('WebSocket: connection to real server', async () => {
        await new Promise((res, reject) => {
            const ws = new WebSocket(wsAuthUrl());
            const t = setTimeout(() => reject(new Error('connect timeout')), 5000);
            ws.on('open', () => { clearTimeout(t); ws.close(); res(); });
            ws.on('error', reject);
        });
    });
    await test('WS auth: no token 竊・close(4401)', async () => {
        const code = await new Promise((res, reject) => {
            const ws = new WebSocket(WS_URL);
            const t = setTimeout(() => { ws.close(); reject(new Error('not closed within 5s')); }, 5000);
            ws.on('close', (c) => { clearTimeout(t); res(c); });
            ws.on('error', reject);
        });
        assert(code === 4401, `close code: ${code}`);
    });
    await test('WS auth: invalid token 竊・close(4401)', async () => {
        const code = await new Promise((res, reject) => {
            const ws = new WebSocket(`${WS_URL}/?token=not-a-jwt`);
            const t = setTimeout(() => { ws.close(); reject(new Error('not closed within 5s')); }, 5000);
            ws.on('close', (c) => { clearTimeout(t); res(c); });
            ws.on('error', reject);
        });
        assert(code === 4401, `close code: ${code}`);
    });
    await test('WS auth: expired token 竊・close(4401)', async () => {
        const expired = jwt.sign({ userId: 'test-user' }, JWT_SECRET, { expiresIn: -60 });
        const code = await new Promise((res, reject) => {
            const ws = new WebSocket(`${WS_URL}/?token=${encodeURIComponent(expired)}`);
            const t = setTimeout(() => { ws.close(); reject(new Error('not closed within 5s')); }, 5000);
            ws.on('close', (c) => { clearTimeout(t); res(c); });
            ws.on('error', reject);
        });
        assert(code === 4401, `close code: ${code}`);
    });
    await test('WS auth: unauthenticated execute is not processed', async () => {
        const runId = `unauth-${Date.now()}`;
        const outcome = await new Promise((res) => {
            const state = { opened: false, sent: false, closeCode: 0, events: [] };
            const ws = new WebSocket(WS_URL);
            ws.on('open', () => {
                state.opened = true;
                try {
                    ws.send(JSON.stringify({
                        type: 'execute',
                        payload: { runId, provider: 'claude', command: 'plan', roles: [], mode: 'cli-full' },
                    }));
                    state.sent = true;
                }
                catch { }
            });
            ws.on('message', (raw) => {
                try {
                    state.events.push(JSON.parse(raw.toString()).type);
                }
                catch { }
            });
            ws.on('close', (code) => { state.closeCode = code; res(state); });
            ws.on('error', () => res(state));
        });
        assert(outcome.closeCode === 4401, `close code: ${outcome.closeCode}`);
        assert(outcome.events.length === 0, `events leaked to unauthenticated socket: ${outcome.events.join(',')}`);
        await new Promise((r2) => setTimeout(r2, 1500));
        const { existsSync } = await import('fs');
        assert(!existsSync(resolve(__dirname, 'runs', runId)), 'unauthenticated execute was processed!');
        const health = await fetch(`${BASE}/health`);
        assert(health.ok, 'backend crashed on unauthenticated execute');
    });
    await test('WebSocket: execute 竊・execution-start event', async () => {
        const msg = await executeAndWaitFor({ runId: 'ws-run-1', provider: 'claude', command: 'plan', roles: ['judge'] }, (m) => m.type === 'execution-start' && m.runId === 'ws-run-1');
        assert(msg.provider === 'claude', 'provider mismatch');
    });
    await test('WebSocket: real python process 竊・progress event (default mode)', async () => {
        const msg = await executeAndWaitFor({ runId: 'ws-run-2', provider: 'claude', command: 'plan', roles: ['judge'] }, (m) => m.type === 'progress' && m.runId === 'ws-run-2');
        assert(msg.data && msg.data.mode === 'cli-full', `progress data.mode: ${msg.data?.mode}`);
    });
    await test('WebSocket: real python exit 0 竊・complete event', async () => {
        const msg = await executeAndWaitFor({ runId: 'ws-run-3', provider: 'claude', command: 'plan', roles: ['judge'] }, (m) => m.type === 'complete' && m.runId === 'ws-run-3');
        assert(msg.data.exitCode === 0, `exitCode: ${msg.data.exitCode}`);
    });
    await test('WebSocket: real python exit 1 竊・error event (no crash)', async () => {
        const msg = await executeAndWaitFor({ runId: 'ws-run-4', provider: 'claude', command: 'plan', roles: ['judge'], goal: 'fail' }, (m) => m.type === 'error' && m.runId === 'ws-run-4');
        assert(msg.data.error, 'error payload missing');
        const r = await fetch(`${BASE}/health`);
        assert(r.ok, 'backend crashed after failing execution');
    });
    await test('WebSocket: invalid JSON message 竊・error response', async () => {
        await new Promise((res, reject) => {
            const ws = new WebSocket(wsAuthUrl());
            const t = setTimeout(() => { ws.close(); reject(new Error('no error response')); }, 5000);
            ws.on('open', () => ws.send('this is not json'));
            ws.on('message', (raw) => {
                const msg = JSON.parse(raw.toString());
                if (msg.type === 'error') {
                    clearTimeout(t);
                    ws.close();
                    res();
                }
            });
            ws.on('error', reject);
        });
    });
    await test('WebSocket: concurrent executions both complete', async () => {
        const [a, b] = await Promise.all([
            executeAndWaitFor({ runId: 'conc-1', provider: 'claude', command: 'plan', roles: [] }, (m) => m.type === 'complete' && m.runId === 'conc-1'),
            executeAndWaitFor({ runId: 'conc-2', provider: 'claude', command: 'plan', roles: [] }, (m) => m.type === 'complete' && m.runId === 'conc-2'),
        ]);
        assert(a.runId === 'conc-1' && b.runId === 'conc-2', 'runId mismatch');
    });
    await test('ExecutionModeRouter: returns real executor per mode', async () => {
        const { ExecutionModeRouter } = await import('./src/services/execution-mode-router.js');
        const router = new ExecutionModeRouter('cli-full');
        const full = router.getExecutor({ runId: 'r', command: 'c', provider: 'claude', roles: [], mode: 'cli-full' });
        const lite = router.getExecutor({ runId: 'r', command: 'c', provider: 'claude', roles: [], mode: 'cli-lite' });
        assert(full.constructor.name === 'CLIFullExecutor', `got ${full.constructor.name}`);
        assert(lite.constructor.name === 'CLILiteExecutor', `got ${lite.constructor.name}`);
        let threw = false;
        try {
            router.setMode('bogus');
        }
        catch {
            threw = true;
        }
        assert(threw, 'setMode(bogus) should throw');
    });
    const { existsSync: apsfExists } = await import('fs');
    const apsfRoot = process.env.APSF_ROOT || APSF_ROOT_DEFAULT;
    if (apsfExists(resolve(apsfRoot, 'runs'))) {
        let knownRun = '';
        await test('APSF: GET /api/runs/apsf lists real framework runs', async () => {
            const r = await fetch(`${BASE}/api/runs/apsf`, { headers: authHeader() });
            const body = await r.json();
            assert(r.status === 200 && body.available === true, `unexpected: ${JSON.stringify(body).slice(0, 200)}`);
            assert(Array.isArray(body.runs) && body.runs.length > 0, 'no runs found');
            assert(body.runs.every((n) => /^\d{4}-\d{2}-\d{2}/.test(n)), 'non-run entry in list');
            knownRun = body.runs[body.runs.length - 1];
        });
        await test('APSF: GET /api/runs/apsf/:id/phase runs real `apsf next`', async () => {
            assert(knownRun, 'no known run from previous test');
            const r = await fetch(`${BASE}/api/runs/apsf/${encodeURIComponent(knownRun)}/phase`, {
                headers: authHeader(),
            });
            const body = await r.json();
            assert(r.status === 200, `status ${r.status}: ${JSON.stringify(body).slice(0, 200)}`);
            assert(/^[A-Z_]+$/.test(body.phase), `unexpected phase: ${body.phase}`);
        });
        await test('APSF: execute (apsf-run mode) with nonexistent run 竊・error event', async () => {
            const msg = await executeAndWaitFor({ runId: 'no-such-run-xyz', provider: 'claude', command: 'plan', roles: [], mode: 'apsf-run' }, (m) => m.type === 'error' && m.runId === 'no-such-run-xyz', 30000);
            assert(msg.data.error, 'error payload missing');
            const r = await fetch(`${BASE}/health`);
            assert(r.ok, 'backend crashed after apsf-run error');
        });
        await test('APSF: execution-modes lists apsf-run as available', async () => {
            const r = await fetch(`${BASE}/api/runs/execution-modes`, { headers: authHeader() });
            const body = await r.json();
            assert(body.available.includes('apsf-run'), `available: ${JSON.stringify(body.available)}`);
        });
        await test('APSF: GET files/:filename reads real phase file', async () => {
            assert(knownRun, 'no known run');
            const r = await fetch(`${BASE}/api/runs/apsf/${encodeURIComponent(knownRun)}/files/task.md`, { headers: authHeader() });
            assert(r.status === 200 || r.status === 404, `unexpected status ${r.status}`);
            if (r.status === 200) {
                const body = await r.json();
                assert(typeof body.content === 'string' && body.content.length > 0, 'empty content');
            }
        });
        await test('APSF: files endpoint rejects non-whitelisted filename (400)', async () => {
            const r = await fetch(`${BASE}/api/runs/apsf/${encodeURIComponent(knownRun)}/files/run_state.json`, { headers: authHeader() });
            assert(r.status === 400, `expected 400, got ${r.status}`);
        });
        await test('APSF: GET advisory returns judge_advisory.json when present', async () => {
            const r = await fetch(`${BASE}/api/runs/apsf/2026-07-05-902_work_explorer-native-smoke/advisory`, { headers: authHeader() });
            if (r.status === 200) {
                const body = await r.json();
                assert(body.advisory === null || typeof body.advisory.recommendation === 'string', `unexpected advisory: ${JSON.stringify(body).slice(0, 150)}`);
            }
            else {
                assert(r.status === 400, `unexpected status ${r.status}`);
            }
        });
        await test('APSF: POST create run 竊・TASK_NEEDED 竊・write-phase advances phase', async () => {
            const tmpRun = '2026-07-05-999_work_explorer-api-test';
            const { rmSync: rmRun, existsSync: runExists } = await import('fs');
            const tmpDir = resolve(apsfRoot, 'runs/work', tmpRun);
            rmRun(tmpDir, { recursive: true, force: true });
            try {
                const create = await fetch(`${BASE}/api/runs/apsf`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({ runName: tmpRun, light: true, taxonomy: 'work' }),
                });
                const created = await create.json();
                assert(create.status === 200, `create failed: ${JSON.stringify(created).slice(0, 200)}`);
                assert(created.phase === 'TASK_NEEDED', `phase after create: ${created.phase}`);
                const write = await fetch(`${BASE}/api/runs/apsf/${tmpRun}/write-phase`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({
                        content: '# Task\n\n## What\n\nAPI 邨檎罰縺ｮ write-phase 讀懆ｨｼ縲ゅム繝溘・繧ｿ繧ｹ繧ｯ縲・n\n' +
                            '## Context\n\n- API 繝・せ繝育畑縺ｮ荳譎・run\n- 螳溯｡後・縺励↑縺Ыn\n' +
                            '## Done Criteria\n\n- [x] task.md 縺・API 邨檎罰縺ｧ菫晏ｭ倥＆繧後ｋ\n',
                    }),
                });
                const written = await write.json();
                assert(write.status === 200, `write failed: ${JSON.stringify(written).slice(0, 200)}`);
                assert(written.fileWritten === 'task.md', `fileWritten: ${written.fileWritten}`);
                assert(written.phase === 'BUILD_NEEDED', `phase after write: ${written.phase}`);
            }
            finally {
                rmRun(tmpDir, { recursive: true, force: true });
                assert(!runExists(tmpDir), 'cleanup failed');
            }
        });
        await test('APSF: create run rejects invalid name (400)', async () => {
            const r = await fetch(`${BASE}/api/runs/apsf`, {
                method: 'POST',
                headers: authHeader(),
                body: JSON.stringify({ runName: '../evil', light: true }),
            });
            assert(r.status === 400, `expected 400, got ${r.status}`);
        });
        await test('APSF: double execution of same run is rejected', async () => {
            const { APSFRunBridge } = await import('./src/services/apsf-run-bridge.service.js');
            const { rmSync: rmRun } = await import('fs');
            process.env.APSF_ROOT = apsfRoot;
            const bridge = new APSFRunBridge();
            const events = [];
            bridge.on('event', (e) => events.push(e));
            const tmpRun = '2026-07-05-998_work_explorer-guard-test';
            const tmpDir = resolve(apsfRoot, 'runs/work', tmpRun);
            rmRun(tmpDir, { recursive: true, force: true });
            await bridge.createRun(tmpRun, { light: true, taxonomy: 'work' });
            await bridge.writePhase(tmpRun, '# Task\n\n## What\n\n莠碁㍾螳溯｡後ぎ繝ｼ繝峨・讀懆ｨｼ逕ｨ繝繝溘・縲・n\n' +
                '## Context\n\n- 繝・せ繝育畑荳譎・run\n- AI 螳溯｡後・縺励↑縺・ｼ・ryRun 縺ｮ縺ｿ・噂n\n' +
                '## Done Criteria\n\n- [x] 繧ｬ繝ｼ繝峨′讖溯・縺吶ｋ\n');
            try {
                const first = bridge.execute({
                    runId: tmpRun, command: 'build', provider: 'claude', roles: [], mode: 'apsf-run',
                    context: { dryRun: true },
                });
                const second = bridge.execute({
                    runId: tmpRun, command: 'build', provider: 'claude', roles: [], mode: 'apsf-run',
                    context: { dryRun: true },
                });
                await Promise.all([first, second]);
                const rejection = events.find((e) => e.type === 'error' && String(e.data?.error).includes('already executing'));
                assert(rejection, `no double-execution rejection. events: ${events.map((e) => e.type).join(',')}`);
                const deadline = Date.now() + 5000;
                while (!events.some((e) => e.type === 'complete') && Date.now() < deadline) {
                    await new Promise((r) => setTimeout(r, 50));
                }
                const completed = events.find((e) => e.type === 'complete');
                assert(completed, `first execution did not complete. events: ${events.map((e) => e.type).join(',')}`);
            }
            finally {
                rmRun(tmpDir, { recursive: true, force: true });
            }
        });
        const REVIEW_WITH_ADVISORY = '# Review\n\n## Findings\n\n- 邨ｱ蜷医ユ繧ｹ繝育畑縺ｮ繝ｬ繝薙Η繝ｼ譛ｬ譁・・n- 螳・write-phase 邨檎罰縺ｧ菫晏ｭ倥＆繧後ｋ縲・n\n' +
            '## Assessment\n\n- 蛻､螳壹・繝・せ繝医す繝翫Μ繧ｪ縺ｫ蠢懊§縺ｦ Judge 縺瑚｣∝ｮ壹☆繧九・n\n' +
            '```apsf-judge-advisory\n{"recommendation": "Return to Build", "human_owned_blocker": false}\n```\n';
        const TEST_BUILD_MD = '# Build\n\n## Work Done\n\n- 繝・せ繝育畑縺ｮ繝繝溘・謌先棡迚ｩ繧剃ｽ懈・縺励◆縲・n- 螳溯｣・・蟄伜惠縺励↑縺・ｼ郁｣∝ｮ壽､懆ｨｼ逕ｨ・峨・n\n' +
            '## Notes\n\n- Judge 陬∝ｮ壹ユ繧ｹ繝医・蜑肴ｮｵ繝輔ぉ繝ｼ繧ｺ縲・n- write-phase 邨檎罰縺ｧ REVIEW_NEEDED 縺ｸ驕ｷ遘ｻ縺吶ｋ縲・n';
        async function writePhaseApi(runName, file, content) {
            const w = await fetch(`${BASE}/api/runs/apsf/${runName}/write-phase`, {
                method: 'POST',
                headers: authHeader(),
                body: JSON.stringify({ content, allowAutoOwned: true }),
            });
            const body = await w.json();
            assert(w.status === 200, `write ${file} failed: ${JSON.stringify(body).slice(0, 200)}`);
        }
        async function phaseOf(runName) {
            const p = await fetch(`${BASE}/api/runs/apsf/${runName}/phase`, { headers: authHeader() });
            return (await p.json()).phase;
        }
        async function driveToImprove(runName, opts = { light: true }) {
            const create = await fetch(`${BASE}/api/runs/apsf`, {
                method: 'POST',
                headers: authHeader(),
                body: JSON.stringify({ runName, light: opts.light, taxonomy: 'work' }),
            });
            assert(create.status === 200, `create failed: ${await create.text()}`);
            const writes = opts.light
                ? [
                    ['task.md',
                        '# Task\n\n## What\n\nJudge 陬∝ｮ壹・邨ｱ蜷医ユ繧ｹ繝育畑 run縲・n\n' +
                            '## Context\n\n- 3 邨瑚ｷｯ・・ccept/Return to Build/Return to Plan・峨・讀懆ｨｼ\n- 螳溘ヵ繧ｧ繝ｼ繧ｺ驕ｷ遘ｻ繧帝壹☆\n\n' +
                            '## Done Criteria\n\n- [x] IMPROVE_NEEDED 縺ｫ蛻ｰ驕斐☆繧欺n'],
                ]
                : [
                    ['execution-assignment.md',
                        '# Execution Assignment\n\n## Roles\n\n- Planner: 繝・せ繝・n- Builder: 繝・せ繝・n- Critic: 繝・せ繝・n- Judge: 繝・せ繝・n'],
                    ['goal.md',
                        '# Goal\n\n## Goal Statement\n\nJudge 陬∝ｮ夲ｼ・eturn to Plan・峨・ heavy run 邨ｱ蜷医ユ繧ｹ繝医・n\n' +
                            '## Success Criteria\n\n- PLAN_NEEDED 縺ｸ蟾ｮ縺玲綾縺帙ｋ\n- plan_review.md 縺ｫ逅・罰縺梧ｮ九ｋ\n- 荳区ｵ∵・譫懃黄縺碁驕ｿ縺輔ｌ繧欺n'],
                    ['plan.md',
                        '# Plan\n\n## Approach\n\n- 繝・せ繝育畑縺ｮ繝繝溘・險育判縲・n- 螳溯｣・・縺励↑縺・・n\n' +
                            '## Steps\n\n- 繝繝溘・ build 繧呈嶌縺十n- 繝繝溘・ review 繧呈嶌縺十n'],
                ];
            writes.push(['build.md', TEST_BUILD_MD], ['review.md', REVIEW_WITH_ADVISORY]);
            for (const [file, content] of writes) {
                await writePhaseApi(runName, file, content);
            }
            assert((await phaseOf(runName)) === 'IMPROVE_NEEDED', 'did not reach IMPROVE_NEEDED');
        }
        const judgeRuns = {
            build: '2026-07-05-991_work_explorer-judge-build-test',
            plan: '2026-07-05-992_work_explorer-judge-plan-test',
            accept: '2026-07-05-993_work_explorer-judge-accept-test',
        };
        const { rmSync: rmJudgeRun, readFileSync: readJudgeFile, existsSync: judgeFileExists } = await import('fs');
        const rmJudgeRuns = () => {
            for (const name of Object.values(judgeRuns)) {
                rmJudgeRun(resolve(apsfRoot, 'runs/work', name), { recursive: true, force: true });
            }
        };
        rmJudgeRuns();
        try {
            await test('APSF Judge: Return to Build 竊・BUILD_NEEDED + build_review.md + 荳区ｵ・驕ｿ', async () => {
                await driveToImprove(judgeRuns.build);
                const r = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.build}/judge`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({ decision: 'Return to Build', reason: '繝薙Ν繝峨・讀懆ｨｼ謇矩・′荳崎ｶｳ縺励※縺・ｋ縺溘ａ蟾ｮ縺玲綾縺吶・ }),
                });
                const body = await r.json();
                assert(r.status === 200, `judge failed: ${JSON.stringify(body).slice(0, 200)}`);
                assert(body.phaseAfter === 'BUILD_NEEDED', `phaseAfter: ${body.phaseAfter}`);
                assert(body.reasonFile === 'build_review.md', `reasonFile: ${body.reasonFile}`);
                assert(body.matchesAdvisory === true, `matchesAdvisory: ${body.matchesAdvisory}`);
                const runDir = resolve(apsfRoot, 'runs/work', judgeRuns.build);
                const reviewPath = resolve(runDir, 'build_review.md');
                assert(judgeFileExists(reviewPath), 'build_review.md not created');
                const content = readJudgeFile(reviewPath, 'utf-8');
                assert(content.includes('繝薙Ν繝峨・讀懆ｨｼ謇矩・′荳崎ｶｳ'), 'reason missing in build_review.md');
                assert(content.includes('Return to Build'), 'decision missing in build_review.md');
                assert(Array.isArray(body.supersededFiles) && body.supersededFiles.length === 2, `supersededFiles: ${JSON.stringify(body.supersededFiles)}`);
                assert(!judgeFileExists(resolve(runDir, 'build.md')), 'stale build.md not superseded');
                assert(!judgeFileExists(resolve(runDir, 'review.md')), 'stale review.md not superseded');
                assert(!judgeFileExists(resolve(runDir, 'judge_advisory.json')), 'stale judge_advisory.json not removed');
                for (const f of body.supersededFiles) {
                    assert(judgeFileExists(resolve(runDir, f)), `superseded file missing: ${f}`);
                }
                assert((await phaseOf(judgeRuns.build)) === 'BUILD_NEEDED', 'detected phase is not BUILD_NEEDED');
            });
            await test('APSF Judge: 蟾ｮ縺玲綾縺怜ｾ後↓繝ｫ繝ｼ繝励′螳瑚ｵｰ縺吶ｋ・亥・ BUILD 竊・蜀・REVIEW 竊・IMPROVE・・, async () => {
                await writePhaseApi(judgeRuns.build, 'build.md (round 2)', TEST_BUILD_MD);
                assert((await phaseOf(judgeRuns.build)) === 'REVIEW_NEEDED', 'rebuild did not reach REVIEW_NEEDED');
                await writePhaseApi(judgeRuns.build, 'review.md (round 2)', REVIEW_WITH_ADVISORY);
                assert((await phaseOf(judgeRuns.build)) === 'IMPROVE_NEEDED', 're-review did not reach IMPROVE_NEEDED');
                const advisoryPath = resolve(apsfRoot, 'runs/work', judgeRuns.build, 'judge_advisory.json');
                assert(judgeFileExists(advisoryPath), 'judge_advisory.json not regenerated after re-review');
            });
            await test('APSF Judge: repeated judge call after loop closes 竊・200 then 409 at BUILD', async () => {
                const again = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.build}/judge`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({ decision: 'Return to Build', reason: '2 蜻ｨ逶ｮ縺ｮ蟾ｮ縺玲綾縺玲､懆ｨｼ縲ら炊逕ｱ縺ｯ蜑榊屓縺ｨ蜷御ｸ繝輔ぃ繧､繝ｫ縺ｫ霑ｽ險倥＆繧後ｋ縲・ }),
                });
                const body = await again.json();
                assert(again.status === 200, `second judge failed: ${JSON.stringify(body).slice(0, 200)}`);
                const content = readJudgeFile(resolve(apsfRoot, 'runs/work', judgeRuns.build, 'build_review.md'), 'utf-8');
                assert(content.includes('繝薙Ν繝峨・讀懆ｨｼ謇矩・′荳崎ｶｳ') && content.includes('2 蜻ｨ逶ｮ縺ｮ蟾ｮ縺玲綾縺玲､懆ｨｼ'), 'build_review.md should accumulate both decisions');
                const r = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.build}/judge`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({ decision: 'Return to Build', reason: '莠碁㍾陬∝ｮ壹・讀懆ｨｼ縲・ }),
                });
                assert(r.status === 409, `expected 409, got ${r.status}`);
            });
            await test('APSF Judge: Return to Plan (heavy) 竊・PLAN_NEEDED + plan_review.md + 荳区ｵ・驕ｿ', async () => {
                await driveToImprove(judgeRuns.plan, { light: false });
                const r = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.plan}/judge`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({ decision: 'Return to Plan', reason: '險育判縺ｮ蜑肴署縺悟ｴｩ繧後※縺・ｋ縺溘ａ險育判縺九ｉ繧・ｊ逶ｴ縺吶・ }),
                });
                const body = await r.json();
                assert(r.status === 200, `judge failed: ${JSON.stringify(body).slice(0, 200)}`);
                assert(body.phaseAfter === 'PLAN_NEEDED', `phaseAfter: ${body.phaseAfter}`);
                assert(body.reasonFile === 'plan_review.md', `reasonFile: ${body.reasonFile}`);
                assert(body.matchesAdvisory === false, `matchesAdvisory: ${body.matchesAdvisory}`);
                const runDir = resolve(apsfRoot, 'runs/work', judgeRuns.plan);
                assert(judgeFileExists(resolve(runDir, 'plan_review.md')), 'plan_review.md not created');
                assert(readJudgeFile(resolve(runDir, 'plan_review.md'), 'utf-8').includes('險育判縺ｮ蜑肴署縺悟ｴｩ繧後※縺・ｋ'), 'reason missing');
                assert(body.supersededFiles.length === 3, `supersededFiles: ${JSON.stringify(body.supersededFiles)}`);
                for (const f of ['plan.md', 'build.md', 'review.md']) {
                    assert(!judgeFileExists(resolve(runDir, f)), `stale ${f} not superseded`);
                }
                assert((await phaseOf(judgeRuns.plan)) === 'PLAN_NEEDED', 'detected phase is not PLAN_NEEDED');
            });
            await test('APSF Judge: light run 縺ｸ縺ｮ Return to Plan 竊・400・・lan 繝輔ぉ繝ｼ繧ｺ縺ｪ縺暦ｼ・, async () => {
                await driveToImprove(judgeRuns.accept);
                const r = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.accept}/judge`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({ decision: 'Return to Plan', reason: 'light run 縺ｧ縺ｯ諡貞凄縺輔ｌ繧九・縺壹・ }),
                });
                assert(r.status === 400, `expected 400, got ${r.status}`);
                assert((await phaseOf(judgeRuns.accept)) === 'IMPROVE_NEEDED', 'phase changed despite 400');
            });
            await test('APSF Judge: Return without reason 竊・400', async () => {
                const r = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.accept}/judge`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({ decision: 'Return to Build' }),
                });
                assert(r.status === 400, `expected 400, got ${r.status}`);
                const p = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.accept}/phase`, { headers: authHeader() });
                assert((await p.json()).phase === 'IMPROVE_NEEDED', 'phase changed despite 400');
            });
            await test('APSF Judge: Accept 竊・no transition, improve.md write 竊・RESULT_NEEDED', async () => {
                const r = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.accept}/judge`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({ decision: 'Accept' }),
                });
                const body = await r.json();
                assert(r.status === 200, `judge failed: ${JSON.stringify(body).slice(0, 200)}`);
                assert(body.phaseAfter === 'IMPROVE_NEEDED', `Accept should not transition: ${body.phaseAfter}`);
                const eventsPath = resolve(apsfRoot, 'runs/work', judgeRuns.accept, 'session_events.jsonl');
                assert(judgeFileExists(eventsPath), 'session_events.jsonl not created');
                const events = readJudgeFile(eventsPath, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
                assert(events.some((e) => e.event_type === 'judge_decision' && e.payload?.decision === 'Accept'), 'judge_decision Accept event not recorded');
                const w = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.accept}/write-phase`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({
                        content: '# Improve\n\n## Decision\n\n- Accept・育ｵｱ蜷医ユ繧ｹ繝茨ｼ峨・n\n' +
                            '## Notes\n\n- 陬∝ｮ・Accept 邨瑚ｷｯ縺ｮ讀懆ｨｼ縲・n- 霑ｽ蜉謾ｹ蝟・・荳崎ｦ√・n- write-phase 邨檎罰縺ｧ RESULT_NEEDED 縺ｸ驕ｷ遘ｻ縺吶ｋ縲・n',
                    }),
                });
                const written = await w.json();
                assert(w.status === 200, `improve write failed: ${JSON.stringify(written).slice(0, 200)}`);
                assert(written.phase === 'RESULT_NEEDED', `phase after improve: ${written.phase}`);
            });
            await test('APSF Judge: invalid decision 竊・400', async () => {
                const r = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.build}/judge`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({ decision: 'Reject Everything', reason: 'x' }),
                });
                assert(r.status === 400, `expected 400, got ${r.status}`);
            });
        }
        finally {
            rmJudgeRuns();
        }
        const crashRuns = {
            auto: '2026-07-05-994_work_explorer-crash-auto-test',
            human: '2026-07-05-995_work_explorer-crash-human-test',
            kill: '2026-07-05-996_work_explorer-crash-kill-test',
        };
        const { writeFileSync: writeCrashFile } = await import('fs');
        const rmCrashRuns = () => {
            for (const name of Object.values(crashRuns)) {
                rmJudgeRun(resolve(apsfRoot, 'runs/work', name), { recursive: true, force: true });
            }
        };
        rmCrashRuns();
        const TASK_MD = '# Task\n\n## What\n\n繧ｯ繝ｩ繝・す繝･蝗槫ｾｩ縺ｮ邨ｱ蜷医ユ繧ｹ繝育畑 run縲・n\n' +
            '## Context\n\n- executor_state.json 繝槭・繧ｫ繝ｼ縺ｮ蝗槫ｾｩ蜍穂ｽ懊ｒ讀懆ｨｼ\n- AI 螳溯｡後・縺励↑縺Ыn\n' +
            '## Done Criteria\n\n- [x] 蝗槫ｾｩ蜍穂ｽ懊′讀懆ｨｼ縺輔ｌ繧欺n';
        async function createLightRun(runName, toBuild) {
            const create = await fetch(`${BASE}/api/runs/apsf`, {
                method: 'POST',
                headers: authHeader(),
                body: JSON.stringify({ runName, light: true, taxonomy: 'work' }),
            });
            assert(create.status === 200, `create failed: ${await create.text()}`);
            if (toBuild)
                await writePhaseApi(runName, 'task.md', TASK_MD);
        }
        try {
            await test('Crash recovery: AUTO 繝輔ぉ繝ｼ繧ｺ縺ｮ stale 繝槭・繧ｫ繝ｼ 竊・failed + last_error', async () => {
                await createLightRun(crashRuns.auto, true);
                const runDir = resolve(apsfRoot, 'runs/work', crashRuns.auto);
                writeCrashFile(resolve(runDir, 'executor_state.json'), JSON.stringify({
                    runId: crashRuns.auto, pid: 99999, phase: 'BUILD_NEEDED', startedAt: '2026-07-08T00:00:00Z',
                }));
                const { recoverOrphanedRuns } = await import('./src/services/apsf-native/recovery.js');
                const recovered = recoverOrphanedRuns(apsfRoot);
                const entry = recovered.find((r) => r.runId === crashRuns.auto);
                assert(entry && entry.action === 'marked_failed', `recovered: ${JSON.stringify(recovered)}`);
                assert(!judgeFileExists(resolve(runDir, 'executor_state.json')), 'marker not removed');
                const p = await fetch(`${BASE}/api/runs/apsf/${crashRuns.auto}/phase`, { headers: authHeader() });
                const info = await p.json();
                assert(info.phase === 'BUILD_NEEDED', `phase: ${info.phase}`);
                assert(info.phaseStatus === 'failed', `phaseStatus: ${info.phaseStatus}`);
                assert(String(info.lastError).includes('pid=99999'), `lastError: ${info.lastError}`);
            });
            await test('Crash recovery: human 繝輔ぉ繝ｼ繧ｺ縺ｮ stale 繝槭・繧ｫ繝ｼ 竊・髯､蜴ｻ縺ｮ縺ｿ・郁ｪ､ failed 蛹悶＠縺ｪ縺・ｼ・, async () => {
                await createLightRun(crashRuns.human, false);
                const runDir = resolve(apsfRoot, 'runs/work', crashRuns.human);
                writeCrashFile(resolve(runDir, 'executor_state.json'), JSON.stringify({
                    runId: crashRuns.human, pid: 99999, phase: 'BUILD_NEEDED', startedAt: '2026-07-08T00:00:00Z',
                }));
                const { recoverOrphanedRuns } = await import('./src/services/apsf-native/recovery.js');
                const recovered = recoverOrphanedRuns(apsfRoot);
                const entry = recovered.find((r) => r.runId === crashRuns.human);
                assert(entry && entry.action === 'marker_removed', `recovered: ${JSON.stringify(recovered)}`);
                assert(!judgeFileExists(resolve(runDir, 'executor_state.json')), 'marker not removed');
                const p = await fetch(`${BASE}/api/runs/apsf/${crashRuns.human}/phase`, { headers: authHeader() });
                const info = await p.json();
                assert(info.phaseStatus !== 'failed', `human run wrongly failed: ${info.phaseStatus}`);
            });
            await test('Crash recovery: executor 豁｣蟶ｸ邉ｻ縺ｯ繝槭・繧ｫ繝ｼ繧呈ｮ九＆縺ｪ縺・ｼ・uman 蛛懈ｭ｢繝ｫ繝ｼ繝暦ｼ・, async () => {
                const { NativeApsfExecutor } = await import('./src/services/apsf-native/native-executor.js');
                const executor = new NativeApsfExecutor(apsfRoot);
                const result = await executor.executeLoop({ runId: crashRuns.human, provider: 'claude' });
                assert(result.stopReason === 'human_phase', `stopReason: ${result.stopReason}`);
                const runDir = resolve(apsfRoot, 'runs/work', crashRuns.human);
                assert(!judgeFileExists(resolve(runDir, 'executor_state.json')), 'marker left behind');
            });
            await test('Crash recovery: 螳溯｡御ｸｭ縺ｮ backend 繧・kill -9 逶ｸ蠖薙〒蠑ｷ蛻ｶ邨ゆｺ・竊・蜀崎ｵｷ蜍輔〒蝗槫ｾｩ', async () => {
                const KILL_PORT = PORT + 50;
                await createLightRun(crashRuns.kill, true);
                const runDir = resolve(apsfRoot, 'runs/work', crashRuns.kill);
                const markerPath = resolve(runDir, 'executor_state.json');
                const spawnBackend = () => new Promise((res2, rej2) => {
                    const child = spawn('node src/index.js', {
                        cwd: __dirname,
                        shell: true,
                        env: {
                            ...process.env,
                            PORT: String(KILL_PORT),
                            JWT_SECRET,
                            APSF_ROOT: apsfRoot,
                            APSF_NATIVE_CLI_OVERRIDE: `python "${resolve(FIXTURE_DIR, 'slow_native_cli.py')}" 120`,
                        },
                    });
                    const deadline = Date.now() + 15000;
                    const poll = async () => {
                        try {
                            const r = await fetch(`http://localhost:${KILL_PORT}/health`);
                            if (r.ok)
                                return res2(child);
                        }
                        catch { }
                        if (Date.now() > deadline)
                            return rej2(new Error('kill-test backend did not start'));
                        setTimeout(poll, 300);
                    };
                    poll();
                });
                const b2 = await spawnBackend();
                const exec = await fetch(`http://localhost:${KILL_PORT}/api/runs/${crashRuns.kill}/execute`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({ command: 'build', provider: 'claude', roles: [], mode: 'apsf-run' }),
                });
                assert(exec.status === 200, `execute failed: ${await exec.text()}`);
                const markerDeadline = Date.now() + 10000;
                while (!judgeFileExists(markerPath)) {
                    assert(Date.now() < markerDeadline, 'executor did not write its own marker within 10s');
                    await new Promise((r) => setTimeout(r, 200));
                }
                const marker = JSON.parse(readJudgeFile(markerPath, 'utf-8'));
                assert(marker.phase === 'BUILD_NEEDED' && marker.pid && marker.startedAt, `marker schema: ${JSON.stringify(marker)}`);
                if (process.platform === 'win32') {
                    execSync(`taskkill /pid ${b2.pid} /T /F`, { stdio: 'pipe' });
                }
                else {
                    b2.kill('SIGKILL');
                }
                assert(judgeFileExists(markerPath), 'marker should survive the kill');
                const b3 = await spawnBackend();
                try {
                    assert(!judgeFileExists(markerPath), 'marker not recovered at startup');
                    const state = JSON.parse(readJudgeFile(resolve(runDir, 'run_state.json'), 'utf-8'));
                    assert(state.phase_status === 'failed', `phase_status: ${state.phase_status}`);
                    assert(String(state.last_error).includes('Backend terminated'), `last_error: ${state.last_error}`);
                }
                finally {
                    if (process.platform === 'win32' && b3.pid) {
                        try {
                            execSync(`taskkill /pid ${b3.pid} /T /F`, { stdio: 'pipe' });
                        }
                        catch { }
                    }
                    else {
                        b3.kill('SIGTERM');
                    }
                }
            });
            await test('Crash recovery: 螳溯｡悟､ｱ謨暦ｼ・I 髱槭ぞ繝ｭ邨ゆｺ・ｼ峨〒繧・failed + last_error 縺梧ｰｸ邯壼喧縺輔ｌ繧・, async () => {
                const { NativeApsfExecutor } = await import('./src/services/apsf-native/native-executor.js');
                const runDir = resolve(apsfRoot, 'runs/work', crashRuns.kill);
                process.env.APSF_NATIVE_CLI_OVERRIDE = `python "${resolve(FIXTURE_DIR, 'failing_native_cli.py')}"`;
                try {
                    const executor = new NativeApsfExecutor(apsfRoot);
                    let threw = false;
                    try {
                        await executor.executePhase({ runId: crashRuns.kill, provider: 'claude' });
                    }
                    catch {
                        threw = true;
                    }
                    assert(threw, 'failing provider should propagate an error');
                    assert(!judgeFileExists(resolve(runDir, 'executor_state.json')), 'marker should be cleared');
                    const state = JSON.parse(readJudgeFile(resolve(runDir, 'run_state.json'), 'utf-8'));
                    assert(state.phase_status === 'failed', `phase_status: ${state.phase_status}`);
                    assert(String(state.last_error).includes('Execution failed'), `last_error: ${state.last_error}`);
                }
                finally {
                    delete process.env.APSF_NATIVE_CLI_OVERRIDE;
                }
            });
        }
        finally {
            rmCrashRuns();
        }
        const transcriptRun = '2026-07-05-997_work_explorer-transcript-test';
        const rmTranscriptRun = () => rmJudgeRun(resolve(apsfRoot, 'runs/work', transcriptRun), { recursive: true, force: true });
        rmTranscriptRun();
        try {
            let transcriptFile = '';
            async function runDryAndWait(expected) {
                const exec = await fetch(`${BASE}/api/runs/${transcriptRun}/execute`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({
                        command: 'build', provider: 'claude', roles: [], mode: 'apsf-run',
                        context: { dryRun: true },
                    }),
                });
                assert(exec.status === 200, `execute failed: ${await exec.text()}`);
                const deadline = Date.now() + 10000;
                for (;;) {
                    const r = await fetch(`${BASE}/api/runs/apsf/${transcriptRun}/executions`, { headers: authHeader() });
                    const body = await r.json();
                    assert(r.status === 200, `executions failed: ${JSON.stringify(body).slice(0, 200)}`);
                    if (body.executions.length >= expected) {
                        const lastEvents = await fetch(`${BASE}/api/runs/apsf/${transcriptRun}/executions/${body.executions[0].file}`, { headers: authHeader() }).then((x) => x.json());
                        if (lastEvents.events?.some((e) => e.type === 'complete' || e.type === 'error')) {
                            return body.executions;
                        }
                    }
                    assert(Date.now() < deadline, `transcript did not reach ${expected} within 10s`);
                    await new Promise((res3) => setTimeout(res3, 200));
                }
            }
            await test('Transcript: DryRun 螳溯｡後〒繝医Λ繝ｳ繧ｹ繧ｯ繝ｪ繝励ヨ縺檎函謌舌＆繧後ｋ', async () => {
                await createLightRun(transcriptRun, true);
                const executions = await runDryAndWait(1);
                assert(executions.length === 1, `executions: ${JSON.stringify(executions)}`);
                const meta = executions[0];
                assert(/^\d{8}T\d{6}-\d{3}Z-[a-z0-9]{6}\.jsonl$/.test(meta.file), `file name: ${meta.file}`);
                assert(!Number.isNaN(Date.parse(meta.startedAt)), `startedAt: ${meta.startedAt}`);
                assert(meta.sizeBytes > 0, 'empty transcript');
                transcriptFile = meta.file;
            });
            await test('Transcript: 荳ｭ霄ｫ縺・start/progress/complete 繧貞性縺ｿ REST 縺ｧ隱ｭ繧√ｋ', async () => {
                assert(transcriptFile, 'no transcript from previous test');
                const r = await fetch(`${BASE}/api/runs/apsf/${transcriptRun}/executions/${transcriptFile}`, { headers: authHeader() });
                const body = await r.json();
                assert(r.status === 200, `read failed: ${JSON.stringify(body).slice(0, 200)}`);
                const types = body.events.map((e) => e.type);
                assert(types[0] === 'start', `first event: ${types[0]}`);
                assert(types.includes('progress'), 'no progress events');
                assert(types[types.length - 1] === 'complete', `last event: ${types[types.length - 1]}`);
                const startData = body.events[0].data;
                assert(startData.runId === transcriptRun && startData.dryRun === true, `start data: ${JSON.stringify(startData)}`);
                const progressText = body.events
                    .filter((e) => e.type === 'progress')
                    .map((e) => String(e.data?.message ?? ''))
                    .join('\n');
                assert(progressText.includes('DryRun'), 'DryRun progress not recorded');
            });
            await test('Transcript: 螳溯｡後・縺溘・縺ｫ 1 莉ｶ縺壹▽蠅励∴繧・, async () => {
                const executions = await runDryAndWait(2);
                assert(executions.length === 2, `executions: ${executions.length}`);
                assert(executions[0].file > executions[1].file, 'not sorted newest-first');
            });
            await test('Transcript: 荳肴ｭ｣繝輔ぃ繧､繝ｫ蜷阪・ 400縲∵悴蟄伜惠縺ｯ 404', async () => {
                const bad = await fetch(`${BASE}/api/runs/apsf/${transcriptRun}/executions/..%2Frun_state.json`, { headers: authHeader() });
                assert(bad.status === 400 || bad.status === 404, `expected 400/404, got ${bad.status}`);
                const evil = await fetch(`${BASE}/api/runs/apsf/${transcriptRun}/executions/evil.jsonl`, { headers: authHeader() });
                assert(evil.status === 400, `expected 400, got ${evil.status}`);
                const missing = await fetch(`${BASE}/api/runs/apsf/${transcriptRun}/executions/20990101T000000-000Z-aaaaaa.jsonl`, { headers: authHeader() });
                assert(missing.status === 404, `expected 404, got ${missing.status}`);
            });
        }
        finally {
            rmTranscriptRun();
        }
        const queueRuns = [
            '2026-07-05-981', '2026-07-05-982', '2026-07-05-983', '2026-07-05-984',
            '2026-07-05-985', '2026-07-05-986', '2026-07-05-987',
        ].map((d, i) => `${d}_work_explorer-queue-test-${i + 1}`);
        const rmQueueRuns = () => {
            for (const name of queueRuns) {
                rmJudgeRun(resolve(apsfRoot, 'runs/work', name), { recursive: true, force: true });
            }
        };
        rmQueueRuns();
        try {
            function collectEvents(runIds, doneWhen, timeoutMs = 30000) {
                const events = [];
                const ws = new WebSocket(wsAuthUrl());
                const open = new Promise((res, reject) => {
                    ws.on('open', () => res());
                    ws.on('error', reject);
                });
                const done = new Promise((res, reject) => {
                    const t = setTimeout(() => {
                        ws.close();
                        reject(new Error(`event collection timeout. got: ${events.map((e) => `${e.type}:${e.runId}`).join(',')}`));
                    }, timeoutMs);
                    ws.on('message', (raw) => {
                        try {
                            const msg = JSON.parse(raw.toString());
                            if (runIds.includes(msg.runId))
                                events.push(msg);
                            if (doneWhen(events)) {
                                clearTimeout(t);
                                ws.close();
                                res();
                            }
                        }
                        catch { }
                    });
                    ws.on('error', (e) => { clearTimeout(t); reject(e); });
                });
                return { events, done, open };
            }
            const postExecute = (runId) => fetch(`${BASE}/api/runs/${runId}/execute`, {
                method: 'POST',
                headers: authHeader(),
                body: JSON.stringify({ command: 'build', provider: 'claude', roles: [], mode: 'apsf-run' }),
            });
            await test('Queue: 荳ｦ陦瑚ｦ∵ｱ・3 莉ｶ縺瑚ｦ∵ｱる・↓逶ｴ蛻怜ｮ溯｡後＆繧後ｋ', async () => {
                const [q1, q2, q3] = queueRuns;
                for (const r of [q1, q2, q3])
                    await createLightRun(r, true);
                const finished = (evts) => [q1, q2, q3].every((r) => evts.some((e) => (e.type === 'complete' || e.type === 'error') && e.runId === r));
                const { events, done, open } = collectEvents([q1, q2, q3], finished);
                await open;
                for (const r of [q1, q2, q3]) {
                    const res = await postExecute(r);
                    assert(res.status === 200, `execute ${r} failed: ${await res.text()}`);
                }
                const qs = await fetch(`${BASE}/api/runs/queue`, { headers: authHeader() }).then((r) => r.json());
                assert(qs.running !== null, `nothing running: ${JSON.stringify(qs)}`);
                assert(qs.running === q1, `running: ${qs.running}`);
                assert(qs.queued.join(',') === [q2, q3].join(','), `queued: ${qs.queued}`);
                await done;
                const startedOrder = events.filter((e) => e.type === 'started').map((e) => e.runId);
                assert(startedOrder.join(',') === [q1, q2, q3].join(','), `started order: ${startedOrder}`);
                const queuedEvents = events.filter((e) => e.type === 'queued');
                assert(queuedEvents.some((e) => e.runId === q2 && e.data.position === 1), 'q2 queued(1) missing');
                assert(queuedEvents.some((e) => e.runId === q3 && e.data.position === 2), 'q3 queued(2) missing');
                let active = 0;
                let maxActive = 0;
                for (const e of events) {
                    if (e.type === 'started') {
                        active++;
                        maxActive = Math.max(maxActive, active);
                    }
                    if (e.type === 'complete' || e.type === 'error')
                        active--;
                }
                assert(maxActive === 1, `max concurrent executions: ${maxActive}`);
                const health = await fetch(`${BASE}/health`);
                assert(health.ok, 'backend unhealthy after queue drain');
            });
            await test('Queue: 蠕・ｩ滉ｸｭ縺ｮ run 繧偵く繝｣繝ｳ繧ｻ繝ｫ縺吶ｋ縺ｨ蛻励°繧蛾勁蜴ｻ縺輔ｌ繧・, async () => {
                const [, , , q4, q5] = queueRuns;
                await createLightRun(q4, true);
                await createLightRun(q5, true);
                const gotCancelled = (evts) => evts.some((e) => e.type === 'error' && e.runId === q5 && String(e.data.error).includes('Cancelled while queued'));
                const q4Done = (evts) => evts.some((e) => (e.type === 'complete' || e.type === 'error') && e.runId === q4);
                const { events, done, open } = collectEvents([q4, q5], (evts) => gotCancelled(evts) && q4Done(evts));
                await open;
                await postExecute(q4);
                await postExecute(q5);
                let qs = await fetch(`${BASE}/api/runs/queue`, { headers: authHeader() }).then((r) => r.json());
                assert(qs.queued.includes(q5), `q5 not queued: ${JSON.stringify(qs)}`);
                const cancel = await fetch(`${BASE}/api/runs/${q5}/cancel`, { method: 'POST', headers: authHeader() });
                assert(cancel.status === 200, `cancel failed: ${cancel.status}`);
                qs = await fetch(`${BASE}/api/runs/queue`, { headers: authHeader() }).then((r) => r.json());
                assert(!qs.queued.includes(q5), `q5 still queued after cancel: ${JSON.stringify(qs)}`);
                await done;
                assert(!events.some((e) => e.type === 'started' && e.runId === q5), 'cancelled run was started');
                const queueEvents = events.filter((e) => e.type === 'queue');
                assert(queueEvents.length > 0, 'no canonical queue events');
                const afterCancel = queueEvents.find((e) => e.runId === q5 && !e.data.queued.includes(q5));
                assert(afterCancel, 'queue event after cancel does not reflect removal');
            });
            await test('Queue: WS 邨檎罰縺ｮ cancel 縺ｧ繧ょｾ・ｩ溷・縺九ｉ髯､蜴ｻ縺輔ｌ繧・, async () => {
                const [, , , , , q6, q7] = queueRuns;
                await createLightRun(q6, true);
                await createLightRun(q7, true);
                const q6Done = (evts) => evts.some((e) => (e.type === 'complete' || e.type === 'error') && e.runId === q6);
                const q7Cancelled = (evts) => evts.some((e) => e.type === 'error' && e.runId === q7 && String(e.data.error).includes('Cancelled while queued'));
                const { events, done, open } = collectEvents([q6, q7], (evts) => q6Done(evts) && q7Cancelled(evts));
                await open;
                await postExecute(q6);
                await postExecute(q7);
                await new Promise((res, reject) => {
                    const ws = new WebSocket(wsAuthUrl());
                    const t = setTimeout(() => { ws.close(); reject(new Error('ws cancel send timeout')); }, 5000);
                    ws.on('open', () => {
                        ws.send(JSON.stringify({ type: 'cancel', runId: q7 }));
                        setTimeout(() => { clearTimeout(t); ws.close(); res(); }, 300);
                    });
                    ws.on('error', reject);
                });
                const qs = await fetch(`${BASE}/api/runs/queue`, { headers: authHeader() }).then((r) => r.json());
                assert(!qs.queued.includes(q7), `q7 still queued after WS cancel: ${JSON.stringify(qs)}`);
                await done;
                assert(!events.some((e) => e.type === 'started' && e.runId === q7), 'WS-cancelled run was started');
            });
            await test('Queue: WS execute 3 莉ｶ繧りｦ∵ｱる・↓逶ｴ蛻怜ｮ溯｡後＆繧後ｋ', async () => {
                const wsRuns = ['2026-07-05-978', '2026-07-05-979', '2026-07-05-980']
                    .map((d, i) => `${d}_work_explorer-queue-ws-${i + 1}`);
                for (const r of wsRuns) {
                    rmJudgeRun(resolve(apsfRoot, 'runs/work', r), { recursive: true, force: true });
                    await createLightRun(r, true);
                }
                try {
                    const finished = (evts) => wsRuns.every((r) => evts.some((e) => (e.type === 'complete' || e.type === 'error') && e.runId === r));
                    const { events, done, open } = collectEvents(wsRuns, finished);
                    await open;
                    await new Promise((res, reject) => {
                        const ws = new WebSocket(wsAuthUrl());
                        const t = setTimeout(() => { ws.close(); reject(new Error('ws execute send timeout')); }, 5000);
                        ws.on('open', () => {
                            for (const r of wsRuns) {
                                ws.send(JSON.stringify({
                                    type: 'execute',
                                    payload: { runId: r, provider: 'claude', command: 'build', roles: [], mode: 'apsf-run' },
                                }));
                            }
                            setTimeout(() => { clearTimeout(t); ws.close(); res(); }, 300);
                        });
                        ws.on('error', reject);
                    });
                    await done;
                    const startedOrder = events.filter((e) => e.type === 'started').map((e) => e.runId);
                    assert(startedOrder.join(',') === wsRuns.join(','), `WS started order: ${startedOrder}`);
                    const queuedEvents = events.filter((e) => e.type === 'queued');
                    assert(queuedEvents.some((e) => e.runId === wsRuns[1] && e.data.position === 1), 'ws#2 queued(1) missing');
                    assert(queuedEvents.some((e) => e.runId === wsRuns[2] && e.data.position === 2), 'ws#3 queued(2) missing');
                    let active = 0;
                    let maxActive = 0;
                    for (const e of events) {
                        if (e.type === 'started') {
                            active++;
                            maxActive = Math.max(maxActive, active);
                        }
                        if (e.type === 'complete' || e.type === 'error')
                            active--;
                    }
                    assert(maxActive === 1, `WS max concurrent executions: ${maxActive}`);
                }
                finally {
                    for (const r of wsRuns) {
                        rmJudgeRun(resolve(apsfRoot, 'runs/work', r), { recursive: true, force: true });
                    }
                }
            });
            await test('Queue: production 縺ｧ縺ｯ髱・apsf-run 繝｢繝ｼ繝峨・ execute 繧呈拠蜷ｦ・亥･醍ｴ・・螳滓命陦鯉ｼ・, async () => {
                const PROD_PORT = PORT + 60;
                const child = spawn('node src/index.js', {
                    cwd: __dirname,
                    shell: true,
                    env: {
                        ...process.env,
                        PORT: String(PROD_PORT),
                        NODE_ENV: 'production',
                        JWT_SECRET,
                        APSF_ROOT: apsfRoot,
                    },
                });
                try {
                    const deadline = Date.now() + 15000;
                    for (;;) {
                        try {
                            const r = await fetch(`http://localhost:${PROD_PORT}/health`);
                            if (r.ok)
                                break;
                        }
                        catch { }
                        assert(Date.now() < deadline, 'production backend did not start');
                        await new Promise((r2) => setTimeout(r2, 300));
                    }
                    const legacy = await fetch(`http://localhost:${PROD_PORT}/api/runs/prod-test-1/execute`, {
                        method: 'POST',
                        headers: authHeader(),
                        body: JSON.stringify({ command: 'plan', provider: 'claude', roles: [], mode: 'cli-full' }),
                    });
                    assert(legacy.status === 400, `expected 400 for cli-full, got ${legacy.status}`);
                    const body = await legacy.json();
                    assert(String(body.error).includes('apsf-run'), `error message: ${body.error}`);
                    const ok = await fetch(`http://localhost:${PROD_PORT}/api/runs/2026-07-05-999_work_no-such-run/execute`, {
                        method: 'POST',
                        headers: authHeader(),
                        body: JSON.stringify({ command: 'build', provider: 'claude', roles: [], mode: 'apsf-run' }),
                    });
                    assert(ok.status === 200, `expected 200 for apsf-run, got ${ok.status}`);
                    const prodWsToken = jwt.sign({ userId: 'test-user' }, JWT_SECRET);
                    const wsError = await new Promise((res, reject) => {
                        const ws = new WebSocket(`ws://localhost:${PROD_PORT}/?token=${encodeURIComponent(prodWsToken)}`);
                        const t = setTimeout(() => { ws.close(); reject(new Error('no WS rejection within 5s')); }, 5000);
                        ws.on('open', () => ws.send(JSON.stringify({
                            type: 'execute',
                            payload: { runId: 'prod-ws-1', provider: 'claude', command: 'plan', roles: [], mode: 'cli-full' },
                        })));
                        ws.on('message', (raw) => {
                            try {
                                const msg = JSON.parse(raw.toString());
                                if (msg.type === 'error' && msg.runId === 'prod-ws-1') {
                                    clearTimeout(t);
                                    ws.close();
                                    res(String(msg.data?.error ?? ''));
                                }
                            }
                            catch { }
                        });
                        ws.on('error', reject);
                    });
                    assert(wsError.includes('demo/test-only'), `WS rejection message: ${wsError}`);
                }
                finally {
                    if (process.platform === 'win32' && child.pid) {
                        try {
                            execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'pipe' });
                        }
                        catch { }
                    }
                    else {
                        child.kill('SIGTERM');
                    }
                }
            });
        }
        finally {
            rmQueueRuns();
        }
    }
    else {
        console.log(`竢ｭ・・ SKIP  APSF framework tests (not found at ${apsfRoot})`);
    }
    await test('APSFRunBridge: unavailable without APSF_ROOT', async () => {
        const saved = process.env.APSF_ROOT;
        delete process.env.APSF_ROOT;
        try {
            const { APSFRunBridge } = await import('./src/services/apsf-run-bridge.service.js');
            const bridge = new APSFRunBridge();
            assert(bridge.isAvailable() === false, 'should be unavailable');
            assert(bridge.listRuns().length === 0, 'listRuns should be empty');
        }
        finally {
            if (saved)
                process.env.APSF_ROOT = saved;
        }
    });
    await test('Auth mode: demo 窶・GET /auth/mode 縺・demo縲∽ｻｻ諢剰ｳ・ｼ諠・ｱ縺ｧ繝ｭ繧ｰ繧､繝ｳ蜿ｯ', async () => {
        const mode = await fetch(`${BASE}/api/auth/mode`).then((r) => r.json());
        assert(mode.mode === 'demo', `mode: ${mode.mode}`);
        const login = await fetch(`${BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'anyone@anywhere', password: 'whatever' }),
        });
        assert(login.status === 200, `demo login status: ${login.status}`);
        const body = await login.json();
        assert(typeof body.token === 'string' && body.token.length > 0, 'no token issued');
    });
    await test('Auth mode: basic 窶・豁｣縺励＞雉・ｼ諠・ｱ 200 / 隱､繧・401 / register 403', async () => {
        const BASIC_PORT = PORT + 70;
        const child = spawn('node src/index.js', {
            cwd: __dirname,
            shell: true,
            env: {
                ...process.env,
                PORT: String(BASIC_PORT),
                JWT_SECRET,
                AUTH_MODE: 'basic',
                USERS_FILE: resolve(FIXTURE_DIR, 'users.json'),
            },
        });
        try {
            const deadline = Date.now() + 15000;
            for (;;) {
                try {
                    const r = await fetch(`http://localhost:${BASIC_PORT}/health`);
                    if (r.ok)
                        break;
                }
                catch { }
                assert(Date.now() < deadline, 'basic-mode backend did not start');
                await new Promise((r2) => setTimeout(r2, 300));
            }
            const B = `http://localhost:${BASIC_PORT}`;
            const mode = await fetch(`${B}/api/auth/mode`).then((r) => r.json());
            assert(mode.mode === 'basic', `mode: ${mode.mode}`);
            const ok = await fetch(`${B}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'admin@test.local', password: 'correct-horse' }),
            });
            assert(ok.status === 200, `valid login status: ${ok.status}`);
            const { token } = await ok.json();
            const protectedCall = await fetch(`${B}/api/runs/providers`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            assert(protectedCall.status === 200, `protected API with basic token: ${protectedCall.status}`);
            const wrongPw = await fetch(`${B}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'admin@test.local', password: 'wrong' }),
            });
            assert(wrongPw.status === 401, `wrong password status: ${wrongPw.status}`);
            const wrongPwBody = await wrongPw.json();
            const noUser = await fetch(`${B}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'ghost@test.local', password: 'whatever' }),
            });
            assert(noUser.status === 401, `unknown user status: ${noUser.status}`);
            const noUserBody = await noUser.json();
            assert(wrongPwBody.error === noUserBody.error, `error messages differ: "${wrongPwBody.error}" vs "${noUserBody.error}"`);
            const reg = await fetch(`${B}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'new@test.local', password: 'x', name: 'x' }),
            });
            assert(reg.status === 403, `register status: ${reg.status}`);
        }
        finally {
            if (process.platform === 'win32' && child.pid) {
                try {
                    execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'pipe' });
                }
                catch { }
            }
            else {
                child.kill('SIGTERM');
            }
        }
    });
    await test('Auth mode: 譛ｬ逡ｪ + demo 縺ｯ襍ｷ蜍墓凾縺ｫ隴ｦ蜻翫Ο繧ｰ繧貞・縺・, async () => {
        const WARN_PORT = PORT + 80;
        let output = '';
        const child = spawn('node src/index.js', {
            cwd: __dirname,
            shell: true,
            env: {
                ...process.env,
                PORT: String(WARN_PORT),
                NODE_ENV: 'production',
                JWT_SECRET,
                AUTH_MODE: 'demo',
            },
        });
        child.stdout?.on('data', (d) => (output += d.toString()));
        child.stderr?.on('data', (d) => (output += d.toString()));
        try {
            const deadline = Date.now() + 15000;
            for (;;) {
                try {
                    const r = await fetch(`http://localhost:${WARN_PORT}/health`);
                    if (r.ok)
                        break;
                }
                catch { }
                assert(Date.now() < deadline, 'warn-test backend did not start');
                await new Promise((r2) => setTimeout(r2, 300));
            }
            assert(output.includes('AUTH_MODE=demo in production'), `warning missing. output: ${output.slice(0, 300)}`);
        }
        finally {
            if (process.platform === 'win32' && child.pid) {
                try {
                    execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'pipe' });
                }
                catch { }
            }
            else {
                child.kill('SIGTERM');
            }
        }
    });
    await test('Auth mode: 譛ｬ逡ｪ + 荳肴ｭ｣縺ｪ AUTH_MODE 縺ｯ襍ｷ蜍墓拠蜷ｦ・・xit 1・・, async () => {
        let output = '';
        const code = await new Promise((res, reject) => {
            const child = spawn(`npx tsx "${resolve(__dirname, 'src/index.ts')}"`, {
                cwd: FIXTURE_DIR,
                shell: true,
                env: {
                    ...process.env,
                    NODE_ENV: 'production',
                    PORT: '3299',
                    JWT_SECRET,
                    AUTH_MODE: 'basci',
                },
            });
            child.stdout?.on('data', (d) => (output += d.toString()));
            child.stderr?.on('data', (d) => (output += d.toString()));
            const t = setTimeout(() => {
                child.kill();
                reject(new Error('did not exit within 10s 窶・started with invalid AUTH_MODE?'));
            }, 10000);
            child.on('close', (c) => { clearTimeout(t); res(c); });
        });
        assert(code === 1, `expected exit 1, got ${code}`);
        assert(output.includes("Invalid AUTH_MODE 'basci'"), `error message missing: ${output.slice(0, 300)}`);
    });
    stopBackend();
    await test('Production without JWT_SECRET refuses to start (exit 1)', async () => {
        const env = {
            ...process.env,
            NODE_ENV: 'production',
            PORT: '3199',
        };
        delete env.JWT_SECRET;
        const code = await new Promise((res, reject) => {
            const child = spawn(`npx tsx "${resolve(__dirname, 'src/index.ts')}"`, {
                cwd: FIXTURE_DIR,
                shell: true,
                env,
            });
            const t = setTimeout(() => {
                child.kill();
                reject(new Error('did not exit within 10s 窶・started without JWT_SECRET?'));
            }, 10000);
            child.on('close', (c) => { clearTimeout(t); res(c); });
        });
        assert(code === 1, `expected exit 1, got ${code}`);
    });
    const pass = results.filter((r) => r.status === 'PASS').length;
    const fail = results.filter((r) => r.status === 'FAIL').length;
    console.log('\n========================================');
    console.log(`RESULTS: ${pass} PASS, ${fail} FAIL (of ${results.length})`);
    console.log('========================================');
    process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => {
    console.error('Fatal:', e);
    stopBackend();
    process.exit(1);
});
