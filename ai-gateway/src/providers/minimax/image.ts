import { httpRequest } from '../../utils/http';
import { log } from '../../utils/logger';
import { getActiveApiKey, recordKeyUsage, addRequestLog } from '../../database';
import { downloadAndUpload } from '../../services/storage';

const BASE_URL = 'https://api.minimaxi.com/v1';

export interface ImageGenerationParams {
  model?: string;
  prompt: string;
  aspect_ratio?: string;
  n?: number;
  subject_reference?: Array<{ type: string; image_file?: string; image_files?: string[] }>;
}

export interface ImageGenerationResult {
  created: number;
  data: Array<{ url: string }>;
}

export async function generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
  const startTime = Date.now();
  const keyRecord = getActiveApiKey('minimax');
  if (!keyRecord) {
    throw new Error('No active API key for minimax');
  }

  try {
    log('minimax', 'Generating image', { model: params.model, prompt: params.prompt.slice(0, 50) });

    const requestBody: any = {
      model: params.model || 'image-01',
      prompt: params.prompt,
      aspect_ratio: params.aspect_ratio || '1:1',
      n: params.n || 1,
      response_format: 'url',
    };

    if (params.subject_reference?.length) {
      requestBody.subject_reference = params.subject_reference;
    }

    const response = await httpRequest<any>({
      method: 'POST',
      url: `${BASE_URL}/image_generation`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${keyRecord.api_key}`,
      },
      data: requestBody,
      timeout: 180000,
    });

    const results: Array<{ url: string }> = [];

    // 处理不同的响应格式
    if (response.data?.image_urls) {
      for (const url of response.data.image_urls) {
        const finalUrl = await downloadAndUpload(url, '.png', 'minimax');
        results.push({ url: finalUrl });
      }
    } else if (response.data?.file_id) {
      // 需要通过file_id获取URL
      const fileResponse = await httpRequest<any>({
        method: 'GET',
        url: `${BASE_URL}/files/retrieve?file_id=${response.data.file_id}`,
        headers: {
          'Authorization': `Bearer ${keyRecord.api_key}`,
        },
        timeout: 30000,
      });
      const finalUrl = await downloadAndUpload(fileResponse.file?.download_url, '.png', 'minimax');
      results.push({ url: finalUrl });
    }

    recordKeyUsage(keyRecord.id, true);
    addRequestLog('minimax', '/images/generations', params.model || 'image-01', 'success', Date.now() - startTime);

    return { created: Math.floor(Date.now() / 1000), data: results };
  } catch (error: any) {
    recordKeyUsage(keyRecord.id, false);
    addRequestLog('minimax', '/images/generations', params.model || 'image-01', 'error', Date.now() - startTime, error.message);
    throw error;
  }
}
