import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';

// 安全的 localStorage 存储，处理访问受限的情况
const safeStorage: StateStorage = {
  getItem: (name: string): string | null => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(name, value);
    } catch {
      // localStorage not available
    }
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name);
    } catch {
      // localStorage not available
    }
  },
};

interface User {
  id: string;
  phone?: string;
  email?: string;
  username?: string;
  nickname?: string;
  avatar?: string;
  role: string;
  credits?: number;
  loginType?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  updateUser: (user: Partial<User>) => void;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      
      setAuth: (user, token) =>
        set({
          user,
          token,
          isAuthenticated: true,
        }),
      
      clearAuth: () =>
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        }),
      
      updateUser: (userData) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        })),
      
      refreshUser: async () => {
        try {
          const { apiClient } = await import('../lib/api');
          const response = await apiClient.get('/auth/me');
          // apiClient.get 已经返回 res.data，所以 response = { success: true, user: {...} }
          const userData = response.user || response;
          
          console.log('API 响应:', response);
          console.log('刷新用户信息:', userData);
          
          set((state) => ({
            user: state.user ? { ...state.user, ...userData } : userData,
          }));
        } catch (error) {
          console.error('Failed to refresh user:', error);
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => safeStorage),
    }
  )
);

