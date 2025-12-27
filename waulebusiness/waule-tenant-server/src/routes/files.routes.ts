/**
 * 文件管理路由
 * 查看、列表、删除本地文件
 */
import { Router, Request, Response } from 'express';
import { storageService } from '../services/storage.service';
import { getAppConfig } from '../services/database.service';
import { getLocalIP } from '../config';
import logger from '../utils/logger';

const router = Router();

/**
 * 生成文件访问的基础 URL
 */
function getBaseUrl(): string {
  const config = getAppConfig();
  if (config.serverHost && /^https?:\/\//.test(config.serverHost)) {
    return config.serverHost;
  }
  const localIP = getLocalIP();
  return `http://${config.serverHost || localIP}:${config.port}`;
}

/**
 * 获取文件列表
 * GET /api/files/list?path=uploads/xxx
 */
router.get('/list', async (req: Request, res: Response) => {
  try {
    const subPath = (req.query.path as string) || '';
    const files = storageService.listFiles(subPath);

    // 添加完整 URL
    const baseUrl = getBaseUrl();
    const filesWithUrl = files.map(file => ({
      ...file,
      url: file.isDirectory ? undefined : `${baseUrl}/files/${file.path}`,
    }));

    res.json({
      success: true,
      path: subPath,
      files: filesWithUrl,
    });
  } catch (error: any) {
    logger.error(`获取文件列表失败: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取存储统计
 * GET /api/files/stats
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = storageService.getStorageStats();
    
    res.json({
      success: true,
      stats: {
        totalFiles: stats.totalFiles,
        totalSize: stats.totalSize,
        totalSizeFormatted: formatBytes(stats.totalSize),
        uploadsSize: stats.uploadsSize,
        uploadsSizeFormatted: formatBytes(stats.uploadsSize),
        resultsSize: stats.resultsSize,
        resultsSizeFormatted: formatBytes(stats.resultsSize),
      },
    });
  } catch (error: any) {
    logger.error(`获取存储统计失败: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 删除文件
 * DELETE /api/files/:path
 */
router.delete('/*', async (req: Request, res: Response) => {
  try {
    const filePath = req.params[0];
    
    if (!filePath) {
      return res.status(400).json({ error: '缺少文件路径' });
    }
    
    const success = storageService.deleteFile(filePath);
    
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: '文件不存在' });
    }
  } catch (error: any) {
    logger.error(`删除文件失败: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 格式化字节数
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default router;
