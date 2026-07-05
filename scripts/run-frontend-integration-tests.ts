/**
 * Frontend Integration Test Runner (REAL backend)
 *
 * モックサーバー・スタブは使用しない。
 * 実際の backend/src/index.ts を起動（既に localhost:3001 で稼働中なら再利用）し、
 * Frontend が使用する WebSocket プロトコルを実イベントで検証する。
 *
 * APSF CLI は backend/__tests__/fixtures/apsf の実 python モジュールを実行
 * （実プロセス・実ストリーム・実 exit code）。
 */
import { spawn, ChildProcess, execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
// デフォルトはテスト専用ポート。開発用 backend (3001) は env が異なるため
// 再利用すると誤った結果になる。3001 を明示的に使う場合は TEST_PORT=3001
const PORT = Number(process.env.TEST_PORT || 3210);
const BASE = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}`;
const BACKEND_DIR = resolve(__dirname, '../backend');
const FIXTURE_DIR = resolve(BACKEND_DIR, '__tests__/fixtures');

let passed = 0;
let failed = 0;
let backend: ChildProcess | undefined;
let spawnedBackend = false;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    passed++;
    console.log(`✅ PASS  ${name} (${Date.now() - start}ms)`);
  } catch (e) {
    failed++;
    console.log(`❌ FAIL  ${name} — ${e instanceof Error ? e.message : e}`);
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function isBackendUp(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/health`);
    return r.ok;
  } catch {
    return false;
  }
}

async function ensureBackend(): Promise<void> {
  if (await isBackendUp()) {
    console.log(`ℹ️  Reusing already-running backend on port ${PORT}\n`);
    return;
  }
  spawnedBackend = true;
  backend = spawn('npx tsx src/index.ts', {
    cwd: BACKEND_DIR,
    shell: true,
    env: {
      ...process.env,
      PORT: String(PORT),
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || 'test-key-anthropic',
      APSF_PYTHON_PATH: 'python',
      APSF_CLI_PATH: FIXTURE_DIR,
    },
  });
  backend.stderr?.on('data', (d) => console.error(`[backend:err] ${d}`));

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await isBackendUp()) {
      console.log(`✅ Real backend started on port ${PORT}\n`);
      return;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Backend did not start within 15s');
}

function stopBackend(): void {
  if (!spawnedBackend || !backend || backend.pid === undefined) return;
  if (process.platform === 'win32') {
    try { execSync(`taskkill /pid ${backend.pid} /T /F`, { stdio: 'pipe' }); } catch { /* already dead */ }
  } else {
    backend.kill('SIGTERM');
  }
}

/** Frontend と同じプロトコルで execute を送り、条件を満たすイベントを待つ */
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
      reject(new Error(`Timeout. Received events: ${received.join(', ') || '(none)'}`));
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
      } catch { /* ignore */ }
    });
    ws.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

async function main(): Promise<void> {
  console.log('🚀 Frontend Integration Tests — real backend, real WebSocket events\n');

  await ensureBackend();

  await test('Connection: WebSocket connects to real backend', async () => {
    await new Promise<void>((res, reject) => {
      const ws = new WebSocket(WS_URL);
      const t = setTimeout(() => reject(new Error('connect timeout')), 5000);
      ws.on('open', () => { clearTimeout(t); ws.close(); res(); });
      ws.on('error', reject);
    });
  });

  await test('Send & Receive: execute → execution-start', async () => {
    const msg = await executeAndWaitFor(
      { runId: 'fe-run-1', provider: 'anthropic', command: 'goal', roles: ['critic'] },
      (m) => m.type === 'execution-start' && m.runId === 'fe-run-1'
    );
    assert(msg.provider === 'anthropic', 'provider mismatch');
  });

  await test('Progress Event: real process stdout → progress', async () => {
    const msg = await executeAndWaitFor(
      { runId: 'fe-run-2', provider: 'anthropic', command: 'goal', roles: ['critic'] },
      (m) => m.type === 'progress' && m.runId === 'fe-run-2'
    );
    assert(msg.timestamp && msg.data, 'progress payload incomplete');
    assert(typeof msg.data.stage === 'string', 'progress data.stage missing');
  });

  await test('Complete Event: real process exit 0 → complete', async () => {
    const msg = await executeAndWaitFor(
      { runId: 'fe-run-3', provider: 'anthropic', command: 'goal', roles: ['critic'] },
      (m) => m.type === 'complete' && m.runId === 'fe-run-3'
    );
    assert(msg.data.exitCode === 0, `exitCode: ${msg.data.exitCode}`);
  });

  await test('Error Handling: real process exit 1 → error event', async () => {
    const msg = await executeAndWaitFor(
      { runId: 'fe-run-4', provider: 'anthropic', command: 'fail', roles: [] },
      (m) => m.type === 'error' && m.runId === 'fe-run-4'
    );
    assert(typeof msg.data.error === 'string' && msg.data.error.length > 0, 'error message missing');
  });

  await test('Error Handling: malformed message → error response', async () => {
    await new Promise<void>((res, reject) => {
      const ws = new WebSocket(WS_URL);
      const t = setTimeout(() => { ws.close(); reject(new Error('no error response within 5s')); }, 5000);
      ws.on('open', () => ws.send('{not valid json'));
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'error') { clearTimeout(t); ws.close(); res(); }
      });
      ws.on('error', reject);
    });
  });

  stopBackend();

  console.log('\n========================================');
  console.log(`RESULTS: ${passed} PASS, ${failed} FAIL (of ${passed + failed})`);
  console.log('========================================');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  stopBackend();
  process.exit(1);
});
