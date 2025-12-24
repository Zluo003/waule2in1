/**
 * 通义万相 AI 服务 - 通过 WauleAPI 网关调用
 * 
 * 改造说明：
 * - 视频生成改为调用 wauleapi 的 v1 统一接口
 * - API Key 由 wauleapi 管理
 * - 大模型返回结果的 OSS 上传由 wauleapi 处理
 */

import { uploadBuffer } from '../../utils/oss';
import { wauleApiClient, getServerConfigByModelId, ServerConfig } from '../wauleapi-client';

// ==================== 工具函数 ====================

/**
 * 处理参考图片URL
 * - Base64 → 上传 OSS → 返回 OSS URL
 * - 公网 URL → 直接返回
 */
async function processImageUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:image/')) {
    console.log('🔄 [Wanx] 检测到 Base64，上传到 OSS 转为 URL...', imageUrl.length, '字符');
    try {
      const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'jpeg' ? '.jpg' : `.${matches[1]}`;
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const ossUrl = await uploadBuffer(buffer, ext);
        console.log('✅ [Wanx] 已上传到 OSS:', ossUrl);
        return ossUrl;
      }
    } catch (e: any) {
      console.error('❌ [Wanx] 上传到 OSS 失败:', e.message);
      throw new Error('图片上传失败，请重试');
    }
  }
  
  if (imageUrl.startsWith('https://') || imageUrl.startsWith('http://')) {
    return imageUrl;
  }
  
  throw new Error('不支持的图片格式');
}

// ==================== 接口定义 ====================

interface WanxVideoGenerateOptions {
  prompt: string;
  modelId: string;
  firstFrameImage?: string;
  duration?: number;
  resolution?: string;
  replaceImageUrl?: string;
  replaceVideoUrl?: string;
  mode?: string;
  useIntl?: boolean;
  serverConfig?: ServerConfig; // 服务器配置（来自数据库）
  apiKey?: string; // 已废弃，保留向后兼容
  apiUrl?: string; // 已废弃，保留向后兼容
}

interface VideoRetalkOptions {
  videoUrl: string;
  audioUrl: string;
  refImageUrl?: string;
  videoExtension?: boolean;
  useIntl?: boolean;
  serverConfig?: ServerConfig;
}

interface VideoStylizeOptions {
  videoUrl: string;
  style?: number;
  videoFps?: number;
  minLen?: number;
  useIntl?: boolean;
  serverConfig?: ServerConfig;
}

// ==================== AI 服务函数 ====================

/**
 * 通义万相 - 首帧生视频
 * 返回值：视频 URL (已经是 OSS URL)
 */
export async function generateVideoFromFirstFrame(options: WanxVideoGenerateOptions): Promise<string> {
  const {
    prompt,
    modelId,
    firstFrameImage,
    duration = 5,
    resolution = '1080P',
    replaceImageUrl,
    replaceVideoUrl,
    mode = 'wan-std',
    useIntl = false,
    serverConfig,
  } = options;

  // 获取服务器配置
  const finalServerConfig = serverConfig || await getServerConfigByModelId(modelId);

  // 处理首帧图片
  let processedFirstFrame: string | undefined;
  if (firstFrameImage) {
    processedFirstFrame = await processImageUrl(firstFrameImage);
  }

  console.log('[Wanx] 视频生成请求:', {
    model: modelId,
    duration,
    resolution,
    hasFirstFrame: !!processedFirstFrame,
    hasReplaceImage: !!replaceImageUrl,
  });

  try {
    const result = await wauleApiClient.generateVideo({
      model: modelId,
      prompt,
      duration,
      resolution,
      reference_images: processedFirstFrame ? [processedFirstFrame] : undefined,
      use_intl: useIntl,
      replace_image_url: replaceImageUrl,
      replace_video_url: replaceVideoUrl,
      mode,
    }, finalServerConfig);

    if (!result.data || result.data.length === 0) {
      throw new Error('WauleAPI 未返回视频数据');
    }

    const videoUrl = result.data[0].url;
    console.log('[Wanx] 视频生成成功:', videoUrl);
    return videoUrl;
  } catch (error: any) {
    console.error('[Wanx] 视频生成失败:', error.response?.data || error.message);
    throw new Error(`通义万相视频生成失败: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * 通义万相 - 文生视频（无首帧）
 */
export async function generateVideoFromText(options: WanxVideoGenerateOptions): Promise<string> {
  return generateVideoFromFirstFrame({
    ...options,
    firstFrameImage: undefined,
  });
}

/**
 * 视频对口型（音频驱动口型）
 * 注意：此功能需要 waule-api 端支持专用路由
 */
export async function generateVideoRetalk(options: VideoRetalkOptions): Promise<string> {
  const { videoUrl, audioUrl, refImageUrl, videoExtension, useIntl = false, serverConfig } = options;

  // 获取服务器配置
  const finalServerConfig = serverConfig || await getServerConfigByModelId('videoretalk');

  console.log('[Wanx] 视频对口型请求:', {
    videoUrl: videoUrl?.substring(0, 50),
    audioUrl: audioUrl?.substring(0, 50),
    hasRefImage: !!refImageUrl,
  });

  try {
    const result = await wauleApiClient.generateVideo({
      model: 'videoretalk',
      prompt: '',
      replace_video_url: videoUrl,
      audio_url: audioUrl,
      reference_images: refImageUrl ? [refImageUrl] : undefined,
      video_extension: videoExtension,
      use_intl: useIntl,
    }, finalServerConfig);

    if (!result.data || result.data.length === 0) {
      throw new Error('WauleAPI 未返回视频数据');
    }

    const resultUrl = result.data[0].url;
    console.log('[Wanx] 视频对口型成功:', resultUrl);
    return resultUrl;
  } catch (error: any) {
    console.error('[Wanx] 视频对口型失败:', error.response?.data || error.message);
    throw new Error(`视频对口型失败: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * 视频风格转绘
 * 注意：此功能需要 waule-api 端支持专用路由
 */
export async function generateVideoStylize(options: VideoStylizeOptions): Promise<string> {
  const { videoUrl, style, videoFps, minLen, useIntl = false, serverConfig } = options;

  // 获取服务器配置
  const finalServerConfig = serverConfig || await getServerConfigByModelId('video-style-transform');

  console.log('[Wanx] 视频风格转绘请求:', {
    videoUrl: videoUrl?.substring(0, 50),
    style,
  });

  try {
    const result = await wauleApiClient.generateVideo({
      model: 'video-style-transform',
      prompt: '',
      replace_video_url: videoUrl,
      style,
      video_fps: videoFps,
      min_len: minLen,
      use_intl: useIntl,
    }, finalServerConfig);

    if (!result.data || result.data.length === 0) {
      throw new Error('WauleAPI 未返回视频数据');
    }

    const resultUrl = result.data[0].url;
    console.log('[Wanx] 视频风格转绘成功:', resultUrl);
    return resultUrl;
  } catch (error: any) {
    console.error('[Wanx] 视频风格转绘失败:', error.response?.data || error.message);
    throw new Error(`视频风格转绘失败: ${error.response?.data?.error?.message || error.message}`);
  }
}
