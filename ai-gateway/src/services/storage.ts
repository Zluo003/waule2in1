import OSS from 'ali-oss';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { getStorageConfig } from '../config';
import { downloadBuffer } from '../utils/http';
import { getActiveApiKey, Channel } from '../database';

let ossClient: OSS | null = null;

function getOssClient(): OSS | null {
  const config = getStorageConfig();
  if (!config.oss?.bucket) return null;

  if (!ossClient) {
    ossClient = new OSS({
      bucket: config.oss.bucket,
      region: config.oss.region,
      accessKeyId: config.oss.accessKeyId,
      accessKeySecret: config.oss.accessKeySecret,
      endpoint: config.oss.endpoint || undefined,
    });
  }
  return ossClient;
}

export function resetOssClient() {
  ossClient = null;
}

export async function uploadBuffer(buffer: Buffer, ext: string): Promise<string> {
  const config = getStorageConfig();
  const filename = `${uuidv4()}${ext}`;

  // 尝试 OSS 上传
  if (config.oss?.bucket) {
    const client = getOssClient();
    if (client) {
      const objectName = `ai-gateway/${new Date().toISOString().slice(0, 10)}/${filename}`;
      await client.put(objectName, buffer);

      if (config.oss.cdnUrl) {
        const cdnUrl = config.oss.cdnUrl.startsWith('http') ? config.oss.cdnUrl : `https://${config.oss.cdnUrl}`;
        return `${cdnUrl}/${objectName}`;
      }
      return `https://${config.oss.bucket}.${config.oss.region}.aliyuncs.com/${objectName}`;
    }
  }

  // 本地存储
  const localDir = path.join(__dirname, '../../data/uploads', new Date().toISOString().slice(0, 10));
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  const localPath = path.join(localDir, filename);
  fs.writeFileSync(localPath, buffer);

  return `/uploads/${new Date().toISOString().slice(0, 10)}/${filename}`;
}

/**
 * 根据供应商的 storage_type 上传 Buffer
 * @param storageTypeOverride 直接指定存储类型（优先级最高，用于渠道配置）
 */
export async function uploadBufferWithProvider(buffer: Buffer, ext: string, provider?: string, storageTypeOverride?: Channel['storage_type']): Promise<string> {
  let storageType: 'oss' | 'local' | 'forward' = 'oss';

  if (storageTypeOverride) {
    storageType = storageTypeOverride;
  } else if (provider) {
    const keyRecord = getActiveApiKey(provider);
    if (keyRecord?.storage_type) {
      storageType = keyRecord.storage_type as 'oss' | 'local' | 'forward';
    }
  }

  console.log(`[Storage] uploadBuffer provider=${provider}, storageType=${storageType}`);

  const config = getStorageConfig();
  const filename = `${uuidv4()}${ext}`;

  // OSS 模式
  if (storageType === 'oss' && config.oss?.bucket) {
    const client = getOssClient();
    if (client) {
      const objectName = `ai-gateway/${new Date().toISOString().slice(0, 10)}/${filename}`;
      await client.put(objectName, buffer);

      if (config.oss.cdnUrl) {
        const cdnUrl = config.oss.cdnUrl.startsWith('http') ? config.oss.cdnUrl : `https://${config.oss.cdnUrl}`;
        return `${cdnUrl}/${objectName}`;
      }
      return `https://${config.oss.bucket}.${config.oss.region}.aliyuncs.com/${objectName}`;
    }
  }

  // 本地存储
  const localDir = path.join(__dirname, '../../data/uploads', new Date().toISOString().slice(0, 10));
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  const localPath = path.join(localDir, filename);
  fs.writeFileSync(localPath, buffer);

  // 返回完整的 HTTP URL
  const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  return `${baseUrl}/uploads/${new Date().toISOString().slice(0, 10)}/${filename}`;
}

/**
 * 根据供应商的 storage_type 决定如何处理 URL
 * @param url 原始 URL
 * @param ext 文件扩展名
 * @param provider 供应商名称（用于获取 storage_type）
 * @param storageTypeOverride 直接指定存储类型（优先级最高，用于渠道配置）
 */
export async function downloadAndUpload(url: string, ext?: string, provider?: string, storageTypeOverride?: Channel['storage_type']): Promise<string> {
  // 获取供应商的存储配置
  let storageType: 'oss' | 'local' | 'forward' = 'forward';

  if (storageTypeOverride) {
    storageType = storageTypeOverride;
  } else if (provider) {
    const keyRecord = getActiveApiKey(provider);
    if (keyRecord?.storage_type) {
      storageType = keyRecord.storage_type as 'oss' | 'local' | 'forward';
    }
  }

  console.log(`[Storage] provider=${provider}, storageType=${storageType}`);

  // forward 模式直接返回原 URL
  if (storageType === 'forward') {
    console.log('[Storage] forward mode, returning original URL');
    return url;
  }

  // 下载文件
  const buffer = await downloadBuffer(url);
  const extension = ext || path.extname(new URL(url).pathname) || '.bin';

  // OSS 模式
  if (storageType === 'oss') {
    const config = getStorageConfig();
    if (config.oss?.bucket) {
      const client = getOssClient();
      if (client) {
        const filename = `${uuidv4()}${extension}`;
        const objectName = `ai-gateway/${new Date().toISOString().slice(0, 10)}/${filename}`;
        await client.put(objectName, buffer);

        if (config.oss.cdnUrl) {
          const cdnUrl = config.oss.cdnUrl.startsWith('http') ? config.oss.cdnUrl : `https://${config.oss.cdnUrl}`;
          return `${cdnUrl}/${objectName}`;
        }
        return `https://${config.oss.bucket}.${config.oss.region}.aliyuncs.com/${objectName}`;
      }
    }
    // OSS 配置不完整，回退到本地存储
    console.log('[Storage] OSS not configured, falling back to local');
  }

  // 本地存储
  return uploadBuffer(buffer, extension);
}
