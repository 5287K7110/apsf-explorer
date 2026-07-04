import React, { useState } from 'react';
import { useAPI } from '../hooks/useAPI';
import { useRunStore } from '../store/runStore';
import { useRoleStore } from '../store/roleStore';
import { Run, CommandType } from '../types';
import { RoleSelector } from './RoleSelector';
import {
  Zap,
  Hammer,
  CheckSquare,
  Scale,
  RotateCcw,
  Play,
} from 'lucide-react';

interface CommandPanelProps {
  run: Run;
}

const commands: Array<{
  type: CommandType;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  disabled?: boolean;
}> = [
  {
    type: 'plan',
    label: 'Plan',
    description: 'Analyze and plan solution',
    icon: <Zap size={18} />,
    color: 'bg-blue-600 hover:bg-blue-700',
  },
  {
    type: 'build',
    label: 'Build',
    description: 'Implement the solution',
    icon: <Hammer size={18} />,
    color: 'bg-purple-600 hover:bg-purple-700',
  },
  {
    type: 'review',
    label: 'Review',
    description: 'Code review & analysis',
    icon: <CheckSquare size={18} />,
    color: 'bg-green-600 hover:bg-green-700',
  },
  {
    type: 'judge',
    label: 'Judge',
    description: 'Evaluate criteria',
    icon: <Scale size={18} />,
    color: 'bg-amber-600 hover:bg-amber-700',
  },
  {
    type: 'retry',
    label: 'Retry',
    description: 'Recover from error',
    icon: <RotateCcw size={18} />,
    color: 'bg-red-600 hover:bg-red-700',
  },
  {
    type: 'full-cycle',
    label: 'Full Cycle',
    description: 'End-to-end run',
    icon: <Play size={18} />,
    color: 'bg-indigo-600 hover:bg-indigo-700',
  },
];

export const CommandPanel: React.FC<CommandPanelProps> = ({ run }) => {
  const { executeCommand, loading } = useAPI();
  const { selectedRoles } = useRoleStore();
  const [executing, setExecuting] = useState<CommandType | null>(null);
  const updateRun = useRunStore((state) => state.updateRun);

  const handleExecuteCommand = async (command: CommandType) => {
    setExecuting(command);
    try {
      // Get selected roles
      const roles = Object.entries(selectedRoles)
        .filter(([_, selected]) => selected)
        .map(([roleType]) => roleType);

      await executeCommand(run.id, command, {
        roles,
        onSuccess: () => {
          // Update UI after command
          updateRun(run.id, {
            currentCommand: undefined,
          });
        },
      });
    } finally {
      setExecuting(null);
    }
  };

  const isRunning = run.status === 'running' || loading || executing !== null;
  const isFailed = run.status === 'failed';

  return (
    <div className="card space-y-4">
      <h3 className="text-lg font-semibold text-slate-100">
        Command Control
      </h3>

      {/* Role Selector */}
      <RoleSelector />

      {/* Info message */}
      {isRunning && (
        <div className="rounded-lg bg-slate-800 p-3 text-sm text-slate-300">
          <p>
            <span className="inline-block h-2 w-2 rounded-full bg-warning-400 mr-2 animate-pulse" />
            Command executing... {executing && `(${executing})`}
          </p>
        </div>
      )}

      {isFailed && (
        <div className="rounded-lg bg-error-400/10 p-3 text-sm text-error-400 border border-error-400/30">
          <p>Run failed. Use Retry to recover.</p>
        </div>
      )}

      {/* Button grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {commands.map((cmd) => {
          const isExecuting = executing === cmd.type;
          const isDisabled =
            isRunning && cmd.type !== 'retry' && executing !== cmd.type;

          return (
            <button
              key={cmd.type}
              onClick={() => handleExecuteCommand(cmd.type)}
              disabled={isDisabled}
              title={cmd.description}
              className={`btn relative flex flex-col items-center gap-1 rounded-lg px-3 py-2 sm:px-4 sm:py-3 text-white transition-all ${
                isExecuting
                  ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-slate-400'
                  : ''
              } ${isDisabled ? 'opacity-50 cursor-not-allowed' : cmd.color}`}
            >
              {isExecuting && (
                <span className="absolute inset-0 rounded-lg bg-gradient-to-r from-transparent to-white/10 animate-pulse" />
              )}
              <span className="relative">{cmd.icon}</span>
              <span className="relative text-xs sm:text-sm font-semibold">
                {cmd.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Status indicator */}
      {run.currentCommand && (
        <div className="pt-2 border-t border-slate-700">
          <p className="text-xs text-slate-400">
            Last command: <span className="text-slate-200 capitalize">{run.currentCommand}</span>
          </p>
        </div>
      )}
    </div>
  );
};
