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
import { getAppConfig, isAppConfigured } from './services/database.service';
import logger from './utils/logger';

// 路由
import uploadRoutes from './routes/upload.routes';
import downloadRoutes from './routes/download.routes';
import filesRoutes from './routes/files.routes';
import adminRoutes from './routes/admin.routes';
import clientConfigRoutes from './routes/client-config.routes';

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

  // API 路由
  app.use('/api/upload', uploadRoutes);
  app.use('/api/download', downloadRoutes);
  app.use('/api/files', filesRoutes);
  app.use('/api/client-config', clientConfigRoutes);

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
  });
}
