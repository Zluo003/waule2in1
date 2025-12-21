/**
 * Waule 企业版服务端
 * 
 * 功能：
 * 1. 接收用户上传的文件并保存到本地
 * 2. 从 OSS 下载 AI 生成结果到本地
 * 3. 将本地文件临时上传到平台 OSS（用于 AI 处理）
 * 4. 提供静态文件服务
 * 5. 提供 Web 管理界面
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os';
import axios from 'axios';
import { getAppConfig, isAppConfigured } from './services/database.service';
import { getDeviceId } from './utils/deviceId';
import logger from './utils/logger';

// 路由
import uploadRoutes from './routes/upload.routes';
import downloadRoutes from './routes/download.routes';
import filesRoutes from './routes/files.routes';
import adminRoutes from './routes/admin.routes';
import clientConfigRoutes from './routes/client-config.routes';
import proxyRoutes from './routes/proxy.routes';

// 获取本机 IP
function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// 启动服务器
startServer();

// 启动 Express 服务器
function startServer() {
  const app = express();
  const appConfig = getAppConfig();
  const localIP = getLocalIP();
  const port = appConfig.port;

  // 中间件
  app.use(cors({
    origin: '*',
    credentials: true,
  }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // 确保存储目录存在
  const storagePath = path.resolve(appConfig.storagePath);
  console.log('[Server] 配置的存储路径:', appConfig.storagePath);
  console.log('[Server] 解析后的存储路径:', storagePath);
  
  const ensureDir = (dir: string) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  };
  ensureDir(storagePath);
  ensureDir(path.join(storagePath, 'uploads'));
  ensureDir(path.join(storagePath, 'results'));
  ensureDir(path.join(storagePath, 'temp'));

  // 静态文件服务 - 动态获取存储路径（支持配置热更新）
  app.use('/files', (req, res, next) => {
    // 每次请求都重新获取配置，确保使用最新的存储路径
    const currentConfig = getAppConfig();
    const currentStoragePath = path.resolve(currentConfig.storagePath);
    const requestedFile = path.join(currentStoragePath, req.path);
    
    // 检查文件是否存在
    if (fs.existsSync(requestedFile)) {
      const ext = path.extname(requestedFile).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.webm': 'video/webm',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
      };
      if (mimeTypes[ext]) {
        res.setHeader('Content-Type', mimeTypes[ext]);
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.sendFile(requestedFile);
    } else {
      res.status(404).send('File not found');
    }
  });

  // 管理页面
  app.use('/admin', adminRoutes);

  // API 路由（本地处理）
  app.use('/api/upload', uploadRoutes);
  app.use('/api/download', downloadRoutes);
  app.use('/api/files', filesRoutes);
  app.use('/api/client-config', clientConfigRoutes);

  // 代理路由（转发到平台服务器）
  // 所有其他 /api/* 请求都转发到 waule-server
  app.use('/api', proxyRoutes);

  // 健康检查
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'waule-tenant-server',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      configured: isAppConfigured(),
    });
  });

  // 根路径重定向到管理页面
  app.get('/', (req, res) => {
    res.redirect('/admin');
  });

  // 错误处理
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error(`请求错误: ${err.message}`);
    res.status(500).json({ error: err.message || '服务器内部错误' });
  });

  // 启动服务
  app.listen(port, '0.0.0.0', () => {
    console.log(`[Server] 服务已启动 - http://${localIP}:${port}`);
    
    // 启动心跳上报（每30秒一次）
    startHeartbeat();
  });
}

// 心跳上报
let heartbeatInterval: NodeJS.Timeout | null = null;

function startHeartbeat() {
  // 清除已有的心跳定时器
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  
  const sendHeartbeat = async () => {
    const config = getAppConfig();
    
    // 只有配置完成后才发送心跳
    if (!config.isConfigured || !config.platformServerUrl || !config.tenantApiKey) {
      return;
    }
    
    try {
      await axios.post(
        `${config.platformServerUrl}/api/client/heartbeat`,
        { version: '1.0.0' },
        {
          headers: {
            'X-Tenant-API-Key': config.tenantApiKey,
            'X-Device-Id': getDeviceId(),
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );
      console.log('[Heartbeat] ✓ 心跳发送成功');
    } catch (error: any) {
      // 心跳失败，记录日志但不中断服务
      if (error.response?.status === 401) {
        console.log('[Heartbeat] ✗ API Key 验证失败，可能已被重设');
      } else if (error.response?.status === 404) {
        console.log('[Heartbeat] ✗ 心跳接口不存在，请确认 waule-server 已重启');
      } else {
        console.log('[Heartbeat] ✗ 心跳发送失败:', error.message || '未知错误');
      }
    }
  };
  
  // 立即发送一次心跳
  sendHeartbeat();
  
  // 每30秒发送一次心跳
  heartbeatInterval = setInterval(sendHeartbeat, 30 * 1000);
  
  console.log('[Heartbeat] 心跳服务已启动（间隔30秒）');
}
