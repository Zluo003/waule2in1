/**
 * Gemini 服务
 * 通过 wauleApiClient 统一调用 waule-api 的 v1 接口
 */

import { wauleApiClient } from '../wauleapi-client';

// 不重试，失败直接返回错误

interface GeminiImageGenerateOptions {
  prompt: string;
  modelId?: string;
  aspectRatio?: string;
  imageSize?: string;
  referenceImages?: string[];
  apiKey?: string;
  apiUrl?: string;
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
  apiKey?: string;
  apiUrl?: string;
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
  } = options;

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

  console.log('[Gemini] 图片生成请求:', {
    model: actualModelId,
    originalModel: modelId,
    imageSize,
    aspectRatio,
    prompt: prompt.substring(0, 100),
    referenceImagesCount: referenceImages.length,
  });

  try {
    const result = await wauleApiClient.generateImage({
      model: actualModelId,
      prompt,
      size: aspectRatio,
      reference_images: referenceImages.length > 0 ? referenceImages : undefined,
    });

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
  } = options;

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
    });

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
