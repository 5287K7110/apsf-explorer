import React from 'react';
import { Loader2, Play, ChevronDown, ChevronRight } from 'lucide-react';
import { ApsfCommand, RoleProviders, ExecuteSpecialists, ApsfSpecialist } from '../../services/apsfAPI';

interface Props {
  command: ApsfCommand;
  onCommandChange: (v: ApsfCommand) => void;
  provider: 'claude' | 'codex';
  onProviderChange: (v: 'claude' | 'codex') => void;
  roleProviders: RoleProviders;
  availableSpecialists: ApsfSpecialist[];
  specialistOverride: ExecuteSpecialists;
  onSpecialistOverrideChange: (v: ExecuteSpecialists) => void;
  onRoleProvidersChange: (v: RoleProviders) => void;
  showRoleProviders: boolean;
  onShowRoleProvidersChange: (v: boolean) => void;
  dryRun: boolean;
  onDryRunChange: (v: boolean) => void;
  selectedActive: boolean;
  submitting: boolean;
  onExecute: () => void;
  queueState: { running: string | null; queued: string[] };
  selected: string;
}

const ROLE_LABELS: { key: keyof RoleProviders; label: string }[] = [
  { key: 'plan', label: 'Planner' },
  { key: 'build', label: 'Builder' },
  { key: 'review', label: 'Critic' },
];

export const ExecutionControls: React.FC<Props> = ({
  command, onCommandChange, provider, onProviderChange,
  roleProviders, onRoleProvidersChange, showRoleProviders, onShowRoleProvidersChange,
  availableSpecialists, specialistOverride, onSpecialistOverrideChange,
  dryRun, onDryRunChange, selectedActive, submitting,
  onExecute, queueState, selected,
}) => (
  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
    <div className="flex items-center gap-3 flex-wrap">
      <select
        value={command}
        onChange={(e) => onCommandChange(e.target.value as ApsfCommand)}
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
        onChange={(e) => onProviderChange(e.target.value as 'claude' | 'codex')}
        className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
        data-testid="apsf-provider"
      >
        <option value="claude">claude</option>
        <option value="codex">codex</option>
      </select>
      <button
        type="button"
        onClick={() => onShowRoleProvidersChange(!showRoleProviders)}
        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition"
        data-testid="apsf-role-providers-toggle"
      >
        {showRoleProviders ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        役割別
      </button>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={dryRun}
          onChange={(e) => onDryRunChange(e.target.checked)}
          className="rounded"
        />
        DryRun（AI 実行なし・プロンプト確認のみ）
      </label>
      <button
        onClick={onExecute}
        disabled={selectedActive || submitting}
        data-testid="apsf-execute"
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
      >
        {selectedActive || submitting ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}
        {queueState.running === selected
          ? 'Executing...'
          : queueState.queued.includes(selected)
            ? `Queued (#${queueState.queued.indexOf(selected) + 1})`
            : 'Execute'}
      </button>
    </div>
    {showRoleProviders && (
      <div className="flex items-center gap-4 pl-2 text-xs text-slate-400" data-testid="apsf-role-providers">
        {ROLE_LABELS.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-1">
            <span className="w-14">{label}:</span>
            <select
              value={roleProviders[key] || ''}
              onChange={(e) =>
                onRoleProvidersChange({
                  ...roleProviders,
                  [key]: e.target.value || undefined,
                })
              }
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
              data-testid={`apsf-role-provider-${key}`}
            >
              <option value="">(既定)</option>
              <option value="claude">claude</option>
              <option value="codex">codex</option>
            </select>
          </label>
        ))}
      </div>
    )}
    {showRoleProviders && availableSpecialists.length > 0 && (
      <div className="flex items-center gap-4 pl-2 text-xs text-slate-400 flex-wrap" data-testid="apsf-specialists">
        {([
          { key: 'planner' as const, label: 'Planner' },
          { key: 'critic' as const, label: 'Critic' },
        ]).map(({ key, label }) => (
          <label key={key} className="flex items-center gap-1">
            <span className="w-14">{label}:</span>
            <select
              value={specialistOverride[key] || ''}
              onChange={(e) =>
                onSpecialistOverrideChange({
                  ...specialistOverride,
                  [key]: e.target.value || undefined,
                })
              }
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 max-w-[280px]"
              data-testid={`apsf-specialist-${key}`}
            >
              <option value="">Auto（キーワード採点）</option>
              {availableSpecialists
                .filter((sp) => sp.kind === key)
                .map((sp) => (
                  <option key={sp.code} value={sp.code} title={sp.summary}>
                    {sp.code} {sp.name}
                  </option>
                ))}
            </select>
          </label>
        ))}
        <span className="text-slate-600">Specialist（未指定は自動選択 — 該当なしの場合は生成を提案します）</span>
      </div>
    )}
    {!dryRun && (
      <p className="text-xs text-amber-400">
        ⚠ 実 AI を起動します（トークン消費・時間がかかります）
      </p>
    )}
  </div>
);
