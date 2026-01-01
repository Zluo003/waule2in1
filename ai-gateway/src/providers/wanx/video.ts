import { httpRequest, sleep } from '../../utils/http';
import { log } from '../../utils/logger';
import { getActiveApiKey, recordKeyUsage, addRequestLog } from '../../database';
import { downloadAndUpload } from '../../services/storage';

const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/api/v1';
const DASHSCOPE_INTL_API_URL = 'https://dashscope-intl.aliyuncs.com/api/v1';

export interface VideoGenerationParams {
  model?: string;
  prompt?: string;
  duration?: number;
  resolution?: string;
  aspect_ratio?: string;
  reference_images?: string[];
  first_frame_image?: string;
  use_intl?: boolean;
  // 视频换人参数
  replace_image_url?: string;
  replace_video_url?: string;
  mode?: string;
}

export interface VideoGenerationResult {
  created: number;
  data: Array<{ url: string; duration?: number }>;
}

export interface RetalkParams {
  video_url: string;
  audio_url: string;
  ref_image_url?: string;
  video_extension?: boolean;
  use_intl?: boolean;
}

export interface VideoStylizeParams {
  video_url: string;
  style?: number;
  video_fps?: number;
  min_len?: number;
  use_intl?: boolean;
}

async function pollTask(taskId: string, baseUrl: string, apiKey: string, type: 'image' | 'video'): Promise<string> {
  const maxAttempts = type === 'video' ? 180 : 60;
  const interval = type === 'video' ? 5000 : 2000;

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(interval);

    const response = await httpRequest<any>({
      method: 'GET',
      url: `${baseUrl}/tasks/${taskId}`,
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout: 30000,
    });

    const status = response.output?.task_status;
    log('wanx', `Poll ${i + 1}/${maxAttempts}: ${status}`, { taskId });

    if (status === 'SUCCEEDED') {
      log('wanx', 'Task succeeded', { response: JSON.stringify(response).substring(0, 500) });

      if (type === 'image') {
        const results = response.output?.results;
        if (results && results.length > 0) return results[0].url;
      }

      // 视频结果 - 尝试多种路径
      let videoUrl = response.output?.video_url
        || response.output?.results?.video_url
        || response.output?.results?.[0]?.video_url
        || response.output?.results?.[0]?.url;

      if (videoUrl) return videoUrl;

      // 尝试从完整响应中提取
      const str = JSON.stringify(response);
      const m = str.match(/https?:\/\/[^"'\s]+\.mp4(?:\?[^"'\s}]+)?/i);
      if (m) return m[0];

      throw new Error('Response missing result URL');
    }

    if (status === 'FAILED') {
      throw new Error(response.output?.message || 'Task failed');
    }
  }

  throw new Error(`Task timeout after ${maxAttempts} attempts`);
}

export async function generateVideo(params: VideoGenerationParams): Promise<VideoGenerationResult> {
  const startTime = Date.now();
  const keyRecord = getActiveApiKey('wanx');
  if (!keyRecord) {
    throw new Error('No active API key for wanx');
  }

  const baseUrl = params.use_intl ? DASHSCOPE_INTL_API_URL : DASHSCOPE_API_URL;
  const model = params.model || 'wanx-video-synthesis';

  try {
    // 判断是视频换人模式还是普通视频生成
    const isAnimateModel = model.includes('animate-mix') || model.includes('animate-move');

    log('wanx', 'Video params', {
      model,
      isAnimateModel,
      hasReplaceImage: !!params.replace_image_url,
      hasReplaceVideo: !!params.replace_video_url,
      prompt: params.prompt?.slice(0, 50),
    });

    let requestBody: any;
    let endpoint: string;

    if (isAnimateModel && params.replace_image_url && params.replace_video_url) {
      // 视频换人模式
      requestBody = {
        model: model,
        input: {
          image_url: params.replace_image_url,
          video_url: params.replace_video_url,
        },
        parameters: { mode: params.mode || 'wan-std' },
      };
      endpoint = `${baseUrl}/services/aigc/image2video/video-synthesis`;
    } else {
      // 普通视频生成
      requestBody = {
        model: model,
        input: {},
        parameters: {
          duration: params.duration || 5,
          resolution: params.resolution || '720P',
        },
      };
      endpoint = `${baseUrl}/services/aigc/video-synthesis/video-generation`;

      if (params.prompt) requestBody.input.prompt = params.prompt;
      if (params.first_frame_image) requestBody.input.img_url = params.first_frame_image;
      if (params.reference_images?.length) requestBody.input.img_url = params.reference_images[0];
    }

    log('wanx', 'Generating video', { model, endpoint, requestBody: JSON.stringify(requestBody).slice(0, 500) });

    const response = await httpRequest<any>({
      method: 'POST',
      url: endpoint,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${keyRecord.api_key}`,
        'X-DashScope-Async': 'enable',
        'X-DashScope-OssResourceResolve': 'enable',
      },
      data: requestBody,
      timeout: 30000,
    });

    const taskId = response.output?.task_id;
    if (!taskId) {
      throw new Error('Failed to create video task');
    }

    log('wanx', 'Video task created', { taskId });

    const videoUrl = await pollTask(taskId, baseUrl, keyRecord.api_key, 'video');
    // 国内模型：使用 apikey 的 storage_type
    const finalUrl = keyRecord.storage_type === 'oss'
      ? await downloadAndUpload(videoUrl, '.mp4', 'wanx')
      : videoUrl;

    recordKeyUsage(keyRecord.id, true);
    addRequestLog('wanx', '/videos/generations', model, 'success', Date.now() - startTime);

    return { created: Math.floor(Date.now() / 1000), data: [{ url: finalUrl }] };
  } catch (error: any) {
    recordKeyUsage(keyRecord.id, false);
    addRequestLog('wanx', '/videos/generations', model, 'error', Date.now() - startTime, error.message);
    throw error;
  }
}

export async function retalkVideo(params: RetalkParams): Promise<VideoGenerationResult> {
  const startTime = Date.now();
  const keyRecord = getActiveApiKey('wanx');
  if (!keyRecord) {
    throw new Error('No active API key for wanx');
  }

  const baseUrl = params.use_intl ? DASHSCOPE_INTL_API_URL : DASHSCOPE_API_URL;

  try {
    log('wanx', 'Retalk video', { videoUrl: params.video_url?.substring(0, 50) });

    const requestBody: any = {
      model: 'videoretalk',
      input: {
        video_url: params.video_url,
        audio_url: params.audio_url,
      },
      parameters: {},
    };

    if (params.ref_image_url) requestBody.input.ref_image_url = params.ref_image_url;
    if (typeof params.video_extension === 'boolean') requestBody.parameters.video_extension = params.video_extension;

    const response = await httpRequest<any>({
      method: 'POST',
      url: `${baseUrl}/services/aigc/image2video/video-synthesis`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${keyRecord.api_key}`,
        'X-DashScope-Async': 'enable',
        'X-DashScope-OssResourceResolve': 'enable',
      },
      data: requestBody,
      timeout: 30000,
    });

    const taskId = response.output?.task_id;
    if (!taskId) {
      throw new Error('Failed to create retalk task');
    }

    log('wanx', 'Retalk task created', { taskId });

    const videoUrl = await pollTask(taskId, baseUrl, keyRecord.api_key, 'video');
    // 国内模型：使用 apikey 的 storage_type
    const finalUrl = keyRecord.storage_type === 'oss'
      ? await downloadAndUpload(videoUrl, '.mp4', 'wanx')
      : videoUrl;

    recordKeyUsage(keyRecord.id, true);
    addRequestLog('wanx', '/videos/retalk', 'videoretalk', 'success', Date.now() - startTime);

    return { created: Math.floor(Date.now() / 1000), data: [{ url: finalUrl }] };
  } catch (error: any) {
    recordKeyUsage(keyRecord.id, false);
    addRequestLog('wanx', '/videos/retalk', 'videoretalk', 'error', Date.now() - startTime, error.message);
    throw error;
  }
}

export async function stylizeVideo(params: VideoStylizeParams): Promise<VideoGenerationResult> {
  const startTime = Date.now();
  const keyRecord = getActiveApiKey('wanx');
  if (!keyRecord) {
    throw new Error('No active API key for wanx');
  }

  const baseUrl = params.use_intl ? DASHSCOPE_INTL_API_URL : DASHSCOPE_API_URL;

  try {
    log('wanx', 'Stylize video', { videoUrl: params.video_url?.substring(0, 50) });

    const requestBody: any = {
      model: 'video-style-transform',
      input: { video_url: params.video_url },
      parameters: {},
    };

    if (typeof params.style === 'number') requestBody.parameters.style = params.style;
    if (typeof params.video_fps === 'number') requestBody.parameters.video_fps = params.video_fps;
    if (typeof params.min_len === 'number') requestBody.parameters.min_len = params.min_len;

    const response = await httpRequest<any>({
      method: 'POST',
      url: `${baseUrl}/services/aigc/video-generation/video-synthesis`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${keyRecord.api_key}`,
        'X-DashScope-Async': 'enable',
        'X-DashScope-OssResourceResolve': 'enable',
      },
      data: requestBody,
      timeout: 60000,
    });

    const taskId = response.output?.task_id;
    if (!taskId) {
      throw new Error('Failed to create stylize task');
    }

    log('wanx', 'Stylize task created', { taskId });

    const videoUrl = await pollTask(taskId, baseUrl, keyRecord.api_key, 'video');
    // 国内模型：使用 apikey 的 storage_type
    const finalUrl = keyRecord.storage_type === 'oss'
      ? await downloadAndUpload(videoUrl, '.mp4', 'wanx')
      : videoUrl;

    recordKeyUsage(keyRecord.id, true);
    addRequestLog('wanx', '/videos/stylize', 'video-style-transform', 'success', Date.now() - startTime);

    return { created: Math.floor(Date.now() / 1000), data: [{ url: finalUrl }] };
  } catch (error: any) {
    recordKeyUsage(keyRecord.id, false);
    addRequestLog('wanx', '/videos/stylize', 'video-style-transform', 'error', Date.now() - startTime, error.message);
    throw error;
  }
}
