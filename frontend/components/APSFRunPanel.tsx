import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Play, FolderGit2, CircleDot, Loader2 } from 'lucide-react';
import { apsfAPI, ApsfCommand } from '../services/apsfAPI';
import { wsClient } from '../utils/wsClient';

/**
 * APSF Run Panel — 実 APSF Framework の run を操作する
 *
 * - GET /api/runs/apsf          : 実 run 一覧
 * - GET /api/runs/apsf/:id/phase: 実 `apsf next --phase-only`
 * - POST /api/runs/:id/execute  : mode 'apsf-run' で実ラッパー実行
 * - WebSocket progress/complete/error をライブログ表示
 */

const HUMAN_PHASES = [
  'GOAL_NEEDED', 'SETUP_NEEDED', 'TASK_NEEDED', 'IMPROVE_PLAN_OPTIONAL',
  'IMPROVE_NEEDED', 'VERIFY_OPTIONAL', 'RESULT_NEEDED',
  'TRANSCRIPT_RECOMMENDED', 'COMPLETE',
];

function phaseColor(phase: string): string {
  if (phase === 'COMPLETE') return 'text-green-400 border-green-700 bg-green-900/30';
  if (HUMAN_PHASES.includes(phase)) return 'text-amber-400 border-amber-700 bg-amber-900/30';
  return 'text-blue-400 border-blue-700 bg-blue-900/30';
}

interface LogLine {
  ts: number;
  kind: 'progress' | 'complete' | 'error' | 'log' | 'info';
  text: string;
}

export const APSFRunPanel: React.FC = () => {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [apsfRoot, setApsfRoot] = useState<string | null>(null);
  const [runs, setRuns] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [phase, setPhase] = useState<string>('');
  const [phaseLoading, setPhaseLoading] = useState(false);
  const [command, setCommand] = useState<ApsfCommand>('plan');
  const [provider, setProvider] = useState<'claude' | 'codex'>('claude');
  const [dryRun, setDryRun] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const appendLog = useCallback((kind: LogLine['kind'], text: string) => {
    setLogs((prev) => [...prev.slice(-200), { ts: Date.now(), kind, text }]);
  }, []);

  // 実 run 一覧の取得
  const loadRuns = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await apsfAPI.getRuns();
      setAvailable(res.available);
      setApsfRoot(res.apsfRoot);
      setRuns(res.runs);
    } catch (e) {
      setAvailable(false);
      setLoadError(e instanceof Error ? e.message : 'Failed to load APSF runs');
    }
  }, []);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  // 実フェーズ検出
  const detectPhase = useCallback(async (runId: string) => {
    if (!runId) return;
    setPhaseLoading(true);
    setPhase('');
    try {
      const res = await apsfAPI.getPhase(runId);
      setPhase(res.phase);
    } catch (e) {
      setPhase('ERROR');
      appendLog('error', e instanceof Error ? e.message : 'phase detection failed');
    } finally {
      setPhaseLoading(false);
    }
  }, [appendLog]);

  useEffect(() => {
    if (selected) {
      setLogs([]);
      detectPhase(selected);
    }
  }, [selected, detectPhase]);

  // WebSocket イベント購読（選択中 run のみ）
  useEffect(() => {
    const onEvent = (kind: LogLine['kind']) => (data: any) => {
      if (data.runId !== selectedRef.current) return;
      const text =
        kind === 'complete'
          ? `完了 (exit=${data.data?.exitCode ?? '?'}, phase=${data.data?.phase ?? '?'})`
          : kind === 'error'
            ? String(data.data?.error ?? 'unknown error')
            : String(data.data?.message ?? '').trimEnd();
      if (text) appendLog(kind, text);
      if (kind === 'complete' || kind === 'error') {
        setExecuting(false);
        if (kind === 'complete') detectPhase(selectedRef.current);
      }
    };

    const onProgress = onEvent('progress');
    const onComplete = onEvent('complete');
    const onError = onEvent('error');
    const onLog = onEvent('log');
    wsClient.on('progress', onProgress);
    wsClient.on('complete', onComplete);
    wsClient.on('error', onError);
    wsClient.on('log', onLog);
    return () => {
      wsClient.off('progress', onProgress);
      wsClient.off('complete', onComplete);
      wsClient.off('error', onError);
      wsClient.off('log', onLog);
    };
  }, [appendLog, detectPhase]);

  // ログの自動スクロール
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleExecute = async () => {
    if (!selected || executing) return;
    setExecuting(true);
    appendLog('info', `実行開始: ${command} (provider=${provider}${dryRun ? ', DryRun' : ''})`);
    try {
      await apsfAPI.execute(selected, command, provider, dryRun);
    } catch (e) {
      appendLog('error', e instanceof Error ? e.message : 'execute request failed');
      setExecuting(false);
    }
  };

  if (available === null) {
    return (
      <div className="flex items-center gap-2 text-slate-400 p-8">
        <Loader2 className="animate-spin" size={18} /> Loading APSF framework status...
      </div>
    );
  }

  if (!available) {
    return (
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl text-slate-400" data-testid="apsf-unavailable">
        <h2 className="text-lg font-semibold text-slate-200 mb-2">APSF Framework not connected</h2>
        <p className="text-sm">
          backend の環境変数 <code className="text-blue-400">APSF_ROOT</code> に
          ai-problem-solving-framework のパスを設定してください。
        </p>
        {loadError && <p className="text-sm text-red-400 mt-2">{loadError}</p>}
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3" data-testid="apsf-panel">
      {/* Run 一覧 */}
      <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col max-h-[70vh]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-2 font-semibold text-slate-200">
            <FolderGit2 size={16} /> APSF Runs ({runs.length})
          </h2>
          <button
            onClick={loadRuns}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400"
            title="Reload run list"
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3 truncate" title={apsfRoot ?? ''}>
          {apsfRoot}
        </p>
        <div className="overflow-y-auto space-y-1" data-testid="apsf-run-list">
          {runs.map((r) => (
            <button
              key={r}
              onClick={() => setSelected(r)}
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
      </div>

      {/* 詳細 + 実行 */}
      <div className="lg:col-span-2 space-y-4">
        {selected ? (
          <>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-mono text-slate-300 break-all mb-3">{selected}</h3>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-slate-400">Phase:</span>
                {phaseLoading ? (
                  <span className="flex items-center gap-1 text-slate-400 text-sm">
                    <Loader2 className="animate-spin" size={14} /> detecting...
                  </span>
                ) : (
                  <span
                    data-testid="apsf-phase"
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-sm font-semibold ${phaseColor(phase)}`}
                  >
                    <CircleDot size={12} /> {phase || '—'}
                  </span>
                )}
                <button
                  onClick={() => detectPhase(selected)}
                  disabled={phaseLoading}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-400 disabled:opacity-50"
                  title="Re-detect phase (runs `apsf next`)"
                >
                  <RefreshCw size={14} />
                </button>
                {HUMAN_PHASES.includes(phase) && (
                  <span className="text-xs text-amber-400">human-owned phase</span>
                )}
              </div>
            </div>

            {/* 実行コントロール */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={command}
                  onChange={(e) => setCommand(e.target.value as ApsfCommand)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                  data-testid="apsf-command"
                >
                  <option value="plan">plan</option>
                  <option value="build">build</option>
                  <option value="review">review</option>
                  <option value="full-cycle">full-cycle (auto-loop)</option>
                </select>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as 'claude' | 'codex')}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                  data-testid="apsf-provider"
                >
                  <option value="claude">claude</option>
                  <option value="codex">codex</option>
                </select>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={dryRun}
                    onChange={(e) => setDryRun(e.target.checked)}
                    className="rounded"
                  />
                  DryRun（AI 実行なし・プロンプト確認のみ）
                </label>
                <button
                  onClick={handleExecute}
                  disabled={executing}
                  data-testid="apsf-execute"
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
                >
                  {executing ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}
                  {executing ? 'Executing...' : 'Execute'}
                </button>
              </div>
              {!dryRun && (
                <p className="text-xs text-amber-400">
                  ⚠ 実 AI を起動します（トークン消費・時間がかかります）
                </p>
              )}
            </div>

            {/* ライブログ */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 max-h-80 overflow-y-auto font-mono text-xs" data-testid="apsf-log">
              {logs.length === 0 ? (
                <p className="text-slate-600">No output yet.</p>
              ) : (
                logs.map((l, i) => (
                  <pre
                    key={i}
                    className={`whitespace-pre-wrap break-all ${
                      l.kind === 'error'
                        ? 'text-red-400'
                        : l.kind === 'complete'
                          ? 'text-green-400'
                          : l.kind === 'info'
                            ? 'text-blue-400'
                            : 'text-slate-300'
                    }`}
                  >
                    {l.text}
                  </pre>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500">
            Select a run from the list
          </div>
        )}
      </div>
    </div>
  );
};
