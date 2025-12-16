/**
 * MiniMax Provider
 * 海螺AI 视频/图片/语音服务
 */

import axios from 'axios';
import { uploadBuffer, downloadAndUploadToOss } from '../oss';
import { log, getApiKey, recordKeyUsage } from './utils';

const MINIMAX_API_URL = 'https://api.minimaxi.com/v1';

export interface MinimaxVideoOptions {
  model: string;
  prompt: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  referenceImages?: string[];
}

export interface MinimaxImageOptions {
  model: string;
  prompt: string;
  aspectRatio?: string;
  referenceImages?: string[];
  n?: number;
}

export interface MinimaxAudioOptions {
  model: string;
  text: string;
  voiceId?: string;
  speed?: number;
}

// 视频生成
export async function generateVideo(options: MinimaxVideoOptions): Promise<{
  url: string;
  duration: number;
}> {
  const { model, prompt, duration = 5, resolution = '1080P', referenceImages } = options;
  const { key: API_KEY, keyId } = getApiKey('minimax', 'MINIMAX_API_KEY');
  
  log('MiniMax', `视频生成: model=${model}, duration=${duration}s, resolution=${resolution}`);
  
  // 处理参考图（支持首尾帧）
  let firstFrameImage: string | undefined;
  let lastFrameImage: string | undefined;
  
  const processImage = async (img: string): Promise<string> => {
    if (img.startsWith('data:')) {
      const matches = img.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'jpeg' ? '.jpg' : `.${matches[1]}`;
        const buffer = Buffer.from(matches[2], 'base64');
        return await uploadBuffer(buffer, ext, 'minimax');
      }
    }
    return img;
  };
  
  if (referenceImages && referenceImages.length > 0) {
    firstFrameImage = await processImage(referenceImages[0]);
    if (referenceImages.length >= 2) {
      lastFrameImage = await processImage(referenceImages[1]);
      log('MiniMax', `首尾帧模式: first=${firstFrameImage?.substring(0, 50)}, last=${lastFrameImage?.substring(0, 50)}`);
    }
  }
  
  try {
    // 创建任务
    const requestBody: any = {
      prompt,
      model: model || 'video-01',
      resolution: resolution,
    };
    if (firstFrameImage) requestBody.first_frame_image = firstFrameImage;
    if (lastFrameImage) requestBody.last_frame_image = lastFrameImage;
    
    log('MiniMax', `请求体: ${JSON.stringify(requestBody).substring(0, 300)}`);
    
    const createResponse = await axios.post(
      `${MINIMAX_API_URL}/video_generation`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    
    const taskId = createResponse.data.task_id;
    if (!taskId) throw new Error('No task_id in MiniMax response');
    
    log('MiniMax', `任务已创建: ${taskId}`);
    
    // 轮询查询状态
    let fileId: string | null = null;
    for (let i = 0; i < 120; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const statusResponse = await axios.get(
        `${MINIMAX_API_URL}/query/video_generation?task_id=${taskId}`,
        { headers: { 'Authorization': `Bearer ${API_KEY}` }, timeout: 10000 }
      );
      
      const status = statusResponse.data.status;
      log('MiniMax', `轮询 ${i + 1}/120: status=${status}, response=${JSON.stringify(statusResponse.data).substring(0, 200)}`);
      
      if (status === 'Success' || status === 'Finished') {
        fileId = statusResponse.data.file_id;
        log('MiniMax', `任务成功, file_id=${fileId}`);
        break;
      }
      if (status === 'Fail' || status === 'Failed') {
        throw new Error(statusResponse.data.base_resp?.status_msg || 'MiniMax task failed');
      }
    }
    
    if (!fileId) throw new Error('MiniMax task timeout');
    
    // 获取下载URL
    const downloadResponse = await axios.get(
      `${MINIMAX_API_URL}/files/retrieve?file_id=${fileId}`,
      { headers: { 'Authorization': `Bearer ${API_KEY}` }, timeout: 10000 }
    );
    
    const videoUrl = downloadResponse.data.file?.download_url;
    if (!videoUrl) throw new Error('No download_url in MiniMax response');
    
    recordKeyUsage(keyId, true);
    // 直接使用 AI 服务返回的 URL（海螺 CDN），不再上传 OSS
    log('MiniMax', `视频生成成功，使用原始URL: ${videoUrl.substring(0, 80)}...`);
    return { url: videoUrl, duration };
    
  } catch (error: any) {
    recordKeyUsage(keyId, false, error.message);
    log('MiniMax', `视频生成失败: ${error.message}`);
    throw new Error(`MiniMax video generation failed: ${error.response?.data?.base_resp?.status_msg || error.message}`);
  }
}

// 图片生成
export async function generateImage(options: MinimaxImageOptions): Promise<{
  url: string;
  revisedPrompt?: string;
}> {
  const { model, prompt, aspectRatio = '1:1', referenceImages, n = 1 } = options;
  const { key: API_KEY, keyId } = getApiKey('minimax', 'MINIMAX_API_KEY');
  
  log('MiniMax', `图片生成: model=${model}, aspectRatio=${aspectRatio}`);
  
  // 处理参考图
  let imageUrls: string[] = [];
  if (referenceImages && referenceImages.length > 0) {
    for (const img of referenceImages) {
      if (img.startsWith('data:')) {
        const matches = img.match(/^data:image\/(\w+);base64,(.+)$/);
        if (matches) {
          const ext = matches[1] === 'jpeg' ? '.jpg' : `.${matches[1]}`;
          const buffer = Buffer.from(matches[2], 'base64');
          const ossUrl = await uploadBuffer(buffer, ext, 'minimax');
          imageUrls.push(ossUrl);
        }
      } else {
        imageUrls.push(img);
      }
    }
  }
  
  const requestBody: any = {
    model: model || 'image-01',
    prompt,
    aspect_ratio: aspectRatio,
    n,
    response_format: 'url',
  };
  
  // 添加参考图
  if (imageUrls.length > 0) {
    if (imageUrls.length === 1) {
      requestBody.subject_reference = [{ type: 'character', image_file: imageUrls[0] }];
    } else {
      requestBody.subject_reference = [{ type: 'character', image_files: imageUrls }];
    }
    log('MiniMax', `添加参考图: ${imageUrls.length}张`);
  }
  
  try {
    const response = await axios.post(
      `${MINIMAX_API_URL}/image_generation`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 180000,
      }
    );
    
    const data = response.data || {};
    
    // 尝试多种路径获取图片URL
    let imageUrl = data.data?.image_urls?.[0] 
      || data.image_urls?.[0] 
      || data.data?.image_url 
      || data.image_url
      || data.data?.images?.[0]?.url
      || data.images?.[0]?.url;
    
    // 如果返回 file_id，需要获取下载链接
    const fileId = data.file_id || data.data?.file_id;
    if (!imageUrl && fileId) {
      const retrieveResponse = await axios.get(
        `${MINIMAX_API_URL}/files/retrieve?file_id=${fileId}`,
        { headers: { 'Authorization': `Bearer ${API_KEY}` }, timeout: 30000 }
      );
      imageUrl = retrieveResponse.data.file?.download_url || retrieveResponse.data.file?.url;
    }
    
    // 如果返回 base64，需要上传到 OSS
    const b64 = data.data?.images?.[0]?.b64_json || data.images?.[0]?.b64_json;
    if (!imageUrl && b64) {
      const buffer = Buffer.from(b64, 'base64');
      imageUrl = await uploadBuffer(buffer, '.png', 'minimax');
      log('MiniMax', `base64 已上传到 OSS: ${imageUrl.substring(0, 80)}...`);
    }
    
    if (!imageUrl) {
      log('MiniMax', `响应数据: ${JSON.stringify(data).substring(0, 500)}`);
      throw new Error('MiniMax response missing image URL');
    }
    
    recordKeyUsage(keyId, true);
    // 直接使用 URL（海螺 CDN 或 OSS），不再重复上传
    log('MiniMax', `图片生成成功: ${imageUrl.substring(0, 80)}...`);
    return { url: imageUrl };
    
  } catch (error: any) {
    recordKeyUsage(keyId, false, error.message);
    log('MiniMax', `图片生成失败: ${error.message}`);
    throw new Error(`MiniMax image generation failed: ${error.response?.data?.base_resp?.status_msg || error.message}`);
  }
}

// 语音合成
export async function synthesizeSpeech(options: MinimaxAudioOptions): Promise<{
  url: string;
}> {
  const { text, voiceId = 'female-shaonv', speed = 1.0 } = options;
  const { key: API_KEY, keyId } = getApiKey('minimax', 'MINIMAX_API_KEY');
  
  log('MiniMax', `语音合成: chars=${text.length}`);
  
  try {
    const response = await axios.post(
      `${MINIMAX_API_URL}/text_to_speech`,
      {
        text,
        voice_id: voiceId,
        speed,
        model: 'speech-01',
      },
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        timeout: 60000,
      }
    );
    
    // 检查是否是错误响应
    const contentType = response.headers['content-type'];
    if (contentType?.includes('application/json')) {
      const errorData = JSON.parse(response.data.toString());
      throw new Error(errorData.base_resp?.status_msg || 'MiniMax TTS failed');
    }
    
    recordKeyUsage(keyId, true);
    const ossUrl = await uploadBuffer(Buffer.from(response.data), '.mp3', 'minimax');
    
    log('MiniMax', `语音合成成功: ${ossUrl}`);
    return { url: ossUrl };
    
  } catch (error: any) {
    recordKeyUsage(keyId, false, error.message);
    log('MiniMax', `语音合成失败: ${error.message}`);
    throw new Error(`MiniMax TTS failed: ${error.message}`);
  }
}
