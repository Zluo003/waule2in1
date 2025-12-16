/**
 * 任务结果处理工具
 * 用于处理 AI 生成任务完成后的结果
 */

export interface TaskResult {
  taskId: string;
  resultUrl: string;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO';
  allImageUrls?: string[];  // 多图情况
}

export interface ProcessedResult {
  // 最终用于显示的 URL
  displayUrl: string;
  // 所有图片的显示 URL（多图情况）
  allDisplayUrls?: string[];
  // 是否已下载到本地
  isLocalStored: boolean;
  // 原始 URL
  originalUrl: string;
}

/**
 * 处理任务完成后的结果
 * 
 * @param result 任务结果
 * @returns 处理后的结果，包含用于显示的 URL
 */
export async function processTaskResult(result: TaskResult): Promise<ProcessedResult> {
  const { resultUrl, allImageUrls } = result;
  
  // 直接返回原始 URL（简化版本，不做本地存储处理）
  return {
    displayUrl: resultUrl,
    allDisplayUrls: allImageUrls,
    isLocalStored: false,
    originalUrl: resultUrl,
  };
}

/**
 * 处理单个 URL
 */
export async function processUrl(
  url: string,
  _type: 'IMAGE' | 'VIDEO' | 'AUDIO' = 'IMAGE',
  _taskId?: string
): Promise<{ localUrl: string; isLocalStored: boolean }> {
  return { localUrl: url, isLocalStored: false };
}

/**
 * 检查 URL 是否是本地服务端的 URL
 */
export function isLocalUrl(url: string): boolean {
  if (!url) return false;
  
  const localPatterns = [
    /^http:\/\/localhost/,
    /^http:\/\/127\.0\.0\.1/,
    /^http:\/\/192\.168\./,
    /^http:\/\/10\./,
    /^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./,
  ];

  return localPatterns.some(pattern => pattern.test(url));
}
