/**
 * Vidu 视频生成服务 - 通过 WauleAPI 网关调用
 * 
 * 改造说明：
 * - 视频生成改为调用 wauleapi 的 v1 统一接口
 * - API Key 由 wauleapi 管理
 * - OSS 上传由 wauleapi 处理
 */

import { uploadBuffer } from '../../utils/oss';
import { logger } from '../../utils/logger';
import { wauleApiClient, getServerConfigByModelId, ServerConfig } from '../wauleapi-client';

// ==================== 接口定义 ====================

export interface ViduSubject {
  id: string;
  images: string[];
  voice_id?: string;
}

interface ViduImageToVideoOptions {
  images?: string[];
  subjects?: ViduSubject[];
  prompt?: string;
  model?: string;
  audio?: boolean;
  voice_id?: string;
  bgm?: boolean;
  is_rec?: boolean;
  duration?: number;
  seed?: number;
  resolution?: string;
  movement_amplitude?: string;
  payload?: string;
  off_peak?: boolean;
  watermark?: boolean;
  wm_position?: number;
  wm_url?: string;
  meta_data?: string;
  callback_url?: string;
  serverConfig?: ServerConfig; // 服务器配置（来自数据库）
  apiKey?: string;  // 已废弃，保留向后兼容
  apiUrl?: string;  // 已废弃，保留向后兼容
}

// ==================== 工具函数 ====================

/**
 * 处理图片URL - Base64 转 OSS URL
 */
async function processImageUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:image/')) {
    logger.info('[Vidu] 🔄 检测到 Base64，上传到 OSS 转为 URL...', imageUrl.length, '字符');
    try {
      const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'jpeg' ? '.jpg' : `.${matches[1]}`;
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const ossUrl = await uploadBuffer(buffer, ext);
        logger.info('[Vidu] ✅ 已上传到 OSS:', ossUrl);
        return ossUrl;
      }
    } catch (e: any) {
      logger.error('[Vidu] ❌ 上传到 OSS 失败:', e.message);
      throw new Error('图片上传失败，请重试');
    }
  }
  
  if (imageUrl.startsWith('https://') || imageUrl.startsWith('http://')) {
    if (!imageUrl.includes('localhost') && !imageUrl.includes('127.0.0.1')) {
      return imageUrl;
    }
  }
  
  throw new Error('不支持的图片格式');
}

// ==================== AI 服务函数 ====================

/**
 * 图生视频（含首尾帧、角色参考、音视频直出）
 */
export async function imageToVideo(options: ViduImageToVideoOptions): Promise<string> {
  const {
    images,
    subjects,
    prompt,
    model = 'vidu-q2',
    audio,
    voice_id,
    bgm,
    duration,
    resolution,
    movement_amplitude,
    serverConfig,
  } = options;

  // 获取服务器配置
  const finalServerConfig = serverConfig || await getServerConfigByModelId(model);

  // 处理图片
  let processedImages: string[] = [];
  if (images && images.length > 0) {
    processedImages = await Promise.all(images.map(img => processImageUrl(img)));
    logger.info(`[Vidu] ✅ 图片处理完成: ${processedImages.length} 张`);
  }

  // 处理 subjects
  let processedSubjects: ViduSubject[] | undefined;
  if (subjects && subjects.length > 0) {
    processedSubjects = await Promise.all(
      subjects.map(async (s) => ({
        id: s.id,
        images: await Promise.all(s.images.map(img => processImageUrl(img))),
        voice_id: s.voice_id || '',
      }))
    );
    logger.info(`[Vidu] ✅ Subjects 处理完成: ${processedSubjects.length} 个`);
  }

  // 确定生成类型
  const isTextToVideo = !processedImages.length && !processedSubjects && prompt;
  const generationType = isTextToVideo ? '文生视频' : 
    (processedSubjects ? '角色参考' : 
    (processedImages.length === 2 ? '首尾帧' : '图生视频'));

  logger.info(`[Vidu] 视频生成请求:`, {
    model,
    duration,
    resolution,
    movement_amplitude,
    generationType,
    imagesCount: processedImages.length,
    subjectsCount: processedSubjects?.length || 0,
    audio,
  });

  try {
    const result = await wauleApiClient.generateVideo({
      model,
      prompt: prompt || '',
      duration,
      resolution,
      aspect_ratio: '16:9',
      reference_images: processedImages.length > 0 ? processedImages : undefined,
      subjects: processedSubjects,
      audio,
      voice_id,
      bgm,
      movement_amplitude,
      generation_type: generationType,
    }, finalServerConfig);

    if (!result.data || result.data.length === 0) {
      throw new Error('WauleAPI 未返回视频数据');
    }

    const videoUrl = result.data[0].url;
    logger.info(`[Vidu] ✅ 视频生成成功:`, videoUrl);
    return videoUrl;
  } catch (error: any) {
    logger.error('[Vidu] ❌ 视频生成失败:', error.response?.data || error.message);
    throw new Error(`Vidu 视频生成失败: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * 文生视频
 */
export async function textToVideo(options: {
  prompt: string;
  model?: string;
  style?: string;
  duration?: number;
  seed?: number;
  aspect_ratio?: string;
  resolution?: string;
  movement_amplitude?: string;
  bgm?: boolean;
  payload?: string;
  off_peak?: boolean;
  watermark?: boolean;
  wm_position?: number;
  wm_url?: string;
  meta_data?: string;
  callback_url?: string;
  serverConfig?: ServerConfig;
}): Promise<{ taskId: string; status: string }> {
  const {
    prompt,
    model = 'vidu-q2',
    duration = 5,
    resolution = '720p',
    aspect_ratio = '16:9',
    movement_amplitude,
    bgm,
    serverConfig,
  } = options;

  // 获取服务器配置
  const finalServerConfig = serverConfig || await getServerConfigByModelId(model);

  logger.info(`[Vidu] 文生视频请求:`, {
    model,
    duration,
    resolution,
    promptLength: prompt.length,
  });

  try {
    const result = await wauleApiClient.generateVideo({
      model,
      prompt,
      duration,
      resolution,
      aspect_ratio,
      movement_amplitude,
      bgm,
      generation_type: '文生视频',
    }, finalServerConfig);

    if (!result.data || result.data.length === 0) {
      throw new Error('WauleAPI 未返回视频数据');
    }

    const videoUrl = result.data[0].url;
    logger.info(`[Vidu] ✅ 文生视频成功:`, videoUrl);
    
    return {
      taskId: 'completed',
      status: videoUrl,
    };
  } catch (error: any) {
    logger.error('[Vidu] ❌ 文生视频失败:', error.response?.data || error.message);
    throw new Error(`Vidu 文生视频失败: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * 智能超清
 */
export async function upscaleVideo(options: {
  video_url?: string;
  video_creation_id?: string;
  upscale_resolution?: '1080p' | '2K' | '4K' | '8K';
  payload?: string;
  callback_url?: string;
  serverConfig?: ServerConfig;
}): Promise<{ taskId: string; status: string }> {
  const { video_url, video_creation_id, upscale_resolution = '1080p', serverConfig } = options;

  // 获取服务器配置
  const finalServerConfig = serverConfig || await getServerConfigByModelId('vidu-upscale');

  logger.info(`[Vidu] 智能超清请求:`, {
    hasVideoUrl: !!video_url,
    hasCreationId: !!video_creation_id,
    upscale_resolution,
  });

  try {
    const result = await wauleApiClient.upscaleVideo({
      video_url,
      video_creation_id,
      upscale_resolution,
    }, finalServerConfig);

    if (!result.data || result.data.length === 0) {
      throw new Error('WauleAPI 未返回视频数据');
    }

    const videoUrl = result.data[0].url;
    logger.info(`[Vidu] ✅ 智能超清成功:`, videoUrl);
    
    return {
      taskId: 'completed',
      status: videoUrl,
    };
  } catch (error: any) {
    logger.error('[Vidu] ❌ 智能超清失败:', error.response?.data || error.message);
    throw new Error(`Vidu 智能超清失败: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * 广告成片
 */
export async function createCommercialVideo(options: {
  images: string[];
  prompt: string;
  duration?: number;
  ratio?: '16:9' | '9:16' | '1:1';
  language?: 'zh' | 'en';
  serverConfig?: ServerConfig;
}): Promise<{ taskId: string; status: string }> {
  const { images, prompt, duration = 30, ratio = '16:9', language = 'zh', serverConfig } = options;

  // 获取服务器配置
  const finalServerConfig = serverConfig || await getServerConfigByModelId('vidu-commercial');

  logger.info(`[Vidu] 广告成片请求:`, {
    imageCount: images.length,
    duration,
    ratio,
    language,
  });

  // 处理图片
  const processedImages = await Promise.all(images.map(img => processImageUrl(img)));

  try {
    const result = await wauleApiClient.createCommercialVideo({
      images: processedImages,
      prompt,
      duration,
      ratio,
      language,
    }, finalServerConfig);

    if (!result.data || result.data.length === 0) {
      throw new Error('WauleAPI 未返回视频数据');
    }

    const videoUrl = result.data[0].url;
    logger.info(`[Vidu] ✅ 广告成片成功:`, videoUrl);
    
    return {
      taskId: 'completed',
      status: videoUrl,
    };
  } catch (error: any) {
    logger.error('[Vidu] ❌ 广告成片失败:', error.response?.data || error.message);
    throw new Error(`Vidu 广告成片失败: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * 查询任务状态（兼容性保留）
 */
export async function queryTaskStatus(
  taskId: string,
  apiKey: string,
  apiUrl?: string
): Promise<any> {
  // 由于改为同步调用，此函数不再需要，但保留接口兼容性
  return { state: 'completed', task_id: taskId };
}

/**
 * 取消任务（兼容性保留）
 */
export async function cancelTask(
  taskId: string,
  apiKey: string,
  apiUrl?: string
): Promise<void> {
  // 由于改为同步调用，此函数不再需要，但保留接口兼容性
  logger.info(`[Vidu] 取消任务请求（已忽略）: ${taskId}`);
}

export default {
  imageToVideo,
  textToVideo,
  upscaleVideo,
  createCommercialVideo,
  queryTaskStatus,
  cancelTask,
};
