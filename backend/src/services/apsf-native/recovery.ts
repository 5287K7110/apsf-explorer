/**
 * クラッシュ回復 — 起動時の orphaned run の修復
 *
 * 実行レジストリはメモリのみのため、backend がクラッシュ・強制終了すると
 * 実行中だった run の executor_state.json（実行マーカー）が残存し、
 * UI からは「永遠に Executing」に見える。
 *
 * 起動時に全 run を走査し、stale マーカーを検出したら:
 * - AUTO_OWNED フェーズ（PLAN/BUILD/REVIEW）: phase_status=failed +
 *   last_error を run_state に記録（再実行で回復できる）
 * - human フェーズ / COMPLETE: 実行は既に正常完了していた（クラッシュは
 *   保存後）とみなし、マーカー除去のみ（誤 failed 化しない）
 * - いずれの場合もマーカーは削除する
 */
import * as fs from 'fs';
import * as path from 'path';
import { PhaseDetector } from './phase-detector.js';
import { AUTO_OWNED_PHASES } from './phases.js';
import { setPhaseStatus } from './run-state.js';
import { EXECUTOR_MARKER } from './native-executor.js';

export interface RecoveredRun {
  runId: string;
  phase: string;
  action: 'marked_failed' | 'marker_removed';
  lastError?: string;
}

/** runs/ 配下の run ディレクトリ一覧（bridge.listRuns と同じ配置規則） */
function listRunDirs(apsfRoot: string): string[] {
  const runsDir = path.join(apsfRoot, 'runs');
  if (!fs.existsSync(runsDir)) return [];
  const isRunName = (name: string) => /^\d{4}-\d{2}-\d{2}/.test(name);
  const dirs: string[] = [];
  for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (isRunName(entry.name)) {
      dirs.push(path.join(runsDir, entry.name));
    } else if (['fw-improvement', 'work'].includes(entry.name)) {
      const sub = path.join(runsDir, entry.name);
      for (const child of fs.readdirSync(sub, { withFileTypes: true })) {
        if (child.isDirectory() && isRunName(child.name)) {
          dirs.push(path.join(sub, child.name));
        }
      }
    }
  }
  return dirs;
}

/**
 * stale 実行マーカーを走査し、orphaned run を修復する。
 * 例外は個別 run 単位で握りつぶす（回復処理が起動を妨げない）。
 */
export function recoverOrphanedRuns(apsfRoot: string): RecoveredRun[] {
  const recovered: RecoveredRun[] = [];
  for (const runDir of listRunDirs(apsfRoot)) {
    try {
      const markerPath = path.join(runDir, EXECUTOR_MARKER);
      if (!fs.existsSync(markerPath)) continue;

      let marker: { pid?: number; startedAt?: string; phase?: string } = {};
      try {
        marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
      } catch { /* 壊れたマーカーも stale として扱う */ }

      const runId = path.basename(runDir);
      const phase = new PhaseDetector(runDir).detect().phase;

      if (AUTO_OWNED_PHASES.has(phase)) {
        const lastError =
          `Backend terminated during execution (marker: pid=${marker.pid ?? '?'}, ` +
          `phase=${marker.phase ?? '?'}, startedAt=${marker.startedAt ?? '?'}). ` +
          'Re-run this phase to recover.';
        setPhaseStatus(runDir, 'failed', lastError);
        recovered.push({ runId, phase, action: 'marked_failed', lastError });
      } else {
        // human フェーズ / COMPLETE まで進んでいた = 実行成果は保存済み
        recovered.push({ runId, phase, action: 'marker_removed' });
      }
      fs.rmSync(markerPath, { force: true });
    } catch { /* この run はスキップ（他の run の回復を続ける） */ }
  }
  return recovered;
}
