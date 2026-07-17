import jwt from 'jsonwebtoken';
let warnedInsecureSecret = false;
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (secret)
        return secret;
    if (!warnedInsecureSecret) {
        console.warn('⚠️  JWT_SECRET is not set — using an INSECURE development fallback. Never run production like this.');
        warnedInsecureSecret = true;
    }
    return 'dev-insecure-secret';
}
export function verifyToken(token) {
    try {
        return jwt.verify(token, getJwtSecret());
    }
    catch {
        return null;
    }
}
export function authenticateToken(req, res, next) {
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
