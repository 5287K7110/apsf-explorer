import React, { useState } from 'react';
import { GitBranch, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { apsfAPI, WorkdirDiff } from '../../services/apsfAPI';

interface Props {
  runId: string;
}

/** diff 行の簡易カラーリング */
function diffLineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-slate-400';
  if (line.startsWith('@@')) return 'text-cyan-400';
  if (line.startsWith('+')) return 'text-green-400';
  if (line.startsWith('-')) return 'text-red-400';
  if (line.startsWith('diff ')) return 'text-amber-300';
  return 'text-slate-400';
}

/**
 * Workdir Diff パネル — run の対象プロジェクトのライブ git diff を表示する。
 * Judge が Accept / Return を決める前に「AI が実際に何を変えたか」を見るためのもの。
 */
export const WorkdirDiffPanel: React.FC<Props> = ({ runId }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<(WorkdirDiff & { workdir: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apsfAPI.getWorkdirDiff(runId);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'diff の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !data) load();
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4" data-testid="apsf-workdir-diff">
      <div className="flex items-center justify-between">
        <button
          onClick={toggle}
          className="flex items-center gap-2 text-sm font-semibold text-slate-200 hover:text-slate-50"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <GitBranch size={14} /> Workdir Diff
          {data?.isRepo && data.branch && (
            <span className="text-xs text-slate-500 font-normal">({data.branch})</span>
          )}
        </button>
        {open && (
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 disabled:opacity-50"
            title="Reload diff"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          {error && <p className="text-xs text-red-400">{error}</p>}
          {data && !data.isRepo && (
            <p className="text-xs text-slate-500">workdir は git リポジトリではありません</p>
          )}
          {data?.isRepo && (
            <>
              <p className="text-xs text-slate-500 font-mono truncate" title={data.workdir}>
                {data.workdir}
              </p>
              {data.stat ? (
                <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap bg-slate-950 border border-slate-800 rounded p-2">
                  {data.stat}
                </pre>
              ) : (
                <p className="text-xs text-slate-500">変更なし（clean）</p>
              )}
              {data.untracked.length > 0 && (
                <p className="text-xs text-amber-300/80">
                  untracked: {data.untracked.slice(0, 8).join(', ')}
                  {data.untracked.length > 8 ? ` ほか ${data.untracked.length - 8} 件` : ''}
                </p>
              )}
              {data.diff && (
                <div className="max-h-96 overflow-auto bg-slate-950 border border-slate-800 rounded p-2">
                  {data.diff.split('\n').map((line, i) => (
                    <div key={i} className={`text-xs font-mono whitespace-pre ${diffLineClass(line)}`}>
                      {line || ' '}
                    </div>
                  ))}
                  {data.truncated && (
                    <p className="text-xs text-amber-400 mt-1">…diff が大きいため打ち切りました</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
