import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';

// 内存存储备选
const memoryStore: Record<string, string> = {};

// 安全的存储实现（每次操作都捕获错误，失败时使用内存）
const safeStorage: StateStorage = {
  getItem: (name: string): string | null => {
    try {
      const value = localStorage.getItem(name);
      if (value !== null) return value;
    } catch {
      // localStorage 失败，尝试内存
    }
    return memoryStore[name] || null;
  },
  setItem: (name: string, value: string): void => {
    memoryStore[name] = value; // 总是保存到内存
    try {
      localStorage.setItem(name, value);
    } catch {
      // localStorage 失败，已保存到内存
    }
  },
  removeItem: (name: string): void => {
    delete memoryStore[name];
    try {
      localStorage.removeItem(name);
    } catch {
      // localStorage 失败
    }
  },
};

interface TenantInfo {
  id: string;
  name: string;
  credits: number;
  apiKey?: string; // 仅管理员可见
}

interface TenantUser {
  id: string;
  username: string;
  nickname: string | null;
  avatar?: string | null;
  isAdmin: boolean;
  tenant: TenantInfo;
}

// 设备激活信息
interface ActivationInfo {
  tenantId: string;
  tenantName: string;
  deviceFingerprint: string;
}

interface TenantAuthState {
  user: TenantUser | null;
  token: string | null;
  tenantId: string | null; // 从激活获取的租户ID
  isAuthenticated: boolean;
  // 设备激活信息
  activation: ActivationInfo | null;
  setAuth: (user: TenantUser, token: string, tenantId: string) => void;
  clearAuth: () => void;
  updateUser: (user: Partial<TenantUser>) => void;
  updateTenantCredits: (credits: number) => void;
  // 激活相关
  setActivation: (activation: ActivationInfo) => void;
  clearActivation: () => void;
  // 刷新用户信息
  refreshUser: () => Promise<void>;
}

export const useTenantAuthStore = create<TenantAuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      tenantId: null,
      isAuthenticated: false,
      activation: null,

      setAuth: (user, token, tenantId) =>
        set({
          user,
          token,
          tenantId,
          isAuthenticated: true,
        }),

      clearAuth: () =>
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          // 保留 tenantId 和 activation，退出登录不清除激活状态
        }),

      updateUser: (userData) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        })),

      updateTenantCredits: (credits) =>
        set((state) => ({
          user: state.user
            ? { ...state.user, tenant: { ...state.user.tenant, credits } }
            : null,
        })),

      setActivation: (activation) =>
        set({
          activation,
          tenantId: activation.tenantId,
        }),

      clearActivation: () =>
        set({
          activation: null,
          tenantId: null,
          // 清除激活时也清除登录状态
          user: null,
          token: null,
          isAuthenticated: false,
        }),

      refreshUser: async () => {
        try {
          // 动态导入避免循环依赖
          const { apiClient } = await import('../lib/api');
          const response = await apiClient.tenant.get('/me');
          const data = response.data || response;
          if (data?.user) {
            const currentUser = get().user;
            if (currentUser) {
              set({
                user: {
                  ...currentUser,
                  ...data.user,
                  tenant: data.tenant || currentUser.tenant,
                },
              });
            }
          }
        } catch (error) {
          console.error('Failed to refresh tenant user:', error);
        }
      },
    }),
    {
      name: 'tenant-auth-storage',
      storage: createJSONStorage(() => safeStorage),
    }
  )
);

