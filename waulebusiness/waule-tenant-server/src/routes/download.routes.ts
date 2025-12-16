/**
 * 下载路由
 * 处理从 OSS 下载 AI 生成结果到本地
 */
import { Router, Request, Response } from 'express';
import axios from 'axios';
import { storageService } from '../services/storage.service';
import { getAppConfig } from '../services/database.service';
import { getLocalIP } from '../config';
import logger from '../utils/logger';

const router = Router();

/**
 * 从 OSS 下载 AI 生成结果到本地
 * POST /api/download-result
 */
router.post('/result', async (req: Request, res: Response) => {
  try {
    const { taskId, ossUrl, type = 'IMAGE', userId = 'default' } = req.body;
    const config = getAppConfig();
    
    if (!ossUrl) {
      return res.status(400).json({ error: '缺少 ossUrl 参数' });
    }
    
    // 下载并保存
    const result = await storageService.downloadAndSave(
      ossUrl,
      userId,
      taskId,
      type as 'IMAGE' | 'VIDEO' | 'AUDIO'
    );
    
    if (result.success && result.localPath) {
      // 生成本地访问 URL
      const localIP = getLocalIP();
      const localUrl = `http://${localIP}:${config.port}/files/${result.localPath}`;
      
      res.json({
        success: true,
        localPath: result.localPath,
        localUrl,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || '下载失败',
      });
    }
  } catch (error: any) {
    logger.error(`下载结果失败: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 批量下载多个文件
 * POST /api/download-batch
 */
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const { files, userId = 'default' } = req.body;
    const config = getAppConfig();
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: '缺少 files 参数' });
    }
    
    const results = [];
    
    for (const file of files) {
      const { taskId, ossUrl, type = 'IMAGE' } = file;
      
      const result = await storageService.downloadAndSave(
        ossUrl,
        userId,
        taskId,
        type as 'IMAGE' | 'VIDEO' | 'AUDIO'
      );
      
      if (result.success && result.localPath) {
        const localIP = getLocalIP();
        const localUrl = `http://${localIP}:${config.port}/files/${result.localPath}`;
        
        results.push({
          taskId,
          success: true,
          localPath: result.localPath,
          localUrl,
        });
      } else {
        results.push({
          taskId,
          success: false,
          error: result.error,
        });
      }
    }
    
    res.json({
      success: true,
      results,
    });
  } catch (error: any) {
    logger.error(`批量下载失败: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 通知平台 OSS 文件已下载完成（请求删除）
 * POST /api/confirm-download
 */
router.post('/confirm', async (req: Request, res: Response) => {
  try {
    const { taskId, localUrl, ossUrl } = req.body;
    const config = getAppConfig();
    
    logger.info(`[确认删除] 收到请求: taskId=${taskId}, localUrl=${localUrl?.substring(0, 50)}, ossUrl=${ossUrl?.substring(0, 50)}`);
    
    if (!taskId) {
      return res.status(400).json({ error: '缺少 taskId 参数' });
    }
    
    // 调用平台接口确认下载完成
    if (config.platformServerUrl && config.tenantApiKey) {
      const url = `${config.platformServerUrl}/api/tenant/tasks/${taskId}/confirm-local-download`;
      logger.info(`[确认删除] 调用平台API: ${url}`);
      logger.info(`[确认删除] API Key: ${config.tenantApiKey.substring(0, 15)}...`);
      
      try {
        const response = await axios.post(
          url,
          { localUrl, ossUrl }, // 传递本地 URL 和原始 OSS URL（用于 Midjourney 等非 TenantTask 的任务）
          {
            headers: {
              'X-Tenant-API-Key': config.tenantApiKey, // 使用自定义头
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          }
        );
        
        logger.info(`[确认删除] 平台响应: ${JSON.stringify(response.data)}`);
        logger.info(`[确认删除] ✅ OSS 文件删除成功: taskId=${taskId}`);
        
        res.json({ success: true, message: 'OSS 文件已删除' });
      } catch (platformError: any) {
        const errorMsg = platformError.response?.data?.message || platformError.message;
        const status = platformError.response?.status;
        logger.error(`[确认删除] ❌ 通知平台失败: status=${status}, error=${errorMsg}`);
        // 即使通知失败，本地文件已保存，可以稍后重试
        res.json({ 
          success: true, 
          warning: `通知平台失败(${status}): ${errorMsg}，OSS 文件将在过期后自动删除` 
        });
      }
    } else {
      logger.warn(`[确认删除] ⚠️ 未配置平台地址或API Key，跳过通知`);
      res.json({ 
        success: true, 
        warning: '未配置平台地址，跳过通知' 
      });
    }
  } catch (error: any) {
    logger.error(`[确认删除] ❌ 处理失败: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

export default router;
