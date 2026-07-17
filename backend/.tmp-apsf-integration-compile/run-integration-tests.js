/**
 * Backend Integration Test Runner (REAL implementation)
 *
 * チE��ト�E製サーバ�Eは使用しなぁE��E * 実際の backend/src/index.ts を子�Eロセスとして起動し、E * ExecutionHandler / APSFBridgeService / routes / auth middleware めE * 実裁E��ード経由で検証する、E *
 * AI CLI は __tests__/fixtures/fake_cli.py�E�宁Epython プロセス�E�に差し替えて
 * 本物の実行経路�E�宁Espawn・宁Estdout/stderr ストリーム・宁Eexit code�E�を通す、E */
import { spawn, execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.TEST_PORT || 3111);
const BASE = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}`;
/** WS は REST と同等�E JWT 認証�E�Etoken=�E�を要求すめE*/
const wsAuthUrl = () => `${WS_URL}/?token=${encodeURIComponent(jwt.sign({ userId: 'test-user' }, JWT_SECRET))}`;
const JWT_SECRET = 'integration-test-secret';
const FIXTURE_DIR = resolve(__dirname, '__tests__/fixtures');
// 宁EAPSF Framework の場所�E�このマシンの実物。他環墁E��は APSF_ROOT で持E��！Econst APSF_ROOT_DEFAULT = 'C:/Users/PC_User/PRJ/ai-problem-solving-framework';
const results = [];
let backend;
async function test(name, fn) {
    const start = Date.now();
    try {
        await fn();
        results.push({ name, status: 'PASS', duration: Date.now() - start });
        console.log(`✁EPASS  ${name} (${Date.now() - start}ms)`);
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        results.push({ name, status: 'FAIL', duration: Date.now() - start, message });
        console.log(`❁EFAIL  ${name}  E${message}`);
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
/** 宁Ebackend (src/index.ts) を起勁E*/
function startBackend() {
    return new Promise((res, reject) => {
        backend = spawn('node src/index.js', {
            cwd: __dirname,
            shell: true,
            env: {
                ...process.env,
                PORT: String(PORT),
                JWT_SECRET,
                // Executor (CLI-FULL/LITE) 用の実�Eロセス CLI フィクスチャ
                APSF_CLI_OVERRIDE: `python "${resolve(FIXTURE_DIR, 'fake_cli.py')}"`,
                RUNS_DIR: resolve(__dirname, 'runs'),
                // 宁EAPSF Framework�E�存在する環墁E��のみ apsf-run チE��トが実行される�E�E                APSF_ROOT: process.env.APSF_ROOT || APSF_ROOT_DEFAULT,
                // apsf-run の靁EDryRun 実行�EチE��トでは fake provider�E�Es sleep�E�を使ぁE                // �E�宁EAI を起動しなぁE��キュー直列化チE��トで重なりを作るのに忁E��E��E                APSF_NATIVE_CLI_OVERRIDE: `python "${resolve(FIXTURE_DIR, 'slow_native_cli.py')}" 1`,
            },
        });
        backend.stdout?.on('data', (d) => process.env.DEBUG_BACKEND && console.log(`[backend] ${d}`));
        backend.stderr?.on('data', (d) => console.error(`[backend:err] ${d}`));
        backend.on('exit', (code) => {
            if (code !== null && code !== 0)
                console.error(`[backend] exited with code ${code}`);
        });
        // /health が返るまでポ�Eリング�E�最大 15 秒！E        const deadline = Date.now() + 15000;
        const poll = async () => {
            try {
                const r = await fetch(`${BASE}/health`);
                if (r.ok)
                    return res();
            }
            catch { /* not up yet */ }
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
        catch { /* already dead */ }
    }
    else {
        backend.kill('SIGTERM');
    }
}
/** WS を開き、E��何も送らずに�E�条件を満たすブロードキャストイベントを征E�� */
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
            catch { /* ignore */ }
        });
        ws.on('error', (err) => { clearTimeout(timer); reject(err); });
    });
}
/** WS を開き、execute を送り、条件を満たすイベントを征E�� */
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
            catch { /* ignore non-JSON */ }
        });
        ws.on('error', (err) => { clearTimeout(timer); reject(err); });
    });
}
async function main() {
    console.log('🚀 Backend Integration Tests  EREAL backend/src/index.ts\n');
    // 前回実行�E artifact を除去�E�Etale pass 防止�E�E    const { rmSync } = await import('fs');
    rmSync(resolve(__dirname, 'runs'), { recursive: true, force: true });
    await startBackend();
    console.log(`✁EReal backend started on port ${PORT}\n`);
    // ---- REST (routes + auth middleware 実裁E��由) ----
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
    await test('POST execute (CLI-FULL mode): real executor runs ↁEcomplete via WS', async () => {
        // WS を�Eに開いて REST 実行�E complete イベントを征E��受ける！Eouter 配線�E実証�E�E        const wsEvents = waitForEvent((m) => m.type === 'complete' && m.runId === 'rest-full-1' && m.data?.mode === 'cli-full');
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
    await test('POST execute (CLI-LITE mode): real executor runs ↁEcomplete via WS', async () => {
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
    await test('WS execute (CLI-FULL mode) with failing CLI ↁEerror event', async () => {
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
    // ---- WebSocket (ExecutionHandler + Executor 実裁E��由) ----
    await test('WebSocket: connection to real server', async () => {
        await new Promise((res, reject) => {
            const ws = new WebSocket(wsAuthUrl());
            const t = setTimeout(() => reject(new Error('connect timeout')), 5000);
            ws.on('open', () => { clearTimeout(t); ws.close(); res(); });
            ws.on('error', reject);
        });
    });
    await test('WS auth: no token ↁEclose(4401)', async () => {
        const code = await new Promise((res, reject) => {
            const ws = new WebSocket(WS_URL);
            const t = setTimeout(() => { ws.close(); reject(new Error('not closed within 5s')); }, 5000);
            ws.on('close', (c) => { clearTimeout(t); res(c); });
            ws.on('error', reject);
        });
        assert(code === 4401, `close code: ${code}`);
    });
    await test('WS auth: invalid token ↁEclose(4401)', async () => {
        const code = await new Promise((res, reject) => {
            const ws = new WebSocket(`${WS_URL}/?token=not-a-jwt`);
            const t = setTimeout(() => { ws.close(); reject(new Error('not closed within 5s')); }, 5000);
            ws.on('close', (c) => { clearTimeout(t); res(c); });
            ws.on('error', reject);
        });
        assert(code === 4401, `close code: ${code}`);
    });
    await test('WS auth: expired token ↁEclose(4401)', async () => {
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
        // 無認証接続で execute を送り込み、実行が発生しなぁE��とを実証する、E        // 接続�E即 close されるため、E��信できてめEexecutionHandler には届かなぁE        const runId = `unauth-${Date.now()}`;
        const outcome = await new Promise((res) => {
            const state = { opened: false, sent: false, closeCode: 0, events: [] };
            const ws = new WebSocket(WS_URL);
            // open が来ても来なくても送信を試みる！Elose 前に届くか�Eレース�E�E            ws.on('open', () => {
                state.opened = true;
                try {
                    ws.send(JSON.stringify({
                        type: 'execute',
                        payload: { runId, provider: 'claude', command: 'plan', roles: [], mode: 'cli-full' },
                    }));
                    state.sent = true;
                }
                catch { /* already closing */ }
            });
            // 認証前�E接続にはぁE��なるイベントも配信されなぁE��と
            ws.on('message', (raw) => {
                try {
                    state.events.push(JSON.parse(raw.toString()).type);
                }
                catch { /* ignore */ }
            });
            ws.on('close', (code) => { state.closeCode = code; res(state); });
            ws.on('error', () => res(state));
        });
        // 同一シナリオで 4401 close を確認（決定的な証拠�E�E        assert(outcome.closeCode === 4401, `close code: ${outcome.closeCode}`);
        assert(outcome.events.length === 0, `events leaked to unauthenticated socket: ${outcome.events.join(',')}`);
        // 実行されてぁE��ば runs/<runId>/ に artifact が生成される�E�Eli-full�E�、E        // executor 起動猶予を見込んで征E��
        await new Promise((r2) => setTimeout(r2, 1500));
        const { existsSync } = await import('fs');
        assert(!existsSync(resolve(__dirname, 'runs', runId)), 'unauthenticated execute was processed!');
        const health = await fetch(`${BASE}/health`);
        assert(health.ok, 'backend crashed on unauthenticated execute');
    });
    await test('WebSocket: execute ↁEexecution-start event', async () => {
        const msg = await executeAndWaitFor({ runId: 'ws-run-1', provider: 'claude', command: 'plan', roles: ['judge'] }, (m) => m.type === 'execution-start' && m.runId === 'ws-run-1');
        assert(msg.provider === 'claude', 'provider mismatch');
    });
    await test('WebSocket: real python process ↁEprogress event (default mode)', async () => {
        const msg = await executeAndWaitFor({ runId: 'ws-run-2', provider: 'claude', command: 'plan', roles: ['judge'] }, (m) => m.type === 'progress' && m.runId === 'ws-run-2');
        assert(msg.data && msg.data.mode === 'cli-full', `progress data.mode: ${msg.data?.mode}`);
    });
    await test('WebSocket: real python exit 0 ↁEcomplete event', async () => {
        const msg = await executeAndWaitFor({ runId: 'ws-run-3', provider: 'claude', command: 'plan', roles: ['judge'] }, (m) => m.type === 'complete' && m.runId === 'ws-run-3');
        assert(msg.data.exitCode === 0, `exitCode: ${msg.data.exitCode}`);
    });
    await test('WebSocket: real python exit 1 ↁEerror event (no crash)', async () => {
        const msg = await executeAndWaitFor({ runId: 'ws-run-4', provider: 'claude', command: 'plan', roles: ['judge'], goal: 'fail' }, (m) => m.type === 'error' && m.runId === 'ws-run-4');
        assert(msg.data.error, 'error payload missing');
        const r = await fetch(`${BASE}/health`);
        assert(r.ok, 'backend crashed after failing execution');
    });
    await test('WebSocket: invalid JSON message ↁEerror response', async () => {
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
    // ---- ExecutionModeRouter�E�実裁E��ジュールを直接検証�E�E----
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
    // ---- 宁EAPSF Framework 結合�E�Epsf-run mode�E�E----
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
            // 実フェーズト�Eクン�E�ELAN_NEEDED / BUILD_NEEDED / COMPLETE 等！E            assert(/^[A-Z_]+$/.test(body.phase), `unexpected phase: ${body.phase}`);
        });
        await test('APSF: execute (apsf-run mode) with nonexistent run ↁEerror event', async () => {
            const msg = await executeAndWaitFor({ runId: 'no-such-run-xyz', provider: 'claude', command: 'plan', roles: [], mode: 'apsf-run' }, (m) => m.type === 'error' && m.runId === 'no-such-run-xyz', 30000);
            assert(msg.data.error, 'error payload missing');
            // backend がクラチE��ュしてぁE��ぁE��と
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
            // task.md があめErun�E�Eight�E�なめE200、なければ 404  Eどちらも正常経路
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
            // full-cycle 検証済み run は advisory を持つ
            const r = await fetch(`${BASE}/api/runs/apsf/2026-07-05-902_work_explorer-native-smoke/advisory`, { headers: authHeader() });
            if (r.status === 200) {
                const body = await r.json();
                assert(body.advisory === null || typeof body.advisory.recommendation === 'string', `unexpected advisory: ${JSON.stringify(body).slice(0, 150)}`);
            }
            else {
                assert(r.status === 400, `unexpected status ${r.status}`); // run が無ぁE��墁E            }
        });
        await test('APSF: POST create run ↁETASK_NEEDED ↁEwrite-phase advances phase', async () => {
            const tmpRun = '2026-07-05-999_work_explorer-api-test';
            const { rmSync: rmRun, existsSync: runExists } = await import('fs');
            const tmpDir = resolve(apsfRoot, 'runs/work', tmpRun);
            // 前回の残骸を除去
            rmRun(tmpDir, { recursive: true, force: true });
            try {
                // 1. 作�E
                const create = await fetch(`${BASE}/api/runs/apsf`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({ runName: tmpRun, light: true, taxonomy: 'work' }),
                });
                const created = await create.json();
                assert(create.status === 200, `create failed: ${JSON.stringify(created).slice(0, 200)}`);
                assert(created.phase === 'TASK_NEEDED', `phase after create: ${created.phase}`);
                // 2. human フェーズの記�E�E�Erite-phase 経由�E�E                const write = await fetch(`${BASE}/api/runs/apsf/${tmpRun}/write-phase`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({
                        content: '# Task\n\n## What\n\nAPI 経由の write-phase 検証。ダミ�Eタスク、En\n' +
                            '## Context\n\n- API チE��ト用の一晁Erun\n- 実行�Eしない\n\n' +
                            '## Done Criteria\n\n- [x] task.md ぁEAPI 経由で保存される\n',
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
            // BUILD_NEEDED の一晁Erun を用意！EryRun でめEapsf act 実行に ~2s かかる！E            const tmpRun = '2026-07-05-998_work_explorer-guard-test';
            const tmpDir = resolve(apsfRoot, 'runs/work', tmpRun);
            rmRun(tmpDir, { recursive: true, force: true });
            await bridge.createRun(tmpRun, { light: true, taxonomy: 'work' });
            await bridge.writePhase(tmpRun, '# Task\n\n## What\n\n二重実行ガード�E検証用ダミ�E、En\n' +
                '## Context\n\n- チE��ト用一晁Erun\n- AI 実行�EしなぁE��EryRun のみ�E�\n\n' +
                '## Done Criteria\n\n- [x] ガードが機�Eする\n');
            try {
                // enqueue は execute の同期プロローグで行われるため、await せずに
                // 2 連続で呼べば 2 回目は決定的に拒否される（キュー化後�E execute は
                // enqueue 時点で resolve する  E完亁E�Eイベントで征E���E�E                const first = bridge.execute({
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
                // 1 回目は正常完亁E��てぁE��こと�E�Erain 完亁E��ポ�Eリングで征E���E�E                const deadline = Date.now() + 5000;
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
        // ---- Judge 裁定！EMPROVE_NEEDED ↁEAccept / Return to Build / Return to Plan�E�E----
        const REVIEW_WITH_ADVISORY = '# Review\n\n## Findings\n\n- 統合テスト用のレビュー本斁E��En- 宁Ewrite-phase 経由で保存される、En\n' +
            '## Assessment\n\n- 判定�EチE��トシナリオに応じて Judge が裁定する、En\n' +
            '```apsf-judge-advisory\n{"recommendation": "Return to Build", "human_owned_blocker": false}\n```\n';
        const TEST_BUILD_MD = '# Build\n\n## Work Done\n\n- チE��ト用のダミ�E成果物を作�Eした、En- 実裁E�E存在しなぁE��裁定検証用�E�、En\n' +
            '## Notes\n\n- Judge 裁定テスト�E前段フェーズ、En- write-phase 経由で REVIEW_NEEDED へ遷移する、En';
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
        /** 一晁Erun めEAPI 経由で IMPROVE_NEEDED まで駁E��する�E�Eight/heavy 両対応！E*/
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
                        '# Task\n\n## What\n\nJudge 裁定�E統合テスト用 run、En\n' +
                            '## Context\n\n- 3 経路�E�Eccept/Return to Build/Return to Plan�E��E検証\n- 実フェーズ遷移を通す\n\n' +
                            '## Done Criteria\n\n- [x] IMPROVE_NEEDED に到達する\n'],
                ]
                : [
                    ['execution-assignment.md',
                        '# Execution Assignment\n\n## Roles\n\n- Planner: チE��チEn- Builder: チE��チEn- Critic: チE��チEn- Judge: チE��チEn'],
                    ['goal.md',
                        '# Goal\n\n## Goal Statement\n\nJudge 裁定！Eeturn to Plan�E��E heavy run 統合テスト、En\n' +
                            '## Success Criteria\n\n- PLAN_NEEDED へ差し戻せる\n- plan_review.md に琁E��が残る\n- 下流�E果物が退避される\n'],
                    ['plan.md',
                        '# Plan\n\n## Approach\n\n- チE��ト用のダミ�E計画、En- 実裁E�EしなぁE��En\n' +
                            '## Steps\n\n- ダミ�E build を書く\n- ダミ�E review を書く\n'],
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
            await test('APSF Judge: Return to Build ↁEBUILD_NEEDED + build_review.md + 下流E��避', async () => {
                await driveToImprove(judgeRuns.build);
                const r = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.build}/judge`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({ decision: 'Return to Build', reason: 'ビルド�E検証手頁E��不足してぁE��ため差し戻す、E }),
                });
                const body = await r.json();
                assert(r.status === 200, `judge failed: ${JSON.stringify(body).slice(0, 200)}`);
                assert(body.phaseAfter === 'BUILD_NEEDED', `phaseAfter: ${body.phaseAfter}`);
                assert(body.reasonFile === 'build_review.md', `reasonFile: ${body.reasonFile}`);
                assert(body.matchesAdvisory === true, `matchesAdvisory: ${body.matchesAdvisory}`);
                // 琁E��ファイルの実佁E                const runDir = resolve(apsfRoot, 'runs/work', judgeRuns.build);
                const reviewPath = resolve(runDir, 'build_review.md');
                assert(judgeFileExists(reviewPath), 'build_review.md not created');
                const content = readJudgeFile(reviewPath, 'utf-8');
                assert(content.includes('ビルド�E検証手頁E��不足'), 'reason missing in build_review.md');
                assert(content.includes('Return to Build'), 'decision missing in build_review.md');
                // 下流�E果物の退避�E�残すと advisory 検�Eが�EビルチE再レビューを追ぁE��す�E�E                assert(Array.isArray(body.supersededFiles) && body.supersededFiles.length === 2, `supersededFiles: ${JSON.stringify(body.supersededFiles)}`);
                assert(!judgeFileExists(resolve(runDir, 'build.md')), 'stale build.md not superseded');
                assert(!judgeFileExists(resolve(runDir, 'review.md')), 'stale review.md not superseded');
                assert(!judgeFileExists(resolve(runDir, 'judge_advisory.json')), 'stale judge_advisory.json not removed');
                for (const f of body.supersededFiles) {
                    assert(judgeFileExists(resolve(runDir, f)), `superseded file missing: ${f}`);
                }
                // 遷移後�E実フェーズ検�E�E�Eanonical と advisory の両方ぁEBUILD_NEEDED�E�E                assert((await phaseOf(judgeRuns.build)) === 'BUILD_NEEDED', 'detected phase is not BUILD_NEEDED');
            });
            await test('APSF Judge: 差し戻し後にループが完走する�E��E BUILD ↁE冁EREVIEW ↁEIMPROVE�E�E, async () => {
                // 差し戻し済み run で build.md ↁEreview.md を書き直し、advisory が�E生�Eされること
                await writePhaseApi(judgeRuns.build, 'build.md (round 2)', TEST_BUILD_MD);
                assert((await phaseOf(judgeRuns.build)) === 'REVIEW_NEEDED', 'rebuild did not reach REVIEW_NEEDED');
                await writePhaseApi(judgeRuns.build, 'review.md (round 2)', REVIEW_WITH_ADVISORY);
                assert((await phaseOf(judgeRuns.build)) === 'IMPROVE_NEEDED', 're-review did not reach IMPROVE_NEEDED');
                const advisoryPath = resolve(apsfRoot, 'runs/work', judgeRuns.build, 'judge_advisory.json');
                assert(judgeFileExists(advisoryPath), 'judge_advisory.json not regenerated after re-review');
            });
            await test('APSF Judge: repeated judge call after loop closes ↁE200 then 409 at BUILD', async () => {
                // ループ完走後�E再�E IMPROVE_NEEDED  E2 回目の Return to Build も�E立する！Eepeat 追記！E                const again = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.build}/judge`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({ decision: 'Return to Build', reason: '2 周目の差し戻し検証。理由は前回と同一ファイルに追記される、E }),
                });
                const body = await again.json();
                assert(again.status === 200, `second judge failed: ${JSON.stringify(body).slice(0, 200)}`);
                const content = readJudgeFile(resolve(apsfRoot, 'runs/work', judgeRuns.build, 'build_review.md'), 'utf-8');
                assert(content.includes('ビルド�E検証手頁E��不足') && content.includes('2 周目の差し戻し検証'), 'build_review.md should accumulate both decisions');
                // こ�E時点で run は 2 周目の BUILD_NEEDED  E裁定�E 409 で拒否されめE                const r = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.build}/judge`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({ decision: 'Return to Build', reason: '二重裁定�E検証、E }),
                });
                assert(r.status === 409, `expected 409, got ${r.status}`);
            });
            await test('APSF Judge: Return to Plan (heavy) ↁEPLAN_NEEDED + plan_review.md + 下流E��避', async () => {
                await driveToImprove(judgeRuns.plan, { light: false });
                const r = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.plan}/judge`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({ decision: 'Return to Plan', reason: '計画の前提が崩れてぁE��ため計画からめE��直す、E }),
                });
                const body = await r.json();
                assert(r.status === 200, `judge failed: ${JSON.stringify(body).slice(0, 200)}`);
                assert(body.phaseAfter === 'PLAN_NEEDED', `phaseAfter: ${body.phaseAfter}`);
                assert(body.reasonFile === 'plan_review.md', `reasonFile: ${body.reasonFile}`);
                // advisory は Return to Build 推奨 ↁE不一致が記録されめE                assert(body.matchesAdvisory === false, `matchesAdvisory: ${body.matchesAdvisory}`);
                const runDir = resolve(apsfRoot, 'runs/work', judgeRuns.plan);
                assert(judgeFileExists(resolve(runDir, 'plan_review.md')), 'plan_review.md not created');
                assert(readJudgeFile(resolve(runDir, 'plan_review.md'), 'utf-8').includes('計画の前提が崩れてぁE��'), 'reason missing');
                // plan / build / review が退避されめE                assert(body.supersededFiles.length === 3, `supersededFiles: ${JSON.stringify(body.supersededFiles)}`);
                for (const f of ['plan.md', 'build.md', 'review.md']) {
                    assert(!judgeFileExists(resolve(runDir, f)), `stale ${f} not superseded`);
                }
                assert((await phaseOf(judgeRuns.plan)) === 'PLAN_NEEDED', 'detected phase is not PLAN_NEEDED');
            });
            await test('APSF Judge: light run への Return to Plan ↁE400�E�Elan フェーズなし！E, async () => {
                await driveToImprove(judgeRuns.accept);
                const r = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.accept}/judge`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({ decision: 'Return to Plan', reason: 'light run では拒否される�Eず、E }),
                });
                assert(r.status === 400, `expected 400, got ${r.status}`);
                assert((await phaseOf(judgeRuns.accept)) === 'IMPROVE_NEEDED', 'phase changed despite 400');
            });
            await test('APSF Judge: Return without reason ↁE400', async () => {
                // judgeRuns.accept は前テストで IMPROVE_NEEDED のまま
                const r = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.accept}/judge`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({ decision: 'Return to Build' }),
                });
                assert(r.status === 400, `expected 400, got ${r.status}`);
                // 400 の裁定�E状態を変えなぁE��と
                const p = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.accept}/phase`, { headers: authHeader() });
                assert((await p.json()).phase === 'IMPROVE_NEEDED', 'phase changed despite 400');
            });
            await test('APSF Judge: Accept ↁEno transition, improve.md write ↁERESULT_NEEDED', async () => {
                const r = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.accept}/judge`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({ decision: 'Accept' }),
                });
                const body = await r.json();
                assert(r.status === 200, `judge failed: ${JSON.stringify(body).slice(0, 200)}`);
                assert(body.phaseAfter === 'IMPROVE_NEEDED', `Accept should not transition: ${body.phaseAfter}`);
                // 裁定が session_events.jsonl に記録されること
                const eventsPath = resolve(apsfRoot, 'runs/work', judgeRuns.accept, 'session_events.jsonl');
                assert(judgeFileExists(eventsPath), 'session_events.jsonl not created');
                const events = readJudgeFile(eventsPath, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
                assert(events.some((e) => e.event_type === 'judge_decision' && e.payload?.decision === 'Accept'), 'judge_decision Accept event not recorded');
                // 既存フロー: improve.md の記�Eで RESULT_NEEDED へ
                const w = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.accept}/write-phase`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: JSON.stringify({
                        content: '# Improve\n\n## Decision\n\n- Accept�E�統合テスト）、En\n' +
                            '## Notes\n\n- 裁宁EAccept 経路の検証、En- 追加改喁E�E不要、En- write-phase 経由で RESULT_NEEDED へ遷移する、En',
                    }),
                });
                const written = await w.json();
                assert(w.status === 200, `improve write failed: ${JSON.stringify(written).slice(0, 200)}`);
                assert(written.phase === 'RESULT_NEEDED', `phase after improve: ${written.phase}`);
            });
            await test('APSF Judge: invalid decision ↁE400', async () => {
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
        // ---- クラチE��ュ回復�E�Executor_state.json マ�Eカー + recoverOrphanedRuns�E�E----
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
        const TASK_MD = '# Task\n\n## What\n\nクラチE��ュ回復の統合テスト用 run、En\n' +
            '## Context\n\n- executor_state.json マ�Eカーの回復動作を検証\n- AI 実行�Eしない\n\n' +
            '## Done Criteria\n\n- [x] 回復動作が検証される\n';
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
            await test('Crash recovery: AUTO フェーズの stale マ�Eカー ↁEfailed + last_error', async () => {
                await createLightRun(crashRuns.auto, true); // BUILD_NEEDED (auto)
                const runDir = resolve(apsfRoot, 'runs/work', crashRuns.auto);
                writeCrashFile(resolve(runDir, 'executor_state.json'), JSON.stringify({
                    runId: crashRuns.auto, pid: 99999, phase: 'BUILD_NEEDED', startedAt: '2026-07-08T00:00:00Z',
                }));
                const { recoverOrphanedRuns } = await import('./src/services/apsf-native/recovery.js');
                const recovered = recoverOrphanedRuns(apsfRoot);
                const entry = recovered.find((r) => r.runId === crashRuns.auto);
                assert(entry && entry.action === 'marked_failed', `recovered: ${JSON.stringify(recovered)}`);
                assert(!judgeFileExists(resolve(runDir, 'executor_state.json')), 'marker not removed');
                // run_state に failed + last_error が永続化され、phase API から見えめE                const p = await fetch(`${BASE}/api/runs/apsf/${crashRuns.auto}/phase`, { headers: authHeader() });
                const info = await p.json();
                assert(info.phase === 'BUILD_NEEDED', `phase: ${info.phase}`);
                assert(info.phaseStatus === 'failed', `phaseStatus: ${info.phaseStatus}`);
                assert(String(info.lastError).includes('pid=99999'), `lastError: ${info.lastError}`);
            });
            await test('Crash recovery: human フェーズの stale マ�Eカー ↁE除去のみ�E�誤 failed 化しなぁE��E, async () => {
                await createLightRun(crashRuns.human, false); // TASK_NEEDED (human)
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
            await test('Crash recovery: executor 正常系はマ�Eカーを残さなぁE��Euman 停止ループ！E, async () => {
                const { NativeApsfExecutor } = await import('./src/services/apsf-native/native-executor.js');
                const executor = new NativeApsfExecutor(apsfRoot);
                // TASK_NEEDED�E�Euman�E�で即停止するルーチE Eマ�Eカーの書き込み〜削除を通る
                const result = await executor.executeLoop({ runId: crashRuns.human, provider: 'claude' });
                assert(result.stopReason === 'human_phase', `stopReason: ${result.stopReason}`);
                const runDir = resolve(apsfRoot, 'runs/work', crashRuns.human);
                assert(!judgeFileExists(resolve(runDir, 'executor_state.json')), 'marker left behind');
            });
            await test('Crash recovery: 実行中の backend めEkill -9 相当で強制終亁EↁE再起動で回復', async () => {
                const KILL_PORT = PORT + 50;
                await createLightRun(crashRuns.kill, true); // BUILD_NEEDED
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
                            // 宁EAI の代わりに長時間実行�E fake provider�E�Eleep 120s�E�E                            APSF_NATIVE_CLI_OVERRIDE: `python "${resolve(FIXTURE_DIR, 'slow_native_cli.py')}" 120`,
                        },
                    });
                    const deadline = Date.now() + 15000;
                    const poll = async () => {
                        try {
                            const r = await fetch(`http://localhost:${KILL_PORT}/health`);
                            if (r.ok)
                                return res2(child);
                        }
                        catch { /* not up */ }
                        if (Date.now() > deadline)
                            return rej2(new Error('kill-test backend did not start'));
                        setTimeout(poll, 300);
                    };
                    poll();
                });
                // backend #2 で実実行を開姁EↁEexecutor が�Eーカーを�E書きする�Eを征E��
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
                // 実行中�E�Eake provider ぁEsleep 中�E�に SIGKILL 相当で強制終亁E                if (process.platform === 'win32') {
                    execSync(`taskkill /pid ${b2.pid} /T /F`, { stdio: 'pipe' });
                }
                else {
                    b2.kill('SIGKILL');
                }
                // マ�Eカーはプロセス死後も残存してぁE���E�クラチE��ュの再現�E�E                assert(judgeFileExists(markerPath), 'marker should survive the kill');
                // backend #3 起勁E= 再起動。起動時回復で failed 化される
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
                        catch { /* dead */ }
                    }
                    else {
                        b3.kill('SIGTERM');
                    }
                }
            });
            await test('Crash recovery: 実行失敗！EI 非ゼロ終亁E��でめEfailed + last_error が永続化されめE, async () => {
                // backend 存命中の失敗経路: withMarker ぁEsetPhaseStatus(failed) を記録ぁE                // マ�Eカーは削除される！ES エラーは揮発性  Edurable 記録の検証�E�E                const { NativeApsfExecutor } = await import('./src/services/apsf-native/native-executor.js');
                const runDir = resolve(apsfRoot, 'runs/work', crashRuns.kill);
                // 前テストで failed ↁE再実行に相当する経路として fake failing provider で実衁E                process.env.APSF_NATIVE_CLI_OVERRIDE = `python "${resolve(FIXTURE_DIR, 'failing_native_cli.py')}"`;
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
        // ---- 実行トランスクリプト�E�Executions/*.jsonl + REST�E�E----
        const transcriptRun = '2026-07-05-997_work_explorer-transcript-test';
        const rmTranscriptRun = () => rmJudgeRun(resolve(apsfRoot, 'runs/work', transcriptRun), { recursive: true, force: true });
        rmTranscriptRun();
        try {
            let transcriptFile = '';
            /** DryRun 実行を発火し、executions ぁEexpected 件になるまでポ�Eリング
             *�E�EryRun は数 ms で完亁E�� WS 接続前に complete が流れぁE��ため、E             *  WS 征E��ではなく永続化された結果で判定する！E*/
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
                        // complete イベント�E追記まで征E���E�サイズ安定を確認！E                        const lastEvents = await fetch(`${BASE}/api/runs/apsf/${transcriptRun}/executions/${body.executions[0].file}`, { headers: authHeader() }).then((x) => x.json());
                        if (lastEvents.events?.some((e) => e.type === 'complete' || e.type === 'error')) {
                            return body.executions;
                        }
                    }
                    assert(Date.now() < deadline, `transcript did not reach ${expected} within 10s`);
                    await new Promise((res3) => setTimeout(res3, 200));
                }
            }
            await test('Transcript: DryRun 実行でトランスクリプトが生成される', async () => {
                await createLightRun(transcriptRun, true); // BUILD_NEEDED
                const executions = await runDryAndWait(1);
                assert(executions.length === 1, `executions: ${JSON.stringify(executions)}`);
                const meta = executions[0];
                assert(/^\d{8}T\d{6}-\d{3}Z-[a-z0-9]{6}\.jsonl$/.test(meta.file), `file name: ${meta.file}`);
                assert(!Number.isNaN(Date.parse(meta.startedAt)), `startedAt: ${meta.startedAt}`);
                assert(meta.sizeBytes > 0, 'empty transcript');
                transcriptFile = meta.file;
            });
            await test('Transcript: 中身ぁEstart/progress/complete を含み REST で読める', async () => {
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
            await test('Transcript: 実行�Eた�Eに 1 件ずつ増えめE, async () => {
                const executions = await runDryAndWait(2);
                assert(executions.length === 2, `executions: ${executions.length}`);
                // 新しい頁E                assert(executions[0].file > executions[1].file, 'not sorted newest-first');
            });
            await test('Transcript: 不正ファイル名�E 400、未存在は 404', async () => {
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
        // ---- 実行キュー�E�単一実衁E+ FIFO、直列化・キャンセル�E�E----
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
            /** 認証付き WS で褁E�� run のイベントを収集する */
            function collectEvents(runIds, doneWhen, timeoutMs = 30000) {
                const events = [];
                const ws = new WebSocket(wsAuthUrl());
                // 実行開始！Etarted�E�を取り漏らさなぁE��ぁE��POST 前に open を征E��るよぁE��する
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
                        catch { /* ignore */ }
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
            await test('Queue: 並行要汁E3 件が要求頁E��直列実行される', async () => {
                const [q1, q2, q3] = queueRuns;
                for (const r of [q1, q2, q3])
                    await createLightRun(r, true); // BUILD_NEEDED
                const finished = (evts) => [q1, q2, q3].every((r) => evts.some((e) => (e.type === 'complete' || e.type === 'error') && e.runId === r));
                const { events, done, open } = collectEvents([q1, q2, q3], finished);
                await open;
                // fake provider は 1 実衁E1 私E E3 件を連続要求して重なりを作る
                for (const r of [q1, q2, q3]) {
                    const res = await postExecute(r);
                    assert(res.status === 200, `execute ${r} failed: ${await res.text()}`);
                }
                // 直後�Eキュー状慁E 1 件実行中 + 残りぁEFIFO 征E��E                const qs = await fetch(`${BASE}/api/runs/queue`, { headers: authHeader() }).then((r) => r.json());
                assert(qs.running !== null, `nothing running: ${JSON.stringify(qs)}`);
                assert(qs.running === q1, `running: ${qs.running}`);
                assert(qs.queued.join(',') === [q2, q3].join(','), `queued: ${qs.queued}`);
                await done;
                // started が要求頁E��あること�E�直列実行�E実証�E�E                const startedOrder = events.filter((e) => e.type === 'started').map((e) => e.runId);
                assert(startedOrder.join(',') === [q1, q2, q3].join(','), `started order: ${startedOrder}`);
                // 征E��しぁE2 件に queued�E�Eosition 付き�E�が通知されること
                const queuedEvents = events.filter((e) => e.type === 'queued');
                assert(queuedEvents.some((e) => e.runId === q2 && e.data.position === 1), 'q2 queued(1) missing');
                assert(queuedEvents.some((e) => e.runId === q3 && e.data.position === 2), 'q3 queued(2) missing');
                // 「started は常に直前�E complete/error の後、E 同時実行が 1 件であること
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
                // 全件がキューを通って完走し、backend も無亁E                const health = await fetch(`${BASE}/health`);
                assert(health.ok, 'backend unhealthy after queue drain');
            });
            await test('Queue: 征E��中の run をキャンセルすると列から除去されめE, async () => {
                const [, , , q4, q5] = queueRuns;
                await createLightRun(q4, true);
                await createLightRun(q5, true);
                const gotCancelled = (evts) => evts.some((e) => e.type === 'error' && e.runId === q5 && String(e.data.error).includes('Cancelled while queued'));
                const q4Done = (evts) => evts.some((e) => (e.type === 'complete' || e.type === 'error') && e.runId === q4);
                const { events, done, open } = collectEvents([q4, q5], (evts) => gotCancelled(evts) && q4Done(evts));
                await open;
                await postExecute(q4); // running�E�Es�E�E                await postExecute(q5); // queued
                let qs = await fetch(`${BASE}/api/runs/queue`, { headers: authHeader() }).then((r) => r.json());
                assert(qs.queued.includes(q5), `q5 not queued: ${JSON.stringify(qs)}`);
                const cancel = await fetch(`${BASE}/api/runs/${q5}/cancel`, { method: 'POST', headers: authHeader() });
                assert(cancel.status === 200, `cancel failed: ${cancel.status}`);
                qs = await fetch(`${BASE}/api/runs/queue`, { headers: authHeader() }).then((r) => r.json());
                assert(!qs.queued.includes(q5), `q5 still queued after cancel: ${JSON.stringify(qs)}`);
                await done;
                // q5 は started されなぁE��と�E�キャンセルが効ぁE��証拠�E�E                assert(!events.some((e) => e.type === 'started' && e.runId === q5), 'cancelled run was started');
                // canonical queue イベントがキャンセル後�E正しい状態！E5 不在�E�を配信してぁE��こと
                const queueEvents = events.filter((e) => e.type === 'queue');
                assert(queueEvents.length > 0, 'no canonical queue events');
                const afterCancel = queueEvents.find((e) => e.runId === q5 && !e.data.queued.includes(q5));
                assert(afterCancel, 'queue event after cancel does not reflect removal');
            });
            await test('Queue: WS 経由の cancel でも征E���Eから除去されめE, async () => {
                const [, , , , , q6, q7] = queueRuns;
                await createLightRun(q6, true);
                await createLightRun(q7, true);
                const q6Done = (evts) => evts.some((e) => (e.type === 'complete' || e.type === 'error') && e.runId === q6);
                const q7Cancelled = (evts) => evts.some((e) => e.type === 'error' && e.runId === q7 && String(e.data.error).includes('Cancelled while queued'));
                const { events, done, open } = collectEvents([q6, q7], (evts) => q6Done(evts) && q7Cancelled(evts));
                await open;
                await postExecute(q6); // running�E�Es�E�E                await postExecute(q7); // queued
                // WS メチE��ージでキャンセル�E�Execution-handler 経由  Eenqueue 即 return の
                // 非同期キューでも�E有キューに届くことの検証�E�E                await new Promise((res, reject) => {
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
            await test('Queue: WS execute 3 件も要求頁E��直列実行される', async () => {
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
                    // 1 本の WS から 3 件の execute メチE��ージを連続送信
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
            await test('Queue: production では靁Eapsf-run モード�E execute を拒否�E�契紁E�E実施行！E, async () => {
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
                        catch { /* not up */ }
                        assert(Date.now() < deadline, 'production backend did not start');
                        await new Promise((r2) => setTimeout(r2, 300));
                    }
                    // legacy モード�E 400
                    const legacy = await fetch(`http://localhost:${PROD_PORT}/api/runs/prod-test-1/execute`, {
                        method: 'POST',
                        headers: authHeader(),
                        body: JSON.stringify({ command: 'plan', provider: 'claude', roles: [], mode: 'cli-full' }),
                    });
                    assert(legacy.status === 400, `expected 400 for cli-full, got ${legacy.status}`);
                    const body = await legacy.json();
                    assert(String(body.error).includes('apsf-run'), `error message: ${body.error}`);
                    // apsf-run は受理される！Eun 不在のエラーは WS 側  EREST は 200 executing�E�E                    const ok = await fetch(`http://localhost:${PROD_PORT}/api/runs/2026-07-05-999_work_no-such-run/execute`, {
                        method: 'POST',
                        headers: authHeader(),
                        body: JSON.stringify({ command: 'build', provider: 'claude', roles: [], mode: 'apsf-run' }),
                    });
                    assert(ok.status === 200, `expected 200 for apsf-run, got ${ok.status}`);
                    // WS execute も同じ契紁E��拒否される！EEST 迂回の防止�E�E                    const prodWsToken = jwt.sign({ userId: 'test-user' }, JWT_SECRET);
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
                            catch { /* ignore */ }
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
                        catch { /* dead */ }
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
        console.log(`⏭�E�E SKIP  APSF framework tests (not found at ${apsfRoot})`);
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
    // ---- 認証モード！EUTH_MODE=demo / basic�E�E----
    await test('Auth mode: demo  EGET /auth/mode ぁEdemo、任意賁E��惁E��でログイン可', async () => {
        // メイン backend は AUTH_MODE 未設宁E= demo�E�既定！E        const mode = await fetch(`${BASE}/api/auth/mode`).then((r) => r.json());
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
    await test('Auth mode: basic  E正しい賁E��惁E�� 200 / 誤めE401 / register 403', async () => {
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
                catch { /* not up */ }
                assert(Date.now() < deadline, 'basic-mode backend did not start');
                await new Promise((r2) => setTimeout(r2, 300));
            }
            const B = `http://localhost:${BASIC_PORT}`;
            // モード�E閁E            const mode = await fetch(`${B}/api/auth/mode`).then((r) => r.json());
            assert(mode.mode === 'basic', `mode: ${mode.mode}`);
            // 正しい賁E��惁E�� ↁE200 + 宁EJWT�E�保護 API が呼べる！E            const ok = await fetch(`${B}/api/auth/login`, {
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
            // 誤パスワーチEↁE401�E�存在有無を漏らさなぁE��一メチE��ージ�E�E            const wrongPw = await fetch(`${B}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'admin@test.local', password: 'wrong' }),
            });
            assert(wrongPw.status === 401, `wrong password status: ${wrongPw.status}`);
            const wrongPwBody = await wrongPw.json();
            // 未知ユーザー ↁE401 で同一メチE��ージ�E�ユーザー列挙の防止�E�E            const noUser = await fetch(`${B}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'ghost@test.local', password: 'whatever' }),
            });
            assert(noUser.status === 401, `unknown user status: ${noUser.status}`);
            const noUserBody = await noUser.json();
            assert(wrongPwBody.error === noUserBody.error, `error messages differ: "${wrongPwBody.error}" vs "${noUserBody.error}"`);
            // register は 403�E�管琁E��E�Eファイル運用�E�E            const reg = await fetch(`${B}/api/auth/register`, {
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
                catch { /* dead */ }
            }
            else {
                child.kill('SIGTERM');
            }
        }
    });
    await test('Auth mode: 本番 + demo は起動時に警告ログを�EぁE, async () => {
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
                catch { /* not up */ }
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
                catch { /* dead */ }
            }
            else {
                child.kill('SIGTERM');
            }
        }
    });
    await test('Auth mode: 本番 + 不正な AUTH_MODE は起動拒否�E�Exit 1�E�E, async () => {
        let output = '';
        const code = await new Promise((res, reject) => {
            const child = spawn(`npx tsx "${resolve(__dirname, 'src/index.ts')}"`, {
                cwd: FIXTURE_DIR, // .env のなぁE��ィレクトリ�E�Eotenv 経由の env 供給を防ぐ！E                shell: true,
                env: {
                    ...process.env,
                    NODE_ENV: 'production',
                    PORT: '3299',
                    JWT_SECRET,
                    AUTH_MODE: 'basci', // typo を模した不正値
                },
            });
            child.stdout?.on('data', (d) => (output += d.toString()));
            child.stderr?.on('data', (d) => (output += d.toString()));
            const t = setTimeout(() => {
                child.kill();
                reject(new Error('did not exit within 10s  Estarted with invalid AUTH_MODE?'));
            }, 10000);
            child.on('close', (c) => { clearTimeout(t); res(c); });
        });
        assert(code === 1, `expected exit 1, got ${code}`);
        assert(output.includes("Invalid AUTH_MODE 'basci'"), `error message missing: ${output.slice(0, 300)}`);
    });
    stopBackend();
    // ---- セキュリチE��: 本番起動ガーチE----
    await test('Production without JWT_SECRET refuses to start (exit 1)', async () => {
        const env = {
            ...process.env,
            NODE_ENV: 'production',
            PORT: '3199',
        };
        delete env.JWT_SECRET;
        const code = await new Promise((res, reject) => {
            // cwd めE.env のなぁE��ィレクトリにして dotenv 経由の JWT_SECRET 供給を防ぁE            const child = spawn(`npx tsx "${resolve(__dirname, 'src/index.ts')}"`, {
                cwd: FIXTURE_DIR,
                shell: true,
                env,
            });
            const t = setTimeout(() => {
                child.kill();
                reject(new Error('did not exit within 10s  Estarted without JWT_SECRET?'));
            }, 10000);
            child.on('close', (c) => { clearTimeout(t); res(c); });
        });
        assert(code === 1, `expected exit 1, got ${code}`);
    });
    // ---- Results ----
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
