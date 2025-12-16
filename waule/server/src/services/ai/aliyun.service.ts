import axios from 'axios';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { downloadAndUploadToOss } from '../../utils/oss';
import { getGlobalWauleApiClient } from '../waule-api.client';

function toPublicUrlOrBase64(inputUrl: string): string {
  if (!inputUrl) return inputUrl;
  if (inputUrl.startsWith('data:')) return inputUrl;
  const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';
  if (inputUrl.startsWith('/uploads/')) {
    if (PUBLIC_BASE_URL) {
      const full = `${PUBLIC_BASE_URL}${inputUrl}`;
      return full;
    }
    try {
      const fullPath = path.join(process.cwd(), inputUrl);
      const buf = fs.readFileSync(fullPath);
      const ext = path.extname(fullPath).toLowerCase();
      const mimeMap: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
      const mime = mimeMap[ext] || 'image/jpeg';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      return inputUrl;
    }
  }
  if (inputUrl.startsWith('http://') || inputUrl.startsWith('https://')) {
    const lower = inputUrl.toLowerCase();
    if (lower.includes('localhost') || lower.includes('127.0.0.1')) {
      if (PUBLIC_BASE_URL && inputUrl.includes('/uploads/')) {
        const idx = inputUrl.indexOf('/uploads/');
        return `${PUBLIC_BASE_URL}${inputUrl.substring(idx)}`;
      }
      try {
        const urlObj = new URL(inputUrl);
        const fullPath = path.join(process.cwd(), urlObj.pathname);
        const buf = fs.readFileSync(fullPath);
        const ext = path.extname(fullPath).toLowerCase();
        const mimeMap: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
        const mime = mimeMap[ext] || 'image/jpeg';
        return `data:${mime};base64,${buf.toString('base64')}`;
      } catch {
        return inputUrl;
      }
    }
    return inputUrl;
  }
  return inputUrl;
}

interface QwenImageEditOptions {
  prompt: string;
  modelId: string;
  aspectRatio?: string;
  referenceImages?: string[];
  apiKey?: string;
  apiUrl?: string;
}

export async function generateImage(options: QwenImageEditOptions): Promise<string> {
  const {
    prompt,
    modelId,
    aspectRatio,
    referenceImages = [],
    apiKey,
    apiUrl,
  } = options;

  const API_KEY = apiKey || process.env.DASHSCOPE_API_KEY || process.env.ALIYUN_API_KEY;
  const DEFAULT_BASE = 'https://dashscope.aliyuncs.com/api/v1';
  const DEFAULT_INTL_BASE = 'https://dashscope-intl.aliyuncs.com/api/v1';
  const raw = (apiUrl || '').trim();
  const useIntl = raw.includes('dashscope-intl.aliyuncs.com');
  const base = useIntl ? DEFAULT_INTL_BASE : DEFAULT_BASE;
  const endpoint = /\/services\/aigc\//.test(raw) ? raw : `${base}/services/aigc/multimodal-generation/generation`;

  // 如果 apiKey 为空，使用 waule-api 网关
  if (!API_KEY) {
    const wauleApiClient = getGlobalWauleApiClient();
    if (wauleApiClient) {
      console.log('🌐 [Aliyun] apiKey 为空，使用 waule-api 网关生成图片');
      const r = await wauleApiClient.generateImage({
        model: modelId,
        prompt,
        size: aspectRatio,
        reference_images: referenceImages || undefined,
      });
      const imageUrl = r?.data?.[0]?.url;
      if (!imageUrl) throw new Error('waule-api 未返回图片数据');
      return imageUrl;
    }
    throw new Error('阿里云百炼 API 密钥未配置，且 waule-api 网关未配置');
  }

  try {
    const contentParts: any[] = [];
    const images = referenceImages.slice(0, 3).map(toPublicUrlOrBase64);
    for (const img of images) {
      contentParts.push({ image: img });
    }
    contentParts.push({ text: prompt });

    const requestBody: any = {
      model: modelId,
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

    if (aspectRatio) {
      const ratioToSize: Record<string, string> = {
        '16:9': '1664*928',
        '4:3': '1472*1140',
        '1:1': '1328*1328',
        '3:4': '1140*1472',
        '9:16': '928*1664',
      };
      const size = ratioToSize[aspectRatio];
      if (size && requestBody.parameters.n === 1) {
        requestBody.parameters.size = size;
      }
    }

    const response = await axios.post(endpoint, requestBody, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 180000,
    });

    const contents = response.data?.output?.choices?.[0]?.message?.content || [];
    const firstImageUrl: string | undefined = contents.find((c: any) => c.image)?.image;
    if (!firstImageUrl) {
      throw new Error('未返回图像URL');
    }

    try {
      const ossUrl = await downloadAndUploadToOss(firstImageUrl, 'qwen-edit');
      return ossUrl;
    } catch (e: any) {
      return firstImageUrl;
    }
  } catch (error: any) {
    if (error.response?.data) {
      const err = error.response.data;
      throw new Error(err.message || JSON.stringify(err));
    }
    throw new Error(error.message || '阿里云百炼图像编辑失败');
  }
}

export default {
  generateImage,
};