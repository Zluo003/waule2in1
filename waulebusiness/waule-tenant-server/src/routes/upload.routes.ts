/**
 * 上传路由
 * 处理用户上传的文件
 */
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { storageService } from '../services/storage.service';
import { getAppConfig } from '../services/database.service';
import { uploadFileToPlatformOss, uploadBase64ToPlatformOss } from '../services/oss.service';
import { getLocalIP, ensureDir } from '../config';
import logger from '../utils/logger';

const router = Router();

/**
 * 生成文件访问的基础 URL
 * 优先使用配置的外网地址，否则使用内网 IP
 */
function getBaseUrl(): string {
  const config = getAppConfig();
  if (config.serverHost && /^https?:\/\//.test(config.serverHost)) {
    return config.serverHost;
  }
  const localIP = getLocalIP();
  return `http://${config.serverHost || localIP}:${config.port}`;
}

// 获取临时目录（使用函数延迟初始化）
function getTempDir(): string {
  const config = getAppConfig();
  const tempDir = path.join(config.storagePath, 'temp');
  ensureDir(tempDir);
  return tempDir;
}

// 配置 multer（使用动态存储路径）
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, getTempDir());
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 最大 500MB
  },
});

/**
 * 根据 MIME 类型判断文件类型
 */
function getFileType(mimeType: string): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' {
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (mimeType.startsWith('audio/')) return 'AUDIO';
  return 'DOCUMENT';
}

/**
 * 上传文件到本地存储
 * POST /api/upload
 */
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: '未上传文件' });
    }
    
    const userId = req.body.userId || 'default';

    // 保存文件
    const savedFile = await storageService.saveUploadedFile(
      file.path,
      file.originalname,
      userId,
      'uploads'
    );

    // 生成访问 URL
    const localUrl = `${getBaseUrl()}/files/${savedFile.localPath}`;
    
    // 生成唯一 ID
    const fileId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    
    // 返回与前端期望格式一致的数据
    res.json({
      success: true,
      data: {
        id: fileId,
        name: savedFile.filename,
        originalName: file.originalname,
        type: getFileType(file.mimetype),
        mimeType: file.mimetype,
        url: localUrl,
        size: savedFile.size,
        localPath: savedFile.localPath,
      },
      // 兼容旧格式
      localPath: savedFile.localPath,
      localUrl,
      filename: savedFile.filename,
      size: savedFile.size,
    });
  } catch (error: any) {
    logger.error(`上传失败: ${error.message}`);
    
    // 清理临时文件
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: error.message });
  }
});

/**
 * 上传文件到平台 OSS（用于 AI 处理）
 * POST /api/upload/to-oss
 * 
 * 通过平台 API 上传，企业不需要配置自己的 OSS
 * 
 * 支持三种方式：
 * 1. FormData 上传文件: { file: File }
 * 2. JSON 上传 Base64: { base64: "data:image/png;base64,..." }
 * 3. JSON 上传本地路径: { localPath: "uploads/xxx/xxx.jpg" }
 */
router.post('/to-oss', upload.single('file'), async (req: Request, res: Response) => {
  try {
    let result;
    
    if (req.file) {
      // 方式1: 上传的文件
      result = await uploadFileToPlatformOss(req.file.path);
      // 清理临时文件
      fs.unlinkSync(req.file.path);
    } else if (req.body.base64) {
      // 方式2: Base64 数据
      result = await uploadBase64ToPlatformOss(req.body.base64);
    } else if (req.body.localPath) {
      // 方式3: 本地文件路径
      const storagePath = storageService.getStoragePath();
      const absolutePath = path.join(storagePath, req.body.localPath);
      logger.info(`[Upload] 存储根路径: ${storagePath}`);
      logger.info(`[Upload] 本地路径: ${req.body.localPath}`);
      logger.info(`[Upload] 绝对路径: ${absolutePath}`);
      logger.info(`[Upload] 文件存在: ${fs.existsSync(absolutePath)}`);
      result = await uploadFileToPlatformOss(absolutePath);
    } else {
      return res.status(400).json({ error: '缺少文件或路径参数' });
    }
    
    if (result.success) {
      res.json({
        success: true,
        ossUrl: result.ossUrl,
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    logger.error(`上传到 OSS 失败: ${error.message}`);
    
    // 清理临时文件
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: error.message });
  }
});

/**
 * 上传 Base64 图片到本地存储
 * POST /api/upload/base64
 * 
 * Body: { base64: "data:image/png;base64,...", userId: "xxx", filename?: "xxx.png" }
 */
router.post('/base64', async (req: Request, res: Response) => {
  try {
    const { base64, userId = 'default', filename } = req.body;
    
    if (!base64) {
      return res.status(400).json({ error: '缺少 base64 参数' });
    }
    
    const config = getAppConfig();
    
    // 解析 base64 数据
    const matches = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: '无效的 base64 格式' });
    }
    
    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    
    // 根据 MIME 类型确定扩展名
    const extMap: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
    };
    const ext = extMap[mimeType] || '.png';
    
    // 生成文件名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const finalFilename = filename || `slice_${uniqueSuffix}${ext}`;
    
    // 保存到临时文件
    const tempDir = getTempDir();
    const tempPath = path.join(tempDir, finalFilename);
    fs.writeFileSync(tempPath, buffer);
    
    // 使用 storageService 保存文件
    const savedFile = await storageService.saveUploadedFile(
      tempPath,
      finalFilename,
      userId,
      'slices' // 分割图片专用目录
    );

    // 生成访问 URL
    const localUrl = `${getBaseUrl()}/files/${savedFile.localPath}`;
    
    logger.info(`[Upload] Base64 图片已保存: ${localUrl}`);
    
    res.json({
      success: true,
      localPath: savedFile.localPath,
      localUrl,
      filename: savedFile.filename,
      size: savedFile.size,
    });
  } catch (error: any) {
    logger.error(`上传 Base64 失败: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

export default router;
