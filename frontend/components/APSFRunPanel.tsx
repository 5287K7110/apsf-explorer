import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  RefreshCw, Play, FolderGit2, CircleDot, Loader2, Plus, Save,
  PenLine, Scale, X,
} from 'lucide-react';
import { apsfAPI, ApsfCommand, ApsfAdvisory, ApsfJudgeDecision } from '../services/apsfAPI';
import { wsClient } from '../utils/wsClient';
// フェーズ定義は backend と共有（apsf-native/phases.ts が単一の正）
import { isHumanPhase } from '../../backend/src/services/apsf-native/phases';

/**
 * APSF Run Panel — 実 APSF Framework の run を操作する
 *
 * - run 一覧 / 作成（apsf start-run 経由）
 * - フェーズ検出（TS ネイティブ、parity 検証済み）
 * - AI フェーズ実行（plan/build/review/full-cycle、DryRun 対応）
 * - human フェーズの記入（apsf write-phase 経由 — 上書き保護・遷移付き）
 * - Judge advisory（judge_advisory.json）の表示
 * - WebSocket progress/complete/error をライブログ表示
 */

function phaseColor(phase: string): string {
  if (phase === 'COMPLETE') return 'text-green-400 border-green-700 bg-green-900/30';
  if (isHumanPhase(phase)) return 'text-amber-400 border-amber-700 bg-amber-900/30';
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
  const [fileToWrite, setFileToWrite] = useState<string>('');
  const [nextRole, setNextRole] = useState<string>('');
  const [phaseStatus, setPhaseStatus] = useState<string>('');
  const [lastError, setLastError] = useState<string>('');
  const [phaseLoading, setPhaseLoading] = useState(false);
  const [command, setCommand] = useState<ApsfCommand>('plan');
  const [provider, setProvider] = useState<'claude' | 'codex'>('claude');
  const [dryRun, setDryRun] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  // run 作成フォーム
  const [showCreate, setShowCreate] = useState(false);
  const [newRunName, setNewRunName] = useState('');
  const [newRunLight, setNewRunLight] = useState(true);
  const [creating, setCreating] = useState(false);
  // human フェーズエディタ
  const [showEditor, setShowEditor] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [editorLoading, setEditorLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Judge advisory
  const [advisory, setAdvisory] = useState<ApsfAdvisory | null>(null);
  // Judge 裁定（IMPROVE_NEEDED）
  const [judgeReason, setJudgeReason] = useState('');
  const [judging, setJudging] = useState(false);

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

  // 実フェーズ検出（+ advisory）
  const detectPhase = useCallback(async (runId: string) => {
    if (!runId) return;
    setPhaseLoading(true);
    setPhase('');
    setAdvisory(null);
    try {
      const res = await apsfAPI.getPhase(runId);
      setPhase(res.phase);
      setFileToWrite(res.fileToWrite || '');
      setNextRole(res.nextRole || '');
      setPhaseStatus(res.phaseStatus || '');
      setLastError(res.lastError || '');
      // IMPROVE 系フェーズでは Judge advisory を取得
      if (res.phase.startsWith('IMPROVE')) {
        try {
          const adv = await apsfAPI.getAdvisory(runId);
          setAdvisory(adv.advisory);
        } catch { /* advisory は任意 */ }
      }
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
      setShowEditor(false);
      detectPhase(selected);
    }
  }, [selected, detectPhase]);

  // WebSocket イベント購読（選択中 run のみ）
  useEffect(() => {
    const onEvent = (kind: LogLine['kind']) => (data: any) => {
      if (data.runId !== selectedRef.current) return;
      const text =
        kind === 'complete'
          ? `完了 (phase=${data.data?.phase ?? '?'}${data.data?.stopReason ? `, stop=${data.data.stopReason}` : ''})`
          : kind === 'error'
            ? String(data.data?.error ?? 'unknown error')
            : String(data.data?.message ?? '').trimEnd();
      if (text) appendLog(kind, text);
      if (kind === 'complete' || kind === 'error') {
        setExecuting(false);
        // error でも再検出する: 実行失敗は phase_status=failed として
        // durable に記録されるため、failed バナーを即時反映する
        detectPhase(selectedRef.current);
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

  const handleCreateRun = async () => {
    const name = newRunName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      // 日付プレフィックスがなければローカル今日日付を付与（apsf start-run と同じ流儀。
      // toISOString は UTC のため JST 深夜帯で前日になる — backend 側と同じ修正）
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const fullName = /^\d{4}-\d{2}-\d{2}/.test(name) ? name : `${today}_${name}`;
      const res = await apsfAPI.createRun(fullName, { light: newRunLight, taxonomy: 'work' });
      setShowCreate(false);
      setNewRunName('');
      await loadRuns();
      setSelected(res.runName);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'run creation failed');
    } finally {
      setCreating(false);
    }
  };

  const openEditor = async () => {
    if (!selected || !fileToWrite || fileToWrite === '(none)') return;
    setEditorLoading(true);
    setShowEditor(true);
    try {
      const res = await apsfAPI.getFile(selected, fileToWrite);
      setEditorContent(res.content);
    } catch {
      // ファイル未作成 → 空から開始
      setEditorContent('');
    } finally {
      setEditorLoading(false);
    }
  };

  // Judge 裁定: Accept は improve.md エディタを開く（既存フロー）、
  // Return 系は理由必須で backend の canonical 遷移（actor=Judge）を実行する
  const handleJudgeDecision = async (decision: ApsfJudgeDecision) => {
    if (!selected || judging) return;
    if (decision === 'Accept') {
      setJudging(true);
      try {
        // 裁定を backend に記録（session_events）してから improve.md 記入へ
        await apsfAPI.judgeDecision(selected, 'Accept');
        appendLog('info', '裁定: Accept → improve.md を記入してください');
        openEditor();
      } catch (e) {
        appendLog('error', e instanceof Error ? e.message : 'judge decision failed');
      } finally {
        setJudging(false);
      }
      return;
    }
    const reason = judgeReason.trim();
    if (!reason) {
      appendLog('error', `${decision} には理由の記入が必要です`);
      return;
    }
    setJudging(true);
    try {
      const res = await apsfAPI.judgeDecision(selected, decision, reason);
      appendLog(
        'info',
        `裁定: ${decision} → phase=${res.phaseAfter}（理由: ${res.reasonFile} に記録）`
      );
      setJudgeReason('');
      detectPhase(selected);
    } catch (e) {
      appendLog('error', e instanceof Error ? e.message : 'judge decision failed');
    } finally {
      setJudging(false);
    }
  };

  const handleSavePhase = async () => {
    if (!selected || saving || !editorContent.trim()) return;
    setSaving(true);
    try {
      const res = await apsfAPI.writePhase(selected, editorContent);
      appendLog('info', `保存: ${res.fileWritten} → phase=${res.phase}`);
      setShowEditor(false);
      detectPhase(selected);
    } catch (e) {
      appendLog('error', e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
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
      <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col max-h-[75vh]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-2 font-semibold text-slate-200">
            <FolderGit2 size={16} /> APSF Runs ({runs.length})
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowCreate(!showCreate)}
              data-testid="apsf-new-run"
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400"
              title="New run"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={loadRuns}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400"
              title="Reload run list"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Run 作成フォーム */}
        {showCreate && (
          <div className="mb-3 p-3 bg-slate-800/60 border border-slate-700 rounded-lg space-y-2" data-testid="apsf-create-form">
            <input
              type="text"
              value={newRunName}
              onChange={(e) => setNewRunName(e.target.value)}
              placeholder="case-key_topic（日付は自動付与）"
              className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 font-mono"
              data-testid="apsf-new-run-name"
            />
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={newRunLight}
                onChange={(e) => setNewRunLight(e.target.checked)}
              />
              Light run（task.md から開始・最短フロー）
            </label>
            <button
              onClick={handleCreateRun}
              disabled={creating || !newRunName.trim()}
              data-testid="apsf-create-run"
              className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded transition"
            >
              {creating ? 'Creating...' : 'Create run'}
            </button>
          </div>
        )}

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
                  title="Re-detect phase"
                >
                  <RefreshCw size={14} />
                </button>
                {nextRole && (
                  <span className="text-xs text-slate-500">next: {nextRole}</span>
                )}
                {/* human フェーズは UI から直接記入できる */}
                {isHumanPhase(phase) && fileToWrite && fileToWrite !== '(none)' && (
                  <button
                    onClick={openEditor}
                    data-testid="apsf-edit-phase"
                    className="flex items-center gap-1.5 px-3 py-1 bg-amber-700/60 hover:bg-amber-700 text-amber-100 text-xs font-semibold rounded-full transition"
                  >
                    <PenLine size={12} /> {fileToWrite} を記入
                  </button>
                )}
              </div>

              {/* クラッシュ回復による failed 表示（再実行で回復できる） */}
              {phaseStatus === 'failed' && (
                <div className="mt-3 p-3 bg-red-950/50 border border-red-800 rounded-lg" data-testid="apsf-failed">
                  <p className="text-xs font-semibold text-red-300 mb-1">
                    前回の実行は異常終了しました（再実行で回復できます）
                  </p>
                  {lastError && (
                    <p className="text-xs text-red-400/80 font-mono break-all">{lastError}</p>
                  )}
                </div>
              )}

              {/* Judge advisory（IMPROVE 系フェーズ） */}
              {advisory && (
                <div className="mt-3 p-3 bg-slate-800/60 border border-slate-700 rounded-lg" data-testid="apsf-advisory">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 mb-1">
                    <Scale size={12} /> Judge Advisory
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        advisory.recommendation === 'Accept'
                          ? 'bg-green-900/50 text-green-300'
                          : 'bg-amber-900/50 text-amber-300'
                      }`}
                    >
                      {String(advisory.recommendation ?? 'unknown')}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 space-y-0.5">
                    <p>source: {String(advisory.advisory_source ?? '—')}</p>
                    {advisory.human_owned_blocker !== undefined && (
                      <p>human blocker: {String(advisory.human_owned_blocker)}</p>
                    )}
                    {advisory.ownership_status !== undefined && (
                      <p>ownership: {String(advisory.ownership_status)}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Judge 裁定（IMPROVE_NEEDED）: Accept / Return to Build / Return to Plan */}
              {phase === 'IMPROVE_NEEDED' && (
                <div className="mt-3 p-3 bg-slate-800/40 border border-amber-800/60 rounded-lg space-y-2" data-testid="apsf-judge">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
                    <Scale size={12} /> Judge Decision
                    <span className="text-slate-500 font-normal">
                      Return 系は理由必須（build_review.md / plan_review.md に記録）
                    </span>
                  </div>
                  <textarea
                    value={judgeReason}
                    onChange={(e) => setJudgeReason(e.target.value)}
                    rows={3}
                    placeholder="差し戻し理由（Return to Build / Return to Plan で必須）"
                    className="w-full px-2 py-1.5 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 font-mono resize-y focus:border-amber-600 focus:outline-none"
                    data-testid="apsf-judge-reason"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => handleJudgeDecision('Accept')}
                      disabled={judging}
                      data-testid="apsf-judge-accept"
                      className="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-semibold rounded transition"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleJudgeDecision('Return to Build')}
                      disabled={judging || !judgeReason.trim()}
                      data-testid="apsf-judge-return-build"
                      className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold rounded transition"
                    >
                      Return to Build
                    </button>
                    <button
                      onClick={() => handleJudgeDecision('Return to Plan')}
                      disabled={judging || !judgeReason.trim()}
                      data-testid="apsf-judge-return-plan"
                      className="px-3 py-1.5 bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold rounded transition"
                    >
                      Return to Plan
                    </button>
                    {judging && <Loader2 className="animate-spin text-slate-400" size={14} />}
                  </div>
                </div>
              )}
            </div>

            {/* human フェーズエディタ */}
            {showEditor && (
              <div className="bg-slate-900 border border-amber-800/60 rounded-xl p-4 space-y-3" data-testid="apsf-editor">
                <div className="flex items-center justify-between">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                    <PenLine size={14} /> {fileToWrite}
                    <span className="text-xs text-slate-500 font-normal">
                      保存は apsf write-phase 経由（上書き保護・フェーズ遷移付き）
                    </span>
                  </h4>
                  <button
                    onClick={() => setShowEditor(false)}
                    className="p-1 rounded hover:bg-slate-800 text-slate-400"
                  >
                    <X size={14} />
                  </button>
                </div>
                {editorLoading ? (
                  <div className="flex items-center gap-2 text-slate-400 text-sm py-8 justify-center">
                    <Loader2 className="animate-spin" size={16} /> loading...
                  </div>
                ) : (
                  <textarea
                    value={editorContent}
                    onChange={(e) => setEditorContent(e.target.value)}
                    rows={14}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono resize-y focus:border-amber-600 focus:outline-none"
                    data-testid="apsf-editor-textarea"
                    placeholder="Markdown で記入..."
                  />
                )}
                <button
                  onClick={handleSavePhase}
                  disabled={saving || !editorContent.trim()}
                  data-testid="apsf-save-phase"
                  className="flex items-center gap-2 px-4 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
                >
                  {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                  {saving ? 'Saving...' : `Save ${fileToWrite}`}
                </button>
              </div>
            )}

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
