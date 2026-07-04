import { EventEmitter } from 'events';
import { ExecuteRequest, StreamEvent } from '../types/index.js';
import { ExecutionModeConfig } from '../types/execution-mode.js';

/**
 * API Executor（将来実装）
 * - Claude API / OpenAI API を直接呼び出し
 * - CLI インストール不要
 * - Artifact 保存可能
 */
export class APIExecutor extends EventEmitter {
  private config: ExecutionModeConfig;

  constructor(config: ExecutionModeConfig) {
    super();
    this.config = config;
  }

  async execute(request: ExecuteRequest): Promise<void> {
    console.log(`[API] Mode not yet implemented`);

    this.emit('error', {
      type: 'error',
      runId: request.runId,
      data: {
        error: 'API mode coming in v2.0',
        note: 'Please use cli-full or cli-lite mode',
      },
    } as StreamEvent);

    throw new Error('API mode coming in v2.0');

    // 将来実装：
    // switch (request.provider) {
    //   case 'claude':
    //     await this.executeWithAnthropicAPI(request);
    //     break;
    //   case 'codex':
    //     await this.executeWithOpenAIAPI(request);
    //     break;
    // }
  }

  // private async executeWithAnthropicAPI(request: ExecuteRequest): Promise<void> {
  //   // Anthropic SDK を使用
  //   // const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  //   // const response = await client.messages.create({...});
  // }

  // private async executeWithOpenAIAPI(request: ExecuteRequest): Promise<void> {
  //   // OpenAI SDK を使用
  //   // const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  //   // const response = await client.chat.completions.create({...});
  // }
}
