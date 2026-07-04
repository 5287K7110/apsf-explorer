import React, { useEffect } from 'react';
import { useRoleStore } from '../store/roleStore';
import { Role } from '../types/roles';

// Mock roles for development
const MOCK_ROLES: Role[] = [
  {
    id: 'builder-1',
    type: 'builder',
    name: 'Code Builder',
    description: 'Generates implementation code',
    specialist: 'senior',
  },
  {
    id: 'critic-1',
    type: 'critic',
    name: 'Code Reviewer',
    description: 'Reviews code quality and issues',
    specialist: 'senior',
  },
  {
    id: 'judge-1',
    type: 'judge',
    name: 'Verdict Judge',
    description: 'Makes final acceptance decisions',
    specialist: 'specialized',
  },
  {
    id: 'planner-1',
    type: 'planner',
    name: 'Execution Planner',
    description: 'Plans implementation strategy',
    specialist: 'senior',
  },
];

export const RoleSelector: React.FC = () => {
  const {
    availableRoles,
    selectedRoles,
    selectRole,
    setAvailableRoles,
    loading,
  } = useRoleStore();

  useEffect(() => {
    // Load mock roles for now (would be API call in production)
    setAvailableRoles(MOCK_ROLES);
  }, [setAvailableRoles]);

  return (
    <div className="bg-slate-800 rounded-lg p-4 mb-4 border border-slate-700">
      <h3 className="text-sm font-medium text-slate-300 mb-3">Select Agents</h3>

      <div className="space-y-2">
        {availableRoles.map((role) => (
          <label
            key={role.id}
            className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-slate-700 transition"
          >
            <input
              type="checkbox"
              checked={selectedRoles[role.type] || false}
              onChange={(e) => selectRole(role.type, e.target.checked)}
              disabled={loading}
              className="w-4 h-4 rounded border-slate-600 cursor-pointer"
            />
            <div className="flex-1">
              <span className="text-sm text-slate-200 font-medium">{role.name}</span>
              <span className="text-xs text-slate-400 block">{role.description}</span>
            </div>
            {role.specialist && (
              <span className="text-xs px-2 py-1 bg-slate-700 text-slate-300 rounded">
                {role.specialist}
              </span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
};
