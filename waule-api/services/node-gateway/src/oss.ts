const OSS = require('ali-oss');
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { pipeline } from 'stream/promises';
import { getPlatformOSS } from './db';

/**
 * 租户上传信息
 */
export interface TenantUploadInfo {
  tenantId: string;
  userId: string;
}

/**
 * 生成租户 OSS 路径
 * 格式: ${tenantId}/${userId}/${year}/${month}/${timestamp}-${random}${ext}
 */
export function generateTenantObjectKey(tenantInfo: TenantUploadInfo, ext: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  return `${tenantInfo.tenantId}/${tenantInfo.userId}/${year}/${month}/${filename}`;
}

let ossClient: any = null;
let ossClientConfig: string = ''; // 用于检测配置是否变化

function getOssClient(): any {
  // 优先从数据库读取平台OSS配置
  const dbConfig = getPlatformOSS();
  
  let bucket: string | undefined;
  let region: string | undefined;
  let accessKeyId: string | undefined;
  let accessKeySecret: string | undefined;
  let customDomain: string | undefined;
  let useAccelerate = false;

  if (dbConfig && dbConfig.is_active && dbConfig.bucket && dbConfig.access_key_id && dbConfig.access_key_secret) {
    // 使用数据库配置
    bucket = dbConfig.bucket;
    region = dbConfig.region || 'oss-cn-beijing';
    accessKeyId = dbConfig.access_key_id;
    accessKeySecret = dbConfig.access_key_secret;
    customDomain = dbConfig.custom_domain || undefined;
    console.log(`🌐 [OSS] 使用数据库平台OSS配置`);
  } else {
    // 回退到环境变量
    bucket = process.env.OSS_BUCKET;
    region = process.env.OSS_REGION || 'oss-cn-beijing';
    accessKeyId = process.env.OSS_ACCESS_KEY_ID;
    accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
    useAccelerate = process.env.OSS_USE_ACCELERATE === 'true';
    console.log(`🌐 [OSS] 使用环境变量配置`);
  }

  if (!bucket || !accessKeyId || !accessKeySecret) {
    throw new Error('OSS configuration is incomplete. Please configure in admin panel or environment variables.');
  }

  // 检测配置是否变化，变化则重新创建客户端
  const configKey = `${bucket}:${region}:${accessKeyId}`;
  if (ossClient && ossClientConfig === configKey) {
    return ossClient;
  }

  const endpoint = useAccelerate
    ? 'oss-accelerate.aliyuncs.com'
    : `${region}.aliyuncs.com`;

  ossClient = new OSS({
    region,
    accessKeyId,
    accessKeySecret,
    bucket,
    endpoint,
    secure: true,
    timeout: 600000,
  });

  // 保存自定义域名供后续使用
  (ossClient as any)._customDomain = customDomain;
  (ossClient as any)._bucket = bucket;
  (ossClient as any)._region = region;
  
  ossClientConfig = configKey;
  console.log(`🌐 [OSS] 已初始化, Bucket: ${bucket}, Region: ${region}`);
  
  return ossClient;
}

/**
 * 上传 Buffer 到 OSS (用于 Gemini 图片)
 * @param buffer 文件内容
 * @param ext 文件扩展名
 * @param prefix 默认前缀（非租户模式使用）
 * @param tenantInfo 租户信息（可选），如果提供则使用租户目录结构
 */
export async function uploadBuffer(buffer: Buffer, ext: string, prefix: string = 'gemini', tenantInfo?: TenantUploadInfo): Promise<string> {
  const client = getOssClient();
  
  // 生成文件路径：租户模式使用 tenantId/userId/年/月/文件名
  let filename: string;
  if (tenantInfo) {
    filename = generateTenantObjectKey(tenantInfo, ext);
    console.log(`📤 [OSS] 上传到租户目录: ${filename}, 大小: ${(buffer.length / 1024).toFixed(1)} KB`);
  } else {
    const hash = crypto.randomBytes(8).toString('hex');
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
    filename = `${prefix}/${date}/${hash}${ext}`;
    console.log(`📤 [OSS] 上传文件: ${filename}, 大小: ${(buffer.length / 1024).toFixed(1)} KB`);
  }

  await client.put(filename, buffer);
  
  // 生成URL：优先使用自定义域名
  const customDomain = (client as any)._customDomain;
  const bucket = (client as any)._bucket;
  const region = (client as any)._region || 'oss-cn-beijing';
  
  let url: string;
  if (customDomain) {
    url = `${customDomain}/${filename}`;
  } else {
    url = `https://${bucket}.${region}.aliyuncs.com/${filename}`;
    url = url.replace('.oss-oss-', '.oss-');
  }
  
  console.log(`✅ [OSS] 上传成功: ${url}`);
  return url;
}

/**
 * 下载视频并上传到 OSS (用于 Sora 视频)
 * @param videoUrl 视频源URL
 * @param tenantInfo 租户信息（可选），如果提供则使用租户目录结构
 * @param defaultExt 默认扩展名（可选），当 URL 中没有扩展名时使用
 */
export async function downloadAndUploadToOss(videoUrl: string, tenantInfo?: TenantUploadInfo, defaultExt: string = '.mp4'): Promise<string> {
  const client = getOssClient();
  const ext = path.extname(new URL(videoUrl).pathname) || defaultExt;
  const objectKey = tenantInfo
    ? generateTenantObjectKey(tenantInfo, ext)
    : `aivider/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  
  console.log(`📥 [OSS] 开始下载视频: ${videoUrl}`);
  const startTime = Date.now();
  
  // 创建临时目录
  const tmpDir = '/tmp/sora-proxy';
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  const tmpFile = path.join(tmpDir, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  
  try {
    // 下载到临时文件
    const response = await axios.get(videoUrl, {
      responseType: 'stream',
      timeout: 300000,
    });
    
    const writeStream = fs.createWriteStream(tmpFile);
    await pipeline(response.data, writeStream);
    
    const downloadTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const fileSize = fs.statSync(tmpFile).size;
    console.log(`📥 [OSS] 下载完成: ${(fileSize / 1024 / 1024).toFixed(2)} MB, 耗时 ${downloadTime}s`);
    
    // 上传到 OSS
    console.log(`📤 [OSS] 开始上传: ${objectKey}`);
    const uploadStart = Date.now();
    
    await client.put(objectKey, tmpFile, {
      headers: {
        'x-oss-object-acl': 'public-read',
        'Content-Type': 'video/mp4',
      },
    });
    
    const uploadTime = ((Date.now() - uploadStart) / 1000).toFixed(1);
    console.log(`✅ [OSS] 上传完成, 耗时 ${uploadTime}s`);
    
    // 清理临时文件
    try { fs.unlinkSync(tmpFile); } catch {}
    
    // 生成URL：优先使用自定义域名
    const customDomain = (client as any)._customDomain;
    const bucket = (client as any)._bucket;
    const region = (client as any)._region || 'oss-cn-beijing';
    
    let publicUrl: string;
    if (customDomain) {
      publicUrl = `${customDomain}/${objectKey}`;
    } else {
      publicUrl = `https://${bucket}.${region}.aliyuncs.com/${objectKey}`;
      publicUrl = publicUrl.replace('.oss-oss-', '.oss-');
    }
    
    console.log(`🔗 [OSS] URL: ${publicUrl}`);
    return publicUrl;
  } catch (error: any) {
    // 清理临时文件
    try { fs.unlinkSync(tmpFile); } catch {}
    throw error;
  }
}
