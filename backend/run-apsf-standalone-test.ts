/**
 * スタンドアロン検証: python / apsf CLI なしで全操作が動くか
 * - 空のワークスペース（runs/ のみ）を新規作成
 * - run 作成 → task 記入 → プロンプト組み立て → 実 AI なし（DryRun）で確認
 * - PATH から python/apsf を除去した環境で実行
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// PATH から python / apsf を排除（同梱コンテンツのみで動くことの実証）
process.env.PATH = (process.env.PATH || '')
  .split(path.delimiter)
  .filter((p) => !/python|apsf/i.test(p))
  .join(path.delimiter);

const WORKSPACE = fs.mkdtempSync(path.join(os.tmpdir(), 'apsf-standalone-'));
fs.mkdirSync(path.join(WORKSPACE, 'runs'), { recursive: true });
process.env.APSF_ROOT = WORKSPACE;

const { startRun } = await import('./src/services/apsf-native/run-store.js');
const { writePhase } = await import('./src/services/apsf-native/write-phase.js');
const { buildPhasePrompt } = await import('./src/services/apsf-native/prompt-builder.js');
const { PhaseDetector, resolveRunDir } = await import('./src/services/apsf-native/phase-detector.js');
const { resolveFrameworkRoot } = await import('./src/services/apsf-native/content-root.js');

let pass = 0;
let fail = 0;
const check = (cond: boolean, msg: string) => {
  console.log(cond ? `✅ ${msg}` : `❌ ${msg}`);
  cond ? pass++ : fail++;
};

console.log(`🚀 Standalone test — empty workspace: ${WORKSPACE}`);
console.log(`   (python/apsf stripped from PATH)\n`);

// 1. light run 作成
const runName = startRun(WORKSPACE, 'standalone-smoke', { light: true });
check(/^\d{4}-\d{2}-\d{2}-001_standalone-smoke$/.test(runName), `run created: ${runName}`);
const runDir = path.join(WORKSPACE, 'runs', runName);
check(fs.existsSync(path.join(runDir, 'run_state.json')), 'run_state.json bootstrapped');

// 2. フェーズ検出
const d1 = new PhaseDetector(runDir).detect();
check(d1.phase === 'TASK_NEEDED', `phase = ${d1.phase}`);

// 3. task 記入 → BUILD_NEEDED
const r = writePhase(runDir,
  '# Task\n\n## What\n\nスタンドアロン検証。同梱コンテンツのみで動くことを確認する。\n\n' +
  '## Context\n\n- 空ワークスペース\n- python 不在\n\n## Done Criteria\n\n- [x] 全操作がネイティブで動く\n');
check(r.fileWritten === 'task.md' && r.phaseAfter === 'BUILD_NEEDED',
  `write-phase: ${r.fileWritten} → ${r.phaseAfter}`);

// 4. BUILD プロンプト組み立て（同梱コンテンツで specialist 解決）
const fw = resolveFrameworkRoot(WORKSPACE);
check(!fw.includes(WORKSPACE), `framework root = vendored content (${path.basename(fw)})`);
const { prompt } = buildPhasePrompt(runDir, fw);
check(prompt.includes('Create the final deliverable'),
  `BUILD prompt assembled (${prompt.length} chars)`);
check(prompt.includes('スタンドアロン検証'), 'prompt embeds task content');

// 5. heavy run（同梱テンプレート複製）
const heavyName = startRun(WORKSPACE, 'standalone-heavy', {});
const heavyDir = path.join(WORKSPACE, 'runs', heavyName);
check(fs.existsSync(path.join(heavyDir, 'goal.md')), `heavy run from vendored template: ${heavyName}`);
check(!fs.existsSync(path.join(heavyDir, 'run_state.seed.json')), 'seed.json excluded');
const d2 = new PhaseDetector(heavyDir).detect();
check(d2.phase === 'SETUP_NEEDED', `heavy run phase = ${d2.phase}`);

fs.rmSync(WORKSPACE, { recursive: true, force: true });
console.log(`\nSTANDALONE: ${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
