import { NativeApsfExecutor } from './apsf-native/native-executor.js';
const executionQueue = [];
let runningEntry = null;
let drainActive = false;
function emitError(emitter, runId, message) {
    emitter.emit('event', {
        type: 'error',
        runId,
        timestamp: Date.now(),
        data: { error: message },
    });
}
function broadcastQueueState(emitter, runId) {
    emitter.emit('event', {
        type: 'queue',
        runId,
        timestamp: Date.now(),
        data: { mode: 'apsf-run', ...getQueueState() },
    });
}
async function runExecution(entry, executor) {
    const { request, emitter, apsfRoot } = entry;
    try {
        const provider = request.provider === 'codex' ? 'codex' : 'claude';
        const providers = request.providers;
        const specialists = request.specialists;
        const dryRun = Boolean(request.context?.dryRun);
        const isLoop = request.command === 'full-cycle';
        console.log(`[APSF-RUN] native ${isLoop ? 'auto-loop' : 'single-phase'} ${request.runId}${dryRun ? ' (DryRun)' : ''}` +
            (providers ? ` providers=${JSON.stringify(providers)}` : ''));
        executor.on('event', (event) => emitter.emit('event', event));
        const opts = { runId: request.runId, provider, providers, specialists, dryRun };
        let phase;
        let detail = {};
        if (isLoop) {
            const result = await executor.executeLoop(opts);
            phase = result.phase;
            detail = { cycles: result.cycles, stopReason: result.stopReason };
        }
        else {
            phase = await executor.executePhase(opts);
        }
        emitter.emit('event', {
            type: 'complete',
            runId: request.runId,
            timestamp: Date.now(),
            data: { mode: 'apsf-run', engine: 'native', exitCode: 0, phase, ...detail },
        });
    }
    catch (error) {
        emitError(emitter, request.runId, error instanceof Error ? error.message : 'Unknown error');
    }
}
/** FIFO drain — 常に 1 件だけ実行。1 件の失敗は次の実行を止めない */
async function drain() {
    if (drainActive)
        return;
    drainActive = true;
    try {
        while (executionQueue.length > 0) {
            const entry = executionQueue.shift();
            const { request, emitter, apsfRoot } = entry;
            const executor = new NativeApsfExecutor(apsfRoot);
            runningEntry = { runId: request.runId, executor };
            emitter.emit('event', {
                type: 'started',
                runId: request.runId,
                timestamp: Date.now(),
                data: { mode: 'apsf-run', command: request.command, message: '[queue] execution started' },
            });
            broadcastQueueState(emitter, request.runId);
            try {
                await runExecution(entry, executor);
            }
            catch (error) {
                console.error('[APSF-RUN] drain caught unexpected error:', error);
            }
            finally {
                runningEntry = null;
                broadcastQueueState(emitter, request.runId);
            }
        }
    }
    finally {
        drainActive = false;
    }
}
/** キューに追加して drain を開始 */
export function enqueue(entry) {
    const { request, emitter } = entry;
    if (runningEntry?.runId === request.runId ||
        executionQueue.some((e) => e.request.runId === request.runId)) {
        emitError(emitter, request.runId, `Run ${request.runId} is already executing or queued. Cancel it first or wait for completion.`);
        return;
    }
    executionQueue.push(entry);
    if (runningEntry || executionQueue.length > 1) {
        const position = executionQueue.length - 1 + (runningEntry ? 1 : 0);
        emitter.emit('event', {
            type: 'queued',
            runId: request.runId,
            timestamp: Date.now(),
            data: {
                mode: 'apsf-run',
                position,
                message: `[queue] waiting at position ${position} (running: ${runningEntry?.runId ?? '(draining)'})`,
            },
        });
    }
    broadcastQueueState(emitter, request.runId);
    void drain();
}
/** 実行中の処理をキャンセル（待機列からの除去も含む） */
export function cancelExecution(runId) {
    if (runningEntry?.runId === runId) {
        runningEntry.executor.cancel();
        return;
    }
    const idx = executionQueue.findIndex((e) => e.request.runId === runId);
    if (idx >= 0) {
        const [entry] = executionQueue.splice(idx, 1);
        emitError(entry.emitter, runId, 'Cancelled while queued.');
        broadcastQueueState(entry.emitter, runId);
    }
}
/** 実行中 + 待機中の run 一覧 */
export function listExecuting() {
    return [
        ...(runningEntry ? [runningEntry.runId] : []),
        ...executionQueue.map((e) => e.request.runId),
    ];
}
/** キュー状態（GET /api/runs/queue） */
export function getQueueState() {
    return {
        running: runningEntry?.runId ?? null,
        queued: executionQueue.map((e) => e.request.runId),
    };
}
