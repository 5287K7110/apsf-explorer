import { apiClient } from '../utils/apiClient';

export const runAPI = {
  // Fetch all runs
  async getRunList() {
    return apiClient.get('/runs');
  },

  // Get specific run
  async getRun(runId: string) {
    return apiClient.get(`/runs/${runId}`);
  },

  // Watch run (get updates)
  async watchRun(runId: string) {
    return apiClient.get(`/runs/${runId}/watch`);
  },

  // Execute commands
  async executePlan(runId: string, roles: string[] = []) {
    return apiClient.post(`/runs/${runId}/plan`, { roles });
  },

  async executeBuild(runId: string, roles: string[] = []) {
    return apiClient.post(`/runs/${runId}/build`, { roles });
  },

  async executeReview(runId: string, roles: string[] = []) {
    return apiClient.post(`/runs/${runId}/review`, { roles });
  },

  async executeJudge(runId: string, roles: string[] = []) {
    return apiClient.post(`/runs/${runId}/judge`, { roles });
  },

  async executeRetry(runId: string, roles: string[] = []) {
    return apiClient.post(`/runs/${runId}/retry`, { roles });
  },

  async executeCycle(runId: string, roles: string[] = []) {
    return apiClient.post(`/runs/${runId}/cycle`, { roles });
  },

  // Get roles
  async getRoles() {
    return apiClient.get('/roles');
  },

  // Create new run
  async createRun(config: {
    domain: string;
    description: string;
    acCount?: number;
  }) {
    return apiClient.post('/runs', config);
  },

  // Cancel run
  async cancelRun(runId: string) {
    return apiClient.post(`/runs/${runId}/cancel`, {});
  },

  // Get run logs
  async getRunLogs(runId: string) {
    return apiClient.get(`/runs/${runId}/logs`);
  },

  // Get run decisions
  async getRunDecisions(runId: string) {
    return apiClient.get(`/runs/${runId}/decisions`);
  },
};
