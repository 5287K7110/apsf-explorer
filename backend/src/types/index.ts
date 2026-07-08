// Provider Types
export type ProviderType = 'claude' | 'codex' | 'gemini';

export interface ProviderConfig {
  type: ProviderType;
  apiKey: string;
  model?: string;
}

// Execution Request/Response
export interface ExecuteRequest {
  runId: string;
  command: 'plan' | 'build' | 'review' | 'judge' | 'retry' | 'full-cycle';
  provider: ProviderType;
  roles: string[];
  goal?: string;
  context?: Record<string, unknown>;
  mode?: 'cli-full' | 'cli-lite' | 'api' | 'apsf-run'; // Execution mode
}

export interface ExecuteResponse {
  runId: string;
  command: string;
  phase: string;
  progress: number;
  provider: ProviderType;
  agentsUsed: string[];
  result?: Record<string, unknown>;
  error?: string;
}

export interface StreamEvent {
  type: 'start' | 'progress' | 'log' | 'error' | 'complete' | 'queued' | 'started' | 'queue';
  runId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

// User/Auth
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface JWTPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}
