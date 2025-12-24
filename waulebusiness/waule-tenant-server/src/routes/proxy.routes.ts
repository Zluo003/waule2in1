/**
 * 代理路由 - 统一网关
 * 将所有 API 请求转发到 waule-server 平台
 * 
 * waule-client -> waule-tenant-server (网关) -> waule-server (云端)
 */
import { Router, Request, Response } from 'express';
import axios, { AxiosRequestConfig, Method } from 'axios';
import path from 'path';
import fs from 'fs';
import { getAppConfig } from '../services/database.service';
import { uploadFileToPlatformOss } from '../services/oss.service';
import logger from '../utils/logger';

const router = Router();

/**
 * 检查是否为本地/局域网 URL
 */
function isLocalUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    // 检查是否为局域网 IP 或 localhost
    return hostname === 'localhost' ||
           hostname === '127.0.0.1' ||
           /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(hostname);
  } catch {
    return false;
  }
}

/**
 * 将本地 URL 转换为 OSS URL
 * 从本地文件系统读取文件并上传到平台 OSS
 */
async function convertLocalUrlToOss(localUrl: string): Promise<string> {
  if (!isLocalUrl(localUrl)) {
    return localUrl; // 不是本地 URL，直接返回
  }
  
  try {
    const parsed = new URL(localUrl);
    // 提取文件路径: /files/uploads/default/... -> uploads/default/...
    const urlPath = parsed.pathname.replace(/^\/files\//, '');
    const config = getAppConfig();
    const fullPath = path.join(config.storagePath, urlPath);
    
    logger.info(`[Proxy] 检测到本地URL: ${localUrl}`);
    logger.info(`[Proxy] 本地文件路径: ${fullPath}`);
    
    if (!fs.existsSync(fullPath)) {
      logger.warn(`[Proxy] 本地文件不存在: ${fullPath}`);
      return localUrl; // 文件不存在，返回原 URL
    }
    
    // 上传到平台 OSS
    const result = await uploadFileToPlatformOss(fullPath);
    if (result.success && result.ossUrl) {
      logger.info(`[Proxy] 本地文件已上传到OSS: ${result.ossUrl}`);
      return result.ossUrl;
    } else {
      logger.error(`[Proxy] 上传OSS失败: ${result.error}`);
      return localUrl;
    }
  } catch (error: any) {
    logger.error(`[Proxy] 转换本地URL失败: ${error.message}`);
    return localUrl;
  }
}

/**
 * 处理任务提交请求，将本地 URL 转换为 OSS URL
 */
async function processTaskBody(body: any): Promise<any> {
  if (!body || typeof body !== 'object') return body;
  
  const processed = { ...body };
  
  // 处理 referenceImages 数组
  if (Array.isArray(processed.referenceImages)) {
    processed.referenceImages = await Promise.all(
      processed.referenceImages.map((url: string) => convertLocalUrlToOss(url))
    );
  }
  
  // 处理 metadata 中的 URL
  if (processed.metadata && typeof processed.metadata === 'object') {
    const meta = { ...processed.metadata };
    if (meta.videoUrl) {
      meta.videoUrl = await convertLocalUrlToOss(meta.videoUrl);
    }
    if (meta.audioUrl) {
      meta.audioUrl = await convertLocalUrlToOss(meta.audioUrl);
    }
    if (meta.imageUrl) {
      meta.imageUrl = await convertLocalUrlToOss(meta.imageUrl);
    }
    processed.metadata = meta;
  }
  
  return processed;
}

/**
 * 判断是否为需要处理本地URL的任务提交请求
 */
function isTaskSubmitRequest(method: string, url: string): boolean {
  if (method !== 'POST') return false;
  // 匹配任务提交相关的路由
  return /\/tenant\/tasks\/(video-edit|video|image|storyboard)/.test(url);
}

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
    
    // 处理请求体：对任务提交请求，将本地URL转换为OSS URL
    let requestBody = req.body;
    if (isTaskSubmitRequest(req.method, req.originalUrl) && req.body) {
      logger.info(`[Proxy] 检测到任务提交请求，处理本地URL...`);
      requestBody = await processTaskBody(req.body);
      logger.info(`[Proxy] 处理后的请求体: ${JSON.stringify(requestBody).substring(0, 500)}`);
    }
    
    const axiosConfig: AxiosRequestConfig = {
      method: req.method as Method,
      url: targetUrl, // URL 已包含查询参数 (req.originalUrl)
      headers,
      timeout: 600000, // 10分钟超时（AI 任务可能很慢）
      // 对于非 GET 请求，转发 body
      ...(req.method !== 'GET' && req.method !== 'HEAD' && { data: requestBody }),
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
