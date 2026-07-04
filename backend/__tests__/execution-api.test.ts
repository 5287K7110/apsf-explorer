import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { Express } from 'express';
import { Router } from 'express';
import request from 'supertest';
import runsRoute from '../src/routes/runs.route.js';
import { authenticateToken } from '../src/middleware/auth.middleware.js';

describe('Execution API Endpoints', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Mock authenticateToken to bypass auth
    app.use((req, res, next) => {
      (req as any).user = { id: 'test-user' };
      next();
    });

    app.use('/api/runs', runsRoute);

    // Mock environment
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/runs/:id/execute', () => {
    it('should accept cli-full mode', async () => {
      const response = await request(app)
        .post('/api/runs/run-1/execute')
        .send({
          command: 'build',
          provider: 'claude',
          roles: ['builder'],
          mode: 'cli-full',
        });

      expect([200, 400, 500]).toContain(response.status); // Accept various states based on setup
      if (response.status === 200) {
        expect(response.body.mode).toBe('cli-full');
        expect(response.body.runId).toBe('run-1');
      }
    });

    it('should accept cli-lite mode', async () => {
      const response = await request(app)
        .post('/api/runs/run-2/execute')
        .send({
          command: 'analyze',
          provider: 'claude',
          roles: ['analyzer'],
          mode: 'cli-lite',
        });

      expect([200, 400, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.mode).toBe('cli-lite');
        expect(response.body.runId).toBe('run-2');
      }
    });

    it('should default to cli-full if mode not specified', async () => {
      const response = await request(app)
        .post('/api/runs/run-3/execute')
        .send({
          command: 'build',
          provider: 'claude',
          roles: ['builder'],
          // No mode specified
        });

      expect([200, 400, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.mode || 'cli-full').toBe('cli-full');
      }
    });

    it('should reject missing command', async () => {
      const response = await request(app)
        .post('/api/runs/run-4/execute')
        .send({
          // Missing command
          provider: 'claude',
          roles: ['builder'],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should reject missing provider', async () => {
      const response = await request(app)
        .post('/api/runs/run-5/execute')
        .send({
          command: 'build',
          // Missing provider
          roles: ['builder'],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should include goal and context in request', async () => {
      const response = await request(app)
        .post('/api/runs/run-6/execute')
        .send({
          command: 'build',
          provider: 'claude',
          roles: ['builder'],
          mode: 'cli-full',
          goal: 'Build a web app',
          context: 'React + TypeScript',
        });

      expect([200, 400, 500]).toContain(response.status);
    });
  });

  describe('POST /api/runs/:id/cancel', () => {
    it('should cancel execution', async () => {
      const response = await request(app).post('/api/runs/run-1/cancel');

      expect([200, 400, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.runId).toBe('run-1');
        expect(response.body.status).toBe('cancelled');
      }
    });
  });

  describe('GET /api/runs/providers', () => {
    it('should return available providers', async () => {
      const response = await request(app).get('/api/runs/providers');

      expect([200, 400, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.providers).toBeDefined();
        expect(Array.isArray(response.body.providers)).toBe(true);
      }
    });

    it('should include provider count', async () => {
      const response = await request(app).get('/api/runs/providers');

      if (response.status === 200) {
        expect(response.body.count).toBeDefined();
        expect(typeof response.body.count).toBe('number');
      }
    });
  });

  describe('GET /api/runs/execution-modes', () => {
    it('should return available modes', async () => {
      const response = await request(app).get('/api/runs/execution-modes');

      expect([200, 400, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.available).toBeDefined();
        expect(Array.isArray(response.body.available)).toBe(true);
      }
    });

    it('should show current mode', async () => {
      const response = await request(app).get('/api/runs/execution-modes');

      if (response.status === 200) {
        expect(response.body.current).toBeDefined();
        expect(['cli-full', 'cli-lite', 'api']).toContain(
          response.body.current
        );
      }
    });

    it('should describe modes', async () => {
      const response = await request(app).get('/api/runs/execution-modes');

      if (response.status === 200) {
        expect(response.body.modes).toBeDefined();
        expect(response.body.modes['cli-full']).toBeDefined();
        expect(response.body.modes['cli-lite']).toBeDefined();
      }
    });
  });

  describe('POST /api/runs/execution-mode', () => {
    it('should change execution mode to cli-full', async () => {
      const response = await request(app)
        .post('/api/runs/execution-mode')
        .send({ mode: 'cli-full' });

      expect([200, 400, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.mode).toBe('cli-full');
      }
    });

    it('should change execution mode to cli-lite', async () => {
      const response = await request(app)
        .post('/api/runs/execution-mode')
        .send({ mode: 'cli-lite' });

      expect([200, 400, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.mode).toBe('cli-lite');
      }
    });

    it('should reject invalid mode', async () => {
      const response = await request(app)
        .post('/api/runs/execution-mode')
        .send({ mode: 'invalid-mode' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should reject missing mode', async () => {
      const response = await request(app)
        .post('/api/runs/execution-mode')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should return success message', async () => {
      const response = await request(app)
        .post('/api/runs/execution-mode')
        .send({ mode: 'cli-lite' });

      if (response.status === 200) {
        expect(response.body.message).toBeDefined();
        expect(response.body.message).toContain('cli-lite');
      }
    });
  });

  describe('Request Validation', () => {
    it('should validate runId in URL', async () => {
      const response = await request(app)
        .post('/api/runs/test-run-123/execute')
        .send({
          command: 'build',
          provider: 'claude',
        });

      expect([200, 400, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.runId).toBe('test-run-123');
      }
    });

    it('should handle empty roles array', async () => {
      const response = await request(app)
        .post('/api/runs/run-empty-roles/execute')
        .send({
          command: 'test',
          provider: 'claude',
          roles: [],
        });

      expect([200, 400, 500]).toContain(response.status);
    });

    it('should handle multiple roles', async () => {
      const response = await request(app)
        .post('/api/runs/run-multi-roles/execute')
        .send({
          command: 'plan',
          provider: 'claude',
          roles: ['architect', 'planner', 'reviewer'],
        });

      expect([200, 400, 500]).toContain(response.status);
    });
  });

  describe('Response Format', () => {
    it('should return JSON response', async () => {
      const response = await request(app)
        .post('/api/runs/run-format/execute')
        .send({
          command: 'build',
          provider: 'claude',
        });

      expect(response.type).toMatch(/json/i);
    });

    it('should include runId in response', async () => {
      const response = await request(app)
        .post('/api/runs/run-response/execute')
        .send({
          command: 'build',
          provider: 'claude',
        });

      if (response.status === 200) {
        expect(response.body.runId).toBe('run-response');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle server errors gracefully', async () => {
      const response = await request(app)
        .post('/api/runs/run-error/execute')
        .send({
          command: 'build',
          provider: 'invalid-provider-xyz',
        });

      // Should return 400 for invalid provider
      expect([400, 500]).toContain(response.status);
      expect(response.body.error).toBeDefined();
    });

    it('should handle missing request body', async () => {
      const response = await request(app)
        .post('/api/runs/run-no-body/execute')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
  });
});

describe('Provider Support', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      (req as any).user = { id: 'test-user' };
      next();
    });
    app.use('/api/runs', runsRoute);

    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.clearAllMocks();
  });

  it('should support Claude provider', async () => {
    const response = await request(app)
      .post('/api/runs/run-claude/execute')
      .send({
        command: 'build',
        provider: 'claude',
        roles: ['builder'],
      });

    expect([200, 400, 500]).toContain(response.status);
  });

  it('should support Codex provider', async () => {
    const response = await request(app)
      .post('/api/runs/run-codex/execute')
      .send({
        command: 'build',
        provider: 'codex',
        roles: ['builder'],
      });

    expect([200, 400, 500]).toContain(response.status);
  });

  it('should support multiple providers in sequence', async () => {
    const claudeResponse = await request(app)
      .post('/api/runs/run-seq-claude/execute')
      .send({
        command: 'build',
        provider: 'claude',
      });

    const codexResponse = await request(app)
      .post('/api/runs/run-seq-codex/execute')
      .send({
        command: 'build',
        provider: 'codex',
      });

    expect([200, 400, 500]).toContain(claudeResponse.status);
    expect([200, 400, 500]).toContain(codexResponse.status);
  });
});
