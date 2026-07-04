import { describe, it, expect, beforeEach } from 'vitest';
import { useRunStore } from '../../store/runStore';

describe('useRunStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should initialize with runs', () => {
    const store = useRunStore();
    expect(Array.isArray(store.runs)).toBe(true);
    expect(store.runs.length).toBeGreaterThan(0);
  });

  it('should initialize with default sidebar open', () => {
    const store = useRunStore();
    expect(store.sidebarOpen).toBe(true);
  });

  it('should initialize disconnected', () => {
    const store = useRunStore();
    expect(store.connectionStatus).toBe('disconnected');
  });

  describe('setRuns', () => {
    it('should set runs', () => {
      const store = useRunStore();
      const newRuns = [
        { id: '1', name: 'Run 1', status: 'pending' } as any,
        { id: '2', name: 'Run 2', status: 'running' } as any,
      ];

      store.setRuns(newRuns);
      expect(store.runs).toEqual(newRuns);
    });

    it('should persist runs to localStorage', () => {
      const store = useRunStore();
      const newRuns = [{ id: '1', name: 'Run 1' } as any];

      store.setRuns(newRuns);
      const saved = localStorage.getItem('apsf:runs');
      expect(saved).toBeDefined();
    });
  });

  describe('addRun', () => {
    it('should add run to beginning of list', () => {
      const store = useRunStore();
      const initialCount = store.runs.length;
      const newRun = { id: 'new-run', name: 'New Run', status: 'pending' } as any;

      store.addRun(newRun);

      expect(store.runs).toHaveLength(initialCount + 1);
      expect(store.runs[0]).toEqual(newRun);
    });

    it('should persist added run', () => {
      const store = useRunStore();
      const newRun = { id: 'new-run', name: 'New' } as any;

      store.addRun(newRun);

      const saved = localStorage.getItem('apsf:runs');
      expect(saved).toBeDefined();
      const parsed = JSON.parse(saved!);
      expect(parsed[0].id).toBe('new-run');
    });
  });

  describe('updateRun', () => {
    it('should update run properties', () => {
      const store = useRunStore();
      const firstRunId = store.runs[0].id;

      store.updateRun(firstRunId, { status: 'success' });

      const updated = store.runs.find((r) => r.id === firstRunId);
      expect(updated?.status).toBe('success');
    });

    it('should persist run update', () => {
      const store = useRunStore();
      const firstRunId = store.runs[0].id;

      store.updateRun(firstRunId, { status: 'failed' });

      const detail = localStorage.getItem(`apsf:run:${firstRunId}`);
      expect(detail).toBeDefined();
    });

    it('should handle partial updates', () => {
      const store = useRunStore();
      const run = store.runs[0];
      const originalName = run.name;

      store.updateRun(run.id, { status: 'completed' });

      const updated = store.runs.find((r) => r.id === run.id);
      expect(updated?.name).toBe(originalName);
      expect(updated?.status).toBe('completed');
    });
  });

  describe('setActiveRunId', () => {
    it('should set active run id', () => {
      const store = useRunStore();
      const runId = store.runs[0].id;

      store.setActiveRunId(runId);

      expect(store.activeRunId).toBe(runId);
    });

    it('should set active run id to null', () => {
      const store = useRunStore();
      store.setActiveRunId(null);

      expect(store.activeRunId).toBeNull();
    });
  });

  describe('setSelectedRunId', () => {
    it('should set selected run id', () => {
      const store = useRunStore();
      const runId = store.runs[0].id;

      store.setSelectedRunId(runId);

      expect(store.selectedRunId).toBe(runId);
    });

    it('should persist selected run id', () => {
      const store = useRunStore();
      const runId = store.runs[0].id;

      store.setSelectedRunId(runId);

      expect(localStorage.getItem('selectedRunId')).toBe(runId);
    });
  });

  describe('setFilter', () => {
    it('should set filter', () => {
      const store = useRunStore();

      store.setFilter({ status: 'success' });

      expect(store.filter.status).toBe('success');
    });

    it('should merge filters', () => {
      const store = useRunStore();

      store.setFilter({ status: 'success' });
      store.setFilter({ domain: 'test' });

      expect(store.filter.status).toBe('success');
      expect(store.filter.domain).toBe('test');
    });
  });

  describe('setSidebarOpen', () => {
    it('should toggle sidebar', () => {
      const store = useRunStore();

      store.setSidebarOpen(false);
      expect(store.sidebarOpen).toBe(false);

      store.setSidebarOpen(true);
      expect(store.sidebarOpen).toBe(true);
    });
  });

  describe('togglePhaseExpanded', () => {
    it('should add phase to expanded', () => {
      const store = useRunStore();

      store.togglePhaseExpanded('phase-1');

      expect(store.expandedPhases.has('phase-1')).toBe(true);
    });

    it('should remove phase from expanded', () => {
      const store = useRunStore();

      store.togglePhaseExpanded('phase-1');
      store.togglePhaseExpanded('phase-1');

      expect(store.expandedPhases.has('phase-1')).toBe(false);
    });

    it('should handle multiple phases', () => {
      const store = useRunStore();

      store.togglePhaseExpanded('phase-1');
      store.togglePhaseExpanded('phase-2');

      expect(store.expandedPhases.has('phase-1')).toBe(true);
      expect(store.expandedPhases.has('phase-2')).toBe(true);
    });
  });

  describe('setExpandedLogs', () => {
    it('should set expanded logs', () => {
      const store = useRunStore();

      store.setExpandedLogs(true);
      expect(store.expandedLogs).toBe(true);

      store.setExpandedLogs(false);
      expect(store.expandedLogs).toBe(false);
    });
  });

  describe('setConnectionStatus', () => {
    it('should set connection status', () => {
      const store = useRunStore();

      store.setConnectionStatus('connected');
      expect(store.connectionStatus).toBe('connected');

      store.setConnectionStatus('error');
      expect(store.connectionStatus).toBe('error');
    });
  });

  describe('getActiveRun', () => {
    it('should return active run', () => {
      const store = useRunStore();
      const activeRun = store.getActiveRun();

      expect(activeRun).not.toBeNull();
      expect(activeRun?.id).toBe(store.activeRunId);
    });

    it('should return null if no active run', () => {
      const store = useRunStore();
      store.setActiveRunId('non-existent');

      const activeRun = store.getActiveRun();
      expect(activeRun).toBeNull();
    });
  });

  describe('getSelectedRun', () => {
    it('should return selected run', () => {
      const store = useRunStore();
      const selectedRun = store.getSelectedRun();

      expect(selectedRun).not.toBeNull();
      expect(selectedRun?.id).toBe(store.selectedRunId);
    });
  });

  describe('getFilteredRuns', () => {
    it('should return all runs when no filter', () => {
      const store = useRunStore();
      const filtered = store.getFilteredRuns();

      expect(filtered.length).toBe(store.runs.length);
    });

    it('should filter by status', () => {
      const store = useRunStore();
      store.runs[0].status = 'success';
      store.runs[1].status = 'failed';

      store.setFilter({ status: 'success' });
      const filtered = store.getFilteredRuns();

      expect(filtered.every((r) => r.status === 'success')).toBe(true);
    });

    it('should filter by domain', () => {
      const store = useRunStore();
      store.runs[0].domain = 'shopping';
      store.runs[1].domain = 'email';

      store.setFilter({ domain: 'shop' });
      const filtered = store.getFilteredRuns();

      expect(filtered.some((r) => r.domain.includes('shop'))).toBe(true);
    });
  });

  describe('updateRunPhase', () => {
    it('should update phase and progress', () => {
      const store = useRunStore();
      const runId = store.runs[0].id;

      store.updateRunPhase(runId, 'building', 50);

      const updated = store.runs.find((r) => r.id === runId);
      expect(updated?.currentPhase).toBe('building');
      expect(updated?.progress).toBe(50);
    });

    it('should mark as running when not complete', () => {
      const store = useRunStore();
      const runId = store.runs[0].id;

      store.updateRunPhase(runId, 'building', 50);

      const updated = store.runs.find((r) => r.id === runId);
      expect(updated?.status).toBe('running');
    });

    it('should mark as success when complete', () => {
      const store = useRunStore();
      const runId = store.runs[0].id;

      store.updateRunPhase(runId, 'complete', 100);

      const updated = store.runs.find((r) => r.id === runId);
      expect(updated?.status).toBe('success');
    });
  });

  describe('updateRunAC', () => {
    it('should update AC progress', () => {
      const store = useRunStore();
      const runId = store.runs[0].id;

      store.updateRunAC(runId, 75);

      const updated = store.runs.find((r) => r.id === runId);
      expect(updated?.acProgress).toBe(75);
    });
  });

  describe('markRunSuccess', () => {
    it('should mark run as success', () => {
      const store = useRunStore();
      const runId = store.runs[0].id;

      store.markRunSuccess(runId);

      const updated = store.runs.find((r) => r.id === runId);
      expect(updated?.status).toBe('success');
      expect(updated?.progress).toBe(100);
      expect(updated?.acProgress).toBe(100);
    });

    it('should set completion timestamp', () => {
      const store = useRunStore();
      const runId = store.runs[0].id;
      const before = Date.now();

      store.markRunSuccess(runId);

      const updated = store.runs.find((r) => r.id === runId);
      expect(updated?.completedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('markRunFailed', () => {
    it('should mark run as failed', () => {
      const store = useRunStore();
      const runId = store.runs[0].id;

      store.markRunFailed(runId, 'Build failed');

      const updated = store.runs.find((r) => r.id === runId);
      expect(updated?.status).toBe('failed');
      expect(updated?.lastError?.message).toBe('Build failed');
    });
  });
});
