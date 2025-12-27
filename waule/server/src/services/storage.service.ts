import { settingsService } from './settings.service';
import { uploadBuffer as ossUploadBuffer, uploadPath as ossUploadPath, ensureAliyunOssUrl } from '../utils/oss';
import { redis } from '../index';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { logger } from '../utils/logger';

export type StorageMode = 'oss' | 'local';

const STORAGE_MODE_CACHE_KEY = 'storage:mode';

class StorageService {
  private uploadDir = path.join(process.cwd(), 'uploads');

  /**
   * 获取当前存储模式（带 Redis 缓存）
   */
  async getStorageMode(): Promise<StorageMode> {
    try {
      // 1. 尝试从 Redis 读取
      const cached = await redis.get(STORAGE_MODE_CACHE_KEY);
      if (cached) {
        return cached as StorageMode;
      }

      // 2. 从数据库读取
      const mode = await settingsService.get('storage_mode');
      const result = (mode === 'local' ? 'local' : 'oss') as StorageMode;

      // 3. 写入 Redis 缓存
      await redis.set(STORAGE_MODE_CACHE_KEY, result);

      return result;
    } catch (error) {
      logger.error('获取存储模式失败，使用默认 OSS 模式', error);
      return 'oss';
    }
  }

  /**
   * 获取本地存储基础 URL
   */
  async getLocalBaseUrl(): Promise<string> {
    const baseUrl = await settingsService.get('storage_base_url');
    return baseUrl || process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
  }

  /**
   * 清除存储模式缓存
   */
  async clearStorageModeCache(): Promise<void> {
    await redis.del(STORAGE_MODE_CACHE_KEY);
  }

  /**
   * 上传 Buffer 到当前存储
   */
  async uploadBuffer(buffer: Buffer, ext: string): Promise<string> {
    const mode = await this.getStorageMode();

    if (mode === 'local') {
      return this.uploadBufferToLocal(buffer, ext);
    } else {
      return ossUploadBuffer(buffer, ext);
    }
  }

  /**
   * 上传文件路径到当前存储
   */
  async uploadPath(filePath: string): Promise<string> {
    const mode = await this.getStorageMode();

    if (mode === 'local') {
      const ext = path.extname(filePath);
      const buffer = fs.readFileSync(filePath);
      return this.uploadBufferToLocal(buffer, ext);
    } else {
      return ossUploadPath(filePath);
    }
  }

  /**
   * 上传 Buffer 到本地存储
   */
  private async uploadBufferToLocal(buffer: Buffer, ext: string): Promise<string> {
    // 确保上传目录存在
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }

    // 生成唯一文件名
    const fileName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    const filePath = path.join(this.uploadDir, fileName);

    // 写入文件
    fs.writeFileSync(filePath, buffer);

    // 返回公网 URL
    const baseUrl = await this.getLocalBaseUrl();
    return `${baseUrl}/uploads/${fileName}`;
  }

  /**
   * 判断 URL 是否为 OSS URL
   */
  isOssUrl(url: string): boolean {
    return url.includes('.aliyuncs.com/');
  }

  /**
   * 判断 URL 是否为本地 URL
   */
  isLocalUrl(url: string): boolean {
    return url.includes('/uploads/');
  }

  /**
   * 确保 URL 已转存到当前存储（根据存储模式）
   * 类似 ensureAliyunOssUrl，但会根据存储模式选择存储位置
   */
  async ensureStoredUrl(url?: string): Promise<string | undefined> {
    if (!url) return url;

    const mode = await this.getStorageMode();

    // 如果是 OSS 模式，使用原有的 ensureAliyunOssUrl 逻辑
    if (mode === 'oss') {
      return ensureAliyunOssUrl(url);
    }

    // 本地存储模式
    const trimmed = url.trim().replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, "");

    // 已经是本地 URL，直接返回
    if (this.isLocalUrl(trimmed)) {
      logger.info(`[Storage] 已是本地URL，跳过转存: ${trimmed.substring(0, 80)}...`);
      return trimmed;
    }

    // 如果是 OSS URL，也直接返回（本地模式下不需要转存）
    if (this.isOssUrl(trimmed)) {
      logger.info(`[Storage] OSS URL在本地模式下直接返回: ${trimmed.substring(0, 80)}...`);
      return trimmed;
    }

    // 纯路径：映射到本地并上传
    if (!trimmed.startsWith('http')) {
      const localRel = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
      const fullPath = path.join(process.cwd(), localRel);
      return await this.uploadPath(fullPath);
    }

    // HTTP 链接：下载并保存到本地
    try {
      const parsed = new URL(trimmed);
      const baseUrl = await this.getLocalBaseUrl();
      let publicHost = '';
      try {
        if (/^https?:\/\//.test(baseUrl)) {
          publicHost = new URL(baseUrl).hostname;
        }
      } catch { }

      const isInternal = parsed.hostname === 'localhost' ||
                        parsed.hostname === '127.0.0.1' ||
                        (publicHost && parsed.hostname === publicHost);

      if (!isInternal) {
        // 外部链接：下载并保存到本地
        const ext = path.extname(parsed.pathname) || '';
        const isVideo = /\.(mp4|mov|mkv|webm|avi)$/i.test(ext);

        logger.info(`[Storage] 开始下载外部资源到本地: ${trimmed.substring(0, 80)}... (isVideo=${isVideo})`);
        const startTime = Date.now();

        const response = await axios.get(trimmed, {
          responseType: 'arraybuffer',
          timeout: isVideo ? 180000 : 60000,
        });

        const buffer = Buffer.from(response.data);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info(`[Storage] 资源下载完成，耗时 ${duration}s`);

        logger.info(`[Storage] 开始保存到本地...`);
        const localUrl = await this.uploadBufferToLocal(buffer, ext);
        logger.info(`[Storage] 保存成功: ${localUrl}`);

        return localUrl;
      } else {
        // 内部链接，直接返回
        return trimmed;
      }
    } catch (error: any) {
      logger.error(`[Storage] 处理URL失败: ${trimmed}`, error.message);
      return trimmed; // 失败时返回原始URL
    }
  }
}

export const storageService = new StorageService();
