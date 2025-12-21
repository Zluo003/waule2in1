/**
 * 豆包 AI 服务 - 通过 WauleAPI 网关调用
 * 
 * 改造说明：
 * - 图片生成/视频生成/文本生成改为调用 wauleapi 的 v1 统一接口
 * - API Key 由 wauleapi 管理
 * - 大模型返回结果的 OSS 上传由 wauleapi 处理
 * - 保留 processImageUrl：处理前端传来的参考图（base64→OSS URL）
 */

import { uploadBuffer } from '../../utils/oss';
import { wauleApiClient, getServerConfigByModelId, ServerConfig } from '../wauleapi-client';

// ==================== 工具函数 ====================

/**
 * 处理参考图片URL
 * - Base64 → 上传 OSS → 返回 OSS URL
 * - 公网 URL → 直接返回
 */
async function processImageUrl(imageUrl: string): Promise<string> {
  // 如果是 Base64，上传到 OSS 转为 URL
  if (imageUrl.startsWith('data:image/')) {
    console.log('🔄 检测到 Base64，上传到 OSS 转为 URL...', imageUrl.length, '字符');
    try {
      const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'jpeg' ? '.jpg' : `.${matches[1]}`;
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const ossUrl = await uploadBuffer(buffer, ext);
        console.log('✅ 已上传到 OSS:', ossUrl);
        return ossUrl;
      }
    } catch (e: any) {
      console.error('❌ 上传到 OSS 失败:', e.message);
      throw new Error('图片上传失败，请重试');
    }
  }
  
  // 公网 URL 直接返回
  if (imageUrl.startsWith('https://') || imageUrl.startsWith('http://')) {
    console.log('🌐 使用 URL:', imageUrl.substring(0, 80));
    return imageUrl;
  }
  
  // 其他情况报错
  console.error('❌ 不支持的图片格式:', imageUrl.substring(0, 50));
  throw new Error('不支持的图片格式，请使用 OSS URL');
}

// ==================== 接口定义 ====================

interface DoubaoImageGenerateOptions {
  prompt: string;
  modelId: string;
  aspectRatio?: string;
  referenceImages?: string[];
  maxImages?: number; // SeeDream 4.5 组图数量 (1-15)
  serverConfig?: ServerConfig; // 服务器配置（来自数据库）
  apiKey?: string; // 已废弃，保留向后兼容
  apiUrl?: string; // 已废弃，保留向后兼容
}

interface DoubaoVideoGenerateOptions {
  prompt: string;
  modelId: string;
  ratio?: string;
  resolution?: string;
  generationType?: string;
  duration?: number;
  referenceImages?: string[];
  serverConfig?: ServerConfig; // 服务器配置（来自数据库）
  apiKey?: string; // 已废弃，保留向后兼容
  apiUrl?: string; // 已废弃，保留向后兼容
}

interface DoubaoTextGenerateOptions {
  prompt: string;
  systemPrompt?: string;
  modelId: string;
  temperature?: number;
  maxTokens?: number;
  imageUrls?: string[];
  videoUrls?: string[];
  serverConfig?: ServerConfig; // 服务器配置（来自数据库）
  apiKey?: string; // 已废弃，保留向后兼容
  apiUrl?: string; // 已废弃，保留向后兼容
}

// ==================== AI 服务函数 ====================

/**
 * 豆包 SeedDream 图片生成
 * 返回值：单图生成返回单个 URL，多图生成返回 URL 数组
 */
export async function generateImage(options: DoubaoImageGenerateOptions): Promise<string | string[]> {
  const {
    prompt,
    modelId,
    aspectRatio = '1:1',
    referenceImages = [],
    maxImages,
    serverConfig,
  } = options;

  // 获取服务器配置（优先使用传入的配置，否则从数据库获取）
  const finalServerConfig = serverConfig || await getServerConfigByModelId(modelId);

  // 处理参考图片（base64 → OSS URL）
  const processedImages: string[] = [];
  for (const img of referenceImages.slice(0, 10)) {
    const processedUrl = await processImageUrl(img);
    processedImages.push(processedUrl);
  }

  console.log('[Doubao] 图片生成请求:', {
    model: modelId,
    aspectRatio,
    prompt: prompt.substring(0, 100),
    referenceImagesCount: processedImages.length,
    maxImages: maxImages || 1,
  });

  try {
    const result = await wauleApiClient.generateImage({
      model: modelId,
      prompt,
      size: aspectRatio,
      reference_images: processedImages.length > 0 ? processedImages : undefined,
      max_images: maxImages, // 传递组图数量参数
    }, finalServerConfig);

    if (!result.data || result.data.length === 0) {
      throw new Error('WauleAPI 未返回图片数据');
    }

    // 如果返回多张图片，返回数组
    if (result.data.length > 1) {
      const imageUrls = result.data.map(d => d.url);
      console.log('[Doubao] 图片生成成功:', imageUrls.length, '张');
      return imageUrls;
    }

    const imageUrl = result.data[0].url;
    console.log('[Doubao] 图片生成成功:', imageUrl);
    return imageUrl;
  } catch (error: any) {
    console.error('[Doubao] 图片生成失败:', error.response?.data || error.message);
    throw new Error(`豆包图片生成失败: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * 豆包 SeeDance 视频生成
 * 返回值：视频 URL (已经是 OSS URL)
 */
export async function generateVideo(options: DoubaoVideoGenerateOptions): Promise<string> {
  const {
    prompt,
    modelId,
    ratio = '16:9',
    resolution = '720p',
    duration = 5,
    generationType,
    referenceImages = [],
    serverConfig,
  } = options;

  // 获取服务器配置
  const finalServerConfig = serverConfig || await getServerConfigByModelId(modelId);

  // 处理参考图片（base64 → OSS URL）
  const processedImages: string[] = [];
  for (const img of referenceImages) {
    const processedUrl = await processImageUrl(img);
    processedImages.push(processedUrl);
  }

  console.log('[Doubao] 视频生成请求:', {
    model: modelId,
    ratio,
    resolution,
    duration,
    generationType,
    prompt: prompt.substring(0, 100),
    referenceImagesCount: processedImages.length,
  });

  try {
    const result = await wauleApiClient.generateVideo({
      model: modelId,
      prompt,
      aspect_ratio: ratio,
      resolution,
      duration,
      reference_images: processedImages.length > 0 ? processedImages : undefined,
    }, finalServerConfig);

    if (!result.data || result.data.length === 0) {
      throw new Error('WauleAPI 未返回视频数据');
    }

    const videoUrl = result.data[0].url;
    console.log('[Doubao] 视频生成成功:', videoUrl);
    return videoUrl;
  } catch (error: any) {
    console.error('[Doubao] 视频生成失败:', error.response?.data || error.message);
    throw new Error(`豆包视频生成失败: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * 豆包文本生成 (Chat Completions)
 */
export async function generateText(options: DoubaoTextGenerateOptions): Promise<string> {
  const {
    prompt,
    systemPrompt,
    modelId,
    temperature = 0.7,
    maxTokens = 4000,
    imageUrls = [],
    videoUrls = [],
    serverConfig,
  } = options;

  // 获取服务器配置
  const finalServerConfig = serverConfig || await getServerConfigByModelId(modelId);

  console.log('[Doubao] 文本生成请求:', {
    model: modelId,
    temperature,
    maxTokens,
    promptLength: prompt.length,
    imageCount: imageUrls.length,
    videoCount: videoUrls.length,
  });

  try {
    // 构建消息
    const messages: Array<{ role: string; content: any }> = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // 构建用户消息内容（支持多模态）
    const userContent: any[] = [{ type: 'text', text: prompt }];

    // 添加图片
    for (const url of imageUrls) {
      userContent.push({
        type: 'image_url',
        image_url: { url },
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
    console.log('[Doubao] 文本生成成功, 长度:', content.length);
    return content;
  } catch (error: any) {
    console.error('[Doubao] 文本生成失败:', error.response?.data || error.message);
    throw new Error(`豆包文本生成失败: ${error.response?.data?.error?.message || error.message}`);
  }
}
