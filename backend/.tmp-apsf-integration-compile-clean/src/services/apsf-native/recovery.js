import * as fs from 'fs';
import * as path from 'path';
import { PhaseDetector } from './phase-detector.js';
import { AUTO_OWNED_PHASES } from './phases.js';
import { setPhaseStatus } from './run-state.js';
import { EXECUTOR_MARKER } from './native-executor.js';
function listRunDirs(apsfRoot) {
    const runsDir = path.join(apsfRoot, 'runs');
    if (!fs.existsSync(runsDir))
        return [];
    const isRunName = (name) => /^\d{4}-\d{2}-\d{2}/.test(name);
    const dirs = [];
    for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
        if (!entry.isDirectory())
            continue;
        if (isRunName(entry.name)) {
            dirs.push(path.join(runsDir, entry.name));
        }
        else if (['fw-improvement', 'work'].includes(entry.name)) {
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
export function recoverOrphanedRuns(apsfRoot) {
    const recovered = [];
    for (const runDir of listRunDirs(apsfRoot)) {
        try {
            const markerPath = path.join(runDir, EXECUTOR_MARKER);
            if (!fs.existsSync(markerPath))
                continue;
            let marker = {};
            try {
                marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
            }
            catch { }
            const runId = path.basename(runDir);
            const phase = new PhaseDetector(runDir).detect().phase;
            if (AUTO_OWNED_PHASES.has(phase)) {
                const lastError = `Backend terminated during execution (marker: pid=${marker.pid ?? '?'}, ` +
                    `phase=${marker.phase ?? '?'}, startedAt=${marker.startedAt ?? '?'}). ` +
                    'Re-run this phase to recover.';
                setPhaseStatus(runDir, 'failed', lastError);
                recovered.push({ runId, phase, action: 'marked_failed', lastError });
            }
            else {
                recovered.push({ runId, phase, action: 'marker_removed' });
            }
            fs.rmSync(markerPath, { force: true });
        }
        catch { }
    }
    return recovered;
}
