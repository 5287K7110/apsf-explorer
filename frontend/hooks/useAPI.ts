import { useCallback, useState } from 'react';
import { useRunStore } from '../store/runStore';
import { CommandType, CommandResponse, APIError, Phase } from '../types';
import { runAPI } from '../services/runAPI';

interface UseAPIOptions {
  onSuccess?: () => void;
  onError?: (error: APIError) => void;
  roles?: string[];
}

export function useAPI() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<APIError | null>(null);
  const updateRun = useRunStore((state) => state.updateRun);
  const updateRunPhase = useRunStore((state) => state.updateRunPhase);

  const executeCommand = useCallback(
    async (
      runId: string,
      command: CommandType,
      options?: UseAPIOptions
    ): Promise<CommandResponse | null> => {
      setLoading(true);
      setError(null);

      try {
        // Update store with command execution
        updateRun(runId, { currentCommand: command, status: 'running' });

        // Phase mapping
        const phaseMap: Record<CommandType, Phase> = {
          plan: 'planning',
          build: 'building',
          review: 'reviewing',
          judge: 'judging',
          retry: 'building',
          'full-cycle': 'planning',
        };

        const targetPhase = phaseMap[command];
        updateRunPhase(runId, targetPhase, 25);

        // Execute real API call with roles
        const roles = options?.roles || [];
        switch (command) {
          case 'plan':
            await runAPI.executePlan(runId, roles);
            break;
          case 'build':
            await runAPI.executeBuild(runId, roles);
            break;
          case 'review':
            await runAPI.executeReview(runId, roles);
            break;
          case 'judge':
            await runAPI.executeJudge(runId, roles);
            break;
          case 'retry':
            await runAPI.executeRetry(runId, roles);
            break;
          case 'full-cycle':
            await runAPI.executeCycle(runId, roles);
            break;
          default:
            throw new Error(`Unknown command: ${command}`);
        }

        // Mark as complete with progress
        updateRunPhase(runId, targetPhase, 100);

        const commandResponse: CommandResponse = {
          success: true,
          runId,
          message: `${command} command executed successfully`,
          timestamp: Date.now(),
        };

        options?.onSuccess?.();
        return commandResponse;
      } catch (err) {
        const apiError: APIError = {
          code: 'COMMAND_FAILED',
          message: err instanceof Error ? err.message : 'Unknown error',
        };
        setError(apiError);
        options?.onError?.(apiError);
        updateRun(runId, { status: 'failed' });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [updateRun, updateRunPhase]
  );

  const fetchRuns = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const runs = await runAPI.getRunList();
      return !!runs;
    } catch (err) {
      const apiError: APIError = {
        code: 'FETCH_FAILED',
        message: err instanceof Error ? err.message : 'Failed to fetch runs',
      };
      setError(apiError);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRunDetail = useCallback(
    async (runId: string): Promise<boolean> => {
      setLoading(true);
      setError(null);

      try {
        await runAPI.getRun(runId);
        return true;
      } catch (err) {
        const apiError: APIError = {
          code: 'FETCH_DETAIL_FAILED',
          message: err instanceof Error ? err.message : 'Failed to fetch run detail',
        };
        setError(apiError);
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      return await runAPI.getRoles();
    } catch (err) {
      const apiError: APIError = {
        code: 'FETCH_ROLES_FAILED',
        message: err instanceof Error ? err.message : 'Failed to fetch roles',
      };
      setError(apiError);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const createRun = useCallback(async (config: any): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      await runAPI.createRun(config);
      return true;
    } catch (err) {
      const apiError: APIError = {
        code: 'CREATE_RUN_FAILED',
        message: err instanceof Error ? err.message : 'Failed to create run',
      };
      setError(apiError);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const cancelRun = useCallback(async (runId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      await runAPI.cancelRun(runId);
      updateRun(runId, { status: 'cancelled' });
      return true;
    } catch (err) {
      const apiError: APIError = {
        code: 'CANCEL_RUN_FAILED',
        message: err instanceof Error ? err.message : 'Failed to cancel run',
      };
      setError(apiError);
      return false;
    } finally {
      setLoading(false);
    }
  }, [updateRun]);

  return {
    loading,
    error,
    executeCommand,
    fetchRuns,
    fetchRunDetail,
    fetchRoles,
    createRun,
    cancelRun,
  };
}
