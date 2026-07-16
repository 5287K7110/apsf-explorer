import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth } from '../../hooks/useAuth';
import * as authAPI from '../../services/authAPI';
import { authStorage } from '../../utils/localStorage';
import { useAuthStore } from '../../store/authStore';

// Mock authAPI
vi.mock('../../services/authAPI', () => ({
  authAPI: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}));

describe('useAuth hook', () => {
  const initialAuthState = useAuthStore.getState();

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // authStore はシングルトンのため、前のテストのログイン状態が漏れる
    useAuthStore.setState(initialAuthState, true);
  });

  it('should initialize with null values', () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  describe('login', () => {
    it('should login successfully', async () => {
      const mockUser = { id: '1', email: 'test@example.com', name: 'Test User' };
      const mockToken = 'jwt-token';

      vi.mocked(authAPI.authAPI.login).mockResolvedValueOnce({
        user: mockUser,
        token: mockToken,
        refreshToken: 'refresh-token',
      } as any);

      const { result } = renderHook(() => useAuth());

      let loginResult = false;
      await act(async () => {
        loginResult = await result.current.login({
          email: 'test@example.com',
          password: 'password',
        });
      });

      expect(loginResult).toBe(true);
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.token).toBe(mockToken);
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('should handle login error', async () => {
      vi.mocked(authAPI.authAPI.login).mockRejectedValueOnce(
        new Error('Invalid credentials')
      );

      const { result } = renderHook(() => useAuth());

      let loginResult = false;
      await act(async () => {
        loginResult = await result.current.login({
          email: 'test@example.com',
          password: 'wrong',
        });
      });

      expect(loginResult).toBe(false);
      expect(result.current.error).toBe('Invalid credentials');
      expect(result.current.user).toBeNull();
    });

    it('should set loading state during login', async () => {
      vi.mocked(authAPI.authAPI.login).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  user: { id: '1' },
                  token: 'token',
                  refreshToken: 'refresh',
                } as any),
              100
            )
          )
      );

      const { result } = renderHook(() => useAuth());

      expect(result.current.loading).toBe(false);

      act(() => {
        result.current.login({ email: 'test@example.com', password: 'password' });
      });

      expect(result.current.loading).toBe(true);

      // Wait for promise
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(result.current.loading).toBe(false);
    });

    it('should clear previous error on login', async () => {
      vi.mocked(authAPI.authAPI.login)
        .mockRejectedValueOnce(new Error('First error'))
        .mockResolvedValueOnce({
          user: { id: '1' },
          token: 'token',
          refreshToken: 'refresh',
        } as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'wrong' });
      });

      expect(result.current.error).toBe('First error');

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'correct' });
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('register', () => {
    it('should register successfully', async () => {
      const mockUser = { id: '1', email: 'new@example.com', name: 'New User' };
      const mockToken = 'jwt-token';

      vi.mocked(authAPI.authAPI.register).mockResolvedValueOnce({
        user: mockUser,
        token: mockToken,
        refreshToken: 'refresh-token',
      } as any);

      const { result } = renderHook(() => useAuth());

      let registerResult = false;
      await act(async () => {
        registerResult = await result.current.register(
          'new@example.com',
          'password',
          'New User'
        );
      });

      expect(registerResult).toBe(true);
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.token).toBe(mockToken);
    });

    it('should handle registration error', async () => {
      vi.mocked(authAPI.authAPI.register).mockRejectedValueOnce(
        new Error('Email already exists')
      );

      const { result } = renderHook(() => useAuth());

      let registerResult = false;
      await act(async () => {
        registerResult = await result.current.register(
          'existing@example.com',
          'password',
          'User'
        );
      });

      expect(registerResult).toBe(false);
      expect(result.current.error).toBe('Email already exists');
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      vi.mocked(authAPI.authAPI.logout).mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useAuth());

      // First login
      vi.mocked(authAPI.authAPI.login).mockResolvedValueOnce({
        user: { id: '1' },
        token: 'token',
        refreshToken: 'refresh',
      } as any);

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'password' });
      });

      expect(result.current.isAuthenticated).toBe(true);

      // Then logout
      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should clear local state even if API fails', async () => {
      vi.mocked(authAPI.authAPI.logout).mockRejectedValueOnce(new Error('API error'));

      const { result } = renderHook(() => useAuth());

      vi.mocked(authAPI.authAPI.login).mockResolvedValueOnce({
        user: { id: '1' },
        token: 'token',
        refreshToken: 'refresh',
      } as any);

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'password' });
      });

      await act(async () => {
        await result.current.logout();
      });

      // State should be cleared despite API error
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('checkAuth', () => {
    it('should check auth with valid token', async () => {
      const mockUser = { id: '1', email: 'test@example.com' };
      authStorage.saveToken('valid-token', 'refresh-token');

      vi.mocked(authAPI.authAPI.getCurrentUser).mockResolvedValueOnce(
        mockUser as any
      );

      const { result } = renderHook(() => useAuth());

      let checkResult = false;
      await act(async () => {
        checkResult = await result.current.checkAuth();
      });

      expect(checkResult).toBe(true);
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('should return false if no token stored', async () => {
      const { result } = renderHook(() => useAuth());

      let checkResult = true;
      await act(async () => {
        checkResult = await result.current.checkAuth();
      });

      expect(checkResult).toBe(false);
    });

    it('should logout if getCurrentUser fails', async () => {
      authStorage.saveToken('invalid-token', 'refresh-token');

      vi.mocked(authAPI.authAPI.getCurrentUser).mockRejectedValueOnce(
        new Error('Unauthorized')
      );

      const { result } = renderHook(() => useAuth());

      let checkResult = false;
      await act(async () => {
        checkResult = await result.current.checkAuth();
      });

      expect(checkResult).toBe(false);
      expect(result.current.isAuthenticated).toBe(false);
    });
  });
});
