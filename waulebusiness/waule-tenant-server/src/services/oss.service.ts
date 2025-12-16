/**
 * 平台 OSS 服务
 * 通过平台 API 上传临时文件（不需要租户自己配置 OSS）
 */
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { getAppConfig } from './database.service';
import logger from '../utils/logger';

export interface UploadResult {
  success: boolean;
  ossUrl?: string;
  error?: string;
}

/**
 * 通过平台 API 获取预签名上传 URL，然后上传文件
 */
export async function uploadFileToPlatformOss(filePath: string): Promise<UploadResult> {
  const config = getAppConfig();
  
  if (!config.platformServerUrl || !config.tenantApiKey) {
    return { success: false, error: '未配置平台连接信息' };
  }

  try {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
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
    const contentType = mimeMap[ext] || 'application/octet-stream';

    const apiUrl = `${config.platformServerUrl}/api/tenant/assets/presigned-url`;
    logger.info(`[OSS] 请求平台预签名 URL: ${ext}`);
    logger.info(`[OSS] 平台API地址: ${apiUrl}`);
    logger.info(`[OSS] API Key: ${config.tenantApiKey?.substring(0, 10)}...`);

    // 1. 从平台获取预签名上传 URL
    const presignedResponse = await axios.post(
      apiUrl,
      { ext, contentType },
      {
        headers: {
          'Authorization': `Bearer ${config.tenantApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const { uploadUrl, publicUrl } = presignedResponse.data.data || presignedResponse.data;

    if (!uploadUrl || !publicUrl) {
      throw new Error('获取预签名 URL 失败');
    }

    logger.info(`[OSS] 获取到预签名 URL，开始上传...`);

    // 2. 读取文件并上传
    const fileBuffer = fs.readFileSync(filePath);
    
    await axios.put(uploadUrl, fileBuffer, {
      headers: {
        'Content-Type': contentType,
      },
      timeout: 600000, // 10分钟超时
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    logger.info(`[OSS] 上传成功: ${publicUrl}`);

    return {
      success: true,
      ossUrl: publicUrl,
    };
  } catch (error: any) {
    const message = error.response?.data?.message || error.message;
    logger.error(`[OSS] 上传失败: ${message}`);
    return { success: false, error: message };
  }
}

/**
 * 将 Buffer 上传到平台 OSS
 */
export async function uploadBufferToPlatformOss(buffer: Buffer, ext: string = '.png'): Promise<UploadResult> {
  const config = getAppConfig();
  
  if (!config.platformServerUrl || !config.tenantApiKey) {
    return { success: false, error: '未配置平台连接信息' };
  }

  try {
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
    };
    const contentType = mimeMap[ext.toLowerCase()] || 'application/octet-stream';

    logger.info(`[OSS] 请求平台预签名 URL (Buffer): ${ext}, ${(buffer.length / 1024).toFixed(1)} KB`);

    // 1. 从平台获取预签名上传 URL
    const presignedResponse = await axios.post(
      `${config.platformServerUrl}/api/tenant/assets/presigned-url`,
      { ext, contentType },
      {
        headers: {
          'Authorization': `Bearer ${config.tenantApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const { uploadUrl, publicUrl } = presignedResponse.data.data || presignedResponse.data;

    if (!uploadUrl || !publicUrl) {
      throw new Error('获取预签名 URL 失败');
    }

    // 2. 上传 Buffer
    await axios.put(uploadUrl, buffer, {
      headers: {
        'Content-Type': contentType,
      },
      timeout: 600000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    logger.info(`[OSS] Buffer 上传成功: ${publicUrl}`);

    return {
      success: true,
      ossUrl: publicUrl,
    };
  } catch (error: any) {
    const message = error.response?.data?.message || error.message;
    logger.error(`[OSS] Buffer 上传失败: ${message}`);
    return { success: false, error: message };
  }
}

/**
 * 将 Base64 数据上传到平台 OSS
 */
export async function uploadBase64ToPlatformOss(base64Data: string): Promise<UploadResult> {
  try {
    // 解析 Base64
    const matches = base64Data.match(/^data:(\w+)\/(\w+);base64,(.+)$/);
    if (!matches) {
      return { success: false, error: '无效的 Base64 格式' };
    }

    const [, , subtype, data] = matches;
    const buffer = Buffer.from(data, 'base64');
    const ext = subtype === 'jpeg' ? '.jpg' : `.${subtype}`;

    return await uploadBufferToPlatformOss(buffer, ext);
  } catch (error: any) {
    logger.error(`[OSS] Base64 上传失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// 导出兼容的函数名
export const tempOssService = {
  uploadFile: uploadFileToPlatformOss,
  uploadBuffer: uploadBufferToPlatformOss,
  uploadBase64: uploadBase64ToPlatformOss,
};
