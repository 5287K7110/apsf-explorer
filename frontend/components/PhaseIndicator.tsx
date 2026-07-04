import React from 'react';
import { Phase, Run } from '../types';
import {
  CheckCircle2,
  Circle,
  AlertCircle,
  Zap,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface PhaseIndicatorProps {
  run: Run;
}

const phaseNames: Record<Phase, string> = {
  planning: 'Planning',
  building: 'Building',
  reviewing: 'Reviewing',
  judging: 'Judging',
  complete: 'Complete',
};

const phaseDescriptions: Record<Phase, string> = {
  planning: 'Analyzing requirements and planning solution',
  building: 'Building and implementing solution',
  reviewing: 'Code review and quality checks',
  judging: 'Evaluating against acceptance criteria',
  complete: 'Run completed successfully',
};

export const PhaseIndicator: React.FC<PhaseIndicatorProps> = ({ run }) => {
  const phases: Phase[] = ['planning', 'building', 'reviewing', 'judging', 'complete'];
  const currentPhaseIndex = phases.indexOf(run.currentPhase);

  return (
    <div className="card space-y-6">
      {/* Status header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">
            {phaseNames[run.currentPhase]}
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            {phaseDescriptions[run.currentPhase]}
          </p>
        </div>
        <div className="flex-shrink-0">
          {run.status === 'success' && (
            <span className="badge badge-success">Completed</span>
          )}
          {run.status === 'failed' && (
            <span className="badge badge-error">Failed</span>
          )}
          {run.status === 'running' && (
            <span className="badge badge-warning">In Progress</span>
          )}
          {run.status === 'queued' && (
            <span className="badge badge-info">Queued</span>
          )}
        </div>
      </div>

      {/* Overall progress bar */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-300">
            Overall Progress
          </span>
          <span className="text-sm font-bold text-primary-400">
            {run.progress}%
          </span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${run.progress}%` }}
          />
        </div>
      </div>

      {/* Phase timeline */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Phase Timeline
        </h4>
        <div className="space-y-2">
          {phases.map((phase, index) => {
            const isCompleted = index < currentPhaseIndex;
            const isActive = index === currentPhaseIndex;
            const isPending = index > currentPhaseIndex;

            const phaseStep = run.phases.find((p) => p.phase === phase);
            const isError = phaseStep?.status === 'pending' && phaseStep?.errorMessage;

            return (
              <div
                key={phase}
                className="flex items-center gap-3 rounded-lg p-3 hover:bg-slate-800/50 transition-colors"
              >
                {/* Icon */}
                <div className="flex-shrink-0">
                  {isCompleted && (
                    <CheckCircle2 className="h-5 w-5 text-success-400" />
                  )}
                  {isActive && (
                    <Zap className="h-5 w-5 text-warning-400 animate-pulse" />
                  )}
                  {isPending && !isError && (
                    <Circle className="h-5 w-5 text-slate-600" />
                  )}
                  {isError && (
                    <AlertCircle className="h-5 w-5 text-error-400" />
                  )}
                </div>

                {/* Phase info */}
                <div className="flex-1">
                  <p
                    className={`text-sm font-medium ${
                      isActive
                        ? 'text-primary-400'
                        : isCompleted
                        ? 'text-slate-300'
                        : 'text-slate-500'
                    }`}
                  >
                    {phaseNames[phase]}
                  </p>
                  {phaseStep && phaseStep.completedAt && (
                    <p className="text-xs text-slate-500">
                      Completed{' '}
                      {formatDistanceToNow(phaseStep.completedAt, {
                        addSuffix: true,
                      })}
                    </p>
                  )}
                  {isActive && (
                    <p className="text-xs text-slate-400">In progress...</p>
                  )}
                </div>

                {/* Duration */}
                {phaseStep && phaseStep.completedAt && (
                  <div className="flex-shrink-0">
                    <p className="text-xs font-medium text-slate-400">
                      {Math.round(
                        (phaseStep.completedAt - phaseStep.startedAt) / 1000
                      )}
                      s
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Timing info */}
      <div className="grid grid-cols-3 gap-4 border-t border-slate-700 pt-4">
        <div>
          <p className="text-xs text-slate-500">Elapsed Time</p>
          <p className="mt-1 font-semibold text-slate-100">
            {Math.floor(run.elapsedTime / 60000)}m{' '}
            {Math.floor((run.elapsedTime % 60000) / 1000)}s
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Retries</p>
          <p className="mt-1 font-semibold text-slate-100">{run.retryCount}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Status</p>
          <p className="mt-1 font-semibold capitalize text-slate-100">
            {run.status}
          </p>
        </div>
      </div>
    </div>
  );
};
