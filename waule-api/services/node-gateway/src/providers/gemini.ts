/**
 * Gemini Provider
 * Google AI 图片/文本生成
 */

import axios from 'axios';
import { uploadBuffer } from '../oss';
import { log, getApiKey, recordKeyUsage } from './utils';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiImageOptions {
  model: string;
  prompt: string;
  size?: string;
  referenceImages?: string[];
}

export interface GeminiChatOptions {
  model: string;
  messages: Array<{ role: string; content: string | any[] }>;
  temperature?: number;
  maxTokens?: number;
}

// 图片生成
export async function generateImage(options: GeminiImageOptions): Promise<{
  url: string;
  revisedPrompt?: string;
}> {
  const { model, prompt, size, referenceImages } = options;
  const { key: API_KEY, keyId } = getApiKey('google', 'GOOGLE_API_KEY');
  
  // 处理 waule-server 传来的分辨率后缀（如 -2k, -4k），Google API 不识别这些后缀
  let modelId = model || 'gemini-2.0-flash-exp-image-generation';
  const originalModel = modelId;
  
  // 去除分辨率后缀，提取分辨率信息（用于日志）
  if (modelId.endsWith('-2k') || modelId.endsWith('-4k')) {
    modelId = modelId.replace(/-[24]k$/, '');
  }
  
  log('Gemini', `图片生成: model=${modelId}${originalModel !== modelId ? ` (原始: ${originalModel})` : ''}`);
  
  const parts: any[] = [];
  
  // 处理参考图片
  if (referenceImages && referenceImages.length > 0) {
    for (const img of referenceImages) {
      let mimeType = 'image/jpeg';
      let base64Data: string | null = null;
      
      if (img.startsWith('data:')) {
        const matches = img.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          base64Data = matches[2];
        }
      } else if (img.startsWith('http')) {
        try {
          const resp = await axios.get(img, { responseType: 'arraybuffer', timeout: 30000 });
          mimeType = resp.headers['content-type'] || mimeType;
          base64Data = Buffer.from(resp.data).toString('base64');
        } catch (e: any) {
          log('Gemini', `无法获取参考图: ${e.message}`);
        }
      }
      
      if (base64Data) {
        parts.push({ inlineData: { mimeType, data: base64Data } });
      }
    }
  }
  
  parts.push({ text: prompt });
  
  // 解析尺寸为宽高比
  let aspectRatio = '1:1';
  if (size) {
    // 直接使用传入的比例（如果是标准格式）
    if (['1:1', '16:9', '9:16', '4:3', '3:4', '5:4', '4:5', '21:9', '3:2', '2:3'].includes(size)) {
      aspectRatio = size;
    } else if (size.includes('16:9') || size.includes('1792')) {
      aspectRatio = '16:9';
    } else if (size.includes('9:16')) {
      aspectRatio = '9:16';
    } else if (size.includes('21:9')) {
      aspectRatio = '21:9';
    } else if (size.includes('4:3')) {
      aspectRatio = '4:3';
    } else if (size.includes('3:4')) {
      aspectRatio = '3:4';
    }
  }
  
  try {
    const response = await axios.post(
      `${GEMINI_API_BASE}/${modelId}:generateContent?key=${API_KEY}`,
      {
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio },
        },
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 300000 }
    );
    
    recordKeyUsage(keyId, true);
    
    const candidates = response.data?.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error('No image generated');
    }
    
    const imagePart = candidates[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (!imagePart?.inlineData) {
      throw new Error('No inline image data');
    }
    
    const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
    const ext = imagePart.inlineData.mimeType?.includes('png') ? '.png' : '.jpg';
    const ossUrl = await uploadBuffer(imageBuffer, ext, 'gemini');
    
    log('Gemini', `图片生成成功: ${ossUrl}`);
    return { url: ossUrl };
    
  } catch (error: any) {
    recordKeyUsage(keyId, false, error.message);
    log('Gemini', `图片生成失败: ${error.message}`);
    throw new Error(`Gemini image generation failed: ${error.response?.data?.error?.message || error.message}`);
  }
}

// 文本/对话生成
export async function chatCompletion(options: GeminiChatOptions): Promise<{
  id: string;
  choices: Array<{ index: number; message: { role: string; content: string }; finish_reason: string }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}> {
  const { model, messages, temperature = 0.7, maxTokens = 8192 } = options;
  const { key: API_KEY, keyId } = getApiKey('google', 'GOOGLE_API_KEY');
  
  const modelId = model || 'gemini-2.0-flash';
  log('Gemini', `对话请求: model=${modelId}`);
  
  // 转换消息格式
  const contents: any[] = [];
  for (const msg of messages) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    
    if (typeof msg.content === 'string') {
      contents.push({ role, parts: [{ text: msg.content }] });
    } else if (Array.isArray(msg.content)) {
      // 处理多模态消息
      const parts: any[] = [];
      for (const item of msg.content) {
        if (item.type === 'text') {
          parts.push({ text: item.text });
        } else if (item.type === 'image_url') {
          const url = item.image_url?.url;
          if (url?.startsWith('data:')) {
            const matches = url.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
              parts.push({ inlineData: { mimeType: matches[1], data: matches[2] } });
            }
          } else if (url) {
            try {
              const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
              const base64 = Buffer.from(resp.data).toString('base64');
              const mimeType = resp.headers['content-type'] || 'image/jpeg';
              parts.push({ inlineData: { mimeType, data: base64 } });
            } catch {}
          }
        }
      }
      contents.push({ role, parts });
    }
  }
  
  try {
    const response = await axios.post(
      `${GEMINI_API_BASE}/${modelId}:generateContent?key=${API_KEY}`,
      {
        contents,
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 180000 }
    );
    
    recordKeyUsage(keyId, true);
    
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    return {
      id: `chatcmpl-${Date.now()}`,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: 'stop',
      }],
    };
    
  } catch (error: any) {
    recordKeyUsage(keyId, false, error.message);
    log('Gemini', `对话失败: ${error.message}`);
    throw new Error(`Gemini chat failed: ${error.response?.data?.error?.message || error.message}`);
  }
}
