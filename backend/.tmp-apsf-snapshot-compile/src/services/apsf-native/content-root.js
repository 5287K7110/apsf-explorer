/**
 * コンテンツ解決 — specialist 定義・run テンプレートの場所を決める
 *
 * 優先順位:
 *   1. workspace（APSF_ROOT）内の framework/agents/・runs/_template/（あれば）
 *      → 既存の APSF framework checkout と併用する場合、その内容を尊重
 *   2. Explorer 同梱コンテンツ（backend/content/）
 *      → 完全スタンドアロン。workspace は runs/ だけの空ディレクトリで良い
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Explorer 同梱コンテンツのルート（backend/content/） */
export const VENDORED_CONTENT_DIR = path.resolve(__dirname, '../../../content');
/** specialist 定義（framework/agents/...）のルートを解決 */
export function resolveFrameworkRoot(workspaceRoot) {
    if (workspaceRoot &&
        fs.existsSync(path.join(workspaceRoot, 'framework', 'agents'))) {
        return workspaceRoot;
    }
    return VENDORED_CONTENT_DIR;
}
/** heavy run 用テンプレートディレクトリを解決 */
export function resolveRunTemplateDir(workspaceRoot) {
    const workspaceTemplate = path.join(workspaceRoot, 'runs', '_template');
    if (fs.existsSync(workspaceTemplate)) {
        return workspaceTemplate;
    }
    return path.join(VENDORED_CONTENT_DIR, 'runs-template');
}
