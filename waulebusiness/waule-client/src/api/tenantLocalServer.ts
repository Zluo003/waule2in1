/**
 * 租户本地服务端 API
 * 用于与租户部署的本地服务端通信
 */

import { getLocalServerUrl, isLocalStorageEnabled } from '../store/tenantStorageStore';

export interface UploadResult {
  success: boolean;
  localPath?: string;
  localUrl?: string;
  filename?: string;
  size?: number;
  error?: string;
}

export interface DownloadResult {
  success: boolean;
  localPath?: string;
  localUrl?: string;
  error?: string;
}

export interface OssUploadResult {
  success: boolean;
  ossUrl?: string;
  ossKey?: string;
  error?: string;
}

/**
 * 上传文件到租户本地服务端
 */
export async function uploadToLocalServer(
  file: File,
  userId: string
): Promise<UploadResult> {
  const localServerUrl = getLocalServerUrl();
  if (!localServerUrl) {
    return { success: false, error: '未配置本地服务端地址' };
  }

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', userId);

    const response = await fetch(`${localServerUrl}/api/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.error || '上传失败' };
    }

    const data = await response.json();
    return {
      success: true,
      localPath: data.localPath,
      localUrl: data.localUrl,
      filename: data.filename,
      size: data.size,
    };
  } catch (error: any) {
    console.error('[LocalServer] 上传失败:', error);
    return { success: false, error: error.message || '网络错误' };
  }
}

/**
 * 将本地文件上传到临时 OSS（用于 AI 处理）
 */
export async function uploadLocalFileToOss(
  localPath: string
): Promise<OssUploadResult> {
  const localServerUrl = getLocalServerUrl();
  if (!localServerUrl) {
    return { success: false, error: '未配置本地服务端地址' };
  }

  try {
    const response = await fetch(`${localServerUrl}/api/upload/to-oss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ localPath }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.error || '上传到 OSS 失败' };
    }

    const data = await response.json();
    return {
      success: true,
      ossUrl: data.ossUrl,
      ossKey: data.ossKey,
    };
  } catch (error: any) {
    console.error('[LocalServer] 上传到 OSS 失败:', error);
    return { success: false, error: error.message || '网络错误' };
  }
}

/**
 * 将 Base64 图片上传到本地存储
 */
export async function uploadBase64ToLocal(
  base64Data: string,
  userId: string,
  filename?: string
): Promise<UploadResult> {
  const localServerUrl = getLocalServerUrl();
  if (!localServerUrl) {
    return { success: false, error: '未配置本地服务端地址' };
  }

  try {
    const response = await fetch(`${localServerUrl}/api/upload/base64`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64: base64Data, userId, filename }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.error || '上传失败' };
    }

    const data = await response.json();
    return {
      success: true,
      localPath: data.localPath,
      localUrl: data.localUrl,
      filename: data.filename,
      size: data.size,
    };
  } catch (error: any) {
    console.error('[LocalServer] Base64 上传到本地失败:', error);
    return { success: false, error: error.message || '网络错误' };
  }
}

/**
 * 将 Base64 数据上传到临时 OSS（用于 AI 处理）
 */
export async function uploadBase64ToOss(
  base64Data: string
): Promise<OssUploadResult> {
  const localServerUrl = getLocalServerUrl();
  if (!localServerUrl) {
    return { success: false, error: '未配置本地服务端地址' };
  }

  try {
    const response = await fetch(`${localServerUrl}/api/upload/to-oss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64: base64Data }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.error || '上传到 OSS 失败' };
    }

    const data = await response.json();
    return {
      success: true,
      ossUrl: data.ossUrl,
      ossKey: data.ossKey,
    };
  } catch (error: any) {
    console.error('[LocalServer] Base64 上传到 OSS 失败:', error);
    return { success: false, error: error.message || '网络错误' };
  }
}

/**
 * 从 OSS 下载 AI 生成结果到本地
 */
export async function downloadResultToLocal(
  ossUrl: string,
  taskId: string,
  type: 'IMAGE' | 'VIDEO' | 'AUDIO',
  userId: string
): Promise<DownloadResult> {
  const localServerUrl = getLocalServerUrl();
  if (!localServerUrl) {
    return { success: false, error: '未配置本地服务端地址' };
  }

  try {
    const response = await fetch(`${localServerUrl}/api/download/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, ossUrl, type, userId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.error || '下载失败' };
    }

    const data = await response.json();
    return {
      success: true,
      localPath: data.localPath,
      localUrl: data.localUrl,
    };
  } catch (error: any) {
    console.error('[LocalServer] 下载结果失败:', error);
    return { success: false, error: error.message || '网络错误' };
  }
}

/**
 * 确认下载完成（通知租户服务端向平台确认，删除 OSS 临时文件）
 * @param taskId 任务ID
 * @param localUrl 本地存储的URL，用于更新服务端记录
 * @param ossUrl 原始 OSS URL（用于 Midjourney 等非 TenantTask 的任务）
 */
export async function confirmDownloadComplete(taskId: string, localUrl?: string, ossUrl?: string): Promise<boolean> {
  const localServerUrl = getLocalServerUrl();
  if (!localServerUrl) {
    console.warn('[LocalServer] 确认下载跳过：未配置本地服务端地址');
    return false;
  }

  console.log(`[LocalServer] 🗑️ 请求删除 OSS 文件: taskId=${taskId}, localUrl=${localUrl?.substring(0, 50)}, ossUrl=${ossUrl?.substring(0, 50)}`);
  
  try {
    const response = await fetch(`${localServerUrl}/api/download/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, localUrl, ossUrl }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.warning) {
        console.warn(`[LocalServer] ⚠️ 删除 OSS 文件有警告: ${data.warning}`);
      } else {
        console.log(`[LocalServer] ✅ OSS 文件删除成功: taskId=${taskId}`);
      }
      return true;
    } else {
      const errorText = await response.text();
      console.error(`[LocalServer] ❌ 确认删除失败: ${response.status} ${errorText}`);
      return false;
    }
  } catch (error) {
    console.error('[LocalServer] ❌ 确认下载请求失败:', error);
    return false;
  }
}

/**
 * 检查本地服务端是否可用
 */
export async function checkLocalServerHealth(): Promise<boolean> {
  const localServerUrl = getLocalServerUrl();
  if (!localServerUrl) {
    return false;
  }

  try {
    const response = await fetch(`${localServerUrl}/health`, {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 获取本地存储统计信息
 */
export async function getLocalStorageStats(): Promise<{
  totalFiles: number;
  totalSize: number;
  totalSizeFormatted: string;
} | null> {
  const localServerUrl = getLocalServerUrl();
  if (!localServerUrl) {
    return null;
  }

  try {
    const response = await fetch(`${localServerUrl}/api/files/stats`);
    if (!response.ok) return null;

    const data = await response.json();
    return data.stats;
  } catch {
    return null;
  }
}

/**
 * 智能上传：根据存储模式选择上传目标
 * - LOCAL 模式：先上传到本地，如果需要给 AI 使用则再上传到临时 OSS
 * - OSS 模式：直接返回 null，由调用方使用原有的上传逻辑
 */
export async function smartUpload(
  file: File,
  userId: string,
  needOssUrl: boolean = false
): Promise<{
  localUrl?: string;
  ossUrl?: string;
  localPath?: string;
} | null> {
  if (!isLocalStorageEnabled()) {
    // OSS 模式，返回 null 让调用方使用原有逻辑
    return null;
  }

  // LOCAL 模式
  // 1. 先上传到本地
  const localResult = await uploadToLocalServer(file, userId);
  if (!localResult.success || !localResult.localPath) {
    console.error('[smartUpload] 上传到本地失败:', localResult.error);
    return null;
  }

  // 2. 如果需要 OSS URL（给 AI 使用），再上传到临时 OSS
  if (needOssUrl) {
    const ossResult = await uploadLocalFileToOss(localResult.localPath);
    if (!ossResult.success) {
      console.error('[smartUpload] 上传到 OSS 失败:', ossResult.error);
      // 即使 OSS 上传失败，本地文件已保存，返回本地 URL
    }
    return {
      localUrl: localResult.localUrl,
      localPath: localResult.localPath,
      ossUrl: ossResult.ossUrl,
    };
  }

  return {
    localUrl: localResult.localUrl,
    localPath: localResult.localPath,
  };
}

/**
 * 处理 AI 任务完成：下载结果到本地并通知平台删除 OSS 文件
 * @param skipConfirm 是否跳过确认删除（当有多个文件需要下载时，应该在所有文件下载完成后再确认）
 */
export async function handleTaskCompleted(
  taskId: string,
  ossUrl: string,
  type: 'IMAGE' | 'VIDEO' | 'AUDIO',
  userId: string,
  skipConfirm: boolean = false
): Promise<{
  success: boolean;
  localUrl?: string;
  error?: string;
}> {
  if (!isLocalStorageEnabled()) {
    // OSS 模式，不需要下载到本地
    return { success: true };
  }

  // LOCAL 模式
  // 1. 下载到本地
  const downloadResult = await downloadResultToLocal(ossUrl, taskId, type, userId);
  if (!downloadResult.success) {
    return { success: false, error: downloadResult.error };
  }

  // 2. 通知平台删除 OSS 文件（如果不跳过）
  if (!skipConfirm) {
    // 传递本地URL以更新服务端记录，传递原始ossUrl用于Midjourney等非TenantTask任务
    confirmDownloadComplete(taskId, downloadResult.localUrl, ossUrl).catch((err) => {
      console.warn('[handleTaskCompleted] 确认下载失败，OSS 文件将在过期后自动删除:', err);
    });
  }

  return {
    success: true,
    localUrl: downloadResult.localUrl,
  };
}

// ==================== 客户端配置同步 ====================

export interface ClientConfig {
  clientId: string;
  deviceName?: string;
  localServerUrl: string;
  storageMode: 'OSS' | 'LOCAL';
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 保存客户端配置到服务端
 */
export async function saveClientConfigToServer(
  serverUrl: string,
  config: {
    clientId: string;
    deviceName?: string;
    localServerUrl: string;
    storageMode?: 'OSS' | 'LOCAL';
  }
): Promise<boolean> {
  try {
    const response = await fetch(`${serverUrl}/api/client-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    
    if (!response.ok) {
      console.error('[ClientConfig] 保存配置失败:', response.status);
      return false;
    }
    
    console.log('[ClientConfig] 配置已保存到服务端');
    return true;
  } catch (error) {
    console.error('[ClientConfig] 保存配置失败:', error);
    return false;
  }
}

/**
 * 从服务端获取客户端配置
 */
export async function getClientConfigFromServer(
  serverUrl: string,
  clientId: string
): Promise<ClientConfig | null> {
  try {
    const response = await fetch(`${serverUrl}/api/client-config/${clientId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null; // 未找到配置
      }
      console.error('[ClientConfig] 获取配置失败:', response.status);
      return null;
    }
    
    const data = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('[ClientConfig] 获取配置失败:', error);
    return null;
  }
}

/**
 * 尝试从给定的服务端地址恢复配置
 * 用于启动时自动检测并恢复配置
 */
export async function tryRestoreConfigFromServer(
  serverUrl: string,
  clientId: string
): Promise<ClientConfig | null> {
  try {
    // 先检查服务端是否可用
    const healthResponse = await fetch(`${serverUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000), // 3秒超时
    });
    
    if (!healthResponse.ok) {
      return null;
    }
    
    const healthData = await healthResponse.json();
    if (healthData.service !== 'waule-tenant-server') {
      return null;
    }
    
    // 获取客户端配置
    return await getClientConfigFromServer(serverUrl, clientId);
  } catch (error) {
    console.warn('[ClientConfig] 恢复配置失败:', error);
    return null;
  }
}

