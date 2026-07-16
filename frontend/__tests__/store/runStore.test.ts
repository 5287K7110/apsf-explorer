import { describe, it, expect, beforeEach } from 'vitest';
import { useRunStore } from '../../store/runStore';

// store はモジュールシングルトンのため、テスト間で state が漏れる。
// import 直後のスナップショットに毎回巻き戻して独立性を保証する。
const initialRunStoreState = useRunStore.getState();

describe('useRunStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useRunStore.setState(initialRunStoreState, true);
  });

  it('should initialize with runs', () => {
    expect(Array.isArray(useRunStore.getState().runs)).toBe(true);
    expect(useRunStore.getState().runs.length).toBeGreaterThan(0);
  });

  it('should initialize with default sidebar open', () => {
    expect(useRunStore.getState().sidebarOpen).toBe(true);
  });

  it('should initialize disconnected', () => {
    expect(useRunStore.getState().connectionStatus).toBe('disconnected');
  });

  describe('setRuns', () => {
    it('should set runs', () => {
      const newRuns = [
        { id: '1', name: 'Run 1', status: 'pending' } as any,
        { id: '2', name: 'Run 2', status: 'running' } as any,
      ];

      useRunStore.getState().setRuns(newRuns);
      expect(useRunStore.getState().runs).toEqual(newRuns);
    });

    it('should persist runs to localStorage', () => {
      const newRuns = [{ id: '1', name: 'Run 1' } as any];

      useRunStore.getState().setRuns(newRuns);
      const saved = localStorage.getItem('apsf:runs');
      expect(saved).toBeDefined();
    });
  });

  describe('addRun', () => {
    it('should add run to beginning of list', () => {
      const initialCount = useRunStore.getState().runs.length;
      const newRun = { id: 'new-run', name: 'New Run', status: 'pending' } as any;

      useRunStore.getState().addRun(newRun);

      expect(useRunStore.getState().runs).toHaveLength(initialCount + 1);
      expect(useRunStore.getState().runs[0]).toEqual(newRun);
    });

    it('should persist added run', () => {
      const newRun = { id: 'new-run', name: 'New' } as any;

      useRunStore.getState().addRun(newRun);

      const saved = localStorage.getItem('apsf:runs');
      expect(saved).toBeDefined();
      const parsed = JSON.parse(saved!);
      expect(parsed[0].id).toBe('new-run');
    });
  });

  describe('updateRun', () => {
    it('should update run properties', () => {
      const firstRunId = useRunStore.getState().runs[0].id;

      useRunStore.getState().updateRun(firstRunId, { status: 'success' });

      const updated = useRunStore.getState().runs.find((r) => r.id === firstRunId);
      expect(updated?.status).toBe('success');
    });

    it('should persist run update', () => {
      const firstRunId = useRunStore.getState().runs[0].id;

      useRunStore.getState().updateRun(firstRunId, { status: 'failed' });

      const detail = localStorage.getItem(`apsf:run:${firstRunId}`);
      expect(detail).toBeDefined();
    });

    it('should handle partial updates', () => {
      const run = useRunStore.getState().runs[0];
      const originalDomain = run.domain;

      useRunStore.getState().updateRun(run.id, { status: 'success' });

      const updated = useRunStore.getState().runs.find((r) => r.id === run.id);
      expect(updated?.domain).toBe(originalDomain);
      expect(updated?.status).toBe('success');
    });
  });

  describe('setActiveRunId', () => {
    it('should set active run id', () => {
      const runId = useRunStore.getState().runs[0].id;

      useRunStore.getState().setActiveRunId(runId);

      expect(useRunStore.getState().activeRunId).toBe(runId);
    });

    it('should set active run id to null', () => {
      useRunStore.getState().setActiveRunId(null);

      expect(useRunStore.getState().activeRunId).toBeNull();
    });
  });

  describe('setSelectedRunId', () => {
    it('should set selected run id', () => {
      const runId = useRunStore.getState().runs[0].id;

      useRunStore.getState().setSelectedRunId(runId);

      expect(useRunStore.getState().selectedRunId).toBe(runId);
    });

    it('should persist selected run id', () => {
      const runId = useRunStore.getState().runs[0].id;

      useRunStore.getState().setSelectedRunId(runId);

      expect(localStorage.getItem('selectedRunId')).toBe(JSON.stringify(runId));
    });
  });

  describe('setFilter', () => {
    it('should set filter', () => {

      useRunStore.getState().setFilter({ status: 'success' });

      expect(useRunStore.getState().filter.status).toBe('success');
    });

    it('should merge filters', () => {

      useRunStore.getState().setFilter({ status: 'success' });
      useRunStore.getState().setFilter({ domain: 'test' });

      expect(useRunStore.getState().filter.status).toBe('success');
      expect(useRunStore.getState().filter.domain).toBe('test');
    });
  });

  describe('setSidebarOpen', () => {
    it('should toggle sidebar', () => {

      useRunStore.getState().setSidebarOpen(false);
      expect(useRunStore.getState().sidebarOpen).toBe(false);

      useRunStore.getState().setSidebarOpen(true);
      expect(useRunStore.getState().sidebarOpen).toBe(true);
    });
  });

  describe('togglePhaseExpanded', () => {
    it('should add phase to expanded', () => {

      useRunStore.getState().togglePhaseExpanded('phase-1');

      expect(useRunStore.getState().expandedPhases.has('phase-1')).toBe(true);
    });

    it('should remove phase from expanded', () => {

      useRunStore.getState().togglePhaseExpanded('phase-1');
      useRunStore.getState().togglePhaseExpanded('phase-1');

      expect(useRunStore.getState().expandedPhases.has('phase-1')).toBe(false);
    });

    it('should handle multiple phases', () => {

      useRunStore.getState().togglePhaseExpanded('phase-1');
      useRunStore.getState().togglePhaseExpanded('phase-2');

      expect(useRunStore.getState().expandedPhases.has('phase-1')).toBe(true);
      expect(useRunStore.getState().expandedPhases.has('phase-2')).toBe(true);
    });
  });

  describe('setExpandedLogs', () => {
    it('should set expanded logs', () => {

      useRunStore.getState().setExpandedLogs(true);
      expect(useRunStore.getState().expandedLogs).toBe(true);

      useRunStore.getState().setExpandedLogs(false);
      expect(useRunStore.getState().expandedLogs).toBe(false);
    });
  });

  describe('setConnectionStatus', () => {
    it('should set connection status', () => {

      useRunStore.getState().setConnectionStatus('connected');
      expect(useRunStore.getState().connectionStatus).toBe('connected');

      useRunStore.getState().setConnectionStatus('error');
      expect(useRunStore.getState().connectionStatus).toBe('error');
    });
  });

  describe('getActiveRun', () => {
    it('should return active run', () => {
      const activeRun = useRunStore.getState().getActiveRun();

      expect(activeRun).not.toBeNull();
      expect(activeRun?.id).toBe(useRunStore.getState().activeRunId);
    });

    it('should return null if no active run', () => {
      useRunStore.getState().setActiveRunId('non-existent');

      const activeRun = useRunStore.getState().getActiveRun();
      expect(activeRun).toBeNull();
    });
  });

  describe('getSelectedRun', () => {
    it('should return selected run', () => {
      const selectedRun = useRunStore.getState().getSelectedRun();

      expect(selectedRun).not.toBeNull();
      expect(selectedRun?.id).toBe(useRunStore.getState().selectedRunId);
    });
  });

  describe('getFilteredRuns', () => {
    it('should return all runs when no filter', () => {
      const filtered = useRunStore.getState().getFilteredRuns();

      expect(filtered.length).toBe(useRunStore.getState().runs.length);
    });

    it('should filter by status', () => {
      useRunStore.getState().runs[0].status = 'success';
      useRunStore.getState().runs[1].status = 'failed';

      useRunStore.getState().setFilter({ status: 'success' });
      const filtered = useRunStore.getState().getFilteredRuns();

      expect(filtered.every((r) => r.status === 'success')).toBe(true);
    });

    it('should filter by domain', () => {
      useRunStore.getState().runs[0].domain = 'shopping';
      useRunStore.getState().runs[1].domain = 'email';

      useRunStore.getState().setFilter({ domain: 'shop' });
      const filtered = useRunStore.getState().getFilteredRuns();

      expect(filtered.some((r) => r.domain.includes('shop'))).toBe(true);
    });
  });

  describe('updateRunPhase', () => {
    it('should update phase and progress', () => {
      const runId = useRunStore.getState().runs[0].id;

      useRunStore.getState().updateRunPhase(runId, 'building', 50);

      const updated = useRunStore.getState().runs.find((r) => r.id === runId);
      expect(updated?.currentPhase).toBe('building');
      expect(updated?.progress).toBe(50);
    });

    it('should mark as running when not complete', () => {
      const runId = useRunStore.getState().runs[0].id;

      useRunStore.getState().updateRunPhase(runId, 'building', 50);

      const updated = useRunStore.getState().runs.find((r) => r.id === runId);
      expect(updated?.status).toBe('running');
    });

    it('should mark as success when complete', () => {
      const runId = useRunStore.getState().runs[0].id;

      useRunStore.getState().updateRunPhase(runId, 'complete', 100);

      const updated = useRunStore.getState().runs.find((r) => r.id === runId);
      expect(updated?.status).toBe('success');
    });
  });

  describe('updateRunAC', () => {
    it('should update AC progress', () => {
      const runId = useRunStore.getState().runs[0].id;

      useRunStore.getState().updateRunAC(runId, 75);

      const updated = useRunStore.getState().runs.find((r) => r.id === runId);
      expect(updated?.acProgress).toBe(75);
    });
  });

  describe('markRunSuccess', () => {
    it('should mark run as success', () => {
      const runId = useRunStore.getState().runs[0].id;

      useRunStore.getState().markRunSuccess(runId);

      const updated = useRunStore.getState().runs.find((r) => r.id === runId);
      expect(updated?.status).toBe('success');
      expect(updated?.progress).toBe(100);
      expect(updated?.acProgress).toBe(100);
    });

    it('should set completion timestamp', () => {
      const runId = useRunStore.getState().runs[0].id;
      const before = Date.now();

      useRunStore.getState().markRunSuccess(runId);

      const updated = useRunStore.getState().runs.find((r) => r.id === runId);
      expect(updated?.completedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('markRunFailed', () => {
    it('should mark run as failed', () => {
      const runId = useRunStore.getState().runs[0].id;

      useRunStore.getState().markRunFailed(runId, 'Build failed');

      const updated = useRunStore.getState().runs.find((r) => r.id === runId);
      expect(updated?.status).toBe('failed');
      expect(updated?.lastError?.message).toBe('Build failed');
    });
  });
});
