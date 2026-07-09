import React from 'react';
import { Loader2 } from 'lucide-react';
import type { LogLine } from '../../hooks/useAPSFRunPanel';
import type { ApsfExecutionMeta } from '../../services/apsfAPI';

interface Props {
  logs: LogLine[];
  logEndRef: React.RefObject<HTMLDivElement>;
  executions: ApsfExecutionMeta[];
  executionsLoading: boolean;
  executionsError: string | null;
  onRetryExecutions: () => void;
  viewTranscript: string;
  onSelectTranscript: (file: string) => void;
  transcriptLogs: LogLine[];
  transcriptLoading: boolean;
  transcriptError: string | null;
}

export const LogPane: React.FC<Props> = ({
  logs, logEndRef,
  executions, executionsLoading, executionsError, onRetryExecutions,
  viewTranscript, onSelectTranscript,
  transcriptLogs, transcriptLoading, transcriptError,
}) => {
  const displayLogs = viewTranscript ? transcriptLogs : logs;

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl" data-testid="apsf-log-pane">
      <div className="flex items-center gap-2 px-4 pt-3 flex-wrap">
        <select
          value={viewTranscript}
          onChange={(e) => onSelectTranscript(e.target.value)}
          disabled={executionsLoading}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 disabled:opacity-50"
          data-testid="apsf-transcript-select"
        >
          <option value="">ライブ</option>
          {executions.map((x) => (
            <option key={x.file} value={x.file}>
              {new Date(x.startedAt).toLocaleString()} ({(x.sizeBytes / 1024).toFixed(1)} KB)
            </option>
          ))}
        </select>
        {executionsLoading && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Loader2 className="animate-spin" size={10} /> 過去の実行を読み込み中...
          </span>
        )}
        {!executionsLoading && executionsError && (
          <span className="flex items-center gap-2 text-xs text-red-400" data-testid="apsf-executions-error">
            過去の実行を読み込めませんでした
            <button
              onClick={onRetryExecutions}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
            >
              再試行
            </button>
          </span>
        )}
        {!executionsLoading && !executionsError && executions.length === 0 && (
          <span className="text-xs text-slate-500" data-testid="apsf-executions-empty">
            過去の実行はまだありません
          </span>
        )}
        {viewTranscript && (
          <span className="text-xs text-slate-500">過去の実行トランスクリプト（読み取り専用）</span>
        )}
      </div>
      <div className="p-4 max-h-80 overflow-y-auto font-mono text-xs" data-testid="apsf-log">
        {transcriptLoading ? (
          <p className="flex items-center gap-2 text-slate-400">
            <Loader2 className="animate-spin" size={12} /> loading transcript...
          </p>
        ) : viewTranscript && transcriptError ? (
          <div className="space-y-2" data-testid="apsf-transcript-error">
            <p className="text-red-400">選択した実行ログを読み込めませんでした: {transcriptError}</p>
            <div className="flex gap-2">
              <button
                onClick={() => onSelectTranscript(viewTranscript)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
              >
                再試行
              </button>
              <button
                onClick={() => onSelectTranscript('')}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
              >
                ライブに戻る
              </button>
            </div>
          </div>
        ) : displayLogs.length === 0 ? (
          <p className="text-slate-600">
            {viewTranscript
              ? 'この実行には表示できるログ行がありません'
              : 'No output yet.'}
          </p>
        ) : (
          displayLogs.map((l, i) => (
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
        {!viewTranscript && <div ref={logEndRef} />}
      </div>
    </div>
  );
};
