/**
 * Veo 3.1 视频生成 Provider
 * 通过 future-api 中转调用 Google Veo 3.1 系列模型
 *
 * 支持模型:
 * - veo3.1: 文生视频、图生视频（1张首帧）
 * - veo3.1-pro: 文生视频、图生视频（1张首帧）
 * - veo3.1-components: 文生视频、参考图生视频（1-3张参考图）
 *
 * API文档: https://future-api.doc.vodeshop.com/
 * 
 * API 端点:
 * - 文生视频: POST /v1/videos (FormData格式)
 * - 图生视频: POST /v1/chat/completions (JSON格式，OpenAI chat格式)
 * - 查询状态: GET /v1/videos/{taskId}
 */

import { getVeoProxyConfig, recordVeoProxyUsage } from '../db';
import { uploadBuffer } from '../oss';

function log(tag: string, msg: string, data?: any) {
  console.log(`[${new Date().toISOString()}] [${tag}] ${msg}`, data || '');
}

export interface VeoVideoOptions {
  model: string;
  prompt: string;
  aspectRatio?: string;
  images?: string[];
  enableUpsample?: boolean;
  enhancePrompt?: boolean;
}

export interface VeoVideoResult {
  url: string;
  duration: number;
}

/**
 * 处理图片：base64 转 OSS URL
 */
async function processImage(imageUrl: string): Promise<string | null> {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return null;
  }

  // 已经是 URL，直接返回
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  // base64 图片，上传到 OSS
  if (imageUrl.startsWith('data:')) {
    log('Veo', '检测到 base64 图片，上传到 OSS...');
    try {
      const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = `.${matches[1]}`;
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const ossUrl = await uploadBuffer(buffer, ext, 'veo');
        log('Veo', `base64 图片已上传到 OSS: ${ossUrl}`);
        return ossUrl;
      }
    } catch (e: any) {
      log('Veo', `base64 上传失败: ${e.message}`);
    }
    return null;
  }

  return null;
}

/**
 * 创建视频生成任务
 * - 图生视频（所有模型）: POST /v1/chat/completions (JSON格式，同步返回视频URL)
 * - 文生视频: POST /v1/videos (FormData格式，异步轮询)
 */
async function createVideoTask(options: VeoVideoOptions, config: { baseUrl: string; apiKey: string }): Promise<string> {
  const { model, prompt, images = [], enhancePrompt = true } = options;

  // 处理图片：base64 转 URL
  const processedImages: string[] = [];
  if (images && images.length > 0) {
    for (const img of images) {
      const url = await processImage(img);
      if (url) {
        processedImages.push(url);
      }
    }
  }

  log('Veo', `创建视频任务: model=${model}, prompt=${prompt.substring(0, 50)}..., images=${processedImages.length}`);

  let response: Response;
  let data: any;

  // 图生视频：使用 chat/completions 接口（同步返回视频URL）
  if (processedImages.length > 0) {
    log('Veo', `使用 chat/completions 格式发送图生视频请求`);
    
    // 构建 content 数组
    const content: any[] = [
      { type: 'text', text: prompt }
    ];
    for (const imgUrl of processedImages) {
      content.push({
        type: 'image_url',
        image_url: { url: imgUrl }
      });
    }

    const chatBody = {
      model,
      messages: [
        { role: 'user', content }
      ],
      stream: false
    };

    response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chatBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    data = await response.json() as any;
    
    // chat/completions 返回格式：视频URL在 choices[0].message.content 中
    const content0 = data?.choices?.[0]?.message?.content;
    if (content0 && typeof content0 === 'string') {
      // 从返回内容中提取视频URL (在线观看链接)
      const urlMatch = content0.match(/\[▶️ 在线观看\]\((https?:\/\/[^\s\)]+)\)/);
      if (urlMatch) {
        log('Veo', `chat 响应返回视频URL: ${urlMatch[1]}`);
        return `VIDEO_URL:${urlMatch[1]}`;
      }
      // 备用：尝试匹配任何 mp4 链接
      const mp4Match = content0.match(/(https?:\/\/[^\s"'<>\)]+\.mp4)/i);
      if (mp4Match) {
        log('Veo', `chat 响应返回视频URL: ${mp4Match[1]}`);
        return `VIDEO_URL:${mp4Match[1]}`;
      }
    }
    
    throw new Error(`无法从 chat 响应中获取视频URL: ${JSON.stringify(data)}`);
  }
  
  // 文生视频：使用 /v1/videos (FormData 格式，异步)
  log('Veo', `使用 FormData 格式发送文生视频请求`);
  
  const formData = new FormData();
  formData.append('model', model);
  formData.append('prompt', prompt);
  formData.append('enhance_prompt', String(enhancePrompt));

  response = await fetch(`${config.baseUrl}/v1/videos`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText);
  }

  data = await response.json() as any;
  const taskId = data?.id || data?.task_id;
  if (!taskId) {
    throw new Error('未能获取任务ID');
  }

  log('Veo', `任务已创建: ${taskId}, status=${data?.status}`);
  return taskId;
}

/**
 * 查询视频任务状态
 * API端点: GET /v1/videos/{taskId}
 */
async function queryVideoStatus(taskId: string, config: { baseUrl: string; apiKey: string }): Promise<{
  status: string;
  videoUrl?: string;
  error?: string;
}> {
  const response = await fetch(
    `${config.baseUrl}/v1/videos/${encodeURIComponent(taskId)}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText);
  }

  const data = await response.json() as any;
  
  // 处理 error 字段，可能是对象或字符串
  let errorMsg: string | undefined;
  if (data.error) {
    if (typeof data.error === 'string') {
      errorMsg = data.error;
    } else if (typeof data.error === 'object') {
      errorMsg = data.error.message || data.error.reason || JSON.stringify(data.error);
    }
  } else if (data.fail_reason) {
    errorMsg = typeof data.fail_reason === 'string' ? data.fail_reason : JSON.stringify(data.fail_reason);
  }
  
  return {
    status: data.status,
    videoUrl: data.video_url,
    error: errorMsg,
  };
}

/**
 * 轮询等待视频生成完成
 */
async function waitForCompletion(taskId: string, config: { baseUrl: string; apiKey: string }, maxWaitMs: number = 600000): Promise<string> {
  // 如果 taskId 是直接的视频URL，直接返回
  if (taskId.startsWith('VIDEO_URL:')) {
    return taskId.substring(10);
  }

  const startTime = Date.now();
  const pollInterval = 5000; // 5秒轮询一次

  while (Date.now() - startTime < maxWaitMs) {
    const result = await queryVideoStatus(taskId, config);

    log('Veo', `任务状态: ${taskId} -> ${result.status}`);

    if (result.status === 'completed') {
      if (!result.videoUrl) {
        throw new Error('任务完成但未返回视频URL');
      }
      return result.videoUrl;
    }

    if (result.status === 'failed' || result.status === 'video_generation_failed' || result.status === 'video_upsampling_failed') {
      throw new Error(result.error || '视频生成失败');
    }

    // 等待后继续轮询
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('视频生成超时');
}

/**
 * 生成视频（主入口）
 */
export async function generateVideo(options: VeoVideoOptions): Promise<VeoVideoResult> {
  // 获取配置
  const proxyConfig = getVeoProxyConfig();
  if (!proxyConfig || !proxyConfig.api_key) {
    throw new Error('Veo API 未配置或缺少 API Key');
  }

  if (!proxyConfig.is_active) {
    throw new Error('Veo API 未启用');
  }

  const config = {
    baseUrl: proxyConfig.base_url || 'https://future-api.vodeshop.com',
    apiKey: proxyConfig.api_key,
  };

  log('Veo', `开始生成视频: model=${options.model}, baseUrl=${config.baseUrl}`);

  try {
    // 1. 创建任务
    const taskId = await createVideoTask(options, config);

    // 2. 轮询等待完成
    const videoUrl = await waitForCompletion(taskId, config);

    // 记录成功
    recordVeoProxyUsage(true);

    log('Veo', `视频生成成功: ${videoUrl}`);

    return {
      url: videoUrl,
      duration: 0, // Veo API 不返回时长
    };
  } catch (error: any) {
    // 记录失败
    recordVeoProxyUsage(false, error.message);

    const statusCode = error.response?.status;
    const responseData = error.response?.data;
    const errMsg = responseData?.error?.message || responseData?.message || error.message;

    log('Veo', `视频生成失败: status=${statusCode}, error=${errMsg}`);
    throw new Error(`Veo video generation failed: ${errMsg}`);
  }
}

/**
 * 检查模型是否为 Veo 模型
 */
export function isVeoModel(model: string): boolean {
  const modelLower = model.toLowerCase();
  return modelLower.includes('veo3.1') || modelLower.includes('veo3-1');
}
