/**
 * APSF snapshot test — TS 実装を凍結スナップショットで検証（python 不要）
 *
 * TS ネイティブ実装を「正」（source of truth）として、committed fixture ファイル
 * に凍結した期待値と比較する。python CLI が不要なため CI/CD で常時実行可能。
 *
 * 検証範囲:
 *   1. start-run scaffold   : 生成ファイル一覧・テンプレート内容・run_state 構造
 *   2. phase detection       : 各フェーズの canonical 検出
 *   3. write-phase transitions: task→build→review→improve の遷移列
 *   4. sanitize / reject     : 入力正規化と拒否経路
 *   5. judge advisory        : review.md からの advisory 抽出
 *   6. prompt hash           : buildPhasePrompt の出力ハッシュ（specialist 選択含む）
 *
 * スナップショット更新:
 *   npx tsx run-apsf-snapshot-test.ts --update
 *   → __tests__/fixtures/apsf/snapshots/ 以下のファイルを再生成。
 *     差分を git diff で確認し、意図的変更なら commit する。
 *
 * 実行: npx tsx run-apsf-snapshot-test.ts
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { PhaseDetector } from './src/services/apsf-native/phase-detector.js';
import { LIGHT_RUN_FILES, startRun } from './src/services/apsf-native/run-store.js';
import {
  writePhase,
  sanitizePhaseInput,
  parseReviewJudgeAdvisory,
} from './src/services/apsf-native/write-phase.js';
import { bootstrapRunState, loadRunState } from './src/services/apsf-native/run-state.js';
import { buildPhasePrompt } from './src/services/apsf-native/prompt-builder.js';
import { resolveFrameworkRoot } from './src/services/apsf-native/content-root.js';

const UPDATE_MODE = process.argv.includes('--update');
const SNAPSHOT_DIR = path.join(import.meta.dirname, '__tests__', 'fixtures', 'apsf', 'snapshots');

let pass = 0;
let fail = 0;
const check = (cond: boolean, msg: string) => {
  console.log(cond ? `✅ PASS  ${msg}` : `❌ FAIL  ${msg}`);
  cond ? pass++ : fail++;
};

// ── helpers ──────────────────────────────────────────────────────────

function makeTempWorkspace(): { root: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apsf-snap-'));
  fs.mkdirSync(path.join(root, 'runs', 'work'), { recursive: true });
  return {
    root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function normalizeContent(s: string): string {
  return s.replace(/\r\n/g, '\n').trimEnd();
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf-8').digest('hex');
}

/** スナップショット読み書き */
function readSnapshot(name: string): string | null {
  const p = path.join(SNAPSHOT_DIR, name);
  if (!fs.existsSync(p)) return null;
  return normalizeContent(fs.readFileSync(p, 'utf-8'));
}

function writeSnapshot(name: string, content: string): void {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  fs.writeFileSync(path.join(SNAPSHOT_DIR, name), content, 'utf-8');
}

/** スナップショットとの比較（--update 時は再生成） */
function checkSnapshot(name: string, actual: string, label: string): void {
  const normalized = normalizeContent(actual);
  if (UPDATE_MODE) {
    writeSnapshot(name, normalized + '\n');
    console.log(`📸 UPDATED  ${name}`);
    pass++;
    return;
  }
  const expected = readSnapshot(name);
  if (expected === null) {
    check(false, `${label} — snapshot file missing: ${name}\n` +
      `       Run with --update to generate: npx tsx run-apsf-snapshot-test.ts --update`);
    return;
  }
  if (normalized !== expected) {
    // 差分の先頭を表示して何がずれたか案内する
    const actualLines = normalized.split('\n');
    const expectedLines = expected.split('\n');
    let diffLine = -1;
    for (let i = 0; i < Math.max(actualLines.length, expectedLines.length); i++) {
      if (actualLines[i] !== expectedLines[i]) { diffLine = i; break; }
    }
    check(false, `${label} — snapshot mismatch: ${name} (first diff at line ${diffLine + 1})\n` +
      `       expected: ${expectedLines[diffLine]?.slice(0, 80)}\n` +
      `       actual:   ${actualLines[diffLine]?.slice(0, 80)}\n` +
      `       Run with --update to regenerate: npx tsx run-apsf-snapshot-test.ts --update`);
  } else {
    check(true, label);
  }
}

// ── 1. start-run scaffold ────────────────────────────────────────────

function testStartRunScaffold(): void {
  console.log('\n── start-run scaffold ──');
  const { root, cleanup } = makeTempWorkspace();
  try {
    const RUN = '2099-01-01-999_work_snap-scaffold';
    startRun(root, RUN, { light: true, taxonomy: 'work' });
    const runDir = path.join(root, 'runs', 'work', RUN);

    const files = fs.readdirSync(runDir).sort();
    checkSnapshot('scaffold-file-list.txt', files.join('\n'), 'light run file list');

    for (const [fname, template] of Object.entries(LIGHT_RUN_FILES)) {
      checkSnapshot(
        `scaffold-${fname}`,
        normalizeContent(fs.readFileSync(path.join(runDir, fname), 'utf-8')),
        `${fname} matches frozen template`
      );
    }

    // run_state structure (normalized)
    const rawState = fs.readFileSync(path.join(runDir, 'run_state.json'), 'utf-8');
    const stateObj = JSON.parse(rawState);
    stateObj.run_id = '__NORMALIZED__';
    stateObj.phase_entered_at = '__NORMALIZED__';
    const stableState = JSON.stringify(stateObj, Object.keys(stateObj).sort(), 2);
    checkSnapshot('scaffold-run-state.json', stableState, 'run_state.json structure');
  } finally {
    cleanup();
  }
}

// ── 2. phase detection ───────────────────────────────────────────────

function testPhaseDetection(): void {
  console.log('\n── phase detection ──');
  const { root, cleanup } = makeTempWorkspace();
  try {
    const phases: Array<{
      name: string;
      phase: string;
      runType: string;
      setup: (dir: string) => void;
    }> = [
      {
        name: 'TASK_NEEDED (empty light)',
        phase: 'TASK_NEEDED',
        runType: 'light',
        setup: (dir) => {
          fs.writeFileSync(path.join(dir, 'task.md'), LIGHT_RUN_FILES['task.md']);
        },
      },
      {
        name: 'BUILD_NEEDED (task filled)',
        phase: 'BUILD_NEEDED',
        runType: 'light',
        setup: (dir) => {
          fs.writeFileSync(path.join(dir, 'task.md'), '# Task\n\n## What\n\nReal task content here.\n\n## Context\n\n- Snapshot test\n\n## Done Criteria\n\n- [x] Written\n');
          fs.writeFileSync(path.join(dir, 'build.md'), LIGHT_RUN_FILES['build.md']);
        },
      },
      {
        name: 'REVIEW_NEEDED (build filled)',
        phase: 'REVIEW_NEEDED',
        runType: 'light',
        setup: (dir) => {
          fs.writeFileSync(path.join(dir, 'task.md'), '# Task\n\n## What\n\nReal task.\n\n## Context\n\n- Test\n\n## Done Criteria\n\n- [x] Done\n');
          fs.writeFileSync(path.join(dir, 'build.md'), '# Build\n\n## What was built\n\nReal build output.\n\n## Files changed\n\n- test.ts\n');
          fs.writeFileSync(path.join(dir, 'review.md'), LIGHT_RUN_FILES['review.md']);
        },
      },
      {
        name: 'IMPROVE_NEEDED (review filled)',
        phase: 'IMPROVE_NEEDED',
        runType: 'light',
        setup: (dir) => {
          fs.writeFileSync(path.join(dir, 'task.md'), '# Task\n\n## What\n\nReal task.\n\n## Context\n\n- Test\n\n## Done Criteria\n\n- [x] Done\n');
          fs.writeFileSync(path.join(dir, 'build.md'), '# Build\n\n## What was built\n\nReal build.\n\n## Files changed\n\n- test.ts\n');
          fs.writeFileSync(path.join(dir, 'review.md'), '# Review\n\n## Summary\n\nPASS — all criteria met.\n\n## Findings\n\n- Done Criteria satisfied\n- No scope creep\n');
        },
      },
    ];

    for (const { name, phase, runType, setup } of phases) {
      const runName = `2099-01-01-${phase}`;
      const dir = path.join(root, 'runs', 'work', runName);
      fs.mkdirSync(dir, { recursive: true });
      bootstrapRunState(dir, { phase: phase as any, runType: runType as any });
      setup(dir);
      const detected = new PhaseDetector(dir).detect();
      check(detected.phase === phase, `${name} → ${detected.phase}`);
    }
  } finally {
    cleanup();
  }
}

// ── 3. write-phase transitions ───────────────────────────────────────

const TASK_MD =
  '# Task\n\n## What\n\nSnapshot 検証用のダミータスク。\n\n' +
  '## Context\n\n- snapshot テスト専用\n- AI 実行なし\n\n## Done Criteria\n\n- [x] 保存できる\n';
const BUILD_MD =
  '# Build\n\n## What was built\n\nSnapshot 検証のためのダミー成果物記録。\n\n' +
  '## Files changed\n\n- （なし・記録のみ）\n\n## Decisions made\n\n- snapshot 検証のため build.md のみ記入\n\n' +
  '## Open issues\n\n- なし特記事項、この行は行数確保用の実質コンテンツ\n';
const REVIEW_MD =
  '# Review\n\n## Summary\n\nPASS — snapshot 検証用ダミーレビュー。\n\n' +
  '## Findings\n\n- Done Criteria は満たされている\n- スコープ外変更なし\n\n## Notes\n\n- snapshot テスト専用\n\n' +
  '```apsf-judge-advisory\n{"recommendation": "Accept", "human_owned_blocker": false}\n```\n';
const IMPROVE_MD =
  '# Improve\n\n## Summary\n\nAccept — snapshot 検証用の改善記録。\n\n' +
  '## Actions Taken\n\n- Critic の指摘を確認\n- 全テスト green を確認\n' +
  '- 追加修正なし\n\n## Decision\n\nAccept — 品質基準を満たしている。\n';

const EXPECTED_TRANSITIONS = [
  { input: 'TASK_MD', file: 'task.md', before: 'TASK_NEEDED', after: 'BUILD_NEEDED' },
  { input: 'BUILD_MD', file: 'build.md', before: 'BUILD_NEEDED', after: 'REVIEW_NEEDED' },
  { input: 'REVIEW_MD', file: 'review.md', before: 'REVIEW_NEEDED', after: 'IMPROVE_NEEDED' },
  { input: 'IMPROVE_MD', file: 'improve.md', before: 'IMPROVE_NEEDED', after: 'RESULT_NEEDED' },
];

function testWritePhaseTransitions(): void {
  console.log('\n── write-phase transitions ──');
  const { root, cleanup } = makeTempWorkspace();
  try {
    const RUN = '2099-01-01-998_work_snap-wp';
    startRun(root, RUN, { light: true, taxonomy: 'work' });
    const runDir = path.join(root, 'runs', 'work', RUN);
    const inputs: Record<string, string> = { TASK_MD, BUILD_MD, REVIEW_MD, IMPROVE_MD };

    // 遷移列をスナップショットと比較
    const transitionLog: string[] = [];

    for (const exp of EXPECTED_TRANSITIONS) {
      const result = writePhase(runDir, inputs[exp.input]);
      check(result.fileWritten === exp.file, `wrote ${result.fileWritten} (expected ${exp.file})`);
      check(result.phaseBefore === exp.before, `before: ${result.phaseBefore} (expected ${exp.before})`);
      check(result.phaseAfter === exp.after, `after: ${result.phaseAfter} (expected ${exp.after})`);

      const saved = normalizeContent(fs.readFileSync(path.join(runDir, exp.file), 'utf-8'));
      const expected = normalizeContent(sanitizePhaseInput(inputs[exp.input]));
      check(saved === expected, `${exp.file} content matches sanitized input`);

      transitionLog.push(`${result.phaseBefore} → write(${result.fileWritten}) → ${result.phaseAfter}`);
    }

    checkSnapshot('transition-log.txt', transitionLog.join('\n'), 'transition sequence');

    // judge_advisory.json
    const advisoryPath = path.join(runDir, 'judge_advisory.json');
    check(fs.existsSync(advisoryPath), 'judge_advisory.json created after review write');
    const advisory = JSON.parse(fs.readFileSync(advisoryPath, 'utf-8'));
    // 安定化（タイムスタンプ除去）してスナップショット
    const stableAdvisory = { ...advisory };
    stableAdvisory.generated_at = '__NORMALIZED__';
    stableAdvisory.freshness_token = '__NORMALIZED__';
    stableAdvisory.run_id = '__NORMALIZED__';
    checkSnapshot(
      'judge-advisory.json',
      JSON.stringify(stableAdvisory, null, 2),
      'judge_advisory.json structure'
    );

    // overwrite protection
    let rejected = false;
    try {
      writePhase(runDir, '# Result\n\n## Outcome\n\nDuplicate write test.\n');
      writePhase(runDir, '# Result\n\n## Outcome\n\nDuplicate write test (2).\n');
    } catch {
      rejected = true;
    }
    check(rejected, 'overwrite protection: second write to result.md rejected');
  } finally {
    cleanup();
  }
}

// ── 4. sanitize / reject ─────────────────────────────────────────────

function testSanitizeAndReject(): void {
  console.log('\n── sanitize / reject ──');

  const stripped = sanitizePhaseInput(
    '[APSF] starting\n[Step 1/2] processing\n# Build\n\nReal content.\n'
  );
  check(stripped.startsWith('# Build'), 'strips [APSF] and [Step] transport lines');

  const headed = sanitizePhaseInput('junk line\n# Build\n\nContent.\n');
  check(headed.startsWith('# Build'), 'strips junk before first heading');

  const { root, cleanup } = makeTempWorkspace();
  try {
    const RUN = '2099-01-01-997_work_snap-rej';
    startRun(root, RUN, { light: true, taxonomy: 'work' });
    const runDir = path.join(root, 'runs', 'work', RUN);
    let rejected = false;
    try {
      writePhase(runDir, '# Task\n\n## What\n\n<!-- placeholder -->\n\n- [ ]\n');
    } catch {
      rejected = true;
    }
    check(rejected, 'template-only input rejected');
  } finally {
    cleanup();
  }
}

// ── 5. judge advisory extraction ─────────────────────────────────────

function testJudgeAdvisory(): void {
  console.log('\n── judge advisory extraction ──');

  const adv = parseReviewJudgeAdvisory(REVIEW_MD);
  check(adv.recommendation === 'Accept', `recommendation: Accept`);
  check(adv.human_owned_blocker === false, `human_owned_blocker: false`);

  const rtbReview =
    '# Review\n\n## Findings\n\n- Issues found\n\n' +
    '```apsf-judge-advisory\n{"recommendation": "Return to Build", "human_owned_blocker": false}\n```\n';
  const rtb = parseReviewJudgeAdvisory(rtbReview);
  check(rtb.recommendation === 'Return to Build', `recommendation: Return to Build`);

  let threw = false;
  try { parseReviewJudgeAdvisory('# Review\n\nNo advisory block.\n'); } catch { threw = true; }
  check(threw, 'missing advisory block throws');

  threw = false;
  try {
    parseReviewJudgeAdvisory(
      '# Review\n\n```apsf-judge-advisory\n{"recommendation": "INVALID", "human_owned_blocker": false}\n```\n'
    );
  } catch { threw = true; }
  check(threw, 'invalid recommendation throws');

  threw = false;
  try {
    parseReviewJudgeAdvisory(
      '# Review\n\n' +
        '```apsf-judge-advisory\n{"recommendation": "Accept", "human_owned_blocker": false}\n```\n\n' +
        '```apsf-judge-advisory\n{"recommendation": "Accept", "human_owned_blocker": false}\n```\n'
    );
  } catch { threw = true; }
  check(threw, 'multiple advisory blocks throws');
}

// ── 6. prompt hash ───────────────────────────────────────────────────

function testPromptHash(): void {
  console.log('\n── prompt hash ──');
  const { root, cleanup } = makeTempWorkspace();
  try {
    const RUN = '2099-01-01-996_work_snap-prompt';
    startRun(root, RUN, { light: true, taxonomy: 'work' });
    const runDir = path.join(root, 'runs', 'work', RUN);
    const frameworkRoot = resolveFrameworkRoot(root);

    // task.md を書いて BUILD_NEEDED にする
    writePhase(runDir, TASK_MD);
    const buildPrompt = buildPhasePrompt(runDir, frameworkRoot);
    check(buildPrompt.phase === 'BUILD_NEEDED', `prompt phase: BUILD_NEEDED`);
    check(buildPrompt.prompt.length > 100, `prompt length: ${buildPrompt.prompt.length} chars`);

    // 全文 fixture — hash 不一致時に「何が」違うのか diff で特定できるようにする
    checkSnapshot('prompt-build.txt', buildPrompt.prompt, 'BUILD prompt text');
    const buildHash = sha256(normalizeContent(buildPrompt.prompt));
    checkSnapshot('prompt-build-hash.txt', buildHash, 'BUILD prompt hash');

    // build.md を書いて REVIEW_NEEDED にする
    writePhase(runDir, BUILD_MD);
    const reviewPrompt = buildPhasePrompt(runDir, frameworkRoot);
    check(reviewPrompt.phase === 'REVIEW_NEEDED', `prompt phase: REVIEW_NEEDED`);

    checkSnapshot('prompt-review.txt', reviewPrompt.prompt, 'REVIEW prompt text');
    const reviewHash = sha256(normalizeContent(reviewPrompt.prompt));
    checkSnapshot('prompt-review-hash.txt', reviewHash, 'REVIEW prompt hash');
  } finally {
    cleanup();
  }
}

// ── main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🚀 APSF snapshot test — TS implementation vs frozen expectations (no python)\n');

  if (UPDATE_MODE) {
    console.log('📸 --update mode: regenerating snapshots in __tests__/fixtures/apsf/snapshots/');
    console.log('   Review the diff and commit if the changes are intentional.\n');
  }

  testStartRunScaffold();
  testPhaseDetection();
  testWritePhaseTransitions();
  testSanitizeAndReject();
  testJudgeAdvisory();
  testPromptHash();

  console.log('\n========================================');
  console.log(`SNAPSHOT: ${pass} pass, ${fail} fail (of ${pass + fail})`);
  console.log('========================================');
  if (UPDATE_MODE && fail === 0) {
    console.log(`\n📸 Snapshots written to: ${SNAPSHOT_DIR}`);
    console.log('   git diff to review, then commit.');
  }
  process.exit(fail > 0 ? 1 : 0);
}

main();
