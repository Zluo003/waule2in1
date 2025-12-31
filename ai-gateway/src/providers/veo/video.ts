import { httpRequest, sleep } from '../../utils/http';
import { log } from '../../utils/logger';
import { getActiveApiKey, recordKeyUsage, addRequestLog, getActiveChannelForModel, recordChannelKeyUsage, Channel } from '../../database';
import { downloadAndUpload } from '../../services/storage';

const DEFAULT_BASE_URL = 'https://future-api.vodeshop.com';

export interface VideoGenerationParams {
  model: string;
  prompt?: string;
  aspect_ratio?: string;
  enhance_prompt?: boolean;
  first_frame_image?: string;
  reference_images?: string[];
}

export interface VideoGenerationResult {
  created: number;
  data: Array<{ url: string; duration?: number }>;
}

export async function generateVideo(params: VideoGenerationParams): Promise<VideoGenerationResult> {
  const startTime = Date.now();
  const model = params.model || 'veo3.1';

  // 优先查找模型配置的渠道
  const channelResult = getActiveChannelForModel(model);

  let apiKey: string;
  let actualModel: string = model;
  let channelKeyId: number | null = null;
  let keyRecordId: number | null = null;
  let storageType: Channel['storage_type'] | undefined;
  let baseUrl: string = DEFAULT_BASE_URL;

  if (channelResult) {
    const { channel, key, targetModels } = channelResult;
    apiKey = key.api_key;
    channelKeyId = key.id;
    storageType = channel.storage_type;
    if (channel.base_url) {
      baseUrl = channel.base_url;
    }
    if (targetModels && targetModels.length > 0) {
      actualModel = targetModels[0];
    }
    log('veo', 'Using channel', { channel: channel.name, key: key.name, targetModel: actualModel, baseUrl });
  } else {
    const keyRecord = getActiveApiKey('veo');
    if (!keyRecord) {
      throw new Error('No active API key or channel for veo');
    }
    apiKey = keyRecord.api_key;
    keyRecordId = keyRecord.id;
  }

  try {
    const prompt = params.prompt || '';

    // 收集图片URL
    const images: string[] = [];
    if (params.first_frame_image) {
      images.push(params.first_frame_image);
    } else if (params.reference_images?.length) {
      images.push(...params.reference_images);
    }

    // 验证图片数量
    if ((model === 'veo3.1' || model === 'veo3.1-pro') && images.length > 2) {
      throw new Error('veo3.1/veo3.1-pro 最多支持 2 张图片(首尾帧)');
    }
    if (model === 'veo3.1-components' && images.length > 3) {
      throw new Error('veo3.1-components 最多支持 3 张图片');
    }

    log('veo', 'Generating video', { model: actualModel, hasImages: images.length > 0, prompt: prompt.substring(0, 50) });

    let videoUrl: string;

    // 图生视频：使用 /v1/chat/completions (JSON格式，同步返回)
    if (images.length > 0) {
      videoUrl = await createImageToVideo(baseUrl, apiKey, actualModel, prompt, images);
    } else {
      // 文生视频：使用 /v1/videos (FormData格式，异步轮询)
      videoUrl = await createTextToVideo(baseUrl, apiKey, actualModel, prompt, params.enhance_prompt);
    }

    const finalUrl = await downloadAndUpload(videoUrl, '.mp4', 'veo', storageType);

    recordSuccess(channelKeyId, keyRecordId);
    addRequestLog('veo', '/videos/generations', model, 'success', Date.now() - startTime);

    return { created: Math.floor(Date.now() / 1000), data: [{ url: finalUrl }] };
  } catch (error: any) {
    recordFailure(channelKeyId, keyRecordId);
    addRequestLog('veo', '/videos/generations', params.model, 'error', Date.now() - startTime, error.message);
    throw error;
  }
}

/**
 * 图生视频：POST /v1/chat/completions (JSON格式，同步返回视频URL)
 */
async function createImageToVideo(baseUrl: string, apiKey: string, model: string, prompt: string, images: string[]): Promise<string> {
  log('veo', 'Using chat/completions for image-to-video');

  const content: any[] = [{ type: 'text', text: prompt }];
  for (const imgUrl of images) {
    content.push({ type: 'image_url', image_url: { url: imgUrl } });
  }

  const response = await httpRequest<any>({
    method: 'POST',
    url: `${baseUrl}/v1/chat/completions`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    data: {
      model,
      messages: [{ role: 'user', content }],
      stream: false
    },
    timeout: 600000, // 10分钟超时
  });

  log('veo', 'Chat completions response', { response: JSON.stringify(response).substring(0, 500) });

  // 从 choices[0].message.content 中提取视频URL
  const messageContent = response?.choices?.[0]?.message?.content;
  if (messageContent && typeof messageContent === 'string') {
    // 优先匹配 [▶️ 在线观看](url) 格式
    const watchMatch = messageContent.match(/\[▶️ 在线观看\]\((https?:\/\/[^\s\)]+)\)/);
    if (watchMatch) {
      log('veo', `Found video URL from watch link: ${watchMatch[1]}`);
      return watchMatch[1];
    }
    // 备用：匹配任何 mp4 链接
    const mp4Match = messageContent.match(/(https?:\/\/[^\s"'<>\)]+\.mp4)/i);
    if (mp4Match) {
      log('veo', `Found video URL from mp4 link: ${mp4Match[1]}`);
      return mp4Match[1];
    }
  }

  throw new Error(`无法从 chat 响应中获取视频URL: ${JSON.stringify(response).substring(0, 200)}`);
}

/**
 * 文生视频：POST /v1/videos (FormData格式，异步轮询)
 */
async function createTextToVideo(baseUrl: string, apiKey: string, model: string, prompt: string, enhancePrompt?: boolean): Promise<string> {
  log('veo', 'Using /v1/videos for text-to-video');

  // 使用 FormData 格式
  const formData = new FormData();
  formData.append('model', model);
  formData.append('prompt', prompt);
  formData.append('enhance_prompt', String(enhancePrompt !== false));

  const response = await fetch(`${baseUrl}/v1/videos`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`创建视频任务失败 (${response.status}): ${errorText}`);
  }

  const data = await response.json() as any;
  const taskId = data?.id || data?.task_id;
  if (!taskId) {
    throw new Error('未能获取任务ID');
  }

  log('veo', `Video task created: ${taskId}, status=${data?.status}`);

  // 轮询等待完成
  return await pollVideoStatus(baseUrl, apiKey, taskId);
}

/**
 * 轮询视频任务状态：GET /v1/videos/{taskId}
 */
async function pollVideoStatus(baseUrl: string, apiKey: string, taskId: string): Promise<string> {
  const maxWaitMs = 600000; // 10分钟
  const pollInterval = 5000; // 5秒
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const response = await httpRequest<any>({
      method: 'GET',
      url: `${baseUrl}/v1/videos/${encodeURIComponent(taskId)}`,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: 60000,
    });

    const status = response.status;
    log('veo', `Video task status: ${taskId} -> ${status}`);

    if (status === 'completed') {
      if (!response.video_url) {
        throw new Error('任务完成但未返回视频URL');
      }
      return response.video_url;
    }

    if (status === 'failed' || status === 'video_generation_failed' || status === 'video_upsampling_failed') {
      const errorMsg = typeof response.error === 'string' ? response.error :
        response.error?.message || response.fail_reason || '视频生成失败';
      throw new Error(errorMsg);
    }

    await sleep(pollInterval);
  }

  throw new Error('视频生成超时');
}

function recordSuccess(channelKeyId: number | null, keyRecordId: number | null) {
  if (channelKeyId) {
    recordChannelKeyUsage(channelKeyId, true);
  } else if (keyRecordId) {
    recordKeyUsage(keyRecordId, true);
  }
}

function recordFailure(channelKeyId: number | null, keyRecordId: number | null) {
  if (channelKeyId) {
    recordChannelKeyUsage(channelKeyId, false);
  } else if (keyRecordId) {
    recordKeyUsage(keyRecordId, false);
  }
}
