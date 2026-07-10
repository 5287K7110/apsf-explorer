import { type ExecutionMode, type ExecutionModeConfig, DEFAULT_MODES } from '../types/execution-mode.js';
import { type ExecuteRequest } from '../types/index.js';
import { CLIFullExecutor } from '../executors/cli-full-executor.js';
import { CLILiteExecutor } from '../executors/cli-lite-executor.js';
import { APIExecutor } from '../executors/api-executor.js';
import { APSFRunBridge } from './apsf-run-bridge.service.js';
import { EventEmitter } from 'events';
import { execSync } from 'child_process';

/**
 * Execution Mode Router
 * リクエストに応じて適切な Executor を選択
 */
export class ExecutionModeRouter extends EventEmitter {
  private config: Record<ExecutionMode, ExecutionModeConfig>;
  private currentMode: ExecutionMode;

  constructor(defaultMode: ExecutionMode = 'cli-full') {
    super();
    this.config = DEFAULT_MODES;
    this.currentMode = defaultMode;
  }

  /**
   * 実行モードを設定
   */
  setMode(mode: ExecutionMode): void {
    if (!this.config[mode]) {
      throw new Error(`Unknown execution mode: ${mode}`);
    }
    this.currentMode = mode;
    console.log(`✅ Execution mode set to: ${mode}`);
  }

  /**
   * 現在のモード設定を取得
   */
  getConfig(mode?: ExecutionMode): ExecutionModeConfig {
    const targetMode = mode || this.currentMode;
    return this.config[targetMode];
  }

  /**
   * リクエストに応じた Executor を取得
   */
  getExecutor(request: ExecuteRequest) {
    const mode = request.mode || this.currentMode;
    const config = this.getConfig(mode);

    console.log(`[Router] Mode: ${mode}, SaveArtifacts: ${config.saveArtifacts}`);

    switch (mode) {
      case 'cli-full':
        return new CLIFullExecutor(config);
      case 'cli-lite':
        return new CLILiteExecutor(config);
      case 'api':
        return new APIExecutor(config);
      case 'apsf-run':
        return new APSFRunBridge();
      default:
        throw new Error(`Unknown mode: ${mode}`);
    }
  }

  /**
   * 利用可能なモード一覧を取得
   */
  getAvailableModes(): ExecutionMode[] {
    const available: ExecutionMode[] = [];

    // CLI モード: claude/codex/gemini CLI が必要
    if (this.isCliAvailable()) {
      available.push('cli-full', 'cli-lite');
    }

    // 実 APSF Framework モード: APSF_ROOT が必要
    if (new APSFRunBridge().isAvailable()) {
      available.push('apsf-run');
    }

    // API モード: 今は常に false（将来実装）
    // if (this.isApiAvailable()) {
    //   available.push('api');
    // }

    return available;
  }

  /**
   * 利用可能な CLI を確認
   */
  private isCliAvailable(): boolean {
    try {
      const checkCmd = process.platform === 'win32' ? 'where' : 'which';

      // 最低 1 つの CLI があれば OK
      try {
        execSync(`${checkCmd} claude`, { stdio: 'pipe' });
        return true;
      } catch {}

      try {
        execSync(`${checkCmd} codex`, { stdio: 'pipe' });
        return true;
      } catch {}

      try {
        execSync(`${checkCmd} gemini`, { stdio: 'pipe' });
        return true;
      } catch {}

      return false;
    } catch {
      return false;
    }
  }

  /**
   * API キーの availability を確認（将来用）
   */
  private isApiAvailable(): boolean {
    // 将来: API キーがあるか確認
    // return !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
    return false;
  }
}
