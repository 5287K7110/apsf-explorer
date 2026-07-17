import { EventEmitter } from 'events';
export class APIExecutor extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
    }
    async execute(request) {
        console.log(`[API] Mode not yet implemented`);
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
    }
}
