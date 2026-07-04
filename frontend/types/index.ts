// APSF Domain Types
export type Phase = 'planning' | 'building' | 'reviewing' | 'judging' | 'complete';
export type RunStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
export type CommandType = 'plan' | 'build' | 'review' | 'judge' | 'retry' | 'full-cycle';
export type VerdictType = 'pass' | 'improve' | 'redesign' | 'blocker';

export interface AcceptanceCriteria {
  id: string;
  title: string;
  description: string;
  status: 'done' | 'in-progress' | 'todo' | 'blocked';
  priority: 'critical' | 'high' | 'medium' | 'low';
  completedAt?: number;
}

export interface Decision {
  id: string;
  timestamp: number;
  phase: Phase;
  verdict: VerdictType;
  reasoning: string;
  suggestedFixes: string[];
  accepted: boolean;
  criticalRisks?: string[];
}

export interface PhaseStep {
  phase: Phase;
  status: 'completed' | 'in-progress' | 'pending';
  startedAt: number;
  completedAt?: number;
  errorMessage?: string;
  logOutput: string;
}

export interface Run {
  id: string;
  status: RunStatus;
  currentPhase: Phase;
  progress: number; // 0-100
  acceptanceCriteria: AcceptanceCriteria[];
  acProgress: number; // 0-100
  decisions: Decision[];
  phases: PhaseStep[];
  currentCommand?: CommandType;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  elapsedTime: number; // milliseconds
  domain: string;
  description: string;
  retryCount: number;
  lastError?: {
    message: string;
    stack?: string;
    phase?: Phase;
  };
}

export interface RunState {
  runs: Run[];
  activeRunId: string | null;
  selectedRunId: string | null;
  filter: {
    status?: RunStatus;
    domain?: string;
    phase?: Phase;
  };
  realTimeUpdates: boolean;
  updateInterval: number; // milliseconds
}

export interface CommandResponse {
  success: boolean;
  runId: string;
  message: string;
  timestamp: number;
}

export interface APIError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

// UI State
export interface UIState {
  sidebarOpen: boolean;
  selectedRunId: string | null;
  expandedPhases: Set<string>;
  expandedLogs: boolean;
  theme: 'dark' | 'light';
  showSettings: boolean;
}

// Mock data types
export interface MockRunConfig {
  domain: string;
  description: string;
  acCount: number;
  phases: number;
  shouldFail?: boolean;
}
