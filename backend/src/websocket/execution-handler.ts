import WebSocket from 'ws';
import { APSFBridgeService } from '../services/apsf-bridge.service.js';
import { ExecuteRequest, StreamEvent } from '../types/index.js';

/**
 * WebSocket ハンドラー: リアルタイム実行進捗配信
 */
export class ExecutionHandler {
  private apsf: APSFBridgeService;
  private activeConnections: Map<string, WebSocket> = new Map();
  private connectionCounter = 0;

  constructor() {
    this.apsf = new APSFBridgeService();
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

      // APSF 実行
      await this.apsf.execute(request);

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
    this.apsf.on('event', (event: StreamEvent) => {
      const message = JSON.stringify(event);

      // すべてのアクティブ接続に配信
      for (const socket of this.activeConnections.values()) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(message);
        }
      }
    });
  }
}
