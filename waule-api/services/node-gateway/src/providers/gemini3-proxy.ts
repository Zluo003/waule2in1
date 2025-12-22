/**
 * Gemini 3 Pro Image Preview 中转API Provider
 * 
 * 支持:
 * - 文生图 (text-to-image)
 * - 图生图 (image-to-image)
 * - 多模态输入
 * 
 * API文档参考: https://my.api-key.cc
 * 端点: POST https://my.api-key.cc/v1/chat/completions
 */

import axios from 'axios';
import { uploadBuffer } from '../oss';
import { getGemini3ProxyConfig } from '../db';

function log(tag: string, msg: string, data?: any) {
  console.log(`[${new Date().toISOString()}] [${tag}] ${msg}`, data || '');
}

export interface Gemini3ProxyImageOptions {
  model?: string;
  prompt: string;
  imageSize?: string;      // 图片分辨率: 1K, 2K, 4K
  aspectRatio?: string;    // 宽高比: 1:1, 16:9, 9:16, 4:3, 3:4, 21:9, 3:2, 2:3
  referenceImages?: string[];  // 参考图片 (URL或base64)
  temperature?: number;    // 采样温度，默认1
  maxTokens?: number;      // 最大输出token数
  stream?: boolean;        // 是否流式输出
}

// 默认配置
const DEFAULT_BASE_URL = 'https://my.api-key.cc';
const DEFAULT_MODEL = 'gemini-3-pro-image-preview';

/**
 * 从URL或Base64获取图片数据
 */
async function fetchImageAsBase64(img: string): Promise<{ mimeType: string; data: string } | null> {
  if (img.startsWith('data:')) {
    const matches = img.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      return { mimeType: matches[1], data: matches[2] };
    }
  } else if (img.startsWith('http')) {
    try {
      const resp = await axios.get(img, { responseType: 'arraybuffer', timeout: 30000 });
      const mimeType = resp.headers['content-type'] || 'image/jpeg';
      const data = Buffer.from(resp.data).toString('base64');
      return { mimeType, data };
    } catch (e: any) {
      log('Gemini3Proxy', `无法获取参考图: ${e.message}`);
    }
  }
  return null;
}

/**
 * 从响应内容中提取图片URL
 * 响应格式: ![image](http://your-domain.com/media/xxx.jpg)
 */
function extractImageUrls(content: string): string[] {
  const urls: string[] = [];
  
  // 匹配 markdown 图片格式 ![...](url)
  const markdownRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = markdownRegex.exec(content)) !== null) {
    urls.push(match[1]);
  }
  
  // 匹配纯URL格式 (备用)
  if (urls.length === 0) {
    const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+\.(?:png|jpg|jpeg|gif|webp))/gi;
    while ((match = urlRegex.exec(content)) !== null) {
      urls.push(match[1]);
    }
  }
  
  return urls;
}

/**
 * 使用 Gemini 3 Pro Image Preview 中转API生成图片
 */
export async function generateImage(options: Gemini3ProxyImageOptions): Promise<{
  url: string;
  urls?: string[];
  revisedPrompt?: string;
}> {
  const { 
    prompt, 
    imageSize = '1K',
    aspectRatio = '1:1',
    referenceImages,
    temperature = 1,
    stream = false 
  } = options;
  
  // 获取中转API配置
  const config = getGemini3ProxyConfig();
  if (!config || !config.api_key) {
    throw new Error('Gemini 3 Pro 中转API未配置或缺少API Key');
  }
  
  const baseUrl = config.base_url || DEFAULT_BASE_URL;
  const apiKey = config.api_key;
  const model = config.model || DEFAULT_MODEL;
  
  log('Gemini3Proxy', `图片生成请求:`, {
    model,
    imageSize,
    aspectRatio,
    baseUrl,
    refImages: referenceImages?.length || 0,
  });
  
  // 构建消息内容
  let messageContent: any;
  
  if (referenceImages && referenceImages.length > 0) {
    // 图生图模式: content 为数组格式
    const contentArray: any[] = [];
    
    // 添加文本提示
    contentArray.push({
      type: 'text',
      text: prompt
    });
    
    // 处理参考图片 (最多14张)
    const maxImages = Math.min(referenceImages.length, 14);
    for (let i = 0; i < maxImages; i++) {
      const img = referenceImages[i];
      if (img.startsWith('http') || img.startsWith('data:')) {
        contentArray.push({
          type: 'image_url',
          image_url: { url: img }
        });
      }
    }
    
    messageContent = contentArray;
    log('Gemini3Proxy', `添加了 ${maxImages} 张参考图片`);
  } else {
    // 文生图模式: content 为字符串格式
    messageContent = prompt;
  }
  
  // 构建请求体
  const requestBody: any = {
    model: model,
    stream: stream,
    messages: [
      {
        role: 'user',
        content: messageContent
      }
    ]
  };
  
  // 添加可选参数
  if (imageSize && imageSize !== '1K') {
    requestBody.image_size = imageSize;
  }
  if (aspectRatio && aspectRatio !== '1:1') {
    requestBody.aspect_ratio = aspectRatio;
  }
  if (temperature !== 1) {
    requestBody.temperature = temperature;
  }
  
  log('Gemini3Proxy', `请求体: ${JSON.stringify(requestBody).slice(0, 500)}...`);
  
  const startTime = Date.now();
  
  try {
    const response = await axios.post(
      `${baseUrl}/v1/chat/completions`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 600000 // 10分钟超时 (4K分辨率可能需要较长时间)
      }
    );
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log('Gemini3Proxy', `API响应成功, 耗时: ${duration}s`);
    
    const data = response.data;
    const content = data?.choices?.[0]?.message?.content || '';
    
    log('Gemini3Proxy', `响应内容长度: ${content.length}`);
    
    // 提取图片URL
    const imageUrls = extractImageUrls(content);
    
    if (imageUrls.length === 0) {
      // 检查是否有base64图片数据
      if (content.includes('data:image')) {
        const base64Match = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
        if (base64Match) {
          const base64Data = base64Match[0];
          const mimeType = base64Data.match(/data:([^;]+);/)?.[1] || 'image/png';
          const imageData = base64Data.split(',')[1];
          const imageBuffer = Buffer.from(imageData, 'base64');
          const ext = mimeType.includes('png') ? '.png' : '.jpg';
          const ossUrl = await uploadBuffer(imageBuffer, ext, 'gemini3-proxy');
          log('Gemini3Proxy', `图片生成成功(base64转存): ${ossUrl}`);
          return { url: ossUrl };
        }
      }
      throw new Error('未能从响应中提取图片URL');
    }
    
    log('Gemini3Proxy', `图片生成成功: ${imageUrls.length}张`);
    
    // 返回结果 (直接使用中转API返回的URL)
    return {
      url: imageUrls[0],
      urls: imageUrls.length > 1 ? imageUrls : undefined,
      revisedPrompt: undefined
    };
    
  } catch (error: any) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const statusCode = error.response?.status;
    const responseData = error.response?.data;
    const errMsg = responseData?.error?.message || responseData?.message || error.message;
    
    log('Gemini3Proxy', `图片生成失败 (${duration}s): status=${statusCode}, error=${errMsg}`);
    log('Gemini3Proxy', `错误响应详情: ${JSON.stringify(responseData || {})}`);
    
    throw new Error(`Gemini 3 Pro 中转API调用失败: ${errMsg}`);
  }
}

/**
 * 检查中转API是否可用
 */
export function isAvailable(): boolean {
  const config = getGemini3ProxyConfig();
  return !!(config && config.is_active === 1 && config.api_key);
}

/**
 * 获取当前配置的提供商名称
 */
export function getProviderName(): string {
  const config = getGemini3ProxyConfig();
  return config?.provider || 'unknown';
}
