/**
 * Execution Mode Types
 *
 * - CLI_FULL: Claude/Codex CLI を実行、Artifact を保存
 * - CLI_LITE: CLI を実行するが Artifact は保存しない（軽量）
 * - API: 将来実装予定（API 呼び出し、インストール不要）
 */

export type ExecutionMode = 'cli-full' | 'cli-lite' | 'api';

export interface ExecutionModeConfig {
  mode: ExecutionMode;
  saveArtifacts: boolean;
  timeout: number; // ms
  maxTurns: number;
}

export const DEFAULT_MODES: Record<ExecutionMode, ExecutionModeConfig> = {
  'cli-full': {
    mode: 'cli-full',
    saveArtifacts: true, // ✅ Artifact 保存
    timeout: 600000, // 10分
    maxTurns: 10,
  },
  'cli-lite': {
    mode: 'cli-lite',
    saveArtifacts: false, // ❌ Artifact 保存しない
    timeout: 300000, // 5分
    maxTurns: 5,
  },
  'api': {
    mode: 'api',
    saveArtifacts: true,
    timeout: 300000,
    maxTurns: 10,
  },
};
