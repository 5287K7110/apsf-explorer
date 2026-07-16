/**
 * APSF phase helpers (frontend-local copy)
 *
 * Source of truth: backend/src/services/apsf-native/phases.ts
 * Keep in sync when phases change.
 */

const HUMAN_OWNED_PHASES = new Set([
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

export function isHumanPhase(phase: string): boolean {
  return HUMAN_OWNED_PHASES.has(phase);
}
