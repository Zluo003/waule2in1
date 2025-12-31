import { httpRequest, sleep } from '../../utils/http';
import { log } from '../../utils/logger';
import { getActiveApiKey, recordKeyUsage, addRequestLog } from '../../database';
import { downloadAndUpload } from '../../services/storage';

const BASE_URL = 'https://api.minimaxi.com/v1';

export interface VideoGenerationParams {
  model?: string;
  prompt: string;
  resolution?: string;
  first_frame_image?: string;
  last_frame_image?: string;
}

export interface VideoGenerationResult {
  created: number;
  data: Array<{ url: string }>;
}

export async function generateVideo(params: VideoGenerationParams): Promise<VideoGenerationResult> {
  const startTime = Date.now();
  const keyRecord = getActiveApiKey('minimax');
  if (!keyRecord) {
    throw new Error('No active API key for minimax');
  }

  try {
    log('minimax', 'Generating video', { model: params.model, prompt: params.prompt.slice(0, 50) });

    const requestBody: any = {
      model: params.model || 'video-01',
      prompt: params.prompt,
    };

    if (params.resolution) requestBody.resolution = params.resolution;
    if (params.first_frame_image) requestBody.first_frame_image = params.first_frame_image;
    if (params.last_frame_image) requestBody.last_frame_image = params.last_frame_image;

    // 创建任务
    const createResponse = await httpRequest<any>({
      method: 'POST',
      url: `${BASE_URL}/video_generation`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${keyRecord.api_key}`,
      },
      data: requestBody,
      timeout: 30000,
    });

    const taskId = createResponse.task_id;
    if (!taskId) {
      throw new Error('Failed to create video task');
    }

    log('minimax', 'Video task created', { taskId });

    // 轮询任务状态
    let fileId: string | null = null;
    for (let i = 0; i < 120; i++) {
      await sleep(5000);

      const statusResponse = await httpRequest<any>({
        method: 'GET',
        url: `${BASE_URL}/query/video_generation?task_id=${taskId}`,
        headers: {
          'Authorization': `Bearer ${keyRecord.api_key}`,
        },
        timeout: 30000,
      });

      const status = statusResponse.status;
      log('minimax', 'Video task status', { taskId, status });

      if (status === 'Success' || status === 'Finished') {
        fileId = statusResponse.file_id;
        break;
      } else if (status === 'Fail' || status === 'Failed') {
        throw new Error(statusResponse.base_resp?.status_msg || 'Video generation failed');
      }
    }

    if (!fileId) {
      throw new Error('Video generation timeout');
    }

    // 获取文件URL
    const fileResponse = await httpRequest<any>({
      method: 'GET',
      url: `${BASE_URL}/files/retrieve?file_id=${fileId}`,
      headers: {
        'Authorization': `Bearer ${keyRecord.api_key}`,
      },
      timeout: 30000,
    });

    const videoUrl = fileResponse.file?.download_url;
    if (!videoUrl) {
      throw new Error('No video URL in response');
    }

    const finalUrl = await downloadAndUpload(videoUrl, '.mp4', 'minimax');

    recordKeyUsage(keyRecord.id, true);
    addRequestLog('minimax', '/videos/generations', params.model || 'video-01', 'success', Date.now() - startTime);

    return { created: Math.floor(Date.now() / 1000), data: [{ url: finalUrl }] };
  } catch (error: any) {
    recordKeyUsage(keyRecord.id, false);
    addRequestLog('minimax', '/videos/generations', params.model || 'video-01', 'error', Date.now() - startTime, error.message);
    throw error;
  }
}
