import { EventEmitter } from 'events';
/**
 * API Executor（将来実装）
 * - Claude API / OpenAI API を直接呼び出し
 * - CLI インストール不要
 * - Artifact 保存可能
 */
export class APIExecutor extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
    }
    async execute(request) {
        console.log(`[API] Mode not yet implemented`);
        // 'event' として emit（'error' emit は未処理時にプロセスをクラッシュさせる）
        this.emit('event', {
            type: 'error',
            runId: request.runId,
            timestamp: Date.now(),
            data: {
                error: 'API mode coming in v2.0',
                note: 'Please use cli-full or cli-lite mode',
            },
        });
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
}
