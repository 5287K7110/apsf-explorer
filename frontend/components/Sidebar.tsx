import React from 'react';
import { useRunStore } from '../store/runStore';
import { CheckCircle, AlertCircle, Clock, Zap } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export const Sidebar: React.FC = () => {
  const {
    runs,
    selectedRunId,
    setSelectedRunId,
    filter,
    setFilter,
    sidebarOpen,
  } = useRunStore();

  const statusIcons = {
    success: <CheckCircle className="h-4 w-4 text-success-400" />,
    failed: <AlertCircle className="h-4 w-4 text-error-400" />,
    running: <Zap className="h-4 w-4 text-warning-400 animate-pulse" />,
    queued: <Clock className="h-4 w-4 text-slate-400" />,
    cancelled: <AlertCircle className="h-4 w-4 text-slate-400" />,
  };

  const filteredRuns = runs.filter((r) => {
    if (filter.status && r.status !== filter.status) return false;
    return true;
  });

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => useRunStore.setState({ sidebarOpen: false })}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-700 bg-slate-900 transition-transform duration-300 lg:relative lg:translate-x-0 lg:h-full lg:inset-auto lg:flex lg:flex-col lg:overflow-hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col overflow-hidden lg:overflow-hidden">
          {/* Header */}
          <div className="border-b border-slate-700 p-4">
            <h2 className="text-sm font-semibold text-slate-300">Runs</h2>
          </div>

          {/* Filter buttons */}
          <div className="space-y-2 border-b border-slate-700 p-4">
            <div className="flex gap-2">
              <button
                onClick={() => setFilter({ status: undefined })}
                className={`btn btn-sm ${!filter.status ? 'btn-primary' : 'btn-secondary'}`}
              >
                All
              </button>
              <button
                onClick={() => setFilter({ status: 'running' })}
                className={`btn btn-sm ${filter.status === 'running' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Running
              </button>
            </div>
          </div>

          {/* Run list */}
          <div className="flex-1 overflow-y-auto">
            {filteredRuns.length === 0 ? (
              <div className="flex items-center justify-center p-8 text-center">
                <p className="text-sm text-slate-500">No runs found</p>
              </div>
            ) : (
              <div className="space-y-2 p-4">
                {filteredRuns.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => {
                      setSelectedRunId(run.id);
                      useRunStore.setState({ sidebarOpen: false });
                    }}
                    className={`w-full text-left transition-all ${
                      selectedRunId === run.id
                        ? 'bg-slate-700 ring-2 ring-primary-500'
                        : 'hover:bg-slate-800'
                    } rounded-lg p-3 border border-slate-700`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {statusIcons[run.status]}
                          <p className="truncate text-sm font-medium text-slate-100">
                            {run.domain}
                          </p>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-400">
                          {run.description}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDistanceToNow(run.createdAt, { addSuffix: true })}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        <span className="badge badge-info text-xs">
                          {run.status === 'success' && 'Done'}
                          {run.status === 'failed' && 'Error'}
                          {run.status === 'running' && 'Live'}
                          {run.status === 'queued' && 'Queue'}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-700 p-4 text-xs text-slate-500">
            <p>Total runs: {runs.length}</p>
          </div>
        </div>
      </aside>
    </>
  );
};
