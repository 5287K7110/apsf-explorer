/**
 * APSF full-cycle 実 AI 検証（オプトイン・手動実行）
 *
 * Explorer backend (localhost:3001) 経由で実 APSF の auto-loop を起動し、
 * 実 AI（claude）が human フェーズまで run を進めることを検証する。
 *
 * 実行: npx tsx run-apsf-fullcycle-test.ts <run-name>
 * 前提: dev backend が APSF_ROOT 付きで 3001 に起動していること
 */
import WebSocket from 'ws';

const RUN = process.argv[2];
if (!RUN) {
  console.error('Usage: npx tsx run-apsf-fullcycle-test.ts <run-name>');
  process.exit(1);
}

const WS_URL = 'ws://localhost:3001';
const TIMEOUT_MS = 25 * 60 * 1000; // 25分

async function main(): Promise<void> {
  console.log(`🚀 APSF full-cycle via Explorer backend — run: ${RUN}\n`);

  const ws = new WebSocket(WS_URL);
  const start = Date.now();

  const result = await new Promise<{ ok: boolean; phase?: string; error?: string }>((resolve) => {
    const timer = setTimeout(() => {
      resolve({ ok: false, error: `timeout after ${TIMEOUT_MS / 60000} min` });
    }, TIMEOUT_MS);

    ws.on('open', () => {
      console.log('✅ WS connected, sending full-cycle execute...\n');
      ws.send(JSON.stringify({
        type: 'execute',
        payload: {
          runId: RUN,
          provider: 'claude',
          command: 'full-cycle',
          roles: [],
          mode: 'apsf-run',
        },
      }));
    });

    ws.on('message', (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.runId !== RUN && msg.type !== 'execution-start') return;

      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      if (msg.type === 'progress' || msg.type === 'log') {
        const text = String(msg.data?.message ?? '').trimEnd();
        if (text) console.log(`[${elapsed}s] ${text}`);
      } else if (msg.type === 'complete') {
        clearTimeout(timer);
        resolve({ ok: true, phase: msg.data?.phase });
      } else if (msg.type === 'error') {
        clearTimeout(timer);
        resolve({ ok: false, error: String(msg.data?.error) });
      }
    });

    ws.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: e.message });
    });
  });

  ws.close();

  console.log('\n========================================');
  if (result.ok) {
    console.log(`✅ FULL-CYCLE COMPLETE — final phase: ${result.phase}`);
    console.log(`   elapsed: ${((Date.now() - start) / 60000).toFixed(1)} min`);
  } else {
    console.log(`❌ FULL-CYCLE FAILED — ${result.error}`);
  }
  console.log('========================================');
  process.exit(result.ok ? 0 : 1);
}

main();
