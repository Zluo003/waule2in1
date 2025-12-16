/**
 * MiniMax/海螺 AI 图片生成服务 - 通过 WauleAPI 网关调用
 */

import { uploadBuffer } from '../../utils/oss';
import { wauleApiClient } from '../wauleapi-client';

// ==================== 工具函数 ====================

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

interface GenerateImageOptions {
  prompt: string;
  modelId: string;
  aspectRatio?: string;
  referenceImages?: string[];
  n?: number;
  apiKey?: string;
  apiUrl?: string;
}

// ==================== AI 服务函数 ====================

/**
 * MiniMax 图片生成
 * 返回值：图片 URL (已经是 OSS URL)
 */
export async function generateImage(options: GenerateImageOptions): Promise<string> {
  const {
    prompt,
    modelId,
    aspectRatio = '1:1',
    referenceImages = [],
    n = 1,
  } = options;

  // 处理参考图片
  const processedImages: string[] = [];
  for (const img of referenceImages) {
    if (img) {
      const processed = await processImageUrl(img);
      processedImages.push(processed);
    }
  }

  console.log('[MiniMax] 图片生成请求:', {
    model: modelId,
    aspectRatio,
    refImages: processedImages.length,
  });

  try {
    const result = await wauleApiClient.generateImage({
      model: modelId,
      prompt,
      size: aspectRatio,
      n,
      reference_images: processedImages.length > 0 ? processedImages : undefined,
    });

    if (!result.data || result.data.length === 0) {
      throw new Error('WauleAPI 未返回图片数据');
    }

    const imageUrl = result.data[0].url;
    console.log('[MiniMax] 图片生成成功:', imageUrl);
    return imageUrl;
  } catch (error: any) {
    console.error('[MiniMax] 图片生成失败:', error.response?.data || error.message);
    throw new Error(`MiniMax 图片生成失败: ${error.response?.data?.error?.message || error.message}`);
  }
}

export default { generateImage };
