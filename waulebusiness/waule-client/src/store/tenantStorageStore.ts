/**
 * 租户本地存储配置 Store
 * 管理租户服务端的连接配置
 * 支持配置持久化到服务端（解决浏览器存储丢失问题）
 */
import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { saveClientConfigToServer, getClientConfigFromServer } from '../api/tenantLocalServer';

// 内存存储备选
const memoryStore: Record<string, string> = {};

// 安全的存储实现
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
    memoryStore[name] = value;
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

/**
 * 生成唯一的客户端ID（用于识别设备）
 */
function generateClientId(): string {
  // 尝试从 localStorage 读取已有的 clientId
  try {
    const existing = localStorage.getItem('waule-client-id');
    if (existing) return existing;
  } catch {
    // ignore
  }
  
  // 生成新的 clientId
  const id = 'client_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
  
  try {
    localStorage.setItem('waule-client-id', id);
  } catch {
    // ignore
  }
  
  return id;
}

/**
 * 获取设备名称
 */
function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Windows')) return 'Windows 设备';
  if (ua.includes('Mac')) return 'Mac 设备';
  if (ua.includes('Linux')) return 'Linux 设备';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS 设备';
  if (ua.includes('Android')) return 'Android 设备';
  return '未知设备';
}

export interface TenantStorageConfig {
  // 存储模式: 'OSS' (默认，使用平台 OSS) | 'LOCAL' (使用租户本地存储)
  mode: 'OSS' | 'LOCAL';
  // 租户本地服务端 URL（仅在 LOCAL 模式下有效）
  localServerUrl: string | null;
  // 是否已验证连接
  isConnected: boolean;
  // 最后一次连接检查时间
  lastCheckAt: string | null;
  // 客户端唯一标识（用于服务端识别设备）
  clientId: string;
}

interface TenantStorageState {
  config: TenantStorageConfig;
  // 设置存储配置
  setConfig: (config: Partial<TenantStorageConfig>) => void;
  // 设置本地服务端地址
  setLocalServerUrl: (url: string) => void;
  // 切换到本地存储模式（并同步配置到服务端）
  enableLocalStorage: (localServerUrl: string) => void;
  // 切换到 OSS 存储模式
  disableLocalStorage: () => void;
  // 更新连接状态
  setConnected: (isConnected: boolean) => void;
  // 检查本地服务端是否可用
  checkConnection: () => Promise<boolean>;
  // 清除配置
  clearConfig: () => void;
  // 同步配置到服务端
  syncConfigToServer: () => Promise<boolean>;
  // 从服务端恢复配置
  restoreConfigFromServer: (serverUrl: string) => Promise<boolean>;
}

const initialConfig: TenantStorageConfig = {
  mode: 'OSS',
  localServerUrl: null,
  isConnected: false,
  lastCheckAt: null,
  clientId: generateClientId(),
};

export const useTenantStorageStore = create<TenantStorageState>()(
  persist(
    (set, get) => ({
      config: initialConfig,

      setConfig: (newConfig) =>
        set((state) => ({
          config: { ...state.config, ...newConfig },
        })),

      setLocalServerUrl: (url) =>
        set((state) => ({
          config: {
            ...state.config,
            localServerUrl: url,
            // 设置地址时自动切换到本地模式
            mode: url ? 'LOCAL' : 'OSS',
          },
        })),

      enableLocalStorage: (localServerUrl) => {
        set((state) => ({
          config: {
            ...state.config,
            mode: 'LOCAL',
            localServerUrl,
          },
        }));
        // 连接成功后自动同步配置到服务端
        setTimeout(() => {
          get().syncConfigToServer();
        }, 100);
      },

      disableLocalStorage: () =>
        set((state) => ({
          config: {
            ...state.config,
            mode: 'OSS',
            isConnected: false,
          },
        })),

      setConnected: (isConnected) =>
        set((state) => ({
          config: {
            ...state.config,
            isConnected,
            lastCheckAt: new Date().toISOString(),
          },
        })),

      checkConnection: async () => {
        const { config } = get();
        if (!config.localServerUrl) {
          set((state) => ({
            config: { ...state.config, isConnected: false },
          }));
          return false;
        }

        try {
          // 使用 AbortController 实现超时
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch(`${config.localServerUrl}/health`, {
            method: 'GET',
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          const isConnected = response.ok;
          
          set((state) => ({
            config: {
              ...state.config,
              isConnected,
              lastCheckAt: new Date().toISOString(),
            },
          }));
          
          return isConnected;
        } catch (error) {
          set((state) => ({
            config: {
              ...state.config,
              isConnected: false,
              lastCheckAt: new Date().toISOString(),
            },
          }));
          return false;
        }
      },

      clearConfig: () =>
        set({
          config: { ...initialConfig, clientId: get().config.clientId },
        }),

      syncConfigToServer: async () => {
        const { config } = get();
        if (!config.localServerUrl) {
          return false;
        }

        try {
          const result = await saveClientConfigToServer(config.localServerUrl, {
            clientId: config.clientId,
            deviceName: getDeviceName(),
            localServerUrl: config.localServerUrl,
            storageMode: config.mode,
          });
          
          if (result) {
            console.log('[TenantStorage] 配置已同步到服务端');
          }
          
          return result;
        } catch (error) {
          console.error('[TenantStorage] 同步配置失败:', error);
          return false;
        }
      },

      restoreConfigFromServer: async (serverUrl: string) => {
        const { config } = get();
        
        try {
          const savedConfig = await getClientConfigFromServer(serverUrl, config.clientId);
          
          if (savedConfig && savedConfig.localServerUrl) {
            set((state) => ({
              config: {
                ...state.config,
                mode: savedConfig.storageMode || 'LOCAL',
                localServerUrl: savedConfig.localServerUrl,
                isConnected: true,
                lastCheckAt: new Date().toISOString(),
              },
            }));
            
            console.log('[TenantStorage] 配置已从服务端恢复:', savedConfig.localServerUrl);
            return true;
          }
          
          return false;
        } catch (error) {
          console.error('[TenantStorage] 恢复配置失败:', error);
          return false;
        }
      },
    }),
    {
      name: 'tenant-storage-config',
      storage: createJSONStorage(() => safeStorage),
      // 从存储恢复时，重置 isConnected 状态（避免使用过期的连接状态）
      onRehydrateStorage: () => (state) => {
        if (state) {
          // 重置连接状态，需要重新验证
          state.config.isConnected = false;
          console.log('[TenantStorage] 已重置连接状态，需重新验证');
        }
      },
    }
  )
);

/**
 * 获取当前是否启用本地存储
 */
export function isLocalStorageEnabled(): boolean {
  const { config } = useTenantStorageStore.getState();
  return config.mode === 'LOCAL' && !!config.localServerUrl;
}

/**
 * 获取本地服务端 URL
 */
export function getLocalServerUrl(): string | null {
  const { config } = useTenantStorageStore.getState();
  return config.localServerUrl;
}

/**
 * 获取客户端 ID
 */
export function getClientId(): string {
  const { config } = useTenantStorageStore.getState();
  return config.clientId;
}

/**
 * 尝试自动恢复配置（用于应用启动时）
 * 如果本地有保存的服务端地址，尝试从服务端恢复完整配置
 */
export async function tryAutoRestoreConfig(): Promise<boolean> {
  const store = useTenantStorageStore.getState();
  const { config, restoreConfigFromServer: _restoreConfigFromServer, checkConnection } = store;
  
  // 如果已经有配置且连接正常，不需要恢复
  if (config.localServerUrl && config.isConnected) {
    return true;
  }
  
  // 如果有配置但未连接，尝试重新连接并同步
  if (config.localServerUrl) {
    const connected = await checkConnection();
    if (connected) {
      // 连接成功，同步配置到服务端（确保服务端有最新配置）
      store.syncConfigToServer();
      return true;
    }
  }
  
  return false;
}

