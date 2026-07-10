/**
 * write-phase（apsf write-phase --stdin の TS ネイティブ移植）
 *
 * 参照仕様: ai-problem-solving-framework
 *   src/apsf/legacy/cli/main.py write_phase_cmd / _sanitize_phase_input /
 *     _next_phase_after_write / phase_target_map
 *   src/apsf/core/advisory.py parse_review_judge_advisory /
 *     write_canonical_judge_advisory
 *
 * フロー:
 *   1. canonical phase 解決（run_state.json 優先、なければ advisory）
 *   2. 対象ファイル決定（phase_target_map）
 *   3. 入力の sanitize + is_meaningful_text 検証
 *   4. 上書き保護（hasAnyContent、force で迂回 + 監査記録）
 *   5. 保存（OS ネイティブ改行）
 *   6. run_state 遷移（_next_phase_after_write の決定木）
 *   7. review.md 完了時: judge advisory の抽出・書き込み（必須ブロック）
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PhaseDetector } from './phase-detector.js';
import { type ApsfPhase } from './phases.js';
import { transition, loadRunState, atomicWrite, appendSessionEvent } from './run-state.js';

/** phase → (owner, 対象ファイル)（main.py phase_target_map） */
const PHASE_TARGET: Record<string, { role: string; file: string }> = {
  SETUP_NEEDED: { role: 'Human', file: 'execution-assignment.md' },
  GOAL_NEEDED: { role: 'Human', file: 'goal.md' },
  PLAN_NEEDED: { role: 'Planner', file: 'plan.md' },
  IMPROVE_PLAN_OPTIONAL: { role: 'Judge (Human)', file: 'improve-plan.md' },
  BUILD_NEEDED: { role: 'Builder', file: 'build.md' },
  REVIEW_NEEDED: { role: 'Critic', file: 'review.md' },
  IMPROVE_NEEDED: { role: 'Judge (Human)', file: 'improve.md' },
  VERIFY_OPTIONAL: { role: 'Judge (Human)', file: 'verify.md' },
  RESULT_NEEDED: { role: 'Human', file: 'result.md' },
  TRANSCRIPT_RECOMMENDED: { role: 'Human (optional)', file: 'transcript.md' },
  // light run
  TASK_NEEDED: { role: 'Human', file: 'task.md' },
};

const TRANSPORT_LINE_RE = new RegExp(
  '^\\s*(?:' +
    '\\[APSF\\]|\\[Step \\d+/\\d+\\]|\\[Done\\]|\\[Note\\]|\\[FAIL\\]|\\[Error\\]|\\[Warn\\]|' +
    'Do you want to allow|Allow this action|Permission required|Approval required' +
    ')',
  'i'
);

/** _sanitize_phase_input（main.py:75-110 の忠実移植） */
export function sanitizePhaseInput(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let lines = normalized.split('\n');

  let firstHeadingIndex: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*#\s+\S/.test(lines[i])) {
      firstHeadingIndex = i;
      break;
    }
  }
  if (
    firstHeadingIndex !== null &&
    lines.slice(0, firstHeadingIndex).some((l) => l.trim())
  ) {
    lines = lines.slice(firstHeadingIndex);
  }

  while (lines.length) {
    const s = lines[0].trim();
    if (!s) {
      lines.shift();
      continue;
    }
    if (TRANSPORT_LINE_RE.test(s)) {
      lines.shift();
      continue;
    }
    break;
  }

  const joined = lines.join('\n').trim();
  return joined + (lines.length ? '\n' : '');
}

/** _next_phase_after_write（main.py:1495-1522 の決定木） */
export function nextPhaseAfterWrite(runDir: string, phase: string): ApsfPhase {
  const exists = (f: string) => fs.existsSync(path.join(runDir, f));
  const filled = (f: string) => new PhaseDetector(runDir).isFilledPublic(f);

  switch (phase) {
    case 'TASK_NEEDED':
      // NOTE: python の _next_phase_after_write は TASK_NEEDED を扱わず
      // current_phase を返し、後続の `apsf next` の advisory sync が
      // BUILD_NEEDED へ前進させる（2 段階）。TS 版は書き手が Explorer に
      // 一本化されたため、この sync を write-phase に畳み込む（最終状態は同一）
      return 'BUILD_NEEDED';
    case 'SETUP_NEEDED':
      return 'GOAL_NEEDED';
    case 'GOAL_NEEDED':
      return 'PLAN_NEEDED';
    case 'PLAN_NEEDED':
      return 'BUILD_NEEDED';
    case 'BUILD_NEEDED':
      return 'REVIEW_NEEDED';
    case 'REVIEW_NEEDED':
      return exists('improve-plan.md') && !filled('improve-plan.md')
        ? 'IMPROVE_PLAN_OPTIONAL'
        : 'IMPROVE_NEEDED';
    case 'IMPROVE_PLAN_OPTIONAL':
      return 'IMPROVE_NEEDED';
    case 'IMPROVE_NEEDED':
      return exists('verify.md') && !filled('verify.md')
        ? 'VERIFY_OPTIONAL'
        : 'RESULT_NEEDED';
    case 'VERIFY_OPTIONAL':
      return 'RESULT_NEEDED';
    case 'RESULT_NEEDED':
      return !filled('transcript.md') ? 'TRANSCRIPT_RECOMMENDED' : 'COMPLETE';
    case 'TRANSCRIPT_RECOMMENDED':
      return 'COMPLETE';
    default:
      throw new Error(`No next phase defined after write for: ${phase}`);
  }
}

// ── Judge advisory（core/advisory.py） ───────────────────────────

const ADVISORY_BLOCK_RE = /```apsf-judge-advisory\s+(\{[\s\S]*?\})\s+```/gi;
const ADVISORY_RECOMMENDATIONS = new Set(['Return to Build', 'Return to Plan', 'Accept']);

export function parseReviewJudgeAdvisory(reviewText: string): {
  recommendation: string;
  human_owned_blocker: boolean;
} {
  const matches = [...reviewText.matchAll(ADVISORY_BLOCK_RE)];
  if (matches.length === 0) {
    throw new Error(
      'review.md must include exactly one ```apsf-judge-advisory``` JSON block ' +
        'with recommendation and human_owned_blocker.'
    );
  }
  if (matches.length !== 1) {
    throw new Error(
      'review.md must include exactly one ```apsf-judge-advisory``` JSON block; ' +
        'multiple blocks are not allowed.'
    );
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(matches[0][1]);
  } catch {
    throw new Error('review.md advisory block must contain valid JSON.');
  }
  const recommendation = String(payload?.recommendation ?? '').trim();
  if (!ADVISORY_RECOMMENDATIONS.has(recommendation)) {
    throw new Error(
      'review.md advisory recommendation must be one of: Return to Build, Return to Plan, Accept.'
    );
  }
  if (typeof payload.human_owned_blocker !== 'boolean') {
    throw new Error('review.md advisory human_owned_blocker must be true or false.');
  }
  return { recommendation, human_owned_blocker: payload.human_owned_blocker };
}

function writeCanonicalJudgeAdvisory(
  runDir: string,
  opts: {
    recommendation: string;
    humanOwnedBlocker: boolean;
    phase: string;
    freshnessToken: string | null;
  }
): void {
  // ownership_status: transition_outcome.json の有無で決定
  // （rebuild_feedback.get_build_gate_decision 簡易版: record があれば
  //   blocker_owner を、なければ UNRECORDED を報告）
  let ownershipStatus: string | null = 'UNRECORDED';
  let ownershipDetail: string | null = `transition outcome record not found for run '${path.basename(runDir)}'`;
  const outcomePath = path.join(runDir, 'transition_outcome.json');
  if (fs.existsSync(outcomePath)) {
    try {
      const rec = JSON.parse(fs.readFileSync(outcomePath, 'utf-8'));
      ownershipStatus = String(rec.blocker_owner ?? 'UNRECORDED');
      ownershipDetail = null;
    } catch { /* keep UNRECORDED */ }
  }

  const payload = {
    recommendation: opts.recommendation,
    human_owned_blocker: opts.humanOwnedBlocker,
    human_owned_blocker_state: 'valid',
    advisory_source: 'judge_structured',
    run_id: path.basename(runDir),
    generated_at: new Date().toISOString(),
    phase: opts.phase,
    ownership_status: ownershipStatus,
    ownership_detail: ownershipDetail,
    source: 'write-phase review completion',
    freshness_token: opts.freshnessToken,
  };
  fs.writeFileSync(
    path.join(runDir, 'judge_advisory.json'),
    JSON.stringify(payload, null, 2),
    'utf-8'
  );
}

// ── writePhase 本体 ───────────────────────────────────────────────

export interface WritePhaseResult {
  fileWritten: string;
  phaseBefore: string;
  phaseAfter: string;
}

/**
 * 現在 phase の書き込み先を解決する（API 層の事前検証用）。
 * 書き込み可能なターゲットがない phase では null を返す。
 */
export function resolveWriteTarget(
  runDir: string
): { phase: string; role: string; file: string } | null {
  const info = new PhaseDetector(runDir).detect();
  const target = PHASE_TARGET[info.phase];
  if (!target || target.file === '(none)') return null;
  return { phase: info.phase, role: target.role, file: target.file };
}

export function writePhase(
  runDir: string,
  rawContent: string,
  options: { force?: boolean; forceReason?: string } = {}
): WritePhaseResult {
  const detector = new PhaseDetector(runDir);

  // 1. canonical phase 解決
  const info = detector.detect();
  const phase = info.phase;

  const target = PHASE_TARGET[phase];
  if (!target || target.file === '(none)') {
    throw new Error(`No writable target file for phase: ${phase}`);
  }

  // 2. sanitize + バリデーション
  const content = sanitizePhaseInput(rawContent);
  if (!PhaseDetector.isMeaningfulText(content)) {
    throw new Error(
      `Content for ${target.file} is empty or template-only ` +
        '(more than 3 non-heading, non-empty lines are required). Nothing saved.'
    );
  }

  // 3. 上書き保護
  if (detector.hasAnyContent(target.file)) {
    if (!options.force) {
      throw new Error(
        `${target.file} already has content. Use force with a reason to overwrite.`
      );
    }
    if (!options.forceReason) {
      throw new Error('forceReason is required when force is set.');
    }
  }

  // 4. review.md は保存前に advisory を検証・抽出
  //    （保存後に検証すると、無効な内容で review.md が汚染されたまま
  //    エラーになる — codex full-cycle 検証で発見した実バグの修正）
  let reviewAdvisory: { recommendation: string; human_owned_blocker: boolean } | null = null;
  if (target.file === 'review.md') {
    reviewAdvisory = parseReviewJudgeAdvisory(content);
  }

  // 5. 保存（python write_text と同じ OS ネイティブ改行）
  const osContent = os.EOL === '\n' ? content : content.replace(/\n/g, os.EOL);
  atomicWrite(path.join(runDir, target.file), osContent);

  // 6. run_state 遷移
  const nextPhase = nextPhaseAfterWrite(runDir, phase);
  const result = transition(runDir, {
    toPhase: nextPhase,
    actor: 'system',
    reason: 'write-phase canonical state sync',
    runType: loadRunState(runDir)?.run_type,
  });
  if (!result.success) {
    throw new Error(result.error ?? 'transition failed');
  }

  // 7. IMPROVE_NEEDED 突入時の canonical judge advisory
  if (nextPhase === 'IMPROVE_NEEDED' && reviewAdvisory) {
    const state = loadRunState(runDir);
    writeCanonicalJudgeAdvisory(runDir, {
      recommendation: reviewAdvisory.recommendation,
      humanOwnedBlocker: reviewAdvisory.human_owned_blocker,
      phase: nextPhase,
      freshnessToken: state?.phase_entered_at || null,
    });
  }

  // 8. force 監査記録（force_audit.jsonl）
  if (options.force) {
    appendSessionEvent(runDir, 'force_override', path.basename(runDir), {
      command: 'write-phase',
      target_file: target.file,
      reason: options.forceReason,
      override_kind: 'overwrite',
    });
  }

  return { fileWritten: target.file, phaseBefore: phase, phaseAfter: nextPhase };
}
