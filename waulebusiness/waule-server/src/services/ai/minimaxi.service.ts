/**
 * MiniMax/海螺 AI 服务 - 通过 WauleAPI 网关调用
 * 
 * 改造说明：
 * - 视频生成改为调用 wauleapi 的 v1 统一接口
 * - API Key 由 wauleapi 管理
 * - 大模型返回结果的 OSS 上传由 wauleapi 处理
 */

import { uploadBuffer } from '../../utils/oss';
import { wauleApiClient } from '../wauleapi-client';

// ==================== 工具函数 ====================

/**
 * 处理参考图片URL
 * - Base64 → 上传 OSS → 返回 OSS URL
 * - 公网 URL → 直接返回
 */
async function processImageUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:image/')) {
    console.log('🔄 [MiniMax] 检测到 Base64，上传到 OSS 转为 URL...', imageUrl.length, '字符');
    try {
      const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'jpeg' ? '.jpg' : `.${matches[1]}`;
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const ossUrl = await uploadBuffer(buffer, ext);
        console.log('✅ [MiniMax] 已上传到 OSS:', ossUrl);
        return ossUrl;
      }
    } catch (e: any) {
      console.error('❌ [MiniMax] 上传到 OSS 失败:', e.message);
      throw new Error('图片上传失败，请重试');
    }
  }
  
  if (imageUrl.startsWith('https://') || imageUrl.startsWith('http://')) {
    return imageUrl;
  }
  
  throw new Error('不支持的图片格式');
}

// ==================== 接口定义 ====================

interface GenerateVideoOptions {
  prompt: string;
  modelId: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  referenceImages?: string[];
  generationType?: string;
  callbackUrl?: string;
  genTaskId?: string;
  apiKey?: string;
  apiUrl?: string;
}

// ==================== AI 服务函数 ====================

/**
 * MiniMax 视频生成
 * 返回值：视频 URL (已经是 OSS URL)
 */
export async function generateVideo(options: GenerateVideoOptions): Promise<string> {
  const {
    prompt,
    modelId,
    aspectRatio = '16:9',
    resolution = '1080P',
    duration = 5,
    referenceImages = [],
    generationType,
  } = options;

  // 处理参考图片
  const processedImages: string[] = [];
  for (const img of referenceImages) {
    if (img) {
      const processed = await processImageUrl(img);
      processedImages.push(processed);
    }
  }

  console.log('[MiniMax] 视频生成请求:', {
    model: modelId,
    duration,
    resolution,
    aspectRatio,
    refImages: processedImages.length,
    generationType,
  });

  try {
    console.log('[MiniMax] 调用 WauleAPI...');
    const result = await wauleApiClient.generateVideo({
      model: modelId,
      prompt,
      duration,
      resolution,
      aspect_ratio: aspectRatio,
      reference_images: processedImages.length > 0 ? processedImages : undefined,
    });

    console.log('[MiniMax] WauleAPI 响应:', JSON.stringify(result).substring(0, 500));

    if (!result.data || result.data.length === 0) {
      console.error('[MiniMax] WauleAPI 未返回数据:', result);
      throw new Error('WauleAPI 未返回视频数据');
    }

    const videoUrl = result.data[0].url;
    console.log('[MiniMax] 视频生成成功，返回URL:', videoUrl);
    return videoUrl;
  } catch (error: any) {
    console.error('[MiniMax] 视频生成失败:', error.response?.data || error.message);
    console.error('[MiniMax] 完整错误:', error);
    throw new Error(`MiniMax 视频生成失败: ${error.response?.data?.error?.message || error.message}`);
  }
}

export default { generateVideo };
