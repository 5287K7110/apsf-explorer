import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runAPI } from '../../services/runAPI';
import * as apiClientModule from '../../utils/apiClient';

// Mock apiClient
vi.mock('../../utils/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('runAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getRunList', () => {
    it('should fetch all runs', async () => {
      const mockRuns = [
        { id: '1', status: 'completed' },
        { id: '2', status: 'running' },
      ];

      vi.mocked(apiClientModule.apiClient.get).mockResolvedValueOnce(mockRuns);

      const runs = await runAPI.getRunList();

      expect(runs).toEqual(mockRuns);
      expect(apiClientModule.apiClient.get).toHaveBeenCalledWith('/runs');
    });

    it('should handle empty list', async () => {
      vi.mocked(apiClientModule.apiClient.get).mockResolvedValueOnce([]);

      const runs = await runAPI.getRunList();

      expect(runs).toEqual([]);
    });

    it('should throw on API error', async () => {
      vi.mocked(apiClientModule.apiClient.get).mockRejectedValueOnce(
        new Error('API error')
      );

      try {
        await runAPI.getRunList();
        expect.fail('Should throw error');
      } catch (error: any) {
        expect(error.message).toBe('API error');
      }
    });
  });

  describe('getRun', () => {
    it('should fetch single run', async () => {
      const mockRun = { id: 'run-123', status: 'running', phase: 'building' };

      vi.mocked(apiClientModule.apiClient.get).mockResolvedValueOnce(mockRun);

      const run = await runAPI.getRun('run-123');

      expect(run).toEqual(mockRun);
      expect(apiClientModule.apiClient.get).toHaveBeenCalledWith('/runs/run-123');
    });

    it('should handle 404 error', async () => {
      vi.mocked(apiClientModule.apiClient.get).mockRejectedValueOnce(
        new Error('Not found')
      );

      try {
        await runAPI.getRun('non-existent');
        expect.fail('Should throw error');
      } catch (error: any) {
        expect(error.message).toBe('Not found');
      }
    });
  });

  describe('watchRun', () => {
    it('should watch run for updates', async () => {
      const mockWatch = { status: 'running' };

      vi.mocked(apiClientModule.apiClient.get).mockResolvedValueOnce(mockWatch);

      const result = await runAPI.watchRun('run-123');

      expect(result).toEqual(mockWatch);
      expect(apiClientModule.apiClient.get).toHaveBeenCalledWith('/runs/run-123/watch');
    });
  });

  describe('execute commands', () => {
    it('should execute plan', async () => {
      vi.mocked(apiClientModule.apiClient.post).mockResolvedValueOnce({
        status: 'planning',
      });

      await runAPI.executePlan('run-123');

      expect(apiClientModule.apiClient.post).toHaveBeenCalledWith(
        '/runs/run-123/plan',
        { roles: [] }
      );
    });

    it('should execute plan with roles', async () => {
      vi.mocked(apiClientModule.apiClient.post).mockResolvedValueOnce({
        status: 'planning',
      });

      await runAPI.executePlan('run-123', ['builder', 'critic']);

      expect(apiClientModule.apiClient.post).toHaveBeenCalledWith(
        '/runs/run-123/plan',
        { roles: ['builder', 'critic'] }
      );
    });

    it('should execute build', async () => {
      vi.mocked(apiClientModule.apiClient.post).mockResolvedValueOnce({
        status: 'building',
      });

      await runAPI.executeBuild('run-123');

      expect(apiClientModule.apiClient.post).toHaveBeenCalledWith(
        '/runs/run-123/build',
        { roles: [] }
      );
    });

    it('should execute review', async () => {
      vi.mocked(apiClientModule.apiClient.post).mockResolvedValueOnce({
        status: 'reviewing',
      });

      await runAPI.executeReview('run-123', ['critic']);

      expect(apiClientModule.apiClient.post).toHaveBeenCalledWith(
        '/runs/run-123/review',
        { roles: ['critic'] }
      );
    });

    it('should execute judge', async () => {
      vi.mocked(apiClientModule.apiClient.post).mockResolvedValueOnce({
        status: 'judging',
      });

      await runAPI.executeJudge('run-123', ['judge']);

      expect(apiClientModule.apiClient.post).toHaveBeenCalledWith(
        '/runs/run-123/judge',
        { roles: ['judge'] }
      );
    });

    it('should execute retry', async () => {
      vi.mocked(apiClientModule.apiClient.post).mockResolvedValueOnce({
        status: 'retrying',
      });

      await runAPI.executeRetry('run-123');

      expect(apiClientModule.apiClient.post).toHaveBeenCalledWith(
        '/runs/run-123/retry',
        { roles: [] }
      );
    });

    it('should execute cycle', async () => {
      vi.mocked(apiClientModule.apiClient.post).mockResolvedValueOnce({
        status: 'cycling',
      });

      await runAPI.executeCycle('run-123', ['builder', 'critic', 'judge']);

      expect(apiClientModule.apiClient.post).toHaveBeenCalledWith(
        '/runs/run-123/cycle',
        { roles: ['builder', 'critic', 'judge'] }
      );
    });
  });

  describe('getRoles', () => {
    it('should fetch available roles', async () => {
      const mockRoles = [
        { id: '1', type: 'builder', name: 'Builder' },
        { id: '2', type: 'critic', name: 'Critic' },
      ];

      vi.mocked(apiClientModule.apiClient.get).mockResolvedValueOnce(mockRoles);

      const roles = await runAPI.getRoles();

      expect(roles).toEqual(mockRoles);
      expect(apiClientModule.apiClient.get).toHaveBeenCalledWith('/roles');
    });
  });

  describe('createRun', () => {
    it('should create new run', async () => {
      const config = {
        domain: 'shopping',
        description: 'Test shopping scenario',
        acCount: 5,
      };
      const mockRun = { id: 'new-run-123', ...config, status: 'pending' };

      vi.mocked(apiClientModule.apiClient.post).mockResolvedValueOnce(mockRun);

      const run = await runAPI.createRun(config);

      expect(run).toEqual(mockRun);
      expect(apiClientModule.apiClient.post).toHaveBeenCalledWith('/runs', config);
    });

    it('should handle missing required fields', async () => {
      vi.mocked(apiClientModule.apiClient.post).mockRejectedValueOnce(
        new Error('Missing required field')
      );

      try {
        await runAPI.createRun({
          domain: '',
          description: '',
        });
        expect.fail('Should throw error');
      } catch (error: any) {
        expect(error.message).toBe('Missing required field');
      }
    });
  });

  describe('cancelRun', () => {
    it('should cancel running execution', async () => {
      vi.mocked(apiClientModule.apiClient.post).mockResolvedValueOnce({
        status: 'cancelled',
      });

      await runAPI.cancelRun('run-123');

      expect(apiClientModule.apiClient.post).toHaveBeenCalledWith(
        '/runs/run-123/cancel',
        {}
      );
    });

    it('should throw if run not running', async () => {
      vi.mocked(apiClientModule.apiClient.post).mockRejectedValueOnce(
        new Error('Run not in executing state')
      );

      try {
        await runAPI.cancelRun('run-completed');
        expect.fail('Should throw error');
      } catch (error: any) {
        expect(error.message).toBe('Run not in executing state');
      }
    });
  });

  describe('getRunLogs', () => {
    it('should fetch run logs', async () => {
      const mockLogs = [
        { timestamp: 1000, message: 'Starting build' },
        { timestamp: 2000, message: 'Build complete' },
      ];

      vi.mocked(apiClientModule.apiClient.get).mockResolvedValueOnce(mockLogs);

      const logs = await runAPI.getRunLogs('run-123');

      expect(logs).toEqual(mockLogs);
      expect(apiClientModule.apiClient.get).toHaveBeenCalledWith('/runs/run-123/logs');
    });

    it('should handle empty logs', async () => {
      vi.mocked(apiClientModule.apiClient.get).mockResolvedValueOnce([]);

      const logs = await runAPI.getRunLogs('run-123');

      expect(logs).toEqual([]);
    });
  });

  describe('getRunDecisions', () => {
    it('should fetch run decisions', async () => {
      const mockDecisions = [
        { id: '1', decision: 'approved', reason: 'Looks good' },
        { id: '2', decision: 'rejected', reason: 'Needs work' },
      ];

      vi.mocked(apiClientModule.apiClient.get).mockResolvedValueOnce(mockDecisions);

      const decisions = await runAPI.getRunDecisions('run-123');

      expect(decisions).toEqual(mockDecisions);
      expect(apiClientModule.apiClient.get).toHaveBeenCalledWith(
        '/runs/run-123/decisions'
      );
    });
  });
});
