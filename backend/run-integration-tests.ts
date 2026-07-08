/**
 * Backend Integration Test Runner (REAL implementation)
 *
 * テスト内製サーバーは使用しない。
 * 実際の backend/src/index.ts を子プロセスとして起動し、
 * ExecutionHandler / APSFBridgeService / routes / auth middleware を
 * 実装コード経由で検証する。
 *
 * AI CLI は __tests__/fixtures/fake_cli.py（実 python プロセス）に差し替えて
 * 本物の実行経路（実 spawn・実 stdout/stderr ストリーム・実 exit code）を通す。
 */
import { spawn, ChildProcess, execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.TEST_PORT || 3111);
const BASE = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}`;
/** WS は REST と同等の JWT 認証（?token=）を要求する */
const wsAuthUrl = () =>
  `${WS_URL}/?token=${encodeURIComponent(jwt.sign({ userId: 'test-user' }, JWT_SECRET))}`;
const JWT_SECRET = 'integration-test-secret';
const FIXTURE_DIR = resolve(__dirname, '__tests__/fixtures');
// 実 APSF Framework の場所（このマシンの実物。他環境では APSF_ROOT で指定）
const APSF_ROOT_DEFAULT = 'C:/Users/PC_User/PRJ/ai-problem-solving-framework';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL';
  duration: number;
  message?: string;
}

const results: TestResult[] = [];
let backend: ChildProcess | undefined;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, status: 'PASS', duration: Date.now() - start });
    console.log(`✅ PASS  ${name} (${Date.now() - start}ms)`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    results.push({ name, status: 'FAIL', duration: Date.now() - start, message });
    console.log(`❌ FAIL  ${name} — ${message}`);
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function authHeader(): Record<string, string> {
  const token = jwt.sign({ userId: 'test-user' }, JWT_SECRET);
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/** 実 backend (src/index.ts) を起動 */
function startBackend(): Promise<void> {
  return new Promise((res, reject) => {
    backend = spawn('npx tsx src/index.ts', {
      cwd: __dirname,
      shell: true,
      env: {
        ...process.env,
        PORT: String(PORT),
        JWT_SECRET,
        // Executor (CLI-FULL/LITE) 用の実プロセス CLI フィクスチャ
        APSF_CLI_OVERRIDE: `python "${resolve(FIXTURE_DIR, 'fake_cli.py')}"`,
        RUNS_DIR: resolve(__dirname, 'runs'),
        // 実 APSF Framework（存在する環境でのみ apsf-run テストが実行される）
        APSF_ROOT: process.env.APSF_ROOT || APSF_ROOT_DEFAULT,
      },
    });
    backend.stdout?.on('data', (d) => process.env.DEBUG_BACKEND && console.log(`[backend] ${d}`));
    backend.stderr?.on('data', (d) => console.error(`[backend:err] ${d}`));
    backend.on('exit', (code) => {
      if (code !== null && code !== 0) console.error(`[backend] exited with code ${code}`);
    });

    // /health が返るまでポーリング（最大 15 秒）
    const deadline = Date.now() + 15000;
    const poll = async () => {
      try {
        const r = await fetch(`${BASE}/health`);
        if (r.ok) return res();
      } catch { /* not up yet */ }
      if (Date.now() > deadline) return reject(new Error('Backend did not start within 15s'));
      setTimeout(poll, 300);
    };
    poll();
  });
}

function stopBackend(): void {
  if (!backend || backend.pid === undefined) return;
  if (process.platform === 'win32') {
    try { execSync(`taskkill /pid ${backend.pid} /T /F`, { stdio: 'pipe' }); } catch { /* already dead */ }
  } else {
    backend.kill('SIGTERM');
  }
}

/** WS を開き、（何も送らずに）条件を満たすブロードキャストイベントを待つ */
function waitForEvent(predicate: (msg: any) => boolean, timeoutMs = 10000): Promise<any> {
  return new Promise((res, reject) => {
    const ws = new WebSocket(wsAuthUrl());
    const received: string[] = [];
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
      } catch { /* ignore */ }
    });
    ws.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

/** WS を開き、execute を送り、条件を満たすイベントを待つ */
function executeAndWaitFor(
  payload: Record<string, unknown>,
  predicate: (msg: any) => boolean,
  timeoutMs = 10000
): Promise<any> {
  return new Promise((res, reject) => {
    const ws = new WebSocket(wsAuthUrl());
    const received: string[] = [];
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
      } catch { /* ignore non-JSON */ }
    });
    ws.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

async function main(): Promise<void> {
  console.log('🚀 Backend Integration Tests — REAL backend/src/index.ts\n');

  // 前回実行の artifact を除去（stale pass 防止）
  const { rmSync } = await import('fs');
  rmSync(resolve(__dirname, 'runs'), { recursive: true, force: true });

  await startBackend();
  console.log(`✅ Real backend started on port ${PORT}\n`);

  // ---- REST (routes + auth middleware 実装経由) ----

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

  await test('POST execute (CLI-FULL mode): real executor runs → complete via WS', async () => {
    // WS を先に開いて REST 実行の complete イベントを待ち受ける（Router 配線の実証）
    const wsEvents = waitForEvent(
      (m) => m.type === 'complete' && m.runId === 'rest-full-1' && m.data?.mode === 'cli-full'
    );
    const r = await fetch(`${BASE}/api/runs/rest-full-1/execute`, {
      method: 'POST',
      headers: authHeader(),
      body: JSON.stringify({ command: 'plan', provider: 'claude', roles: ['judge'], mode: 'cli-full' }),
    });
    const body = await r.json();
    assert(r.status === 200 && body.status === 'executing' && body.mode === 'cli-full',
      `unexpected: ${r.status} ${JSON.stringify(body)}`);
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

  await test('POST execute (CLI-LITE mode): real executor runs → complete via WS', async () => {
    const wsEvents = waitForEvent(
      (m) => m.type === 'complete' && m.runId === 'rest-lite-1' && m.data?.mode === 'cli-lite'
    );
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

  await test('WS execute (CLI-FULL mode) with failing CLI → error event', async () => {
    const msg = await executeAndWaitFor(
      { runId: 'ws-mode-fail', provider: 'claude', command: 'plan', roles: [], mode: 'cli-full', goal: 'fail' },
      (m) => m.type === 'error' && m.runId === 'ws-mode-fail'
    );
    assert(String(msg.data.error).includes('exited with code 1'), `error: ${msg.data.error}`);
  });

  await test('API mode: returns error event (not implemented, no crash)', async () => {
    await executeAndWaitFor(
      { runId: 'ws-api-1', provider: 'claude', command: 'plan', roles: [], mode: 'api' },
      (m) => m.type === 'error' && m.runId === 'ws-api-1'
    );
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

  // ---- WebSocket (ExecutionHandler + Executor 実装経由) ----

  await test('WebSocket: connection to real server', async () => {
    await new Promise<void>((res, reject) => {
      const ws = new WebSocket(wsAuthUrl());
      const t = setTimeout(() => reject(new Error('connect timeout')), 5000);
      ws.on('open', () => { clearTimeout(t); ws.close(); res(); });
      ws.on('error', reject);
    });
  });

  await test('WS auth: no token → close(4401)', async () => {
    const code = await new Promise<number>((res, reject) => {
      const ws = new WebSocket(WS_URL);
      const t = setTimeout(() => { ws.close(); reject(new Error('not closed within 5s')); }, 5000);
      ws.on('close', (c) => { clearTimeout(t); res(c); });
      ws.on('error', reject);
    });
    assert(code === 4401, `close code: ${code}`);
  });

  await test('WS auth: invalid token → close(4401)', async () => {
    const code = await new Promise<number>((res, reject) => {
      const ws = new WebSocket(`${WS_URL}/?token=not-a-jwt`);
      const t = setTimeout(() => { ws.close(); reject(new Error('not closed within 5s')); }, 5000);
      ws.on('close', (c) => { clearTimeout(t); res(c); });
      ws.on('error', reject);
    });
    assert(code === 4401, `close code: ${code}`);
  });

  await test('WS auth: expired token → close(4401)', async () => {
    const expired = jwt.sign({ userId: 'test-user' }, JWT_SECRET, { expiresIn: -60 });
    const code = await new Promise<number>((res, reject) => {
      const ws = new WebSocket(`${WS_URL}/?token=${encodeURIComponent(expired)}`);
      const t = setTimeout(() => { ws.close(); reject(new Error('not closed within 5s')); }, 5000);
      ws.on('close', (c) => { clearTimeout(t); res(c); });
      ws.on('error', reject);
    });
    assert(code === 4401, `close code: ${code}`);
  });

  await test('WS auth: unauthenticated execute is not processed', async () => {
    // 無認証接続で execute を送り込み、実行が発生しないことを実証する。
    // 接続は即 close されるため、送信できても executionHandler には届かない
    const runId = `unauth-${Date.now()}`;
    const outcome = await new Promise<{ opened: boolean; sent: boolean; closeCode: number; events: string[] }>((res) => {
      const state = { opened: false, sent: false, closeCode: 0, events: [] as string[] };
      const ws = new WebSocket(WS_URL);
      // open が来ても来なくても送信を試みる（close 前に届くかはレース）
      ws.on('open', () => {
        state.opened = true;
        try {
          ws.send(JSON.stringify({
            type: 'execute',
            payload: { runId, provider: 'claude', command: 'plan', roles: [], mode: 'cli-full' },
          }));
          state.sent = true;
        } catch { /* already closing */ }
      });
      // 認証前の接続にはいかなるイベントも配信されないこと
      ws.on('message', (raw) => {
        try { state.events.push(JSON.parse(raw.toString()).type); } catch { /* ignore */ }
      });
      ws.on('close', (code) => { state.closeCode = code; res(state); });
      ws.on('error', () => res(state));
    });
    // 同一シナリオで 4401 close を確認（決定的な証拠）
    assert(outcome.closeCode === 4401, `close code: ${outcome.closeCode}`);
    assert(outcome.events.length === 0, `events leaked to unauthenticated socket: ${outcome.events.join(',')}`);
    // 実行されていれば runs/<runId>/ に artifact が生成される（cli-full）。
    // executor 起動猶予を見込んで待つ
    await new Promise((r2) => setTimeout(r2, 1500));
    const { existsSync } = await import('fs');
    assert(!existsSync(resolve(__dirname, 'runs', runId)), 'unauthenticated execute was processed!');
    const health = await fetch(`${BASE}/health`);
    assert(health.ok, 'backend crashed on unauthenticated execute');
  });

  await test('WebSocket: execute → execution-start event', async () => {
    const msg = await executeAndWaitFor(
      { runId: 'ws-run-1', provider: 'claude', command: 'plan', roles: ['judge'] },
      (m) => m.type === 'execution-start' && m.runId === 'ws-run-1'
    );
    assert(msg.provider === 'claude', 'provider mismatch');
  });

  await test('WebSocket: real python process → progress event (default mode)', async () => {
    const msg = await executeAndWaitFor(
      { runId: 'ws-run-2', provider: 'claude', command: 'plan', roles: ['judge'] },
      (m) => m.type === 'progress' && m.runId === 'ws-run-2'
    );
    assert(msg.data && msg.data.mode === 'cli-full', `progress data.mode: ${msg.data?.mode}`);
  });

  await test('WebSocket: real python exit 0 → complete event', async () => {
    const msg = await executeAndWaitFor(
      { runId: 'ws-run-3', provider: 'claude', command: 'plan', roles: ['judge'] },
      (m) => m.type === 'complete' && m.runId === 'ws-run-3'
    );
    assert(msg.data.exitCode === 0, `exitCode: ${msg.data.exitCode}`);
  });

  await test('WebSocket: real python exit 1 → error event (no crash)', async () => {
    const msg = await executeAndWaitFor(
      { runId: 'ws-run-4', provider: 'claude', command: 'plan', roles: ['judge'], goal: 'fail' },
      (m) => m.type === 'error' && m.runId === 'ws-run-4'
    );
    assert(msg.data.error, 'error payload missing');
    const r = await fetch(`${BASE}/health`);
    assert(r.ok, 'backend crashed after failing execution');
  });

  await test('WebSocket: invalid JSON message → error response', async () => {
    await new Promise<void>((res, reject) => {
      const ws = new WebSocket(wsAuthUrl());
      const t = setTimeout(() => { ws.close(); reject(new Error('no error response')); }, 5000);
      ws.on('open', () => ws.send('this is not json'));
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'error') { clearTimeout(t); ws.close(); res(); }
      });
      ws.on('error', reject);
    });
  });

  await test('WebSocket: concurrent executions both complete', async () => {
    const [a, b] = await Promise.all([
      executeAndWaitFor(
        { runId: 'conc-1', provider: 'claude', command: 'plan', roles: [] },
        (m) => m.type === 'complete' && m.runId === 'conc-1'
      ),
      executeAndWaitFor(
        { runId: 'conc-2', provider: 'claude', command: 'plan', roles: [] },
        (m) => m.type === 'complete' && m.runId === 'conc-2'
      ),
    ]);
    assert(a.runId === 'conc-1' && b.runId === 'conc-2', 'runId mismatch');
  });

  // ---- ExecutionModeRouter（実装モジュールを直接検証） ----

  await test('ExecutionModeRouter: returns real executor per mode', async () => {
    const { ExecutionModeRouter } = await import('./src/services/execution-mode-router.js');
    const router = new ExecutionModeRouter('cli-full');
    const full = router.getExecutor({ runId: 'r', command: 'c', provider: 'claude', roles: [], mode: 'cli-full' } as any);
    const lite = router.getExecutor({ runId: 'r', command: 'c', provider: 'claude', roles: [], mode: 'cli-lite' } as any);
    assert(full.constructor.name === 'CLIFullExecutor', `got ${full.constructor.name}`);
    assert(lite.constructor.name === 'CLILiteExecutor', `got ${lite.constructor.name}`);
    let threw = false;
    try { router.setMode('bogus' as any); } catch { threw = true; }
    assert(threw, 'setMode(bogus) should throw');
  });

  // ---- 実 APSF Framework 結合（apsf-run mode） ----

  const { existsSync: apsfExists } = await import('fs');
  const apsfRoot = process.env.APSF_ROOT || APSF_ROOT_DEFAULT;

  if (apsfExists(resolve(apsfRoot, 'runs'))) {
    let knownRun = '';

    await test('APSF: GET /api/runs/apsf lists real framework runs', async () => {
      const r = await fetch(`${BASE}/api/runs/apsf`, { headers: authHeader() });
      const body = await r.json();
      assert(r.status === 200 && body.available === true, `unexpected: ${JSON.stringify(body).slice(0, 200)}`);
      assert(Array.isArray(body.runs) && body.runs.length > 0, 'no runs found');
      assert(body.runs.every((n: string) => /^\d{4}-\d{2}-\d{2}/.test(n)), 'non-run entry in list');
      knownRun = body.runs[body.runs.length - 1];
    });

    await test('APSF: GET /api/runs/apsf/:id/phase runs real `apsf next`', async () => {
      assert(knownRun, 'no known run from previous test');
      const r = await fetch(`${BASE}/api/runs/apsf/${encodeURIComponent(knownRun)}/phase`, {
        headers: authHeader(),
      });
      const body = await r.json();
      assert(r.status === 200, `status ${r.status}: ${JSON.stringify(body).slice(0, 200)}`);
      // 実フェーズトークン（PLAN_NEEDED / BUILD_NEEDED / COMPLETE 等）
      assert(/^[A-Z_]+$/.test(body.phase), `unexpected phase: ${body.phase}`);
    });

    await test('APSF: execute (apsf-run mode) with nonexistent run → error event', async () => {
      const msg = await executeAndWaitFor(
        { runId: 'no-such-run-xyz', provider: 'claude', command: 'plan', roles: [], mode: 'apsf-run' },
        (m) => m.type === 'error' && m.runId === 'no-such-run-xyz',
        30000
      );
      assert(msg.data.error, 'error payload missing');
      // backend がクラッシュしていないこと
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
      const r = await fetch(
        `${BASE}/api/runs/apsf/${encodeURIComponent(knownRun)}/files/task.md`,
        { headers: authHeader() }
      );
      // task.md がある run（light）なら 200、なければ 404 — どちらも正常経路
      assert(r.status === 200 || r.status === 404, `unexpected status ${r.status}`);
      if (r.status === 200) {
        const body = await r.json();
        assert(typeof body.content === 'string' && body.content.length > 0, 'empty content');
      }
    });

    await test('APSF: files endpoint rejects non-whitelisted filename (400)', async () => {
      const r = await fetch(
        `${BASE}/api/runs/apsf/${encodeURIComponent(knownRun)}/files/run_state.json`,
        { headers: authHeader() }
      );
      assert(r.status === 400, `expected 400, got ${r.status}`);
    });

    await test('APSF: GET advisory returns judge_advisory.json when present', async () => {
      // full-cycle 検証済み run は advisory を持つ
      const r = await fetch(
        `${BASE}/api/runs/apsf/2026-07-05-902_work_explorer-native-smoke/advisory`,
        { headers: authHeader() }
      );
      if (r.status === 200) {
        const body = await r.json();
        assert(body.advisory === null || typeof body.advisory.recommendation === 'string',
          `unexpected advisory: ${JSON.stringify(body).slice(0, 150)}`);
      } else {
        assert(r.status === 400, `unexpected status ${r.status}`); // run が無い環境
      }
    });

    await test('APSF: POST create run → TASK_NEEDED → write-phase advances phase', async () => {
      const tmpRun = '2026-07-05-999_work_explorer-api-test';
      const { rmSync: rmRun, existsSync: runExists } = await import('fs');
      const tmpDir = resolve(apsfRoot, 'runs/work', tmpRun);
      // 前回の残骸を除去
      rmRun(tmpDir, { recursive: true, force: true });

      try {
        // 1. 作成
        const create = await fetch(`${BASE}/api/runs/apsf`, {
          method: 'POST',
          headers: authHeader(),
          body: JSON.stringify({ runName: tmpRun, light: true, taxonomy: 'work' }),
        });
        const created = await create.json();
        assert(create.status === 200, `create failed: ${JSON.stringify(created).slice(0, 200)}`);
        assert(created.phase === 'TASK_NEEDED', `phase after create: ${created.phase}`);

        // 2. human フェーズの記入（write-phase 経由）
        const write = await fetch(`${BASE}/api/runs/apsf/${tmpRun}/write-phase`, {
          method: 'POST',
          headers: authHeader(),
          body: JSON.stringify({
            content:
              '# Task\n\n## What\n\nAPI 経由の write-phase 検証。ダミータスク。\n\n' +
              '## Context\n\n- API テスト用の一時 run\n- 実行はしない\n\n' +
              '## Done Criteria\n\n- [x] task.md が API 経由で保存される\n',
          }),
        });
        const written = await write.json();
        assert(write.status === 200, `write failed: ${JSON.stringify(written).slice(0, 200)}`);
        assert(written.fileWritten === 'task.md', `fileWritten: ${written.fileWritten}`);
        assert(written.phase === 'BUILD_NEEDED', `phase after write: ${written.phase}`);
      } finally {
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
      const events: any[] = [];
      bridge.on('event', (e: any) => events.push(e));

      // BUILD_NEEDED の一時 run を用意（DryRun でも apsf act 実行に ~2s かかる）
      const tmpRun = '2026-07-05-998_work_explorer-guard-test';
      const tmpDir = resolve(apsfRoot, 'runs/work', tmpRun);
      rmRun(tmpDir, { recursive: true, force: true });
      await bridge.createRun(tmpRun, { light: true, taxonomy: 'work' });
      await bridge.writePhase(tmpRun,
        '# Task\n\n## What\n\n二重実行ガードの検証用ダミー。\n\n' +
        '## Context\n\n- テスト用一時 run\n- AI 実行はしない（DryRun のみ）\n\n' +
        '## Done Criteria\n\n- [x] ガードが機能する\n');

      try {
        // 実行登録は execute の同期プロローグで行われるため、await せずに
        // 2 連続で呼べば 2 回目は決定的に拒否される
        // （ネイティブ化で DryRun が数 ms になったため sleep 方式は不可）
        const first = bridge.execute({
          runId: tmpRun, command: 'build', provider: 'claude', roles: [], mode: 'apsf-run',
          context: { dryRun: true },
        } as any);
        const second = bridge.execute({
          runId: tmpRun, command: 'build', provider: 'claude', roles: [], mode: 'apsf-run',
          context: { dryRun: true },
        } as any);
        await Promise.all([first, second]);

        const rejection = events.find(
          (e) => e.type === 'error' && String(e.data?.error).includes('already executing')
        );
        assert(rejection, `no double-execution rejection. events: ${events.map((e) => e.type).join(',')}`);
        // 1 回目は正常完了していること
        const completed = events.find((e) => e.type === 'complete');
        assert(completed, 'first execution did not complete');
      } finally {
        rmRun(tmpDir, { recursive: true, force: true });
      }
    });
    // ---- Judge 裁定（IMPROVE_NEEDED → Accept / Return to Build / Return to Plan） ----

    const REVIEW_WITH_ADVISORY =
      '# Review\n\n## Findings\n\n- 統合テスト用のレビュー本文。\n- 実 write-phase 経由で保存される。\n\n' +
      '## Assessment\n\n- 判定はテストシナリオに応じて Judge が裁定する。\n\n' +
      '```apsf-judge-advisory\n{"recommendation": "Return to Build", "human_owned_blocker": false}\n```\n';

    const TEST_BUILD_MD =
      '# Build\n\n## Work Done\n\n- テスト用のダミー成果物を作成した。\n- 実装は存在しない（裁定検証用）。\n\n' +
      '## Notes\n\n- Judge 裁定テストの前段フェーズ。\n- write-phase 経由で REVIEW_NEEDED へ遷移する。\n';

    async function writePhaseApi(runName: string, file: string, content: string): Promise<void> {
      const w = await fetch(`${BASE}/api/runs/apsf/${runName}/write-phase`, {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ content }),
      });
      const body = await w.json();
      assert(w.status === 200, `write ${file} failed: ${JSON.stringify(body).slice(0, 200)}`);
    }

    async function phaseOf(runName: string): Promise<string> {
      const p = await fetch(`${BASE}/api/runs/apsf/${runName}/phase`, { headers: authHeader() });
      return (await p.json()).phase;
    }

    /** 一時 run を API 経由で IMPROVE_NEEDED まで駆動する（light/heavy 両対応） */
    async function driveToImprove(runName: string, opts: { light: boolean } = { light: true }): Promise<void> {
      const create = await fetch(`${BASE}/api/runs/apsf`, {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ runName, light: opts.light, taxonomy: 'work' }),
      });
      assert(create.status === 200, `create failed: ${await create.text()}`);
      const writes: Array<[string, string]> = opts.light
        ? [
            ['task.md',
              '# Task\n\n## What\n\nJudge 裁定の統合テスト用 run。\n\n' +
              '## Context\n\n- 3 経路（Accept/Return to Build/Return to Plan）の検証\n- 実フェーズ遷移を通す\n\n' +
              '## Done Criteria\n\n- [x] IMPROVE_NEEDED に到達する\n'],
          ]
        : [
            ['execution-assignment.md',
              '# Execution Assignment\n\n## Roles\n\n- Planner: テスト\n- Builder: テスト\n- Critic: テスト\n- Judge: テスト\n'],
            ['goal.md',
              '# Goal\n\n## Goal Statement\n\nJudge 裁定（Return to Plan）の heavy run 統合テスト。\n\n' +
              '## Success Criteria\n\n- PLAN_NEEDED へ差し戻せる\n- plan_review.md に理由が残る\n- 下流成果物が退避される\n'],
            ['plan.md',
              '# Plan\n\n## Approach\n\n- テスト用のダミー計画。\n- 実装はしない。\n\n' +
              '## Steps\n\n- ダミー build を書く\n- ダミー review を書く\n'],
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
      await test('APSF Judge: Return to Build → BUILD_NEEDED + build_review.md + 下流退避', async () => {
        await driveToImprove(judgeRuns.build);
        const r = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.build}/judge`, {
          method: 'POST',
          headers: authHeader(),
          body: JSON.stringify({ decision: 'Return to Build', reason: 'ビルドの検証手順が不足しているため差し戻す。' }),
        });
        const body = await r.json();
        assert(r.status === 200, `judge failed: ${JSON.stringify(body).slice(0, 200)}`);
        assert(body.phaseAfter === 'BUILD_NEEDED', `phaseAfter: ${body.phaseAfter}`);
        assert(body.reasonFile === 'build_review.md', `reasonFile: ${body.reasonFile}`);
        assert(body.matchesAdvisory === true, `matchesAdvisory: ${body.matchesAdvisory}`);
        // 理由ファイルの実体
        const runDir = resolve(apsfRoot, 'runs/work', judgeRuns.build);
        const reviewPath = resolve(runDir, 'build_review.md');
        assert(judgeFileExists(reviewPath), 'build_review.md not created');
        const content = readJudgeFile(reviewPath, 'utf-8');
        assert(content.includes('ビルドの検証手順が不足'), 'reason missing in build_review.md');
        assert(content.includes('Return to Build'), 'decision missing in build_review.md');
        // 下流成果物の退避（残すと advisory 検出が再ビルド/再レビューを追い越す）
        assert(Array.isArray(body.supersededFiles) && body.supersededFiles.length === 2,
          `supersededFiles: ${JSON.stringify(body.supersededFiles)}`);
        assert(!judgeFileExists(resolve(runDir, 'build.md')), 'stale build.md not superseded');
        assert(!judgeFileExists(resolve(runDir, 'review.md')), 'stale review.md not superseded');
        assert(!judgeFileExists(resolve(runDir, 'judge_advisory.json')), 'stale judge_advisory.json not removed');
        for (const f of body.supersededFiles) {
          assert(judgeFileExists(resolve(runDir, f)), `superseded file missing: ${f}`);
        }
        // 遷移後の実フェーズ検出（canonical と advisory の両方が BUILD_NEEDED）
        assert((await phaseOf(judgeRuns.build)) === 'BUILD_NEEDED', 'detected phase is not BUILD_NEEDED');
      });

      await test('APSF Judge: 差し戻し後にループが完走する（再 BUILD → 再 REVIEW → IMPROVE）', async () => {
        // 差し戻し済み run で build.md → review.md を書き直し、advisory が再生成されること
        await writePhaseApi(judgeRuns.build, 'build.md (round 2)', TEST_BUILD_MD);
        assert((await phaseOf(judgeRuns.build)) === 'REVIEW_NEEDED', 'rebuild did not reach REVIEW_NEEDED');
        await writePhaseApi(judgeRuns.build, 'review.md (round 2)', REVIEW_WITH_ADVISORY);
        assert((await phaseOf(judgeRuns.build)) === 'IMPROVE_NEEDED', 're-review did not reach IMPROVE_NEEDED');
        const advisoryPath = resolve(apsfRoot, 'runs/work', judgeRuns.build, 'judge_advisory.json');
        assert(judgeFileExists(advisoryPath), 'judge_advisory.json not regenerated after re-review');
      });

      await test('APSF Judge: repeated judge call after loop closes → 200 then 409 at BUILD', async () => {
        // ループ完走後は再び IMPROVE_NEEDED — 2 回目の Return to Build も成立する（repeat 追記）
        const again = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.build}/judge`, {
          method: 'POST',
          headers: authHeader(),
          body: JSON.stringify({ decision: 'Return to Build', reason: '2 周目の差し戻し検証。理由は前回と同一ファイルに追記される。' }),
        });
        const body = await again.json();
        assert(again.status === 200, `second judge failed: ${JSON.stringify(body).slice(0, 200)}`);
        const content = readJudgeFile(resolve(apsfRoot, 'runs/work', judgeRuns.build, 'build_review.md'), 'utf-8');
        assert(content.includes('ビルドの検証手順が不足') && content.includes('2 周目の差し戻し検証'),
          'build_review.md should accumulate both decisions');
        // この時点で run は 2 周目の BUILD_NEEDED — 裁定は 409 で拒否される
        const r = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.build}/judge`, {
          method: 'POST',
          headers: authHeader(),
          body: JSON.stringify({ decision: 'Return to Build', reason: '二重裁定の検証。' }),
        });
        assert(r.status === 409, `expected 409, got ${r.status}`);
      });

      await test('APSF Judge: Return to Plan (heavy) → PLAN_NEEDED + plan_review.md + 下流退避', async () => {
        await driveToImprove(judgeRuns.plan, { light: false });
        const r = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.plan}/judge`, {
          method: 'POST',
          headers: authHeader(),
          body: JSON.stringify({ decision: 'Return to Plan', reason: '計画の前提が崩れているため計画からやり直す。' }),
        });
        const body = await r.json();
        assert(r.status === 200, `judge failed: ${JSON.stringify(body).slice(0, 200)}`);
        assert(body.phaseAfter === 'PLAN_NEEDED', `phaseAfter: ${body.phaseAfter}`);
        assert(body.reasonFile === 'plan_review.md', `reasonFile: ${body.reasonFile}`);
        // advisory は Return to Build 推奨 → 不一致が記録される
        assert(body.matchesAdvisory === false, `matchesAdvisory: ${body.matchesAdvisory}`);
        const runDir = resolve(apsfRoot, 'runs/work', judgeRuns.plan);
        assert(judgeFileExists(resolve(runDir, 'plan_review.md')), 'plan_review.md not created');
        assert(readJudgeFile(resolve(runDir, 'plan_review.md'), 'utf-8').includes('計画の前提が崩れている'), 'reason missing');
        // plan / build / review が退避される
        assert(body.supersededFiles.length === 3, `supersededFiles: ${JSON.stringify(body.supersededFiles)}`);
        for (const f of ['plan.md', 'build.md', 'review.md']) {
          assert(!judgeFileExists(resolve(runDir, f)), `stale ${f} not superseded`);
        }
        assert((await phaseOf(judgeRuns.plan)) === 'PLAN_NEEDED', 'detected phase is not PLAN_NEEDED');
      });

      await test('APSF Judge: light run への Return to Plan → 400（plan フェーズなし）', async () => {
        await driveToImprove(judgeRuns.accept);
        const r = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.accept}/judge`, {
          method: 'POST',
          headers: authHeader(),
          body: JSON.stringify({ decision: 'Return to Plan', reason: 'light run では拒否されるはず。' }),
        });
        assert(r.status === 400, `expected 400, got ${r.status}`);
        assert((await phaseOf(judgeRuns.accept)) === 'IMPROVE_NEEDED', 'phase changed despite 400');
      });

      await test('APSF Judge: Return without reason → 400', async () => {
        // judgeRuns.accept は前テストで IMPROVE_NEEDED のまま
        const r = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.accept}/judge`, {
          method: 'POST',
          headers: authHeader(),
          body: JSON.stringify({ decision: 'Return to Build' }),
        });
        assert(r.status === 400, `expected 400, got ${r.status}`);
        // 400 の裁定は状態を変えないこと
        const p = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.accept}/phase`, { headers: authHeader() });
        assert((await p.json()).phase === 'IMPROVE_NEEDED', 'phase changed despite 400');
      });

      await test('APSF Judge: Accept → no transition, improve.md write → RESULT_NEEDED', async () => {
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
        assert(
          events.some((e) => e.event_type === 'judge_decision' && e.payload?.decision === 'Accept'),
          'judge_decision Accept event not recorded'
        );
        // 既存フロー: improve.md の記入で RESULT_NEEDED へ
        const w = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.accept}/write-phase`, {
          method: 'POST',
          headers: authHeader(),
          body: JSON.stringify({
            content:
              '# Improve\n\n## Decision\n\n- Accept（統合テスト）。\n\n' +
              '## Notes\n\n- 裁定 Accept 経路の検証。\n- 追加改善は不要。\n- write-phase 経由で RESULT_NEEDED へ遷移する。\n',
          }),
        });
        const written = await w.json();
        assert(w.status === 200, `improve write failed: ${JSON.stringify(written).slice(0, 200)}`);
        assert(written.phase === 'RESULT_NEEDED', `phase after improve: ${written.phase}`);
      });

      await test('APSF Judge: invalid decision → 400', async () => {
        const r = await fetch(`${BASE}/api/runs/apsf/${judgeRuns.build}/judge`, {
          method: 'POST',
          headers: authHeader(),
          body: JSON.stringify({ decision: 'Reject Everything', reason: 'x' }),
        });
        assert(r.status === 400, `expected 400, got ${r.status}`);
      });
    } finally {
      rmJudgeRuns();
    }

    // ---- クラッシュ回復（executor_state.json マーカー + recoverOrphanedRuns） ----

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

    const TASK_MD =
      '# Task\n\n## What\n\nクラッシュ回復の統合テスト用 run。\n\n' +
      '## Context\n\n- executor_state.json マーカーの回復動作を検証\n- AI 実行はしない\n\n' +
      '## Done Criteria\n\n- [x] 回復動作が検証される\n';

    async function createLightRun(runName: string, toBuild: boolean): Promise<void> {
      const create = await fetch(`${BASE}/api/runs/apsf`, {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ runName, light: true, taxonomy: 'work' }),
      });
      assert(create.status === 200, `create failed: ${await create.text()}`);
      if (toBuild) await writePhaseApi(runName, 'task.md', TASK_MD);
    }

    try {
      await test('Crash recovery: AUTO フェーズの stale マーカー → failed + last_error', async () => {
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

        // run_state に failed + last_error が永続化され、phase API から見える
        const p = await fetch(`${BASE}/api/runs/apsf/${crashRuns.auto}/phase`, { headers: authHeader() });
        const info = await p.json();
        assert(info.phase === 'BUILD_NEEDED', `phase: ${info.phase}`);
        assert(info.phaseStatus === 'failed', `phaseStatus: ${info.phaseStatus}`);
        assert(String(info.lastError).includes('pid=99999'), `lastError: ${info.lastError}`);
      });

      await test('Crash recovery: human フェーズの stale マーカー → 除去のみ（誤 failed 化しない）', async () => {
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

      await test('Crash recovery: executor 正常系はマーカーを残さない（human 停止ループ）', async () => {
        const { NativeApsfExecutor } = await import('./src/services/apsf-native/native-executor.js');
        const executor = new NativeApsfExecutor(apsfRoot);
        // TASK_NEEDED（human）で即停止するループ — マーカーの書き込み〜削除を通る
        const result = await executor.executeLoop({ runId: crashRuns.human, provider: 'claude' });
        assert(result.stopReason === 'human_phase', `stopReason: ${result.stopReason}`);
        const runDir = resolve(apsfRoot, 'runs/work', crashRuns.human);
        assert(!judgeFileExists(resolve(runDir, 'executor_state.json')), 'marker left behind');
      });

      await test('Crash recovery: 実行中の backend を kill -9 相当で強制終了 → 再起動で回復', async () => {
        const KILL_PORT = PORT + 50;
        await createLightRun(crashRuns.kill, true); // BUILD_NEEDED
        const runDir = resolve(apsfRoot, 'runs/work', crashRuns.kill);
        const markerPath = resolve(runDir, 'executor_state.json');

        const spawnBackend = (): Promise<ChildProcess> => new Promise((res2, rej2) => {
          const child = spawn('npx tsx src/index.ts', {
            cwd: __dirname,
            shell: true,
            env: {
              ...process.env,
              PORT: String(KILL_PORT),
              JWT_SECRET,
              APSF_ROOT: apsfRoot,
              // 実 AI の代わりに長時間実行の fake provider（sleep 120s）
              APSF_NATIVE_CLI_OVERRIDE: `python "${resolve(FIXTURE_DIR, 'slow_native_cli.py')}" 120`,
            },
          });
          const deadline = Date.now() + 15000;
          const poll = async () => {
            try {
              const r = await fetch(`http://localhost:${KILL_PORT}/health`);
              if (r.ok) return res2(child);
            } catch { /* not up */ }
            if (Date.now() > deadline) return rej2(new Error('kill-test backend did not start'));
            setTimeout(poll, 300);
          };
          poll();
        });

        // backend #2 で実実行を開始 → executor がマーカーを自書きするのを待つ
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
        assert(marker.phase === 'BUILD_NEEDED' && marker.pid && marker.startedAt,
          `marker schema: ${JSON.stringify(marker)}`);

        // 実行中（fake provider が sleep 中）に SIGKILL 相当で強制終了
        if (process.platform === 'win32') {
          execSync(`taskkill /pid ${b2.pid} /T /F`, { stdio: 'pipe' });
        } else {
          b2.kill('SIGKILL');
        }
        // マーカーはプロセス死後も残存している（クラッシュの再現）
        assert(judgeFileExists(markerPath), 'marker should survive the kill');

        // backend #3 起動 = 再起動。起動時回復で failed 化される
        const b3 = await spawnBackend();
        try {
          assert(!judgeFileExists(markerPath), 'marker not recovered at startup');
          const state = JSON.parse(readJudgeFile(resolve(runDir, 'run_state.json'), 'utf-8'));
          assert(state.phase_status === 'failed', `phase_status: ${state.phase_status}`);
          assert(String(state.last_error).includes('Backend terminated'), `last_error: ${state.last_error}`);
        } finally {
          if (process.platform === 'win32' && b3.pid) {
            try { execSync(`taskkill /pid ${b3.pid} /T /F`, { stdio: 'pipe' }); } catch { /* dead */ }
          } else {
            b3.kill('SIGTERM');
          }
        }
      });

      await test('Crash recovery: 実行失敗（AI 非ゼロ終了）でも failed + last_error が永続化される', async () => {
        // backend 存命中の失敗経路: withMarker が setPhaseStatus(failed) を記録し
        // マーカーは削除される（WS エラーは揮発性 — durable 記録の検証）
        const { NativeApsfExecutor } = await import('./src/services/apsf-native/native-executor.js');
        const runDir = resolve(apsfRoot, 'runs/work', crashRuns.kill);
        // 前テストで failed → 再実行に相当する経路として fake failing provider で実行
        process.env.APSF_NATIVE_CLI_OVERRIDE = `python "${resolve(FIXTURE_DIR, 'failing_native_cli.py')}"`;
        try {
          const executor = new NativeApsfExecutor(apsfRoot);
          let threw = false;
          try {
            await executor.executePhase({ runId: crashRuns.kill, provider: 'claude' });
          } catch {
            threw = true;
          }
          assert(threw, 'failing provider should propagate an error');
          assert(!judgeFileExists(resolve(runDir, 'executor_state.json')), 'marker should be cleared');
          const state = JSON.parse(readJudgeFile(resolve(runDir, 'run_state.json'), 'utf-8'));
          assert(state.phase_status === 'failed', `phase_status: ${state.phase_status}`);
          assert(String(state.last_error).includes('Execution failed'), `last_error: ${state.last_error}`);
        } finally {
          delete process.env.APSF_NATIVE_CLI_OVERRIDE;
        }
      });
    } finally {
      rmCrashRuns();
    }

    // ---- 実行トランスクリプト（executions/*.jsonl + REST） ----

    const transcriptRun = '2026-07-05-997_work_explorer-transcript-test';
    const rmTranscriptRun = () =>
      rmJudgeRun(resolve(apsfRoot, 'runs/work', transcriptRun), { recursive: true, force: true });
    rmTranscriptRun();

    try {
      let transcriptFile = '';

      /** DryRun 実行を発火し、executions が expected 件になるまでポーリング
       *（DryRun は数 ms で完了し WS 接続前に complete が流れうるため、
       *  WS 待ちではなく永続化された結果で判定する） */
      async function runDryAndWait(expected: number): Promise<any[]> {
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
            // complete イベントの追記まで待つ（サイズ安定を確認）
            const lastEvents = await fetch(
              `${BASE}/api/runs/apsf/${transcriptRun}/executions/${body.executions[0].file}`,
              { headers: authHeader() }
            ).then((x) => x.json());
            if (lastEvents.events?.some((e: any) => e.type === 'complete' || e.type === 'error')) {
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

      await test('Transcript: 中身が start/progress/complete を含み REST で読める', async () => {
        assert(transcriptFile, 'no transcript from previous test');
        const r = await fetch(
          `${BASE}/api/runs/apsf/${transcriptRun}/executions/${transcriptFile}`,
          { headers: authHeader() }
        );
        const body = await r.json();
        assert(r.status === 200, `read failed: ${JSON.stringify(body).slice(0, 200)}`);
        const types = body.events.map((e: any) => e.type);
        assert(types[0] === 'start', `first event: ${types[0]}`);
        assert(types.includes('progress'), 'no progress events');
        assert(types[types.length - 1] === 'complete', `last event: ${types[types.length - 1]}`);
        const startData = body.events[0].data;
        assert(startData.runId === transcriptRun && startData.dryRun === true,
          `start data: ${JSON.stringify(startData)}`);
        const progressText = body.events
          .filter((e: any) => e.type === 'progress')
          .map((e: any) => String(e.data?.message ?? ''))
          .join('\n');
        assert(progressText.includes('DryRun'), 'DryRun progress not recorded');
      });

      await test('Transcript: 実行のたびに 1 件ずつ増える', async () => {
        const executions = await runDryAndWait(2);
        assert(executions.length === 2, `executions: ${executions.length}`);
        // 新しい順
        assert(executions[0].file > executions[1].file, 'not sorted newest-first');
      });

      await test('Transcript: 不正ファイル名は 400、未存在は 404', async () => {
        const bad = await fetch(
          `${BASE}/api/runs/apsf/${transcriptRun}/executions/..%2Frun_state.json`,
          { headers: authHeader() }
        );
        assert(bad.status === 400 || bad.status === 404, `expected 400/404, got ${bad.status}`);
        const evil = await fetch(
          `${BASE}/api/runs/apsf/${transcriptRun}/executions/evil.jsonl`,
          { headers: authHeader() }
        );
        assert(evil.status === 400, `expected 400, got ${evil.status}`);
        const missing = await fetch(
          `${BASE}/api/runs/apsf/${transcriptRun}/executions/20990101T000000-000Z-aaaaaa.jsonl`,
          { headers: authHeader() }
        );
        assert(missing.status === 404, `expected 404, got ${missing.status}`);
      });
    } finally {
      rmTranscriptRun();
    }
  } else {
    console.log(`⏭️  SKIP  APSF framework tests (not found at ${apsfRoot})`);
  }

  await test('APSFRunBridge: unavailable without APSF_ROOT', async () => {
    const saved = process.env.APSF_ROOT;
    delete process.env.APSF_ROOT;
    try {
      const { APSFRunBridge } = await import('./src/services/apsf-run-bridge.service.js');
      const bridge = new APSFRunBridge();
      assert(bridge.isAvailable() === false, 'should be unavailable');
      assert(bridge.listRuns().length === 0, 'listRuns should be empty');
    } finally {
      if (saved) process.env.APSF_ROOT = saved;
    }
  });

  stopBackend();

  // ---- セキュリティ: 本番起動ガード ----

  await test('Production without JWT_SECRET refuses to start (exit 1)', async () => {
    const env: Record<string, string | undefined> = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '3199',
    };
    delete env.JWT_SECRET;
    const code = await new Promise<number | null>((res, reject) => {
      // cwd を .env のないディレクトリにして dotenv 経由の JWT_SECRET 供給を防ぐ
      const child = spawn(`npx tsx "${resolve(__dirname, 'src/index.ts')}"`, {
        cwd: FIXTURE_DIR,
        shell: true,
        env,
      });
      const t = setTimeout(() => {
        child.kill();
        reject(new Error('did not exit within 10s — started without JWT_SECRET?'));
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
