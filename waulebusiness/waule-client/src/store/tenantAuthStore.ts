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
  creditMode?: string; // 'global' | 'personal'
  apiKey?: string; // 仅管理员可见
}

interface TenantUser {
  id: string;
  username: string;
  nickname: string | null;
  avatar?: string | null;
  isAdmin: boolean;
  personalCredits?: number;
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
  updatePersonalCredits: (credits: number) => void;
  // 获取有效积分（根据积分模式返回全局或个人积分）
  getEffectiveCredits: () => number;
  // 激活相关
  setActivation: (activation: ActivationInfo) => void;
  clearActivation: () => void;
  // 刷新用户信息
  refreshUser: () => Promise<void>;
  // 心跳
  startHeartbeat: () => void;
  stopHeartbeat: () => void;
}

// 心跳定时器
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

export const useTenantAuthStore = create<TenantAuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      tenantId: null,
      isAuthenticated: false,
      activation: null,

      setAuth: (user, token, tenantId) => {
        set({
          user,
          token,
          tenantId,
          isAuthenticated: true,
        });
        // 登录后启动心跳
        get().startHeartbeat();
      },

      clearAuth: () => {
        // 退出前停止心跳
        get().stopHeartbeat();
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          // 保留 tenantId 和 activation，退出登录不清除激活状态
        });
      },

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

      updatePersonalCredits: (credits) =>
        set((state) => ({
          user: state.user
            ? { ...state.user, personalCredits: credits }
            : null,
        })),

      getEffectiveCredits: () => {
        const state = get();
        if (!state.user) return 0;
        // 个人积分模式：返回个人积分
        if (state.user.tenant.creditMode === 'personal') {
          return state.user.personalCredits ?? 0;
        }
        // 全局积分模式：返回租户积分
        return state.user.tenant.credits;
      },

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
                  // 确保 tenant 信息正确合并（包括 creditMode）
                  tenant: {
                    ...currentUser.tenant,
                    ...data.tenant,
                  },
                },
              });
            }
          }
        } catch (error) {
          console.error('Failed to refresh tenant user:', error);
        }
      },

      startHeartbeat: () => {
        // 清除已有的心跳定时器
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }

        const sendHeartbeat = async () => {
          const state = get();
          if (!state.isAuthenticated || !state.token || !state.activation?.deviceFingerprint) {
            return;
          }

          try {
            const { api } = await import('../lib/api');
            await api.post('/tenant-auth/heartbeat', { 
              version: '1.0.0',
              deviceFingerprint: state.activation.deviceFingerprint,
            });
            console.log('[Heartbeat] ✓ 客户端心跳发送成功');
          } catch (error: any) {
            console.log('[Heartbeat] ✗ 客户端心跳失败:', error.message || '未知错误');
          }
        };

        // 立即发送一次心跳
        sendHeartbeat();

        // 每30秒发送一次心跳
        heartbeatInterval = setInterval(sendHeartbeat, 30 * 1000);
        console.log('[Heartbeat] 客户端心跳服务已启动（间隔30秒）');
      },

      stopHeartbeat: () => {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
          console.log('[Heartbeat] 客户端心跳服务已停止');
        }
      },
    }),
    {
      name: 'tenant-auth-storage',
      storage: createJSONStorage(() => safeStorage),
    }
  )
);

