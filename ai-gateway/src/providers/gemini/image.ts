/**
 * Gemini Provider - 图片生成
 * 支持 gemini-3-pro-image-preview 等模型
 */

import axios from 'axios';
import { log } from '../../utils/logger';
import { getActiveApiKey, recordKeyUsage, addRequestLog, getActiveChannelForModel, recordChannelUsage, recordChannelKeyUsage, Channel } from '../../database';
import { uploadBufferWithProvider, downloadAndUpload } from '../../services/storage';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface ImageGenerationParams {
  model?: string;
  prompt: string;
  size?: string;           // 宽高比: 1:1, 16:9, 9:16 等
  image_size?: string;     // 分辨率: 1K, 2K, 4K
  reference_images?: string[];
}

export interface ImageGenerationResult {
  created: number;
  data: Array<{ url: string; revised_prompt?: string }>;
}

/**
 * 从 URL 获取图片并转为 base64
 */
async function fetchImageAsBase64(url: string): Promise<{ mimeType: string; data: string } | null> {
  if (url.startsWith('data:')) {
    const matches = url.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      return { mimeType: matches[1], data: matches[2] };
    }
  } else if (url.startsWith('http')) {
    try {
      const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
      const mimeType = resp.headers['content-type'] || 'image/jpeg';
      const data = Buffer.from(resp.data).toString('base64');
      return { mimeType, data };
    } catch (e: any) {
      log('gemini', 'Failed to fetch image', { error: e.message });
    }
  }
  return null;
}

export async function generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
  const startTime = Date.now();

  // 处理模型名称中的分辨率后缀
  let modelId = params.model || 'gemini-3-pro-image-preview';
  let imageSize = params.image_size;

  if (modelId.endsWith('-4k')) {
    if (!imageSize) imageSize = '4K';
    modelId = modelId.replace(/-4k$/, '');
  } else if (modelId.endsWith('-2k')) {
    if (!imageSize) imageSize = '2K';
    modelId = modelId.replace(/-2k$/, '');
  }

  // 优先查找模型配置的渠道
  const channelResult = getActiveChannelForModel(modelId);

  let apiKey: string;
  let actualModel: string = modelId;
  let channelId: number | null = null;
  let channelKeyId: number | null = null;
  let keyRecordId: number | null = null;
  let storageType: Channel['storage_type'] | undefined;
  let isProxy = false;
  let proxyBaseUrl: string | null = null;

  if (channelResult) {
    const { channel, key, targetModels } = channelResult;
    apiKey = key.api_key;
    channelId = channel.id;
    channelKeyId = key.id;
    storageType = channel.storage_type;
    isProxy = channel.channel_type === 'proxy' && !!channel.base_url;
    proxyBaseUrl = channel.base_url;

    // 根据分辨率选择目标模型名称
    if (targetModels && targetModels.length > 0) {
      if (imageSize && targetModels.length > 1) {
        const sizeSuffix = imageSize.toLowerCase();
        const matched = targetModels.find(m => m.toLowerCase().includes(sizeSuffix));
        actualModel = matched || targetModels[0];
      } else {
        actualModel = targetModels[0];
      }
    }

    log('gemini', 'Image using channel', { channel: channel.name, key: key.name, targetModel: actualModel, isProxy });
  } else {
    const keyRecord = getActiveApiKey('gemini');
    if (!keyRecord) {
      throw new Error('No active API key or channel for gemini');
    }
    apiKey = keyRecord.api_key;
    keyRecordId = keyRecord.id;
  }

  try {
    log('gemini', 'Generating image', { model: modelId, actualModel, imageSize, isProxy, prompt: params.prompt?.slice(0, 50) });

    const parts: any[] = [];

    // 处理参考图片
    if (params.reference_images && params.reference_images.length > 0) {
      for (const img of params.reference_images) {
        const imageData = await fetchImageAsBase64(img);
        if (imageData) {
          parts.push({ inlineData: imageData });
        }
      }
    }

    parts.push({ text: params.prompt });

    // 解析宽高比
    let aspectRatio = '1:1';
    if (params.size) {
      if (['1:1', '16:9', '9:16', '4:3', '3:4', '5:4', '4:5', '21:9', '3:2', '2:3'].includes(params.size)) {
        aspectRatio = params.size;
      } else if (params.size.includes('16:9') || params.size.includes('1792')) {
        aspectRatio = '16:9';
      } else if (params.size.includes('9:16')) {
        aspectRatio = '9:16';
      }
    }

    // 构建请求体
    const requestBody: any = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        temperature: 1,
        imageConfig: imageSize ? { aspectRatio, imageSize } : { aspectRatio },
      },
    };

    let response;
    if (isProxy && proxyBaseUrl) {
      // 中转API - 使用 Bearer token 认证
      const baseUrl = proxyBaseUrl.replace(/\/+$/, '');
      response = await axios.post(
        `${baseUrl}/v1beta/models/${actualModel}:generateContent`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
          },
          timeout: 300000
        }
      );
    } else {
      // 官方API - 使用 key 参数认证
      response = await axios.post(
        `${GEMINI_API_BASE}/${actualModel}:generateContent?key=${apiKey}`,
        requestBody,
        { headers: { 'Content-Type': 'application/json' }, timeout: 300000 }
      );
    }

    const candidates = response.data?.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error('No image generated');
    }

    // 打印响应结构用于调试
    const responseParts = candidates[0]?.content?.parts || [];
    log('gemini', 'Response parts structure', {
      partsCount: responseParts.length,
      partTypes: responseParts.map((p: any) => Object.keys(p))
    });

    // 查找图片数据 - 支持 inlineData (base64) 和 fileData (URL) 两种格式
    const inlineDataPart = responseParts.find((p: any) => p.inlineData);
    const fileDataPart = responseParts.find((p: any) => p.fileData?.fileUri);
    // 也检查 text 中是否包含图片 URL（某些中转 API 可能返回 markdown 格式）
    const textPart = responseParts.find((p: any) => p.text && /!\[.*?\]\((https?:\/\/[^)]+)\)/.test(p.text));
    // 检查 text 中是否有直接的 URL
    const urlInTextPart = responseParts.find((p: any) => p.text && /https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|gif|webp)/i.test(p.text));

    let finalUrl: string;

    if (inlineDataPart?.inlineData) {
      // base64 格式 - 需要保存
      log('gemini', 'Response contains base64 image data');
      const imageBuffer = Buffer.from(inlineDataPart.inlineData.data, 'base64');
      const ext = inlineDataPart.inlineData.mimeType?.includes('png') ? '.png' : '.jpg';
      finalUrl = await uploadBufferWithProvider(imageBuffer, ext, 'gemini', storageType);
    } else if (fileDataPart?.fileData?.fileUri) {
      // URL 格式 - 根据存储设置处理
      const imageUrl = fileDataPart.fileData.fileUri;
      log('gemini', 'Response contains image URL (fileData)', { url: imageUrl });
      finalUrl = await downloadAndUpload(imageUrl, '.jpg', 'gemini', storageType);
    } else if (textPart?.text) {
      // 从 markdown 文本中提取 URL
      const match = textPart.text.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
      if (match) {
        const imageUrl = match[1];
        log('gemini', 'Response contains image URL in markdown', { url: imageUrl });
        finalUrl = await downloadAndUpload(imageUrl, '.jpg', 'gemini', storageType);
      } else {
        throw new Error('No image data in response');
      }
    } else if (urlInTextPart?.text) {
      // 从文本中提取直接的图片 URL
      const match = urlInTextPart.text.match(/https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|gif|webp)/i);
      if (match) {
        const imageUrl = match[0];
        log('gemini', 'Response contains image URL in text', { url: imageUrl });
        finalUrl = await downloadAndUpload(imageUrl, '.jpg', 'gemini', storageType);
      } else {
        throw new Error('No image data in response');
      }
    } else {
      throw new Error('No image data in response (neither base64 nor URL)');
    }

    if (channelKeyId) {
      recordChannelKeyUsage(channelKeyId, true);
    }
    if (channelId) {
      recordChannelUsage(channelId, true);
    } else if (keyRecordId) {
      recordKeyUsage(keyRecordId, true);
    }
    addRequestLog('gemini', '/images/generations', modelId, 'success', Date.now() - startTime);

    log('gemini', 'Image generated successfully', { url: finalUrl });
    return { created: Math.floor(Date.now() / 1000), data: [{ url: finalUrl }] };

  } catch (error: any) {
    if (channelKeyId) {
      recordChannelKeyUsage(channelKeyId, false);
    }
    if (channelId) {
      recordChannelUsage(channelId, false);
    } else if (keyRecordId) {
      recordKeyUsage(keyRecordId, false);
    }
    addRequestLog('gemini', '/images/generations', modelId, 'error', Date.now() - startTime, error.message);
    log('gemini', 'Image generation failed', { error: error.message });
    throw new Error(`Gemini image generation failed: ${error.response?.data?.error?.message || error.message}`);
  }
}
