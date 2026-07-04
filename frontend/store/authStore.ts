import { create } from 'zustand';
import { User, AuthState } from '../types/auth';
import { authStorage } from '../utils/localStorage';

interface AuthStoreState extends AuthState {
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  user: null,
  token: null,
  loading: false,
  error: null,

  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  logout: () => {
    // Clear localStorage
    authStorage.clearAuth();

    set({
      user: null,
      token: null,
      error: null,
    });
  },
}));
