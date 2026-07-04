import React, { useState } from 'react';
import { Run } from '../types';
import { CheckCircle2, Circle, AlertCircle, ChevronDown } from 'lucide-react';

interface ACProgressProps {
  run: Run;
}

export const ACProgress: React.FC<ACProgressProps> = ({ run }) => {
  const [expanded, setExpanded] = useState(false);

  const statusIcons = {
    done: <CheckCircle2 className="h-5 w-5 text-success-400" />,
    'in-progress': <Circle className="h-5 w-5 text-warning-400 animate-pulse" />,
    todo: <Circle className="h-5 w-5 text-slate-600" />,
    blocked: <AlertCircle className="h-5 w-5 text-error-400" />,
  };

  const done = run.acceptanceCriteria.filter((c) => c.status === 'done').length;
  const inProgress = run.acceptanceCriteria.filter(
    (c) => c.status === 'in-progress'
  ).length;

  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">
            Acceptance Criteria
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            {done}/{run.acceptanceCriteria.length} criteria completed
          </p>
        </div>
        <span className="text-2xl font-bold text-primary-400">
          {run.acProgress}%
        </span>
      </div>

      {/* Progress bar */}
      <div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${run.acProgress}%` }}
          />
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-slate-800/50 p-3">
          <p className="text-xs text-slate-400">Done</p>
          <p className="mt-1 text-lg font-bold text-success-400">{done}</p>
        </div>
        <div className="rounded-lg bg-slate-800/50 p-3">
          <p className="text-xs text-slate-400">In Progress</p>
          <p className="mt-1 text-lg font-bold text-warning-400">{inProgress}</p>
        </div>
        <div className="rounded-lg bg-slate-800/50 p-3">
          <p className="text-xs text-slate-400">Remaining</p>
          <p className="mt-1 text-lg font-bold text-slate-400">
            {run.acceptanceCriteria.length - done - inProgress}
          </p>
        </div>
      </div>

      {/* Expandable criteria list */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-800/50 transition-colors border border-slate-700/50 text-left"
      >
        <span className="text-sm font-medium text-slate-300">
          View all criteria
        </span>
        <ChevronDown
          size={18}
          className={`text-slate-500 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Criteria list */}
      {expanded && (
        <div className="space-y-2 border-t border-slate-700 pt-4">
          {run.acceptanceCriteria.map((criterion) => (
            <div
              key={criterion.id}
              className="flex items-start gap-3 rounded-lg p-3 hover:bg-slate-800/50"
            >
              <div className="flex-shrink-0 mt-0.5">
                {statusIcons[criterion.status]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-100">
                  {criterion.title}
                </p>
                <p className="text-sm text-slate-400">
                  {criterion.description}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`badge badge-sm ${
                      criterion.priority === 'critical'
                        ? 'badge-error'
                        : criterion.priority === 'high'
                        ? 'badge-warning'
                        : 'badge-info'
                    }`}
                  >
                    {criterion.priority}
                  </span>
                  <span className="text-xs text-slate-500">
                    {criterion.status === 'done' && '✓ Completed'}
                    {criterion.status === 'in-progress' && '⧗ In Progress'}
                    {criterion.status === 'todo' && '○ Todo'}
                    {criterion.status === 'blocked' && '✗ Blocked'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
