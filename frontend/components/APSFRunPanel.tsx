import React from 'react';
import { Loader2 } from 'lucide-react';
import { useAPSFRunPanel } from '../hooks/useAPSFRunPanel';
import { ArtifactViewer } from './ArtifactViewer';
import { RunListPanel } from './apsf/RunListPanel';
import { PhaseStatusPanel } from './apsf/PhaseStatusPanel';
import { PhaseEditor } from './apsf/PhaseEditor';
import { ExecutionControls } from './apsf/ExecutionControls';
import { ExecutionQueue } from './apsf/ExecutionQueue';
import { LogPane } from './apsf/LogPane';

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
export const APSFRunPanel: React.FC = () => {
  const h = useAPSFRunPanel();

  if (h.available === null) {
    return (
      <div className="flex items-center gap-2 text-slate-400 p-8">
        <Loader2 className="animate-spin" size={18} /> Loading APSF framework status...
      </div>
    );
  }

  if (!h.available) {
    return (
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl text-slate-400" data-testid="apsf-unavailable">
        <h2 className="text-lg font-semibold text-slate-200 mb-2">APSF Framework not connected</h2>
        <p className="text-sm">
          backend の環境変数 <code className="text-blue-400">APSF_ROOT</code> に
          ai-problem-solving-framework のパスを設定してください。
        </p>
        {h.loadError && <p className="text-sm text-red-400 mt-2">{h.loadError}</p>}
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3" data-testid="apsf-panel">
      <RunListPanel
        runs={h.runs}
        selected={h.selected}
        onSelect={h.setSelected}
        apsfRoot={h.apsfRoot}
        showCreate={h.showCreate}
        onToggleCreate={() => h.setShowCreate(!h.showCreate)}
        onRefresh={h.loadRuns}
        newRunName={h.newRunName}
        onNewRunNameChange={h.setNewRunName}
        newRunLight={h.newRunLight}
        onNewRunLightChange={h.setNewRunLight}
        creating={h.creating}
        onCreateRun={h.handleCreateRun}
      />

      <div className="lg:col-span-2 space-y-4">
        {h.selected ? (
          <>
            <PhaseStatusPanel
              selected={h.selected}
              phase={h.phase}
              phaseLoading={h.phaseLoading}
              phaseStatus={h.phaseStatus}
              lastError={h.lastError}
              fileToWrite={h.fileToWrite}
              nextRole={h.nextRole}
              advisory={h.advisory}
              judgeReason={h.judgeReason}
              onJudgeReasonChange={h.setJudgeReason}
              judging={h.judging}
              onDetectPhase={() => h.detectPhase(h.selected)}
              onOpenEditor={h.openEditor}
              onJudgeDecision={h.handleJudgeDecision}
            />

            <ArtifactViewer runId={h.selected} existingFiles={h.existingFiles} />

            {h.showEditor && (
              <PhaseEditor
                fileToWrite={h.fileToWrite}
                editorContent={h.editorContent}
                onContentChange={h.setEditorContent}
                editorLoading={h.editorLoading}
                saving={h.saving}
                onSave={h.handleSavePhase}
                onClose={() => h.setShowEditor(false)}
              />
            )}

            <ExecutionControls
              command={h.command}
              onCommandChange={h.setCommand}
              provider={h.provider}
              onProviderChange={h.setProvider}
              dryRun={h.dryRun}
              onDryRunChange={h.setDryRun}
              selectedActive={h.selectedActive}
              submitting={h.submitting}
              onExecute={h.handleExecute}
              queueState={h.queueState}
              selected={h.selected}
            />

            <ExecutionQueue
              queueState={h.queueState}
              onCancelQueued={h.handleCancelQueued}
            />

            <LogPane
              logs={h.logs}
              logEndRef={h.logEndRef}
              executions={h.executions}
              executionsLoading={h.executionsLoading}
              executionsError={h.executionsError}
              onRetryExecutions={() => h.loadExecutions(h.selected)}
              viewTranscript={h.viewTranscript}
              onSelectTranscript={h.handleSelectTranscript}
              transcriptLogs={h.transcriptLogs}
              transcriptLoading={h.transcriptLoading}
              transcriptError={h.transcriptError}
            />
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
