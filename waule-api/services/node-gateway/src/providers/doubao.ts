/**
 * Doubao (豆包) Provider
 * 字节跳动 AI 图片生成服务
 */

import axios from 'axios';
import { uploadBuffer, downloadAndUploadToOss } from '../oss';
import { log, getApiKey, recordKeyUsage } from './utils';

const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3';

// 宽高比转换（豆包支持的尺寸）
function convertAspectRatio(ratio: string): string {
  const ratioMap: Record<string, string> = {
    '1:1': '4096x4096',
    '16:9': '3840x2160',
    '9:16': '2160x3840',
    '4:3': '4096x3072',
    '3:4': '3072x4096',
    '5:4': '4096x3276',
    '4:5': '3276x4096',
    '21:9': '3440x1440',
    '3:2': '4096x2730',
    '2:3': '2730x4096',
  };
  return ratioMap[ratio] || '4096x4096';
}

export interface DoubaoImageOptions {
  model: string;
  prompt: string;
  size?: string;
  referenceImages?: string[];
  maxImages?: number; // SeeDream 4.5 组图数量 (1-15)
}

export async function generateImage(options: DoubaoImageOptions): Promise<{
  url: string;
  urls?: string[]; // 多图时返回所有URL
  revisedPrompt?: string;
}> {
  const { model, prompt, size, referenceImages, maxImages } = options;
  const { key: API_KEY, keyId } = getApiKey('doubao', 'DOUBAO_API_KEY');
  
  log('Doubao', `图片生成: model=${model}, refImages=${referenceImages?.length || 0}, maxImages=${maxImages || 1}`);
  
  // 处理参考图
  let processedImages: string[] = [];
  if (referenceImages && referenceImages.length > 0) {
    for (const img of referenceImages) {
      if (img.startsWith('data:')) {
        const matches = img.match(/^data:image\/(\w+);base64,(.+)$/);
        if (matches) {
          const ext = matches[1] === 'jpeg' ? '.jpg' : `.${matches[1]}`;
          const buffer = Buffer.from(matches[2], 'base64');
          const ossUrl = await uploadBuffer(buffer, ext, 'doubao');
          processedImages.push(ossUrl);
        }
      } else {
        processedImages.push(img);
      }
    }
  }
  
  const requestBody: any = {
    model: model.includes('seedream') ? model : 'doubao-seedream-4.0',
    prompt,
    size: size ? convertAspectRatio(size) : '4096x4096',
    n: 1,
    watermark: false, // 关闭水印
    response_format: 'url',
  };
  
  // SeeDream 4.5 组图功能 (doubao-seedream-4-5-251128)
  const isSeeDream45 = model === 'doubao-seedream-4-5-251128';
  if (isSeeDream45 && maxImages && maxImages > 1) {
    requestBody.sequential_image_generation = 'auto';
    requestBody.sequential_image_generation_options = {
      max_images: Math.min(Math.max(maxImages, 1), 15), // 限制在 1-15 之间
    };
    requestBody.stream = false;
    log('Doubao', `启用组图模式: max_images=${maxImages}`);
  }
  
  if (processedImages.length > 0) {
    // 豆包 Seedream 使用 "image" 参数传递参考图（支持数组，最多10张）
    requestBody.image = processedImages;
    log('Doubao', `添加参考图: ${processedImages.length}张`);
  }
  
  log('Doubao', `请求体: ${JSON.stringify(requestBody).substring(0, 500)}`);
  
  try {
    const response = await axios.post(
      `${DOUBAO_API_URL}/images/generations`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 600000, // 10分钟超时，组图生成需要更长时间
      }
    );
    
    recordKeyUsage(keyId, true);
    
    const imageDataArray = response.data.data;
    if (!imageDataArray || imageDataArray.length === 0) {
      throw new Error('No image data in response');
    }
    
    // 处理所有返回的图片
    // 优化：如果 AI 服务直接返回 URL，直接使用，不再上传 OSS
    const imageUrls: string[] = [];
    for (const imageData of imageDataArray) {
      let imageUrl: string;
      
      if (imageData.url) {
        // 直接使用 AI 服务返回的 URL（豆包 CDN）
        imageUrl = imageData.url;
        log('Doubao', `使用原始URL: ${imageUrl.substring(0, 80)}...`);
      } else if (imageData.b64_json) {
        // base64 需要上传到 OSS
        const buffer = Buffer.from(imageData.b64_json, 'base64');
        imageUrl = await uploadBuffer(buffer, '.png', 'doubao');
      } else {
        log('Doubao', `跳过无效图片数据`);
        continue;
      }
      imageUrls.push(imageUrl);
    }
    
    if (imageUrls.length === 0) {
      throw new Error('No valid image URLs in response');
    }
    
    log('Doubao', `图片生成成功: ${imageUrls.length}张图片`);
    
    // 返回第一张图片的URL作为主URL，同时返回所有URL
    return {
      url: imageUrls[0],
      urls: imageUrls.length > 1 ? imageUrls : undefined,
      revisedPrompt: imageDataArray[0]?.revised_prompt,
    };
    
  } catch (error: any) {
    recordKeyUsage(keyId, false, error.message);
    log('Doubao', `图片生成失败: ${error.message}`);
    throw new Error(`Doubao image generation failed: ${error.response?.data?.error?.message || error.message}`);
  }
}

// ========== 视频生成 ==========

export interface DoubaoVideoOptions {
  model: string;
  prompt: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string; // 720p, 1080p
  referenceImages?: string[];
}

export async function generateVideo(options: DoubaoVideoOptions): Promise<{
  url: string;
  duration: number;
}> {
  const { model, prompt, duration = 5, aspectRatio = '16:9', resolution = '720p', referenceImages } = options;
  const { key: API_KEY, keyId } = getApiKey('doubao', 'DOUBAO_API_KEY');
  
  log('Doubao', `视频生成: model=${model}, duration=${duration}s, resolution=${resolution}, refImages=${referenceImages?.length || 0}`);
  
  // 处理首帧和尾帧图片
  const processImage = async (img: string): Promise<string> => {
    if (img.startsWith('data:')) {
      const matches = img.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'jpeg' ? '.jpg' : `.${matches[1]}`;
        const buffer = Buffer.from(matches[2], 'base64');
        return await uploadBuffer(buffer, ext, 'doubao');
      }
    }
    return img;
  };
  
  let firstFrameUrl: string | undefined;
  let lastFrameUrl: string | undefined;
  
  if (referenceImages && referenceImages.length > 0) {
    firstFrameUrl = await processImage(referenceImages[0]);
    if (referenceImages.length > 1) {
      lastFrameUrl = await processImage(referenceImages[1]);
    }
  }
  
  // 使用正确的 API 端点和请求格式（官方文档格式）
  const modelName = model.includes('seedance') ? model : 'doubao-seedance-1-0-lite-250428';
  
  // 构建 prompt，添加参数（通过 --xxx 格式）
  let finalPrompt = prompt || '';
  finalPrompt += ` --ratio ${aspectRatio} --dur ${duration} --rs ${resolution} --wm false`;
  
  // 构建 content 数组
  const content: any[] = [
    { type: 'text', text: finalPrompt }
  ];
  
  // 首尾帧模式
  if (firstFrameUrl && lastFrameUrl) {
    // 首尾帧：需要 role 标记
    content.push({
      type: 'image_url',
      image_url: { url: firstFrameUrl },
      role: 'first_frame'
    });
    content.push({
      type: 'image_url',
      image_url: { url: lastFrameUrl },
      role: 'last_frame'
    });
  } else if (firstFrameUrl) {
    // 仅首帧：不需要 role
    content.push({
      type: 'image_url',
      image_url: { url: firstFrameUrl }
    });
  }
  
  const requestBody: any = {
    model: modelName,
    content
  };
  
  log('Doubao', `视频请求: 首帧=${!!firstFrameUrl}, 尾帧=${!!lastFrameUrl}, prompt=${finalPrompt.substring(0, 100)}`);
  
  try {
    // 提交异步任务
    const submitResponse = await axios.post(
      `${DOUBAO_API_URL}/contents/generations/tasks`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    
    const taskId = submitResponse.data.id;
    if (!taskId) {
      throw new Error('No task ID returned');
    }
    
    log('Doubao', `视频任务已提交: ${taskId}`);
    
    // 轮询任务状态
    const maxAttempts = 120; // 最多等待 20 分钟
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 10000)); // 每 10 秒查询一次
      
      const statusResponse = await axios.get(
        `${DOUBAO_API_URL}/contents/generations/tasks/${taskId}`,
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
          },
          timeout: 30000,
        }
      );
      
      const status = statusResponse.data.status;
      log('Doubao', `视频任务状态: ${status} (${i + 1}/${maxAttempts})`);
      
      if (status === 'succeeded') {
        // 从响应中提取视频 URL
        log('Doubao', `任务完成，完整响应: ${JSON.stringify(statusResponse.data)}`);
        
        const data = statusResponse.data;
        let videoUrl: string | undefined;
        
        // 尝试多种格式解析
        // 格式1: data.content.video_url (豆包实际格式)
        if (data.content?.video_url) {
          videoUrl = data.content.video_url;
        }
        
        // 格式2: content 是数组的情况
        if (!videoUrl && Array.isArray(data.content)) {
          for (const item of data.content) {
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
        
        // 格式3: 直接在 data.video_url
        if (!videoUrl && data.video_url) {
          videoUrl = typeof data.video_url === 'string' ? data.video_url : data.video_url.url;
        }
        
        // 格式4: data.output.video_url
        if (!videoUrl && data.output?.video_url) {
          videoUrl = data.output.video_url;
        }
        
        if (!videoUrl) {
          throw new Error(`No video URL in response: ${JSON.stringify(data).substring(0, 500)}`);
        }
        
        // 直接使用 AI 服务返回的 URL（豆包 CDN），不再上传 OSS
        log('Doubao', `视频生成成功，使用原始URL: ${videoUrl.substring(0, 80)}...`);
        
        recordKeyUsage(keyId, true);
        return { url: videoUrl, duration };
      } else if (status === 'failed') {
        throw new Error(statusResponse.data.error?.message || 'Video generation failed');
      }
    }
    
    throw new Error('Video generation timeout');
    
  } catch (error: any) {
    recordKeyUsage(keyId, false, error.message);
    log('Doubao', `视频生成失败: ${error.message}`);
    throw new Error(`Doubao video generation failed: ${error.response?.data?.error?.message || error.message}`);
  }
}
