import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { PhaseDetector, resolveRunDir } from './apsf-native/phase-detector.js';
import { startRun } from './apsf-native/run-store.js';
import { writePhase as nativeWritePhase, resolveWriteTarget } from './apsf-native/write-phase.js';
import { isHumanPhase } from './apsf-native/phases.js';
import { applyJudgeDecision } from './apsf-native/judge-decision.js';
import { loadRunState } from './apsf-native/run-state.js';
import { listTranscripts, readTranscript, } from './apsf-native/execution-transcript.js';
import { PTYPE_TO_SPECIALIST, CTYPE_TO_SPECIALIST, } from './apsf-native/specialist-registry.js';
import { enqueue, cancelExecution, listExecuting, getQueueState, } from './execution-queue.js';
/**
 * APSFRunBridge: APSF ワークフローのワークスペース操作層
 *
 * 完全 TypeScript ネイティブ（python / apsf CLI / PowerShell いずれも不要）:
 * - 状態       : <APSF_ROOT>/runs/<run-name>/（goal.md, plan.md, run_state.json...）
 * - フェーズ検出: phase-detector.ts（python `apsf next` と parity 30/30）
 * - run 作成   : run-store.ts（python `apsf start-run` とバイト一致 parity）
 * - phase 保存 : write-phase.ts（python `apsf write-phase` と parity 12/12 —
 *                上書き保護・run_state 遷移・judge advisory 含む）
 * - プロンプト  : prompt-builder.ts（python `apsf act --print-prompt` と
 *                parity 6/6 バイト一致 — specialist 選択含む）
 * - 実行/ループ : native-executor.ts（AI CLI 直接 spawn + human フェーズ停止）
 *
 * NOTE: 実行キューは execution-queue.ts に委譲（モジュールレベル共有状態）
 */
/** run 名の許容形式（YYYY-MM-DD(-NNN)_case_topic）— パス片として使うため厳格に検証 */
export const RUN_NAME_RE = /^\d{4}-\d{2}-\d{2}(-\d{3})?_[A-Za-z0-9._-]+$/;
/**
 * 呼び出し側が意図したファイルと現 phase の書き込み先が食い違った（HTTP 409 相当）。
 * 編集開始後に phase が進んだ場合、意図しないファイルへの保存を防ぐ。
 */
export class PhaseFileMismatchError extends Error {
    constructor() {
        super(...arguments);
        this.status = 409;
    }
}
/**
 * auto-owned phase（Builder/Critic の担当ファイル）への手動書き込みには
 * 明示的な allowAutoOwned フラグが必要（HTTP 403 相当）。
 */
export class AutoOwnedPhaseError extends Error {
    constructor() {
        super(...arguments);
        this.status = 403;
    }
}
/**
 * phase として読み書きを許可するファイル名（ホワイトリスト）。
 */
export const PHASE_FILES = [
    'task.md', 'goal.md', 'execution-assignment.md', 'plan.md', 'build.md',
    'review.md', 'improve-plan.md', 'improve.md', 'verify.md', 'result.md',
    'handoff.md', 'transcript.md',
    'plan_review.md', 'build_review.md', 'review_review.md', 'improve_review.md',
    'model-assignment.md',
];
function validateExecuteSpecialists(specialists) {
    if (!specialists)
        return null;
    const checks = [
        { role: 'planner', value: specialists.planner, valid: Object.keys(PTYPE_TO_SPECIALIST).sort() },
        { role: 'critic', value: specialists.critic, valid: Object.keys(CTYPE_TO_SPECIALIST).sort() },
    ];
    for (const check of checks) {
        if (check.value === undefined || check.value === null)
            continue;
        const code = check.value.trim().toUpperCase();
        if (!code || !check.valid.includes(code)) {
            return `Invalid ${check.role} specialist code '${check.value}'. Valid ${check.role} codes: ${check.valid.join(', ')}`;
        }
    }
    return null;
}
export class APSFRunBridge extends EventEmitter {
    // NOTE: コンストラクタでキャッシュしない。ESM の import ホイスティングにより
    // モジュールレベルのインスタンス化が dotenv.config() より先に走るため、
    // env はアクセス時に遅延評価する
    get apsfRoot() {
        return process.env.APSF_ROOT || '';
    }
    /** 実 APSF が利用可能か（APSF_ROOT の runs/ が実在するか） */
    isAvailable() {
        return (this.apsfRoot.length > 0 &&
            fs.existsSync(path.join(this.apsfRoot, 'runs')));
    }
    /**
     * runs/ 配下の run 一覧を取得
     * （実 APSF の配置: runs/ 直下、runs/fw-improvement/, runs/work/）
     */
    listRuns() {
        if (!this.isAvailable())
            return [];
        const runsDir = path.join(this.apsfRoot, 'runs');
        const isRunName = (name) => /^\d{4}-\d{2}-\d{2}/.test(name);
        const results = [];
        for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
            if (!entry.isDirectory())
                continue;
            if (isRunName(entry.name)) {
                results.push(entry.name);
            }
            else if (['fw-improvement', 'work'].includes(entry.name)) {
                const sub = path.join(runsDir, entry.name);
                for (const child of fs.readdirSync(sub, { withFileTypes: true })) {
                    if (child.isDirectory() && isRunName(child.name)) {
                        results.push(child.name);
                    }
                }
            }
        }
        return results.sort();
    }
    /**
     * 現在フェーズを取得（TS ネイティブ検出）
     */
    async getPhase(runName) {
        return this.getPhaseInfo(runName).phase;
    }
    /** フェーズ + メタ情報（next role / 読み書きファイル / human 判定） */
    getPhaseInfo(runName) {
        const runDir = resolveRunDir(this.apsfRoot, runName);
        if (!runDir) {
            throw new Error(`Run not found: ${runName}`);
        }
        return new PhaseDetector(runDir).detect();
    }
    /** run ディレクトリの絶対パス */
    getRunDir(runName) {
        return resolveRunDir(this.apsfRoot, runName);
    }
    /** run の対象プロジェクト（run_config.json の target_workdir、無指定は APSF_ROOT） */
    getTargetWorkdir(runName) {
        const runDir = resolveRunDir(this.apsfRoot, runName);
        if (runDir) {
            const p = path.join(runDir, 'run_config.json');
            try {
                if (fs.existsSync(p)) {
                    const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
                    if (cfg.target_workdir && fs.existsSync(cfg.target_workdir))
                        return cfg.target_workdir;
                }
            }
            catch { /* fall through */ }
        }
        return this.apsfRoot;
    }
    /**
     * run に実在する読み取り可能な成果物ファイル一覧（成果物ビューア用）。
     */
    listArtifacts(runName) {
        this.assertRunName(runName);
        const runDir = resolveRunDir(this.apsfRoot, runName);
        if (!runDir)
            throw new Error(`Run not found: ${runName}`);
        return PHASE_FILES.filter((f) => fs.existsSync(path.join(runDir, f)));
    }
    /** run_state.json の実行ステータス（failed 表示・回復 UI 用） */
    getRunStateMeta(runName) {
        this.assertRunName(runName);
        const runDir = resolveRunDir(this.apsfRoot, runName);
        if (!runDir)
            throw new Error(`Run not found: ${runName}`);
        const state = loadRunState(runDir);
        return {
            phaseStatus: state?.phase_status ?? 'pending',
            lastError: state?.last_error ?? '',
        };
    }
    /**
     * 実 APSF run を実行し、進捗を StreamEvent で配信する（TS ネイティブ）
     */
    async execute(request) {
        if (!this.isAvailable()) {
            this.emitError(request.runId, 'APSF framework not available. Set APSF_ROOT to the framework repository.');
            return;
        }
        if (!RUN_NAME_RE.test(request.runId)) {
            this.emitError(request.runId, `Invalid run name: ${request.runId}`);
            return;
        }
        const specialistError = validateExecuteSpecialists(request.specialists);
        if (specialistError) {
            this.emitError(request.runId, specialistError);
            return;
        }
        enqueue({ request, emitter: this, apsfRoot: this.apsfRoot });
    }
    emitError(runId, message) {
        this.emit('event', {
            type: 'error',
            runId,
            timestamp: Date.now(),
            data: { error: message },
        });
    }
    /** 実行中の処理をキャンセル（待機列からの除去も含む） */
    cancelExecution(runId) {
        cancelExecution(runId);
    }
    /** 実行中 + 待機中の run 一覧 */
    listExecuting() {
        return listExecuting();
    }
    /** キュー状態（GET /api/runs/queue） */
    getQueueState() {
        return getQueueState();
    }
    // ── Run 作成・phase ファイル・advisory ─────────────────────────
    /** phase ファイル名の検証（パストラバーサル防止のホワイトリスト） */
    assertPhaseFile(filename) {
        if (!PHASE_FILES.includes(filename)) {
            throw new Error(`Not a phase file: ${filename}`);
        }
    }
    assertRunName(runName) {
        if (!RUN_NAME_RE.test(runName)) {
            throw new Error(`Invalid run name: ${runName}. ` +
                'Expected format: YYYY-MM-DD_topic (e.g. 2026-07-10_fix-readme-typo).');
        }
    }
    /**
     * 新しい run を作成（TS ネイティブ run-store）
     */
    async createRun(runName, options = {}) {
        this.assertRunName(runName);
        if (options.taxonomy && !['fw-improvement', 'work'].includes(options.taxonomy)) {
            throw new Error(`Invalid taxonomy: ${options.taxonomy}`);
        }
        // workdir は run 作成前に検証する（半端な run を残さない）
        let workdir;
        if (options.workdir) {
            workdir = path.resolve(options.workdir);
            if (!fs.existsSync(workdir) || !fs.statSync(workdir).isDirectory()) {
                throw new Error(`workdir does not exist or is not a directory: ${options.workdir}`);
            }
        }
        startRun(this.apsfRoot, runName, {
            light: options.light,
            taxonomy: options.taxonomy,
        });
        if (workdir) {
            const runDir = resolveRunDir(this.apsfRoot, runName);
            if (runDir) {
                fs.writeFileSync(path.join(runDir, 'run_config.json'), JSON.stringify({ target_workdir: workdir }, null, 2), 'utf-8');
            }
        }
    }
    /** phase ファイルの内容を読む（存在しなければ null） */
    readPhaseFile(runName, filename) {
        this.assertRunName(runName);
        this.assertPhaseFile(filename);
        const runDir = resolveRunDir(this.apsfRoot, runName);
        if (!runDir)
            throw new Error(`Run not found: ${runName}`);
        const p = path.join(runDir, filename);
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
    }
    /**
     * 現在フェーズの対象ファイルに内容を保存
     *
     * API 層ガード（core write-phase は Python parity のため無検証のまま）:
     * - options.filename が現 phase の書き込み先と食い違えば PhaseFileMismatchError（409）
     * - auto-owned phase への手動書き込みは allowAutoOwned 必須（AutoOwnedPhaseError, 403）
     * - force / forceReason は上書き保護の解除としてそのまま core へ渡す
     */
    async writePhase(runName, content, options = {}) {
        this.assertRunName(runName);
        const runDir = resolveRunDir(this.apsfRoot, runName);
        if (!runDir)
            throw new Error(`Run not found: ${runName}`);
        const target = resolveWriteTarget(runDir);
        if (target) {
            if (options.filename && options.filename !== target.file) {
                throw new PhaseFileMismatchError(`Phase moved on: current phase ${target.phase} writes ${target.file}, ` +
                    `not ${options.filename}. Nothing saved — reload the run and retry.`);
            }
            if (!isHumanPhase(target.phase) && !options.allowAutoOwned) {
                throw new AutoOwnedPhaseError(`${target.file} is owned by ${target.role} (auto phase ${target.phase}). ` +
                    'Set allowAutoOwned to write it manually.');
            }
        }
        const result = nativeWritePhase(runDir, content, {
            force: options.force,
            forceReason: options.forceReason,
        });
        return { fileWritten: result.fileWritten, phase: result.phaseAfter };
    }
    /**
     * Judge 裁定（Accept / Return to Build / Return to Plan）を適用する。
     */
    judgeDecision(runName, decision, reason) {
        this.assertRunName(runName);
        const runDir = resolveRunDir(this.apsfRoot, runName);
        if (!runDir)
            throw new Error(`Run not found: ${runName}`);
        if (listExecuting().includes(runName)) {
            throw new Error(`Run ${runName} is currently executing or queued. Wait for completion or cancel first.`);
        }
        return applyJudgeDecision(runDir, decision, reason);
    }
    /** 過去の実行トランスクリプト一覧（新しい順） */
    listExecutions(runName) {
        this.assertRunName(runName);
        const runDir = resolveRunDir(this.apsfRoot, runName);
        if (!runDir)
            throw new Error(`Run not found: ${runName}`);
        return listTranscripts(runDir);
    }
    /** 実行トランスクリプトの読み出し */
    readExecution(runName, filename) {
        this.assertRunName(runName);
        const runDir = resolveRunDir(this.apsfRoot, runName);
        if (!runDir)
            throw new Error(`Run not found: ${runName}`);
        return readTranscript(runDir, filename);
    }
    /** judge_advisory.json を読む（存在しなければ null） */
    getAdvisory(runName) {
        this.assertRunName(runName);
        const runDir = resolveRunDir(this.apsfRoot, runName);
        if (!runDir)
            throw new Error(`Run not found: ${runName}`);
        const p = path.join(runDir, 'judge_advisory.json');
        if (!fs.existsSync(p))
            return null;
        try {
            return JSON.parse(fs.readFileSync(p, 'utf-8'));
        }
        catch {
            return null;
        }
    }
}
