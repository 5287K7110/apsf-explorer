import React, { useState } from 'react';
import { Run } from '../types';
import {
  CheckCircle2,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface DecisionFlowProps {
  run: Run;
}

const verdictColors = {
  pass: 'text-success-400 bg-success-400/10',
  improve: 'text-warning-400 bg-warning-400/10',
  redesign: 'text-error-400 bg-error-400/10',
  blocker: 'text-error-500 bg-error-500/10',
};

const verdictBorders = {
  pass: 'border-l-success-400',
  improve: 'border-l-warning-400',
  redesign: 'border-l-error-400',
  blocker: 'border-l-error-500',
};

export const DecisionFlow: React.FC<DecisionFlowProps> = ({ run }) => {
  const [expandedDecision, setExpandedDecision] = useState<string | null>(
    run.decisions[0]?.id || null
  );

  if (run.decisions.length === 0) {
    return (
      <div className="card text-center py-8">
        <AlertCircle className="h-8 w-8 text-slate-600 mx-auto mb-2" />
        <p className="text-slate-400">No decisions yet</p>
      </div>
    );
  }

  const latestDecision = run.decisions[0];

  return (
    <div className="space-y-4">
      {/* Latest verdict card */}
      {latestDecision && (
        <div
          className={`card border-l-4 space-y-4 ${verdictBorders[latestDecision.verdict]}`}
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm uppercase tracking-wide font-semibold text-slate-400">
                Latest Verdict
              </h3>
              <p
                className={`mt-2 text-2xl font-bold ${verdictColors[latestDecision.verdict].split(' ')[0]}`}
              >
                {latestDecision.verdict.toUpperCase()}
              </p>
            </div>
            <span className={`badge ${verdictColors[latestDecision.verdict]}`}>
              {latestDecision.phase}
            </span>
          </div>

          <p className="text-slate-100">{latestDecision.reasoning}</p>

          {latestDecision.criticalRisks && latestDecision.criticalRisks.length > 0 && (
            <div className="rounded-lg bg-error-500/10 p-3 border border-error-500/30">
              <h4 className="text-sm font-semibold text-error-400 mb-2">
                Critical Risks
              </h4>
              <ul className="list-inside list-disc space-y-1 text-sm text-error-300">
                {latestDecision.criticalRisks.map((risk, idx) => (
                  <li key={idx}>{risk}</li>
                ))}
              </ul>
            </div>
          )}

          {latestDecision.suggestedFixes.length > 0 && (
            <div className="rounded-lg bg-primary-500/10 p-3 border border-primary-500/30">
              <h4 className="text-sm font-semibold text-primary-400 mb-2">
                Suggested Improvements
              </h4>
              <ul className="list-inside list-disc space-y-1 text-sm text-primary-300">
                {latestDecision.suggestedFixes.map((fix, idx) => (
                  <li key={idx}>{fix}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-700">
            <span className="text-xs text-slate-500">
              {formatDistanceToNow(latestDecision.timestamp, { addSuffix: true })}
            </span>
            <span
              className={`badge ${
                latestDecision.accepted
                  ? 'badge-success'
                  : 'badge-warning'
              }`}
            >
              {latestDecision.accepted ? '✓ Accepted' : 'Pending Review'}
            </span>
          </div>
        </div>
      )}

      {/* Decision history */}
      {run.decisions.length > 1 && (
        <div className="card space-y-3">
          <h3 className="text-lg font-semibold text-slate-100">
            Decision History
          </h3>
          <div className="space-y-2">
            {run.decisions.map((decision) => (
              <button
                key={decision.id}
                onClick={() =>
                  setExpandedDecision(
                    expandedDecision === decision.id ? null : decision.id
                  )
                }
                className={`w-full text-left rounded-lg p-3 border border-slate-700 hover:border-slate-600 hover:bg-slate-800/50 transition-all ${
                  expandedDecision === decision.id ? 'bg-slate-800' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 flex-1">
                    {decision.verdict === 'pass' && (
                      <CheckCircle2 className="h-5 w-5 text-success-400 flex-shrink-0" />
                    )}
                    {decision.verdict !== 'pass' && (
                      <AlertCircle className="h-5 w-5 text-warning-400 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-slate-100 capitalize">
                        {decision.verdict}
                      </p>
                      <p className="text-xs text-slate-500">
                        {decision.phase} •{' '}
                        {formatDistanceToNow(decision.timestamp, {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    size={18}
                    className={`text-slate-500 flex-shrink-0 transition-transform ${
                      expandedDecision === decision.id ? 'rotate-180' : ''
                    }`}
                  />
                </div>

                {expandedDecision === decision.id && (
                  <div className="mt-4 space-y-3 border-t border-slate-700 pt-4">
                    <p className="text-sm text-slate-300">
                      {decision.reasoning}
                    </p>
                    {decision.suggestedFixes.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-400 mb-2">
                          Suggestions:
                        </p>
                        <ul className="list-inside list-disc space-y-1 text-xs text-slate-400">
                          {decision.suggestedFixes.map((fix, idx) => (
                            <li key={idx}>{fix}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
