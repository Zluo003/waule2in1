/**
 * Qwen (通义千问) Provider
 * 阿里云百炼图像编辑服务
 */

import axios from 'axios';
import { uploadBuffer, downloadAndUploadToOss } from '../oss';
import { log, getApiKey, recordKeyUsage } from './utils';

const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/api/v1';
const DASHSCOPE_INTL_API_URL = 'https://dashscope-intl.aliyuncs.com/api/v1';

export interface QwenImageOptions {
  model: string;
  prompt: string;
  size?: string;
  referenceImages?: string[];
  useIntl?: boolean;
}

// 处理图片：base64 转 OSS URL
async function processImage(img: string): Promise<string> {
  if (img.startsWith('data:')) {
    const matches = img.match(/^data:image\/(\w+);base64,(.+)$/);
    if (matches) {
      const ext = matches[1] === 'jpeg' ? '.jpg' : `.${matches[1]}`;
      const buffer = Buffer.from(matches[2], 'base64');
      return await uploadBuffer(buffer, ext, 'qwen');
    }
  }
  return img;
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

// 图像编辑生成
export async function generateImage(options: QwenImageOptions): Promise<{
  url: string;
  revisedPrompt?: string;
}> {
  const { model, prompt, size, referenceImages, useIntl } = options;
  const { key: API_KEY, keyId } = getApiKey('alibaba', 'DASHSCOPE_API_KEY');
  const baseUrl = useIntl ? DASHSCOPE_INTL_API_URL : DASHSCOPE_API_URL;
  
  log('Qwen', `图像编辑: model=${model}, size=${size}, refImages=${referenceImages?.length || 0}`);
  
  // 构建 content 数组
  const contentParts: any[] = [];
  
  // 处理参考图片（最多3张）
  if (referenceImages && referenceImages.length > 0) {
    for (const img of referenceImages.slice(0, 3)) {
      const processedImg = await processImage(img);
      contentParts.push({ image: processedImg });
    }
  }
  
  // 添加文本提示
  contentParts.push({ text: prompt });
  
  const requestBody: any = {
    model: model || 'qwen-vl-max',
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
  if (size) {
    const sizeValue = convertAspectRatio(size);
    if (sizeValue) {
      requestBody.parameters.size = sizeValue;
    }
  }
  
  try {
    const response = await axios.post(
      `${baseUrl}/services/aigc/multimodal-generation/generation`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 180000,
      }
    );
    
    // 提取图片URL
    const contents = response.data?.output?.choices?.[0]?.message?.content || [];
    const firstImageUrl: string | undefined = contents.find((c: any) => c.image)?.image;
    
    if (!firstImageUrl) {
      throw new Error('No image URL in response');
    }
    
    recordKeyUsage(keyId, true);
    
    // 直接使用阿里云返回的 URL，不再上传 OSS
    log('Qwen', `图像编辑成功: ${firstImageUrl.substring(0, 80)}...`);
    return { url: firstImageUrl };
    
  } catch (error: any) {
    recordKeyUsage(keyId, false, error.message);
    log('Qwen', `图像编辑失败: ${error.message}`);
    throw new Error(`Qwen image generation failed: ${error.response?.data?.message || error.message}`);
  }
}
