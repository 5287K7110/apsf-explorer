import React from 'react';
import { CircleDot, Loader2, RefreshCw, FileText, AlertTriangle } from 'lucide-react';
import { useRunStatusTab } from '../hooks/useRunStatusTab';
import { isHumanPhase } from '../utils/phases';

function phaseColor(phase: string): string {
  if (phase === 'COMPLETE') return 'text-green-400 border-green-700 bg-green-900/30';
  if (isHumanPhase(phase)) return 'text-amber-400 border-amber-700 bg-amber-900/30';
  return 'text-blue-400 border-blue-700 bg-blue-900/30';
}

export const RunStatusView: React.FC = () => {
  const {
    available, runs, selected, setSelected,
    phase, phaseLoading, advisory, refreshPhase, loadError,
  } = useRunStatusTab();

  if (available === null) {
    return (
      <div className="flex items-center gap-2 text-slate-400 p-8">
        <Loader2 className="animate-spin" size={18} /> Loading...
      </div>
    );
  }

  if (!available) {
    return (
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl text-slate-400">
        <h2 className="text-lg font-semibold text-slate-200 mb-2">APSF Framework not connected</h2>
        <p className="text-sm">
          backend の環境変数 <code className="text-blue-400">APSF_ROOT</code> を設定してください。
        </p>
        {loadError && <p className="text-sm text-red-400 mt-2">{loadError}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Run selector */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">
            {selected || 'Run Status'}
          </h1>
          {phase && (
            <p className="mt-2 text-slate-400 text-sm">
              {phase.nextRole ? `Next: ${phase.nextRole}` : ''}
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          Run:
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            data-testid="run-status-selector"
            className="px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 max-w-[320px]"
          >
            <option value="">-- select --</option>
            {runs.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
      </div>

      {!selected ? (
        <div className="flex items-center justify-center h-96">
          <p className="text-slate-500">Select a run to view details</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column — Phase */}
          <div className="lg:col-span-1 space-y-6">
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-100">Phase</h3>
                <button
                  onClick={refreshPhase}
                  disabled={phaseLoading}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-400 disabled:opacity-50"
                  title="Re-detect phase"
                >
                  <RefreshCw size={14} />
                </button>
              </div>

              {phaseLoading ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Loader2 className="animate-spin" size={14} /> detecting...
                </div>
              ) : phase ? (
                <div className="space-y-3">
                  <span
                    data-testid="run-status-phase"
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-sm font-semibold ${phaseColor(phase.phase)}`}
                  >
                    <CircleDot size={12} /> {phase.phase}
                  </span>

                  {phase.phaseStatus && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Status:</span>
                      <span className={`text-xs font-medium ${
                        phase.phaseStatus === 'failed' ? 'text-red-400' :
                        phase.phaseStatus === 'executing' ? 'text-blue-400' :
                        'text-slate-300'
                      }`}>
                        {phase.phaseStatus}
                      </span>
                    </div>
                  )}

                  {phase.nextRole && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Next role:</span>
                      <span className="text-xs text-slate-300">{phase.nextRole}</span>
                    </div>
                  )}

                  {phase.fileToWrite && phase.fileToWrite !== '(none)' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">File to write:</span>
                      <span className="text-xs font-mono text-amber-300">{phase.fileToWrite}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Phase info unavailable</p>
              )}

              {/* Failed status */}
              {phase?.phaseStatus === 'failed' && (
                <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg">
                  <p className="text-xs font-semibold text-red-300 mb-1">
                    <AlertTriangle size={12} className="inline mr-1" />
                    前回の実行は異常終了しました
                  </p>
                  {phase.lastError && (
                    <p className="text-xs text-red-400/80 font-mono break-all">{phase.lastError}</p>
                  )}
                </div>
              )}

              {/* Advisory */}
              {advisory && (
                <div className="p-3 bg-slate-800/60 border border-slate-700 rounded-lg">
                  <p className="text-xs font-semibold text-slate-300 mb-1">Judge Advisory</p>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                    advisory.recommendation === 'Accept'
                      ? 'bg-green-900/50 text-green-300'
                      : 'bg-amber-900/50 text-amber-300'
                  }`}>
                    {String(advisory.recommendation ?? 'unknown')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right column — Existing files */}
          <div className="lg:col-span-2 space-y-6">
            <div className="card space-y-4">
              <h3 className="text-lg font-semibold text-slate-100">Artifacts</h3>
              {phase?.existingFiles && phase.existingFiles.length > 0 ? (
                <div className="space-y-1">
                  {phase.existingFiles.map((f) => (
                    <div key={f} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors">
                      <FileText size={14} className="text-slate-500 flex-shrink-0" />
                      <span className="text-xs font-mono text-slate-300 break-all">{f}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No artifacts yet</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
