import { useCallback, useEffect, useRef, useState } from 'react';
import {
  apsfAPI, ApsfCommand, ApsfAdvisory, ApsfJudgeDecision, ApsfExecutionMeta,
} from '../services/apsfAPI';
import { wsClient } from '../utils/wsClient';

export interface LogLine {
  ts: number;
  kind: 'progress' | 'complete' | 'error' | 'log' | 'info';
  text: string;
}

export function useAPSFRunPanel() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [apsfRoot, setApsfRoot] = useState<string | null>(null);
  const [runs, setRuns] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [phase, setPhase] = useState<string>('');
  const [fileToWrite, setFileToWrite] = useState<string>('');
  const [nextRole, setNextRole] = useState<string>('');
  const [phaseStatus, setPhaseStatus] = useState<string>('');
  const [lastError, setLastError] = useState<string>('');
  const [existingFiles, setExistingFiles] = useState<string[]>([]);
  const [phaseLoading, setPhaseLoading] = useState(false);
  const [command, setCommand] = useState<ApsfCommand>('plan');
  const [provider, setProvider] = useState<'claude' | 'codex'>('claude');
  const [dryRun, setDryRun] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
  // 実行キュー
  const [queueState, setQueueState] = useState<{ running: string | null; queued: string[] }>({
    running: null,
    queued: [],
  });
  // 過去実行トランスクリプト
  const [executions, setExecutions] = useState<ApsfExecutionMeta[]>([]);
  const [executionsLoading, setExecutionsLoading] = useState(false);
  const [executionsError, setExecutionsError] = useState<string | null>(null);
  const [viewTranscript, setViewTranscript] = useState('');
  const [transcriptLogs, setTranscriptLogs] = useState<LogLine[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const appendLog = useCallback((kind: LogLine['kind'], text: string) => {
    setLogs((prev) => [...prev.slice(-200), { ts: Date.now(), kind, text }]);
  }, []);

  // run 一覧の取得
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

  // キュー状態: マウント時に取得 + canonical queue イベントでライブ更新
  useEffect(() => {
    apsfAPI.getQueue().then(setQueueState).catch(() => { /* best-effort */ });
    const onQueue = (msg: any) => {
      if (msg.data && 'queued' in msg.data) {
        setQueueState({ running: msg.data.running ?? null, queued: msg.data.queued ?? [] });
      }
    };
    wsClient.on('queue', onQueue);
    return () => wsClient.off('queue', onQueue);
  }, []);

  // フェーズ検出（+ advisory）
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
      setExistingFiles(res.existingFiles || []);
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

  // 過去実行トランスクリプトの一覧取得
  const loadExecutions = useCallback(async (runId: string) => {
    if (!runId) return;
    setExecutionsLoading(true);
    try {
      const res = await apsfAPI.getExecutions(runId);
      setExecutions(res.executions);
      setExecutionsError(null);
    } catch (e) {
      setExecutions([]);
      setExecutionsError(e instanceof Error ? e.message : '過去の実行一覧を取得できませんでした');
    } finally {
      setExecutionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) {
      setLogs([]);
      setShowEditor(false);
      setViewTranscript('');
      setTranscriptLogs([]);
      setTranscriptError(null);
      setExecutionsError(null);
      setExistingFiles([]);
      detectPhase(selected);
      loadExecutions(selected);
    }
  }, [selected, detectPhase, loadExecutions]);

  // 過去実行の選択
  const handleSelectTranscript = async (file: string) => {
    setViewTranscript(file);
    setTranscriptError(null);
    if (!file) return;
    setTranscriptLoading(true);
    setTranscriptLogs([]);
    try {
      const res = await apsfAPI.getExecutionTranscript(selected, file);
      setTranscriptLogs(res.events.map((e): LogLine => ({
        ts: e.ts,
        kind: e.type === 'error' ? 'error' : e.type === 'complete' ? 'complete' : e.type === 'start' ? 'info' : 'log',
        text: e.type === 'progress'
          ? String(e.data?.message ?? '').trimEnd()
          : `[${e.type}] ${JSON.stringify(e.data ?? {})}`,
      })).filter((l) => l.text));
    } catch (e) {
      setTranscriptError(e instanceof Error ? e.message : '選択した実行ログを読み込めませんでした');
    } finally {
      setTranscriptLoading(false);
    }
  };

  // WebSocket イベント購読
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
        detectPhase(selectedRef.current);
        loadExecutions(selectedRef.current);
      }
    };

    const onProgress = onEvent('progress');
    const onComplete = onEvent('complete');
    const onError = onEvent('error');
    const onLog = onEvent('log');
    const onQueued = onEvent('info');
    const onStarted = onEvent('info');
    wsClient.on('progress', onProgress);
    wsClient.on('complete', onComplete);
    wsClient.on('error', onError);
    wsClient.on('log', onLog);
    wsClient.on('queued', onQueued);
    wsClient.on('started', onStarted);
    return () => {
      wsClient.off('progress', onProgress);
      wsClient.off('complete', onComplete);
      wsClient.off('error', onError);
      wsClient.off('log', onLog);
      wsClient.off('queued', onQueued);
      wsClient.off('started', onStarted);
    };
  }, [appendLog, detectPhase, loadExecutions]);

  // ログの自動スクロール
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const selectedActive =
    queueState.running === selected || queueState.queued.includes(selected);

  const handleExecute = async () => {
    if (!selected || selectedActive || submitting) return;
    setSubmitting(true);
    appendLog('info', `実行要求: ${command} (provider=${provider}${dryRun ? ', DryRun' : ''})`);
    try {
      await apsfAPI.execute(selected, command, provider, dryRun);
    } catch (e) {
      appendLog('error', e instanceof Error ? e.message : 'execute request failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelQueued = async (runId: string) => {
    try {
      await apsfAPI.cancel(runId);
      const qs = await apsfAPI.getQueue();
      setQueueState(qs);
    } catch (e) {
      appendLog('error', e instanceof Error ? e.message : 'cancel failed');
    }
  };

  const handleCreateRun = async () => {
    const name = newRunName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
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
      setEditorContent('');
    } finally {
      setEditorLoading(false);
    }
  };

  const handleJudgeDecision = async (decision: ApsfJudgeDecision) => {
    if (!selected || judging) return;
    if (decision === 'Accept') {
      setJudging(true);
      try {
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

  return {
    // Framework status
    available, apsfRoot, loadError,
    // Run list
    runs, selected, setSelected, loadRuns,
    // Run creation
    showCreate, setShowCreate, newRunName, setNewRunName, newRunLight, setNewRunLight, creating, handleCreateRun,
    // Phase
    phase, phaseLoading, phaseStatus, lastError, fileToWrite, nextRole, existingFiles, detectPhase,
    // Execution
    command, setCommand, provider, setProvider, dryRun, setDryRun,
    submitting, selectedActive, handleExecute,
    // Queue
    queueState, handleCancelQueued,
    // Editor
    showEditor, setShowEditor, editorContent, setEditorContent, editorLoading, saving, handleSavePhase, openEditor,
    // Judge
    advisory, judgeReason, setJudgeReason, judging, handleJudgeDecision,
    // Logs
    logs, logEndRef,
    // Transcripts
    executions, executionsLoading, executionsError, loadExecutions,
    viewTranscript, transcriptLogs, transcriptLoading, transcriptError, handleSelectTranscript,
  };
}
