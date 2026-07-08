import { Router, Request, Response } from 'express';
import { execSync } from 'child_process';
import { APSFRunBridge } from '../services/apsf-run-bridge.service.js';
import { ExecutionModeRouter } from '../services/execution-mode-router.js';
import { executionEvents } from '../services/event-bus.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { ExecuteRequest, StreamEvent } from '../types/index.js';
import { ExecutionMode } from '../types/execution-mode.js';

const router = Router();
const apsfRun = new APSFRunBridge();
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

    const effectiveMode = mode || process.env.EXECUTION_MODE || 'cli-full';
    const executeRequest: ExecuteRequest = {
      runId,
      command,
      provider,
      roles: roles || [],
      goal,
      context,
      mode: effectiveMode,
    };

    // Execution Mode Router 経由（cli-full / cli-lite / api / apsf-run）
    // CLI 系モードは CLI 自身がセッション認証を持つため API キー検証は不要
    const executor = modeRouter.getExecutor(executeRequest);
    executor.on('event', (event: StreamEvent) => {
      executionEvents.emit('event', event);
    });
    // 実行は非同期継続。進捗/完了/エラーは WebSocket で配信される
    executor.execute(executeRequest).catch(() => {
      // エラーは executor 内で event として emit 済み
    });

    res.json({
      runId,
      status: 'executing',
      provider,
      mode: effectiveMode,
      message: `Executing ${command} with ${provider} (mode: ${effectiveMode})`,
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
    apsfRun.cancelExecution(runId);

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
 * GET /api/runs/apsf
 * 実 APSF Framework の run 一覧（APSF_ROOT 未設定なら available: false）
 */
router.get('/apsf', (req: Request, res: Response) => {
  const available = apsfRun.isAvailable();
  res.json({
    available,
    apsfRoot: process.env.APSF_ROOT || null,
    runs: available ? apsfRun.listRuns() : [],
  });
});

/**
 * POST /api/runs/apsf
 * 新しい run を作成（apsf start-run 経由）
 */
router.post('/apsf', async (req: Request, res: Response) => {
  try {
    if (!apsfRun.isAvailable()) {
      res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
      return;
    }
    const { runName, light, taxonomy } = req.body || {};
    if (!runName) {
      res.status(400).json({ error: 'runName is required' });
      return;
    }
    await apsfRun.createRun(runName, { light: Boolean(light), taxonomy });
    const info = apsfRun.getPhaseInfo(runName);
    res.json({ runName, phase: info.phase, fileToWrite: info.fileToWrite });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/runs/apsf/:id/files/:filename
 * phase ファイルの内容を取得
 */
router.get('/apsf/:id/files/:filename', (req: Request, res: Response) => {
  try {
    if (!apsfRun.isAvailable()) {
      res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
      return;
    }
    const content = apsfRun.readPhaseFile(req.params.id, req.params.filename);
    if (content === null) {
      res.status(404).json({ error: `File not found: ${req.params.filename}` });
      return;
    }
    res.json({ runId: req.params.id, filename: req.params.filename, content });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/runs/apsf/:id/write-phase
 * 現在フェーズの対象ファイルに内容を保存（human フェーズの記入用）
 * apsf write-phase --stdin 経由（上書き保護・run_state 遷移付き）
 */
router.post('/apsf/:id/write-phase', async (req: Request, res: Response) => {
  try {
    if (!apsfRun.isAvailable()) {
      res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
      return;
    }
    const { content } = req.body || {};
    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'content (string) is required' });
      return;
    }
    const result = await apsfRun.writePhase(req.params.id, content);
    res.json({ runId: req.params.id, ...result });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/runs/apsf/:id/judge
 * Judge 裁定: { decision: 'Accept' | 'Return to Build' | 'Return to Plan', reason?: string }
 * Return 系は reason 必須。IMPROVE_NEEDED 以外は 409。
 */
router.post('/apsf/:id/judge', (req: Request, res: Response) => {
  try {
    if (!apsfRun.isAvailable()) {
      res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
      return;
    }
    const { decision, reason } = req.body || {};
    if (!decision || typeof decision !== 'string') {
      res.status(400).json({ error: 'decision (string) is required' });
      return;
    }
    const result = apsfRun.judgeDecision(req.params.id, decision, reason);
    res.json({ runId: req.params.id, ...result });
  } catch (error) {
    const status =
      error && typeof error === 'object' && (error as any).statusCode === 409 ? 409 : 400;
    res.status(status).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/runs/apsf/:id/executions
 * 過去の実行トランスクリプト一覧（runs/<run>/executions/*.jsonl、新しい順）
 */
router.get('/apsf/:id/executions', (req: Request, res: Response) => {
  try {
    if (!apsfRun.isAvailable()) {
      res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
      return;
    }
    res.json({ runId: req.params.id, executions: apsfRun.listExecutions(req.params.id) });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/runs/apsf/:id/executions/:file
 * 実行トランスクリプトの中身（JSONL をパース済みイベント配列で返す）
 */
router.get('/apsf/:id/executions/:file', (req: Request, res: Response) => {
  try {
    if (!apsfRun.isAvailable()) {
      res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
      return;
    }
    const events = apsfRun.readExecution(req.params.id, req.params.file);
    if (events === null) {
      res.status(404).json({ error: `Transcript not found: ${req.params.file}` });
      return;
    }
    res.json({ runId: req.params.id, file: req.params.file, events });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/runs/apsf/:id/advisory
 * judge_advisory.json（IMPROVE_NEEDED での Judge 推奨）を取得
 */
router.get('/apsf/:id/advisory', (req: Request, res: Response) => {
  try {
    if (!apsfRun.isAvailable()) {
      res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
      return;
    }
    const advisory = apsfRun.getAdvisory(req.params.id);
    res.json({ runId: req.params.id, advisory });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/runs/apsf/:id/phase
 * 実 APSF のフェーズ検出（TS ネイティブ、`apsf next` と parity 検証済み）
 */
router.get('/apsf/:id/phase', async (req: Request, res: Response) => {
  try {
    if (!apsfRun.isAvailable()) {
      res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
      return;
    }
    const info = apsfRun.getPhaseInfo(req.params.id);
    const meta = apsfRun.getRunStateMeta(req.params.id);
    res.json({
      runId: req.params.id,
      phase: info.phase,
      fileToWrite: info.fileToWrite,
      nextRole: info.nextRole,
      humanOwned: info.humanOwned,
      executing: apsfRun.listExecuting().includes(req.params.id),
      phaseStatus: meta.phaseStatus,
      lastError: meta.lastError,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/runs/providers
 * 利用可能なプロバイダー（PATH 上の実 CLI 検出。CLI はセッション認証を持つ）
 */
router.get('/providers', (req: Request, res: Response) => {
  const checkCmd = process.platform === 'win32' ? 'where' : 'which';
  const providers = ['claude', 'codex', 'gemini'].filter((cli) => {
    try {
      execSync(`${checkCmd} ${cli}`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  });

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
      'apsf-run': 'Real APSF framework (run dirs + phase detection + wrappers)',
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
