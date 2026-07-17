import { Router, type Request, type Response } from 'express';
import { execSync } from 'child_process';
import {
  APSFRunBridge,
  PhaseFileMismatchError,
  AutoOwnedPhaseError,
} from '../services/apsf-run-bridge.service.js';
import { ExecutionModeRouter } from '../services/execution-mode-router.js';
import { executionEvents } from '../services/event-bus.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { type ExecuteRequest, type StreamEvent } from '../types/index.js';
import { workdirGitDiff } from '../services/apsf-native/workdir-git.js';
import {
  PTYPE_TO_SPECIALIST,
  CTYPE_TO_SPECIALIST,
  listAvailableSpecialists,
} from '../services/apsf-native/specialist-registry.js';
import { resolveFrameworkRoot } from '../services/apsf-native/content-root.js';
import { proposeSplit, type SplitProposal } from '../services/split-planner.js';
import { PhaseDetector } from '../services/apsf-native/phase-detector.js';
import { type ExecutionMode } from '../types/execution-mode.js';

const router = Router();
const apsfRun = new APSFRunBridge();
const modeRouter = new ExecutionModeRouter(
  (process.env.EXECUTION_MODE as ExecutionMode) || 'cli-full'
);

function localDateString(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function createBranchAllocator(existingRuns: string[], date: string): () => string {
  const used = new Set<number>();
  const re = new RegExp(`^${date}-(\\d{3})_`);
  for (const run of existingRuns) {
    const match = run.match(re);
    if (match) used.add(Number(match[1]));
  }

  return () => {
    for (let seq = 1; seq <= 999; seq++) {
      if (used.has(seq)) continue;
      used.add(seq);
      return String(seq).padStart(3, '0');
    }
    throw new Error(`No available sub-run branch numbers for ${date}`);
  };
}

function validateExecuteSpecialists(specialists: unknown): string | null {
  if (specialists === undefined || specialists === null) return null;
  if (typeof specialists !== 'object' || Array.isArray(specialists)) {
    return 'specialists must be an object with optional planner and critic fields';
  }

  const input = specialists as { planner?: unknown; critic?: unknown };
  const checks = [
    { role: 'planner', value: input.planner, valid: Object.keys(PTYPE_TO_SPECIALIST).sort() },
    { role: 'critic', value: input.critic, valid: Object.keys(CTYPE_TO_SPECIALIST).sort() },
  ] as const;

  for (const check of checks) {
    if (check.value === undefined || check.value === null) continue;
    if (typeof check.value !== 'string' || !check.value.trim()) {
      return `Invalid ${check.role} specialist code '${String(check.value)}'. Valid ${check.role} codes: ${check.valid.join(', ')}`;
    }
    const code = check.value.trim().toUpperCase();
    if (!check.valid.includes(code)) {
      return `Invalid ${check.role} specialist code '${check.value}'. Valid ${check.role} codes: ${check.valid.join(', ')}`;
    }
  }

  return null;
}

// Middleware
router.use(authenticateToken);

/**
 * POST /api/runs/:id/execute
 * Execute command with specified provider
 * mode パラメータで CLI-FULL / CLI-LITE を選択
 */
router.post('/:id/execute', async (req: Request, res: Response) => {
  try {
    const { command, provider, providers, specialists, roles, goal, context, mode } = req.body;
    const runId = req.params.id;

    // Validation
    if (!command || !provider) {
      res.status(400).json({
        error: 'command and provider are required',
      });
      return;
    }

    const specialistError = validateExecuteSpecialists(specialists);
    if (specialistError) {
      res.status(400).json({ error: specialistError });
      return;
    }

    const effectiveMode = mode || process.env.EXECUTION_MODE || 'cli-full';

    // 実行契約: 実 AI 実行は apsf-run に一本化されている。cli-full / cli-lite は
    // デモ・テスト専用のレガシー経路（単一実行キューの対象外）であり、
    // 本番ではリソース競合・イベント混線を防ぐため受け付けない
    if (process.env.NODE_ENV === 'production' && effectiveMode !== 'apsf-run') {
      res.status(400).json({
        error: `Execution mode '${effectiveMode}' is demo/test-only. Use mode 'apsf-run' in production.`,
      });
      return;
    }
    const executeRequest: ExecuteRequest = {
      runId,
      command,
      provider,
      ...(providers && typeof providers === 'object' ? { providers } : {}),
      ...(specialists && typeof specialists === 'object' ? { specialists } : {}),
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
 * GET /api/runs/queue
 * 実行キューの状態（実行中の run + FIFO 待機列）
 */
router.get('/queue', (req: Request, res: Response) => {
  res.json(apsfRun.getQueueState());
});

/**
 * GET /api/runs/specialists
 * GUI の明示選択用に、選択可能な specialist 一覧を返す
 */
router.get('/specialists', (req: Request, res: Response) => {
  try {
    const frameworkRoot = resolveFrameworkRoot(process.env.APSF_ROOT || '');
    res.json({ specialists: listAvailableSpecialists(frameworkRoot) });
  } catch (error) {
    res.status(400).json({
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
    const { runName, light, taxonomy, workdir } = req.body || {};
    if (!runName) {
      res.status(400).json({ error: 'runName is required' });
      return;
    }
    await apsfRun.createRun(runName, {
      light: Boolean(light),
      taxonomy,
      workdir: typeof workdir === 'string' && workdir.trim() ? workdir.trim() : undefined,
    });
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
    const { content, filename, force, forceReason, allowAutoOwned } = req.body || {};
    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'content (string) is required' });
      return;
    }
    const result = await apsfRun.writePhase(req.params.id, content, {
      filename: typeof filename === 'string' ? filename : undefined,
      force: Boolean(force),
      forceReason: typeof forceReason === 'string' ? forceReason : undefined,
      allowAutoOwned: Boolean(allowAutoOwned),
    });
    res.json({ runId: req.params.id, ...result });
  } catch (error) {
    const status =
      error instanceof PhaseFileMismatchError || error instanceof AutoOwnedPhaseError
        ? error.status
        : 400;
    res.status(status).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/runs/apsf/:id/workdir-diff
 * run の対象 workdir のライブ git diff（人間ゲートの判断材料）
 */
router.get('/apsf/:id/workdir-diff', async (req: Request, res: Response) => {
  try {
    if (!apsfRun.isAvailable()) {
      res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
      return;
    }
    const workdir = apsfRun.getTargetWorkdir(req.params.id);
    const diff = await workdirGitDiff(workdir);
    res.json({ runId: req.params.id, workdir, ...diff });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/runs/apsf/:id/split-proposal
 * 大きなタスクの分割案を AI（read-only）に生成させる
 */
router.post('/apsf/:id/split-proposal', async (req: Request, res: Response) => {
  try {
    if (!apsfRun.isAvailable()) {
      res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
      return;
    }
    if (apsfRun.listExecuting().length > 0) {
      res.status(409).json({ error: 'An execution is in progress. Wait for it to finish first.' });
      return;
    }
    const runDir = apsfRun.getRunDir(req.params.id);
    if (!runDir) {
      res.status(404).json({ error: `Run not found: ${req.params.id}` });
      return;
    }
    const provider = req.body?.provider === 'codex' ? 'codex' : 'claude';
    const workdir = apsfRun.getTargetWorkdir(req.params.id);
    const result = await proposeSplit(runDir, provider, workdir);
    res.json({ runId: req.params.id, provider, proposals: result.proposals });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/runs/apsf/:id/split-apply
 * 人間が承認した分割案から sub-run 群を作成する（workdir は親 run を継承）
 */
router.post('/apsf/:id/split-apply', async (req: Request, res: Response) => {
  try {
    if (!apsfRun.isAvailable()) {
      res.status(503).json({ error: 'APSF framework not available. Set APSF_ROOT.' });
      return;
    }
    const runs = req.body?.runs as SplitProposal[] | undefined;
    if (!Array.isArray(runs) || runs.length === 0 || runs.length > 8) {
      res.status(400).json({ error: 'runs (array of 1-8 {name, task}) is required' });
      return;
    }
    if (!apsfRun.getRunDir(req.params.id)) {
      res.status(404).json({ error: `Run not found: ${req.params.id}` });
      return;
    }
    const parentWorkdir = apsfRun.getTargetWorkdir(req.params.id);
    const today = localDateString();
    const nextBranch = createBranchAllocator(apsfRun.listRuns(), today);
    const created: string[] = [];
    const errors: string[] = [];
    for (const r of runs) {
      const name = String(r.name ?? '').trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{1,60}$/.test(name)) {
        errors.push(`invalid name: ${r.name}`);
        continue;
      }
      const runName = `${today}-${nextBranch()}_${name}`;
      if (PhaseDetector.countMeaningfulLines(String(r.task ?? '')) <= 3) {
        errors.push(
          `${runName}: task body too thin (needs more than 3 meaningful lines — ` +
            'headings and unchecked checkboxes do not count)'
        );
        continue;
      }
      try {
        await apsfRun.createRun(runName, {
          light: true,
          taxonomy: 'work',
          workdir: parentWorkdir,
          parentRun: req.params.id,
        });
        await apsfRun.writePhase(runName, String(r.task ?? ''), { filename: 'task.md' });
        created.push(runName);
      } catch (e) {
        errors.push(`${runName}: ${e instanceof Error ? e.message : 'failed'}`);
      }
    }
    res.json({ runId: req.params.id, created, errors });
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
      existingFiles: apsfRun.listArtifacts(req.params.id),
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
