/**
 * Backend Integration Test Runner (REAL implementation)
 *
 * テスト内製サーバーは使用しない。
 * 実際の backend/src/index.ts を子プロセスとして起動し、
 * ExecutionHandler / APSFBridgeService / routes / auth middleware を
 * 実装コード経由で検証する。
 *
 * APSF CLI は __tests__/fixtures/apsf の実 python モジュールを実行する
 * （実プロセス spawn・実 stdout/stderr ストリーム・実 exit code）。
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
const JWT_SECRET = 'integration-test-secret';
const FIXTURE_DIR = resolve(__dirname, '__tests__/fixtures');

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
        ANTHROPIC_API_KEY: 'test-key-anthropic',
        OPENAI_API_KEY: '',
        // 実 python + 実フィクスチャモジュールで本物の実行経路を通す
        APSF_PYTHON_PATH: 'python',
        APSF_CLI_PATH: FIXTURE_DIR,
        // Executor (CLI-FULL/LITE) 用の実プロセス CLI フィクスチャ
        APSF_CLI_OVERRIDE: `python "${resolve(FIXTURE_DIR, 'fake_cli.py')}"`,
        RUNS_DIR: resolve(__dirname, 'runs'),
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
    const ws = new WebSocket(WS_URL);
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
    const ws = new WebSocket(WS_URL);
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

  await test('GET /api/runs/providers returns configured providers', async () => {
    const r = await fetch(`${BASE}/api/runs/providers`, { headers: authHeader() });
    const body = await r.json();
    assert(r.status === 200, `expected 200, got ${r.status}`);
    assert(Array.isArray(body.providers) && body.providers.includes('anthropic'),
      `providers missing anthropic: ${JSON.stringify(body)}`);
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

  await test('POST execute rejects unavailable provider (400)', async () => {
    const r = await fetch(`${BASE}/api/runs/rest-bad-1/execute`, {
      method: 'POST',
      headers: authHeader(),
      body: JSON.stringify({ command: 'goal', provider: 'openai' }),
    });
    assert(r.status === 400, `expected 400, got ${r.status}`);
  });

  // ---- WebSocket (ExecutionHandler + APSFBridgeService 実装経由) ----

  await test('WebSocket: connection to real server', async () => {
    await new Promise<void>((res, reject) => {
      const ws = new WebSocket(WS_URL);
      const t = setTimeout(() => reject(new Error('connect timeout')), 5000);
      ws.on('open', () => { clearTimeout(t); ws.close(); res(); });
      ws.on('error', reject);
    });
  });

  await test('WebSocket: execute → execution-start event', async () => {
    const msg = await executeAndWaitFor(
      { runId: 'ws-run-1', provider: 'anthropic', command: 'goal', roles: ['judge'] },
      (m) => m.type === 'execution-start' && m.runId === 'ws-run-1'
    );
    assert(msg.provider === 'anthropic', 'provider mismatch');
  });

  await test('WebSocket: real python process → progress event', async () => {
    const msg = await executeAndWaitFor(
      { runId: 'ws-run-2', provider: 'anthropic', command: 'goal', roles: ['judge'] },
      (m) => m.type === 'progress' && m.runId === 'ws-run-2'
    );
    assert(msg.data && msg.data.provider === 'anthropic', 'progress data missing provider');
  });

  await test('WebSocket: real python exit 0 → complete event', async () => {
    const msg = await executeAndWaitFor(
      { runId: 'ws-run-3', provider: 'anthropic', command: 'goal', roles: ['judge'] },
      (m) => m.type === 'complete' && m.runId === 'ws-run-3'
    );
    assert(msg.data.exitCode === 0, `exitCode: ${msg.data.exitCode}`);
  });

  await test('WebSocket: real python exit 1 → error event', async () => {
    const msg = await executeAndWaitFor(
      { runId: 'ws-run-4', provider: 'anthropic', command: 'fail', roles: ['judge'] },
      (m) => m.type === 'error' && m.runId === 'ws-run-4'
    );
    assert(msg.data.error, 'error payload missing');
  });

  await test('WebSocket: missing API key provider → error event (no crash)', async () => {
    // OPENAI_API_KEY 未設定なので validateProvider が失敗する経路
    await executeAndWaitFor(
      { runId: 'ws-run-5', provider: 'openai', command: 'goal', roles: [] },
      (m) => m.type === 'error' && m.runId === 'ws-run-5'
    );
    // クラッシュしていないこと（health が生きている）
    const r = await fetch(`${BASE}/health`);
    assert(r.ok, 'backend crashed after missing-key execution');
  });

  await test('WebSocket: invalid JSON message → error response', async () => {
    await new Promise<void>((res, reject) => {
      const ws = new WebSocket(WS_URL);
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
        { runId: 'conc-1', provider: 'anthropic', command: 'goal', roles: [] },
        (m) => m.type === 'complete' && m.runId === 'conc-1'
      ),
      executeAndWaitFor(
        { runId: 'conc-2', provider: 'anthropic', command: 'goal', roles: [] },
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
