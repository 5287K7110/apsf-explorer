import { DEFAULT_MODES } from '../types/execution-mode.js';
import { CLIFullExecutor } from '../executors/cli-full-executor.js';
import { CLILiteExecutor } from '../executors/cli-lite-executor.js';
import { APIExecutor } from '../executors/api-executor.js';
import { APSFRunBridge } from './apsf-run-bridge.service.js';
import { EventEmitter } from 'events';
import { execSync } from 'child_process';
export class ExecutionModeRouter extends EventEmitter {
    constructor(defaultMode = 'cli-full') {
        super();
        this.config = DEFAULT_MODES;
        this.currentMode = defaultMode;
    }
    setMode(mode) {
        if (!this.config[mode]) {
            throw new Error(`Unknown execution mode: ${mode}`);
        }
        this.currentMode = mode;
        console.log(`✅ Execution mode set to: ${mode}`);
    }
    getConfig(mode) {
        const targetMode = mode || this.currentMode;
        return this.config[targetMode];
    }
    getExecutor(request) {
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
    getAvailableModes() {
        const available = [];
        if (this.isCliAvailable()) {
            available.push('cli-full', 'cli-lite');
        }
        if (new APSFRunBridge().isAvailable()) {
            available.push('apsf-run');
        }
        return available;
    }
    isCliAvailable() {
        try {
            const checkCmd = process.platform === 'win32' ? 'where' : 'which';
            try {
                execSync(`${checkCmd} claude`, { stdio: 'pipe' });
                return true;
            }
            catch { }
            try {
                execSync(`${checkCmd} codex`, { stdio: 'pipe' });
                return true;
            }
            catch { }
            try {
                execSync(`${checkCmd} gemini`, { stdio: 'pipe' });
                return true;
            }
            catch { }
            return false;
        }
        catch {
            return false;
        }
    }
    isApiAvailable() {
        return false;
    }
}
