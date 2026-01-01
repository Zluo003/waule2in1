import { httpRequest, sleep } from '../../utils/http';
import { log } from '../../utils/logger';
import { getActiveApiKey, recordKeyUsage, addRequestLog } from '../../database';
import { downloadAndUpload } from '../../services/storage';

const BASE_URL = 'https://api.vidu.cn/ent/v2';

export interface VideoGenerationParams {
  model?: string;
  prompt?: string;
  duration?: number;
  resolution?: string;
  aspect_ratio?: string;
  reference_images?: string[];
  first_frame_image?: string;
  last_frame_image?: string;
  subjects?: Array<{ id: string; images: string[]; voice_id?: string }>;
  audio?: boolean;
  voice_id?: string;
  bgm?: boolean;
  movement_amplitude?: string;
}

export interface VideoGenerationResult {
  created: number;
  data: Array<{ url: string; duration?: number }>;
}

async function createTask(keyRecord: any, endpoint: string, body: any): Promise<string> {
  try {
    const response = await httpRequest<any>({
      method: 'POST',
      url: `${BASE_URL}/${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${keyRecord.api_key}`,
      },
      data: body,
      timeout: 30000,
    });

    if (!response.task_id) {
      throw new Error('Failed to create task: ' + JSON.stringify(response));
    }
    return response.task_id;
  } catch (error: any) {
    // 提取 Vidu API 的详细错误信息
    const errData = error.response?.data;
    const errMsg = errData?.error?.message || errData?.message || errData?.error || error.message;
    log('vidu', 'Create task failed', { endpoint, error: errMsg, response: JSON.stringify(errData || {}).slice(0, 500) });
    throw new Error(`Vidu API error: ${errMsg}`);
  }
}

async function waitForTask(keyRecord: any, taskId: string): Promise<string> {
  for (let i = 0; i < 120; i++) {
    await sleep(10000);

    const response = await httpRequest<any>({
      method: 'GET',
      url: `${BASE_URL}/tasks/${taskId}/creations`,
      headers: {
        'Authorization': `Token ${keyRecord.api_key}`,
      },
      timeout: 30000,
    });

    const state = (response.state || response.status || '').toLowerCase();
    log('vidu', 'Task status', { taskId, state, attempt: i + 1 });

    if (['success', 'succeeded', 'completed', 'finished'].includes(state)) {
      // 从 creations 数组获取视频 URL
      let videoUrl = response.creations?.[0]?.url
        || response.video_url
        || response.url
        || response.result_url;

      if (!videoUrl) {
        // 尝试从完整响应中提取
        const str = JSON.stringify(response);
        const m = str.match(/https?:\/\/[^"'\s]+\.mp4(?:\?[^"'\s}]+)?/i);
        if (m) videoUrl = m[0];
      }

      if (!videoUrl) {
        log('vidu', 'Task succeeded but no URL found', { response: JSON.stringify(response).substring(0, 300) });
        throw new Error('No video URL in response');
      }
      return videoUrl;
    } else if (['failed', 'failure', 'error'].includes(state)) {
      throw new Error(response.error || response.err_code || response.message || 'Video generation failed');
    }
  }
  throw new Error('Video generation timeout');
}

export async function generateVideo(params: VideoGenerationParams): Promise<VideoGenerationResult> {
  const startTime = Date.now();
  const keyRecord = getActiveApiKey('vidu');
  if (!keyRecord) {
    throw new Error('No active API key for vidu');
  }

  try {
    log('vidu', 'Generating video', {
      model: params.model,
      prompt: params.prompt?.slice(0, 50),
      reference_images: params.reference_images?.length,
      first_frame_image: !!params.first_frame_image,
      subjects: params.subjects?.length,
    });

    let endpoint: string;
    let body: any = {
      model: params.model || 'vidu-q2',
      duration: params.duration || 4,
      resolution: (params.resolution || '720p').toLowerCase(),
      aspect_ratio: params.aspect_ratio || '16:9',
    };

    // movement_amplitude 参数
    if (params.movement_amplitude) {
      body.movement_amplitude = params.movement_amplitude;
    }

    // prompt 参数（reference2video 端点必填）
    body.prompt = params.prompt || '';
    if (params.audio === true) body.audio = true;
    if (params.bgm === true) body.bgm = true;

    // 判断生成类型
    if (params.subjects?.length) {
      endpoint = 'reference2video';
      body.subjects = params.subjects;
    } else if (params.audio === true && (params.first_frame_image || params.reference_images?.length)) {
      // 音视频直出但没有 subjects：从 images 创建默认 subject
      endpoint = 'reference2video';
      const images = params.first_frame_image ? [params.first_frame_image] : params.reference_images;
      body.subjects = [{ id: '1', images, voice_id: params.voice_id || '' }];
    } else if ((params.first_frame_image && params.last_frame_image) || params.reference_images?.length === 2) {
      // 首尾帧模式：2张图片
      endpoint = 'start-end2video';
      body.images = (params.first_frame_image && params.last_frame_image)
        ? [params.first_frame_image, params.last_frame_image]
        : params.reference_images;
    } else if (params.first_frame_image || params.reference_images?.length === 1) {
      // 图生视频：1张图片
      endpoint = 'img2video';
      body.images = params.first_frame_image ? [params.first_frame_image] : params.reference_images;
    } else {
      endpoint = 'text2video';
    }

    log('vidu', 'Request body', { endpoint, body: JSON.stringify(body).slice(0, 500) });

    const taskId = await createTask(keyRecord, endpoint, body);
    log('vidu', 'Task created', { taskId, endpoint });

    const videoUrl = await waitForTask(keyRecord, taskId);
    const finalUrl = await downloadAndUpload(videoUrl, '.mp4', 'vidu');

    recordKeyUsage(keyRecord.id, true);
    addRequestLog('vidu', `/videos/generations`, params.model || 'vidu-q2', 'success', Date.now() - startTime);

    return { created: Math.floor(Date.now() / 1000), data: [{ url: finalUrl, duration: params.duration }] };
  } catch (error: any) {
    recordKeyUsage(keyRecord.id, false);
    addRequestLog('vidu', `/videos/generations`, params.model || 'vidu-q2', 'error', Date.now() - startTime, error.message);
    throw error;
  }
}

export interface UpscaleParams {
  video_url?: string;
  video_creation_id?: string;
  upscale_resolution?: string;
}

export async function upscaleVideo(params: UpscaleParams): Promise<VideoGenerationResult> {
  const startTime = Date.now();
  const keyRecord = getActiveApiKey('vidu');
  if (!keyRecord) {
    throw new Error('No active API key for vidu');
  }

  try {
    log('vidu', 'Upscaling video', params);

    const body: any = {
      model: 'stable',
      upscale_resolution: params.upscale_resolution || '1080p',
    };

    if (params.video_url) body.url = params.video_url;
    if (params.video_creation_id) body.creation_id = params.video_creation_id;

    const taskId = await createTask(keyRecord, 'upscale-new', body);
    const videoUrl = await waitForTask(keyRecord, taskId);
    const finalUrl = await downloadAndUpload(videoUrl, '.mp4', 'vidu');

    recordKeyUsage(keyRecord.id, true);
    addRequestLog('vidu', '/videos/upscale', 'upscale', 'success', Date.now() - startTime);

    return { created: Math.floor(Date.now() / 1000), data: [{ url: finalUrl }] };
  } catch (error: any) {
    recordKeyUsage(keyRecord.id, false);
    addRequestLog('vidu', '/videos/upscale', 'upscale', 'error', Date.now() - startTime, error.message);
    throw error;
  }
}

export interface CommercialVideoParams {
  images: string[];
  prompt?: string;
  duration?: number;
  aspect_ratio?: string;
  language?: string;
}

export async function createCommercialVideo(params: CommercialVideoParams): Promise<VideoGenerationResult> {
  const startTime = Date.now();
  const keyRecord = getActiveApiKey('vidu');
  if (!keyRecord) {
    throw new Error('No active API key for vidu');
  }

  try {
    log('vidu', 'Creating commercial video', { imageCount: params.images.length });

    const body = {
      images: params.images,
      prompt: params.prompt,
      duration: params.duration || 15,
      aspect_ratio: params.aspect_ratio || '16:9',
      language: params.language || 'zh',
    };

    const taskId = await createTask(keyRecord, 'ad-one-click', body);
    const videoUrl = await waitForTask(keyRecord, taskId);
    const finalUrl = await downloadAndUpload(videoUrl, '.mp4', 'vidu');

    recordKeyUsage(keyRecord.id, true);
    addRequestLog('vidu', '/videos/commercial', 'commercial', 'success', Date.now() - startTime);

    return { created: Math.floor(Date.now() / 1000), data: [{ url: finalUrl }] };
  } catch (error: any) {
    recordKeyUsage(keyRecord.id, false);
    addRequestLog('vidu', '/videos/commercial', 'commercial', 'error', Date.now() - startTime, error.message);
    throw error;
  }
}
