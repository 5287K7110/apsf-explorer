/**
 * APSF native 実装 parity test — TS ネイティブ実装 vs 実 python 実装
 *
 * ⚠️ 歴史的リファレンス検証（Historical reference verification）
 *
 * TS 実装が「正」（source of truth）として確定したため、本テストは
 * python CLI がある環境での任意実行用に降格。CI の必須パスではない。
 * 常時実行されるスナップショットテストは run-apsf-snapshot-test.ts を参照。
 *
 * 検証内容:
 *   1. phase 検出   : 全 run で `apsf next --phase-only` と一致
 *   2. start-run    : 生成ファイルがバイト一致、run_state が構造一致
 *   3. write-phase  : 保存・遷移・judge advisory・拒否経路が一致
 *   4. act prompt   : AUTO フェーズ run のプロンプト全文が一致
 *
 * python apsf CLI が PATH にない環境（CI 等）では SKIP する。
 *
 * 実行: npx tsx run-apsf-parity-test.ts
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PhaseDetector, resolveRunDir } from './src/services/apsf-native/phase-detector.js';
import { startRun } from './src/services/apsf-native/run-store.js';
import { writePhase, sanitizePhaseInput } from './src/services/apsf-native/write-phase.js';
import { buildPhasePrompt } from './src/services/apsf-native/prompt-builder.js';

const APSF_ROOT =
  process.env.APSF_ROOT || 'C:/Users/PC_User/PRJ/ai-problem-solving-framework';

let pass = 0;
let fail = 0;
const check = (cond: boolean, msg: string) => {
  console.log(cond ? `✅ ${msg}` : `❌ ${msg}`);
  cond ? pass++ : fail++;
};

function py(args: string[], input?: string): string {
  return execFileSync('apsf', args, {
    cwd: APSF_ROOT, shell: true, input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    timeout: 120000,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  }).toString();
}

function listRuns(): string[] {
  const runsDir = path.join(APSF_ROOT, 'runs');
  const isRun = (n: string) => /^\d{4}-\d{2}-\d{2}/.test(n);
  const out: string[] = [];
  for (const e of fs.readdirSync(runsDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (isRun(e.name)) out.push(e.name);
    else if (['fw-improvement', 'work'].includes(e.name)) {
      for (const c of fs.readdirSync(path.join(runsDir, e.name), { withFileTypes: true })) {
        if (c.isDirectory() && isRun(c.name)) out.push(c.name);
      }
    }
  }
  return out.sort();
}

// ── 1. Phase 検出 parity ─────────────────────────────────────────

function phaseParity(): void {
  console.log('\n── Phase detection parity ──');
  for (const run of listRuns()) {
    const dir = resolveRunDir(APSF_ROOT, run);
    if (!dir) continue;
    let tsPhase: string;
    try {
      tsPhase = new PhaseDetector(dir).detect().phase;
    } catch (e) {
      check(false, `${run} — TS threw: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    let pyPhase: string;
    try {
      const out = py(['next', run, '--phase-only']).trim().split(/\r?\n/);
      pyPhase = out[out.length - 1].trim();
    } catch {
      console.log(`⚠️  ${run} — python next failed, skipping`);
      continue;
    }
    check(tsPhase === pyPhase, `${run} — ${tsPhase}${tsPhase !== pyPhase ? ` (py=${pyPhase})` : ''}`);
  }
}

// ── 2. start-run parity ──────────────────────────────────────────

function startRunParity(): void {
  console.log('\n── start-run parity ──');
  const PY_RUN = '2026-07-06-981_work_parity-sr-py';
  const TS_RUN = '2026-07-06-982_work_parity-sr-ts';
  const cleanup = () => {
    for (const r of [PY_RUN, TS_RUN]) {
      fs.rmSync(path.join(APSF_ROOT, 'runs/work', r), { recursive: true, force: true });
    }
  };
  cleanup();
  try {
    py(['start-run', PY_RUN, '--light', '--taxonomy', 'work']);
    startRun(APSF_ROOT, TS_RUN, { light: true, taxonomy: 'work' });

    const pyDir = path.join(APSF_ROOT, 'runs/work', PY_RUN);
    const tsDir = path.join(APSF_ROOT, 'runs/work', TS_RUN);
    const pyFiles = fs.readdirSync(pyDir).sort();
    const tsFiles = fs.readdirSync(tsDir).sort();
    check(JSON.stringify(pyFiles) === JSON.stringify(tsFiles), `file list: ${tsFiles.join(', ')}`);

    for (const f of pyFiles) {
      const pyC = fs.readFileSync(path.join(pyDir, f), 'utf-8');
      const tsC = fs.readFileSync(path.join(tsDir, f), 'utf-8');
      if (f === 'run_state.json') {
        const norm = (s: string) => {
          const j = { ...JSON.parse(s), run_id: 'X', phase_entered_at: 'X' };
          return JSON.stringify(j, Object.keys(j).sort());
        };
        check(norm(pyC) === norm(tsC), `${f} structurally identical`);
      } else {
        check(pyC === tsC, `${f} byte-identical`);
      }
    }
  } finally {
    cleanup();
  }
}

// ── 3. write-phase parity ────────────────────────────────────────

const TASK_MD =
  '# Task\n\n## What\n\nwrite-phase parity 検証用のダミータスク。\n\n' +
  '## Context\n\n- parity テスト専用\n- AI 実行なし\n\n## Done Criteria\n\n- [x] 保存できる\n';
const BUILD_MD =
  '# Build\n\n## What was built\n\nparity 検証のためのダミー成果物記録。\n\n' +
  '## Files changed\n\n- （なし・記録のみ）\n\n## Decisions made\n\n- parity 検証のため build.md のみ記入\n\n' +
  '## Open issues\n\n- なし特記事項、この行は行数確保用の実質コンテンツ\n';
const REVIEW_MD =
  '# Review\n\n## Summary\n\nPASS — parity 検証用ダミーレビュー。\n\n' +
  '## Findings\n\n- Done Criteria は満たされている\n- スコープ外変更なし\n\n## Notes\n\n- parity テスト専用\n\n' +
  '```apsf-judge-advisory\n{"recommendation": "Accept", "human_owned_blocker": false}\n```\n';

function writePhaseParity(): void {
  console.log('\n── write-phase parity ──');
  const PY_RUN = '2026-07-06-983_work_parity-wp-py';
  const TS_RUN = '2026-07-06-984_work_parity-wp-ts';
  const cleanup = () => {
    for (const r of [PY_RUN, TS_RUN]) {
      fs.rmSync(path.join(APSF_ROOT, 'runs/work', r), { recursive: true, force: true });
    }
  };
  const pyWrite = (content: string) => {
    py(['write-phase', PY_RUN, '--stdin'], content);
    py(['next', PY_RUN, '--phase-only']); // advisory sync（TS は write に畳み込み済み）
  };
  const readState = (r: string) =>
    JSON.parse(fs.readFileSync(path.join(APSF_ROOT, 'runs/work', r, 'run_state.json'), 'utf-8'));

  cleanup();
  try {
    py(['start-run', PY_RUN, '--light', '--taxonomy', 'work']);
    startRun(APSF_ROOT, TS_RUN, { light: true, taxonomy: 'work' });
    const pyDir = path.join(APSF_ROOT, 'runs/work', PY_RUN);
    const tsDir = path.join(APSF_ROOT, 'runs/work', TS_RUN);

    // task → BUILD_NEEDED
    pyWrite(TASK_MD);
    const r1 = writePhase(tsDir, TASK_MD);
    check(r1.phaseAfter === 'BUILD_NEEDED' && readState(PY_RUN).current_phase === 'BUILD_NEEDED',
      `task write → BUILD_NEEDED (both)`);
    check(fs.readFileSync(path.join(pyDir, 'task.md'), 'utf-8') ===
          fs.readFileSync(path.join(tsDir, 'task.md'), 'utf-8'), 'task.md byte-identical');
    const pyO = JSON.parse(fs.readFileSync(path.join(pyDir, 'transition_outcome.json'), 'utf-8'));
    const tsO = JSON.parse(fs.readFileSync(path.join(tsDir, 'transition_outcome.json'), 'utf-8'));
    check(pyO.transition_type === tsO.transition_type && pyO.blocker_owner === tsO.blocker_owner,
      `transition_outcome parity (${tsO.transition_type}/${tsO.blocker_owner})`);

    // build → REVIEW_NEEDED（outcome はクリア）
    pyWrite(BUILD_MD);
    const r2 = writePhase(tsDir, BUILD_MD);
    check(r2.phaseAfter === 'REVIEW_NEEDED' && readState(PY_RUN).current_phase === 'REVIEW_NEEDED',
      'build write → REVIEW_NEEDED (both)');
    check(!fs.existsSync(path.join(pyDir, 'transition_outcome.json')) &&
          !fs.existsSync(path.join(tsDir, 'transition_outcome.json')),
      'transition_outcome cleared (both)');

    // review → IMPROVE_NEEDED + judge advisory
    pyWrite(REVIEW_MD);
    const r3 = writePhase(tsDir, REVIEW_MD);
    check(r3.phaseAfter === 'IMPROVE_NEEDED' && readState(PY_RUN).current_phase === 'IMPROVE_NEEDED',
      'review write → IMPROVE_NEEDED (both)');
    const pyA = JSON.parse(fs.readFileSync(path.join(pyDir, 'judge_advisory.json'), 'utf-8'));
    const tsA = JSON.parse(fs.readFileSync(path.join(tsDir, 'judge_advisory.json'), 'utf-8'));
    const advKeys = ['recommendation', 'human_owned_blocker', 'human_owned_blocker_state',
      'advisory_source', 'phase', 'ownership_status', 'source'];
    check(advKeys.every((k) => JSON.stringify(pyA[k]) === JSON.stringify(tsA[k])),
      `judge_advisory parity (${tsA.recommendation})`);

    // 拒否経路: テンプレのみ入力
    let pyRej = false;
    try { py(['write-phase', PY_RUN, '--stdin'], '# Improve\n\n- [ ]\n'); } catch { pyRej = true; }
    let tsRej = false;
    try { writePhase(tsDir, '# Improve\n\n- [ ]\n'); } catch { tsRej = true; }
    check(pyRej && tsRej, `template-only input rejected (both)`);

    // sanitize
    check(sanitizePhaseInput('[APSF] x\n[Step 1/2] y\n# Build\n\nreal\n').startsWith('# Build'),
      'sanitize strips transport lines');
  } finally {
    cleanup();
  }
}

// ── 4. act prompt parity ─────────────────────────────────────────

function promptParity(): void {
  console.log('\n── act prompt parity ──');
  const normalize = (s: string) => s.replace(/\r\n/g, '\n').trimEnd();
  for (const run of listRuns()) {
    const dir = resolveRunDir(APSF_ROOT, run);
    if (!dir) continue;
    let phase: string;
    try {
      phase = new PhaseDetector(dir).detect().phase;
    } catch { continue; }
    if (!['PLAN_NEEDED', 'BUILD_NEEDED', 'REVIEW_NEEDED'].includes(phase)) continue;

    let pyPrompt: string;
    try {
      pyPrompt = py(['act', run, '--print-prompt']);
    } catch {
      console.log(`⚠️  ${run} — python act failed, skipping`);
      continue;
    }
    const tsPrompt = buildPhasePrompt(dir, APSF_ROOT).prompt;
    check(normalize(pyPrompt) === normalize(tsPrompt),
      `${run} (${phase}) — ${tsPrompt.length} chars`);
  }
}

// ── main ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!fs.existsSync(path.join(APSF_ROOT, 'runs'))) {
    console.log(`⏭️  SKIP: APSF workspace not found at ${APSF_ROOT}`);
    process.exit(0);
  }
  try {
    py(['--help']);
  } catch {
    console.log('⏭️  SKIP: python apsf CLI not on PATH — nothing to compare against.');
    console.log('   (The TS implementation itself requires no python.)');
    process.exit(0);
  }

  console.log('🚀 APSF native parity — TS implementation vs real python apsf CLI');
  phaseParity();
  startRunParity();
  writePhaseParity();
  promptParity();

  console.log('\n========================================');
  console.log(`PARITY: ${pass} match, ${fail} mismatch`);
  console.log('========================================');
  process.exit(fail > 0 ? 1 : 0);
}

main();
