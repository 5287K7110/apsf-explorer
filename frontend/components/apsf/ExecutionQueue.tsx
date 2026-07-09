import React from 'react';
import { X } from 'lucide-react';

interface Props {
  queueState: { running: string | null; queued: string[] };
  onCancelQueued: (runId: string) => void;
}

export const ExecutionQueue: React.FC<Props> = ({ queueState, onCancelQueued }) => {
  if (!queueState.running && queueState.queued.length === 0) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs" data-testid="apsf-queue">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-slate-300">Queue:</span>
        {queueState.running && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-200 border border-blue-700 font-mono" data-testid="apsf-queue-running">
            ▶ {queueState.running}
          </span>
        )}
        {queueState.queued.map((r, i) => (
          <span
            key={r}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-mono"
            data-testid={`apsf-queue-item-${r}`}
          >
            {i + 1}. {r}
            <button
              onClick={() => onCancelQueued(r)}
              data-testid={`apsf-queue-cancel-${r}`}
              className="ml-1 p-0.5 rounded hover:bg-slate-700 text-slate-500 hover:text-red-400"
              title="キューから除去"
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
};
