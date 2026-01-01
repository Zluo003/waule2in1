/**
 * 任务结果处理工具
 * 用于处理 AI 生成任务完成后的本地存储下载
 */

import { isLocalStorageEnabled } from '../store/tenantStorageStore';
import { handleTaskCompleted, downloadResultToLocal, confirmDownloadComplete } from '../api/tenantLocalServer';
import { useTenantAuthStore } from '../store/tenantAuthStore';

export interface TaskResult {
  taskId: string;
  resultUrl: string;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO';
  allImageUrls?: string[];  // 多图情况
}

export interface ProcessedResult {
  // 最终用于显示的 URL（本地模式下是本地 URL，否则是原 URL）
  displayUrl: string;
  // 所有图片的显示 URL（多图情况）
  allDisplayUrls?: string[];
  // 是否已下载到本地
  isLocalStored: boolean;
  // 原始 OSS URL
  originalUrl: string;
}

/**
 * 处理任务完成后的结果
 * 如果启用了本地存储，会自动下载到本地并返回本地 URL
 * 否则直接返回原始 URL
 * 
 * @param result 任务结果
 * @returns 处理后的结果，包含用于显示的 URL
 */
export async function processTaskResult(result: TaskResult): Promise<ProcessedResult> {
  const { resultUrl, taskId, type, allImageUrls } = result;
  
  // 如果 URL 已经是本地 URL，说明之前已经下载过了，直接返回
  if (isLocalUrl(resultUrl)) {
    console.log(`[TaskResultHandler] URL 已是本地地址，跳过下载: ${resultUrl}`);
    return {
      displayUrl: resultUrl,
      allDisplayUrls: allImageUrls,
      isLocalStored: true,
      originalUrl: resultUrl,
    };
  }
  
  // 如果未启用本地存储，直接返回原始 URL
  if (!isLocalStorageEnabled()) {
    return {
      displayUrl: resultUrl,
      allDisplayUrls: allImageUrls,
      isLocalStored: false,
      originalUrl: resultUrl,
    };
  }

  // 本地存储模式：下载到本地
  try {
    const user = useTenantAuthStore.getState().user;
    const userId = user?.id || 'default';

    // 判断是否有多图需要下载
    const hasMultipleImages = allImageUrls && allImageUrls.length > 0;

    // 处理主结果 URL（如果有多图，跳过确认删除，等所有文件下载完成后再确认）
    const downloadResult = await handleTaskCompleted(taskId, resultUrl, type, userId, hasMultipleImages);

    let displayUrl = resultUrl;
    let allDisplayUrls = allImageUrls;
    let isLocalStored = false;

    if (downloadResult.success && downloadResult.localUrl) {
      displayUrl = downloadResult.localUrl;
      isLocalStored = true;
      console.log(`[TaskResultHandler] 主文件已下载到本地: ${displayUrl}`);
    }

    // 如果有多图，处理所有图片
    if (allImageUrls && allImageUrls.length > 0) {
      const localUrls: string[] = [];

      for (let i = 0; i < allImageUrls.length; i++) {
        const imgUrl = allImageUrls[i];

        // 如果已经是本地 URL，直接使用
        if (isLocalUrl(imgUrl)) {
          localUrls.push(imgUrl);
          continue;
        }

        // 跳过主图片（已经处理过）
        if (imgUrl === resultUrl && downloadResult.localUrl) {
          localUrls.push(downloadResult.localUrl);
          continue;
        }

        // 下载其他图片
        const imgResult = await downloadResultToLocal(imgUrl, `${taskId}-${i}`, type, userId);
        if (imgResult.success && imgResult.localUrl) {
          localUrls.push(imgResult.localUrl);
        } else {
          // 下载失败，使用原始 URL
          localUrls.push(imgUrl);
        }
      }

      allDisplayUrls = localUrls;
      console.log(`[TaskResultHandler] 多图已下载到本地: ${localUrls.length} 张`);

      // 所有文件下载完成后，再确认删除 OSS 文件
      confirmDownloadComplete(taskId, displayUrl, resultUrl).catch((err) => {
        console.warn('[TaskResultHandler] 确认删除失败，OSS 文件将在过期后自动删除:', err);
      });
    }

    return {
      displayUrl,
      allDisplayUrls,
      isLocalStored,
      originalUrl: resultUrl,
    };
  } catch (error) {
    console.error('[TaskResultHandler] 下载到本地失败:', error);
    
    // 下载失败，返回原始 URL
    return {
      displayUrl: resultUrl,
      allDisplayUrls: allImageUrls,
      isLocalStored: false,
      originalUrl: resultUrl,
    };
  }
}

/**
 * 处理单个 URL（不涉及任务 ID）
 * 用于处理单个 OSS URL 的本地下载
 */
export async function processUrl(
  url: string,
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' = 'IMAGE',
  taskId?: string
): Promise<{ localUrl: string; isLocalStored: boolean }> {
  if (!isLocalStorageEnabled()) {
    return { localUrl: url, isLocalStored: false };
  }

  try {
    const user = useTenantAuthStore.getState().user;
    const userId = user?.id || 'default';
    const id = taskId || `file-${Date.now()}`;

    const result = await downloadResultToLocal(url, id, type, userId);
    
    if (result.success && result.localUrl) {
      return { localUrl: result.localUrl, isLocalStored: true };
    }
  } catch (error) {
    console.error('[TaskResultHandler] URL 下载失败:', error);
  }

  return { localUrl: url, isLocalStored: false };
}

/**
 * 检查 URL 是否是本地服务端的 URL
 */
export function isLocalUrl(url: string): boolean {
  if (!url) return false;
  
  // 检查是否是内网 IP 或 localhost
  const localPatterns = [
    /^http:\/\/localhost/,
    /^http:\/\/127\.0\.0\.1/,
    /^http:\/\/192\.168\./,
    /^http:\/\/10\./,
    /^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./,
  ];

  return localPatterns.some(pattern => pattern.test(url));
}

