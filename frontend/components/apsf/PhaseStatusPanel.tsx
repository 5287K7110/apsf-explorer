import React from 'react';
import { CircleDot, Loader2, PenLine, RefreshCw, Scale } from 'lucide-react';
import { ApsfAdvisory, ApsfJudgeDecision } from '../../services/apsfAPI';
import { isHumanPhase } from '../../../backend/src/services/apsf-native/phases';

function phaseColor(phase: string): string {
  if (phase === 'COMPLETE') return 'text-green-400 border-green-700 bg-green-900/30';
  if (isHumanPhase(phase)) return 'text-amber-400 border-amber-700 bg-amber-900/30';
  return 'text-blue-400 border-blue-700 bg-blue-900/30';
}

interface Props {
  selected: string;
  phase: string;
  phaseLoading: boolean;
  phaseStatus: string;
  lastError: string;
  fileToWrite: string;
  nextRole: string;
  advisory: ApsfAdvisory | null;
  judgeReason: string;
  onJudgeReasonChange: (v: string) => void;
  judging: boolean;
  onDetectPhase: () => void;
  onOpenEditor: () => void;
  onJudgeDecision: (d: ApsfJudgeDecision) => void;
}

export const PhaseStatusPanel: React.FC<Props> = ({
  selected, phase, phaseLoading, phaseStatus, lastError,
  fileToWrite, nextRole, advisory,
  judgeReason, onJudgeReasonChange, judging,
  onDetectPhase, onOpenEditor, onJudgeDecision,
}) => (
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
        onClick={onDetectPhase}
        disabled={phaseLoading}
        className="p-1.5 rounded hover:bg-slate-800 text-slate-400 disabled:opacity-50"
        title="Re-detect phase"
      >
        <RefreshCw size={14} />
      </button>
      {nextRole && (
        <span className="text-xs text-slate-500">next: {nextRole}</span>
      )}
      {isHumanPhase(phase) && fileToWrite && fileToWrite !== '(none)' && (
        <button
          onClick={onOpenEditor}
          data-testid="apsf-edit-phase"
          className="flex items-center gap-1.5 px-3 py-1 bg-amber-700/60 hover:bg-amber-700 text-amber-100 text-xs font-semibold rounded-full transition"
        >
          <PenLine size={12} /> {fileToWrite} を記入
        </button>
      )}
    </div>

    {/* クラッシュ回復による failed 表示 */}
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

    {/* Judge 裁定（IMPROVE_NEEDED） */}
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
          onChange={(e) => onJudgeReasonChange(e.target.value)}
          rows={3}
          placeholder="差し戻し理由（Return to Build / Return to Plan で必須）"
          className="w-full px-2 py-1.5 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 font-mono resize-y focus:border-amber-600 focus:outline-none"
          data-testid="apsf-judge-reason"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onJudgeDecision('Accept')}
            disabled={judging}
            data-testid="apsf-judge-accept"
            className="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-semibold rounded transition"
          >
            Accept
          </button>
          <button
            onClick={() => onJudgeDecision('Return to Build')}
            disabled={judging || !judgeReason.trim()}
            data-testid="apsf-judge-return-build"
            className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold rounded transition"
          >
            Return to Build
          </button>
          <button
            onClick={() => onJudgeDecision('Return to Plan')}
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
);
