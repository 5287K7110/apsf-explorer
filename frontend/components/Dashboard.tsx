import React, { useState } from 'react';
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
import { APSFRunPanel } from './APSFRunPanel';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { BarChart3, Activity, FolderGit2 } from 'lucide-react';

export const Dashboard: React.FC = () => {
  // APSF Runs（実データ）がメインタブ。run/analytics はモックデータのデモ表示
  const [activeTab, setActiveTab] = useState<'run' | 'analytics' | 'apsf'>('apsf');
  const {
    setSidebarOpen,
    sidebarOpen,
    getSelectedRun,
  } = useRunStore();

  // Initialize keyboard shortcuts
  useKeyboardShortcuts();

  const selectedRun = getSelectedRun();

  return (
    <div className="flex flex-col h-screen">
      <Header className="flex-shrink-0" onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
      <div className="flex flex-1 overflow-hidden sm:flex-row">
        {activeTab !== 'apsf' && <Sidebar />}
        <main className="flex flex-col flex-1 overflow-hidden bg-slate-950">
          {/* Tab navigation */}
          <div className="sticky top-0 z-30 flex-shrink-0 border-b border-slate-700 bg-slate-900">
            <div className="flex items-center gap-4 px-4 sm:px-6 lg:px-8 py-4">
              <button
                onClick={() => setActiveTab('apsf')}
                data-testid="apsf-tab"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'apsf'
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FolderGit2 size={18} />
                APSF Runs
              </button>
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
                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">Demo</span>
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
                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">Demo</span>
              </button>
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
            {activeTab === 'apsf' ? (
              // APSF Runs Tab（実 APSF Framework）
              <div className="max-w-7xl">
                <h1 className="text-3xl font-bold text-slate-100 mb-6">APSF Runs</h1>
                <APSFRunPanel />
              </div>
            ) : activeTab === 'run' && !selectedRun ? (
              <div className="flex items-center justify-center h-96">
                <p className="text-slate-500">Select a run to view details</p>
              </div>
            ) : activeTab === 'run' && selectedRun ? (
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

