import { describe, it, expect, beforeEach } from 'vitest';
import { storage, authStorage, runStorage, preferencesStorage } from '../../utils/localStorage';

describe('storage utilities', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('storage.setItem and getItem', () => {
    it('should set and get string items', () => {
      storage.setItem('key', 'value');
      expect(storage.getItem('key')).toBe('value');
    });

    it('should set and get object items', () => {
      const obj = { name: 'test', age: 30 };
      storage.setItem('obj', obj);
      expect(storage.getItem('obj')).toEqual(obj);
    });

    it('should set and get array items', () => {
      const arr = [1, 2, 3, 4, 5];
      storage.setItem('arr', arr);
      expect(storage.getItem('arr')).toEqual(arr);
    });

    it('should return null for non-existent items', () => {
      expect(storage.getItem('nonexistent')).toBeNull();
    });

    it('should handle JSON serialization', () => {
      const data = { nested: { deep: { value: 'test' } } };
      storage.setItem('nested', data);
      const retrieved = storage.getItem('nested');
      expect(retrieved).toEqual(data);
    });
  });

  describe('storage.removeItem', () => {
    it('should remove items', () => {
      storage.setItem('key', 'value');
      expect(storage.getItem('key')).toBe('value');
      storage.removeItem('key');
      expect(storage.getItem('key')).toBeNull();
    });

    it('should not throw when removing non-existent items', () => {
      expect(() => storage.removeItem('nonexistent')).not.toThrow();
    });
  });

  describe('storage.clear', () => {
    it('should clear all items', () => {
      storage.setItem('key1', 'value1');
      storage.setItem('key2', 'value2');
      storage.clear();
      expect(storage.getItem('key1')).toBeNull();
      expect(storage.getItem('key2')).toBeNull();
    });
  });

  describe('authStorage', () => {
    it('should save and get token', () => {
      authStorage.saveToken('test-token', 'test-refresh');
      expect(authStorage.getToken()).toBe('test-token');
    });

    it('should save and get refresh token', () => {
      authStorage.saveToken('test-token', 'test-refresh');
      expect(authStorage.getRefreshToken()).toBe('test-refresh');
    });

    it('should save and get user', () => {
      const user = { id: '1', email: 'test@example.com', name: 'Test User', role: 'user' as const };
      authStorage.saveUser(user);
      expect(authStorage.getUser()).toEqual(user);
    });

    it('should clear auth on logout', () => {
      authStorage.saveToken('token', 'refresh');
      authStorage.saveUser({ id: '1', email: 'a@b.c', name: 'A', role: 'user' as const });
      authStorage.clearAuth();

      expect(authStorage.getToken()).toBeNull();
      expect(authStorage.getRefreshToken()).toBeNull();
      expect(authStorage.getUser()).toBeNull();
    });
  });

  describe('runStorage', () => {
    it('should save and get runs', () => {
      const runs = [
        { id: '1', status: 'completed' },
        { id: '2', status: 'running' },
      ];
      runStorage.saveRuns(runs);
      expect(runStorage.getRuns()).toEqual(runs);
    });

    it('should return empty array when no runs saved', () => {
      expect(runStorage.getRuns()).toEqual([]);
    });

    it('should save and get run detail', () => {
      const run = { id: '1', status: 'running', phase: 'planning' };
      runStorage.saveRunDetail('1', run);
      expect(runStorage.getRunDetail('1')).toEqual(run);
    });

    it('should save and get run preferences', () => {
      const prefs = { theme: 'dark', autoRefresh: true };
      runStorage.saveRunPreferences(prefs);
      expect(runStorage.getRunPreferences()).toEqual(prefs);
    });

    it('should save and get selected run id', () => {
      runStorage.saveSelectedRunId('run-123');
      expect(runStorage.getSelectedRunId()).toBe('run-123');
    });

    it('should clear all runs', () => {
      const runs = [{ id: '1' }];
      runStorage.saveRuns(runs);
      runStorage.clearRuns();
      expect(runStorage.getRuns()).toEqual([]);
    });
  });

  describe('preferencesStorage', () => {
    it('should save and get theme', () => {
      preferencesStorage.saveTheme('light');
      expect(preferencesStorage.getTheme()).toBe('light');
    });

    it('should default to dark theme', () => {
      expect(preferencesStorage.getTheme()).toBe('dark');
    });

    it('should save and get sidebar state', () => {
      preferencesStorage.saveSidebarState(false);
      expect(preferencesStorage.getSidebarState()).toBe(false);
    });

    it('should default sidebar to open', () => {
      expect(preferencesStorage.getSidebarState()).toBe(true);
    });
  });
});
