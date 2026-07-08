// WebSocket client with auto-reconnect
import { useAuthStore } from '../store/authStore';

/** backend の未認証 close code（index.ts と対応） */
export const WS_CLOSE_UNAUTHORIZED = 4401;

/**
 * authToken の堅牢な読み出し。
 * 歴史的に raw（apiClient.setToken）と JSON ラップ（authStorage.saveToken）の
 * 両方式が混在しているため、どちらでも取り出せるようにする。
 */
function getAuthToken(): string | null {
  try {
    const raw = localStorage.getItem('authToken');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'string' ? parsed : raw;
    } catch {
      return raw; // raw JWT（JSON ではない）
    }
  } catch {
    return null; // localStorage 不可の環境
  }
}

export class WSClient {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners: Map<string, Function[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private intentionalClose = false;

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 4401 が onopen 前に来た場合でも promise が必ず決着するようにする
      let settled = false;
      const settleResolve = () => { if (!settled) { settled = true; resolve(); } };
      const settleReject = (e: unknown) => { if (!settled) { settled = true; reject(e); } };
      try {
        this.intentionalClose = false;
        // 接続時点のトークンを付与（REST と同じ localStorage を参照）。
        // ヘッダはブラウザ WebSocket で付与できないためクエリ方式
        const token = getAuthToken();
        const url = token
          ? `${this.url}${this.url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
          : this.url;
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          settleResolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const listeners = this.listeners.get(data.type) || [];
            listeners.forEach(listener => listener(data));
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          settleReject(error);
        };

        this.ws.onclose = (event) => {
          // 未認証（トークンなし/無効/期限切れ）: 再接続せず明示的にログアウト。
          // 無言で切れると期限切れが分からないため、UI をログイン画面へ誘導する
          if (event.code === WS_CLOSE_UNAUTHORIZED) {
            console.error('WebSocket closed: unauthorized (token missing/expired). Logging out.');
            this.intentionalClose = true;
            useAuthStore.getState().logout();
            settleReject(new Error('WebSocket unauthorized (4401)'));
            return;
          }
          console.log('WebSocket disconnected');
          // 意図的な切断（unmount 等）では再接続もエラーログも行わない
          if (!this.intentionalClose) {
            this.attemptReconnect();
          }
        };
      } catch (error) {
        settleReject(error);
      }
    });
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.pow(2, this.reconnectAttempts - 1) * this.reconnectDelay;
      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      setTimeout(() => this.connect().catch(err => {
        console.error('Reconnection failed:', err);
      }), delay);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  on(type: string, listener: Function) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  off(type: string, listener: Function) {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket is not connected');
    }
  }

  disconnect() {
    // NOTE: maxReconnectAttempts を 0 にすると再接続が恒久的に無効化され、
    // かつ onclose 経由で 'Max reconnection attempts reached' が誤出力されていた（E2E で発見）
    this.intentionalClose = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

const getWsUrl = (): string => {
  // Check for Vite environment variable
  try {
    const viteEnv = import.meta.env.VITE_WS_URL;
    if (viteEnv) {
      return viteEnv;
    }
  } catch {
    // import.meta not available
  }
  // Default: 同一オリジンの /ws（vite.config.ts の proxy が backend:3001 へ中継）
  // NOTE: 旧デフォルト 'ws://localhost:3000/ws' はどこにも一致せず接続不能だった（E2E で発見）
  if (typeof location !== 'undefined') {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws`;
  }
  return 'ws://localhost:3001/ws';
};

export const wsClient = new WSClient(getWsUrl());
