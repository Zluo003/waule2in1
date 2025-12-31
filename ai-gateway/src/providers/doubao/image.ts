import { httpRequest } from '../../utils/http';
import { log } from '../../utils/logger';
import { getActiveApiKey, recordKeyUsage, addRequestLog } from '../../database';
import { downloadAndUpload } from '../../services/storage';

const BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

// 宽高比转像素尺寸（与 waule-api 保持一致）
function convertAspectRatio(ratio?: string): string {
  const mapping: Record<string, string> = {
    '1:1': '4096x4096',
    '16:9': '3840x2160',
    '9:16': '2160x3840',
    '4:3': '4096x3072',
    '3:4': '3072x4096',
    '5:4': '4096x3276',
    '4:5': '3276x4096',
    '21:9': '3440x1440',
    '3:2': '4096x2730',
    '2:3': '2730x4096',
  };
  if (!ratio) return '4096x4096';
  // 如果已经是像素格式，直接返回
  if (/^\d+x\d+$/.test(ratio)) return ratio;
  return mapping[ratio] || '4096x4096';
}

export interface ImageGenerationParams {
  model: string;
  prompt: string;
  size?: string;
  n?: number;
  reference_images?: string[];
  max_images?: number; // SeeDream 4.5 组图数量 (1-15)
}

export interface ImageGenerationResult {
  created: number;
  data: Array<{ url: string; revised_prompt?: string }>;
}

export async function generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
  const startTime = Date.now();
  const keyRecord = getActiveApiKey('doubao');
  if (!keyRecord) {
    throw new Error('No active API key for doubao');
  }

  try {
    log('doubao', 'Generating image', { model: params.model, prompt: params.prompt.slice(0, 50), maxImages: params.max_images });

    const requestBody: any = {
      model: params.model || 'doubao-seedream-4-5-251128',
      prompt: params.prompt,
      size: convertAspectRatio(params.size),
      n: params.n || 1,
      watermark: false, // 关闭水印
      response_format: 'url',
    };

    // SeeDream 4.5 组图功能 (doubao-seedream-4-5-251128)
    const isSeeDream45 = params.model === 'doubao-seedream-4-5-251128';
    if (isSeeDream45 && params.max_images && params.max_images > 1) {
      requestBody.sequential_image_generation = 'auto';
      requestBody.sequential_image_generation_options = {
        max_images: Math.min(Math.max(params.max_images, 1), 15), // 限制在 1-15 之间
      };
      requestBody.stream = false;
      log('doubao', 'Sequential image generation enabled', { max_images: params.max_images });
    }

    if (params.reference_images?.length) {
      requestBody.image = params.reference_images;
    }

    const response = await httpRequest<any>({
      method: 'POST',
      url: `${BASE_URL}/images/generations`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${keyRecord.api_key}`,
      },
      data: requestBody,
      timeout: 600000, // 10分钟超时，组图生成需要更长时间
    });

    const results: Array<{ url: string; revised_prompt?: string }> = [];
    for (const item of response.data || []) {
      // 优先使用 AI 服务返回的 URL（豆包 CDN），不再重复上传
      const url = item.url || await downloadAndUpload(item.b64_json, '.png', 'doubao');
      results.push({ url, revised_prompt: item.revised_prompt });
    }

    recordKeyUsage(keyRecord.id, true);
    addRequestLog('doubao', '/images/generations', params.model, 'success', Date.now() - startTime);

    return { created: Math.floor(Date.now() / 1000), data: results };
  } catch (error: any) {
    recordKeyUsage(keyRecord.id, false);
    addRequestLog('doubao', '/images/generations', params.model, 'error', Date.now() - startTime, error.message);
    throw error;
  }
}
