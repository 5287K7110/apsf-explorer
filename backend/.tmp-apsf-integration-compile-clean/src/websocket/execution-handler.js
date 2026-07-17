import WebSocket from 'ws';
import { ExecutionModeRouter } from '../services/execution-mode-router.js';
import { APSFRunBridge } from '../services/apsf-run-bridge.service.js';
import { executionEvents } from '../services/event-bus.js';
export class ExecutionHandler {
    constructor() {
        this.activeConnections = new Map();
        this.activeExecutors = new Map();
        this.connectionCounter = 0;
        this.modeRouter = new ExecutionModeRouter(process.env.EXECUTION_MODE || 'cli-full');
        this.setupEventListeners();
    }
    async handleConnection(socket) {
        const connectionId = `conn-${Date.now()}-${++this.connectionCounter}`;
        socket.on('message', async (message) => {
            try {
                const data = JSON.parse(message.toString());
                if (data.type === 'execute') {
                    await this.handleExecute(socket, data.payload);
                }
                else if (data.type === 'cancel') {
                    this.handleCancel(data.runId);
                }
            }
            catch (error) {
                socket.send(JSON.stringify({
                    type: 'error',
                    error: error instanceof Error ? error.message : 'Unknown error',
                }));
            }
        });
        socket.on('close', () => {
            this.activeConnections.delete(connectionId);
        });
        this.activeConnections.set(connectionId, socket);
    }
    async handleExecute(socket, request) {
        try {
            socket.send(JSON.stringify({
                type: 'execution-start',
                runId: request.runId,
                provider: request.provider,
                command: request.command,
            }));
            const effectiveMode = request.mode || process.env.EXECUTION_MODE || 'cli-full';
            if (process.env.NODE_ENV === 'production' && effectiveMode !== 'apsf-run') {
                socket.send(JSON.stringify({
                    type: 'error',
                    runId: request.runId,
                    timestamp: Date.now(),
                    data: {
                        error: `Execution mode '${effectiveMode}' is demo/test-only. Use mode 'apsf-run' in production.`,
                    },
                }));
                return;
            }
            const executor = this.modeRouter.getExecutor(request);
            this.activeExecutors.set(request.runId, executor);
            executor.on('event', (event) => {
                executionEvents.emit('event', event);
            });
            await executor.execute(request);
            this.activeExecutors.delete(request.runId);
        }
        catch (error) {
            socket.send(JSON.stringify({
                type: 'execution-error',
                runId: request.runId,
                error: error instanceof Error ? error.message : 'Unknown error',
            }));
        }
    }
    handleCancel(runId) {
        new APSFRunBridge().cancelExecution(runId);
        const executor = this.activeExecutors.get(runId);
        executor?.cancelExecution?.(runId);
        executor?.cancel?.();
        this.activeExecutors.delete(runId);
    }
    setupEventListeners() {
        executionEvents.on('event', (event) => this.broadcast(event));
    }
    broadcast(event) {
        const message = JSON.stringify(event);
        for (const socket of this.activeConnections.values()) {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(message);
            }
        }
    }
}
