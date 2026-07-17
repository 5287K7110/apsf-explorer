import WebSocket from 'ws';
import { ExecutionModeRouter } from '../services/execution-mode-router.js';
import { APSFRunBridge } from '../services/apsf-run-bridge.service.js';
import { executionEvents } from '../services/event-bus.js';
/**
 * WebSocket ハンドラー: リアルタイム実行進捗配信
 *
 * 実行経路: ExecutionModeRouter が mode に応じた Executor を選択
 * （cli-full / cli-lite / api / apsf-run。mode 未指定は EXECUTION_MODE のデフォルト）
 */
export class ExecutionHandler {
    constructor() {
        this.activeConnections = new Map();
        this.activeExecutors = new Map();
        this.connectionCounter = 0;
        this.modeRouter = new ExecutionModeRouter(process.env.EXECUTION_MODE || 'cli-full');
        this.setupEventListeners();
    }
    /**
     * WebSocket 接続を処理
     */
    async handleConnection(socket) {
        // NOTE: Date.now() のみだと同一ミリ秒の接続で ID が衝突し、
        // 片方の接続がイベント配信から漏れる（統合テストで発見）
        const connectionId = `conn-${Date.now()}-${++this.connectionCounter}`;
        socket.on('message', async (message) => {
            try {
                const data = JSON.parse(message.toString());
                if (data.type === 'execute') {
                    await this.handleExecute(socket, data.payload);
                }
                else if (data.type === 'cancel') {
                    this.handleCancel(data.runId);
                }
            }
            catch (error) {
                socket.send(JSON.stringify({
                    type: 'error',
                    error: error instanceof Error ? error.message : 'Unknown error',
                }));
            }
        });
        socket.on('close', () => {
            this.activeConnections.delete(connectionId);
        });
        this.activeConnections.set(connectionId, socket);
    }
    /**
     * 実行リクエストを処理
     */
    async handleExecute(socket, request) {
        try {
            // 実行開始イベント
            socket.send(JSON.stringify({
                type: 'execution-start',
                runId: request.runId,
                provider: request.provider,
                command: request.command,
            }));
            // 実行契約（REST と同一）: 本番では実 AI 実行 = apsf-run のみ。
            // cli-full / cli-lite はデモ・テスト専用のレガシー経路
            const effectiveMode = request.mode || process.env.EXECUTION_MODE || 'cli-full';
            if (process.env.NODE_ENV === 'production' && effectiveMode !== 'apsf-run') {
                socket.send(JSON.stringify({
                    type: 'error',
                    runId: request.runId,
                    timestamp: Date.now(),
                    data: {
                        error: `Execution mode '${effectiveMode}' is demo/test-only. Use mode 'apsf-run' in production.`,
                    },
                }));
                return;
            }
            // Execution Mode Router 経由（mode 未指定はデフォルトモード）
            const executor = this.modeRouter.getExecutor(request);
            this.activeExecutors.set(request.runId, executor);
            executor.on('event', (event) => {
                executionEvents.emit('event', event);
            });
            await executor.execute(request);
            this.activeExecutors.delete(request.runId);
            // イベントはリスナーから自動配信
        }
        catch (error) {
            socket.send(JSON.stringify({
                type: 'execution-error',
                runId: request.runId,
                error: error instanceof Error ? error.message : 'Unknown error',
            }));
        }
    }
    /**
     * キャンセルリクエストを処理
     *
     * apsf-run はキュー化されており execute() は enqueue で即 return する。
     * handler の activeExecutors には残らないため、常に bridge の共有キュー
     * （実行中の cancel + 待機列からの除去）にも委譲する
     */
    handleCancel(runId) {
        new APSFRunBridge().cancelExecution(runId);
        const executor = this.activeExecutors.get(runId);
        executor?.cancelExecution?.(runId);
        executor?.cancel?.();
        this.activeExecutors.delete(runId);
    }
    /**
     * 実行イベントをすべてのクライアントに配信
     */
    setupEventListeners() {
        // Executor / REST 経由のイベント（共有バス）
        executionEvents.on('event', (event) => this.broadcast(event));
    }
    /** すべてのアクティブ接続に配信 */
    broadcast(event) {
        const message = JSON.stringify(event);
        for (const socket of this.activeConnections.values()) {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(message);
            }
        }
    }
}
