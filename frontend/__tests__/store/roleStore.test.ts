import { describe, it, expect, beforeEach } from 'vitest';
import { useRoleStore } from '../../store/roleStore';

const initialRoleStoreState = useRoleStore.getState();

describe('useRoleStore', () => {
  beforeEach(() => {
    useRoleStore.setState(initialRoleStoreState, true);
    useRoleStore.getState().clearSelection();
    useRoleStore.getState().setError(null);
    useRoleStore.getState().setLoading(false);
  });

  it('should initialize with all roles deselected', () => {

    expect(useRoleStore.getState().selectedRoles.builder).toBe(false);
    expect(useRoleStore.getState().selectedRoles.critic).toBe(false);
    expect(useRoleStore.getState().selectedRoles.judge).toBe(false);
    expect(useRoleStore.getState().selectedRoles.planner).toBe(false);
  });

  it('should initialize with no available roles', () => {
    expect(useRoleStore.getState().availableRoles).toEqual([]);
  });

  it('should initialize with loading false', () => {
    expect(useRoleStore.getState().loading).toBe(false);
  });

  it('should initialize with no error', () => {
    expect(useRoleStore.getState().error).toBeNull();
  });

  describe('selectRole', () => {
    it('should select a role', () => {

      useRoleStore.getState().selectRole('builder', true);

      expect(useRoleStore.getState().selectedRoles.builder).toBe(true);
    });

    it('should deselect a role', () => {

      useRoleStore.getState().selectRole('builder', true);
      useRoleStore.getState().selectRole('builder', false);

      expect(useRoleStore.getState().selectedRoles.builder).toBe(false);
    });

    it('should allow multiple role selection', () => {

      useRoleStore.getState().selectRole('builder', true);
      useRoleStore.getState().selectRole('critic', true);
      useRoleStore.getState().selectRole('judge', true);

      expect(useRoleStore.getState().selectedRoles.builder).toBe(true);
      expect(useRoleStore.getState().selectedRoles.critic).toBe(true);
      expect(useRoleStore.getState().selectedRoles.judge).toBe(true);
      expect(useRoleStore.getState().selectedRoles.planner).toBe(false);
    });

    it('should preserve other selections when selecting new role', () => {

      useRoleStore.getState().selectRole('builder', true);
      useRoleStore.getState().selectRole('critic', true);

      expect(useRoleStore.getState().selectedRoles.builder).toBe(true);
      expect(useRoleStore.getState().selectedRoles.critic).toBe(true);
    });

    it('should preserve other selections when deselecting a role', () => {

      useRoleStore.getState().selectRole('builder', true);
      useRoleStore.getState().selectRole('critic', true);
      useRoleStore.getState().selectRole('builder', false);

      expect(useRoleStore.getState().selectedRoles.builder).toBe(false);
      expect(useRoleStore.getState().selectedRoles.critic).toBe(true);
    });

    it('should handle all role types', () => {

      useRoleStore.getState().selectRole('builder', true);
      useRoleStore.getState().selectRole('critic', true);
      useRoleStore.getState().selectRole('judge', true);
      useRoleStore.getState().selectRole('planner', true);

      expect(useRoleStore.getState().selectedRoles.builder).toBe(true);
      expect(useRoleStore.getState().selectedRoles.critic).toBe(true);
      expect(useRoleStore.getState().selectedRoles.judge).toBe(true);
      expect(useRoleStore.getState().selectedRoles.planner).toBe(true);
    });
  });

  describe('clearSelection', () => {
    it('should clear all selections', () => {

      useRoleStore.getState().selectRole('builder', true);
      useRoleStore.getState().selectRole('critic', true);
      useRoleStore.getState().clearSelection();

      expect(useRoleStore.getState().selectedRoles.builder).toBe(false);
      expect(useRoleStore.getState().selectedRoles.critic).toBe(false);
      expect(useRoleStore.getState().selectedRoles.judge).toBe(false);
      expect(useRoleStore.getState().selectedRoles.planner).toBe(false);
    });

    it('should work even with no selections', () => {

      expect(() => useRoleStore.getState().clearSelection()).not.toThrow();
      expect(useRoleStore.getState().selectedRoles.builder).toBe(false);
    });
  });

  describe('setAvailableRoles', () => {
    it('should set available roles', () => {
      const roles = [
        { id: '1', type: 'builder', name: 'Builder', description: 'Builds' } as any,
        { id: '2', type: 'critic', name: 'Critic', description: 'Critiques' } as any,
      ];

      useRoleStore.getState().setAvailableRoles(roles);

      expect(useRoleStore.getState().availableRoles).toEqual(roles);
    });

    it('should update available roles', () => {
      const roles1 = [{ id: '1', type: 'builder', name: 'Builder' } as any];
      const roles2 = [
        { id: '1', type: 'builder', name: 'Builder' } as any,
        { id: '2', type: 'critic', name: 'Critic' } as any,
      ];

      useRoleStore.getState().setAvailableRoles(roles1);
      expect(useRoleStore.getState().availableRoles).toHaveLength(1);

      useRoleStore.getState().setAvailableRoles(roles2);
      expect(useRoleStore.getState().availableRoles).toHaveLength(2);
    });
  });

  describe('setLoading', () => {
    it('should set loading state', () => {

      useRoleStore.getState().setLoading(true);
      expect(useRoleStore.getState().loading).toBe(true);

      useRoleStore.getState().setLoading(false);
      expect(useRoleStore.getState().loading).toBe(false);
    });
  });

  describe('setError', () => {
    it('should set error message', () => {

      useRoleStore.getState().setError('Test error');
      expect(useRoleStore.getState().error).toBe('Test error');
    });

    it('should clear error', () => {

      useRoleStore.getState().setError('Test error');
      useRoleStore.getState().setError(null);
      expect(useRoleStore.getState().error).toBeNull();
    });
  });

  describe('combined operations', () => {
    it('should handle complete workflow', () => {

      useRoleStore.getState().setLoading(true);
      expect(useRoleStore.getState().loading).toBe(true);

      const roles = [
        { id: '1', type: 'builder', name: 'Builder' } as any,
        { id: '2', type: 'critic', name: 'Critic' } as any,
      ];
      useRoleStore.getState().setAvailableRoles(roles);
      useRoleStore.getState().setLoading(false);

      expect(useRoleStore.getState().availableRoles).toHaveLength(2);
      expect(useRoleStore.getState().loading).toBe(false);

      useRoleStore.getState().selectRole('builder', true);
      useRoleStore.getState().selectRole('critic', true);

      expect(useRoleStore.getState().selectedRoles.builder).toBe(true);
      expect(useRoleStore.getState().selectedRoles.critic).toBe(true);

      useRoleStore.getState().clearSelection();
      expect(useRoleStore.getState().selectedRoles.builder).toBe(false);
      expect(useRoleStore.getState().selectedRoles.critic).toBe(false);
    });
  });
});
