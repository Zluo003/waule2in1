import { httpRequest, sleep } from '../../utils/http';
import { log } from '../../utils/logger';
import { getActiveApiKey, recordKeyUsage, addRequestLog } from '../../database';
import { downloadAndUpload } from '../../services/storage';

const BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

export interface VideoGenerationParams {
  model: string;
  prompt?: string;
  duration?: number;
  resolution?: string;
  aspect_ratio?: string;
  reference_images?: string[];
  first_frame_image?: string;
  last_frame_image?: string;
}

export interface VideoGenerationResult {
  created: number;
  data: Array<{ url: string; duration?: number }>;
}

export async function generateVideo(params: VideoGenerationParams): Promise<VideoGenerationResult> {
  const startTime = Date.now();
  const keyRecord = getActiveApiKey('doubao');
  if (!keyRecord) {
    throw new Error('No active API key for doubao');
  }

  try {
    const duration = params.duration || 5;
    const aspectRatio = params.aspect_ratio || '16:9';
    const resolution = params.resolution || '720p';

    log('doubao', 'Generating video', { model: params.model, duration, resolution });

    // 构建 prompt，添加参数（通过 --xxx 格式，与 waule-api 保持一致）
    let finalPrompt = params.prompt || '';
    finalPrompt += ` --ratio ${aspectRatio} --dur ${duration} --rs ${resolution} --wm false`;

    // 构建content数组
    const content: any[] = [
      { type: 'text', text: finalPrompt }
    ];

    // 首尾帧模式
    if (params.first_frame_image && params.last_frame_image) {
      content.push({
        type: 'image_url',
        image_url: { url: params.first_frame_image },
        role: 'first_frame'
      });
      content.push({
        type: 'image_url',
        image_url: { url: params.last_frame_image },
        role: 'last_frame'
      });
    } else if (params.first_frame_image) {
      // 仅首帧
      content.push({
        type: 'image_url',
        image_url: { url: params.first_frame_image }
      });
    } else if (params.reference_images?.length) {
      // 参考图
      if (params.reference_images.length >= 2) {
        // 首尾帧
        content.push({
          type: 'image_url',
          image_url: { url: params.reference_images[0] },
          role: 'first_frame'
        });
        content.push({
          type: 'image_url',
          image_url: { url: params.reference_images[1] },
          role: 'last_frame'
        });
      } else {
        // 仅首帧
        content.push({
          type: 'image_url',
          image_url: { url: params.reference_images[0] }
        });
      }
    }

    const requestBody = {
      model: params.model || 'doubao-seedance-1-0-pro-250528',
      content,
    };

    log('doubao', 'Video request', { hasFirstFrame: !!params.first_frame_image, hasLastFrame: !!params.last_frame_image });

    // 创建任务
    const createResponse = await httpRequest<any>({
      method: 'POST',
      url: `${BASE_URL}/contents/generations/tasks`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${keyRecord.api_key}`,
      },
      data: requestBody,
      timeout: 120000,
    });

    const taskId = createResponse.id;
    if (!taskId) {
      throw new Error('Failed to create video generation task');
    }

    log('doubao', 'Video task created', { taskId });

    // 轮询任务状态
    let videoUrl: string | null = null;
    for (let i = 0; i < 120; i++) {
      await sleep(10000);

      const statusResponse = await httpRequest<any>({
        method: 'GET',
        url: `${BASE_URL}/contents/generations/tasks/${taskId}`,
        headers: {
          'Authorization': `Bearer ${keyRecord.api_key}`,
        },
        timeout: 60000,
      });

      const status = statusResponse.status;
      log('doubao', `Video task status: ${status} (${i + 1}/120)`, { taskId });

      if (status === 'succeeded') {
        log('doubao', 'Task succeeded', { response: JSON.stringify(statusResponse).substring(0, 500) });

        // 尝试多种格式解析（与 waule-api 保持一致）
        videoUrl = statusResponse.content?.video_url
          || statusResponse.data?.content?.video_url
          || statusResponse.video_url
          || statusResponse.output?.video_url;

        // content 是数组的情况
        if (!videoUrl && Array.isArray(statusResponse.content)) {
          for (const item of statusResponse.content) {
            if (item.type === 'video_url' && item.video_url?.url) {
              videoUrl = item.video_url.url;
              break;
            }
            if (item.video_url) {
              videoUrl = item.video_url;
              break;
            }
          }
        }

        break;
      } else if (status === 'failed') {
        throw new Error(statusResponse.error?.message || 'Video generation failed');
      }
    }

    if (!videoUrl) {
      throw new Error('Video generation timeout');
    }

    // 国内模型：使用 apikey 的 storage_type
    const finalUrl = keyRecord.storage_type === 'oss'
      ? await downloadAndUpload(videoUrl, '.mp4', 'doubao')
      : videoUrl;

    recordKeyUsage(keyRecord.id, true);
    addRequestLog('doubao', '/videos/generations', params.model, 'success', Date.now() - startTime);

    return { created: Math.floor(Date.now() / 1000), data: [{ url: finalUrl, duration }] };
  } catch (error: any) {
    recordKeyUsage(keyRecord.id, false);
    addRequestLog('doubao', '/videos/generations', params.model, 'error', Date.now() - startTime, error.message);
    throw error;
  }
}
