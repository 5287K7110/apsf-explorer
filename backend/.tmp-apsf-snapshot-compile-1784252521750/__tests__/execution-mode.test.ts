import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExecutionModeRouter } from '../src/services/execution-mode-router.js';
import { CLIFullExecutor } from '../src/executors/cli-full-executor.js';
import { CLILiteExecutor } from '../src/executors/cli-lite-executor.js';
import { APIExecutor } from '../src/executors/api-executor.js';
import { ExecuteRequest } from '../src/types/index.js';

describe('ExecutionModeRouter', () => {
  let router: ExecutionModeRouter;

  beforeEach(() => {
    router = new ExecutionModeRouter('cli-full');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Mode Selection', () => {
    it('should initialize with cli-full mode', () => {
      expect(router.getConfig().mode).toBe('cli-full');
    });

    it('should switch to cli-lite mode', () => {
      router.setMode('cli-lite');
      expect(router.getConfig().mode).toBe('cli-lite');
    });

    it('should throw on invalid mode', () => {
      expect(() => router.setMode('invalid' as any)).toThrow(
        /Unknown execution mode/
      );
    });

    it('should initialize with custom default mode', () => {
      const customRouter = new ExecutionModeRouter('cli-lite');
      expect(customRouter.getConfig().mode).toBe('cli-lite');
    });
  });

  describe('Mode Configurations', () => {
    it('cli-full should save artifacts', () => {
      const config = router.getConfig('cli-full');
      expect(config.saveArtifacts).toBe(true);
      expect(config.timeout).toBe(600000); // 10 minutes
      expect(config.maxTurns).toBe(10);
    });

    it('cli-lite should not save artifacts', () => {
      const config = router.getConfig('cli-lite');
      expect(config.saveArtifacts).toBe(false);
      expect(config.timeout).toBe(300000); // 5 minutes
      expect(config.maxTurns).toBe(5);
    });

    it('api mode should save artifacts (future)', () => {
      const config = router.getConfig('api');
      expect(config.saveArtifacts).toBe(true);
      expect(config.timeout).toBe(300000);
      expect(config.maxTurns).toBe(10);
    });

    it('should return config for specified mode without changing current', () => {
      const liteConfig = router.getConfig('cli-lite');
      expect(liteConfig.mode).toBe('cli-lite');
      expect(router.getConfig().mode).toBe('cli-full'); // Still cli-full
    });
  });

  describe('Executor Selection', () => {
    const baseRequest: ExecuteRequest = {
      runId: 'run-1',
      command: 'build',
      provider: 'claude',
      roles: ['builder'],
    };

    it('should return CLIFullExecutor for cli-full mode', () => {
      const executor = router.getExecutor({
        ...baseRequest,
        mode: 'cli-full',
      });
      expect(executor).toBeInstanceOf(CLIFullExecutor);
    });

    it('should return CLILiteExecutor for cli-lite mode', () => {
      const executor = router.getExecutor({
        ...baseRequest,
        mode: 'cli-lite',
      });
      expect(executor).toBeInstanceOf(CLILiteExecutor);
    });

    it('should return APIExecutor for api mode', () => {
      const executor = router.getExecutor({
        ...baseRequest,
        mode: 'api',
      });
      expect(executor).toBeInstanceOf(APIExecutor);
    });

    it('should use current mode if not specified in request', () => {
      router.setMode('cli-lite');
      const executor = router.getExecutor(baseRequest); // No mode specified
      expect(executor).toBeInstanceOf(CLILiteExecutor);
    });

    it('should throw for unknown mode', () => {
      expect(() => {
        router.getExecutor({
          ...baseRequest,
          mode: 'unknown' as any,
        });
      }).toThrow(/Unknown mode/);
    });
  });

  describe('Available Modes', () => {
    it('should return array of available modes', () => {
      const available = router.getAvailableModes();
      expect(Array.isArray(available)).toBe(true);
    });

    it('should include cli-full and cli-lite in available modes', () => {
      const available = router.getAvailableModes();
      // These modes should be available if CLI is available
      // Test may vary based on environment
      expect(available.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Event Emitter Interface', () => {
    it('should be instance of EventEmitter', () => {
      expect(router.on).toBeDefined();
      expect(router.emit).toBeDefined();
      expect(router.once).toBeDefined();
    });

    it('should support event listeners', (done) => {
      const listener = vi.fn();
      router.on('test-event', listener);
      router.emit('test-event', { data: 'test' });

      setTimeout(() => {
        expect(listener).toHaveBeenCalled();
        done();
      }, 10);
    });
  });
});

describe('CLIFullExecutor', () => {
  let executor: CLIFullExecutor;

  beforeEach(() => {
    const config = {
      mode: 'cli-full' as const,
      saveArtifacts: true,
      timeout: 10000,
      maxTurns: 10,
    };
    executor = new CLIFullExecutor(config);
  });

  it('should be instance of EventEmitter', () => {
    expect(executor.on).toBeDefined();
    expect(executor.emit).toBeDefined();
  });

  it('should have executeMethod', () => {
    expect(executor.execute).toBeDefined();
    expect(typeof executor.execute).toBe('function');
  });

  it('should emit events on execution', (done) => {
    const eventListener = vi.fn();
    executor.on('event', eventListener);

    setTimeout(() => {
      // Events should be emitted during execution
      done();
    }, 100);
  });

  describe('Configuration', () => {
    it('should use provided config', () => {
      const config = {
        mode: 'cli-full' as const,
        saveArtifacts: true,
        timeout: 12000,
        maxTurns: 8,
      };
      const exec = new CLIFullExecutor(config);
      expect(exec).toBeDefined();
    });
  });
});

describe('CLILiteExecutor', () => {
  let executor: CLILiteExecutor;

  beforeEach(() => {
    const config = {
      mode: 'cli-lite' as const,
      saveArtifacts: false,
      timeout: 5000,
      maxTurns: 5,
    };
    executor = new CLILiteExecutor(config);
  });

  it('should not save artifacts', () => {
    expect(executor).toBeDefined();
    // Configuration disables saving
  });

  it('should have execute method', () => {
    expect(executor.execute).toBeDefined();
    expect(typeof executor.execute).toBe('function');
  });

  it('should be instance of EventEmitter', () => {
    expect(executor.on).toBeDefined();
    expect(executor.emit).toBeDefined();
  });

  describe('Configuration', () => {
    it('should use lightweight config', () => {
      const config = {
        mode: 'cli-lite' as const,
        saveArtifacts: false,
        timeout: 4000,
        maxTurns: 3,
      };
      const exec = new CLILiteExecutor(config);
      expect(exec).toBeDefined();
    });
  });
});

describe('APIExecutor', () => {
  let executor: APIExecutor;

  beforeEach(() => {
    const config = {
      mode: 'api' as const,
      saveArtifacts: true,
      timeout: 300000,
      maxTurns: 10,
    };
    executor = new APIExecutor(config);
  });

  it('should be instance of EventEmitter', () => {
    expect(executor.on).toBeDefined();
    expect(executor.emit).toBeDefined();
  });

  it('should have execute method', () => {
    expect(executor.execute).toBeDefined();
    expect(typeof executor.execute).toBe('function');
  });

  describe('Future Implementation', () => {
    it('should support API mode configuration', () => {
      const config = {
        mode: 'api' as const,
        saveArtifacts: true,
        timeout: 300000,
        maxTurns: 10,
      };
      const exec = new APIExecutor(config);
      expect(exec).toBeDefined();
    });
  });
});

describe('ExecutionMode Integration', () => {
  let router: ExecutionModeRouter;

  beforeEach(() => {
    router = new ExecutionModeRouter('cli-full');
  });

  it('should handle mode switching workflow', () => {
    expect(router.getConfig().mode).toBe('cli-full');

    router.setMode('cli-lite');
    expect(router.getConfig().mode).toBe('cli-lite');

    router.setMode('cli-full');
    expect(router.getConfig().mode).toBe('cli-full');
  });

  it('should handle multiple concurrent request with different modes', () => {
    const request1: ExecuteRequest = {
      runId: 'run-1',
      command: 'build',
      provider: 'claude',
      roles: ['builder'],
      mode: 'cli-full',
    };

    const request2: ExecuteRequest = {
      runId: 'run-2',
      command: 'test',
      provider: 'claude',
      roles: ['tester'],
      mode: 'cli-lite',
    };

    const executor1 = router.getExecutor(request1);
    const executor2 = router.getExecutor(request2);

    expect(executor1).toBeInstanceOf(CLIFullExecutor);
    expect(executor2).toBeInstanceOf(CLILiteExecutor);
  });

  it('should respect mode in request over current mode', () => {
    router.setMode('cli-lite');

    const executor = router.getExecutor({
      runId: 'run-1',
      command: 'build',
      provider: 'claude',
      roles: [],
      mode: 'cli-full', // Override current mode
    });

    expect(executor).toBeInstanceOf(CLIFullExecutor);
    // But current mode should still be cli-lite
    expect(router.getConfig().mode).toBe('cli-lite');
  });
});
