// Base API client wrapper
// - Base URL configuration
// - Default headers
// - Error handling
// - Token management

export class APIClient {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    this.token = localStorage.getItem('authToken');
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('authToken', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('authToken');
  }

  async request<T>(
    method: string,
    endpoint: string,
    data?: any
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.clearToken();
        throw new Error('Unauthorized');
      }
      throw new Error(`API Error: ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  get<T>(endpoint: string) {
    return this.request<T>('GET', endpoint);
  }

  post<T>(endpoint: string, data: any) {
    return this.request<T>('POST', endpoint, data);
  }

  put<T>(endpoint: string, data: any) {
    return this.request<T>('PUT', endpoint, data);
  }

  delete<T>(endpoint: string) {
    return this.request<T>('DELETE', endpoint);
  }
}

const getApiUrl = (): string => {
  // Check for Vite environment variable
  try {
    const viteEnv = import.meta.env.VITE_API_URL;
    if (viteEnv) {
      return viteEnv;
    }
  } catch {
    // import.meta not available
  }
  // Default
  return 'http://localhost:3000/api';
};

export const apiClient = new APIClient(getApiUrl());
