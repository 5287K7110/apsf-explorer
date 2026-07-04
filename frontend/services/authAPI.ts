import { apiClient } from '../utils/apiClient';
import { authStorage } from '../utils/localStorage';
import { LoginRequest, LoginResponse, User } from '../types/auth';

export const authAPI = {
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>('/auth/login', credentials);

    // Store tokens
    authStorage.saveToken(response.token, response.refreshToken);
    authStorage.saveUser(response.user);

    // Set API client token
    apiClient.setToken(response.token);

    return response;
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout', {});
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      authStorage.clearAuth();
      apiClient.clearToken();
    }
  },

  async register(data: {
    email: string;
    password: string;
    name: string;
  }): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>('/auth/register', data);

    // Store tokens
    authStorage.saveToken(response.token, response.refreshToken);
    authStorage.saveUser(response.user);

    // Set API client token
    apiClient.setToken(response.token);

    return response;
  },

  async refreshToken(): Promise<string> {
    const refreshToken = authStorage.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await apiClient.post<{ token: string }>(
      '/auth/refresh',
      { refreshToken }
    );

    authStorage.saveToken(response.token, refreshToken);
    apiClient.setToken(response.token);

    return response.token;
  },

  async getCurrentUser(): Promise<User | null> {
    try {
      return await apiClient.get<User>('/auth/me');
    } catch (err) {
      console.error('Failed to get current user:', err);
      return null;
    }
  },

  async updateProfile(data: Partial<User>): Promise<User> {
    const user = await apiClient.put<User>('/auth/profile', data);
    authStorage.saveUser(user);
    return user;
  },

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await apiClient.post('/auth/change-password', {
      oldPassword,
      newPassword,
    });
  },

  isAuthenticated(): boolean {
    return !!authStorage.getToken();
  },

  getStoredUser(): User | null {
    const user = authStorage.getUser();
    return (user as User) || null;
  },
};
