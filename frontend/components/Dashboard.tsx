import React, { useState, useEffect } from 'react';
import { useRunStore } from '../store/runStore';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { PhaseIndicator } from './PhaseIndicator';
import { CommandPanel } from './CommandPanel';
import { ACProgress } from './ACProgress';
import { DecisionFlow } from './DecisionFlow';
import { ErrorDisplay } from './ErrorDisplay';
import { LogViewer } from './LogViewer';
import { Analytics } from './Analytics';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { BarChart3, Activity } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'run' | 'analytics'>('run');
  const {
    setSidebarOpen,
    sidebarOpen,
    getSelectedRun,
  } = useRunStore();

  // Initialize keyboard shortcuts
  useKeyboardShortcuts();

  const selectedRun = getSelectedRun();

  useEffect(() => {
    // Simulate real-time updates
    const interval = setInterval(() => {
      if (selectedRun?.status === 'running') {
        useRunStore.setState((state) => {
          const updatedRuns = state.runs.map((r) => {
            if (r.id === selectedRun.id && r.status === 'running') {
              const newProgress = Math.min(r.progress + Math.random() * 10, 95);
              const newAC = Math.min(r.acProgress + Math.random() * 5, 95);
              return {
                ...r,
                progress: Math.round(newProgress),
                acProgress: Math.round(newAC),
              };
            }
            return r;
          });
          return { runs: updatedRuns };
        });
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [selectedRun?.id, selectedRun?.status]);

  if (!selectedRun) {
    return (
      <div className="flex flex-col h-screen">
        <Header className="flex-shrink-0" onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="flex items-center justify-center h-96">
              <p className="text-slate-500">Select a run to view details</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <Header className="flex-shrink-0" onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
      <div className="flex flex-1 overflow-hidden sm:flex-row">
        <Sidebar />
        <main className="flex flex-col flex-1 overflow-hidden bg-slate-950">
          {/* Tab navigation */}
          <div className="sticky top-0 z-30 flex-shrink-0 border-b border-slate-700 bg-slate-900">
            <div className="flex items-center gap-4 px-4 sm:px-6 lg:px-8 py-4">
              <button
                onClick={() => setActiveTab('run')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'run'
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity size={18} />
                Run Status
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'analytics'
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BarChart3 size={18} />
                Analytics
              </button>
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
            {activeTab === 'run' ? (
              // Run Status Tab
              <div className="space-y-6 max-w-7xl">
                {/* Run header */}
                <div>
                  <h1 className="text-3xl font-bold text-slate-100">
                    {selectedRun.domain}
                  </h1>
                  <p className="mt-2 text-slate-400">
                    {selectedRun.description}
                  </p>
                </div>

                {/* Main content grid */}
                <div className="grid gap-6 lg:grid-cols-3">
                  {/* Left column - Phase and commands */}
                  <div className="lg:col-span-1 space-y-6">
                    <PhaseIndicator run={selectedRun} />
                    <CommandPanel run={selectedRun} />
                  </div>

                  {/* Right column - Criteria and decisions */}
                  <div className="lg:col-span-2 space-y-6">
                    <ACProgress run={selectedRun} />
                    <DecisionFlow run={selectedRun} />
                  </div>
                </div>

                {/* Error display */}
                {selectedRun.lastError && (
                  <ErrorDisplay run={selectedRun} />
                )}

                {/* Logs */}
                <LogViewer run={selectedRun} />
              </div>
            ) : (
              // Analytics Tab
              <div className="max-w-7xl">
                <h1 className="text-3xl font-bold text-slate-100 mb-6">
                  Analytics
                </h1>                <Analytics />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

