/**
 * workdir の git 連携ヘルパー
 *
 * Build 前の dirty 警告と Build 後の diff 表示（人間ゲートの判断材料）に使う。
 * git が無い / git repo でない workdir では静かに無効化される（エラーにしない）。
 */
import { execFile } from 'child_process';
const MAX_DIFF_BYTES = 400000;
function git(args, cwd, timeoutMs = 15000) {
    return new Promise((resolve) => {
        execFile('git', args, { cwd, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
            // git の詳細 exit code は不要（0 / 非0 の判定のみ使う）
            resolve({ code: error ? 1 : 0, stdout: stdout ?? '', stderr: stderr ?? '' });
        });
    });
}
export async function workdirGitStatus(workdir) {
    const check = await git(['rev-parse', '--is-inside-work-tree'], workdir);
    if (check.code !== 0 || !check.stdout.trim().startsWith('true')) {
        return { isRepo: false };
    }
    const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], workdir)).stdout.trim();
    const status = await git(['status', '--porcelain'], workdir);
    const dirtyFiles = status.stdout
        .split('\n')
        .map((l) => l.trimEnd())
        .filter(Boolean)
        .map((l) => l.slice(3));
    return { isRepo: true, branch, dirtyFiles };
}
export async function workdirGitDiff(workdir) {
    const status = await workdirGitStatus(workdir);
    if (!status.isRepo) {
        return { isRepo: false, stat: '', diff: '', truncated: false, untracked: [] };
    }
    const stat = (await git(['diff', 'HEAD', '--stat'], workdir)).stdout.trimEnd();
    const diffRes = await git(['diff', 'HEAD'], workdir);
    let diff = diffRes.stdout;
    let truncated = false;
    if (Buffer.byteLength(diff, 'utf-8') > MAX_DIFF_BYTES) {
        diff = diff.slice(0, MAX_DIFF_BYTES) + '\n... (truncated)\n';
        truncated = true;
    }
    const porcelain = (await git(['status', '--porcelain'], workdir)).stdout;
    const untracked = porcelain
        .split('\n')
        .filter((l) => l.startsWith('??'))
        .map((l) => l.slice(3).trim())
        .filter(Boolean);
    return { isRepo: true, branch: status.branch, stat, diff, truncated, untracked };
}
/** dirty 状態の一行サマリ（progress ログ用） */
export function dirtySummary(status) {
    if (!status.isRepo || !status.dirtyFiles || status.dirtyFiles.length === 0)
        return null;
    const head = status.dirtyFiles.slice(0, 5).join(', ');
    const more = status.dirtyFiles.length > 5 ? ` ほか ${status.dirtyFiles.length - 5} 件` : '';
    return `${status.dirtyFiles.length} file(s) dirty: ${head}${more}`;
}
