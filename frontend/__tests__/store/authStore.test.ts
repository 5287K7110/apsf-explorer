import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../../store/authStore';

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset store state
    const store = useAuthStore();
    store.logout();
  });

  it('should initialize with null values', () => {
    const store = useAuthStore();

    expect(store.user).toBeNull();
    expect(store.token).toBeNull();
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('should set user', () => {
    const store = useAuthStore();
    const user = { id: '1', email: 'test@example.com', name: 'Test User' };

    store.setUser(user);

    expect(store.user).toEqual(user);
  });

  it('should set token', () => {
    const store = useAuthStore();

    store.setToken('jwt-token');

    expect(store.token).toBe('jwt-token');
  });

  it('should set loading state', () => {
    const store = useAuthStore();

    store.setLoading(true);
    expect(store.loading).toBe(true);

    store.setLoading(false);
    expect(store.loading).toBe(false);
  });

  it('should set error', () => {
    const store = useAuthStore();

    store.setError('Login failed');
    expect(store.error).toBe('Login failed');

    store.setError(null);
    expect(store.error).toBeNull();
  });

  it('should logout and clear everything', () => {
    const store = useAuthStore();

    // Set some state
    store.setUser({ id: '1', email: 'test@example.com', name: 'Test' });
    store.setToken('jwt-token');
    store.setError('Some error');

    // Logout
    store.logout();

    expect(store.user).toBeNull();
    expect(store.token).toBeNull();
    expect(store.error).toBeNull();
  });

  it('should clear localStorage on logout', () => {
    const store = useAuthStore();
    store.setUser({ id: '1', email: 'test@example.com', name: 'Test' });
    store.setToken('jwt-token');

    store.logout();

    expect(localStorage.getItem('authToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('should handle multiple updates', () => {
    const store = useAuthStore();
    const user1 = { id: '1', email: 'user1@example.com', name: 'User 1' };
    const user2 = { id: '2', email: 'user2@example.com', name: 'User 2' };

    store.setUser(user1);
    expect(store.user).toEqual(user1);

    store.setUser(user2);
    expect(store.user).toEqual(user2);
  });

  it('should set user to null', () => {
    const store = useAuthStore();
    store.setUser({ id: '1', email: 'test@example.com', name: 'Test' });

    store.setUser(null);

    expect(store.user).toBeNull();
  });

  it('should set token to null', () => {
    const store = useAuthStore();
    store.setToken('jwt-token');

    store.setToken(null);

    expect(store.token).toBeNull();
  });
});
