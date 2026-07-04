import { Router, Request, Response } from 'express';
import { APSFBridgeService } from '../services/apsf-bridge.service.js';
import { ExecutionModeRouter } from '../services/execution-mode-router.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { ExecuteRequest } from '../types/index.js';
import { ExecutionMode } from '../types/execution-mode.js';

const router = Router();
const apsf = new APSFBridgeService();
const modeRouter = new ExecutionModeRouter(
  (process.env.EXECUTION_MODE as ExecutionMode) || 'cli-full'
);

// Middleware
router.use(authenticateToken);

/**
 * POST /api/runs/:id/execute
 * Execute command with specified provider
 * mode パラメータで CLI-FULL / CLI-LITE を選択
 */
router.post('/:id/execute', async (req: Request, res: Response) => {
  try {
    const { command, provider, roles, goal, context, mode } = req.body;
    const runId = req.params.id;

    // Validation
    if (!command || !provider) {
      res.status(400).json({
        error: 'command and provider are required',
      });
      return;
    }

    if (!apsf.isProviderAvailable(provider)) {
      res.status(400).json({
        error: `Provider ${provider} is not available`,
        availableProviders: apsf.getAvailableProviders(),
      });
      return;
    }

    // 🔹 Mode を指定可能
    const executeRequest: ExecuteRequest = {
      runId,
      command,
      provider,
      roles: roles || [],
      goal,
      context,
      mode: mode || 'cli-full', // デフォルト: CLI-FULL
    };

    await apsf.execute(executeRequest);

    res.json({
      runId,
      status: 'executing',
      provider,
      mode: mode || 'cli-full',
      message: `Executing ${command} with ${provider} (mode: ${
        mode || 'cli-full'
      })`,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/runs/:id/cancel
 * Cancel execution
 */
router.post('/:id/cancel', (req: Request, res: Response) => {
  try {
    const runId = req.params.id;
    apsf.cancelExecution(runId);

    res.json({
      runId,
      status: 'cancelled',
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/providers
 * Get available providers
 */
router.get('/providers', (req: Request, res: Response) => {
  const providers = apsf.getAvailableProviders();

  res.json({
    providers,
    count: providers.length,
  });
});

/**
 * GET /api/execution-modes
 * 利用可能なモード一覧
 */
router.get('/execution-modes', (req: Request, res: Response) => {
  const available = modeRouter.getAvailableModes();

  res.json({
    current: process.env.EXECUTION_MODE || 'cli-full',
    available,
    modes: {
      'cli-full': 'Full execution with artifact storage',
      'cli-lite': 'Lightweight execution without storage',
      'api': 'API mode (coming in v2.0)',
    },
  });
});

/**
 * POST /api/execution-mode
 * 実行モードを変更
 */
router.post('/execution-mode', (req: Request, res: Response) => {
  try {
    const { mode } = req.body;

    if (!mode) {
      res.status(400).json({
        error: 'mode is required',
      });
      return;
    }

    modeRouter.setMode(mode as ExecutionMode);

    res.json({
      mode,
      message: `Execution mode changed to ${mode}`,
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
