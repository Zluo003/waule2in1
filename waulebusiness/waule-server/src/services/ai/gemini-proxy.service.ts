/**
 * Gemini 服务
 * 通过 wauleApiClient 统一调用 waule-api 的 v1 接口
 */

import { wauleApiClient, getServerConfigByModelId, ServerConfig } from '../wauleapi-client';
import { uploadBuffer } from '../../utils/oss';

// ==================== 工具函数 ====================

/**
 * 处理参考图片URL
 * - Base64 → 上传 OSS → 返回 OSS URL
 * - 公网 URL → 直接返回
 */
async function processImageUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:image/')) {
    console.log('🔄 [Gemini] 检测到 Base64，上传到 OSS 转为 URL...', imageUrl.length, '字符');
    try {
      const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'jpeg' ? '.jpg' : `.${matches[1]}`;
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const ossUrl = await uploadBuffer(buffer, ext);
        console.log('✅ [Gemini] 已上传到 OSS:', ossUrl);
        return ossUrl;
      }
    } catch (e: any) {
      console.error('❌ [Gemini] 上传到 OSS 失败:', e.message);
      throw new Error('图片上传失败，请重试');
    }
  }
  
  if (imageUrl.startsWith('https://') || imageUrl.startsWith('http://')) {
    return imageUrl;
  }
  
  throw new Error('不支持的图片格式');
}

// 不重试，失败直接返回错误

interface GeminiImageGenerateOptions {
  prompt: string;
  modelId?: string;
  aspectRatio?: string;
  imageSize?: string;
  referenceImages?: string[];
  serverConfig?: ServerConfig; // 服务器配置（来自数据库）
  apiKey?: string; // 已废弃，保留向后兼容
  apiUrl?: string; // 已废弃，保留向后兼容
}

interface GeminiTextGenerateOptions {
  prompt: string;
  systemPrompt?: string;
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  documentFiles?: Array<{ filePath: string; mimeType: string }>;
  imageUrls?: string[];
  videoUrls?: string[];
  inlineImages?: Array<{ mimeType: string; data: string }>;
  serverConfig?: ServerConfig; // 服务器配置（来自数据库）
  apiKey?: string; // 已废弃，保留向后兼容
  apiUrl?: string; // 已废弃，保留向后兼容
}

/**
 * 生成图片（通过 waule-api 统一接口）
 */
export const generateImage = async (options: GeminiImageGenerateOptions): Promise<string> => {
  const {
    prompt,
    modelId = 'gemini-2.0-flash-exp-image-generation',
    aspectRatio = '1:1',
    imageSize,
    referenceImages = [],
    serverConfig,
  } = options;

  // 获取服务器配置
  const finalServerConfig = serverConfig || await getServerConfigByModelId(modelId);

  // 处理 Gemini 3 Pro Image 模型的 2K/4K 分辨率
  // 如果模型是 gemini-3-pro-image-preview 且指定了 imageSize，则添加对应后缀
  let actualModelId = modelId;
  if (modelId === 'gemini-3-pro-image-preview' && imageSize) {
    if (imageSize === '4K' || imageSize === '4k') {
      actualModelId = 'gemini-3-pro-image-preview-4k';
    } else {
      actualModelId = 'gemini-3-pro-image-preview-2k';
    }
    console.log(`[Gemini] 分辨率映射: ${modelId} + ${imageSize} -> ${actualModelId}`);
  }

  // 处理参考图片（base64 → OSS URL）
  const processedImages: string[] = [];
  for (const img of referenceImages) {
    if (img) {
      const processed = await processImageUrl(img);
      processedImages.push(processed);
    }
  }

  console.log('[Gemini] 图片生成请求:', {
    model: actualModelId,
    originalModel: modelId,
    imageSize,
    aspectRatio,
    prompt: prompt.substring(0, 100),
    referenceImagesCount: processedImages.length,
  });

  try {
    const result = await wauleApiClient.generateImage({
      model: actualModelId,
      prompt,
      size: aspectRatio,
      image_size: imageSize, // 传递分辨率参数（2K/4K）
      reference_images: processedImages.length > 0 ? processedImages : undefined,
    }, finalServerConfig);

    if (!result.data || result.data.length === 0) {
      throw new Error('WauleAPI 未返回图片数据');
    }

    const imageUrl = result.data[0].url;
    console.log('[Gemini] 图片生成成功:', imageUrl);
    return imageUrl;
  } catch (error: any) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    console.error('[Gemini] 图片生成失败:', errorMsg);
    throw new Error(`Gemini 图片生成失败: ${errorMsg}`);
  }
};

/**
 * 生成文本（通过 waule-api 统一接口）
 */
export const generateText = async (options: GeminiTextGenerateOptions): Promise<string> => {
  const {
    prompt,
    systemPrompt,
    modelId = 'gemini-2.0-flash',
    temperature = 0.7,
    maxTokens = 8192,
    imageUrls = [],
    videoUrls = [],
    inlineImages = [],
    serverConfig,
  } = options;

  // 获取服务器配置
  const finalServerConfig = serverConfig || await getServerConfigByModelId(modelId);

  console.log('[Gemini] 文本生成请求:', {
    model: modelId,
    temperature,
    maxTokens,
    promptLength: prompt.length,
    imageCount: imageUrls.length + inlineImages.length,
    videoCount: videoUrls.length,
  });

  // 构建消息
  const messages: Array<{ role: string; content: any }> = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  // 构建用户消息内容（支持多模态）
  const userContent: any[] = [{ type: 'text', text: prompt }];

  // 添加图片 URL
  for (const url of imageUrls) {
    userContent.push({
      type: 'image_url',
      image_url: { url },
    });
  }

  // 添加 inline 图片
  for (const img of inlineImages) {
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:${img.mimeType};base64,${img.data}` },
    });
  }

  // 添加视频
  for (const url of videoUrls) {
    userContent.push({
      type: 'video_url',
      video_url: { url },
    });
  }

  messages.push({ role: 'user', content: userContent });

  try {
    const result = await wauleApiClient.chat({
      model: modelId,
      messages,
      temperature,
      max_tokens: maxTokens,
    }, finalServerConfig);

    if (!result.choices || result.choices.length === 0) {
      throw new Error('WauleAPI 未返回文本内容');
    }

    const content = result.choices[0].message.content;
    console.log('[Gemini] 文本生成成功, 长度:', content.length);
    return content;
  } catch (error: any) {
    console.error('[Gemini] 文本生成失败:', error.response?.data || error.message);
    throw new Error(`Gemini 文本生成失败: ${error.response?.data?.error?.message || error.message}`);
  }
};

export default {
  generateImage,
  generateText,
};
