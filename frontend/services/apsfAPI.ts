import { apiClient } from '../utils/apiClient';

/**
 * 実 APSF Framework API
 * backend の APSFRunBridge（apsf-run mode）と通信する
 */

export interface ApsfRunsResponse {
  available: boolean;
  apsfRoot: string | null;
  runs: string[];
}

export interface ApsfExecuteResponse {
  runId: string;
  status: string;
  provider: string;
  mode: string;
  message: string;
}

export type ApsfCommand = 'plan' | 'build' | 'review' | 'full-cycle';

export interface ApsfPhaseInfo {
  runId: string;
  phase: string;
  fileToWrite?: string;
  nextRole?: string;
  humanOwned?: boolean;
  executing?: boolean;
  /** run_state.json の実行ステータス（クラッシュ回復で failed になる） */
  phaseStatus?: string;
  lastError?: string;
  /** run に存在する既知の phase ファイル（成果物ビューア用） */
  existingFiles?: string[];
}

export interface ApsfAdvisory {
  recommendation?: string;
  human_owned_blocker?: boolean;
  advisory_source?: string;
  phase?: string;
  ownership_status?: string;
  [key: string]: unknown;
}

export interface ApsfExecutionMeta {
  file: string;
  startedAt: string;
  sizeBytes: number;
}

export interface ApsfTranscriptEvent {
  ts: number;
  type: string;
  data?: Record<string, unknown>;
}

export type ApsfJudgeDecision = 'Accept' | 'Return to Build' | 'Return to Plan';

export interface ApsfJudgeResult {
  runId: string;
  decision: ApsfJudgeDecision;
  phaseBefore: string;
  phaseAfter: string;
  reasonFile: string | null;
  advisoryRecommendation: string | null;
  matchesAdvisory: boolean | null;
  supersededFiles: string[];
}

export const apsfAPI = {
  /** 実 APSF の run 一覧 */
  getRuns(): Promise<ApsfRunsResponse> {
    return apiClient.get<ApsfRunsResponse>('/runs/apsf');
  },

  /** 実 `apsf next --phase-only` によるフェーズ検出（fileToWrite / nextRole 含む） */
  getPhase(runId: string): Promise<ApsfPhaseInfo> {
    return apiClient.get<ApsfPhaseInfo>(
      `/runs/apsf/${encodeURIComponent(runId)}/phase`
    );
  },

  /** 新しい run を作成（apsf start-run 経由） */
  createRun(runName: string, options: { light?: boolean; taxonomy?: string } = {}) {
    return apiClient.post<{ runName: string; phase: string; fileToWrite: string }>(
      '/runs/apsf',
      { runName, ...options }
    );
  },

  /** phase ファイルの内容を取得 */
  getFile(runId: string, filename: string) {
    return apiClient.get<{ runId: string; filename: string; content: string }>(
      `/runs/apsf/${encodeURIComponent(runId)}/files/${encodeURIComponent(filename)}`
    );
  },

  /** 現在フェーズの対象ファイルに保存（human フェーズの記入） */
  writePhase(runId: string, content: string) {
    return apiClient.post<{ runId: string; fileWritten: string; phase: string }>(
      `/runs/apsf/${encodeURIComponent(runId)}/write-phase`,
      { content }
    );
  },

  /** Judge 裁定（Accept / Return to Build / Return to Plan） */
  judgeDecision(runId: string, decision: ApsfJudgeDecision, reason?: string) {
    return apiClient.post<ApsfJudgeResult>(
      `/runs/apsf/${encodeURIComponent(runId)}/judge`,
      { decision, reason }
    );
  },

  /** 過去の実行トランスクリプト一覧 */
  getExecutions(runId: string) {
    return apiClient.get<{ runId: string; executions: ApsfExecutionMeta[] }>(
      `/runs/apsf/${encodeURIComponent(runId)}/executions`
    );
  },

  /** 実行トランスクリプトの中身 */
  getExecutionTranscript(runId: string, file: string) {
    return apiClient.get<{ runId: string; file: string; events: ApsfTranscriptEvent[] }>(
      `/runs/apsf/${encodeURIComponent(runId)}/executions/${encodeURIComponent(file)}`
    );
  },

  /** judge_advisory.json の取得 */
  getAdvisory(runId: string) {
    return apiClient.get<{ runId: string; advisory: ApsfAdvisory | null }>(
      `/runs/apsf/${encodeURIComponent(runId)}/advisory`
    );
  },

  /** 実 APSF 実行（mode: apsf-run） */
  execute(
    runId: string,
    command: ApsfCommand,
    provider: 'claude' | 'codex',
    dryRun = false
  ): Promise<ApsfExecuteResponse> {
    return apiClient.post<ApsfExecuteResponse>(
      `/runs/${encodeURIComponent(runId)}/execute`,
      {
        command,
        provider,
        roles: [],
        mode: 'apsf-run',
        context: dryRun ? { dryRun: true } : undefined,
      }
    );
  },
};
