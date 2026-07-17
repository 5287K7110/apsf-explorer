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
];
/** 人間が担うフェーズ（auto-loop はここで停止する） */
export const HUMAN_OWNED_PHASES = new Set([
    'TASK_NEEDED',
    'SETUP_NEEDED',
    'GOAL_NEEDED',
    'IMPROVE_PLAN_OPTIONAL',
    'IMPROVE_NEEDED',
    'VERIFY_OPTIONAL',
    'RESULT_NEEDED',
    'TRANSCRIPT_RECOMMENDED',
    'COMPLETE',
]);
/** LLM が担えるフェーズ */
export const AUTO_OWNED_PHASES = new Set([
    'PLAN_NEEDED',
    'BUILD_NEEDED',
    'REVIEW_NEEDED',
]);
/**
 * 正当なフェーズ遷移（"from->to"）
 * transition_service.py VALID_TRANSITIONS の移植
 */
export const VALID_TRANSITIONS = new Set([
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
export function isValidTransition(from, to) {
    return VALID_TRANSITIONS.has(`${from}->${to}`);
}
/** phase → (owner, 対象ファイル)（main.py phase_target_map） */
export const PHASE_TARGET = {
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
export function isHumanPhase(phase) {
    return HUMAN_OWNED_PHASES.has(phase);
}
