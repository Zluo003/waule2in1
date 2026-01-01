/**
 * Qwen (通义千问) Provider
 * 阿里云百炼图像编辑服务
 */

import { httpRequest } from '../../utils/http';
import { log } from '../../utils/logger';
import { getActiveApiKey, recordKeyUsage, addRequestLog } from '../../database';
import { downloadAndUpload } from '../../services/storage';

const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/api/v1';
const DASHSCOPE_INTL_API_URL = 'https://dashscope-intl.aliyuncs.com/api/v1';

export interface QwenImageParams {
  model?: string;
  prompt: string;
  size?: string;
  n?: number;
  reference_images?: string[];
  use_intl?: boolean;
}

export interface QwenImageResult {
  created: number;
  data: Array<{ url: string; revised_prompt?: string }>;
}

// 宽高比转尺寸
function convertAspectRatio(ratio: string): string | undefined {
  const ratioToSize: Record<string, string> = {
    '16:9': '1664*928',
    '4:3': '1472*1140',
    '1:1': '1328*1328',
    '3:4': '1140*1472',
    '9:16': '928*1664',
  };
  return ratioToSize[ratio];
}

export async function generateImage(params: QwenImageParams): Promise<QwenImageResult> {
  const startTime = Date.now();
  // Qwen 使用 wanx 的 API Key（都是阿里云 DashScope）
  const keyRecord = getActiveApiKey('wanx');
  if (!keyRecord) {
    throw new Error('No active API key for wanx (alibaba)');
  }

  const baseUrl = params.use_intl ? DASHSCOPE_INTL_API_URL : DASHSCOPE_API_URL;
  const modelName = params.model || 'qwen-vl-max';

  // qwen-image-edit-plus 是图像编辑模型，必须提供参考图片
  if (modelName.includes('image-edit') && (!params.reference_images || params.reference_images.length === 0)) {
    throw new Error('qwen-image-edit models require 1-3 reference images for editing');
  }

  try {
    log('qwen', 'Generating image', { model: modelName, prompt: params.prompt.slice(0, 50) });

    // 构建 content 数组
    const contentParts: any[] = [];

    // 处理参考图片（最多3张）
    if (params.reference_images && params.reference_images.length > 0) {
      for (const img of params.reference_images.slice(0, 3)) {
        contentParts.push({ image: img });
      }
    }

    // 添加文本提示
    contentParts.push({ text: params.prompt });

    const requestBody: any = {
      model: modelName,
      input: {
        messages: [
          {
            role: 'user',
            content: contentParts,
          },
        ],
      },
      parameters: {
        n: 1,
        negative_prompt: ' ',
        prompt_extend: true,
        watermark: false,
      },
    };

    // 设置尺寸
    if (params.size) {
      const sizeValue = convertAspectRatio(params.size);
      if (sizeValue) {
        requestBody.parameters.size = sizeValue;
      }
    }

    const response = await httpRequest<any>({
      method: 'POST',
      url: `${baseUrl}/services/aigc/multimodal-generation/generation`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${keyRecord.api_key}`,
      },
      data: requestBody,
      timeout: 180000,
    });

    // 提取图片URL
    const contents = response?.output?.choices?.[0]?.message?.content || [];
    const firstImageUrl: string | undefined = contents.find((c: any) => c.image)?.image;

    if (!firstImageUrl) {
      throw new Error('No image URL in response');
    }

    // 国内模型：使用 apikey 的 storage_type
    const finalUrl = keyRecord.storage_type === 'oss'
      ? await downloadAndUpload(firstImageUrl, '.png', 'wanx')
      : firstImageUrl;

    recordKeyUsage(keyRecord.id, true);
    addRequestLog('qwen', '/images/generations', modelName, 'success', Date.now() - startTime);

    return { created: Math.floor(Date.now() / 1000), data: [{ url: finalUrl }] };
  } catch (error: any) {
    recordKeyUsage(keyRecord.id, false);
    addRequestLog('qwen', '/images/generations', modelName, 'error', Date.now() - startTime, error.message);
    throw error;
  }
}
