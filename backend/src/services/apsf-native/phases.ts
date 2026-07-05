/**
 * APSF フェーズ定義（共有定数）
 *
 * 参照仕様: ai-problem-solving-framework
 *   src/apsf/legacy/orchestration/phase_detector.py (Phase / HUMAN_OWNED_PHASES)
 *   src/apsf/core/state/transition_service.py (VALID_TRANSITIONS)
 */

export const PHASES = [
  'TASK_NEEDED',
  'SETUP_NEEDED',
  'GOAL_NEEDED',
  'PLAN_NEEDED',
  'IMPROVE_PLAN_OPTIONAL',
  'BUILD_NEEDED',
  'REVIEW_NEEDED',
  'IMPROVE_NEEDED',
  'VERIFY_OPTIONAL',
  'RESULT_NEEDED',
  'TRANSCRIPT_RECOMMENDED',
  'COMPLETE',
] as const;

export type ApsfPhase = (typeof PHASES)[number];

/** 人間が担うフェーズ（auto-loop はここで停止する） */
export const HUMAN_OWNED_PHASES: ReadonlySet<ApsfPhase> = new Set([
  'TASK_NEEDED',
  'SETUP_NEEDED',
  'GOAL_NEEDED',
  'IMPROVE_PLAN_OPTIONAL',
  'IMPROVE_NEEDED',
  'VERIFY_OPTIONAL',
  'RESULT_NEEDED',
  'TRANSCRIPT_RECOMMENDED',
  'COMPLETE',
] as ApsfPhase[]);

/** LLM が担えるフェーズ */
export const AUTO_OWNED_PHASES: ReadonlySet<ApsfPhase> = new Set([
  'PLAN_NEEDED',
  'BUILD_NEEDED',
  'REVIEW_NEEDED',
] as ApsfPhase[]);

/**
 * 正当なフェーズ遷移（"from->to"）
 * transition_service.py VALID_TRANSITIONS の移植
 */
export const VALID_TRANSITIONS: ReadonlySet<string> = new Set([
  // Bootstrap
  ...PHASES.map((p) => `->${p}`),
  // Light run flow
  'TASK_NEEDED->BUILD_NEEDED',
  'TASK_NEEDED->GOAL_NEEDED',
  // Normal forward flow
  'GOAL_NEEDED->SETUP_NEEDED',
  'GOAL_NEEDED->PLAN_NEEDED',
  'SETUP_NEEDED->PLAN_NEEDED',
  'PLAN_NEEDED->BUILD_NEEDED',
  'PLAN_NEEDED->IMPROVE_PLAN_OPTIONAL',
  'IMPROVE_PLAN_OPTIONAL->BUILD_NEEDED',
  'IMPROVE_PLAN_OPTIONAL->PLAN_NEEDED',
  'IMPROVE_PLAN_OPTIONAL->IMPROVE_NEEDED',
  'BUILD_NEEDED->REVIEW_NEEDED',
  // From REVIEW_NEEDED
  'REVIEW_NEEDED->BUILD_NEEDED',
  'REVIEW_NEEDED->REVIEW_NEEDED',
  'REVIEW_NEEDED->IMPROVE_PLAN_OPTIONAL',
  'REVIEW_NEEDED->IMPROVE_NEEDED',
  'REVIEW_NEEDED->VERIFY_OPTIONAL',
  'REVIEW_NEEDED->RESULT_NEEDED',
  'REVIEW_NEEDED->TRANSCRIPT_RECOMMENDED',
  'REVIEW_NEEDED->COMPLETE',
  // Improve phase
  'IMPROVE_NEEDED->VERIFY_OPTIONAL',
  'IMPROVE_NEEDED->RESULT_NEEDED',
  'IMPROVE_NEEDED->BUILD_NEEDED',
  'IMPROVE_NEEDED->PLAN_NEEDED',
  'IMPROVE_NEEDED->REVIEW_NEEDED',
  // Verify phase
  'VERIFY_OPTIONAL->RESULT_NEEDED',
  'VERIFY_OPTIONAL->BUILD_NEEDED',
  'VERIFY_OPTIONAL->REVIEW_NEEDED',
  // Close-out
  'RESULT_NEEDED->TRANSCRIPT_RECOMMENDED',
  'RESULT_NEEDED->COMPLETE',
  'TRANSCRIPT_RECOMMENDED->COMPLETE',
  // Human phase auto-advance
  'SETUP_NEEDED->GOAL_NEEDED',
]);

export function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS.has(`${from}->${to}`);
}

export function isHumanPhase(phase: string): boolean {
  return HUMAN_OWNED_PHASES.has(phase as ApsfPhase);
}
