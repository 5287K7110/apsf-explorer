/**
 * Judge 裁定（IMPROVE_NEEDED での Accept / Return to Build / Return to Plan）
 *
 * v0.2.0 検証で codex Critic が「Return to Build」を推奨したが、Explorer には
 * その裁定を実行する手段がなかった（1 周 + 停止）。本モジュールは Judge の
 * 裁定を canonical 遷移として実装し、human-gated loop を完成させる。
 *
 * 裁定 = 3 要素:
 *   1. Judge の意思（decision）
 *   2. 差し戻し理由の成果物化（build_review.md / plan_review.md）
 *   3. canonical 遷移（actor=Judge — 遷移表を迂回可能だが正当遷移のみ使う。
 *      IMPROVE_NEEDED->BUILD_NEEDED / IMPROVE_NEEDED->PLAN_NEEDED は
 *      VALID_TRANSITIONS に含まれる正当遷移）
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PhaseDetector } from './phase-detector.js';
import { isValidTransition } from './phases.js';
import { atomicWrite, appendSessionEvent, loadRunState, transition } from './run-state.js';

export const JUDGE_DECISIONS = ['Accept', 'Return to Build', 'Return to Plan'] as const;
export type JudgeDecision = (typeof JUDGE_DECISIONS)[number];

/** IMPROVE_NEEDED 以外での裁定要求（HTTP 409 相当） */
export class JudgeDecisionConflictError extends Error {
  readonly statusCode = 409;
}

/** decision → 遷移先 + 理由ファイルのマッピング */
const RETURN_TARGETS: Record<
  string,
  { toPhase: 'BUILD_NEEDED' | 'PLAN_NEEDED'; reasonFile: string; title: string }
> = {
  'Return to Build': {
    toPhase: 'BUILD_NEEDED',
    reasonFile: 'build_review.md',
    title: 'Build Review',
  },
  'Return to Plan': {
    toPhase: 'PLAN_NEEDED',
    reasonFile: 'plan_review.md',
    title: 'Plan Review',
  },
};

export interface JudgeDecisionResult {
  decision: JudgeDecision;
  phaseBefore: string;
  phaseAfter: string;
  reasonFile: string | null;
  advisoryRecommendation: string | null;
  matchesAdvisory: boolean | null;
  /** 差し戻しで退避された旧成果物（<name>.superseded-<ts>.md） */
  supersededFiles: string[];
}

/**
 * 差し戻し先フェーズの下流成果物（やり直し対象 + その後続）。
 *
 * これらを残したまま差し戻すと、file-heuristic の advisory 検出が
 * 「充足済みファイル」を根拠に canonical フェーズを valid-forward で追い越し、
 * やり直しフェーズが実行不能になる（例: 旧 review.md が残っていると
 * 再ビルド後の REVIEW_NEEDED が IMPROVE_NEEDED に吸われ、再レビューが走らない
 * — run 2026-07-07-001 のドッグフーディングで発見した実バグ）。
 * python 版は review_rerun_*.md 等の別名ファイルで履歴を積むが、Explorer は
 * runs/ の単独の書き手なので「退避 + 正名で書き直し」に一本化する。
 */
const SUPERSEDE_TARGETS: Record<string, string[]> = {
  'Return to Build': ['build.md', 'review.md'],
  'Return to Plan': ['plan.md', 'build.md', 'review.md'],
};

/** 下流成果物を <name>.superseded-<ts>.md へ退避し、stale advisory を除去する */
function supersedeDownstream(runDir: string, decision: string): string[] {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const superseded: string[] = [];
  for (const file of SUPERSEDE_TARGETS[decision] ?? []) {
    const src = path.join(runDir, file);
    if (!fs.existsSync(src)) continue;
    const archived = file.replace(/\.md$/, `.superseded-${stamp}.md`);
    fs.renameSync(src, path.join(runDir, archived));
    superseded.push(archived);
  }
  // 旧 review 由来の advisory は消費済み（stale）
  fs.rmSync(path.join(runDir, 'judge_advisory.json'), { force: true });
  return superseded;
}

function readAdvisoryRecommendation(runDir: string): string | null {
  const p = path.join(runDir, 'judge_advisory.json');
  if (!fs.existsSync(p)) return null;
  try {
    const advisory = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const rec = String(advisory?.recommendation ?? '').trim();
    return rec || null;
  } catch {
    return null;
  }
}

/** 差し戻し理由ファイルの本文を組み立てる（meaningful-content 検証を通る形式） */
function buildReasonDocument(opts: {
  title: string;
  decision: JudgeDecision;
  reason: string;
  advisoryRecommendation: string | null;
  matchesAdvisory: boolean | null;
}): string {
  return [
    `# ${opts.title} — Judge Decision`,
    '',
    '## Decision',
    '',
    opts.decision,
    '',
    '## Context',
    '',
    `- decided_at: ${new Date().toISOString()}`,
    `- critic_recommendation: ${opts.advisoryRecommendation ?? '(none)'}`,
    `- matches_advisory: ${opts.matchesAdvisory ?? 'n/a'}`,
    '',
    '## Reason',
    '',
    opts.reason.trim(),
    '',
  ].join('\n');
}

/**
 * Judge 裁定を適用する。
 *
 * - Accept: 遷移しない（improve.md の記入 = 既存 write-phase フローが担う）。
 *   裁定の記録のみ session_events に残す。
 * - Return to Build / Return to Plan: 理由必須。理由ファイルを書き、
 *   actor=Judge で正当遷移する。
 */
export function applyJudgeDecision(
  runDir: string,
  decision: string,
  reason?: string
): JudgeDecisionResult {
  if (!(JUDGE_DECISIONS as readonly string[]).includes(decision)) {
    throw new Error(
      `Invalid judge decision: ${decision}. Must be one of: ${JUDGE_DECISIONS.join(', ')}`
    );
  }

  // canonical phase（run_state.json 優先）で IMPROVE_NEEDED を要求
  const detector = new PhaseDetector(runDir);
  const phaseBefore = detector.detect().phase;
  if (phaseBefore !== 'IMPROVE_NEEDED') {
    throw new JudgeDecisionConflictError(
      `Judge decision requires IMPROVE_NEEDED, but run is at ${phaseBefore}.`
    );
  }

  // advisory との整合チェック（不一致でも Judge の裁定が優先 — 記録のみ）
  const advisoryRecommendation = readAdvisoryRecommendation(runDir);
  const matchesAdvisory =
    advisoryRecommendation === null ? null : advisoryRecommendation === decision;

  const runId = path.basename(runDir);

  if (decision === 'Accept') {
    appendSessionEvent(runDir, 'judge_decision', runId, {
      decision,
      // Accept の理由も監査ログに残す（従来は Return 系のみ *_review.md に記録され、
      // Accept の理由は破棄されていた）
      reason: reason?.trim() || null,
      advisory_recommendation: advisoryRecommendation,
      matches_advisory: matchesAdvisory,
    });
    return {
      decision,
      phaseBefore,
      phaseAfter: phaseBefore,
      reasonFile: null,
      advisoryRecommendation,
      matchesAdvisory,
      supersededFiles: [],
    };
  }

  // Return 系は理由必須
  const trimmedReason = (reason ?? '').trim();
  if (!trimmedReason) {
    throw new Error(`A reason is required for "${decision}".`);
  }

  // light run に PLAN フェーズはない（task.md → BUILD 直行のため、
  // PLAN_NEEDED へ差し戻すと file-heuristic と永続的に矛盾する）
  const runType = loadRunState(runDir)?.run_type;
  if (decision === 'Return to Plan' && runType === 'light') {
    throw new Error('Return to Plan is not available for light runs (no plan phase). Use Return to Build.');
  }

  const target = RETURN_TARGETS[decision];
  // 防御的確認: 使用する遷移が遷移表上も正当であること（actor=Judge は
  // 迂回可能だが、正当遷移のみ使う方針）
  if (!isValidTransition('IMPROVE_NEEDED', target.toPhase)) {
    throw new Error(`Transition IMPROVE_NEEDED->${target.toPhase} is not in VALID_TRANSITIONS.`);
  }

  let doc = buildReasonDocument({
    title: target.title,
    decision: decision as JudgeDecision,
    reason: trimmedReason,
    advisoryRecommendation,
    matchesAdvisory,
  });
  if (!PhaseDetector.isMeaningfulText(doc)) {
    throw new Error(`Reason for ${target.reasonFile} is empty or template-only.`);
  }

  // 既存の理由ファイル（前サイクルの差し戻し）は上書きせず追記する
  const reasonPath = path.join(runDir, target.reasonFile);
  if (detector.hasAnyContent(target.reasonFile)) {
    const existing = fs.readFileSync(reasonPath, 'utf-8').replace(/\s+$/, '');
    doc = `${existing}\n\n---\n\n${doc.replace(/^# .*\n\n/, `## ${target.title} — Judge Decision (repeat)\n\n`)}`;
  }

  // 下流成果物の退避は理由ファイル保存より先に行う（review.md 等の退避と
  // build_review.md の書き込みが同一ディレクトリで競合しないよう順序を固定）
  const supersededFiles = supersedeDownstream(runDir, decision);

  const osDoc = os.EOL === '\n' ? doc : doc.replace(/\r?\n/g, os.EOL);
  atomicWrite(reasonPath, osDoc);

  const result = transition(runDir, {
    toPhase: target.toPhase,
    actor: 'Judge',
    reason: `judge decision: ${decision}`,
    runType,
  });
  if (!result.success) {
    throw new Error(result.error ?? 'judge transition failed');
  }

  appendSessionEvent(runDir, 'judge_decision', runId, {
    decision,
    to_phase: target.toPhase,
    reason_file: target.reasonFile,
    advisory_recommendation: advisoryRecommendation,
    matches_advisory: matchesAdvisory,
    superseded_files: supersededFiles,
  });

  return {
    decision: decision as JudgeDecision,
    phaseBefore,
    phaseAfter: target.toPhase,
    reasonFile: target.reasonFile,
    advisoryRecommendation,
    matchesAdvisory,
    supersededFiles,
  };
}
