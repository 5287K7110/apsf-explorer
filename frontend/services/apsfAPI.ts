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

export interface ApsfPhaseResponse {
  runId: string;
  phase: string;
}

export interface ApsfExecuteResponse {
  runId: string;
  status: string;
  provider: string;
  mode: string;
  message: string;
}

export type ApsfCommand = 'plan' | 'build' | 'review' | 'full-cycle';

export const apsfAPI = {
  /** 実 APSF の run 一覧 */
  getRuns(): Promise<ApsfRunsResponse> {
    return apiClient.get<ApsfRunsResponse>('/runs/apsf');
  },

  /** 実 `apsf next --phase-only` によるフェーズ検出 */
  getPhase(runId: string): Promise<ApsfPhaseResponse> {
    return apiClient.get<ApsfPhaseResponse>(
      `/runs/apsf/${encodeURIComponent(runId)}/phase`
    );
  },

  /** 実 APSF ラッパー実行（mode: apsf-run） */
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
