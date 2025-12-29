import fs from 'fs';
import path from 'path';
import axios from 'axios';
import OSS from 'ali-oss';
import crypto from 'crypto';
import logger from '../utils/logger';
import { pipeline } from 'stream/promises';
import { SocksProxyAgent } from 'socks-proxy-agent';

// OSS URL 正则匹配，用于提取 objectKey
// 支持: https://bucket.oss-cn-beijing.aliyuncs.com/path 和 https://bucket.oss-accelerate.aliyuncs.com/path
const OSS_URL_PATTERN = /https:\/\/([^.]+)\.([^.]+)\.aliyuncs\.com\/(.+)/;

/**
 * 将 OSS URL 转换为 CDN URL（用于返回给前端）
 */
export const toCdnUrl = (ossUrl: string): string => {
  const cdnDomain = process.env.OSS_CDN_DOMAIN;
  if (!cdnDomain || !ossUrl) return ossUrl;
  const match = ossUrl.match(OSS_URL_PATTERN);
  if (match && match[3]) {
    return `https://${cdnDomain}/${match[3]}`;
  }
  return ossUrl;
};

// SOCKS5 代理配置（用于下载外部资源）
let _proxyAgent: SocksProxyAgent | undefined;
function getProxyAgent(): SocksProxyAgent | undefined {
  if (_proxyAgent === undefined) {
    const proxyUrl = process.env.SOCKS_PROXY;
    if (proxyUrl) {
      _proxyAgent = new SocksProxyAgent(proxyUrl);
      logger.info(`[OSS] 使用 SOCKS5 代理: ${proxyUrl}`);
    }
  }
  return _proxyAgent;
}

/**
 * 是否跳过服务器转存，让前端自己处理
 * 设置为 true 时，AI 生成的内容 URL 将直接返回给前端，由前端转存到 OSS
 * 这样可以大幅减少服务器带宽消耗
 */
export const SKIP_SERVER_TRANSFER = process.env.SKIP_SERVER_TRANSFER === 'true';

const ensureClient = (): OSS => {
  const bucket = process.env.OSS_BUCKET as string | undefined;
  const region = process.env.OSS_REGION as string | undefined;
  const ak = process.env.OSS_ACCESS_KEY_ID as string | undefined;
  const sk = process.env.OSS_ACCESS_KEY_SECRET as string | undefined;
  if (!bucket || !region || !ak || !sk) {
    throw new Error('未配置 OSS 上传所需的环境变量');
  }
  // 使用传输加速域名（需要在 OSS 控制台开启传输加速）
  const useAccelerate = process.env.OSS_USE_ACCELERATE === 'true';
  const endpoint = useAccelerate 
    ? 'oss-accelerate.aliyuncs.com'  // 全球加速端点
    : `${region}.aliyuncs.com`;
  
  return new OSS({ 
    region,
    endpoint,
    accessKeyId: ak!, 
    accessKeySecret: sk!, 
    bucket: bucket!,
    timeout: 300000  // 5分钟超时
  } as any);
};


export const uploadPath = async (fullPath: string): Promise<string> => {
  const client = ensureClient();
  if (!fs.existsSync(fullPath)) {
    throw new Error(`文件不存在: ${fullPath}`);
  }
  const objectKey = `aivider/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(fullPath)}`;
  try {
    const bucket = (client as any).options?.bucket as string;
    const region = (client as any).options?.region as string;
    const ext = (path.extname(fullPath) || '').toLowerCase();
    const mimeMap: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.mp4': 'video/mp4',
      '.flac': 'audio/flac',
      '.webm': 'video/webm',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp'
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    await client.put(objectKey, fullPath, { headers: { 'x-oss-object-acl': 'public-read', 'Content-Type': contentType } });
    let publicUrl = `https://${bucket}.${region}.aliyuncs.com/${objectKey}`;
    publicUrl = publicUrl.replace('.oss-oss-', '.oss-');
    return publicUrl;
  } catch (e: any) {
    const code = e?.code || '';
    const name = e?.name || '';
    const msg = e?.message || e;
    logger.error(`[OSS] 上传失败 code=${code} name=${name} msg=${msg}`);
    const base = process.env.PUBLIC_BASE_URL || '';
    if (/^https?:\/\//.test(base)) {
      try {
        const baseUrl = new URL(base);
        const rel = path.relative(process.cwd(), fullPath).replace(/^\\+|\/+/, '');
        const publicUrl = `${baseUrl.origin}/${rel}`;
        logger.warn(`[OSS] 上传失败，改用 PUBLIC_BASE_URL 直链: ${publicUrl}`);
        return publicUrl;
      } catch { }
    }
    throw new Error('OSS上传失败');
  }
};

export const uploadBuffer = async (buffer: Buffer, ext: string = ''): Promise<string> => {
  const client = ensureClient();
  const objectKey = `aivider/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext || ''}`;
  try {
    const bucket = (client as any).options?.bucket as string;
    const region = (client as any).options?.region as string;
    const lowerExt = (ext || '').toLowerCase();
    const mimeMap: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.mp4': 'video/mp4',
      '.flac': 'audio/flac',
      '.webm': 'video/webm',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp'
    };
    const contentType = mimeMap[lowerExt] || 'application/octet-stream';
    await client.put(objectKey, buffer, { headers: { 'x-oss-object-acl': 'public-read', 'Content-Type': contentType } });
    let publicUrl = `https://${bucket}.${region}.aliyuncs.com/${objectKey}`;
    publicUrl = publicUrl.replace('.oss-oss-', '.oss-');
    return publicUrl;
  } catch (e: any) {
    const msg = e?.message || e;
    logger.error(`[OSS] Buffer上传失败 ${msg}`);
    // 回退到图床
    try {
      const tmpDir = path.join(process.cwd(), 'uploads', 'tmp');
      fs.mkdirSync(tmpDir, { recursive: true });
      const tmpFile = path.join(tmpDir, `buf-${Date.now()}-${Math.random().toString(36).slice(2)}${ext || ''}`);
      fs.writeFileSync(tmpFile, buffer);
      const url = await uploadPath(tmpFile);
      try { fs.unlinkSync(tmpFile); } catch { }
      return url;
    } catch (e2: any) {
      logger.error(`[OSS] Buffer上传回退失败`, e2?.message || e2);
      throw new Error('OSS上传失败');
    }
  }
};

export const ensureAliyunOssUrl = async (u?: string): Promise<string | undefined> => {
  if (!u) return u;
  const trimmed = u.trim().replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, "").replace('.oss-oss-', '.oss-');
  const base = process.env.PUBLIC_BASE_URL || '';

  // 已是 OSS 链接，直接返回（支持多种格式）
  // 格式1: https://bucket.oss-cn-hangzhou.aliyuncs.com/xxx
  // 格式2: https://bucket.cn-hangzhou.aliyuncs.com/xxx
  // 注意：api-key.oss-accelerate.aliyuncs.com 是临时链接（2小时过期），需要转存
  const isTemporaryOss = /api-key\.oss-accelerate\.aliyuncs\.com/i.test(trimmed);
  if (!isTemporaryOss && 
      (/https:\/\/.+\.(oss-)?[a-z]+-[a-z0-9]+\.aliyuncs\.com\//i.test(trimmed) || 
       trimmed.includes('.aliyuncs.com/'))) {
    logger.info(`[Rehost] 已是OSS链接，跳过转存: ${trimmed.substring(0, 80)}...`);
    return trimmed;
  }
  
  if (isTemporaryOss) {
    logger.info(`[Rehost] 检测到临时OSS链接(api-key.cc)，需要转存: ${trimmed.substring(0, 80)}...`);
  }

  // 纯路径：映射到本地并上传
  if (!trimmed.startsWith('http')) {
    const localRel = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
    const fullPath = path.join(process.cwd(), localRel);
    return await uploadPath(fullPath);
  }

  // http 链接：外链或内部链接处理
  try {
    const parsed = new URL(trimmed);
    let publicHost = '';
    try { if (/^https?:\/\//.test(base)) publicHost = new URL(base).hostname; } catch { }
    const isInternal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || (publicHost && parsed.hostname === publicHost);
    if (!isInternal) {
      // 外部公网链接：下载到本地并上传到阿里云OSS，返回签名公网URL
      const rehostDir = path.join(process.cwd(), 'uploads', 'rehost');
      fs.mkdirSync(rehostDir, { recursive: true });
      const ext = path.extname(parsed.pathname) || '';
      const rehostFile = path.join(rehostDir, `rehost-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
      try {
        const isVideo = /\.(mp4|mov|mkv|webm|avi)$/i.test(ext);
        
        // 如果开启了跳过服务器转存，直接返回原始URL（由前端处理上传）
        if (SKIP_SERVER_TRANSFER && isVideo) {
          logger.info(`[Rehost] 跳过服务器转存视频，返回原始URL: ${trimmed}`);
          return trimmed;
        }
        
        logger.info(`[Rehost] 开始下载外部资源: ${trimmed.substring(0, 80)}... (isVideo=${isVideo}, timeout=${isVideo ? 180000 : 60000}ms)`);
        const startTime = Date.now();
        
        // 国内CDN不走代理（oscdn2.dyysy.com, soraapi.aimuse.club等）
        const isChinaCdn = /oscdn2\.dyysy\.com|soraapi\.aimuse\.club|\.aliyuncs\.com/i.test(trimmed);
        
        // Gemini 中转API返回的图片URL也不走代理（直接下载）
        // 可以通过环境变量 GEMINI_PROXY_IMAGE_DOMAINS 配置需要直连的域名（逗号分隔）
        // 例如：GEMINI_PROXY_IMAGE_DOMAINS=cdn.example.com,images.proxy.com
        let isGeminiProxyImage = false;
        if (process.env.GEMINI_PROXY_IMAGE_DOMAINS) {
          const domains = process.env.GEMINI_PROXY_IMAGE_DOMAINS.split(',').map(d => d.trim()).filter(Boolean);
          if (domains.length > 0) {
            const domainPattern = domains.map(d => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
            isGeminiProxyImage = new RegExp(domainPattern, 'i').test(trimmed);
          }
        }
        
        const shouldUseProxy = !isChinaCdn && !isGeminiProxyImage;
        const agent = shouldUseProxy ? getProxyAgent() : undefined;
        const axiosConfig = agent ? { httpsAgent: agent, httpAgent: agent } : {};
        
        if (isChinaCdn) {
          logger.info(`[Rehost] 国内CDN，不使用代理`);
        } else if (isGeminiProxyImage) {
          logger.info(`[Rehost] Gemini 中转API图片URL，不使用代理，直接下载`);
        }
        
        // 视频使用流式下载避免内存问题
        if (isVideo) {
          const res = await axios.get(trimmed, { 
            responseType: 'stream', 
            timeout: 300000,  // 5分钟超时
            ...axiosConfig,
          });
          const writeStream = fs.createWriteStream(rehostFile);
          await pipeline(res.data, writeStream);
          logger.info(`[Rehost] 视频下载完成，耗时 ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
        } else {
          const resp = await axios.get(trimmed, { responseType: 'arraybuffer', timeout: 60000, ...axiosConfig });
          fs.writeFileSync(rehostFile, Buffer.from(resp.data));
          logger.info(`[Rehost] 资源下载完成，耗时 ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
        }
        
        logger.info(`[Rehost] 开始上传到OSS...`);
        const ossUrl = await uploadPath(rehostFile);
        logger.info(`[Rehost] 上传成功: ${ossUrl}`);
        
        // 清理临时文件
        try { fs.unlinkSync(rehostFile); } catch {}
        
        return ossUrl;
      } catch (e: any) {
        logger.error(`[Rehost] 下载并上传到OSS失败 url=${trimmed} msg=${e?.message || e}`);
        // 下载或上传失败，返回原始URL
        logger.warn(`[Rehost] 处理失败，返回原始URL: ${trimmed}`);
        // 清理可能存在的临时文件
        try { fs.unlinkSync(rehostFile); } catch {}
        return trimmed;
      }
    }
    const localRel = parsed.pathname.replace(/^\/+/, '');
    const fullLocal = path.join(process.cwd(), localRel);
    if (fs.existsSync(fullLocal)) {
      return await uploadPath(fullLocal);
    }
    // 回退：下载到临时文件再上传
    const tmpDir = path.join(process.cwd(), 'uploads', 'tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, `dl-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(parsed.pathname) || ''}`);
    try {
      const resp = await axios.get(trimmed, { responseType: 'arraybuffer', timeout: 30000 });
      fs.writeFileSync(tmpFile, Buffer.from(resp.data));
      const url = await uploadPath(tmpFile);
      try { fs.unlinkSync(tmpFile); } catch { }
      return url;
    } catch (e: any) {
      const status = e?.response?.status;
      const msg = e?.response?.data || e?.message || e;
      logger.error(`[OSS] 下载并上传失败 url=${trimmed} status=${status} msg=${msg}`);
      try { fs.unlinkSync(tmpFile); } catch { }
      try {
        const baseUrl = new URL(base);
        return `${baseUrl.origin}${parsed.pathname}`;
      } catch {
        throw new Error('OSS上传失败: 下载回退');
      }
    }
  } catch (e: any) {
    throw e;
  }
};

/**
 * 生成前端直传 OSS 的预签名 URL
 * @param ext 文件扩展名（如 .jpg, .mp4）
 * @param contentType MIME 类型
 * @returns { uploadUrl, publicUrl, objectKey }
 */
export const generatePresignedUrl = async (ext: string, contentType: string): Promise<{
  uploadUrl: string;
  publicUrl: string;
  objectKey: string;
}> => {
  const client = ensureClient();
  const bucket = (client as any).options?.bucket as string;
  const region = (client as any).options?.region as string;
  const objectKey = `aivider/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext || ''}`;
  
  // 生成预签名 PUT URL，有效期 10 分钟
  let uploadUrl = (client as any).signatureUrl(objectKey, {
    method: 'PUT',
    expires: 600, // 10 分钟
    'Content-Type': contentType,
  });
  
  // 强制使用 HTTPS（避免混合内容问题）
  if (uploadUrl.startsWith('http://')) {
    uploadUrl = uploadUrl.replace('http://', 'https://');
  }
  
  let publicUrl = `https://${bucket}.${region}.aliyuncs.com/${objectKey}`;
  publicUrl = publicUrl.replace('.oss-oss-', '.oss-');

  return { uploadUrl, publicUrl: toCdnUrl(publicUrl), objectKey };
};

/**
 * 根据 Content-Type 或 URL 确定文件扩展名
 */
function getExtFromContentType(contentType: string, url?: string): string {
  if (contentType.includes('image/png')) return '.png';
  if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) return '.jpg';
  if (contentType.includes('image/webp')) return '.webp';
  if (contentType.includes('image/gif')) return '.gif';
  if (contentType.includes('video/mp4')) return '.mp4';
  if (contentType.includes('video/quicktime')) return '.mov';
  if (contentType.includes('video/webm')) return '.webm';
  if (contentType.includes('audio/mpeg')) return '.mp3';
  if (contentType.includes('audio/wav')) return '.wav';
  if (contentType.includes('audio/mp4') || contentType.includes('audio/m4a')) return '.m4a';
  if (contentType.includes('audio/ogg')) return '.ogg';
  
  // 尝试从 URL 中获取扩展名
  if (url) {
    try {
      const urlPath = new URL(url).pathname;
      const urlExt = path.extname(urlPath).toLowerCase();
      if (urlExt) return urlExt;
    } catch {}
  }
  return '.bin';
}

/**
 * 从 URL 流式下载并上传到当前存储（根据存储模式）
 * @param url 源文件 URL
 * @param prefix 文件名前缀，如 'minimaxi', 'doubao', 'wanx'
 * @param headers 可选的请求头
 * @returns 存储 URL
 */
export const downloadAndUploadToOss = async (
  url: string,
  prefix: string = 'download',
  headers?: Record<string, string>,
  forceTransfer: boolean = false // 强制转存，即使开启了 SKIP_SERVER_TRANSFER
): Promise<string> => {
  // 如果开启了跳过转存且不是强制转存，直接返回原始 URL
  if (SKIP_SERVER_TRANSFER && !forceTransfer) {
    logger.info(`[Storage] 跳过服务器转存，返回原始 URL: ${prefix}`);
    return url;
  }

  // 动态导入 storageService 避免循环依赖
  const { storageService } = await import('../services/storage.service');
  const mode = await storageService.getStorageMode();

  // 本地存储模式
  if (mode === 'local') {
    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 300000,
        headers,
      });
      const buffer = Buffer.from(res.data);
      const contentType = res.headers['content-type'] || 'application/octet-stream';
      const ext = getExtFromContentType(contentType, url);
      const localUrl = await storageService.uploadBuffer(buffer, ext);
      logger.info(`[Storage] 下载并保存到本地成功: ${prefix} -> ${localUrl}`);
      return localUrl;
    } catch (error: any) {
      logger.error(`[Storage] 下载并保存到本地失败: ${url}`, error.message);
      throw error;
    }
  }

  // OSS 存储模式
  const client = ensureClient();
  const bucket = (client as any).options?.bucket as string;
  const region = (client as any).options?.region as string;

  try {
    // 先发送 HEAD 请求获取 Content-Type 和 Content-Length
    let contentType = 'application/octet-stream';
    let contentLength: number | undefined;

    try {
      const headRes = await axios.head(url, { timeout: 30000, headers });
      contentType = headRes.headers['content-type'] || contentType;
      contentLength = parseInt(headRes.headers['content-length'] || '0', 10) || undefined;
    } catch {
      // HEAD 请求失败，继续尝试 GET
    }

    const ext = getExtFromContentType(contentType, url);
    const objectKey = `aivider/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

    // 流式下载
    const res = await axios.get(url, {
      responseType: 'stream',
      timeout: 600000,
      headers,
    });

    contentType = res.headers['content-type'] || contentType;

    // 直接将流上传到 OSS
    const result = await (client as any).putStream(objectKey, res.data, {
      headers: {
        'x-oss-object-acl': 'public-read',
        'Content-Type': contentType,
      },
    });

    let publicUrl = `https://${bucket}.${region}.aliyuncs.com/${objectKey}`;
    publicUrl = publicUrl.replace('.oss-oss-', '.oss-');

    logger.info(`[OSS] 流式上传成功: ${prefix} -> ${publicUrl}`);
    return publicUrl;
  } catch (error: any) {
    logger.error(`[OSS] 流式上传失败: ${url}`, error.message);

    // 回退到内存下载方式
    logger.info(`[OSS] 尝试回退到内存下载方式...`);
    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 300000,
        headers,
      });
      const buffer = Buffer.from(res.data);
      const contentType = res.headers['content-type'] || 'application/octet-stream';
      const ext = getExtFromContentType(contentType, url);
      const ossUrl = await uploadBuffer(buffer, ext);
      logger.info(`[OSS] 内存下载上传成功: ${prefix} -> ${ossUrl}`);
      return ossUrl;
    } catch (fallbackError: any) {
      logger.error(`[OSS] 回退方式也失败: ${fallbackError.message}`);
      throw error;
    }
  }
};

/**
 * 从 URL 流式下载并上传到当前存储（根据存储模式，适合大文件如视频）
 * @param url 源文件 URL
 * @param ext 文件扩展名，如 '.mp4', '.jpg'
 * @param headers 可选的请求头
 * @returns 存储 URL
 */
export const streamDownloadAndUploadToOss = async (
  url: string,
  ext: string,
  headers?: Record<string, string>,
  forceTransfer: boolean = false // 强制转存，即使开启了 SKIP_SERVER_TRANSFER
): Promise<string> => {
  // 如果开启了跳过转存且不是强制转存，直接返回原始 URL
  if (SKIP_SERVER_TRANSFER && !forceTransfer) {
    logger.info(`[Storage] 跳过服务器转存视频，返回原始 URL`);
    return url;
  }

  // 动态导入 storageService 避免循环依赖
  const { storageService } = await import('../services/storage.service');
  const mode = await storageService.getStorageMode();

  // 本地存储模式 - 下载到临时文件再保存
  if (mode === 'local') {
    try {
      const tmpDir = path.join(process.cwd(), 'uploads', 'tmp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

      const tmpFile = path.join(tmpDir, `local-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);

      const res = await axios.get(url, {
        responseType: 'stream',
        timeout: 600000,
        headers,
      });

      const writeStream = fs.createWriteStream(tmpFile);
      await pipeline(res.data, writeStream);

      const localUrl = await storageService.uploadPath(tmpFile);

      try { fs.unlinkSync(tmpFile); } catch {}

      logger.info(`[Storage] 视频下载并保存到本地成功: ${ext} -> ${localUrl}`);
      return localUrl;
    } catch (error: any) {
      logger.error(`[Storage] 视频下载并保存到本地失败: ${url}`, error.message);
      throw error;
    }
  }

  // OSS 存储模式
  const client = ensureClient();
  const bucket = (client as any).options?.bucket as string;
  const region = (client as any).options?.region as string;

  try {
    const objectKey = `aivider/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

    // 流式下载
    const res = await axios.get(url, {
      responseType: 'stream',
      timeout: 600000,
      headers,
    });

    const contentType = res.headers['content-type'] || 'application/octet-stream';

    // 直接将流上传到 OSS（边下载边上传）
    await (client as any).putStream(objectKey, res.data, {
      headers: {
        'x-oss-object-acl': 'public-read',
        'Content-Type': contentType,
      },
    });

    let publicUrl = `https://${bucket}.${region}.aliyuncs.com/${objectKey}`;
    publicUrl = publicUrl.replace('.oss-oss-', '.oss-');

    logger.info(`[OSS] 视频流式上传成功: ${ext} -> ${publicUrl}`);
    return publicUrl;
  } catch (error: any) {
    logger.error(`[OSS] 视频流式上传失败: ${url}`, error.message);

    // 回退：先下载到临时文件再上传
    logger.info(`[OSS] 尝试回退到临时文件方式...`);
    try {
      const tmpDir = path.join(process.cwd(), 'uploads', 'tmp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

      const tmpFile = path.join(tmpDir, `fallback-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);

      const res = await axios.get(url, {
        responseType: 'stream',
        timeout: 600000,
        headers,
      });

      const writeStream = fs.createWriteStream(tmpFile);
      await pipeline(res.data, writeStream);

      const ossUrl = await uploadPath(tmpFile);

      try { fs.unlinkSync(tmpFile); } catch {}

      logger.info(`[OSS] 临时文件上传成功: ${ext} -> ${ossUrl}`);
      return ossUrl;
    } catch (fallbackError: any) {
      logger.error(`[OSS] 回退方式也失败: ${fallbackError.message}`);
      throw error;
    }
  }
};

/**
 * 从 OSS URL 中提取 objectKey
 * @param url OSS 公共 URL
 * @returns objectKey 或 null（如果不是有效的 OSS URL）
 */
export const extractObjectKeyFromUrl = (url: string): string | null => {
  if (!url) return null;
  const match = url.match(OSS_URL_PATTERN);
  if (match && match[4]) {
    return match[4].split('?')[0];
  }
  return null;
};

/**
 * 检查 URL 是否是我们的 OSS URL
 * @param url 要检查的 URL
 * @returns 是否是 OSS URL
 */
export const isOssUrl = (url: string): boolean => {
  if (!url) return false;
  const bucket = process.env.OSS_BUCKET;
  if (!bucket) return false;
  return url.includes(`${bucket}.`) && url.includes('.aliyuncs.com/');
};

/**
 * 从 OSS 删除单个文件
 * @param url OSS 公共 URL
 * @returns 是否删除成功
 */
export const deleteFromOss = async (url: string): Promise<boolean> => {
  const objectKey = extractObjectKeyFromUrl(url);
  if (!objectKey) {
    logger.warn(`[OSS] 无法从 URL 提取 objectKey: ${url}`);
    return false;
  }

  try {
    const client = ensureClient();
    await (client as any).delete(objectKey);
    logger.info(`[OSS] 删除成功: ${objectKey}`);
    return true;
  } catch (error: any) {
    if (error.code === 'NoSuchKey' || error.status === 404) {
      logger.info(`[OSS] 文件已不存在: ${objectKey}`);
      return true;
    }
    logger.error(`[OSS] 删除失败: ${objectKey}`, error.message);
    return false;
  }
};

/**
 * 从 OSS 批量删除文件
 * @param urls OSS 公共 URL 数组
 * @returns 删除结果 { success: number, failed: number, errors: string[] }
 */
export const batchDeleteFromOss = async (urls: string[]): Promise<{
  success: number;
  failed: number;
  errors: string[];
}> => {
  const result = { success: 0, failed: 0, errors: [] as string[] };
  
  if (!urls || urls.length === 0) {
    return result;
  }

  const objectKeys: string[] = [];
  for (const url of urls) {
    const key = extractObjectKeyFromUrl(url);
    if (key) {
      objectKeys.push(key);
    } else {
      result.failed++;
      result.errors.push(`无效URL: ${url}`);
    }
  }

  if (objectKeys.length === 0) {
    return result;
  }

  try {
    const client = ensureClient();
    
    const batchSize = 1000;
    for (let i = 0; i < objectKeys.length; i += batchSize) {
      const batch = objectKeys.slice(i, i + batchSize);
      try {
        const deleteResult = await (client as any).deleteMulti(batch, { quiet: true });
        const failedCount = deleteResult.deleted?.length || 0;
        result.success += batch.length - failedCount;
        result.failed += failedCount;
        
        if (deleteResult.deleted && deleteResult.deleted.length > 0) {
          for (const item of deleteResult.deleted) {
            result.errors.push(`删除失败: ${item.Key}`);
          }
        }
      } catch (batchError: any) {
        logger.error(`[OSS] 批量删除失败:`, batchError.message);
        result.failed += batch.length;
        result.errors.push(`批量删除失败: ${batchError.message}`);
      }
    }
    
    logger.info(`[OSS] 批量删除完成: 成功=${result.success}, 失败=${result.failed}`);
  } catch (error: any) {
    logger.error(`[OSS] 批量删除初始化失败:`, error.message);
    result.failed = objectKeys.length;
    result.errors.push(`初始化失败: ${error.message}`);
  }

  return result;
};

/**
 * 列出 OSS 中指定前缀的所有文件
 * @param prefix 文件前缀，默认 'aivider/'
 * @param maxKeys 最大返回数量，默认 1000
 * @returns 文件列表 { name, url, lastModified, size }[]
 */
export const listOssFiles = async (
  prefix: string = 'aivider/',
  maxKeys: number = 1000
): Promise<Array<{
  name: string;
  url: string;
  lastModified: Date;
  size: number;
}>> => {
  const files: Array<{ name: string; url: string; lastModified: Date; size: number }> = [];
  
  try {
    const client = ensureClient();
    const bucket = (client as any).options?.bucket as string;
    const region = (client as any).options?.region as string;
    
    let marker: string | undefined;
    let isTruncated = true;
    
    while (isTruncated && files.length < maxKeys) {
      const result = await (client as any).list({
        prefix,
        marker,
        'max-keys': Math.min(1000, maxKeys - files.length),
      }, {});
      
      if (result.objects) {
        for (const obj of result.objects) {
          let publicUrl = `https://${bucket}.${region}.aliyuncs.com/${obj.name}`;
          publicUrl = publicUrl.replace('.oss-oss-', '.oss-');
          
          files.push({
            name: obj.name,
            url: publicUrl,
            lastModified: new Date(obj.lastModified),
            size: obj.size,
          });
        }
      }
      
      isTruncated = result.isTruncated || false;
      marker = result.nextMarker;
    }
    
    logger.info(`[OSS] 列出文件完成: prefix=${prefix}, count=${files.length}`);
  } catch (error: any) {
    logger.error(`[OSS] 列出文件失败:`, error.message);
  }

  return files;
};