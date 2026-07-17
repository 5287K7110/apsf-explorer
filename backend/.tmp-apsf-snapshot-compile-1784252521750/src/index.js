import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import http from 'http';
import dotenv from 'dotenv';
import runsRoute from './routes/runs.route.js';
import authRoute from './routes/auth.route.js';
import { ExecutionHandler } from './websocket/execution-handler.js';
import { recoverOrphanedRuns } from './services/apsf-native/recovery.js';
import { executionEvents } from './services/event-bus.js';
import { verifyToken } from './middleware/auth.middleware.js';
import { resolveAuthMode } from './services/auth-mode.js';
dotenv.config();
// 本番では JWT_SECRET を必須にする（デフォルト鍵での運用を防止）
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET must be set in production.');
    process.exit(1);
}
// 認証モードの可視化: demo は「任意の資格情報で JWT を発行する」モード。
// 不正値は黙って demo に降格させない（設定ミスによる無認証公開の防止）
{
    const resolution = resolveAuthMode();
    if (resolution.invalid) {
        if (process.env.NODE_ENV === 'production') {
            console.error(`❌ FATAL: Invalid AUTH_MODE '${resolution.raw}'. Use 'demo' or 'basic'. ` +
                'Refusing to start in production with a misconfigured auth mode.');
            process.exit(1);
        }
        console.error(`❌ Invalid AUTH_MODE '${resolution.raw}' (use 'demo' or 'basic') — continuing in demo mode for development.`);
    }
    if (resolution.mode === 'demo' && process.env.NODE_ENV === 'production') {
        console.warn('⚠️  AUTH_MODE=demo in production: /api/auth/login accepts ANY credentials. ' +
            'Set AUTH_MODE=basic with USERS_FILE for real authentication.');
    }
    if (resolution.mode === 'basic' && !process.env.USERS_FILE) {
        console.warn('⚠️  AUTH_MODE=basic but USERS_FILE is not set — all logins will fail.');
    }
    console.log(`🔐 Auth mode: ${resolution.mode}`);
}
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({
    server,
    perMessageDeflate: false,
    clientTracking: true
});
const executionHandler = new ExecutionHandler();
// Middleware
app.use(cors());
app.use(express.json());
// Routes
app.use('/api/auth', authRoute);
app.use('/api/runs', runsRoute);
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// ── 単一プロセス運用: ビルド済みフロントエンド (<repo>/dist) の配信 ──
// `npm run build:app`（repo ルート）で dist を作った後は、vite dev サーバー
// なしで backend 単体で完結する。dist がなければ何もしない（従来どおり）。
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use(express.static(distDir));
    // SPA fallback（/api・/ws・/health 以外は index.html を返す）
    app.get(/^\/(?!api\/|ws$|health$).*/, (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
    });
    console.log(`🖥️  Serving built frontend from ${distDir} — open http://localhost:${process.env.PORT || 3001}`);
}
// WebSocket
console.log('🔧 WebSocket Server initialized');
/** WS 用の close code（WebSocket 標準のアプリ定義域 4000-4999） */
const WS_CLOSE_UNAUTHORIZED = 4401;
wss.on('connection', (socket, req) => {
    // REST と同等の JWT 認証: ws://host/ws?token=<jwt>
    // （ブラウザ WebSocket はカスタムヘッダを付けられないためクエリ方式）
    try {
        const url = new URL(req.url || '/', 'ws://placeholder');
        const token = url.searchParams.get('token') || '';
        const decoded = token ? verifyToken(token) : null;
        if (!decoded) {
            console.log('🚫 WS connection rejected: missing/invalid token');
            socket.close(WS_CLOSE_UNAUTHORIZED, 'unauthorized');
            return;
        }
    }
    catch {
        socket.close(WS_CLOSE_UNAUTHORIZED, 'unauthorized');
        return;
    }
    console.log('✅ Client connected (authenticated)');
    executionHandler.handleConnection(socket);
});
wss.on('error', (error) => {
    console.log('❌ WebSocket error:', error);
});
// クラッシュ回復: 前回の実行が残した stale マーカーを走査し、
// orphaned run を failed 化する（「永遠に Executing」の防止）
if (process.env.APSF_ROOT) {
    try {
        const recovered = recoverOrphanedRuns(process.env.APSF_ROOT);
        for (const r of recovered) {
            console.log(`♻️  Recovered orphaned run: ${r.runId} (${r.phase}) → ${r.action}`);
            // 起動後に接続するクライアントは phase API で failed を見るが、
            // 既接続クライアント向けにも配信しておく（best-effort）
            executionEvents.emit('event', {
                type: 'error',
                runId: r.runId,
                timestamp: Date.now(),
                data: {
                    error: r.lastError ?? 'stale execution marker removed',
                    recovered: true,
                    action: r.action,
                },
            });
        }
        if (recovered.length === 0) {
            console.log('♻️  Crash recovery: no orphaned runs found');
        }
    }
    catch (e) {
        console.error('⚠️ Crash recovery failed (continuing startup):', e);
    }
}
// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`✅ APSF Explorer Backend listening on port ${PORT}`);
    console.log(`🔌 WebSocket ready at ws://localhost:${PORT}`);
    console.log(`💡 Provider: ${process.env.APSF_PROVIDER || 'claude'}`);
});
