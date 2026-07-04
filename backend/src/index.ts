import express from 'express';
import cors from 'cors';
import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import dotenv from 'dotenv';
import runsRoute from './routes/runs.route.js';
import { ExecutionHandler } from './websocket/execution-handler.js';

dotenv.config();

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
app.use('/api/runs', runsRoute);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket
console.log('🔧 WebSocket Server initialized');

wss.on('connection', (socket) => {
  console.log('✅ Client connected');
  executionHandler.handleConnection(socket);
});

wss.on('error', (error) => {
  console.log('❌ WebSocket error:', error);
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ APSF Explorer Backend listening on port ${PORT}`);
  console.log(`🔌 WebSocket ready at ws://localhost:${PORT}`);
  console.log(`💡 Provider: ${process.env.APSF_PROVIDER || 'claude'}`);
});
