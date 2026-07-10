import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';

let warnedInsecureSecret = false;

/**
 * JWT 秘密鍵を取得。
 * - 本番 (NODE_ENV=production) では JWT_SECRET 必須（未設定なら起動時に index.ts が停止）
 * - 開発では警告付きでフォールバックを許容
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (!warnedInsecureSecret) {
    console.warn(
      '⚠️  JWT_SECRET is not set — using an INSECURE development fallback. Never run production like this.'
    );
    warnedInsecureSecret = true;
  }
  return 'dev-insecure-secret';
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: { id: string; email: string; role: string };
    }
  }
}

/**
 * トークン検証（REST middleware と WS ハンドシェイクで共有）。
 * 有効なら payload を、無効/期限切れなら null を返す。
 */
export function verifyToken(token: string): { userId?: string } | null {
  try {
    return jwt.verify(token, getJwtSecret()) as { userId?: string };
  } catch {
    return null;
  }
}

export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(403).json({ error: 'Invalid token' });
    return;
  }
  req.userId = decoded.userId;
  next();
}
