/**
 * 本地存储服务
 * 管理文件的上传、下载和存储
 */
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { getDatePath, ensureDir } from '../config';
import { getAppConfig } from './database.service';
import logger from '../utils/logger';

export interface SavedFile {
  localPath: string;      // 相对于存储根目录的路径
  absolutePath: string;   // 绝对路径
  filename: string;
  size: number;
  mimeType?: string;
}

export interface DownloadResult {
  success: boolean;
  localPath?: string;
  absolutePath?: string;
  error?: string;
}

class StorageService {
  /**
   * 获取存储根路径（每次动态获取，支持配置更新）
   */
  getStoragePath(): string {
    const config = getAppConfig();
    const storagePath = path.resolve(config.storagePath);
    ensureDir(storagePath);
    return storagePath;
  }
  
  /**
   * 保存上传的文件
   */
  async saveUploadedFile(
    tempPath: string, 
    originalName: string, 
    userId: string = 'default',
    subDir: string = 'uploads'
  ): Promise<SavedFile> {
    const ext = path.extname(originalName) || '';
    const datePath = getDatePath();
    const destDir = path.join(this.getStoragePath(), subDir, userId, datePath);
    ensureDir(destDir);
    
    // 生成唯一文件名
    const uniqueName = `${Date.now()}_${uuidv4().slice(0, 8)}${ext}`;
    const destPath = path.join(destDir, uniqueName);
    
    // 移动文件
    fs.renameSync(tempPath, destPath);
    
    const stats = fs.statSync(destPath);
    const relativePath = path.relative(this.getStoragePath(), destPath);
    
    logger.info(`文件已保存: ${relativePath}, 大小: ${(stats.size / 1024).toFixed(1)} KB`);
    
    return {
      localPath: relativePath.replace(/\\/g, '/'),
      absolutePath: destPath,
      filename: uniqueName,
      size: stats.size,
    };
  }
  
  /**
   * 从 URL 下载文件并保存到本地
   */
  async downloadAndSave(
    url: string,
    userId: string = 'default',
    taskId?: string,
    fileType: 'IMAGE' | 'VIDEO' | 'AUDIO' = 'IMAGE'
  ): Promise<DownloadResult> {
    try {
      logger.info(`开始下载: ${url.substring(0, 80)}...`);
      const startTime = Date.now();
      
      // 确定扩展名
      let ext = path.extname(new URL(url).pathname) || '';
      if (!ext) {
        // 根据类型推断扩展名
        switch (fileType) {
          case 'VIDEO': ext = '.mp4'; break;
          case 'AUDIO': ext = '.mp3'; break;
          default: ext = '.png';
        }
      }
      
      // 下载文件
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 600000, // 10分钟超时
        maxContentLength: 500 * 1024 * 1024, // 最大 500MB
      });
      
      const downloadTime = ((Date.now() - startTime) / 1000).toFixed(1);
      const sizeKB = (response.data.length / 1024).toFixed(1);
      logger.info(`下载完成，耗时 ${downloadTime}s，大小: ${sizeKB} KB`);
      
      // 保存到本地
      const datePath = getDatePath();
      const destDir = path.join(this.getStoragePath(), 'results', userId, datePath);
      ensureDir(destDir);
      
      const prefix = fileType.toLowerCase();
      const uniqueName = taskId 
        ? `${prefix}_${taskId}${ext}`
        : `${prefix}_${Date.now()}_${uuidv4().slice(0, 8)}${ext}`;
      const destPath = path.join(destDir, uniqueName);
      
      fs.writeFileSync(destPath, Buffer.from(response.data));
      
      const relativePath = path.relative(this.getStoragePath(), destPath);
      logger.info(`文件已保存: ${relativePath}`);
      
      return {
        success: true,
        localPath: relativePath.replace(/\\/g, '/'),
        absolutePath: destPath,
      };
    } catch (error: any) {
      logger.error(`下载失败: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }
  
  /**
   * 读取本地文件
   */
  readFile(relativePath: string): Buffer | null {
    const absolutePath = path.join(this.getStoragePath(), relativePath);
    if (fs.existsSync(absolutePath)) {
      return fs.readFileSync(absolutePath);
    }
    return null;
  }
  
  /**
   * 删除本地文件
   */
  deleteFile(relativePath: string): boolean {
    try {
      const absolutePath = path.join(this.getStoragePath(), relativePath);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
        logger.info(`文件已删除: ${relativePath}`);
        return true;
      }
      return false;
    } catch (error: any) {
      logger.error(`删除文件失败: ${error.message}`);
      return false;
    }
  }
  
  /**
   * 获取文件列表
   */
  listFiles(subPath: string = ''): Array<{
    name: string;
    path: string;
    size: number;
    isDirectory: boolean;
    createdAt: Date;
  }> {
    const targetDir = path.join(this.getStoragePath(), subPath);
    if (!fs.existsSync(targetDir)) {
      return [];
    }
    
    const items = fs.readdirSync(targetDir);
    return items.map(name => {
      const fullPath = path.join(targetDir, name);
      const stats = fs.statSync(fullPath);
      const relativePath = path.relative(this.getStoragePath(), fullPath);
      
      return {
        name,
        path: relativePath.replace(/\\/g, '/'),
        size: stats.size,
        isDirectory: stats.isDirectory(),
        createdAt: stats.birthtime,
      };
    });
  }
  
  /**
   * 获取存储统计信息
   */
  getStorageStats(): {
    totalFiles: number;
    totalSize: number;
    uploadsSize: number;
    resultsSize: number;
  } {
    const getDirSize = (dirPath: string): { count: number; size: number } => {
      let totalSize = 0;
      let fileCount = 0;
      
      const scanDir = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stats = fs.statSync(fullPath);
          
          if (stats.isDirectory()) {
            scanDir(fullPath);
          } else {
            totalSize += stats.size;
            fileCount++;
          }
        }
      };
      
      scanDir(dirPath);
      return { count: fileCount, size: totalSize };
    };
    
    const uploadsStats = getDirSize(path.join(this.getStoragePath(), 'uploads'));
    const resultsStats = getDirSize(path.join(this.getStoragePath(), 'results'));
    
    return {
      totalFiles: uploadsStats.count + resultsStats.count,
      totalSize: uploadsStats.size + resultsStats.size,
      uploadsSize: uploadsStats.size,
      resultsSize: resultsStats.size,
    };
  }
}

export const storageService = new StorageService();

