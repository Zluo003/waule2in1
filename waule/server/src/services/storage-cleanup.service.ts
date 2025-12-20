import { prisma } from '../index';
import { batchDeleteFromOss, isOssUrl } from '../utils/oss';
import logger from '../utils/logger';

interface CleanupResult {
  totalScanned: number;
  totalDeleted: number;
  totalFailed: number;
  byTable: Record<string, { scanned: number; deleted: number; failed: number }>;
  errors: string[];
  durationMs: number;
}

/**
 * 从 JSON 对象中递归提取所有 OSS URL
 */
function extractOssUrlsFromJson(obj: any): string[] {
  const urls: string[] = [];
  
  if (!obj) return urls;
  
  if (typeof obj === 'string') {
    if (isOssUrl(obj)) {
      urls.push(obj);
    }
    return urls;
  }
  
  if (Array.isArray(obj)) {
    for (const item of obj) {
      urls.push(...extractOssUrlsFromJson(item));
    }
    return urls;
  }
  
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      urls.push(...extractOssUrlsFromJson(obj[key]));
    }
  }
  
  return urls;
}

/**
 * 执行存储清理任务 - 基于 storageExpiresAt 字段
 * 清理所有已过期的 OSS 内容（storageExpiresAt < now）
 */
export async function runStorageCleanup(): Promise<CleanupResult> {
  const startTime = Date.now();
  const now = new Date();
  const result: CleanupResult = {
    totalScanned: 0,
    totalDeleted: 0,
    totalFailed: 0,
    byTable: {},
    errors: [],
    durationMs: 0,
  };

  try {
    logger.info('[StorageCleanup] 开始执行存储清理任务');

    // 1. 清理 GenerationTask 表中过期的内容
    const taskResult = { scanned: 0, deleted: 0, failed: 0 };
    result.byTable['GenerationTask'] = taskResult;
    
    const expiredTasks = await prisma.generationTask.findMany({
      where: {
        storageExpiresAt: { not: null, lt: now },
      },
      select: { id: true, resultUrl: true, referenceImages: true },
    });
    
    const taskUrls: string[] = [];
    for (const task of expiredTasks) {
      if (task.resultUrl && isOssUrl(task.resultUrl)) taskUrls.push(task.resultUrl);
      if (task.referenceImages) {
        taskUrls.push(...extractOssUrlsFromJson(task.referenceImages));
      }
    }
    taskResult.scanned = taskUrls.length;
    result.totalScanned += taskUrls.length;
    
    if (taskUrls.length > 0) {
      const deleteResult = await batchDeleteFromOss(taskUrls);
      taskResult.deleted = deleteResult.success;
      taskResult.failed = deleteResult.failed;
      result.totalDeleted += deleteResult.success;
      result.totalFailed += deleteResult.failed;
      result.errors.push(...deleteResult.errors.slice(0, 5));
    }
    logger.info(`[StorageCleanup] GenerationTask: 扫描=${taskResult.scanned}, 删除=${taskResult.deleted}`);

    // 2. 清理 Asset 表中过期的内容
    const assetResult = { scanned: 0, deleted: 0, failed: 0 };
    result.byTable['Asset'] = assetResult;
    
    const expiredAssets = await prisma.asset.findMany({
      where: {
        storageExpiresAt: { not: null, lt: now },
      },
      select: { id: true, url: true, thumbnail: true },
    });
    
    const assetUrls: string[] = [];
    for (const asset of expiredAssets) {
      if (asset.url && isOssUrl(asset.url)) assetUrls.push(asset.url);
      if (asset.thumbnail && isOssUrl(asset.thumbnail)) assetUrls.push(asset.thumbnail);
    }
    assetResult.scanned = assetUrls.length;
    result.totalScanned += assetUrls.length;
    
    if (assetUrls.length > 0) {
      const deleteResult = await batchDeleteFromOss(assetUrls);
      assetResult.deleted = deleteResult.success;
      assetResult.failed = deleteResult.failed;
      result.totalDeleted += deleteResult.success;
      result.totalFailed += deleteResult.failed;
      result.errors.push(...deleteResult.errors.slice(0, 5));
    }
    logger.info(`[StorageCleanup] Asset: 扫描=${assetResult.scanned}, 删除=${assetResult.deleted}`);

    // 3. 清理 Node 表中过期的内容
    const nodeResult = { scanned: 0, deleted: 0, failed: 0 };
    result.byTable['Node'] = nodeResult;
    
    const expiredNodes = await prisma.node.findMany({
      where: {
        storageExpiresAt: { not: null, lt: now },
      },
      select: { id: true, data: true },
    });
    
    const nodeUrls: string[] = [];
    for (const node of expiredNodes) {
      if (node.data) {
        nodeUrls.push(...extractOssUrlsFromJson(node.data));
      }
    }
    nodeResult.scanned = nodeUrls.length;
    result.totalScanned += nodeUrls.length;
    
    if (nodeUrls.length > 0) {
      const deleteResult = await batchDeleteFromOss(nodeUrls);
      nodeResult.deleted = deleteResult.success;
      nodeResult.failed = deleteResult.failed;
      result.totalDeleted += deleteResult.success;
      result.totalFailed += deleteResult.failed;
      result.errors.push(...deleteResult.errors.slice(0, 5));
    }
    logger.info(`[StorageCleanup] Node: 扫描=${nodeResult.scanned}, 删除=${nodeResult.deleted}`);

    result.durationMs = Date.now() - startTime;
    logger.info(`[StorageCleanup] 清理任务完成: 总扫描=${result.totalScanned}, 总删除=${result.totalDeleted}, 总失败=${result.totalFailed}, 耗时=${result.durationMs}ms`);

  } catch (error: any) {
    logger.error('[StorageCleanup] 清理任务失败:', error.message);
    result.errors.push(`任务失败: ${error.message}`);
    result.durationMs = Date.now() - startTime;
  }

  return result;
}

/**
 * 获取存储清理预览（不实际删除，只统计）
 */
export async function previewStorageCleanup(): Promise<{
  byTable: Record<string, { count: number; totalSize?: number }>;
  totalExpired: number;
}> {
  const now = new Date();
  const preview: {
    byTable: Record<string, { count: number; totalSize?: number }>;
    totalExpired: number;
  } = {
    byTable: {},
    totalExpired: 0,
  };

  // 统计 GenerationTask
  const expiredTaskCount = await prisma.generationTask.count({
    where: { storageExpiresAt: { not: null, lt: now } },
  });
  preview.byTable['GenerationTask'] = { count: expiredTaskCount };
  preview.totalExpired += expiredTaskCount;

  // 统计 Asset
  const expiredAssetCount = await prisma.asset.count({
    where: { storageExpiresAt: { not: null, lt: now } },
  });
  preview.byTable['Asset'] = { count: expiredAssetCount };
  preview.totalExpired += expiredAssetCount;

  // 统计 Node
  const expiredNodeCount = await prisma.node.count({
    where: { storageExpiresAt: { not: null, lt: now } },
  });
  preview.byTable['Node'] = { count: expiredNodeCount };
  preview.totalExpired += expiredNodeCount;

  return preview;
}

export default {
  runStorageCleanup,
  previewStorageCleanup,
};
