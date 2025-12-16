import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/authStore';
import { toast } from 'sonner';

// Admin API 地址，开发环境使用代理，生产环境使用相对路径
const API_URL = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL: API_URL ? `${API_URL}/api` : '/api',
  timeout: 60000,
});

// 请求拦截器 - 添加 token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器 - 处理错误
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message: string }>) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().clearAuth();
      window.location.href = '/admin/login';
      toast.error('登录已过期，请重新登录');
    } else if (error.response?.status === 403) {
      toast.error('没有权限访问此资源');
    }
    return Promise.reject(error);
  }
);

// API 方法封装
export const apiClient = {
  get: <T = any>(url: string, config?: AxiosRequestConfig) =>
    api.get<T>(url, config).then((res) => res.data),

  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
    api.post<T>(url, data, config).then((res) => res.data),

  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
    api.put<T>(url, data, config).then((res) => res.data),

  delete: <T = any>(url: string, config?: AxiosRequestConfig) =>
    api.delete<T>(url, config).then((res) => res.data),

  patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
    api.patch<T>(url, data, config).then((res) => res.data),

  // 认证 API
  auth: {
    // 管理员登录
    adminLogin: (data: { username: string; password: string; totpCode?: string }) =>
      apiClient.post('/auth/admin-login', data, { timeout: 15000 }),

    // TOTP 双因素认证
    setupTotp: () => apiClient.post('/auth/totp/setup'),
    confirmTotp: (code: string) => apiClient.post('/auth/totp/confirm', { code }),
    disableTotp: (code: string) => apiClient.post('/auth/totp/disable', { code }),
    getTotpStatus: () => apiClient.get('/auth/totp/status'),

    logout: () => apiClient.post('/auth/logout'),
    me: () => apiClient.get('/auth/me'),
  },

  // 管理员 API
  admin: {
    // 用户管理
    getUsers: (params?: any) => apiClient.get('/admin/users', { params }),
    updateUser: (id: string, data: any) => apiClient.put(`/admin/users/${id}`, data),
    deleteUser: (id: string) => apiClient.delete(`/admin/users/${id}`),

    // 统计数据
    getStats: () => apiClient.get('/admin/stats'),
    getServerMetrics: () => apiClient.get('/admin/server-metrics'),

    // 系统设置
    getSettings: () => apiClient.get('/admin/settings'),
    updateSettings: (data: any) => apiClient.put('/admin/settings', data),

    // AI 模型管理
    getAIModels: (params?: any) => apiClient.get('/admin/ai-models', { params }),
    getAIPresets: (params?: any) => apiClient.get('/admin/ai-models/presets', { params }),
    createAIModel: async (data: any) => {
      const resp: any = await api.post('/admin/ai-models', data).then((res) => res.data);
      return resp?.data ?? resp;
    },
    updateAIModel: async (id: string, data: any) => {
      const resp: any = await api.put(`/admin/ai-models/${id}`, data).then((res) => res.data);
      return resp?.data ?? resp;
    },
    deleteAIModel: (id: string) => apiClient.delete(`/admin/ai-models/${id}`),
    upsertAIModelCapabilities: (data: any) => apiClient.post('/admin/ai-models/capabilities', data),

    // 任务管理
    tasks: {
      getList: (params?: any) => apiClient.get('/admin/tasks', { params }),
      getStats: () => apiClient.get('/admin/tasks/stats'),
      refund: (taskId: string) => apiClient.post(`/admin/tasks/${taskId}/refund`),
      cancel: (taskId: string, refund?: boolean) =>
        apiClient.post(`/admin/tasks/${taskId}/cancel`, { refund }),
    },

    // 用户等级权限管理
    userLevels: {
      getConfigs: () => apiClient.get('/admin/user-levels/configs'),
      updateConfig: (data: any) => apiClient.put('/admin/user-levels/configs', data),
      batchUpdateConfigs: (configs: any[]) =>
        apiClient.put('/admin/user-levels/configs/batch', { configs }),
      getPermissions: (params?: any) => apiClient.get('/admin/user-levels/permissions', { params }),
      getPermissionsSummary: () => apiClient.get('/admin/user-levels/permissions/summary'),
      updatePermission: (data: any) => apiClient.put('/admin/user-levels/permissions', data),
      batchUpdatePermissions: (permissions: any[]) =>
        apiClient.put('/admin/user-levels/permissions/batch', { permissions }),
      setModelPermissionsForAllLevels: (data: any) =>
        apiClient.put('/admin/user-levels/permissions/model', data),
      deletePermission: (id: string) => apiClient.delete(`/admin/user-levels/permissions/${id}`),
      getUserUsageStats: (userId: string, date?: string) =>
        apiClient.get('/admin/user-levels/usage-stats', { params: { userId, date } }),
      grantGiftCredits: (userId: string) =>
        apiClient.post('/admin/user-levels/gift-credits', { userId }),
      getGiftCreditsStatus: (userId: string) =>
        apiClient.get('/admin/user-levels/gift-credits/status', { params: { userId } }),
      updateUserMembership: (userId: string, data: any) =>
        apiClient.put(`/admin/user-levels/users/${userId}/membership`, data),
    },
  },

  // 智能体 API
  agents: {
    getAll: () => apiClient.get('/agents'),
    getById: (id: string) => apiClient.get(`/agents/${id}`),
    create: (data: any) => apiClient.post('/agents', data),
    update: (id: string, data: any) => apiClient.put(`/agents/${id}`, data),
    delete: (id: string) => apiClient.delete(`/agents/${id}`),
    getAvailableModels: () => apiClient.get('/agents/models'),
    roles: {
      list: () => apiClient.get('/agent-roles'),
      listByAgent: (agentId: string) => apiClient.get(`/agent-roles/by-agent/${agentId}`),
      getById: (id: string) => apiClient.get(`/agent-roles/${id}`),
      create: (data: any) => apiClient.post('/agent-roles', data),
      update: (id: string, data: any) => apiClient.put(`/agent-roles/${id}`, data),
      delete: (id: string) => apiClient.delete(`/agent-roles/${id}`),
    },
  },

  // 支付与充值 API
  payment: {
    admin: {
      getConfigs: () => apiClient.get('/payment/admin/configs'),
      getConfig: (id: string) => apiClient.get(`/payment/admin/configs/${id}`),
      saveConfig: (data: any) => apiClient.post('/payment/admin/configs', data),
      testConfig: (id: string) => apiClient.post(`/payment/admin/configs/${id}/test`),
      deleteConfig: (id: string) => apiClient.delete(`/payment/admin/configs/${id}`),
      getPackages: (type?: string) =>
        apiClient.get('/payment/admin/packages', { params: type ? { type } : undefined }),
      createPackage: (data: any) => apiClient.post('/payment/admin/packages', data),
      updatePackage: (id: string, data: any) => apiClient.put(`/payment/admin/packages/${id}`, data),
      deletePackage: (id: string) => apiClient.delete(`/payment/admin/packages/${id}`),
      recharge: (data: { userId: string; credits: number; description?: string }) =>
        apiClient.post('/payment/admin/recharge', data),
    },
  },

  // 计费 API
  billing: {
    getRules: () => apiClient.get('/billing/rules'),
    updateRule: (id: string, data: any) => apiClient.put(`/billing/rules/${id}`, data),
    createRule: (data: any) => apiClient.post('/billing/rules', data),
    deleteRule: (id: string) => apiClient.delete(`/billing/rules/${id}`),
  },

  // 资产 API (用于上传封面图等)
  assets: {
    upload: async (file: File, _metadata?: any) => {
      // 获取预签名 URL
      const presignedRes = await apiClient.post('/assets/presigned-url', {
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
      });
      if (!presignedRes.success || !presignedRes.data) {
        throw new Error('获取上传地址失败');
      }
      const { uploadUrl, publicUrl, objectKey } = presignedRes.data;
      
      // 直传到 OSS
      const axios = (await import('axios')).default;
      await axios.put(uploadUrl, file, {
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        timeout: 60000,
      });
      
      // 确认上传
      const confirmRes = await apiClient.post('/assets/confirm-upload', {
        objectKey,
        publicUrl,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      });
      
      return { url: publicUrl, data: confirmRes.data };
    },
  },

  // 节点提示词管理 API
  nodePrompts: {
    getAll: (includeInactive?: boolean) =>
      apiClient.get('/admin/node-prompts', { params: { includeInactive } }),
    getById: (id: string) => apiClient.get(`/admin/node-prompts/${id}`),
    create: (data: {
      nodeType: string;
      name: string;
      description?: string;
      systemPrompt?: string;
      userPromptTemplate: string;
      enhancePromptTemplate?: string;
      variables?: Array<{ name: string; desc: string; example?: string }>;
      isActive?: boolean;
    }) => apiClient.post('/admin/node-prompts', data),
    update: (id: string, data: {
      name?: string;
      description?: string;
      systemPrompt?: string;
      userPromptTemplate?: string;
      enhancePromptTemplate?: string;
      variables?: Array<{ name: string; desc: string; example?: string }>;
      isActive?: boolean;
    }) => apiClient.put(`/admin/node-prompts/${id}`, data),
    delete: (id: string) => apiClient.delete(`/admin/node-prompts/${id}`),
    toggle: (id: string) => apiClient.patch(`/admin/node-prompts/${id}/toggle`),
    getDefaults: () => apiClient.get('/admin/node-prompts/defaults/storyboard-master'),
    initStoryboardMaster: () => apiClient.post('/admin/node-prompts/init/storyboard-master'),
  },

  // 租户管理 API
  tenants: {
    // 租户列表
    getList: (params?: { page?: number; limit?: number; search?: string; isActive?: boolean }) =>
      apiClient.get('/admin/tenants', { params }),
    // 租户详情
    getById: (id: string) => apiClient.get(`/admin/tenants/${id}`),
    // 创建租户
    create: (data: {
      name: string;
      contactName?: string;
      contactPhone?: string;
      contactEmail?: string;
      remark?: string;
      initialCredits?: number;
      adminUsername: string;
      adminPassword: string;
    }) => apiClient.post('/admin/tenants', data),
    // 更新租户
    update: (id: string, data: any) => apiClient.put(`/admin/tenants/${id}`, data),
    // 删除租户
    delete: (id: string) => apiClient.delete(`/admin/tenants/${id}`),
    // 充值积分
    recharge: (id: string, data: { amount: number; description?: string }) =>
      apiClient.post(`/admin/tenants/${id}/recharge`, data),
    // 重新生成 API Key
    regenerateApiKey: (id: string) => apiClient.post(`/admin/tenants/${id}/regenerate-key`),
    // 获取使用统计
    getUsage: (id: string, params?: { startDate?: string; endDate?: string }) =>
      apiClient.get(`/admin/tenants/${id}/usage`, { params }),
    // 获取积分流水
    getCreditLogs: (id: string, params?: { page?: number; limit?: number }) =>
      apiClient.get(`/admin/tenants/${id}/credit-logs`, { params }),
    
    // 更新客户端数量限制
    updateMaxClients: (id: string, maxClients: number) =>
      apiClient.put(`/admin/tenants/${id}/max-clients`, { maxClients }),

    // 激活码管理
    activations: {
      getList: (tenantId: string) => apiClient.get(`/admin/tenants/${tenantId}/activations`),
      generate: (tenantId: string, count: number) =>
        apiClient.post(`/admin/tenants/${tenantId}/activations`, { count }),
      delete: (tenantId: string, activationId: string) =>
        apiClient.delete(`/admin/tenants/${tenantId}/activations/${activationId}`),
      unbind: (tenantId: string, activationId: string) =>
        apiClient.post(`/admin/tenants/${tenantId}/activations/${activationId}/unbind`),
    },

    // 租户用户管理
    users: {
      getList: (tenantId: string, params?: { page?: number; limit?: number; search?: string }) =>
        apiClient.get(`/admin/tenants/${tenantId}/users`, { params }),
      create: (tenantId: string, data: {
        username: string;
        password: string;
        nickname?: string;
        isAdmin?: boolean;
      }) => apiClient.post(`/admin/tenants/${tenantId}/users`, data),
      update: (tenantId: string, userId: string, data: any) =>
        apiClient.put(`/admin/tenants/${tenantId}/users/${userId}`, data),
      delete: (tenantId: string, userId: string) =>
        apiClient.delete(`/admin/tenants/${tenantId}/users/${userId}`),
      resetPassword: (tenantId: string, userId: string, password: string) =>
        apiClient.post(`/admin/tenants/${tenantId}/users/${userId}/reset-password`, { password }),
    },
  },
};

export default api;

