import { describe, it, expect, beforeEach, vi } from 'vitest';
import { APSFBridgeService } from '../src/services/apsf-bridge.service.js';

describe('APSFBridgeService', () => {
  let service: APSFBridgeService;

  beforeEach(() => {
    service = new APSFBridgeService();
    process.env.ANTHROPIC_API_KEY = 'test-claude-key';
    process.env.OPENAI_API_KEY = 'test-codex-key';
  });

  describe('Provider Selection', () => {
    it('should validate Claude provider', () => {
      expect(() => service['validateProvider']('claude')).not.toThrow();
    });

    it('should validate Codex provider', () => {
      expect(() => service['validateProvider']('codex')).not.toThrow();
    });

    it('should throw for missing API key', () => {
      process.env.ANTHROPIC_API_KEY = '';
      expect(() => service['validateProvider']('claude')).toThrow();
    });

    it('should map claude to anthropic', () => {
      const result = service['mapProviderToAPSF']('claude');
      expect(result).toBe('anthropic');
    });

    it('should map codex to openai', () => {
      const result = service['mapProviderToAPSF']('codex');
      expect(result).toBe('openai');
    });
  });

  describe('Available Providers', () => {
    it('should return available providers', () => {
      const providers = service.getAvailableProviders();
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
    });

    it('should verify provider availability', () => {
      expect(service.isProviderAvailable('anthropic')).toBe(true);
      expect(service.isProviderAvailable('openai')).toBe(true);
    });
  });

  describe('Command Execution', () => {
    it('should build correct command args for Claude', () => {
      const request = {
        runId: 'run-1',
        command: 'plan' as const,
        provider: 'claude' as const,
        roles: ['planner', 'builder'],
      };

      const args = service['buildCommandArgs'](request, 'anthropic');

      expect(args).toContain('--provider');
      expect(args).toContain('anthropic');
      expect(args).toContain('--command');
      expect(args).toContain('plan');
      expect(args).toContain('--agents');
      expect(args).toContain('planner,builder');
    });

    it('should build correct command args for Codex', () => {
      const request = {
        runId: 'run-1',
        command: 'build' as const,
        provider: 'codex' as const,
        roles: ['builder'],
      };

      const args = service['buildCommandArgs'](request, 'openai');

      expect(args).toContain('openai');
      expect(args).toContain('build');
    });
  });
});
