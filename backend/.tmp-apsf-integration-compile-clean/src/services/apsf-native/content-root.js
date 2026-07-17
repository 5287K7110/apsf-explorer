import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const VENDORED_CONTENT_DIR = path.resolve(__dirname, '../../../content');
export function resolveFrameworkRoot(workspaceRoot) {
    if (workspaceRoot &&
        fs.existsSync(path.join(workspaceRoot, 'framework', 'agents'))) {
        return workspaceRoot;
    }
    return VENDORED_CONTENT_DIR;
}
export function resolveRunTemplateDir(workspaceRoot) {
    const workspaceTemplate = path.join(workspaceRoot, 'runs', '_template');
    if (fs.existsSync(workspaceTemplate)) {
        return workspaceTemplate;
    }
    return path.join(VENDORED_CONTENT_DIR, 'runs-template');
}
