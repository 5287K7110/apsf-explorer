import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authAPI } from '../../services/authAPI';
import * as apiClientModule from '../../utils/apiClient';
import { authStorage } from '../../utils/localStorage';

// Mock apiClient
vi.mock('../../utils/apiClient', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    setToken: vi.fn(),
    clearToken: vi.fn(),
  },
}));

describe('authAPI', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('should login successfully', async () => {
      const credentials = { email: 'test@example.com', password: 'password' };
      const mockResponse = {
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        user: { id: '1', email: 'test@example.com', name: 'Test User' },
      };

      vi.mocked(apiClientModule.apiClient.post).mockResolvedValueOnce(mockResponse as any);

      const result = await authAPI.login(credentials);

      expect(result).toEqual(mockResponse);
      expect(apiClientModule.apiClient.post).toHaveBeenCalledWith(
        '/auth/login',
        credentials
      );
    });

    it('should save token and user to storage', async () => {
      const mockResponse = {
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        user: { id: '1', email: 'test@example.com', name: 'Test User' },
      };

      vi.mocked(apiClientModule.apiClient.post).mockResolvedValueOnce(mockResponse as any);

      await authAPI.login({ email: 'test@example.com', password: 'password' });

      expect(authStorage.getToken()).toBe('jwt-token');
      expect(authStorage.getRefreshToken()).toBe('refresh-token');
      expect(authStorage.getUser()).toEqual(mockResponse.user);
    });

    it('should set token in API client', async () => {
      const mockResponse = {
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        user: { id: '1' },
      };

      vi.mocked(apiClientModule.apiClient.post).mockResolvedValueOnce(mockResponse as any);

      await authAPI.login({ email: 'test@example.com', password: 'password' });

      expect(apiClientModule.apiClient.setToken).toHaveBeenCalledWith('jwt-token');
    });

    it('should throw on invalid credentials', async () => {
      vi.mocked(apiClientModule.apiClient.post).mockRejectedValueOnce(
        new Error('Invalid credentials')
      );

      try {
        await authAPI.login({ email: 'test@example.com', password: 'wrong' });
        expect.fail('Should throw error');
      } catch (error: any) {
        expect(error.message).toBe('Invalid credentials');
      }
    });
  });

  describe('logout', () => {
    it('should call logout endpoint', async () => {
      authStorage.saveToken('token', 'refresh');

      vi.mocked(apiClientModule.apiClient.post).mockResolvedValueOnce(undefined);

      await authAPI.logout();

      expect(apiClientModule.apiClient.post).toHaveBeenCalledWith('/auth/logout', {});
    });

    it('should clear auth storage', async () => {
      authStorage.saveToken('token', 'refresh');
      authStorage.saveUser({ id: '1' });

      vi.mocked(apiClientModule.apiClient.post).mockResolvedValueOnce(undefined);

      await authAPI.logout();

      expect(authStorage.getToken()).toBeNull();
      expect(authStorage.getRefreshToken()).toBeNull();
      expect(authStorage.getUser()).toBeNull();
    });

    it('should clear API client token', async () => {
      vi.mocked(apiClientModule.apiClient.post).mockResolvedValueOnce(undefined);

      await authAPI.logout();

      expect(apiClientModule.apiClient.clearToken).toHaveBeenCalled();
    });

    it('should clear storage even if endpoint fails', async () => {
      authStorage.saveToken('token', 'refresh');

      vi.mocked(apiClientModule.apiClient.post).mockRejectedValueOnce(
        new Error('API error')
      );

      await authAPI.logout();

      expect(authStorage.getToken()).toBeNull();
    });
  });

  describe('register', () => {
    it('should register successfully', async () => {
      const registerData = {
        email: 'new@example.com',
        password: 'password',
        name: 'New User',
      };
      const mockResponse = {
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        user: { id: '1', email: 'new@example.com', name: 'New User' },
      };

      vi.mocked(apiClientModule.apiClient.post).mockResolvedValueOnce(mockResponse as any);

      const result = await authAPI.register(registerData);

      expect(result).toEqual(mockResponse);
      expect(apiClientModule.apiClient.post).toHaveBeenCalledWith(
        '/auth/register',
        registerData
      );
    });

    it('should save user and token on successful registration', async () => {
      const mockResponse = {
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        user: { id: '1', email: 'new@example.com', name: 'New User' },
      };

      vi.mocked(apiClientModule.apiClient.post).mockResolvedValueOnce(mockResponse as any);

      await authAPI.register({
        email: 'new@example.com',
        password: 'password',
        name: 'New User',
      });

      expect(authStorage.getToken()).toBe('jwt-token');
      expect(authStorage.getUser()).toEqual(mockResponse.user);
    });

    it('should reject duplicate email', async () => {
      vi.mocked(apiClientModule.apiClient.post).mockRejectedValueOnce(
        new Error('Email already exists')
      );

      try {
        await authAPI.register({
          email: 'existing@example.com',
          password: 'password',
          name: 'User',
        });
        expect.fail('Should throw error');
      } catch (error: any) {
        expect(error.message).toBe('Email already exists');
      }
    });
  });

  describe('refreshToken', () => {
    it('should refresh token', async () => {
      authStorage.saveToken('old-token', 'refresh-token');

      vi.mocked(apiClientModule.apiClient.post).mockResolvedValueOnce({
        token: 'new-token',
      });

      const newToken = await authAPI.refreshToken();

      expect(newToken).toBe('new-token');
      expect(apiClientModule.apiClient.post).toHaveBeenCalledWith(
        '/auth/refresh',
        { refreshToken: 'refresh-token' }
      );
    });

    it('should update stored token', async () => {
      authStorage.saveToken('old-token', 'refresh-token');

      vi.mocked(apiClientModule.apiClient.post).mockResolvedValueOnce({
        token: 'new-token',
      });

      await authAPI.refreshToken();

      expect(authStorage.getToken()).toBe('new-token');
      expect(apiClientModule.apiClient.setToken).toHaveBeenCalledWith('new-token');
    });

    it('should throw if no refresh token', async () => {
      try {
        await authAPI.refreshToken();
        expect.fail('Should throw error');
      } catch (error: any) {
        expect(error.message).toBe('No refresh token available');
      }
    });
  });

  describe('getCurrentUser', () => {
    it('should fetch current user', async () => {
      authStorage.saveToken('token', 'refresh');
      const mockUser = { id: '1', email: 'test@example.com', name: 'Test' };

      vi.mocked(apiClientModule.apiClient.get).mockResolvedValueOnce(mockUser);

      const user = await authAPI.getCurrentUser();

      expect(user).toEqual(mockUser);
      expect(apiClientModule.apiClient.get).toHaveBeenCalledWith('/auth/me');
    });

    it('should return null on error', async () => {
      vi.mocked(apiClientModule.apiClient.get).mockRejectedValueOnce(
        new Error('Unauthorized')
      );

      const user = await authAPI.getCurrentUser();

      expect(user).toBeNull();
    });
  });

  describe('updateProfile', () => {
    it('should update profile', async () => {
      const updatedUser = { id: '1', name: 'Updated Name', email: 'test@example.com' };

      vi.mocked(apiClientModule.apiClient.put).mockResolvedValueOnce(updatedUser);

      const result = await authAPI.updateProfile({ name: 'Updated Name' });

      expect(result).toEqual(updatedUser);
      expect(apiClientModule.apiClient.put).toHaveBeenCalledWith(
        '/auth/profile',
        { name: 'Updated Name' }
      );
    });

    it('should save updated user', async () => {
      const updatedUser = { id: '1', name: 'Updated Name', email: 'test@example.com' };

      vi.mocked(apiClientModule.apiClient.put).mockResolvedValueOnce(updatedUser);

      await authAPI.updateProfile({ name: 'Updated Name' });

      expect(authStorage.getUser()).toEqual(updatedUser);
    });
  });

  describe('changePassword', () => {
    it('should change password', async () => {
      vi.mocked(apiClientModule.apiClient.post).mockResolvedValueOnce(undefined);

      await authAPI.changePassword('old-password', 'new-password');

      expect(apiClientModule.apiClient.post).toHaveBeenCalledWith(
        '/auth/change-password',
        {
          oldPassword: 'old-password',
          newPassword: 'new-password',
        }
      );
    });

    it('should throw on invalid old password', async () => {
      vi.mocked(apiClientModule.apiClient.post).mockRejectedValueOnce(
        new Error('Invalid password')
      );

      try {
        await authAPI.changePassword('wrong-password', 'new-password');
        expect.fail('Should throw error');
      } catch (error: any) {
        expect(error.message).toBe('Invalid password');
      }
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when token exists', () => {
      authStorage.saveToken('token', 'refresh');
      expect(authAPI.isAuthenticated()).toBe(true);
    });

    it('should return false when no token', () => {
      expect(authAPI.isAuthenticated()).toBe(false);
    });
  });

  describe('getStoredUser', () => {
    it('should return stored user', () => {
      const user = { id: '1', email: 'test@example.com', name: 'Test' };
      authStorage.saveUser(user);

      expect(authAPI.getStoredUser()).toEqual(user);
    });

    it('should return null when no user stored', () => {
      expect(authAPI.getStoredUser()).toBeNull();
    });
  });
});
