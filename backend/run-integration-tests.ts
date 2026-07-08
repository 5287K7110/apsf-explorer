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
      const ws = new WebSocket(WS_URL);
      const t = setTimeout(() => reject(new Error('connect timeout')), 5000);
      ws.on('open', () => { clearTimeout(t); ws.close(); res(); });
      ws.on('error', reject);
    });
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
