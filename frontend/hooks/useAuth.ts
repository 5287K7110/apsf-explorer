import { useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { authAPI } from '../services/authAPI';
import { LoginRequest } from '../types/auth';
import { authStorage } from '../utils/localStorage';

export function useAuth() {
  const { user, token, loading, error, setUser, setToken, setLoading, setError, logout } =
    useAuthStore();

  const login = useCallback(async (credentials: LoginRequest) => {
    setLoading(true);
    setError(null);

    try {
      const response = await authAPI.login(credentials);
      // authAPI.login() already saves token via apiClient.setToken()
      // and storage.authStorage.saveToken()

      setUser(response.user);
      setToken(response.token);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [setUser, setToken, setLoading, setError]);

  const register = useCallback(async (email: string, password: string, name: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await authAPI.register({ email, password, name });
      setUser(response.user);
      setToken(response.token);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [setUser, setToken, setLoading, setError]);

  const handleLogout = useCallback(async () => {
    try {
      await authAPI.logout();
    } catch (err) {
      console.error('Logout API error:', err);
    } finally {
      logout(); // Clear local state and storage
    }
  }, [logout]);

  const checkAuth = useCallback(async () => {
    const storedToken = authStorage.getToken();
    if (!storedToken) return false;

    try {
      const user = await authAPI.getCurrentUser();
      if (user) {
        setUser(user);
        setToken(storedToken);
        return true;
      }
      return false;
    } catch (err) {
      logout();
      return false;
    }
  }, [setUser, setToken, logout]);

  return {
    user,
    token,
    loading,
    error,
    login,
    register,
    logout: handleLogout,
    checkAuth,
    isAuthenticated: !!token,
  };
}
