import { httpRequest, sleep } from '../../utils/http';
import { log } from '../../utils/logger';
import { getActiveApiKey, recordKeyUsage, addRequestLog } from '../../database';
import { downloadAndUpload } from '../../services/storage';

const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/api/v1';
const DASHSCOPE_INTL_API_URL = 'https://dashscope-intl.aliyuncs.com/api/v1';

export interface ImageGenerationParams {
  model?: string;
  prompt: string;
  size?: string;
  n?: number;
  reference_images?: string[];
  use_intl?: boolean;
}

export interface ImageGenerationResult {
  created: number;
  data: Array<{ url: string; revised_prompt?: string }>;
}

async function pollTask(taskId: string, baseUrl: string, apiKey: string): Promise<string> {
  for (let i = 0; i < 60; i++) {
    await sleep(2000);

    const response = await httpRequest<any>({
      method: 'GET',
      url: `${baseUrl}/tasks/${taskId}`,
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout: 10000,
    });

    const status = response.output?.task_status;
    log('wanx', 'Task status', { taskId, status, attempt: i + 1 });

    if (status === 'SUCCEEDED') {
      const results = response.output?.results;
      if (results && results.length > 0) {
        return results[0].url;
      }
      throw new Error('Response missing result URL');
    }

    if (status === 'FAILED') {
      throw new Error(response.output?.message || 'Task failed');
    }
  }
  throw new Error('Task timeout');
}

export async function generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
  const startTime = Date.now();
  const keyRecord = getActiveApiKey('wanx');
  if (!keyRecord) {
    throw new Error('No active API key for wanx');
  }

  const baseUrl = params.use_intl ? DASHSCOPE_INTL_API_URL : DASHSCOPE_API_URL;

  try {
    log('wanx', 'Generating image', { model: params.model, prompt: params.prompt.slice(0, 50) });

    // 根据模型选择正确的模型名称
    let modelName = params.model || 'wanx-v1';
    if (params.model?.includes('sketch')) {
      modelName = 'wanx-sketch-to-image-v1';
    }

    const requestBody: any = {
      model: modelName,
      input: { prompt: params.prompt },
      parameters: { size: params.size || '1024*1024', n: params.n || 1 },
    };

    if (params.reference_images?.length) {
      requestBody.input.ref_img = params.reference_images[0];
    }

    const response = await httpRequest<any>({
      method: 'POST',
      url: `${baseUrl}/services/aigc/text2image/image-synthesis`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${keyRecord.api_key}`,
        'X-DashScope-Async': 'enable',
      },
      data: requestBody,
      timeout: 30000,
    });

    const taskId = response.output?.task_id;
    if (!taskId) {
      throw new Error('No task_id in response');
    }

    log('wanx', 'Task created', { taskId });

    const imageUrl = await pollTask(taskId, baseUrl, keyRecord.api_key);
    // 国内模型：使用 apikey 的 storage_type
    const finalUrl = keyRecord.storage_type === 'oss'
      ? await downloadAndUpload(imageUrl, '.png', 'wanx')
      : imageUrl;

    recordKeyUsage(keyRecord.id, true);
    addRequestLog('wanx', '/images/generations', modelName, 'success', Date.now() - startTime);

    return { created: Math.floor(Date.now() / 1000), data: [{ url: finalUrl }] };
  } catch (error: any) {
    recordKeyUsage(keyRecord.id, false);
    addRequestLog('wanx', '/images/generations', params.model || 'wanx-v1', 'error', Date.now() - startTime, error.message);
    throw error;
  }
}
