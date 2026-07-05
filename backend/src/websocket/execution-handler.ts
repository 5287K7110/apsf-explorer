import WebSocket from 'ws';
import { APSFBridgeService } from '../services/apsf-bridge.service.js';
import { ExecutionModeRouter } from '../services/execution-mode-router.js';
import { executionEvents } from '../services/event-bus.js';
import { ExecuteRequest, StreamEvent } from '../types/index.js';
import { ExecutionMode } from '../types/execution-mode.js';

/**
 * WebSocket ハンドラー: リアルタイム実行進捗配信
 *
 * 実行経路:
 * - request.mode あり → ExecutionModeRouter が選択した Executor（CLI-FULL / CLI-LITE / API）
 * - request.mode なし → APSFBridgeService（APSF python framework 経由・レガシー経路）
 */
export class ExecutionHandler {
  private apsf: APSFBridgeService;
  private modeRouter: ExecutionModeRouter;
  private activeConnections: Map<string, WebSocket> = new Map();
  private connectionCounter = 0;

  constructor() {
    this.apsf = new APSFBridgeService();
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

      if (request.mode) {
        // 🔹 Execution Mode Router 経由（CLI-FULL / CLI-LITE / API）
        const executor = this.modeRouter.getExecutor(request);
        executor.on('event', (event: StreamEvent) => {
          executionEvents.emit('event', event);
        });
        await executor.execute(request);
      } else {
        // レガシー経路: APSF python framework
        await this.apsf.execute(request);
      }

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
    this.apsf.cancelExecution(runId);
  }

  /**
   * APSF イベントをすべてのクライアントに配信
   */
  private setupEventListeners(): void {
    // Bridge（レガシー経路）のイベント
    this.apsf.on('event', (event: StreamEvent) => this.broadcast(event));
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
