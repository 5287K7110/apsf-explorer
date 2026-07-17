/**
 * Execution Mode Types
 *
 * - CLI_FULL: Claude/Codex CLI を実行、Artifact を保存
 * - CLI_LITE: CLI を実行するが Artifact は保存しない（軽量）
 * - API: 将来実装予定（API 呼び出し、インストール不要）
 */
export const DEFAULT_MODES = {
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
    // 実 APSF Framework（run ディレクトリ + フェーズ検出 + ラッパー実行）
    'apsf-run': {
        mode: 'apsf-run',
        saveArtifacts: true, // artifact は APSF 自身が runs/<run>/ に保存する
        timeout: 1800000, // 30分（auto-loop 対応）
        maxTurns: 10,
    },
};
