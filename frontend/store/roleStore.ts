import { create } from 'zustand';
import { Role, RoleType } from '../types/roles';

interface RoleStoreState {
  availableRoles: Role[];
  selectedRoles: Record<RoleType, boolean>;
  loading: boolean;
  error: string | null;

  setAvailableRoles: (roles: Role[]) => void;
  selectRole: (roleType: RoleType, selected: boolean) => void;
  clearSelection: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useRoleStore = create<RoleStoreState>((set) => ({
  availableRoles: [],
  selectedRoles: {
    builder: false,
    critic: false,
    judge: false,
    planner: false,
  },
  loading: false,
  error: null,

  setAvailableRoles: (roles) => set({ availableRoles: roles }),

  selectRole: (roleType, selected) =>
    set((state) => ({
      selectedRoles: { ...state.selectedRoles, [roleType]: selected },
    })),

  clearSelection: () =>
    set({
      selectedRoles: {
        builder: false,
        critic: false,
        judge: false,
        planner: false,
      },
    }),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
