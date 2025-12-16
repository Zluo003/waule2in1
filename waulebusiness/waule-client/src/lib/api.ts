import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/authStore';
import { useTenantAuthStore } from '../store/tenantAuthStore';
import { toast } from 'sonner';

// 优先使用环境变量，其次使用相对路径（通过Vite proxy）
// 如果设置了VITE_API_URL，直接使用该地址
// 否则使用相对路径 '/api'，由Vite开发服务器代理到后端
const API_URL = import.meta.env.VITE_API_URL || '';

// 创建axios实例
export const api = axios.create({
  baseURL: API_URL ? `${API_URL}/api` : '/api',
  timeout: 300000,
});

// 请求拦截器 - 添加token和租户ID
api.interceptors.request.use(
  (config) => {
    // 获取租户状态
    const tenantState = useTenantAuthStore.getState();
    const tenantToken = tenantState.token;
    const tenantId = tenantState.tenantId || tenantState.activation?.tenantId;
    
    // 平台 token（备选）
    const platformToken = useAuthStore.getState().token;
    
    // 优先使用租户 token
    const token = tenantToken || platformToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // 如果有租户ID，自动添加到请求头（商业版所有请求都需要）
    if (tenantId && !config.headers['X-Tenant-ID']) {
      config.headers['X-Tenant-ID'] = tenantId;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理错误
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message: string }>) => {
    // 网络错误时进行一次回退：若配置了 API_URL 但网络不可达，则改用相对路径 '/api' 并重试一次
    if (
      error.code === 'ERR_NETWORK' &&
      API_URL &&
      error.config &&
      !(error.config as any).__retriedWithFallback
    ) {
      const newConfig: AxiosRequestConfig & { __retriedWithFallback?: boolean } = {
        ...(error.config as AxiosRequestConfig),
        baseURL: '/api',
        __retriedWithFallback: true,
      };
      return api.request(newConfig);
    }

    // 401 - 未授权，清除auth状态
    if (error.response?.status === 401) {
      const hasTenantHeader = error.config?.headers?.['X-Tenant-ID'];
      const errorCode = (error.response?.data as any)?.code;
      
      // 单点登录：账号在其他设备登录，强制退出
      if (errorCode === 'SESSION_EXPIRED') {
        useTenantAuthStore.getState().clearAuth();
        toast.error('账号已在其他设备登录，请重新登录');
        window.location.href = '/login';
        return Promise.reject(error);
      }
      
      // 租户认证的请求不触发全局跳转（由组件自己处理）
      if (!hasTenantHeader) {
        useAuthStore.getState().clearAuth();
        window.location.href = '/login';
        toast.error('登录已过期，请重新登录');
      }
    }
    // 403 - 禁止访问
    else if (error.response?.status === 403 && !(error.config as any)?.skipGlobalErrorHandler) {
      toast.error('没有权限访问此资源');
    }
    // 注意：500/429 错误不再全局处理，由组件自己处理

    return Promise.reject(error);
  }
);

// API方法封装
export const apiClient = {
  // 通用方法
  get: <T = any>(url: string, config?: AxiosRequestConfig) =>
    api.get<T>(url, config).then((res) => res.data),

  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
    api.post<T>(url, data, config).then((res) => res.data),

  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
    api.put<T>(url, data, config).then((res) => res.data),

  delete: <T = any>(url: string, config?: AxiosRequestConfig) =>
    api.delete<T>(url, config).then((res) => res.data),

  // Blob 下载专用方法
  getBlob: (url: string) =>
    api.get(url, { responseType: 'blob' }).then((res) => res.data as Blob),

  // 租户 API（使用 /api/tenant/ 前缀）
  tenant: {
    get: <T = any>(url: string, config?: AxiosRequestConfig) =>
      api.get<T>(`/tenant${url}`, config).then((res) => res.data),
    post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
      api.post<T>(`/tenant${url}`, data, config).then((res) => res.data),
    put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
      api.put<T>(`/tenant${url}`, data, config).then((res) => res.data),
    delete: <T = any>(url: string, config?: AxiosRequestConfig) =>
      api.delete<T>(`/tenant${url}`, config).then((res) => res.data),
  },

  // 认证API
  auth: {
    // 发送手机验证码
    sendCode: (data: { phone: string }) =>
      apiClient.post('/auth/send-code', data, { timeout: 15000 }),

    // 手机验证码登录
    loginWithPhone: (data: { phone: string; code: string }) =>
      apiClient.post('/auth/login-phone', data, { timeout: 15000 }),

    // 管理员登录 (支持双因素认证)
    adminLogin: (data: { username: string; password: string; totpCode?: string }) =>
      apiClient.post('/auth/admin-login', data, { timeout: 15000 }),

    // TOTP 双因素认证
    setupTotp: () => apiClient.post('/auth/totp/setup'),
    confirmTotp: (code: string) => apiClient.post('/auth/totp/confirm', { code }),
    disableTotp: (code: string) => apiClient.post('/auth/totp/disable', { code }),
    getTotpStatus: () => apiClient.get('/auth/totp/status'),

    logout: () => apiClient.post('/auth/logout'),

    me: () => apiClient.get('/auth/me'),

    refresh: () => apiClient.post('/auth/refresh'),
  },

  // 用户API
  user: {
    getProfile: () => apiClient.get('/users/profile'),
    updateProfile: (data: any) => apiClient.put('/users/profile', data),
    changePassword: (data: {
      currentPassword: string;
      newPassword: string;
    }) => apiClient.put('/users/password', data),
    // 旧版本：通过服务器中转上传（慢）
    uploadAvatarLegacy: (file: File) => {
      const formData = new FormData();
      formData.append('avatar', file);
      return api.put('/users/avatar', formData).then((res) => res.data);
    },
    // 新版本：直传 OSS（快）
    getAvatarUploadUrl: (fileName: string, contentType: string) =>
      apiClient.post('/users/avatar/presign', { fileName, contentType }),
    confirmAvatarUpload: (publicUrl: string) =>
      apiClient.post('/users/avatar/confirm', { publicUrl }),
    // 封装的直传方法
    uploadAvatar: async (file: File) => {
      // 1. 获取预签名 URL
      const presignRes = await apiClient.post('/users/avatar/presign', {
        fileName: file.name,
        contentType: file.type,
      });
      if (!presignRes.success) {
        throw new Error(presignRes.message || '获取上传地址失败');
      }
      const { uploadUrl, publicUrl } = presignRes.data;

      // 2. 直传到 OSS
      await axios.put(uploadUrl, file, {
        headers: { 'Content-Type': file.type },
      });

      // 3. 确认上传完成
      const confirmRes = await apiClient.post('/users/avatar/confirm', { publicUrl });
      return confirmRes;
    },
    checkNickname: (nickname: string) => 
      apiClient.get('/users/check-nickname', { params: { nickname } }),
  },

  // 项目API（商业版使用租户 API）
  projects: {
    getAll: (params?: any) => apiClient.tenant.get('/projects', { params }),
    getById: (id: string) => apiClient.tenant.get(`/projects/${id}`),
    create: (data: any) => apiClient.tenant.post('/projects', data),
    update: (id: string, data: any) => apiClient.tenant.put(`/projects/${id}`, data),
    delete: (id: string) => apiClient.tenant.delete(`/projects/${id}`),
    // 协作者管理
    getShared: () => apiClient.tenant.get('/projects/shared'),
    searchUsers: (query: string) => apiClient.tenant.get('/users/search', { params: { query } }),
    getCollaborators: (projectId: string) => apiClient.tenant.get(`/projects/${projectId}/collaborators`),
    addCollaborator: (projectId: string, targetUserId: string) => 
      apiClient.tenant.post(`/projects/${projectId}/collaborators`, { targetUserId }),
    updatePermission: (projectId: string, targetUserId: string, permission: 'READ' | 'EDIT') =>
      apiClient.tenant.put(`/projects/${projectId}/collaborators/${targetUserId}`, { permission }),
    removeCollaborator: (projectId: string, targetUserId: string) => 
      apiClient.tenant.delete(`/projects/${projectId}/collaborators/${targetUserId}`),
  },

  // 剧集API（商业版使用租户 API）
  episodes: {
    list: (projectId: string) => apiClient.tenant.get(`/projects/${projectId}/episodes`),
    getById: (projectId: string, episodeId: string) =>
      apiClient.tenant.get(`/projects/${projectId}/episodes/${episodeId}`),
    create: (projectId: string, data: any) =>
      apiClient.tenant.post(`/projects/${projectId}/episodes`, data),
    update: (projectId: string, episodeId: string, data: any) =>
      apiClient.tenant.put(`/projects/${projectId}/episodes/${episodeId}`, data),
    delete: (projectId: string, episodeId: string) =>
      apiClient.tenant.delete(`/projects/${projectId}/episodes/${episodeId}`),
    // 剧集权限管理暂不支持
    getCollaborators: (_projectId: string, _episodeId: string) => Promise.resolve({ success: true, data: [] }),
    updatePermission: (_projectId: string, _episodeId: string, _targetUserId: string, _permission: 'READ' | 'EDIT') =>
      Promise.resolve({ success: true }),
  },

  // 工作流API（商业版使用租户 API）
  workflows: {
    getAll: (params?: any) => apiClient.tenant.get('/workflows', { params }),
    getById: (id: string) => apiClient.tenant.get(`/workflows/${id}`),
    getOrCreateByProject: (projectId: string) =>
      apiClient.tenant.get(`/workflows/project/${projectId}`),
    getOrCreateByEpisode: (projectId: string, episodeId: string) =>
      apiClient.tenant.get(`/workflows/project/${projectId}/episode/${episodeId}`),
    getOrCreateByShot: (projectId: string, episodeId: string, scene: number, shot: number) =>
      apiClient.tenant.get(`/workflows/project/${projectId}/episode/${episodeId}/shot`, { params: { scene, shot } }),
    save: (projectId: string, data: any) =>
      apiClient.tenant.post(`/workflows/project/${projectId}`, data),
    saveEpisode: (projectId: string, episodeId: string, data: any) =>
      apiClient.tenant.post(`/workflows/project/${projectId}/episode/${episodeId}`, data),
    saveShot: (projectId: string, episodeId: string, scene: number, shot: number, data: any) =>
      apiClient.tenant.post(`/workflows/project/${projectId}/episode/${episodeId}/shot`, data, { params: { scene, shot } }),
    create: (data: any) => apiClient.tenant.post('/workflows', data),
    update: (id: string, data: any) =>
      apiClient.tenant.put(`/workflows/${id}`, data),
    delete: (id: string) => apiClient.tenant.delete(`/workflows/${id}`),
    execute: (id: string) => apiClient.tenant.post(`/workflows/${id}/execute`),
    // 协作者管理
    searchUsers: (query: string) => apiClient.tenant.get('/users/search', { params: { query } }),
    getCollaborators: (workflowId: string) => apiClient.tenant.get(`/workflows/${workflowId}/collaborators`),
    addCollaborator: (workflowId: string, targetUserId: string, permission: 'READ' | 'EDIT' = 'READ') => 
      apiClient.tenant.post(`/workflows/${workflowId}/collaborators`, { targetUserId, permission }),
    updatePermission: (workflowId: string, targetUserId: string, permission: 'READ' | 'EDIT') =>
      apiClient.tenant.put(`/workflows/${workflowId}/collaborators/${targetUserId}`, { permission }),
    removeCollaborator: (workflowId: string, targetUserId: string) =>
      apiClient.tenant.delete(`/workflows/${workflowId}/collaborators/${targetUserId}`),
    getShared: () => apiClient.tenant.get('/workflows/shared'),
  },

  // 资产API（商业版使用租户 API）
  assets: {
    getAll: (params?: any) => apiClient.tenant.get('/assets', { params }),
    getById: (id: string) => apiClient.tenant.get(`/assets/${id}`),
    
    // 获取预签名 URL（用于前端直传 OSS）
    getPresignedUrl: (fileName: string, contentType: string) =>
      apiClient.tenant.post('/assets/presigned-url', { fileName, contentType }),
    
    // 确认直传完成
    confirmDirectUpload: (data: {
      objectKey: string;
      publicUrl: string;
      fileName: string;
      contentType: string;
      size: number;
      assetLibraryId?: string;
      customName?: string;
    }) => apiClient.tenant.post('/assets/confirm-upload', data),
    
    // 商业版上传：默认上传到租户本地服务端
    // 只有需要传给 AI 模型时才临时上传到 OSS
    upload: async (file: File, metadata?: any, config?: AxiosRequestConfig) => {
      const startTime = Date.now();
      
      // 获取本地存储配置
      const { useTenantStorageStore } = await import('../store/tenantStorageStore');
      const storageConfig = useTenantStorageStore.getState().config;
      
      // 商业版：优先使用本地存储
      if (storageConfig.localServerUrl) {
        console.log('[上传] 商业版本地存储，上传到:', storageConfig.localServerUrl);
      
      const formData = new FormData();
      formData.append('file', file);
        if (metadata?.userId) {
          formData.append('userId', metadata.userId);
      }
      
      try {
          const response = await axios.post(`${storageConfig.localServerUrl}/api/upload`, formData, {
          ...config,
            timeout: 300000,
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });
        
          console.log('[上传] 本地上传完成，耗时:', Date.now() - startTime, 'ms');
          console.log('[上传] 响应:', response.data);
          
          // 返回格式与 OSS 上传一致（租户服务端已返回 data 字段）
          if (response.data.data) {
            return response.data;
          }
          
          // 兼容旧格式（向后兼容）
          return {
            success: true,
            data: {
              id: `local_${Date.now()}`,
              name: response.data.filename,
              originalName: file.name,
              type: file.type.startsWith('image/') ? 'IMAGE' : 
                    file.type.startsWith('video/') ? 'VIDEO' : 
                    file.type.startsWith('audio/') ? 'AUDIO' : 'DOCUMENT',
              mimeType: file.type,
              url: response.data.localUrl,
              localPath: response.data.localPath,
              size: response.data.size,
            },
          };
      } catch (error: any) {
          console.error('[上传] 本地上传失败:', error.message);
          // 如果本地上传失败，提示用户检查租户服务端
          throw new Error('本地上传失败，请检查租户服务端是否运行。' + (error.message || ''));
      }
      }
      
      // 未配置本地服务端时，提示用户配置
      console.warn('[上传] 未配置本地服务端地址，请先在设置中配置租户服务端');
      throw new Error('请先在设置中配置租户服务端地址');
    },
    
    // 服务器中转上传（备用，使用租户 API）
    uploadViaServer: (file: File, metadata?: any, config?: AxiosRequestConfig) => {
      const formData = new FormData();
      formData.append('file', file);
      if (metadata) {
        formData.append('metadata', JSON.stringify(metadata));
      }
      return api.post('/tenant/assets/upload', formData, config).then((res) => res.data);
    },
    
    proxyDownload: (url: string) =>
      api.get('/tenant/assets/proxy-download', { params: { url }, responseType: 'arraybuffer' }).then((res) => res.data),
    
    /**
     * 从远程 URL 转存到 OSS（前端直接处理，不走服务器带宽）
     * @param url 远程文件 URL（如 AI 生成的图片/视频 URL）
     * @param fileName 可选的文件名
     * @returns OSS 公共 URL
     */
    transferToOss: async (url: string, fileName?: string): Promise<string> => {
      // 如果已经是 OSS URL，直接返回
      if (url.includes('aliyuncs.com')) {
        return url;
      }
      
      const startTime = Date.now();
      console.log('[转存] 开始从 URL 转存到 OSS:', url.substring(0, 100));
      
      try {
        // 1. 尝试前端直接下载（可能遇到 CORS）
        let blob: Blob;
        let contentType = 'application/octet-stream';
        
        try {
          const response = await fetch(url, { 
            mode: 'cors',
            credentials: 'omit',
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          blob = await response.blob();
          contentType = response.headers.get('content-type') || contentType;
          console.log('[转存] 前端直接下载成功，大小:', (blob.size / 1024 / 1024).toFixed(2), 'MB');
        } catch (corsError) {
          // CORS 失败，通过服务器代理下载
          console.log('[转存] 前端下载失败(CORS)，使用服务器代理...');
          const buffer = await apiClient.assets.proxyDownload(url);
          blob = new Blob([buffer]);
          // 从 URL 推断类型
          if (url.includes('.mp4')) contentType = 'video/mp4';
          else if (url.includes('.png')) contentType = 'image/png';
          else if (url.includes('.jpg') || url.includes('.jpeg')) contentType = 'image/jpeg';
          else if (url.includes('.webp')) contentType = 'image/webp';
          else if (url.includes('.mp3')) contentType = 'audio/mpeg';
          else if (url.includes('.wav')) contentType = 'audio/wav';
        }
        
        // 2. 确定文件扩展名
        let ext = '.bin';
        if (contentType.includes('video/mp4')) ext = '.mp4';
        else if (contentType.includes('video/webm')) ext = '.webm';
        else if (contentType.includes('image/png')) ext = '.png';
        else if (contentType.includes('image/jpeg')) ext = '.jpg';
        else if (contentType.includes('image/webp')) ext = '.webp';
        else if (contentType.includes('image/gif')) ext = '.gif';
        else if (contentType.includes('audio/mpeg')) ext = '.mp3';
        else if (contentType.includes('audio/wav')) ext = '.wav';
        else if (contentType.includes('audio/mp4')) ext = '.m4a';
        
        const finalFileName = fileName || `transfer-${Date.now()}${ext}`;
        
        // 3. 获取预签名 URL（租户 API）
        const presignedRes = await apiClient.tenant.post('/assets/presigned-url', {
          fileName: finalFileName,
          contentType,
        });
        
        if (!presignedRes.success || !presignedRes.data) {
          throw new Error('获取上传地址失败');
        }
        
        const { uploadUrl, publicUrl } = presignedRes.data;
        
        // 4. 直传到 OSS
        await axios.put(uploadUrl, blob, {
          headers: { 'Content-Type': contentType },
          timeout: 300000,
        });
        
        console.log('[转存] 完成，耗时:', Date.now() - startTime, 'ms, OSS URL:', publicUrl);
        return publicUrl;
      } catch (error: any) {
        console.error('[转存] 失败:', error.message);
        // 最终回退：让服务器处理
        console.log('[转存] 回退到服务器转存...');
        const res = await apiClient.tenant.post('/assets/transfer-url', { url });
        return res.data?.url || url;
      }
    },
    
    update: (id: string, data: { name?: string }) =>
      apiClient.tenant.put(`/assets/${id}`, data),
    delete: (id: string) => apiClient.tenant.delete(`/assets/${id}`),
  },

  // 资产库API（商业版使用租户 API）
  assetLibraries: {
    getAll: (params?: any, config?: AxiosRequestConfig) =>
      apiClient.tenant.get('/asset-libraries', { ...(config || {}), params }),
    getById: (id: string) => apiClient.tenant.get(`/asset-libraries/${id}`),
    create: (data: { name: string; description?: string; thumbnail?: string; category?: 'ROLE' | 'SCENE' | 'PROP' | 'OTHER' }) =>
      apiClient.tenant.post('/asset-libraries', data),
    update: (id: string, data: { name?: string; description?: string; thumbnail?: string; category?: 'ROLE' | 'SCENE' | 'PROP' | 'OTHER' }) =>
      apiClient.tenant.put(`/asset-libraries/${id}`, data),
    delete: (id: string) => apiClient.tenant.delete(`/asset-libraries/${id}`),
    getAssets: (id: string) => apiClient.tenant.get(`/asset-libraries/${id}/assets`),
    uploadAsset: async (libraryId: string, file: File, customName?: string, config?: AxiosRequestConfig) => {
      // 使用直传 OSS
      return apiClient.assets.upload(file, { assetLibraryId: libraryId, customName }, config);
    },
    addFromUrl: (libraryId: string, url: string, name?: string) =>
      apiClient.tenant.post(`/asset-libraries/${libraryId}/add-from-url`, { url, name }),
    // 协作者/分享相关
    searchUsers: (query: string) => apiClient.tenant.get('/users/search', { params: { query } }),
    getCollaborators: (libraryId: string) => apiClient.tenant.get(`/asset-libraries/${libraryId}/collaborators`),
    addCollaborator: (libraryId: string, targetUserId: string, canDownload: boolean = true) =>
      apiClient.tenant.post(`/asset-libraries/${libraryId}/collaborators`, { targetUserId, canDownload }),
    removeCollaborator: (libraryId: string, targetUserId: string) =>
      apiClient.tenant.delete(`/asset-libraries/${libraryId}/collaborators/${targetUserId}`),
    getShared: () => apiClient.tenant.get('/asset-libraries/shared'),
    // 角色接口
    roles: {
      create: (libraryId: string, data: { name: string; faceAssetId?: string; frontAssetId?: string; sideAssetId?: string; backAssetId?: string; voiceAssetId?: string; documentAssetId?: string; }) =>
        apiClient.tenant.post(`/asset-libraries/${libraryId}/roles`, data),
      list: (libraryId: string) => apiClient.tenant.get(`/asset-libraries/${libraryId}/roles`),
      update: (libraryId: string, roleId: string, data: Partial<{ name: string; faceAssetId?: string | null; frontAssetId?: string | null; sideAssetId?: string | null; backAssetId?: string | null; voiceAssetId?: string | null; documentAssetId?: string | null; }>) =>
        apiClient.tenant.put(`/asset-libraries/${libraryId}/roles/${roleId}`, data),
      delete: (libraryId: string, roleId: string) =>
        apiClient.tenant.delete(`/asset-libraries/${libraryId}/roles/${roleId}`),
    },
  },

  // 任务API（商业版使用租户 API）
  tasks: {
    // 创建图片生成任务
    createImageTask: (data: {
      modelId: string;
      prompt: string;
      ratio?: string;
      referenceImages?: string[];
      sourceNodeId?: string;
      imageSize?: string; // Gemini 3 Pro Image 分辨率 (2K/4K)
      metadata?: {
        maxImages?: number; // SeeDream 4.5 组图数量 (1-15)
        [key: string]: any;
      };
    }) => apiClient.tenant.post('/tasks/image', data),

    // 创建视频生成任务
    createVideoTask: (data: {
      modelId: string;
      prompt: string;
      ratio?: string;
      referenceImages?: string[];
      roleIds?: string[]; // 角色ID数组（用于从数据库查询 subjects）
      subjects?: Array<{ name: string; images: string[] }>; // 直接传递 subjects（优先使用）
      generationType?: string;
      sourceNodeId?: string;
      metadata?: {
        duration?: number;
        resolution?: string;
        roleIds?: string[]; // 兼容旧代码，也支持在 metadata 中传递
        [key: string]: any;
      };
    }) => apiClient.tenant.post('/tasks/video', data),

    // 查询任务状态
    getTaskStatus: (taskId: string) => apiClient.tenant.get(`/tasks/${taskId}`),

    // 获取用户任务列表
    getUserTasks: (limit?: number) => apiClient.tenant.get('/tasks', { params: { limit } }),

    // 获取进行中的任务（用于页面刷新后恢复）
    getActiveTask: (sourceNodeId: string) =>
      apiClient.tenant.get('/tasks/active', { params: { sourceNodeId } }),

    // 获取待创建的预览节点
    getPendingPreviewNodes: (sourceNodeId: string) =>
      apiClient.tenant.get('/tasks/pending-preview-nodes', { params: { sourceNodeId } }),

    // 标记预览节点已创建
    markPreviewNodeCreated: (taskId: string) =>
      apiClient.tenant.post(`/tasks/${taskId}/mark-preview-created`),
  },

  // AI服务API（商业版使用租户 API）
  ai: {
    text: {
      generate: async (data: {
        modelId: string;
        prompt: string;
        systemPrompt?: string;
        temperature?: number;
        maxTokens?: number;
        documentFiles?: Array<{ filePath: string; mimeType: string; }>;
        imageUrls?: string[];
        videoUrls?: string[];
      }) => {
        try {
          return await api.post('/tenant/ai/text/generate', data, { timeout: 450000 }).then((res) => res.data);
        } catch (error: any) {
          const status = error?.response?.status;
          const code = error?.code;
          const cfg: any = error?.config || {};
          if ((code === 'ECONNABORTED' || (status && status >= 500)) && !cfg.__retriedOnce) {
            const newConfig = { ...cfg, timeout: 45000, __retriedOnce: true };
            return await api.request(newConfig).then((res) => res.data);
          }
          throw error;
        }
      },
    },
    audio: {
      createVoice: (data: { modelId?: string; targetModel?: string; prefix: string; url: string; promptUrl?: string; promptText?: string; voiceId?: string; previewText?: string }) =>
        apiClient.tenant.post('/ai/audio/voice/create', data),
      queryVoice: (params: { voiceId: string; modelId?: string }) =>
        apiClient.tenant.get('/ai/audio/voice/status', { params }),
      design: (data: { modelId: string; prompt: string; preview_text?: string; voice_id?: string; aigc_watermark?: boolean }) =>
        apiClient.tenant.post('/ai/audio/voice/design', data),
      synthesize: (data: { modelId: string; voiceId: string; text: string; format?: 'mp3' | 'wav'; sampleRate?: number; volume?: number; rate?: number; pitch?: number; stream?: boolean; subtitle_enable?: boolean; language_boost?: string; pronunciation_dict?: any; timber_weights?: any[]; voice_modify?: any; output_format?: 'hex' | 'url'; aigc_watermark?: boolean }) =>
        apiClient.tenant.post('/ai/audio/synthesize', data),
      presets: () => apiClient.tenant.get('/ai/audio/voice/presets'),
      voices: {
        list: () => apiClient.tenant.get('/ai/audio/voices'),
        add: (data: { voiceId: string; prefix?: string; targetModel?: string; provider?: string }) => apiClient.tenant.post('/ai/audio/voices', data),
        update: (id: string, data: { prefix?: string }) => apiClient.tenant.put(`/ai/audio/voices/${id}`, data),
        delete: (id: string) => apiClient.tenant.delete(`/ai/audio/voices/${id}`),
      },
    },
    image: {
      generate: (data: { modelId: string; prompt: string; ratio?: string; referenceImages?: string[] }) =>
        apiClient.tenant.post('/ai/image/generate', data),
    },
    video: {
      generate: (data: {
        modelId: string;
        prompt: string;
        ratio?: string;
        resolution?: string;
        generationType?: string;
        duration?: number;
        referenceImages?: string[];
      }) =>
        // 视频生成需要很长时间，设置30分钟超时
        api.post('/tenant/ai/video/generate', data, { timeout: 18000000 }).then((res) => res.data),
    },
    // 保留旧的API用于兼容
    adaptScript: (data: { text: string; style?: string }) =>
      apiClient.post('/ai/script/adapt', data),
    generateImage: (data: { prompt: string; style?: string }) =>
      apiClient.post('/ai/image/generate', data),
    generateVideo: (data: { imageUrl: string; duration?: number }) =>
      apiClient.post('/ai/video/generate', data),
  },

  // 管理员API
  admin: {
    getUsers: (params?: any) => apiClient.get('/admin/users', { params }),
    updateUser: (id: string, data: any) =>
      apiClient.put(`/admin/users/${id}`, data),
    deleteUser: (id: string) => apiClient.delete(`/admin/users/${id}`),
    getStats: () => apiClient.get('/admin/stats'),
    getServerMetrics: () => apiClient.get('/admin/server-metrics'),
    getSettings: () => apiClient.get('/admin/settings'),
    updateSettings: (data: any) => apiClient.put('/admin/settings', data),
    // AI模型管理
    getAIModels: (params?: any) => apiClient.get('/admin/ai-models', { params }),
    upsertAIModelCapabilities: (data: { aiModelId: string; capabilities: Array<{ capability: string; supported?: boolean; signature?: any; overrides?: any; source?: string }> }) => apiClient.post('/admin/ai-models/capabilities', data),
    createAIModel: async (data: any) => {
      const resp: any = await api.post('/admin/ai-models', data).then((res) => res.data);
      return resp?.data ?? resp;
    },
    updateAIModel: async (id: string, data: any) => {
      const resp: any = await api.put(`/admin/ai-models/${id}`, data).then((res) => res.data);
      return resp?.data ?? resp;
    },
    deleteAIModel: (id: string) => apiClient.delete(`/admin/ai-models/${id}`),

    // 任务管理
    tasks: {
      // 获取任务列表
      getList: (params?: {
        page?: number;
        limit?: number;
        status?: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILURE';
        type?: 'IMAGE' | 'VIDEO';
        modelId?: string;
        userId?: string;
        nickname?: string;
        dateFrom?: string;
        dateTo?: string;
        isZombie?: boolean;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
      }) => apiClient.get('/admin/tasks', { params }),
      // 获取任务统计
      getStats: () => apiClient.get('/admin/tasks/stats'),
      // 手动退款
      refund: (taskId: string) => apiClient.post(`/admin/tasks/${taskId}/refund`),
      // 取消任务
      cancel: (taskId: string, refund?: boolean) => 
        apiClient.post(`/admin/tasks/${taskId}/cancel`, { refund }),
    },

    // 用户等级权限管理
    userLevels: {
      // 获取所有等级配置
      getConfigs: () => apiClient.get('/admin/user-levels/configs'),
      // 更新等级配置
      updateConfig: (data: {
        userRole: 'USER' | 'VIP' | 'SVIP';
        dailyGiftCredits?: number;
        giftDays?: number;
        giftDescription?: string;
        maxConcurrency?: number;
        isActive?: boolean;
      }) => apiClient.put('/admin/user-levels/configs', data),
      // 批量更新等级配置
      batchUpdateConfigs: (configs: Array<{
        userRole: 'USER' | 'VIP' | 'SVIP';
        dailyGiftCredits?: number;
        giftDays?: number;
        giftDescription?: string;
        maxConcurrency?: number;
        isActive?: boolean;
      }>) => apiClient.put('/admin/user-levels/configs/batch', { configs }),

      // 获取所有模型权限配置
      getPermissions: (params?: { aiModelId?: string; nodeType?: string; moduleType?: string }) =>
        apiClient.get('/admin/user-levels/permissions', { params }),
      // 获取模型权限配置摘要
      getPermissionsSummary: () => apiClient.get('/admin/user-levels/permissions/summary'),
      // 更新模型权限配置
      updatePermission: (data: {
        aiModelId?: string;
        nodeType?: string;
        moduleType?: string;
        userRole: 'USER' | 'VIP' | 'SVIP';
        isAllowed?: boolean;
        dailyLimit?: number;
        isFreeForMember?: boolean;
        freeDailyLimit?: number;
        isActive?: boolean;
      }) => apiClient.put('/admin/user-levels/permissions', data),
      // 批量更新模型权限配置
      batchUpdatePermissions: (permissions: Array<{
        aiModelId?: string;
        nodeType?: string;
        moduleType?: string;
        userRole: 'USER' | 'VIP' | 'SVIP';
        isAllowed?: boolean;
        dailyLimit?: number;
        isFreeForMember?: boolean;
        freeDailyLimit?: number;
        isActive?: boolean;
      }>) => apiClient.put('/admin/user-levels/permissions/batch', { permissions }),
      // 快速为模型设置所有等级权限
      setModelPermissionsForAllLevels: (data: {
        aiModelId?: string;
        nodeType?: string;
        moduleType?: string;
        permissions: {
          USER?: { isAllowed?: boolean; dailyLimit?: number; isFreeForMember?: boolean; freeDailyLimit?: number };
          VIP?: { isAllowed?: boolean; dailyLimit?: number; isFreeForMember?: boolean; freeDailyLimit?: number };
          SVIP?: { isAllowed?: boolean; dailyLimit?: number; isFreeForMember?: boolean; freeDailyLimit?: number };
        };
      }) => apiClient.put('/admin/user-levels/permissions/model', data),
      // 删除模型权限配置
      deletePermission: (id: string) => apiClient.delete(`/admin/user-levels/permissions/${id}`),

      // 获取用户使用统计
      getUserUsageStats: (userId: string, date?: string) =>
        apiClient.get('/admin/user-levels/usage-stats', { params: { userId, date } }),
      // 手动赠送用户积分
      grantGiftCredits: (userId: string) =>
        apiClient.post('/admin/user-levels/gift-credits', { userId }),
      // 获取用户赠送积分状态
      getGiftCreditsStatus: (userId: string) =>
        apiClient.get('/admin/user-levels/gift-credits/status', { params: { userId } }),
      // 更新用户会员信息
      updateUserMembership: (userId: string, data: {
        role?: 'USER' | 'VIP' | 'SVIP' | 'ADMIN' | 'INTERNAL';
        membershipExpireAt?: string | null;
        giftStartDate?: string | null;
      }) => apiClient.put(`/admin/user-levels/users/${userId}/membership`, data),
    },
  },

  // 智能体API
  agents: {
    getAll: () => apiClient.tenant.get('/agents'),
    getById: (id: string) => apiClient.tenant.get(`/agents/${id}`),
    create: (data: {
      name: string;
      description?: string;
      isActive?: boolean;
    }) => apiClient.post('/agents', data),
    update: (id: string, data: Partial<{
      name: string;
      description?: string;
      isActive: boolean;
    }>) => apiClient.put(`/agents/${id}`, data),
    delete: (id: string) => apiClient.delete(`/agents/${id}`),
    getAvailableModels: () => apiClient.get('/agents/models'),
    roles: {
      list: () => apiClient.get('/agent-roles'),
      listByAgent: (agentId: string) => apiClient.tenant.get(`/agent-roles/by-agent/${agentId}`),
      getById: (id: string) => apiClient.get(`/agent-roles/${id}`),
      create: (data: { agentId: string; name: string; description?: string; systemPrompt: string; aiModelId: string; temperature?: number; maxTokens?: number; isActive?: boolean; }) => apiClient.post('/agent-roles', data),
      update: (id: string, data: Partial<{ name: string; description?: string; systemPrompt: string; aiModelId: string; temperature?: number; maxTokens?: number; isActive?: boolean; order?: number; }>) => apiClient.put(`/agent-roles/${id}`, data),
      delete: (id: string) => apiClient.delete(`/agent-roles/${id}`),
      execute: (id: string, data: { prompt: string; systemPrompt?: string; temperature?: number; maxTokens?: number; documentFiles?: any[]; imageUrls?: string[]; videoUrls?: string[] }) => apiClient.tenant.post(`/agent-roles/${id}/execute`, data),
    },
  },

  // 文档服务API
  documents: {
    extractText: (filePath: string) => apiClient.post('/documents/extract-text', { filePath }),
    getBase64: (filePath: string) => apiClient.post('/documents/base64', { filePath }),
  },

  // Midjourney API
  midjourney: {
    // 提交 Imagine 任务（文生图）
    imagine: (data: { prompt: string; base64Array?: string[]; nodeId?: string; mode?: 'relax' | 'fast' }) =>
      apiClient.post('/midjourney/imagine', data),

    // 查询任务状态（设置10秒超时避免轮询卡住）
    fetchTask: (taskId: string) =>
      api.get(`/midjourney/task/${taskId}`, { timeout: 10000 }).then((res) => res.data),

    // 轮询任务直到完成（阻塞调用）
    pollTask: (taskId: string) =>
      // 设置5分钟超时
      api.get(`/midjourney/task/${taskId}/poll`, { timeout: 300000 }).then((res) => res.data),

    // 执行动作（Upscale、Variation 等）
    action: (data: { taskId: string; customId: string; messageId?: string; nodeId?: string; mode?: 'relax' | 'fast' }) =>
      apiClient.post('/midjourney/action', data),

    // Blend（图片混合）
    blend: (base64Array: string[]) =>
      apiClient.post('/midjourney/blend', { base64Array }),

    // Describe（图生文）
    describe: (base64: string) =>
      apiClient.post('/midjourney/describe', { base64 }),

    // 上传参考图到 Discord（用于 V7 Omni-Reference）
    uploadReferenceImage: (data: { imageUrl?: string; base64?: string; filename?: string }) =>
      apiClient.post('/midjourney/upload-reference', data),

    // 获取 Midjourney 设置（Fast 模式是否可用等）
    getSettings: () =>
      apiClient.get('/midjourney/settings'),
  },

  // 翻译 API
  translation: {
    // 翻译文本
    translate: (data: { text: string; from?: string; to?: string }) =>
      apiClient.post('/translation/translate', data),

    // 智能翻译（自动检测语言，如果不是英文则翻译）
    smartTranslate: (data: { text: string }) =>
      apiClient.post('/translation/smart-translate', data),

    // 检测语言
    detectLanguage: (data: { text: string }) =>
      apiClient.post('/translation/detect', data),
  },

  // 支付与充值 API
  payment: {
    // 获取活跃套餐列表（用户端）
    getPackages: (type?: 'RECHARGE' | 'CREDITS') => 
      apiClient.get('/payment/packages', { params: type ? { type } : undefined }),

    // 创建充值订单
    createOrder: (data: { packageId: string; paymentMethod?: string }) =>
      apiClient.post('/payment/orders', data),

    // 查询订单状态
    getOrderStatus: (orderNo: string) =>
      apiClient.get(`/payment/orders/${orderNo}/status`),

    // 获取用户订单列表
    getOrders: (params?: { page?: number; limit?: number; status?: string }) =>
      apiClient.get('/payment/orders', { params }),

    // 获取用户积分流水
    getTransactions: (params?: { page?: number; limit?: number; type?: string }) =>
      apiClient.get('/payment/transactions', { params }),

    // ===== 管理员接口 =====
    admin: {
      // 支付配置
      getConfigs: () => apiClient.get('/payment/admin/configs'),
      getConfig: (id: string) => apiClient.get(`/payment/admin/configs/${id}`),
      saveConfig: (data: {
        provider: string;
        name: string;
        appId: string;
        privateKey?: string;
        publicKey?: string;
        config?: any;
        isActive?: boolean;
        isSandbox?: boolean;
      }) => apiClient.post('/payment/admin/configs', data),
      testConfig: (id: string) => apiClient.post(`/payment/admin/configs/${id}/test`),
      deleteConfig: (id: string) => apiClient.delete(`/payment/admin/configs/${id}`),

      // 套餐管理
      getPackages: (type?: 'RECHARGE' | 'CREDITS') => 
        apiClient.get('/payment/admin/packages', { params: type ? { type } : undefined }),
      createPackage: (data: {
        type?: 'RECHARGE' | 'CREDITS';
        name: string;
        description?: string;
        price: number;
        credits: number;
        bonusCredits?: number;
        memberLevel?: string;
        memberDays?: number;
        coverImage?: string;
        badge?: string;
        badgeColor?: string;
        sortOrder?: number;
        isActive?: boolean;
        isRecommend?: boolean;
      }) => apiClient.post('/payment/admin/packages', data),
      updatePackage: (id: string, data: any) =>
        apiClient.put(`/payment/admin/packages/${id}`, data),
      deletePackage: (id: string) =>
        apiClient.delete(`/payment/admin/packages/${id}`),

      // 手动充值
      recharge: (data: { userId: string; credits: number; description?: string }) =>
        apiClient.post('/payment/admin/recharge', data),
    },
  },

  // 兑换码 API
  redeem: {
    // 用户兑换
    redeem: (code: string) => apiClient.post('/redeem/redeem', { code }),

    // 管理员接口
    admin: {
      // 获取兑换码列表
      getCodes: (params?: { page?: number; pageSize?: number; status?: string; batchId?: string }) =>
        apiClient.get('/redeem/codes', { params }),

      // 获取批次列表
      getBatches: () => apiClient.get('/redeem/batches'),

      // 生成兑换码
      generate: (data: {
        count: number;
        credits: number;
        memberLevel?: string;
        memberDays?: number;
        expireAt?: string;
        remark?: string;
      }) => apiClient.post('/redeem/generate', data),

      // 删除单个兑换码
      deleteCode: (id: string) => apiClient.delete(`/redeem/codes/${id}`),

      // 删除批次
      deleteBatch: (batchId: string) => apiClient.delete(`/redeem/batches/${batchId}`),
    },
  },

  // Sora角色 API（商业版使用租户路径）
  soraCharacters: {
    // 获取当前用户的所有角色
    list: (params?: { search?: string; limit?: number; includeShared?: string }) =>
      apiClient.get('/tenant/sora-characters', { params }),

    // 搜索角色（用于@提及自动完成）
    search: (q: string, limit = 5) =>
      apiClient.get('/tenant/sora-characters/search', { params: { q, limit } }),

    // 获取单个角色
    getById: (id: string) =>
      apiClient.get(`/tenant/sora-characters/${id}`),

    // 通过自定义名称获取角色
    getByCustomName: (customName: string) =>
      apiClient.get(`/tenant/sora-characters/by-name/${encodeURIComponent(customName)}`),

    // 创建角色
    create: (data: {
      customName: string;
      characterName: string;
      avatarUrl?: string;
      sourceVideoUrl?: string;
      description?: string;
    }) => apiClient.post('/tenant/sora-characters', data),

    // 更新角色
    update: (id: string, data: {
      customName?: string;
      description?: string;
      avatarUrl?: string;
    }) => apiClient.put(`/tenant/sora-characters/${id}`, data),

    // 删除角色
    delete: (id: string) =>
      apiClient.delete(`/tenant/sora-characters/${id}`),

    // 协作者管理
    searchUsers: (query: string) =>
      apiClient.get('/tenant/sora-characters/users/search', { params: { q: query } }),
    getCollaborators: () =>
      apiClient.get('/tenant/sora-characters/collaborators'),
    addCollaborator: (targetUserId: string) =>
      apiClient.post('/tenant/sora-characters/share', { targetUserId }),
    removeCollaborator: (targetUserId: string) =>
      apiClient.post('/tenant/sora-characters/unshare', { targetUserId }),
    getShareInfo: () =>
      apiClient.get('/tenant/sora-characters/share-info'),
  },
};

export default api;

/**
 * 刷新租户积分（商业版使用）
 * 调用租户 API 获取最新积分，并更新到 authStore
 */
export const refreshTenantCredits = async (): Promise<void> => {
  try {
    const res = await apiClient.tenant.get('/me');
    if (res.data?.tenant?.credits !== undefined) {
      useAuthStore.getState().updateUser({ credits: res.data.tenant.credits });
    }
  } catch (e) {
    console.warn('刷新租户积分失败:', e);
  }
};
