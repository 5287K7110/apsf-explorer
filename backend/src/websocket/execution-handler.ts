import WebSocket from 'ws';
import { ExecutionModeRouter } from '../services/execution-mode-router.js';
import { executionEvents } from '../services/event-bus.js';
import { ExecuteRequest, StreamEvent } from '../types/index.js';
import { ExecutionMode } from '../types/execution-mode.js';

/**
 * WebSocket ハンドラー: リアルタイム実行進捗配信
 *
 * 実行経路: ExecutionModeRouter が mode に応じた Executor を選択
 * （cli-full / cli-lite / api / apsf-run。mode 未指定は EXECUTION_MODE のデフォルト）
 */
export class ExecutionHandler {
  private modeRouter: ExecutionModeRouter;
  private activeConnections: Map<string, WebSocket> = new Map();
  private activeExecutors: Map<string, { cancel?: () => void; cancelExecution?: (id: string) => void }> = new Map();
  private connectionCounter = 0;

  constructor() {
    this.modeRouter = new ExecutionModeRouter(
      (process.env.EXECUTION_MODE as ExecutionMode) || 'cli-full'
    );
    this.setupEventListeners();
  }

  /**
   * WebSocket 接続を処理
   */
  async handleConnection(socket: WebSocket): Promise<void> {
    // NOTE: Date.now() のみだと同一ミリ秒の接続で ID が衝突し、
    // 片方の接続がイベント配信から漏れる（統合テストで発見）
    const connectionId = `conn-${Date.now()}-${++this.connectionCounter}`;

    socket.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'execute') {
          await this.handleExecute(socket, data.payload);
        } else if (data.type === 'cancel') {
          this.handleCancel(data.runId);
        }
      } catch (error) {
        socket.send(
          JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        );
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
  private async handleExecute(
    socket: WebSocket,
    request: ExecuteRequest
  ): Promise<void> {
    try {
      // 実行開始イベント
      socket.send(
        JSON.stringify({
          type: 'execution-start',
          runId: request.runId,
          provider: request.provider,
          command: request.command,
        })
      );

      // Execution Mode Router 経由（mode 未指定はデフォルトモード）
      const executor = this.modeRouter.getExecutor(request);
      this.activeExecutors.set(request.runId, executor as any);
      executor.on('event', (event: StreamEvent) => {
        executionEvents.emit('event', event);
      });
      await executor.execute(request);
      this.activeExecutors.delete(request.runId);

      // イベントはリスナーから自動配信

    } catch (error) {
      socket.send(
        JSON.stringify({
          type: 'execution-error',
          runId: request.runId,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      );
    }
  }

  /**
   * キャンセルリクエストを処理
   */
  private handleCancel(runId: string): void {
    const executor = this.activeExecutors.get(runId);
    executor?.cancelExecution?.(runId);
    (executor as any)?.cancel?.();
    this.activeExecutors.delete(runId);
  }

  /**
   * 実行イベントをすべてのクライアントに配信
   */
  private setupEventListeners(): void {
    // Executor / REST 経由のイベント（共有バス）
    executionEvents.on('event', (event: StreamEvent) => this.broadcast(event));
  }

  /** すべてのアクティブ接続に配信 */
  private broadcast(event: StreamEvent): void {
    const message = JSON.stringify(event);
    for (const socket of this.activeConnections.values()) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    }
  }
}
