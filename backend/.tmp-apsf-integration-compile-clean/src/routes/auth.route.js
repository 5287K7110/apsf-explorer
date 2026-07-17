import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { verifyUser } from '../services/users-store.js';
import { getAuthMode } from '../services/auth-mode.js';
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
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }
    }
    const user = demoUser(email);
    const token = signToken(user.id, email);
    res.json({ token, refreshToken: token, user });
});
router.post('/register', (req, res) => {
    if (getAuthMode() === 'basic') {
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
    const decoded = jwt.decode((req.headers['authorization'] || '').split(' ')[1] || '');
    if (!decoded?.email) {
        res.status(401).json({ error: 'Invalid token payload' });
        return;
    }
    res.json(demoUser(decoded.email));
});
export default router;
