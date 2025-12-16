/**
 * Wanx (通义万相) Provider
 * 阿里云图片/视频生成服务
 */

import axios from 'axios';
import { uploadBuffer, downloadAndUploadToOss } from '../oss';
import { log, getApiKey, recordKeyUsage } from './utils';

const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/api/v1';
const DASHSCOPE_INTL_API_URL = 'https://dashscope-intl.aliyuncs.com/api/v1';

export interface WanxImageOptions {
  model: string;
  prompt: string;
  size?: string;
  referenceImages?: string[];
  useIntl?: boolean; // 使用国际区域
}

export interface WanxVideoOptions {
  model: string;
  prompt: string;
  duration?: number;
  resolution?: string; // '480P', '720P', '1080P'
  aspectRatio?: string;
  referenceImages?: string[];
  useIntl?: boolean;
  // 视频换人参数
  replaceImageUrl?: string;
  replaceVideoUrl?: string;
  mode?: string; // 'wan-std' | 'wan-pro'
}

export interface WanxVideoRetalkOptions {
  videoUrl: string;
  audioUrl: string;
  refImageUrl?: string;
  videoExtension?: boolean;
  useIntl?: boolean;
}

export interface WanxVideoStylizeOptions {
  videoUrl: string;
  style?: number;
  videoFps?: number;
  minLen?: number;
  useIntl?: boolean;
}

// 处理图片：base64 转 OSS URL
async function processImage(img: string): Promise<string> {
  if (img.startsWith('data:')) {
    const matches = img.match(/^data:image\/(\w+);base64,(.+)$/);
    if (matches) {
      const ext = matches[1] === 'jpeg' ? '.jpg' : `.${matches[1]}`;
      const buffer = Buffer.from(matches[2], 'base64');
      return await uploadBuffer(buffer, ext, 'wanx');
    }
  }
  return img;
}

// 图片生成
export async function generateImage(options: WanxImageOptions): Promise<{
  url: string;
  revisedPrompt?: string;
}> {
  const { model, prompt, size, referenceImages, useIntl } = options;
  const { key: API_KEY, keyId } = getApiKey('alibaba', 'DASHSCOPE_API_KEY');
  const baseUrl = useIntl ? DASHSCOPE_INTL_API_URL : DASHSCOPE_API_URL;
  
  log('Wanx', `图片生成: model=${model}, size=${size}`);
  
  const requestBody: any = {
    model: model.includes('sketch') ? 'wanx-sketch-to-image-v1' : (model || 'wanx-v1'),
    input: { prompt },
    parameters: { size: size || '1024*1024', n: 1 },
  };
  
  // 处理参考图
  if (referenceImages && referenceImages.length > 0) {
    const ossUrl = await processImage(referenceImages[0]);
    requestBody.input.ref_img = ossUrl;
  }
  
  try {
    const createResponse = await axios.post(
      `${baseUrl}/services/aigc/text2image/image-synthesis`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
        },
        timeout: 30000,
      }
    );
    
    const taskId = createResponse.data.output?.task_id;
    if (!taskId) throw new Error('No task_id in Wanx response');
    
    log('Wanx', `任务已创建: ${taskId}`);
    
    // 轮询查询状态
    const imageUrl = await pollTask(taskId, baseUrl, API_KEY, 'image');
    
    recordKeyUsage(keyId, true);
    // 直接使用阿里云返回的 URL，不再上传 OSS
    log('Wanx', `图片生成成功: ${imageUrl.substring(0, 80)}...`);
    return { url: imageUrl };
    
  } catch (error: any) {
    recordKeyUsage(keyId, false, error.message);
    log('Wanx', `图片生成失败: ${error.message}`);
    throw new Error(`Wanx image generation failed: ${error.response?.data?.message || error.message}`);
  }
}

// 通用轮询函数
async function pollTask(taskId: string, baseUrl: string, apiKey: string, type: 'image' | 'video'): Promise<string> {
  const maxAttempts = type === 'video' ? 180 : 60; // 视频15分钟，图片2分钟
  const interval = type === 'video' ? 5000 : 2000;
  
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, interval));
    
    const response = await axios.get(
      `${baseUrl}/tasks/${taskId}`,
      { headers: { 'Authorization': `Bearer ${apiKey}` }, timeout: 10000 }
    );
    
    const status = response.data.output?.task_status;
    log('Wanx', `轮询 ${i + 1}/${maxAttempts}: ${status}`);
    
    if (status === 'SUCCEEDED') {
      log('Wanx', `任务成功，响应: ${JSON.stringify(response.data).substring(0, 500)}`);
      // 图片结果
      if (type === 'image') {
        const results = response.data.output?.results;
        if (results && results.length > 0) return results[0].url;
      }
      // 视频结果 - 尝试多种路径
      let videoUrl = response.data.output?.video_url 
        || response.data.output?.results?.video_url
        || response.data.output?.results?.[0]?.video_url
        || response.data.output?.results?.[0]?.url;
      if (videoUrl) return videoUrl;
      // 尝试从完整响应中提取
      const str = JSON.stringify(response.data);
      const m = str.match(/https?:\/\/[^"'\s]+\.mp4(?:\?[^"'\s}]+)?/i);
      if (m) return m[0];
      log('Wanx', `未找到视频URL，完整响应: ${str}`);
      throw new Error('Response missing result URL');
    }
    
    if (status === 'FAILED') {
      throw new Error(response.data.output?.message || 'Task failed');
    }
  }
  
  throw new Error(`Task timeout after ${maxAttempts} attempts`);
}

// 视频生成
export async function generateVideo(options: WanxVideoOptions): Promise<{
  url: string;
  duration: number;
}> {
  const { 
    model, prompt, duration = 5, resolution = '1080P', 
    referenceImages, useIntl,
    replaceImageUrl, replaceVideoUrl, mode = 'wan-std'
  } = options;
  const { key: API_KEY, keyId } = getApiKey('alibaba', 'DASHSCOPE_API_KEY');
  const baseUrl = useIntl ? DASHSCOPE_INTL_API_URL : DASHSCOPE_API_URL;
  
  log('Wanx', `视频生成: model=${model}, duration=${duration}, resolution=${resolution}`);
  
  // 判断是视频换人模式还是普通视频生成
  const isAnimateModel = model.includes('animate-mix') || model.includes('animate-move');
  
  let requestBody: any;
  let endpoint: string;
  
  if (isAnimateModel && replaceImageUrl && replaceVideoUrl) {
    // 视频换人模式
    requestBody = {
      model: model,
      input: {
        image_url: replaceImageUrl,
        video_url: replaceVideoUrl,
      },
      parameters: { mode },
    };
    endpoint = `${baseUrl}/services/aigc/image2video/video-synthesis`;
  } else {
    // 普通视频生成
    requestBody = {
      model: model || 'wanx-video-synthesis',
      input: { prompt },
      parameters: { duration, resolution },
    };
    endpoint = `${baseUrl}/services/aigc/video-synthesis/video-generation`;
    
    // 添加首帧图片
    if (referenceImages && referenceImages.length > 0) {
      const imgUrl = await processImage(referenceImages[0]);
      requestBody.input.img_url = imgUrl;
    }
  }
  
  try {
    const createResponse = await axios.post(endpoint, requestBody, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
        'X-DashScope-OssResourceResolve': 'enable',
      },
      timeout: 30000,
    });
    
    const taskId = createResponse.data.output?.task_id;
    if (!taskId) throw new Error('No task_id in Wanx video response');
    
    log('Wanx', `视频任务已创建: ${taskId}`);
    
    const videoUrl = await pollTask(taskId, baseUrl, API_KEY, 'video');
    
    recordKeyUsage(keyId, true);
    // 直接使用阿里云返回的 URL，不再上传 OSS
    log('Wanx', `视频生成成功: ${videoUrl.substring(0, 80)}...`);
    return { url: videoUrl, duration };
    
  } catch (error: any) {
    recordKeyUsage(keyId, false, error.message);
    log('Wanx', `视频生成失败: ${error.message}`);
    throw new Error(`Wanx video generation failed: ${error.response?.data?.message || error.message}`);
  }
}

// 视频换人（说话人替换）
export async function generateVideoRetalk(options: WanxVideoRetalkOptions): Promise<{
  url: string;
}> {
  const { videoUrl, audioUrl, refImageUrl, videoExtension, useIntl } = options;
  const { key: API_KEY, keyId } = getApiKey('alibaba', 'DASHSCOPE_API_KEY');
  const baseUrl = useIntl ? DASHSCOPE_INTL_API_URL : DASHSCOPE_API_URL;
  
  log('Wanx', `视频换人: videoUrl=${videoUrl?.substring(0, 50)}`);
  
  const requestBody: any = {
    model: 'videoretalk',
    input: {
      video_url: videoUrl,
      audio_url: audioUrl,
    },
    parameters: {},
  };
  
  if (refImageUrl) requestBody.input.ref_image_url = refImageUrl;
  if (typeof videoExtension === 'boolean') requestBody.parameters.video_extension = videoExtension;
  
  try {
    const createResponse = await axios.post(
      `${baseUrl}/services/aigc/image2video/video-synthesis`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
          'X-DashScope-OssResourceResolve': 'enable',
        },
        timeout: 30000,
      }
    );
    
    const taskId = createResponse.data.output?.task_id;
    if (!taskId) throw new Error('No task_id in videoretalk response');
    
    log('Wanx', `视频换人任务已创建: ${taskId}`);
    
    const resultUrl = await pollTask(taskId, baseUrl, API_KEY, 'video');
    
    recordKeyUsage(keyId, true);
    // 直接使用阿里云返回的 URL，不再上传 OSS
    log('Wanx', `视频换人成功: ${resultUrl.substring(0, 80)}...`);
    return { url: resultUrl };
    
  } catch (error: any) {
    recordKeyUsage(keyId, false, error.message);
    log('Wanx', `视频换人失败: ${error.message}`);
    throw new Error(`Wanx videoretalk failed: ${error.response?.data?.message || error.message}`);
  }
}

// 视频风格转绘
export async function generateVideoStylize(options: WanxVideoStylizeOptions): Promise<{
  url: string;
}> {
  const { videoUrl, style, videoFps, minLen, useIntl } = options;
  const { key: API_KEY, keyId } = getApiKey('alibaba', 'DASHSCOPE_API_KEY');
  const baseUrl = useIntl ? DASHSCOPE_INTL_API_URL : DASHSCOPE_API_URL;
  
  log('Wanx', `视频风格转绘: videoUrl=${videoUrl?.substring(0, 50)}`);
  
  const requestBody: any = {
    model: 'video-style-transform',
    input: { video_url: videoUrl },
    parameters: {},
  };
  
  if (typeof style === 'number') requestBody.parameters.style = style;
  if (typeof videoFps === 'number') requestBody.parameters.video_fps = videoFps;
  if (typeof minLen === 'number') requestBody.parameters.min_len = minLen;
  
  try {
    const createResponse = await axios.post(
      `${baseUrl}/services/aigc/video-generation/video-synthesis`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
          'X-DashScope-OssResourceResolve': 'enable',
        },
        timeout: 60000,
      }
    );
    
    const taskId = createResponse.data.output?.task_id;
    if (!taskId) throw new Error('No task_id in video-stylize response');
    
    log('Wanx', `视频风格转绘任务已创建: ${taskId}`);
    
    const resultUrl = await pollTask(taskId, baseUrl, API_KEY, 'video');
    
    recordKeyUsage(keyId, true);
    // 直接使用阿里云返回的 URL，不再上传 OSS
    log('Wanx', `视频风格转绘成功: ${resultUrl.substring(0, 80)}...`);
    return { url: resultUrl };
    
  } catch (error: any) {
    recordKeyUsage(keyId, false, error.message);
    log('Wanx', `视频风格转绘失败: ${error.message}`);
    throw new Error(`Wanx video-stylize failed: ${error.response?.data?.message || error.message}`);
  }
}
