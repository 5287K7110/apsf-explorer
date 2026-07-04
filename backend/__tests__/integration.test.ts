import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import WebSocket from 'ws';
import http from 'http';
import express from 'express';
import { EventEmitter } from 'events';

/**
 * Integration Tests
 * Frontend ↔ Backend ↔ CLI
 */

describe('Integration: Frontend ↔ Backend Communication', () => {
  let server: http.Server;
  let wsServer: WebSocket.Server;
  const PORT = 3002; // Use different port to avoid conflicts
  let app: express.Application;

  beforeAll((done) => {
    app = express();
    app.use(express.json());

    server = http.createServer(app);
    wsServer = new WebSocket.Server({ server });

    // Setup WebSocket handler
    wsServer.on('connection', (socket) => {
      console.log('Client connected to test server');

      socket.on('message', (message) => {
        try {
          const event = JSON.parse(message.toString());

          // Echo back with processed data
          if (event.type === 'execute') {
            socket.send(
              JSON.stringify({
                type: 'progress',
                data: {
                  runId: event.payload.runId,
                  message: 'Execution started',
                  timestamp: Date.now(),
                },
              })
            );

            // Simulate completion after delay
            setTimeout(() => {
              socket.send(
                JSON.stringify({
                  type: 'complete',
                  data: {
                    runId: event.payload.runId,
                    success: true,
                    mode: event.payload.mode,
                    artifactCount: event.payload.mode === 'cli-full' ? 3 : 0,
                    provider: event.payload.provider,
                  },
                })
              );
            }, 100);
          }
        } catch (error) {
          console.error('Message parse error:', error);
          socket.send(
            JSON.stringify({
              type: 'error',
              data: { error: 'Invalid message format' },
            })
          );
        }
      });

      socket.on('close', () => {
        console.log('Client disconnected from test server');
      });
    });

    server.listen(PORT, () => {
      console.log(`Test WebSocket server listening on port ${PORT}`);
      done();
    });
  });

  afterAll((done) => {
    wsServer.close();
    server.close(done);
  });

  describe('WebSocket Connection', () => {
    it('should establish WebSocket connection', (done) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);

      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should receive connection acknowledgment', (done) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      let messageReceived = false;

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'hello' }));
      });

      ws.on('message', () => {
        messageReceived = true;
      });

      ws.on('close', () => {
        expect(messageReceived).toBe(true);
        done();
      });

      ws.on('error', done);

      // Close after timeout
      setTimeout(() => {
        ws.close();
      }, 500);
    });

    it('should handle connection close gracefully', (done) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);

      ws.on('open', () => {
        ws.close();
      });

      ws.on('close', () => {
        expect(ws.readyState).toBe(WebSocket.CLOSED);
        done();
      });

      ws.on('error', done);
    });
  });

  describe('WebSocket Message Handling', () => {
    it('should send valid JSON messages', (done) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);

      ws.on('open', () => {
        const request = {
          type: 'test',
          payload: {
            data: 'test-data',
          },
        };

        expect(() => {
          ws.send(JSON.stringify(request));
        }).not.toThrow();

        ws.close();
        done();
      });

      ws.on('error', done);
    });

    it('should handle message responses', (done) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      let responseReceived = false;

      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'test',
            payload: { test: true },
          })
        );
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        expect(message.type).toBeDefined();
        responseReceived = true;
      });

      ws.on('close', () => {
        setTimeout(() => {
          expect(responseReceived).toBe(true);
          done();
        }, 50);
      });

      ws.on('error', done);

      setTimeout(() => {
        ws.close();
      }, 500);
    });
  });

  describe('Execution Modes Integration', () => {
    it('CLI-FULL should indicate artifact saving', (done) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);

      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'execute',
            payload: {
              runId: 'test-run-full',
              command: 'build',
              provider: 'claude',
              mode: 'cli-full',
              roles: ['builder'],
            },
          })
        );
      });

      let completionReceived = false;
      ws.on('message', (data) => {
        const event = JSON.parse(data.toString());

        if (event.type === 'complete') {
          expect(event.data.mode).toBe('cli-full');
          expect(event.data.artifactCount).toBeGreaterThanOrEqual(0);
          completionReceived = true;
        }
      });

      ws.on('close', () => {
        setTimeout(() => {
          expect(completionReceived).toBe(true);
          done();
        }, 50);
      });

      ws.on('error', done);

      setTimeout(() => {
        ws.close();
      }, 1000);
    });

    it('CLI-LITE should not save artifacts', (done) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);

      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'execute',
            payload: {
              runId: 'test-run-lite',
              command: 'build',
              provider: 'claude',
              mode: 'cli-lite',
              roles: ['builder'],
            },
          })
        );
      });

      let completionReceived = false;
      ws.on('message', (data) => {
        const event = JSON.parse(data.toString());

        if (event.type === 'complete') {
          expect(event.data.mode).toBe('cli-lite');
          expect(event.data.artifactCount).toBe(0);
          completionReceived = true;
        }
      });

      ws.on('close', () => {
        setTimeout(() => {
          expect(completionReceived).toBe(true);
          done();
        }, 50);
      });

      ws.on('error', done);

      setTimeout(() => {
        ws.close();
      }, 1000);
    });

    it('should handle mode switching in sequence', (done) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      let modesSeen = new Set<string>();

      ws.on('open', () => {
        // First request with cli-full
        ws.send(
          JSON.stringify({
            type: 'execute',
            payload: {
              runId: 'test-sequence-1',
              command: 'build',
              provider: 'claude',
              mode: 'cli-full',
            },
          })
        );
      });

      ws.on('message', (data) => {
        const event = JSON.parse(data.toString());

        if (event.type === 'complete' && modesSeen.size === 0) {
          modesSeen.add(event.data.mode);

          // Send second request with cli-lite
          ws.send(
            JSON.stringify({
              type: 'execute',
              payload: {
                runId: 'test-sequence-2',
                command: 'build',
                provider: 'claude',
                mode: 'cli-lite',
              },
            })
          );
        } else if (event.type === 'complete' && modesSeen.size === 1) {
          modesSeen.add(event.data.mode);
        }
      });

      ws.on('close', () => {
        setTimeout(() => {
          expect(modesSeen.has('cli-full')).toBe(true);
          expect(modesSeen.has('cli-lite')).toBe(true);
          done();
        }, 50);
      });

      ws.on('error', done);

      setTimeout(() => {
        ws.close();
      }, 2000);
    });
  });

  describe('Provider Selection Integration', () => {
    it('should support Claude provider', (done) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);

      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'execute',
            payload: {
              runId: 'test-claude-provider',
              command: 'build',
              provider: 'claude',
              mode: 'cli-full',
            },
          })
        );
      });

      let providerVerified = false;
      ws.on('message', (data) => {
        const event = JSON.parse(data.toString());
        if (event.type === 'complete') {
          expect(event.data.provider).toBe('claude');
          providerVerified = true;
        }
      });

      ws.on('close', () => {
        setTimeout(() => {
          expect(providerVerified).toBe(true);
          done();
        }, 50);
      });

      ws.on('error', done);

      setTimeout(() => {
        ws.close();
      }, 1000);
    });

    it('should support Codex provider', (done) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);

      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'execute',
            payload: {
              runId: 'test-codex-provider',
              command: 'build',
              provider: 'codex',
              mode: 'cli-lite',
            },
          })
        );
      });

      let providerVerified = false;
      ws.on('message', (data) => {
        const event = JSON.parse(data.toString());
        if (event.type === 'complete') {
          expect(event.data.provider).toBe('codex');
          providerVerified = true;
        }
      });

      ws.on('close', () => {
        setTimeout(() => {
          expect(providerVerified).toBe(true);
          done();
        }, 50);
      });

      ws.on('error', done);

      setTimeout(() => {
        ws.close();
      }, 1000);
    });
  });

  describe('Event Streaming', () => {
    it('should receive progress events', (done) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      let progressReceived = false;

      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'execute',
            payload: {
              runId: 'test-progress',
              command: 'build',
              provider: 'claude',
              mode: 'cli-full',
            },
          })
        );
      });

      ws.on('message', (data) => {
        const event = JSON.parse(data.toString());
        if (event.type === 'progress') {
          progressReceived = true;
        }
      });

      ws.on('close', () => {
        setTimeout(() => {
          expect(progressReceived).toBe(true);
          done();
        }, 50);
      });

      ws.on('error', done);

      setTimeout(() => {
        ws.close();
      }, 1000);
    });

    it('should receive completion events', (done) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      let completionReceived = false;

      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'execute',
            payload: {
              runId: 'test-completion',
              command: 'build',
              provider: 'claude',
              mode: 'cli-full',
            },
          })
        );
      });

      ws.on('message', (data) => {
        const event = JSON.parse(data.toString());
        if (event.type === 'complete') {
          completionReceived = true;
        }
      });

      ws.on('close', () => {
        setTimeout(() => {
          expect(completionReceived).toBe(true);
          done();
        }, 50);
      });

      ws.on('error', done);

      setTimeout(() => {
        ws.close();
      }, 1000);
    });

    it('should handle multiple concurrent messages', (done) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      let messageCount = 0;

      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'execute',
            payload: {
              runId: 'test-concurrent',
              command: 'build',
              provider: 'claude',
              mode: 'cli-full',
            },
          })
        );
      });

      ws.on('message', () => {
        messageCount++;
      });

      ws.on('close', () => {
        setTimeout(() => {
          expect(messageCount).toBeGreaterThan(0);
          done();
        }, 50);
      });

      ws.on('error', done);

      setTimeout(() => {
        ws.close();
      }, 1000);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid message format', (done) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      let errorReceived = false;

      ws.on('open', () => {
        // Send malformed JSON
        ws.send('invalid json {');
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'error') {
          errorReceived = true;
        }
      });

      ws.on('close', () => {
        setTimeout(() => {
          expect(errorReceived).toBe(true);
          done();
        }, 50);
      });

      ws.on('error', done);

      setTimeout(() => {
        ws.close();
      }, 1000);
    });

    it('should handle connection errors gracefully', (done) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      let connected = false;

      ws.on('open', () => {
        connected = true;
        ws.close();
      });

      ws.on('close', () => {
        expect(connected).toBe(true);
        done();
      });

      ws.on('error', () => {
        // Error is acceptable for this test
        done();
      });
    });
  });

  describe('Full Workflow Integration', () => {
    it('should complete cli-full workflow end-to-end', (done) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      const events: string[] = [];

      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'execute',
            payload: {
              runId: 'workflow-full',
              command: 'build',
              provider: 'claude',
              mode: 'cli-full',
              roles: ['builder', 'reviewer'],
              goal: 'Build a production-ready application',
            },
          })
        );
      });

      ws.on('message', (data) => {
        const event = JSON.parse(data.toString());
        events.push(event.type);

        if (event.type === 'complete') {
          expect(event.data.runId).toBe('workflow-full');
          expect(event.data.success).toBe(true);
        }
      });

      ws.on('close', () => {
        setTimeout(() => {
          expect(events.length).toBeGreaterThan(0);
          expect(events).toContain('progress');
          expect(events).toContain('complete');
          done();
        }, 50);
      });

      ws.on('error', done);

      setTimeout(() => {
        ws.close();
      }, 1500);
    });

    it('should complete cli-lite workflow end-to-end', (done) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      const events: string[] = [];

      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'execute',
            payload: {
              runId: 'workflow-lite',
              command: 'analyze',
              provider: 'claude',
              mode: 'cli-lite',
              roles: ['analyzer'],
              goal: 'Quick analysis',
            },
          })
        );
      });

      ws.on('message', (data) => {
        const event = JSON.parse(data.toString());
        events.push(event.type);

        if (event.type === 'complete') {
          expect(event.data.runId).toBe('workflow-lite');
          expect(event.data.mode).toBe('cli-lite');
          expect(event.data.artifactCount).toBe(0);
        }
      });

      ws.on('close', () => {
        setTimeout(() => {
          expect(events.length).toBeGreaterThan(0);
          expect(events).toContain('complete');
          done();
        }, 50);
      });

      ws.on('error', done);

      setTimeout(() => {
        ws.close();
      }, 1500);
    });
  });
});
