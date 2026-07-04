export type RoleType = 'builder' | 'critic' | 'judge' | 'planner';

export interface Role {
  id: string;
  type: RoleType;
  name: string;
  description: string;
  specialist?: string; // 'junior' | 'senior' | 'specialized'
}

export interface SelectedRoles {
  builder?: string;
  critic?: string;
  judge?: string;
  planner?: string;
}

export interface RoleState {
  available: {
    builders: Role[];
    critics: Role[];
    judges: Role[];
    planners: Role[];
  };
  selected: SelectedRoles;
  loading: boolean;
}
