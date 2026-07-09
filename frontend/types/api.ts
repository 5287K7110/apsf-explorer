// API Request/Response types
export interface APIRequest {
  method: string;
  endpoint: string;
  data?: unknown;
}

export interface APIResponse<T = any> {
  success: boolean;
  data: T;
  error?: string;
  timestamp: number;
}

// WebSocket message types
export interface WSMessage {
  type: string;
  data: unknown;
  timestamp: number;
}

export interface WSRunUpdate extends WSMessage {
  type: 'run:update';
  data: {
    runId: string;
    progress: number;
    status: string;
    phase: string;
  };
}

export interface WSRunComplete extends WSMessage {
  type: 'run:complete';
  data: {
    runId: string;
    success: boolean;
    error?: string;
  };
}

export type WSEvent = WSRunUpdate | WSRunComplete | WSMessage;
