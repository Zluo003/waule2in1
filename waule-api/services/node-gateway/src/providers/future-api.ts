/**
 * Future API Provider
 * 中转API图片生成服务
 * 
 * 支持模型:
 * - gemini-3-pro-image-preview-2k: 2K分辨率图片生成
 * - gemini-3-pro-image-preview-4k: 4K分辨率图片生成
 * 
 * API文档: https://future-api.doc.vodeshop.com/
 */

import axios from 'axios';
import { uploadBuffer } from '../oss';
import { getProxyApiConfig } from '../db';

function log(tag: string, msg: string, data?: any) {
  console.log(`[${new Date().toISOString()}] [${tag}] ${msg}`, data || '');
}

export interface FutureApiImageOptions {
  model: string;
  prompt: string;
  size?: string;
  referenceImages?: string[];
}

// 解析图片尺寸参数
function parseImageSize(model: string, size?: string): { param: string } {
  // 2K 和 4K 模型对应不同的默认分辨率参数
  if (model.includes('4k')) {
    return { param: '4K' };
  }
  return { param: '2K' };
}

// 从URL或Base64获取图片数据
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
      log('FutureAPI', `无法获取参考图: ${e.message}`);
    }
  }
  return null;
}

// 从响应中提取图片URL
function extractImageUrls(content: string): string[] {
  const urls: string[] = [];
  
  // 匹配 markdown 图片格式 ![...](url)
  const markdownRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = markdownRegex.exec(content)) !== null) {
    urls.push(match[1]);
  }
  
  // 匹配纯URL格式
  if (urls.length === 0) {
    const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+\.(?:png|jpg|jpeg|gif|webp))/gi;
    while ((match = urlRegex.exec(content)) !== null) {
      urls.push(match[1]);
    }
  }
  
  return urls;
}

// 图片生成
export async function generateImage(options: FutureApiImageOptions): Promise<{
  url: string;
  urls?: string[];
  revisedPrompt?: string;
}> {
  const { model, prompt, size, referenceImages } = options;
  
  // 获取中转API配置
  const config = getProxyApiConfig();
  if (!config || !config.api_key) {
    throw new Error('中转API未配置或缺少API Key');
  }
  
  const baseUrl = config.base_url || 'https://future-api.vodeshop.com';
  const apiKey = config.api_key;
  
  // 根据模型选择实际调用的模型名
  let actualModel = config.model_2k || 'gemini-2.5-flash-image';
  if (model.includes('4k')) {
    actualModel = config.model_4k || 'gemini-2.5-flash-image';
  }
  
  log('FutureAPI', `图片生成: model=${model} -> ${actualModel}`);
  
  // 构建消息内容
  const messageContent: any[] = [];
  
  // 添加文本提示
  messageContent.push({
    type: 'text',
    text: prompt
  });
  
  // 处理参考图片
  if (referenceImages && referenceImages.length > 0) {
    for (const img of referenceImages) {
      if (img.startsWith('http')) {
        // URL格式，直接使用
        messageContent.push({
          type: 'image_url',
          image_url: { url: img }
        });
      } else if (img.startsWith('data:')) {
        // Base64格式，直接使用
        messageContent.push({
          type: 'image_url',
          image_url: { url: img }
        });
      }
    }
  }
  
  const requestBody = {
    model: actualModel,
    stream: false,
    messages: [
      {
        role: 'user',
        content: messageContent
      }
    ],
    max_tokens: 16000,
    temperature: 1,
    top_p: 1
  };
  
  try {
    const response = await axios.post(
      `${baseUrl}/v1/chat/completions`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 300000 // 5分钟超时
      }
    );
    
    const data = response.data;
    const content = data?.choices?.[0]?.message?.content || '';
    
    log('FutureAPI', `响应内容长度: ${content.length}`);
    
    // 提取图片URL
    const imageUrls = extractImageUrls(content);
    
    if (imageUrls.length === 0) {
      // 如果没有找到图片URL，检查是否有base64图片数据
      if (content.includes('data:image')) {
        const base64Match = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
        if (base64Match) {
          const base64Data = base64Match[0];
          const mimeType = base64Data.match(/data:([^;]+);/)?.[1] || 'image/png';
          const imageData = base64Data.split(',')[1];
          const imageBuffer = Buffer.from(imageData, 'base64');
          const ext = mimeType.includes('png') ? '.png' : '.jpg';
          const ossUrl = await uploadBuffer(imageBuffer, ext, 'future-api');
          log('FutureAPI', `图片生成成功(base64): ${ossUrl}`);
          return { url: ossUrl };
        }
      }
      throw new Error('未能从响应中提取图片URL');
    }
    
    // 直接使用中转API返回的URL，不再重复上传OSS
    log('FutureAPI', `图片生成成功: ${imageUrls.length}张`);
    
    return {
      url: imageUrls[0],
      urls: imageUrls.length > 1 ? imageUrls : undefined,
      revisedPrompt: undefined
    };
    
  } catch (error: any) {
    const errMsg = error.response?.data?.error?.message || error.message;
    log('FutureAPI', `图片生成失败: ${errMsg}`);
    throw new Error(`Future API image generation failed: ${errMsg}`);
  }
}

