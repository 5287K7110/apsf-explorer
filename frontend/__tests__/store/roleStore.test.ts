import { describe, it, expect, beforeEach } from 'vitest';
import { useRoleStore } from '../../store/roleStore';

describe('useRoleStore', () => {
  beforeEach(() => {
    const store = useRoleStore();
    store.clearSelection();
    store.setError(null);
    store.setLoading(false);
  });

  it('should initialize with all roles deselected', () => {
    const store = useRoleStore();

    expect(store.selectedRoles.builder).toBe(false);
    expect(store.selectedRoles.critic).toBe(false);
    expect(store.selectedRoles.judge).toBe(false);
    expect(store.selectedRoles.planner).toBe(false);
  });

  it('should initialize with no available roles', () => {
    const store = useRoleStore();
    expect(store.availableRoles).toEqual([]);
  });

  it('should initialize with loading false', () => {
    const store = useRoleStore();
    expect(store.loading).toBe(false);
  });

  it('should initialize with no error', () => {
    const store = useRoleStore();
    expect(store.error).toBeNull();
  });

  describe('selectRole', () => {
    it('should select a role', () => {
      const store = useRoleStore();

      store.selectRole('builder', true);

      expect(store.selectedRoles.builder).toBe(true);
    });

    it('should deselect a role', () => {
      const store = useRoleStore();

      store.selectRole('builder', true);
      store.selectRole('builder', false);

      expect(store.selectedRoles.builder).toBe(false);
    });

    it('should allow multiple role selection', () => {
      const store = useRoleStore();

      store.selectRole('builder', true);
      store.selectRole('critic', true);
      store.selectRole('judge', true);

      expect(store.selectedRoles.builder).toBe(true);
      expect(store.selectedRoles.critic).toBe(true);
      expect(store.selectedRoles.judge).toBe(true);
      expect(store.selectedRoles.planner).toBe(false);
    });

    it('should preserve other selections when selecting new role', () => {
      const store = useRoleStore();

      store.selectRole('builder', true);
      store.selectRole('critic', true);

      expect(store.selectedRoles.builder).toBe(true);
      expect(store.selectedRoles.critic).toBe(true);
    });

    it('should preserve other selections when deselecting a role', () => {
      const store = useRoleStore();

      store.selectRole('builder', true);
      store.selectRole('critic', true);
      store.selectRole('builder', false);

      expect(store.selectedRoles.builder).toBe(false);
      expect(store.selectedRoles.critic).toBe(true);
    });

    it('should handle all role types', () => {
      const store = useRoleStore();

      store.selectRole('builder', true);
      store.selectRole('critic', true);
      store.selectRole('judge', true);
      store.selectRole('planner', true);

      expect(store.selectedRoles.builder).toBe(true);
      expect(store.selectedRoles.critic).toBe(true);
      expect(store.selectedRoles.judge).toBe(true);
      expect(store.selectedRoles.planner).toBe(true);
    });
  });

  describe('clearSelection', () => {
    it('should clear all selections', () => {
      const store = useRoleStore();

      store.selectRole('builder', true);
      store.selectRole('critic', true);
      store.clearSelection();

      expect(store.selectedRoles.builder).toBe(false);
      expect(store.selectedRoles.critic).toBe(false);
      expect(store.selectedRoles.judge).toBe(false);
      expect(store.selectedRoles.planner).toBe(false);
    });

    it('should work even with no selections', () => {
      const store = useRoleStore();

      expect(() => store.clearSelection()).not.toThrow();
      expect(store.selectedRoles.builder).toBe(false);
    });
  });

  describe('setAvailableRoles', () => {
    it('should set available roles', () => {
      const store = useRoleStore();
      const roles = [
        { id: '1', type: 'builder', name: 'Builder', description: 'Builds' } as any,
        { id: '2', type: 'critic', name: 'Critic', description: 'Critiques' } as any,
      ];

      store.setAvailableRoles(roles);

      expect(store.availableRoles).toEqual(roles);
    });

    it('should update available roles', () => {
      const store = useRoleStore();
      const roles1 = [{ id: '1', type: 'builder', name: 'Builder' } as any];
      const roles2 = [
        { id: '1', type: 'builder', name: 'Builder' } as any,
        { id: '2', type: 'critic', name: 'Critic' } as any,
      ];

      store.setAvailableRoles(roles1);
      expect(store.availableRoles).toHaveLength(1);

      store.setAvailableRoles(roles2);
      expect(store.availableRoles).toHaveLength(2);
    });
  });

  describe('setLoading', () => {
    it('should set loading state', () => {
      const store = useRoleStore();

      store.setLoading(true);
      expect(store.loading).toBe(true);

      store.setLoading(false);
      expect(store.loading).toBe(false);
    });
  });

  describe('setError', () => {
    it('should set error message', () => {
      const store = useRoleStore();

      store.setError('Test error');
      expect(store.error).toBe('Test error');
    });

    it('should clear error', () => {
      const store = useRoleStore();

      store.setError('Test error');
      store.setError(null);
      expect(store.error).toBeNull();
    });
  });

  describe('combined operations', () => {
    it('should handle complete workflow', () => {
      const store = useRoleStore();

      store.setLoading(true);
      expect(store.loading).toBe(true);

      const roles = [
        { id: '1', type: 'builder', name: 'Builder' } as any,
        { id: '2', type: 'critic', name: 'Critic' } as any,
      ];
      store.setAvailableRoles(roles);
      store.setLoading(false);

      expect(store.availableRoles).toHaveLength(2);
      expect(store.loading).toBe(false);

      store.selectRole('builder', true);
      store.selectRole('critic', true);

      expect(store.selectedRoles.builder).toBe(true);
      expect(store.selectedRoles.critic).toBe(true);

      store.clearSelection();
      expect(store.selectedRoles.builder).toBe(false);
      expect(store.selectedRoles.critic).toBe(false);
    });
  });
});
