import { useCallback, useEffect, useRef, useState } from 'react';
import { apsfAPI, ApsfPhaseInfo, ApsfAdvisory } from '../services/apsfAPI';
import { wsClient } from '../utils/wsClient';

export interface RunStatusState {
  available: boolean | null;
  runs: string[];
  selected: string;
  setSelected: (runId: string) => void;
  phase: ApsfPhaseInfo | null;
  phaseLoading: boolean;
  advisory: ApsfAdvisory | null;
  refreshPhase: () => void;
  loadError: string | null;
}

export function useRunStatusTab(): RunStatusState {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [runs, setRuns] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [phase, setPhase] = useState<ApsfPhaseInfo | null>(null);
  const [phaseLoading, setPhaseLoading] = useState(false);
  const [advisory, setAdvisory] = useState<ApsfAdvisory | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // Load run list
  useEffect(() => {
    apsfAPI.getRuns()
      .then((res) => {
        setAvailable(res.available);
        setRuns(res.runs);
      })
      .catch((e) => {
        setAvailable(false);
        setLoadError(e instanceof Error ? e.message : 'Failed to load APSF runs');
      });
  }, []);

  // Detect phase for selected run
  const detectPhase = useCallback(async (runId: string) => {
    if (!runId) return;
    setPhaseLoading(true);
    setAdvisory(null);
    try {
      const res = await apsfAPI.getPhase(runId);
      setPhase(res);
      if (res.phase.startsWith('IMPROVE')) {
        try {
          const adv = await apsfAPI.getAdvisory(runId);
          setAdvisory(adv.advisory);
        } catch { /* advisory is optional */ }
      }
    } catch {
      setPhase(null);
    } finally {
      setPhaseLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) {
      detectPhase(selected);
    } else {
      setPhase(null);
    }
  }, [selected, detectPhase]);

  // Live updates via WebSocket
  useEffect(() => {
    const onUpdate = (data: Record<string, unknown>) => {
      if (data.runId === selectedRef.current) {
        detectPhase(selectedRef.current);
      }
    };
    wsClient.on('complete', onUpdate);
    wsClient.on('error', onUpdate);
    return () => {
      wsClient.off('complete', onUpdate);
      wsClient.off('error', onUpdate);
    };
  }, [detectPhase]);

  return {
    available,
    runs,
    selected,
    setSelected,
    phase,
    phaseLoading,
    advisory,
    refreshPhase: () => detectPhase(selected),
    loadError,
  };
}
