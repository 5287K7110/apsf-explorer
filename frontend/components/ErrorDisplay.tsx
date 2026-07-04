import React, { useState } from 'react';
import { Run } from '../types';
import { AlertTriangle, ChevronDown, RotateCcw } from 'lucide-react';

interface ErrorDisplayProps {
  run: Run;
  onRetry?: () => void;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  run,
  onRetry,
}) => {
  const [showStack, setShowStack] = useState(false);

  if (!run.lastError) {
    return null;
  }

  return (
    <div className="card border-l-4 border-error-500 space-y-4 bg-error-500/5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 flex-shrink-0 text-error-500 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-error-400">
              Error in {run.lastError.phase || 'Unknown Phase'}
            </h3>
            <p className="mt-2 text-slate-100">{run.lastError.message}</p>
          </div>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="btn btn-primary btn-sm flex-shrink-0"
          >
            <RotateCcw size={16} />
            Retry
          </button>
        )}
      </div>

      {/* Stack trace toggle */}
      {run.lastError.stack && (
        <>
          <button
            onClick={() => setShowStack(!showStack)}
            className="flex w-full items-center justify-between rounded-lg bg-slate-800/50 p-3 text-left hover:bg-slate-800 transition-colors"
          >
            <span className="text-sm font-medium text-slate-300">
              Stack Trace
            </span>
            <ChevronDown
              size={18}
              className={`text-slate-500 transition-transform ${
                showStack ? 'rotate-180' : ''
              }`}
            />
          </button>

          {showStack && (
            <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-400 font-mono">
              <code>{run.lastError.stack}</code>
            </pre>
          )}
        </>
      )}

      {/* Recovery suggestions */}
      <div className="space-y-2 border-t border-error-500/20 pt-4">
        <h4 className="text-sm font-semibold text-slate-300">
          Suggested Next Steps
        </h4>
        <ul className="list-inside list-disc space-y-1 text-sm text-slate-400">
          <li>Review the error message and stack trace</li>
          <li>Check if dependencies are properly installed</li>
          <li>Verify all input parameters are correct</li>
          <li>Try the Retry button to run again</li>
        </ul>
      </div>
    </div>
  );
};
