// localStorage utilities with type safety
import type { User } from '../types/auth';

export const storage = {
  setItem<T>(key: string, value: T) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.error(`Failed to set localStorage item ${key}:`, err);
    }
  },

  getItem<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) as T : null;
    } catch (err) {
      console.error(`Failed to get localStorage item ${key}:`, err);
      return null;
    }
  },

  removeItem(key: string) {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.error(`Failed to remove localStorage item ${key}:`, err);
    }
  },

  clear() {
    try {
      localStorage.clear();
    } catch (err) {
      console.error('Failed to clear localStorage:', err);
    }
  },
};

// Auth storage
export const authStorage = {
  saveToken(token: string, refreshToken: string) {
    storage.setItem('authToken', token);
    storage.setItem('refreshToken', refreshToken);
  },

  getToken(): string | null {
    return storage.getItem<string>('authToken');
  },

  getRefreshToken(): string | null {
    return storage.getItem<string>('refreshToken');
  },

  clearAuth() {
    storage.removeItem('authToken');
    storage.removeItem('refreshToken');
    storage.removeItem('user');
  },

  saveUser(user: User) {
    storage.setItem('user', user);
  },

  getUser(): User | null {
    return storage.getItem<User>('user');
  },
};

// Run storage
export const runStorage = {
  saveRuns<T>(runs: T[]) {
    storage.setItem('apsf:runs', runs);
  },

  getRuns() {
    return storage.getItem<unknown[]>('apsf:runs') || [];
  },

  saveRunDetail<T>(runId: string, run: T) {
    storage.setItem(`apsf:run:${runId}`, run);
  },

  getRunDetail(runId: string) {
    return storage.getItem<unknown>(`apsf:run:${runId}`);
  },

  clearRuns() {
    storage.removeItem('apsf:runs');
  },

  saveRunPreferences<T>(prefs: T) {
    storage.setItem('runPreferences', prefs);
  },

  getRunPreferences() {
    return storage.getItem('runPreferences');
  },

  saveSelectedRunId(runId: string) {
    storage.setItem('selectedRunId', runId);
  },

  getSelectedRunId(): string | null {
    return storage.getItem<string>('selectedRunId');
  },
};

// Preferences storage
export const preferencesStorage = {
  saveTheme(theme: 'dark' | 'light') {
    storage.setItem('theme', theme);
  },

  getTheme(): 'dark' | 'light' {
    return storage.getItem<'dark' | 'light'>('theme') || 'dark';
  },

  saveSidebarState(open: boolean) {
    storage.setItem('sidebarOpen', open);
  },

  getSidebarState(): boolean {
    return storage.getItem<boolean>('sidebarOpen') ?? true;
  },
};
