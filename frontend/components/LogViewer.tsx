import React, { useState } from 'react';
import { Run } from '../types';
import { ChevronDown, Copy } from 'lucide-react';

interface LogViewerProps {
  run: Run;
}

export const LogViewer: React.FC<LogViewerProps> = ({ run }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const currentPhaseStep = run.phases.find((p) => p.phase === run.currentPhase);
  const logs = currentPhaseStep?.logOutput || '';

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-800/50 transition-colors border border-slate-700/50 text-left font-medium text-slate-100"
      >
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-primary-500" />
          Live Logs
        </span>
        <ChevronDown
          size={18}
          className={`text-slate-500 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {expanded && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex justify-end gap-2">
            <button
              onClick={handleCopyLogs}
              className="btn btn-sm btn-secondary flex items-center gap-1"
            >
              <Copy size={16} />
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* Log output */}
          <div className="max-h-96 overflow-y-auto rounded-lg bg-slate-950 p-4 border border-slate-700 font-mono text-sm text-slate-300">
            {logs ? (
              <pre className="whitespace-pre-wrap break-words">{logs}</pre>
            ) : (
              <p className="text-slate-500">No logs available yet...</p>
            )}
          </div>

          {/* Auto-scroll indicator */}
          <p className="text-xs text-slate-500">
            Showing logs for: <span className="text-slate-400 capitalize">{run.currentPhase}</span> phase
          </p>
        </div>
      )}
    </div>
  );
};
