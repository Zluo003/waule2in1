/**
 * 代理路由 - 统一网关
 * 将所有 API 请求转发到 waule-server 平台
 * 
 * waule-client -> waule-tenant-server (网关) -> waule-server (云端)
 */
import { Router, Request, Response } from 'express';
import axios, { AxiosRequestConfig, Method } from 'axios';
import { getAppConfig } from '../services/database.service';
import logger from '../utils/logger';

const router = Router();

/**
 * 通用代理中间件
 * 转发所有请求到 waule-server
 */
async function proxyRequest(req: Request, res: Response) {
  const config = getAppConfig();
  
  logger.info(`[Proxy] 收到请求: ${req.method} ${req.originalUrl}`);
  logger.info(`[Proxy] platformServerUrl: ${config.platformServerUrl || '(未配置)'}`);
  
  if (!config.platformServerUrl) {
    return res.status(503).json({
      success: false,
      message: '企业服务端未配置平台地址，请先在管理页面完成配置',
    });
  }
  
  // 构建目标 URL（直接转发，不修改路径）
  // waulebusiness/waule-server 有完整的 /api/tenant/* 路由，无需转换
  const targetUrl = `${config.platformServerUrl}${req.originalUrl}`;
  
  try {
    // 复制请求头，但移除 host 相关
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (
        key.toLowerCase() !== 'host' &&
        key.toLowerCase() !== 'connection' &&
        key.toLowerCase() !== 'content-length' &&
        typeof value === 'string'
      ) {
        headers[key] = value;
      }
    }
    
    // 如果有企业 API Key，自动添加到请求头（用于某些需要的接口）
    if (config.tenantApiKey && !headers['x-tenant-api-key']) {
      headers['X-Tenant-API-Key'] = config.tenantApiKey;
    }
    
    const axiosConfig: AxiosRequestConfig = {
      method: req.method as Method,
      url: targetUrl, // URL 已包含查询参数 (req.originalUrl)
      headers,
      timeout: 600000, // 10分钟超时（AI 任务可能很慢）
      // 对于非 GET 请求，转发 body
      ...(req.method !== 'GET' && req.method !== 'HEAD' && { data: req.body }),
      validateStatus: () => true, // 不抛出 HTTP 错误，让我们处理
    };
    
    logger.info(`[Proxy] ${req.method} ${req.originalUrl} -> ${targetUrl}`);
    
    const response = await axios(axiosConfig);
    
    logger.info(`[Proxy] 响应状态: ${response.status}, 数据长度: ${JSON.stringify(response.data).length}`);
    logger.info(`[Proxy] 响应数据: ${JSON.stringify(response.data).substring(0, 500)}`);
    
    // 复制响应头
    for (const [key, value] of Object.entries(response.headers)) {
      if (
        key.toLowerCase() !== 'transfer-encoding' &&
        key.toLowerCase() !== 'connection' &&
        value
      ) {
        res.setHeader(key, value as string);
      }
    }
    
    // 返回响应
    res.status(response.status).send(response.data);
    
  } catch (error: any) {
    logger.error(`[Proxy] 请求失败: ${error.message}`);
    logger.error(`[Proxy] 错误详情: code=${error.code}, status=${error.response?.status}`);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        message: '无法连接到平台服务器，请检查网络或平台地址配置',
      });
    }
    
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return res.status(504).json({
        success: false,
        message: '请求超时，请稍后重试',
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || '代理请求失败',
    });
  }
}

// 代理所有 /api/* 请求（排除本地处理的路由）
// 本地路由: /api/upload, /api/download, /api/files, /api/client-config
router.all('/*', proxyRequest);

export default router;
