import React, { useEffect, useState } from 'react';
import { FolderGit2, Plus, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  runs: string[];
  selected: string;
  onSelect: (runId: string) => void;
  apsfRoot: string | null;
  showCreate: boolean;
  onToggleCreate: () => void;
  onRefresh: () => void;
  // creation form
  newRunName: string;
  onNewRunNameChange: (v: string) => void;
  newRunLight: boolean;
  onNewRunLightChange: (v: boolean) => void;
  newRunWorkdir: string;
  onNewRunWorkdirChange: (v: string) => void;
  creating: boolean;
  onCreateRun: () => void;
}

const COLLAPSE_KEY = 'apsf.runlist.collapsed';

export const RunListPanel: React.FC<Props> = ({
  runs, selected, onSelect, apsfRoot,
  showCreate, onToggleCreate, onRefresh,
  newRunName, onNewRunNameChange, newRunLight, onNewRunLightChange,
  newRunWorkdir, onNewRunWorkdirChange, creating, onCreateRun,
}) => {
  // 折り畳み状態（リロード後も維持）
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* localStorage が使えない環境では永続化しない */
    }
  }, [collapsed]);

  return (
    <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col max-h-[75vh]">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 font-semibold text-slate-200 hover:text-slate-50"
          data-testid="apsf-runlist-toggle"
          title={collapsed ? 'Expand run list' : 'Collapse run list'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          <FolderGit2 size={16} /> APSF Runs ({runs.length})
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleCreate}
            data-testid="apsf-new-run"
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400"
            title="New run"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={onRefresh}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400"
            title="Reload run list"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="mb-3 p-3 bg-slate-800/60 border border-slate-700 rounded-lg space-y-2" data-testid="apsf-create-form">
          <input
            type="text"
            value={newRunName}
            onChange={(e) => onNewRunNameChange(e.target.value)}
            placeholder="case-key_topic（日付は自動付与）"
            className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 font-mono"
            data-testid="apsf-new-run-name"
          />
          <input
            type="text"
            value={newRunWorkdir}
            onChange={(e) => onNewRunWorkdirChange(e.target.value)}
            placeholder="Workdir（任意 — AI が作業する対象プロジェクトの絶対パス）"
            className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 font-mono"
            data-testid="apsf-new-run-workdir"
            title="未指定なら APSF_ROOT で実行されます。別プロジェクトを対象にする run はここで指定"
          />
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={newRunLight}
              onChange={(e) => onNewRunLightChange(e.target.checked)}
            />
            Light run（task.md から開始・最短フロー）
          </label>
          <button
            onClick={onCreateRun}
            disabled={creating || !newRunName.trim()}
            data-testid="apsf-create-run"
            className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded transition"
          >
            {creating ? 'Creating...' : 'Create run'}
          </button>
        </div>
      )}

      {!collapsed && (
        <>
          <p className="text-xs text-slate-500 mb-3 truncate" title={apsfRoot ?? ''}>
            {apsfRoot}
          </p>
          <div className="overflow-y-auto space-y-1" data-testid="apsf-run-list">
            {runs.map((r) => (
              <button
                key={r}
                onClick={() => onSelect(r)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono transition-colors ${
                  selected === r
                    ? 'bg-blue-900/50 text-blue-200 border border-blue-700'
                    : 'text-slate-400 hover:bg-slate-800 border border-transparent'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </>
      )}
      {collapsed && selected && (
        <p className="text-xs text-slate-500 truncate" title={selected}>
          selected: <span className="font-mono text-slate-400">{selected}</span>
        </p>
      )}
    </div>
  );
};
