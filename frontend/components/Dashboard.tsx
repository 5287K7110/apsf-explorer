import React, { useState } from 'react';
import { Header } from './Header';
import { Analytics } from './Analytics';
import { APSFRunPanel } from './APSFRunPanel';
import { RunStatusView } from './RunStatusView';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { BarChart3, Activity, FolderGit2 } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'run' | 'analytics' | 'apsf'>('apsf');

  useKeyboardShortcuts();

  return (
    <div className="flex flex-col h-screen">
      <Header className="flex-shrink-0" />
      <div className="flex flex-1 overflow-hidden sm:flex-row">
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
            {activeTab === 'apsf' ? (
              // APSF Runs Tab（実 APSF Framework）
              <div className="max-w-7xl">
                <h1 className="text-3xl font-bold text-slate-100 mb-6">APSF Runs</h1>
                <APSFRunPanel />
              </div>
            ) : activeTab === 'run' ? (
              // Run Status Tab（実 APSF run）
              <RunStatusView />
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

