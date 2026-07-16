import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../../store/authStore';

const initialAuthStoreState = useAuthStore.getState();

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState(initialAuthStoreState, true);
    localStorage.clear();
    // Reset store state
    useAuthStore.getState().logout();
  });

  it('should initialize with null values', () => {

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().loading).toBe(false);
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('should set user', () => {
    const user = { id: '1', email: 'test@example.com', name: 'Test User', role: 'user' as const };

    useAuthStore.getState().setUser(user);

    expect(useAuthStore.getState().user).toEqual(user);
  });

  it('should set token', () => {

    useAuthStore.getState().setToken('jwt-token');

    expect(useAuthStore.getState().token).toBe('jwt-token');
  });

  it('should set loading state', () => {

    useAuthStore.getState().setLoading(true);
    expect(useAuthStore.getState().loading).toBe(true);

    useAuthStore.getState().setLoading(false);
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it('should set error', () => {

    useAuthStore.getState().setError('Login failed');
    expect(useAuthStore.getState().error).toBe('Login failed');

    useAuthStore.getState().setError(null);
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('should logout and clear everything', () => {

    // Set some state
    useAuthStore.getState().setUser({ id: '1', email: 'test@example.com', name: 'Test', role: 'user' as const });
    useAuthStore.getState().setToken('jwt-token');
    useAuthStore.getState().setError('Some error');

    // Logout
    useAuthStore.getState().logout();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('should clear localStorage on logout', () => {
    useAuthStore.getState().setUser({ id: '1', email: 'test@example.com', name: 'Test', role: 'user' as const });
    useAuthStore.getState().setToken('jwt-token');

    useAuthStore.getState().logout();

    expect(localStorage.getItem('authToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('should handle multiple updates', () => {
    const user1 = { id: '1', email: 'user1@example.com', name: 'User 1', role: 'user' as const };
    const user2 = { id: '2', email: 'user2@example.com', name: 'User 2', role: 'user' as const };

    useAuthStore.getState().setUser(user1);
    expect(useAuthStore.getState().user).toEqual(user1);

    useAuthStore.getState().setUser(user2);
    expect(useAuthStore.getState().user).toEqual(user2);
  });

  it('should set user to null', () => {
    useAuthStore.getState().setUser({ id: '1', email: 'test@example.com', name: 'Test', role: 'user' as const });

    useAuthStore.getState().setUser(null);

    expect(useAuthStore.getState().user).toBeNull();
  });

  it('should set token to null', () => {
    useAuthStore.getState().setToken('jwt-token');

    useAuthStore.getState().setToken(null);

    expect(useAuthStore.getState().token).toBeNull();
  });
});
