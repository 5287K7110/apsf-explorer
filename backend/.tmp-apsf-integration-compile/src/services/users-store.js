/**
 * ユーザーストア（AUTH_MODE=basic 用）
 *
 * USERS_FILE（JSON: { "email": "<bcrypt hash>", ... }）を読み、
 * email + password を bcrypt で照合する。DB は導入しない（v1 設計判断）。
 *
 * セキュリティ方針:
 * - 平文パスワードの保存経路は存在しない（ファイルは管理者が
 *   `npx tsx scripts/hash-password.ts` 等で生成した bcrypt ハッシュのみ）
 * - 照合失敗の理由（ユーザー不在 / パスワード不一致）は呼び出し側に区別させない
 */
import * as fs from 'fs';
import bcrypt from 'bcryptjs';
/** USERS_FILE を読む（毎回読み直し — 管理者のファイル更新を再起動なしで反映） */
function loadUsers() {
    const usersFile = process.env.USERS_FILE;
    if (!usersFile || !fs.existsSync(usersFile))
        return null;
    try {
        const data = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
        if (typeof data !== 'object' || data === null || Array.isArray(data))
            return null;
        return data;
    }
    catch {
        return null;
    }
}
/** USERS_FILE が利用可能か（basic モードの起動前チェック用） */
export function usersFileAvailable() {
    return loadUsers() !== null;
}
/**
 * email + password を照合する。
 * ユーザー不在とパスワード不一致は区別せず false を返す
 * （タイミング差の緩和のため、不在時もダミーハッシュと比較する）。
 */
export function verifyUser(email, password) {
    const users = loadUsers();
    if (!users)
        return false;
    const hash = users[email];
    if (!hash) {
        // ユーザー不在でも比較コストを揃える（応答時間からの存在推測を緩和）
        bcrypt.compareSync(password, '$2b$10$C6UzMDM.H6dfI/f/IKcEeO7ZUr5xkcSSD1G0nDkfLTVVLZeFJ8LG2');
        return false;
    }
    try {
        return bcrypt.compareSync(password, hash);
    }
    catch {
        return false; // 壊れたハッシュは照合失敗として扱う
    }
}
