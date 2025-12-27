import axios from 'axios';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { downloadAndUploadToOss, streamDownloadAndUploadToOss } from '../../utils/oss';
import { storageService } from '../storage.service';

import { getGlobalWauleApiClient } from '../waule-api.client';
/**
 * 将本地图片URL转换为base64或保持原URL（如果是公网URL）
 */
async function processImageUrl(imageUrl: string): Promise<string> {
  // 所有素材都在 OSS，优先使用 URL 而不是 base64
  
  // 如果是 Base64，上传到 OSS 转为 URL
  if (imageUrl.startsWith('data:image/')) {
    console.log('🔄 检测到 Base64，上传到 OSS 转为 URL...', imageUrl.length, '字符');
    try {
      const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'jpeg' ? '.jpg' : `.${matches[1]}`;
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const ossUrl = await storageService.uploadBuffer(buffer, ext);
        console.log('✅ 已上传到 OSS:', ossUrl);
        return ossUrl;
      }
    } catch (e: any) {
      console.error('❌ 上传到 OSS 失败:', e.message);
      throw new Error('图片上传失败，请重试');
    }
  }
  
  // 公网 URL 直接返回
  if (imageUrl.startsWith('https://') || imageUrl.startsWith('http://')) {
    console.log('🌐 使用 URL:', imageUrl.substring(0, 80));
    return imageUrl;
  }
  
  // 其他情况报错
  console.error('❌ 不支持的图片格式:', imageUrl.substring(0, 50));
  throw new Error('不支持的图片格式，请使用 OSS URL');
}

interface DoubaoImageGenerateOptions {
  prompt: string;
  modelId: string;
  aspectRatio?: string;
  referenceImages?: string[];
  apiKey?: string;
  apiUrl?: string;
  maxImages?: number; // 组图生成时的最大图片数量（1-15）
}

/**
 * 将宽高比转换为豆包API支持的格式
 * Seedream 4.0 支持最高 4K 分辨率 (4096×4096)
 * 使用明确的像素尺寸格式：widthxheight
 */
function convertAspectRatio(ratio: string): string {
  const ratioMap: Record<string, string> = {
    '1:1': '4096x4096',      // 4K 方形 (1:1)
    '16:9': '3840x2160',     // 4K UHD 宽屏 (16:9)
    '9:16': '2160x3840',     // 4K UHD 竖屏 (9:16)
    '4:3': '4096x3072',      // 4K 标准 (4:3)
    '3:4': '3072x4096',      // 4K 标准竖屏 (3:4)
    '21:9': '3440x1440',     // 超宽屏 (21:9)
    '3:2': '4096x2731',      // 摄影比例 (3:2)
    '2:3': '2731x4096',      // 摄影竖屏 (2:3)
    '5:4': '4096x3277',      // 经典显示器比例 (5:4)
    '4:5': '3277x4096',      // 经典竖屏 (4:5)
  };
  return ratioMap[ratio] || '4096x4096';  // 默认4K方形
}


/**
 * 处理单张图片数据（Base64或URL）并保存到本地
 */
async function processImageData(imageData: any, index?: number): Promise<string> {
  if (!imageData.url && !imageData.b64_json) {
    throw new Error('图片数据中没有URL或Base64');
  }

  // 如果返回的是Base64，直接上传到 OSS
  if (imageData.b64_json) {
    console.log(`⚠️ 豆包返回了 Base64 数据${index ? ` (图片${index})` : ''}，上传到 OSS`);
    const imageBuffer = Buffer.from(imageData.b64_json, 'base64');
    const ossUrl = await storageService.uploadBuffer(imageBuffer, '.png');
    console.log(`✅ 豆包图片${index ? ` ${index}` : ''}已上传到 OSS: ${ossUrl} (${imageBuffer.length} bytes)`);
    return ossUrl;
  }

  // 如果返回的是公网URL，下载并上传到 OSS
  if (imageData.url) {
    console.log(`🌐 豆包返回公网 URL${index ? ` (图片${index})` : ''}，下载并上传到 OSS: ${imageData.url.substring(0, 80)}...`);
    try {
      const ossUrl = await downloadAndUploadToOss(imageData.url, 'doubao-image');
      console.log(`✅ 豆包图片${index ? ` ${index}` : ''}已上传到 OSS: ${ossUrl}`);
      return ossUrl;
    } catch (e: any) {
      console.error(`❌ 上传豆包图片${index ? ` ${index}` : ''}到 OSS 失败，返回原始URL:`, e.message);
      return imageData.url;
    }
  }

  throw new Error('无法处理图片数据');
}

/**
 * 豆包 SeedDream 图片生成
 * 返回值：单图生成返回单个 URL，组图生成返回 URL 数组
 */
export async function generateImage(options: DoubaoImageGenerateOptions): Promise<string | string[]> {
  const {
    prompt,
    modelId,
    aspectRatio = '1:1',
    referenceImages = [],
    apiKey,
    apiUrl,
    maxImages = 1, // 默认单图
  } = options;

  // API配置
  const API_KEY = apiKey || process.env.DOUBAO_API_KEY;
  const BASE_URL = apiUrl || 'https://ark.cn-beijing.volces.com/api/v3';

  // 如果 apiKey 为空，使用 waule-api 网关
  if (!API_KEY) {
    const wauleApiClient = getGlobalWauleApiClient();
    if (wauleApiClient) {
      console.log('🌐 [Doubao] apiKey 为空，使用 waule-api 网关生成图片, maxImages:', maxImages);
      const r = await wauleApiClient.generateImage({
        model: modelId,
        prompt,
        size: aspectRatio,
        reference_images: referenceImages || undefined,
        max_images: maxImages,
      });
      
      // 组图模式：返回所有图片URL
      if (maxImages > 1 && r?.data && r.data.length > 1) {
        const imageUrls = r.data.map((item: any) => item?.url).filter(Boolean);
        console.log(`🖼️ [Doubao] waule-api 组图生成完成，共 ${imageUrls.length} 张图片`);
        if (imageUrls.length === 0) throw new Error('waule-api 未返回图片数据');
        return imageUrls;
      }
      
      // 单图模式
      const imageUrl = r?.data?.[0]?.url;
      if (!imageUrl) throw new Error('waule-api 未返回图片数据');
      return imageUrl;
    }
    throw new Error('豆包 API 密钥未配置，且 waule-api 网关未配置');
  }

  // 是否为组图模式
  const isMultiImageMode = maxImages > 1;

  try {
    const size = convertAspectRatio(aspectRatio);
    
    // 构建请求体
    const requestBody: any = {
      model: modelId,
      prompt: prompt,
      size: size,
      n: 1,
      response_format: 'url', // 返回URL
      watermark: false, // 关闭水印
    };

    // 如果是组图模式（SeeDream 4.5），添加组图参数
    if (isMultiImageMode) {
      // 限制最大图片数量为15
      const clampedMaxImages = Math.min(Math.max(maxImages, 2), 15);
      requestBody.sequential_image_generation = 'auto';
      requestBody.sequential_image_generation_options = {
        max_images: clampedMaxImages,
      };
      requestBody.stream = false; // 组图模式必须关闭流式
      console.log(`🎨 豆包组图模式: 最多生成 ${clampedMaxImages} 张连贯图片`);
    }

    // 如果有参考图，使用图生图模式
    // 根据官方文档，使用 images 参数传入图片列表，支持最多 10 张
    if (referenceImages && referenceImages.length > 0) {
      // 处理参考图片：将本地路径转换为Base64
      const processedImages: string[] = [];
      for (const img of referenceImages.slice(0, 10)) {
        const processedUrl = await processImageUrl(img);
        processedImages.push(processedUrl);
      }
      
      console.log('处理后的图片格式:', processedImages.map((img, index) => ({
        index,
        type: img.startsWith('data:') ? 'Base64' : 'URL',
        prefix: img.substring(0, 50) + '...'
      })));
      
      // 注意：豆包 API 使用 image（单数），不是 images（复数）
      // 传递参考图数组
      requestBody.image = processedImages;
    }

    console.log('豆包 SeedDream API 请求:', {
      model: modelId,
      size,
      prompt: prompt.substring(0, 100),
      imageCount: requestBody.image?.length || 0,
      isMultiImageMode,
      maxImages: isMultiImageMode ? maxImages : 1,
    });

    // 组图模式使用10分钟超时（600秒），单图使用2分钟超时
    const timeout = isMultiImageMode ? 600000 : 120000;

    const response = await axios.post(`${BASE_URL}/images/generations`, requestBody, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout,
    });

    console.log('豆包 SeedDream API 响应状态:', response.status);
    console.log('豆包 SeedDream API 返回图片数量:', response.data?.data?.length || 0);

    if (!response.data || !response.data.data || response.data.data.length === 0) {
      console.error('豆包 API 响应格式错误:', JSON.stringify(response.data));
      throw new Error('豆包API未返回图片数据');
    }

    // 处理响应
    const imageDataArray = response.data.data;
    
    // 组图模式：处理所有返回的图片
    if (isMultiImageMode && imageDataArray.length > 1) {
      console.log(`🖼️ 豆包组图生成完成，共 ${imageDataArray.length} 张图片`);
      const imageUrls: string[] = [];
      for (let i = 0; i < imageDataArray.length; i++) {
        const imageUrl = await processImageData(imageDataArray[i], i + 1);
        imageUrls.push(imageUrl);
      }
      return imageUrls;
    }
    
    // 单图模式
    return await processImageData(imageDataArray[0]);
  } catch (error: any) {
    console.error('豆包 SeedDream 生成失败:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
      imagesCount: referenceImages.length,
      isMultiImageMode,
    });
    
    if (error.response?.data) {
      const errorData = error.response.data;
      const errorMessage = errorData.error?.message || JSON.stringify(errorData);
      
      // 如果是多图输入失败，提供提示
      if (referenceImages.length > 1) {
        console.log('多图输入提示: 豆包 Seedream 4.0 的多图融合功能需要在提示词中明确指定每张参考图的作用和权重。');
        console.log('建议提示词格式: "融合图1的XX（权重：70%）、图2的XX（权重：30%）..."');
      }
      
      throw new Error(`豆包API错误: ${errorMessage}`);
    }
    
    throw new Error(`豆包图片生成失败: ${error.message}`);
  }
}

/**
 * 将视频比例转换为豆包API支持的格式
 */
function convertVideoAspectRatio(ratio: string): string {
  const ratioMap: Record<string, string> = {
    '21:9': '21:9',
    '16:9': '16:9',
    '4:3': '4:3',
    '1:1': '1:1',
    '3:4': '3:4',
    '9:16': '9:16',
  };
  return ratioMap[ratio] || '16:9';
}

/**
 * 将视频分辨率转换为豆包API支持的格式
 */
function convertVideoResolution(resolution: string): string {
  const resolutionMap: Record<string, string> = {
    '720P': '720p',
    '1080P': '1080p',
    '2K': '2k',
    '4K': '4k',
  };
  return resolutionMap[resolution] || '1080p';
}

interface DoubaoVideoGenerateOptions {
  prompt: string;
  modelId: string;
  ratio?: string;
  resolution?: string;
  generationType?: string;
  duration?: number;
  referenceImages?: string[];
  apiKey?: string;
  apiUrl?: string;
}

/**
 * 豆包 SeeDance 视频生成
 * 使用 Content Generation Tasks API
 */
export async function generateVideo(options: DoubaoVideoGenerateOptions): Promise<string> {
  const {
    prompt,
    modelId,
    ratio = '16:9',
    resolution = '1080P',
    generationType = '文生视频',
    duration = 5,
    referenceImages = [],
    apiKey,
    apiUrl,
  } = options;

  const API_KEY = apiKey || process.env.DOUBAO_API_KEY;
  const BASE_URL = apiUrl || 'https://ark.cn-beijing.volces.com/api/v3';

  // 如果 apiKey 为空，使用 waule-api 网关
  if (!API_KEY) {
    const wauleApiClient = getGlobalWauleApiClient();
    if (wauleApiClient) {
      console.log('🌐 [Doubao] apiKey 为空，使用 waule-api 网关生成视频');
      const r = await wauleApiClient.generateVideo({
        model: modelId,
        prompt,
        duration,
        aspect_ratio: ratio,
        resolution,
        reference_images: referenceImages || undefined,
        generation_type: generationType,
      });
      const videoUrl = r?.data?.[0]?.url;
      if (!videoUrl) throw new Error('waule-api 未返回视频数据');
      return videoUrl;
    }
    throw new Error('豆包 API 密钥未配置，且 waule-api 网关未配置');
  }

  try {
    // 处理参考图片：将本地路径转换为Base64
    const processedImages: string[] = [];
    for (const img of referenceImages) {
      const processedUrl = await processImageUrl(img);
      processedImages.push(processedUrl);
    }

    // 构建提示词，将视频参数添加到提示词末尾
    let finalPrompt = prompt.trim();
    const videoParams: string[] = [];
    
    // 视频比例 - 单图首帧和首尾帧模式使用adaptive（自动适配图片比例）
    const canCustomizeRatio = generationType === '文生视频' || generationType === '参考图' || generationType === '主体参考';
    if (canCustomizeRatio) {
      videoParams.push(`--ratio ${ratio}`);
    } else {
      videoParams.push(`--ratio adaptive`);
    }
    
    // 视频时长
    videoParams.push(`--duration ${duration}`);
    
    // 视频分辨率（转换为小写）
    const resolutionMap: Record<string, string> = {
      '720P': '720p',
      '1080P': '1080p',
      '2K': '2k',
      '4K': '4k',
    };
    const videoResolution = resolutionMap[resolution] || '1080p';
    videoParams.push(`--resolution ${videoResolution}`);
    
    // 关闭水印
    videoParams.push('--watermark false');
    
    // 将参数添加到提示词末尾
    finalPrompt = finalPrompt + ' ' + videoParams.join(' ');
    
    console.log('豆包 SeeDance 视频生成参数:', {
      model: modelId,
      generationType,
      imageCount: processedImages.length,
      canCustomizeRatio,
      finalPrompt: finalPrompt.substring(0, 150),
    });

    // 构建content数组 - 根据豆包Seedance API文档
    const content: any[] = [
      {
        type: 'text',
        text: finalPrompt,
      }
    ];
    
    // 根据生成类型添加图片
    if (processedImages.length === 0) {
      console.log('📤 模式：文生视频');
    } else if (generationType === '参考图' || generationType === '主体参考') {
      console.log('📤 模式：参考图生视频，图片数量:', processedImages.length);
      processedImages.forEach((imageUrl) => {
        content.push({
          type: 'image_url',
          image_url: {
            url: imageUrl
          },
          role: 'reference_image'
        });
      });
    } else if (generationType === '首尾帧') {
      console.log('📤 模式：首尾帧生成视频（比例自动适配）');
      if (processedImages.length >= 2) {
        content.push({
          type: 'image_url',
          image_url: {
            url: processedImages[0]
          },
          role: 'first_frame'
        });
        content.push({
          type: 'image_url',
          image_url: {
            url: processedImages[1]
          },
          role: 'last_frame'
        });
      }
    } else if (generationType === '首帧') {
      // 根据官方文档，首帧图生视频不需要显式指定 role
      console.log('📤 模式：单图首帧生成视频（比例自动适配）');
      content.push({
        type: 'image_url',
        image_url: {
          url: processedImages[0]
        }
      });
    } else if (generationType === '尾帧') {
      // 尾帧需要显式指定 role
      console.log('📤 模式：单图尾帧生成视频（比例自动适配）');
      content.push({
        type: 'image_url',
        image_url: {
          url: processedImages[0]
        },
        role: 'last_frame'
      });
    } else {
      // 默认：单图首帧模式（不指定role）
      console.log('📤 模式：默认单图生成视频（比例自动适配）');
      content.push({
        type: 'image_url',
        image_url: {
          url: processedImages[0]
        }
      });
    }

    const requestBody = {
      model: modelId,
      content: content,
    };

    // 正确的API路径
    const apiUrl_final = `${BASE_URL}/contents/generations/tasks`;
    
    console.log('📤 完整请求URL:', apiUrl_final);
    // 详细日志：检查图片URL格式
    requestBody.content.forEach((c: any, i: number) => {
      if (c.type === 'image_url') {
        const url = c.image_url?.url || '';
        const isBase64 = url.startsWith('data:');
        console.log(`📤 图片${i}: ${isBase64 ? 'base64' : 'URL'}, 长度: ${url.length}, 前100字符: ${url.substring(0, 100)}`);
      }
    });
    console.log('📤 视频生成请求体:', JSON.stringify({
      ...requestBody,
      content: requestBody.content.map((c: any) => 
        c.type === 'image_url' ? { ...c, image_url: { url: '[BASE64/URL]' } } : c
      )
    }, null, 2));

    const response = await axios.post(
      apiUrl_final,
      requestBody,
      { 
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 300000 // 5分钟超时
      }
    );

    console.log('📤 API响应:', JSON.stringify(response.data, null, 2));

    // 返回任务ID
    const taskId = response.data.id;
    if (!taskId) {
      throw new Error('No task id returned from API');
    }
    
    console.log('🎬 收到任务ID:', taskId);
    const remoteVideoUrl = await pollContentGenerationTask(taskId, BASE_URL, API_KEY);
    // 下载视频并上传到 OSS
    try {
      console.log('📥 开始下载豆包视频并上传到 OSS:', remoteVideoUrl);
      const ossUrl = await streamDownloadAndUploadToOss(remoteVideoUrl, '.mp4');
      console.log('✅ 豆包视频已上传到 OSS:', ossUrl);
      return ossUrl;
    } catch (e: any) {
      console.error('❌ 上传豆包视频到 OSS 失败，返回远程URL:', e.message);
      return remoteVideoUrl;
    }
  } catch (error: any) {
    console.error('豆包 SeeDance 生成失败:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
      imagesCount: referenceImages.length,
    });
    
    if (error.response?.data) {
      const errorData = error.response.data;
      const errorMessage = errorData.error?.message || JSON.stringify(errorData);
      throw new Error(`豆包API错误: ${errorMessage}`);
    }
    
    throw new Error(`豆包视频生成失败: ${error.message}`);
  }
}

/**
 * 轮询Content Generation Task结果 (用于Seedance视频生成)
 */
async function pollContentGenerationTask(taskId: string, endpoint: string, apiKey: string, maxAttempts: number = 120): Promise<string> {
  console.log('🔄 开始轮询Content Generation Task结果, 任务ID:', taskId);
  
  const queryUrl = `${endpoint}/contents/generations/tasks/${taskId}`;
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await axios.get(queryUrl, { 
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 300000
      });

      console.log(`🔄 轮询第 ${i + 1} 次, 响应:`, JSON.stringify(response.data));

      const data = response.data;
      const status = data.status;
      
      if (status === 'succeeded') {
        // 成功，提取视频URL
        const videoUrl = data.content?.video_url;
        if (videoUrl) {
          console.log('✅ 视频生成成功:', videoUrl);
          return videoUrl;
        } else {
          throw new Error('Video URL not found in response');
        }
      } else if (status === 'failed') {
        const errorMsg = data.error || 'Video generation failed';
        console.error('❌ 视频生成失败:', errorMsg);
        throw new Error(errorMsg);
      } else if (status === 'cancelled') {
        throw new Error('Video generation was cancelled');
      }
      
      // 状态为 queued 或 running，继续等待
      console.log(`⏳ 视频生成中... 状态: ${status}, 等待10秒后重试`);
      await new Promise(resolve => setTimeout(resolve, 10000));
    } catch (error: any) {
      console.error(`❌ 轮询第 ${i + 1} 次失败:`, error.response?.data || error.message);
      
      // 如果是最后一次尝试或者是致命错误，直接抛出
      if (i === maxAttempts - 1 || error.response?.status === 401 || error.response?.status === 403) {
        throw error;
      }
      
      // 否则等待后重试
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  
  throw new Error('Video generation timeout after ' + maxAttempts + ' attempts (20 minutes)');
}

/**
 * 豆包文本生成
 */
export async function generateText(options: {
  prompt: string;
  systemPrompt?: string;
  modelId: string;
  temperature?: number;
  maxTokens?: number;
  imageUrls?: string[];
  videoUrls?: string[];
  apiKey?: string;
  apiUrl?: string;
}): Promise<string> {
  const {
    prompt,
    systemPrompt,
    modelId,
    temperature = 0.7,
    maxTokens = 4000,
    imageUrls,
    videoUrls,
    apiKey,
    apiUrl,
  } = options;

  const API_KEY = apiKey || process.env.DOUBAO_API_KEY;
  const BASE_URL = apiUrl || 'https://ark.cn-beijing.volces.com/api/v3';

  // 如果 apiKey 为空，使用 waule-api 网关
  if (!API_KEY) {
    const wauleApiClient = getGlobalWauleApiClient();
    if (wauleApiClient) {
      console.log('🌐 [Doubao] apiKey 为空，使用 waule-api 网关生成文本');
      const msgs: Array<{ role: string; content: any }> = [];
      if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
      const userContent: any[] = [{ type: 'text', text: prompt }];
      for (const url of (imageUrls || [])) {
        userContent.push({ type: 'image_url', image_url: { url } });
      }
      msgs.push({ role: 'user', content: userContent });
      const r = await wauleApiClient.chatCompletions({
        model: modelId,
        messages: msgs,
        temperature,
        max_tokens: maxTokens,
      });
      const text = r?.choices?.[0]?.message?.content;
      if (!text) throw new Error('waule-api 未返回文本内容');
      return text;
    }
    throw new Error('豆包 API 密钥未配置，且 waule-api 网关未配置');
  }

  try {
    const messages: any[] = [];
    
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt,
      });
    }
    
    // 构建用户消息内容（支持多模态）
    const userContent: any[] = [{ type: 'text', text: prompt }];
    
    // 添加图片（如果有）
    if (imageUrls && imageUrls.length > 0) {
      console.log('🖼️ 豆包处理图片URL:', imageUrls.length, '个');
      for (const rawUrl of imageUrls) {
        const finalUrl = toPublicUrlOrBase64(rawUrl);
        userContent.push({
          type: 'image_url',
          image_url: { url: finalUrl },
        });
        console.log(finalUrl.startsWith('data:') ? '✅ 使用Base64图片' : `✅ 使用公网URL: ${finalUrl}`);
      }
    }
    
    // 添加视频（如果有）
    if (videoUrls && videoUrls.length > 0) {
      console.log('🎬 豆包处理视频URL:', videoUrls.length, '个');
      for (const rawUrl of videoUrls) {
        const finalUrl = toPublicUrlOrBase64(rawUrl);
        userContent.push({
          type: 'video_url',
          video_url: { url: finalUrl },
        });
        console.log(finalUrl.startsWith('data:') ? '✅ 使用Base64视频' : `✅ 使用公网URL: ${finalUrl}`);
      }
    }
    
    messages.push({
      role: 'user',
      content: userContent,
    });

    console.log('📤 豆包API请求消息结构:', JSON.stringify({
      model: modelId,
      messagesCount: messages.length,
      userContentParts: userContent.length,
      contentTypes: userContent.map(c => c.type),
    }, null, 2));

    const response = await axios.post(
      `${BASE_URL}/chat/completions`,
      {
        model: modelId,
        messages,
        temperature,
        max_tokens: maxTokens,
      },
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000, // 增加超时时间以处理多模态内容
      }
    );

    if (!response.data?.choices?.[0]?.message?.content) {
      throw new Error('豆包API未返回文本内容');
    }

    return response.data.choices[0].message.content;
  } catch (error: any) {
    console.error('豆包文本生成失败:', error.response?.data || error.message);
    throw new Error(`豆包文本生成失败: ${error.message}`);
  }
}
/**
 * 优先返回公网URL；若不可用则回退为本地读取的Base64
 */
function toPublicUrlOrBase64(inputUrl: string): string {
  if (!inputUrl) return inputUrl;
  // 已是Base64
  if (inputUrl.startsWith('data:')) return inputUrl;
  const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';
  // 相对路径 /uploads/...
  if (inputUrl.startsWith('/uploads/')) {
    if (PUBLIC_BASE_URL) {
      const full = `${PUBLIC_BASE_URL}${inputUrl}`;
      return full;
    }
    // 无公网前缀则回退为本地Base64
    try {
      const fullPath = path.join(process.cwd(), inputUrl);
      const buf = fs.readFileSync(fullPath);
      const ext = path.extname(fullPath).toLowerCase();
      const mimeMap: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
      const mime = mimeMap[ext] || 'image/jpeg';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      return inputUrl;
    }
  }
  // 绝对URL
  if (inputUrl.startsWith('http://') || inputUrl.startsWith('https://')) {
    const lower = inputUrl.toLowerCase();
    if (lower.includes('localhost') || lower.includes('127.0.0.1')) {
      // 本地URL，尝试转换为公网URL
      if (PUBLIC_BASE_URL && inputUrl.includes('/uploads/')) {
        // 替换主机为公网域名
        const idx = inputUrl.indexOf('/uploads/');
        return `${PUBLIC_BASE_URL}${inputUrl.substring(idx)}`;
      }
      // 回退为Base64
      try {
        const urlObj = new URL(inputUrl);
        const fullPath = path.join(process.cwd(), urlObj.pathname);
        const buf = fs.readFileSync(fullPath);
        const ext = path.extname(fullPath).toLowerCase();
        const mimeMap: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
        const mime = mimeMap[ext] || 'image/jpeg';
        return `data:${mime};base64,${buf.toString('base64')}`;
      } catch {
        return inputUrl;
      }
    }
    // 已是公网URL
    return inputUrl;
  }
  // 其他情况原样返回
  return inputUrl;
}
