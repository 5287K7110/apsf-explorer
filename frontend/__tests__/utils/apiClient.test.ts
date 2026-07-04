import { describe, it, expect, beforeEach, vi } from 'vitest';
import { APIClient } from '../../utils/apiClient';

describe('APIClient', () => {
  let client: APIClient;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    client = new APIClient('http://localhost:3000/api');
    global.fetch = vi.fn();
  });

  describe('setToken and clearToken', () => {
    it('should set token', () => {
      client.setToken('test-token');
      expect(localStorage.getItem('authToken')).toBe('test-token');
    });

    it('should clear token', () => {
      client.setToken('test-token');
      client.clearToken();
      expect(localStorage.getItem('authToken')).toBeNull();
    });
  });

  describe('request method', () => {
    it('should make GET request', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'test' }),
      });

      const result = await client.get('/test');
      expect(result).toEqual({ data: 'test' });
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/test',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should make POST request with data', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const postData = { name: 'test' };
      await client.post('/test', postData);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(postData),
        })
      );
    });

    it('should include Authorization header with token', async () => {
      client.setToken('jwt-token');
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await client.get('/protected');

      const call = (global.fetch as any).mock.calls[0];
      expect(call[1].headers['Authorization']).toBe('Bearer jwt-token');
    });

    it('should not include Authorization header without token', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await client.get('/public');

      const call = (global.fetch as any).mock.calls[0];
      expect(call[1].headers['Authorization']).toBeUndefined();
    });

    it('should handle 401 response by clearing token', async () => {
      client.setToken('expired-token');
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      try {
        await client.get('/protected');
        expect.fail('Should throw error');
      } catch (error: any) {
        expect(error.message).toContain('Unauthorized');
        expect(localStorage.getItem('authToken')).toBeNull();
      }
    });

    it('should handle 400 error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });

      try {
        await client.post('/test', { invalid: 'data' });
        expect.fail('Should throw error');
      } catch (error: any) {
        expect(error.message).toContain('Bad Request');
      }
    });

    it('should handle 404 error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      try {
        await client.get('/nonexistent');
        expect.fail('Should throw error');
      } catch (error: any) {
        expect(error.message).toContain('Not Found');
      }
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(
        new Error('Network error')
      );

      try {
        await client.get('/test');
        expect.fail('Should throw error');
      } catch (error: any) {
        expect(error.message).toContain('Network');
      }
    });

    it('should handle PUT request', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ updated: true }),
      });

      const updateData = { name: 'updated' };
      await client.put('/test', updateData);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/test',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updateData),
        })
      );
    });

    it('should handle DELETE request', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ deleted: true }),
      });

      await client.delete('/test');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/test',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should set Content-Type header', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await client.post('/test', { data: 'test' });

      const call = (global.fetch as any).mock.calls[0];
      expect(call[1].headers['Content-Type']).toBe('application/json');
    });
  });

  describe('get/post/put/delete convenience methods', () => {
    it('should call request with GET method', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ test: 'data' }),
      });

      await client.get('/endpoint');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should call request with POST method', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await client.post('/endpoint', { data: 'test' });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});
