/**
 * 阿里云百炼 AI 服务 - 通过 WauleAPI 网关调用
 * 
 * 改造说明：
 * - 图片生成改为调用 wauleapi 的 v1 统一接口
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
    console.log('🔄 [Aliyun] 检测到 Base64，上传到 OSS 转为 URL...', imageUrl.length, '字符');
    try {
      const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'jpeg' ? '.jpg' : `.${matches[1]}`;
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const ossUrl = await uploadBuffer(buffer, ext);
        console.log('✅ [Aliyun] 已上传到 OSS:', ossUrl);
        return ossUrl;
      }
    } catch (e: any) {
      console.error('❌ [Aliyun] 上传到 OSS 失败:', e.message);
      throw new Error('图片上传失败，请重试');
    }
  }
  
  if (imageUrl.startsWith('https://') || imageUrl.startsWith('http://')) {
    return imageUrl;
  }
  
  throw new Error('不支持的图片格式');
}

// ==================== 接口定义 ====================

interface QwenImageEditOptions {
  prompt: string;
  modelId: string;
  aspectRatio?: string;
  referenceImages?: string[];
  useIntl?: boolean;
  apiKey?: string;
  apiUrl?: string;
}

// ==================== AI 服务函数 ====================

/**
 * 阿里云百炼图像编辑（Qwen-VL）
 * 返回值：图片 URL (已经是 OSS URL)
 */
export async function generateImage(options: QwenImageEditOptions): Promise<string> {
  const {
    prompt,
    modelId,
    aspectRatio = '1:1',
    referenceImages = [],
    useIntl = false,
  } = options;

  // 处理参考图片（base64 → OSS URL）
  const processedImages: string[] = [];
  for (const img of referenceImages.slice(0, 3)) {
    const processedUrl = await processImageUrl(img);
    processedImages.push(processedUrl);
  }

  console.log('[Aliyun] 图像编辑请求:', {
    model: modelId,
    aspectRatio,
    prompt: prompt.substring(0, 100),
    referenceImagesCount: processedImages.length,
  });

  try {
    const result = await wauleApiClient.generateImage({
      model: modelId,
      prompt,
      size: aspectRatio,
      reference_images: processedImages.length > 0 ? processedImages : undefined,
      use_intl: useIntl,
    });

    if (!result.data || result.data.length === 0) {
      throw new Error('WauleAPI 未返回图片数据');
    }

    const imageUrl = result.data[0].url;
    console.log('[Aliyun] 图像编辑成功:', imageUrl);
    return imageUrl;
  } catch (error: any) {
    console.error('[Aliyun] 图像编辑失败:', error.response?.data || error.message);
    throw new Error(`阿里云图像编辑失败: ${error.response?.data?.error?.message || error.message}`);
  }
}

export default {
  generateImage,
};