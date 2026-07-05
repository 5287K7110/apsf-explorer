import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/auth.middleware.js';

/**
 * Auth routes (Demo Mode)
 *
 * LoginPage の「Use any email and password to test. Authentication is mocked.」
 * を実際に成立させる: 任意の資格情報を受け付け、本物の JWT
 * （auth.middleware と同じ秘密鍵で署名）を発行する。
 * これにより frontend は保護された /api/runs 系エンドポイントを実際に呼べる。
 *
 * NOTE: 本番でユーザー管理が必要になったらここを実装で置き換える。
 */
const router = Router();

function signToken(userId: string, email: string): string {
  const secret = process.env.JWT_SECRET || 'dev-insecure-secret';
  return jwt.sign({ userId, email }, secret, { expiresIn: '24h' });
}

function demoUser(email: string, name?: string) {
  return {
    id: `demo-${Buffer.from(email).toString('hex').slice(0, 12)}`,
    email,
    name: name || email.split('@')[0],
    createdAt: new Date().toISOString(),
  };
}

router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }
  const user = demoUser(email);
  const token = signToken(user.id, email);
  res.json({ token, refreshToken: token, user });
});

router.post('/register', (req: Request, res: Response) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }
  const user = demoUser(email, name);
  const token = signToken(user.id, email);
  res.json({ token, refreshToken: token, user });
});

router.post('/logout', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

router.get('/me', authenticateToken, (req: Request, res: Response) => {
  // デモモード: トークンの内容から復元
  const decoded = jwt.decode(
    (req.headers['authorization'] || '').split(' ')[1] || ''
  ) as { userId?: string; email?: string } | null;
  if (!decoded?.email) {
    res.status(401).json({ error: 'Invalid token payload' });
    return;
  }
  res.json(demoUser(decoded.email));
});

export default router;
