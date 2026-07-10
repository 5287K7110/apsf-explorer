import { EventEmitter } from 'events';
import { type ExecuteRequest, type StreamEvent } from '../types/index.js';
import { NativeApsfExecutor } from './apsf-native/native-executor.js';

/**
 * 実行キュー（モジュールレベル共有）。
 * ExecutionModeRouter は getExecutor 毎に新しい APSFRunBridge を作るため、
 * キュー・実行中状態・二重実行ガードはインスタンスを跨いで共有する必要がある。
 *
 * 設計判断: 同時実行は 1 件に制限し、以降の要求は FIFO で直列処理する
 * （複数 run の並行実行はイベント混線・CLI リソース競合が未設計のため）。
 * キューはメモリのみ — プロセス再起動で消えるのは意図的。
 */

export interface QueueEntry {
  request: ExecuteRequest;
  emitter: EventEmitter;
  apsfRoot: string;
}

const executionQueue: QueueEntry[] = [];
let runningEntry: { runId: string; executor: NativeApsfExecutor } | null = null;
let drainActive = false;

function emitError(emitter: EventEmitter, runId: string, message: string): void {
  emitter.emit('event', {
    type: 'error',
    runId,
    timestamp: Date.now(),
    data: { error: message },
  } as StreamEvent);
}

function broadcastQueueState(emitter: EventEmitter, runId: string): void {
  emitter.emit('event', {
    type: 'queue',
    runId,
    timestamp: Date.now(),
    data: { mode: 'apsf-run', ...getQueueState() },
  } as StreamEvent);
}

async function runExecution(entry: QueueEntry, executor: NativeApsfExecutor): Promise<void> {
  const { request, emitter, apsfRoot } = entry;
  try {
    const provider = request.provider === 'codex' ? 'codex' : 'claude';
    const dryRun = Boolean(request.context?.dryRun);
    const isLoop = request.command === 'full-cycle';

    console.log(
      `[APSF-RUN] native ${isLoop ? 'auto-loop' : 'single-phase'} ${request.runId}${dryRun ? ' (DryRun)' : ''}`
    );

    executor.on('event', (event: StreamEvent) => emitter.emit('event', event));

    const opts = { runId: request.runId, provider, dryRun } as const;
    let phase: string;
    let detail: Record<string, unknown> = {};

    if (isLoop) {
      const result = await executor.executeLoop(opts);
      phase = result.phase;
      detail = { cycles: result.cycles, stopReason: result.stopReason };
    } else {
      phase = await executor.executePhase(opts);
    }

    emitter.emit('event', {
      type: 'complete',
      runId: request.runId,
      timestamp: Date.now(),
      data: { mode: 'apsf-run', engine: 'native', exitCode: 0, phase, ...detail },
    } as StreamEvent);
  } catch (error) {
    emitError(emitter, request.runId, error instanceof Error ? error.message : 'Unknown error');
  }
}

/** FIFO drain — 常に 1 件だけ実行。1 件の失敗は次の実行を止めない */
async function drain(): Promise<void> {
  if (drainActive) return;
  drainActive = true;
  try {
    while (executionQueue.length > 0) {
      const entry = executionQueue.shift()!;
      const { request, emitter, apsfRoot } = entry;
      const executor = new NativeApsfExecutor(apsfRoot);
      runningEntry = { runId: request.runId, executor };
      emitter.emit('event', {
        type: 'started',
        runId: request.runId,
        timestamp: Date.now(),
        data: { mode: 'apsf-run', command: request.command, message: '[queue] execution started' },
      } as StreamEvent);
      broadcastQueueState(emitter, request.runId);
      try {
        await runExecution(entry, executor);
      } catch (error) {
        console.error('[APSF-RUN] drain caught unexpected error:', error);
      } finally {
        runningEntry = null;
        broadcastQueueState(emitter, request.runId);
      }
    }
  } finally {
    drainActive = false;
  }
}

/** キューに追加して drain を開始 */
export function enqueue(entry: QueueEntry): void {
  const { request, emitter } = entry;
  if (
    runningEntry?.runId === request.runId ||
    executionQueue.some((e) => e.request.runId === request.runId)
  ) {
    emitError(
      emitter,
      request.runId,
      `Run ${request.runId} is already executing or queued. Cancel it first or wait for completion.`
    );
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
    } as StreamEvent);
  }
  broadcastQueueState(emitter, request.runId);
  void drain();
}

/** 実行中の処理をキャンセル（待機列からの除去も含む） */
export function cancelExecution(runId: string): void {
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
export function listExecuting(): string[] {
  return [
    ...(runningEntry ? [runningEntry.runId] : []),
    ...executionQueue.map((e) => e.request.runId),
  ];
}

/** キュー状態（GET /api/runs/queue） */
export function getQueueState(): { running: string | null; queued: string[] } {
  return {
    running: runningEntry?.runId ?? null,
    queued: executionQueue.map((e) => e.request.runId),
  };
}
