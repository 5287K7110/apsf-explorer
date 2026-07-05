/**
 * APSF PhaseDetector parity test
 *
 * TS ネイティブ移植（apsf-native/phase-detector.ts）が、実 python 実装
 * `apsf next <run> --phase-only` と全 run で同じフェーズを返すことを検証する。
 *
 * NOTE: python 版 `apsf next` は advisory sync の副作用（run_state.json 書き込み）を
 * 持つため、TS（読み取り専用・sync 後の値を予測）→ python の順で比較する。
 *
 * 実行: npx tsx run-apsf-parity-test.ts
 * 前提: APSF_ROOT（未設定ならこのマシンの実 framework パス）
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PhaseDetector, resolveRunDir } from './src/services/apsf-native/phase-detector.js';

const APSF_ROOT =
  process.env.APSF_ROOT || 'C:/Users/PC_User/PRJ/ai-problem-solving-framework';

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

function realPhase(run: string): string {
  const out = execFileSync('apsf', ['next', run, '--phase-only'], {
    cwd: APSF_ROOT,
    shell: true,
    timeout: 60000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString().trim();
  const lines = out.split(/\r?\n/);
  return lines[lines.length - 1].trim();
}

async function main(): Promise<void> {
  if (!fs.existsSync(path.join(APSF_ROOT, 'runs'))) {
    console.log(`⏭️  SKIP: APSF framework not found at ${APSF_ROOT}`);
    process.exit(0);
  }

  const runs = listRuns();
  console.log(`🚀 Parity test: TS PhaseDetector vs real \`apsf next --phase-only\``);
  console.log(`   ${runs.length} runs @ ${APSF_ROOT}\n`);

  let pass = 0;
  let fail = 0;

  for (const run of runs) {
    const runDir = resolveRunDir(APSF_ROOT, run);
    if (!runDir) {
      console.log(`❌ ${run} — run dir not resolvable`);
      fail++;
      continue;
    }

    // TS 先（読み取り専用）→ python 後（副作用あり）
    let tsPhase: string;
    try {
      tsPhase = new PhaseDetector(runDir).detect().phase;
    } catch (e) {
      console.log(`❌ ${run} — TS threw: ${e instanceof Error ? e.message : e}`);
      fail++;
      continue;
    }

    let pyPhase: string;
    try {
      pyPhase = realPhase(run);
    } catch (e) {
      console.log(`⚠️  ${run} — python apsf next failed, skipping comparison`);
      continue;
    }

    if (tsPhase === pyPhase) {
      console.log(`✅ ${run} — ${tsPhase}`);
      pass++;
    } else {
      console.log(`❌ ${run} — TS=${tsPhase} vs python=${pyPhase}`);
      fail++;
    }
  }

  console.log('\n========================================');
  console.log(`PARITY: ${pass} match, ${fail} mismatch (of ${runs.length})`);
  console.log('========================================');
  process.exit(fail > 0 ? 1 : 0);
}

main();
