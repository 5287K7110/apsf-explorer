import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { verifyUser } from '../services/users-store.js';
import { getAuthMode } from '../services/auth-mode.js';
/**
 * Auth routes — AUTH_MODE で demo / basic を明示的に切り替える
 *
 * - demo（既定）: 任意の資格情報で本物の JWT を発行（ローカルデモ用）。
 *   「認証があるように見えて何も守っていない」ことを設定として可視化する
 *   ため、GET /auth/mode でモードを公開し UI の Demo 表記を連動させる。
 *   本番 + demo は起動時に警告ログを出す（index.ts）。
 * - basic: USERS_FILE（email → bcrypt hash）の照合。誤資格情報は 401
 *   （ユーザー不在との区別を漏らさない同一メッセージ）。register は 403
 *   （ユーザー管理は管理者のファイル運用）。
 */
const router = Router();
function signToken(userId, email) {
    const secret = process.env.JWT_SECRET || 'dev-insecure-secret';
    return jwt.sign({ userId, email }, secret, { expiresIn: '24h' });
}
function demoUser(email, name) {
    return {
        id: `demo-${Buffer.from(email).toString('hex').slice(0, 12)}`,
        email,
        name: name || email.split('@')[0],
        createdAt: new Date().toISOString(),
    };
}
/** 認証モードの公開（UI の Demo 表記の表示制御用） */
router.get('/mode', (_req, res) => {
    res.json({ mode: getAuthMode() });
});
router.post('/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
        res.status(400).json({ error: 'email and password are required' });
        return;
    }
    if (getAuthMode() === 'basic') {
        if (!verifyUser(email, password)) {
            // ユーザー不在 / パスワード不一致を区別しない同一メッセージ
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }
    }
    // demo モードは任意の資格情報を受け付ける（現挙動を維持）
    const user = demoUser(email);
    const token = signToken(user.id, email);
    res.json({ token, refreshToken: token, user });
});
router.post('/register', (req, res) => {
    if (getAuthMode() === 'basic') {
        // basic のユーザー管理は管理者の USERS_FILE 運用（self-register 不可）
        res.status(403).json({ error: 'Registration is disabled. Users are managed by the administrator.' });
        return;
    }
    const { email, password, name } = req.body || {};
    if (!email || !password) {
        res.status(400).json({ error: 'email and password are required' });
        return;
    }
    const user = demoUser(email, name);
    const token = signToken(user.id, email);
    res.json({ token, refreshToken: token, user });
});
router.post('/logout', (_req, res) => {
    res.json({ ok: true });
});
router.get('/me', authenticateToken, (req, res) => {
    // デモモード: トークンの内容から復元
    const decoded = jwt.decode((req.headers['authorization'] || '').split(' ')[1] || '');
    if (!decoded?.email) {
        res.status(401).json({ error: 'Invalid token payload' });
        return;
    }
    res.json(demoUser(decoded.email));
});
export default router;
