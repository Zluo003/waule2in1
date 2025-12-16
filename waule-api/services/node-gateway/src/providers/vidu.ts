/**
 * Vidu Provider
 * 生数科技视频生成服务
 * 
 * 支持功能：
 * - 图生视频 (img2video) - 单图
 * - 首尾帧 (start-end2video) - 双图
 * - 角色参考 (reference2video) - subjects
 * - 文生视频 (text2video)
 * - 智能超清 (upscale-new)
 * - 广告成片 (ad-one-click)
 */

import axios from 'axios';
import { uploadBuffer, downloadAndUploadToOss } from '../oss';
import { log, getApiKey, recordKeyUsage } from './utils';

const VIDU_API_URL = 'https://api.vidu.cn/ent/v2';

// ==================== 接口定义 ====================

export interface ViduSubject {
  id: string;
  images: string[];
  voice_id?: string;
}

export interface ViduVideoOptions {
  model: string;
  prompt: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;           // 540p, 720p, 1080p
  referenceImages?: string[];    // 支持首尾帧（2张图）
  subjects?: ViduSubject[];      // 角色组参考
  audio?: boolean;               // 音视频直出
  voice_id?: string;             // 音色ID
  bgm?: boolean;                 // 背景音乐
  movement_amplitude?: string;   // 运动幅度: auto, small, medium, large
  generationType?: string;       // 文生视频/图生视频
}

export interface ViduUpscaleOptions {
  videoUrl?: string;
  videoCreationId?: string;
  upscaleResolution?: '1080p' | '2K' | '4K' | '8K';
}

export interface ViduCommercialOptions {
  images: string[];
  prompt: string;
  duration?: number;
  ratio?: '16:9' | '9:16' | '1:1';
  language?: 'zh' | 'en';
}

// ==================== 工具函数 ====================

/**
 * 处理图片：base64 转 OSS URL
 */
async function processImage(img: string): Promise<string> {
  if (img.startsWith('data:')) {
    const matches = img.match(/^data:image\/(\w+);base64,(.+)$/);
    if (matches) {
      const ext = matches[1] === 'jpeg' ? '.jpg' : `.${matches[1]}`;
      const buffer = Buffer.from(matches[2], 'base64');
      return await uploadBuffer(buffer, ext, 'vidu');
    }
  }
  return img;
}

/**
 * 处理多张图片
 */
async function processImages(images: string[]): Promise<string[]> {
  return Promise.all(images.map(img => processImage(img)));
}

/**
 * 通用轮询函数
 */
async function pollTask(taskId: string, apiKey: string, maxAttempts: number = 120): Promise<string> {
  log('Vidu', `开始轮询任务: ${taskId}`);
  
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 10000)); // 10秒间隔
    
    try {
      const response = await axios.get(
        `${VIDU_API_URL}/tasks/${taskId}/creations`,
        { 
          headers: { 'Authorization': `Token ${apiKey}` }, 
          timeout: 30000 
        }
      );
      
      const data = response.data;
      const state = (data.state || data.status || '').toLowerCase();
      
      log('Vidu', `轮询 ${i + 1}/${maxAttempts}: state=${state}`);
      
      if (['success', 'succeeded', 'completed', 'finished'].includes(state)) {
        // 从 creations 数组获取视频 URL
        let videoUrl = data.creations?.[0]?.url 
          || data.video_url 
          || data.url 
          || data.result_url;
        
        if (!videoUrl) {
          // 尝试从完整响应中提取
          const str = JSON.stringify(data);
          const m = str.match(/https?:\/\/[^"'\s]+\.mp4(?:\?[^"'\s}]+)?/i);
          if (m) videoUrl = m[0];
        }
        
        if (!videoUrl) {
          log('Vidu', `任务成功但未找到URL: ${JSON.stringify(data).substring(0, 300)}`);
          throw new Error('Response missing video URL');
        }
        
        log('Vidu', `任务成功，原始URL: ${videoUrl.substring(0, 80)}`);
        
        // 转存到 OSS（AWS S3 签名 URL 有有效期限制）
        try {
          const ossUrl = await downloadAndUploadToOss(videoUrl);
          log('Vidu', `已转存到OSS: ${ossUrl.substring(0, 80)}`);
          return ossUrl;
        } catch (e: any) {
          log('Vidu', `OSS转存失败，返回原始URL: ${e.message}`);
          return videoUrl;
        }
      }
      
      if (['failed', 'failure', 'error'].includes(state)) {
        const errMsg = data.error || data.err_code || data.message || 'Task failed';
        throw new Error(errMsg);
      }
      
      // created, queueing, processing 等状态继续等待
    } catch (error: any) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw error;
      }
      // 网络错误继续重试
      if (i === maxAttempts - 1) throw error;
    }
  }
  
  throw new Error(`Task timeout after ${maxAttempts * 10 / 60} minutes`);
}

// ==================== 视频生成 ====================

export async function generateVideo(options: ViduVideoOptions): Promise<{
  url: string;
  duration: number;
}> {
  const { 
    model, 
    prompt, 
    duration = 4, 
    aspectRatio = '16:9', 
    resolution = '720p',
    referenceImages,
    subjects,
    audio,
    voice_id,
    bgm,
    movement_amplitude,
    generationType,
  } = options;
  
  const { key: API_KEY, keyId } = getApiKey('vidu', 'VIDU_API_KEY');
  
  // 处理参考图片
  let processedImages: string[] = [];
  if (referenceImages && referenceImages.length > 0) {
    processedImages = await processImages(referenceImages);
  }
  
  // 处理 subjects
  let processedSubjects: ViduSubject[] | undefined;
  if (subjects && subjects.length > 0) {
    processedSubjects = await Promise.all(
      subjects.map(async (s) => ({
        id: s.id,
        images: await processImages(s.images),
        voice_id: s.voice_id || '',
      }))
    );
  }
  
  // 确定 API 端点
  let endpoint: string;
  let taskType: string;
  
  if (processedSubjects || audio === true) {
    endpoint = 'reference2video';
    taskType = processedSubjects ? '角色参考' : '音视频直出';
  } else if (generationType === '文生视频' || (!processedImages.length && prompt)) {
    endpoint = 'text2video';
    taskType = '文生视频';
  } else if (processedImages.length === 2) {
    endpoint = 'start-end2video';
    taskType = '首尾帧';
  } else {
    endpoint = 'img2video';
    taskType = '图生视频';
  }
  
  log('Vidu', `${taskType}: model=${model}, duration=${duration}s, resolution=${resolution}, endpoint=${endpoint}`);
  
  // 构建请求体
  const requestBody: any = {
    model: model || 'vidu-q2',
  };
  
  // 根据端点类型添加参数
  if (processedSubjects) {
    requestBody.subjects = processedSubjects;
    if (audio === true) requestBody.audio = true;
  } else if (audio === true && processedImages.length > 0) {
    // 音视频直出但没有 subjects：从 images 创建默认 subject
    requestBody.subjects = [{
      id: '1',
      images: processedImages,
      voice_id: voice_id || '',
    }];
    requestBody.audio = true;
  } else if (processedImages.length > 0) {
    requestBody.images = processedImages;
    if (bgm === true) requestBody.bgm = true;
  }
  
  // 通用参数
  if (prompt) requestBody.prompt = prompt;
  if (duration) requestBody.duration = duration;
  if (resolution) requestBody.resolution = resolution.toLowerCase();
  if (aspectRatio) requestBody.aspect_ratio = aspectRatio;
  if (movement_amplitude && movement_amplitude !== 'auto') {
    requestBody.movement_amplitude = movement_amplitude;
  }
  
  log('Vidu', `请求体: ${JSON.stringify(requestBody).substring(0, 400)}`);
  
  try {
    const createResponse = await axios.post(
      `${VIDU_API_URL}/${endpoint}`,
      requestBody,
      {
        headers: {
          'Authorization': `Token ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    
    const taskId = createResponse.data.task_id;
    if (!taskId) {
      log('Vidu', `响应: ${JSON.stringify(createResponse.data)}`);
      throw new Error('No task_id in Vidu response');
    }
    
    log('Vidu', `任务已创建: ${taskId}, state=${createResponse.data.state}`);
    
    // 轮询任务状态
    const videoUrl = await pollTask(taskId, API_KEY);
    
    recordKeyUsage(keyId, true);
    // 直接使用 Vidu 返回的 URL，不再上传 OSS
    log('Vidu', `视频生成成功: ${videoUrl.substring(0, 80)}...`);
    return { url: videoUrl, duration };
    
  } catch (error: any) {
    recordKeyUsage(keyId, false, error.message);
    log('Vidu', `视频生成失败: ${error.response?.data?.error || error.message}`);
    throw new Error(`Vidu video generation failed: ${error.response?.data?.error?.message || error.response?.data?.message || error.message}`);
  }
}

// ==================== 智能超清 ====================

export async function upscaleVideo(options: ViduUpscaleOptions): Promise<{
  url: string;
}> {
  const { videoUrl, videoCreationId, upscaleResolution = '1080p' } = options;
  const { key: API_KEY, keyId } = getApiKey('vidu', 'VIDU_API_KEY');
  
  if (!videoUrl && !videoCreationId) {
    throw new Error('必须提供 videoUrl 或 videoCreationId');
  }
  
  log('Vidu', `智能超清: resolution=${upscaleResolution}`);
  
  const requestBody: any = {
    upscale_resolution: upscaleResolution,
  };
  
  if (videoCreationId) {
    requestBody.video_creation_id = videoCreationId;
  } else if (videoUrl) {
    requestBody.video_url = videoUrl;
  }
  
  try {
    const createResponse = await axios.post(
      `${VIDU_API_URL}/upscale-new`,
      requestBody,
      {
        headers: {
          'Authorization': `Token ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    
    const taskId = createResponse.data.task_id;
    if (!taskId) throw new Error('No task_id in response');
    
    log('Vidu', `超清任务已创建: ${taskId}`);
    
    const resultUrl = await pollTask(taskId, API_KEY);
    
    recordKeyUsage(keyId, true);
    // 直接使用 Vidu 返回的 URL，不再上传 OSS
    log('Vidu', `智能超清成功: ${resultUrl.substring(0, 80)}...`);
    return { url: resultUrl };
    
  } catch (error: any) {
    recordKeyUsage(keyId, false, error.message);
    log('Vidu', `智能超清失败: ${error.message}`);
    throw new Error(`Vidu upscale failed: ${error.response?.data?.error || error.message}`);
  }
}

// ==================== 广告成片 ====================

export async function createCommercialVideo(options: ViduCommercialOptions): Promise<{
  url: string;
}> {
  const { images, prompt, duration = 30, ratio = '16:9', language = 'zh' } = options;
  const { key: API_KEY, keyId } = getApiKey('vidu', 'VIDU_API_KEY');
  
  if (!images || images.length === 0) {
    throw new Error('必须提供至少一张图片');
  }
  
  if (images.length > 15) {
    throw new Error('最多支持15张图片');
  }
  
  log('Vidu', `广告成片: images=${images.length}, duration=${duration}s`);
  
  // 处理图片
  const processedImages = await processImages(images);
  
  const requestBody = {
    images: processedImages,
    prompt,
    duration,
    aspect_ratio: ratio,
    language,
  };
  
  try {
    const createResponse = await axios.post(
      `${VIDU_API_URL}/ad-one-click`,
      requestBody,
      {
        headers: {
          'Authorization': `Token ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    
    const taskId = createResponse.data.task_id;
    if (!taskId) throw new Error('No task_id in response');
    
    log('Vidu', `广告成片任务已创建: ${taskId}`);
    
    const resultUrl = await pollTask(taskId, API_KEY, 180); // 广告成片可能需要更长时间
    
    recordKeyUsage(keyId, true);
    // 直接使用 Vidu 返回的 URL，不再上传 OSS
    log('Vidu', `广告成片成功: ${resultUrl.substring(0, 80)}...`);
    return { url: resultUrl };
    
  } catch (error: any) {
    recordKeyUsage(keyId, false, error.message);
    log('Vidu', `广告成片失败: ${error.message}`);
    throw new Error(`Vidu commercial video failed: ${error.response?.data?.error || error.message}`);
  }
}
