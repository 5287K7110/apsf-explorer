import { create } from 'zustand';
import { Run, RunState, RunStatus, Phase } from '../types';
import { generateMockRuns } from '../utils/mockData';
import { runStorage } from '../utils/localStorage';

interface RunStore {
  runs: Run[];
  activeRunId: string | null;
  selectedRunId: string | null;
  filter: {
    status?: RunStatus;
    domain?: string;
    phase?: Phase;
  };
  sidebarOpen: boolean;
  expandedPhases: Set<string>;
  expandedLogs: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'error';

  // State setters
  setRuns: (runs: Run[]) => void;
  addRun: (run: Run) => void;
  updateRun: (runId: string, updates: Partial<Run>) => void;
  setActiveRunId: (id: string | null) => void;
  setSelectedRunId: (id: string | null) => void;
  setFilter: (filter: Partial<RunState['filter']>) => void;
  setSidebarOpen: (open: boolean) => void;
  togglePhaseExpanded: (phaseId: string) => void;
  setExpandedLogs: (expanded: boolean) => void;
  setConnectionStatus: (status: 'connected' | 'disconnected' | 'error') => void;

  // Computed
  getActiveRun: () => Run | null;
  getSelectedRun: () => Run | null;
  getFilteredRuns: () => Run[];
  updateRunPhase: (runId: string, phase: Phase, progress: number) => void;
  updateRunAC: (runId: string, acProgress: number) => void;
  markRunSuccess: (runId: string) => void;
  markRunFailed: (runId: string, error: string) => void;
}

export const useRunStore = create<RunStore>((set, get) => {
  // Load runs from localStorage or initialize with mock data
  const savedRuns = runStorage.getRuns();
  const initialRuns = savedRuns.length > 0 ? savedRuns : generateMockRuns(8);
  const activeRunId = initialRuns[0].id;

  return {
    runs: initialRuns,
    activeRunId,
    selectedRunId: activeRunId,
    filter: {},
    sidebarOpen: true,
    expandedPhases: new Set(),
    expandedLogs: false,
    connectionStatus: 'disconnected',

    setRuns: (runs) => {
      runStorage.saveRuns(runs);
      set({ runs });
    },

    addRun: (run) =>
      set((state) => {
        const newRuns = [run, ...state.runs];
        runStorage.saveRuns(newRuns);
        return { runs: newRuns };
      }),

    updateRun: (runId, updates) =>
      set((state) => {
        const newRuns = state.runs.map((r) => (r.id === runId ? { ...r, ...updates } : r));
        runStorage.saveRuns(newRuns);
        // Also save individual run detail
        const updatedRun = newRuns.find((r) => r.id === runId);
        if (updatedRun) {
          runStorage.saveRunDetail(runId, updatedRun);
        }
        return { runs: newRuns };
      }),

    setActiveRunId: (id) => set({ activeRunId: id }),
    setSelectedRunId: (id) => {
      runStorage.saveSelectedRunId(id || '');
      set({ selectedRunId: id });
    },
    setFilter: (filter) =>
      set((state) => ({ filter: { ...state.filter, ...filter } })),

    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    togglePhaseExpanded: (phaseId) =>
      set((state) => {
        const expanded = new Set(state.expandedPhases);
        if (expanded.has(phaseId)) {
          expanded.delete(phaseId);
        } else {
          expanded.add(phaseId);
        }
        return { expandedPhases: expanded };
      }),
    setExpandedLogs: (expanded) => set({ expandedLogs: expanded }),
    setConnectionStatus: (status) => set({ connectionStatus: status }),

    getActiveRun: () => {
      const { runs, activeRunId } = get();
      return runs.find((r) => r.id === activeRunId) || null;
    },

    getSelectedRun: () => {
      const { runs, selectedRunId } = get();
      return runs.find((r) => r.id === selectedRunId) || null;
    },

    getFilteredRuns: () => {
      const { runs, filter } = get();
      return runs.filter((run) => {
        if (filter.status && run.status !== filter.status) return false;
        if (filter.domain && !run.domain.toLowerCase().includes(filter.domain.toLowerCase())) return false;
        if (filter.phase && run.currentPhase !== filter.phase) return false;
        return true;
      });
    },

    updateRunPhase: (runId, phase, progress) => {
      get().updateRun(runId, {
        currentPhase: phase,
        progress,
        status: phase === 'complete' ? 'success' : 'running',
      });
    },

    updateRunAC: (runId, acProgress) => {
      get().updateRun(runId, { acProgress });
    },

    markRunSuccess: (runId) => {
      const now = Date.now();
      get().updateRun(runId, {
        status: 'success',
        currentPhase: 'complete',
        progress: 100,
        acProgress: 100,
        completedAt: now,
      });
    },

    markRunFailed: (runId, error) => {
      get().updateRun(runId, {
        status: 'failed',
        lastError: {
          message: error,
          phase: 'building',
        },
      });
    },
  };
});
