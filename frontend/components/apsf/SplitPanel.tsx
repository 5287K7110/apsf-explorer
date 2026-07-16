import React, { useState } from 'react';
import { Scissors, Loader2 } from 'lucide-react';
import { apsfAPI, SplitProposal } from '../../services/apsfAPI';

interface Props {
  runId: string;
  provider: 'claude' | 'codex';
  /** sub-run 作成後に run 一覧を更新してもらう */
  onApplied: (created: string[]) => void;
}

/**
 * タスク分割パネル — 大きな task.md を AI に分割提案させ、
 * 人間が案を確認・選択してから sub-run を一括作成する。
 * 提案は AI・決定は人間、の APSF の役割分離をそのまま踏襲する。
 */
export const SplitPanel: React.FC<Props> = ({ runId, provider, onApplied }) => {
  const [proposing, setProposing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [proposals, setProposals] = useState<SplitProposal[] | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const propose = async () => {
    setProposing(true);
    setError(null);
    try {
      const res = await apsfAPI.splitProposal(runId, provider);
      setProposals(res.proposals);
      setChecked(Object.fromEntries(res.proposals.map((p) => [p.name, true])));
    } catch (e) {
      setError(e instanceof Error ? e.message : '分割案の生成に失敗しました');
    } finally {
      setProposing(false);
    }
  };

  const apply = async () => {
    if (!proposals) return;
    const selected = proposals.filter((p) => checked[p.name]);
    if (selected.length === 0) return;
    setApplying(true);
    setError(null);
    try {
      const res = await apsfAPI.splitApply(runId, selected);
      if (res.errors.length > 0) {
        setError(`一部失敗: ${res.errors.join(' / ')}`);
      }
      if (res.created.length > 0) {
        setProposals(null);
        onApplied(res.created);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'sub-run の作成に失敗しました');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3" data-testid="apsf-split">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Scissors size={14} /> タスク分割
          <span className="text-xs text-slate-500 font-normal">
            大きいタスクを独立した小 run に分ける（提案: AI / 決定: 人間）
          </span>
        </h4>
        <button
          onClick={propose}
          disabled={proposing || applying}
          data-testid="apsf-split-propose"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white text-xs font-semibold rounded transition"
        >
          {proposing && <Loader2 size={12} className="animate-spin" />}
          {proposing ? '生成中…' : `分割案を生成（${provider}）`}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {proposals && (
        <div className="space-y-2">
          {proposals.map((p) => (
            <div key={p.name} className="p-2 bg-slate-800/50 border border-slate-700 rounded-lg">
              <label className="flex items-center gap-2 text-xs font-mono text-slate-200">
                <input
                  type="checkbox"
                  checked={Boolean(checked[p.name])}
                  onChange={(e) => setChecked({ ...checked, [p.name]: e.target.checked })}
                />
                {p.name}
              </label>
              <details className="mt-1">
                <summary className="text-xs text-slate-500 cursor-pointer">task.md を確認</summary>
                <pre className="mt-1 text-xs text-slate-400 font-mono whitespace-pre-wrap max-h-48 overflow-auto">
                  {p.task}
                </pre>
              </details>
            </div>
          ))}
          <button
            onClick={apply}
            disabled={applying || proposals.filter((p) => checked[p.name]).length === 0}
            data-testid="apsf-split-apply"
            className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded transition"
          >
            {applying
              ? '作成中…'
              : `選択した ${proposals.filter((p) => checked[p.name]).length} 件で sub-run を作成`}
          </button>
        </div>
      )}
    </div>
  );
};
