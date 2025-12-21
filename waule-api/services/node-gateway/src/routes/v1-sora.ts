/**
 * Sora 专用路由
 * 转发到 sora2api 或 future-sora-api 中转服务
 * 支持：视频生成、角色创建等所有sora功能
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import { downloadAndUploadToOss } from '../oss';
import { getSoraProxyConfig } from '../db';

const router = Router();

const SORA2API_URL = process.env.SORA2API_URL || 'http://localhost:8000';
const SORA_API_KEY = process.env.SORA_API_KEY || '';

// 启动时打印配置（调试用）
console.log(`[Sora] 配置: SORA2API_URL=${SORA2API_URL}, SORA_API_KEY=${SORA_API_KEY ? SORA_API_KEY.substring(0, 4) + '****' : '(未配置)'}`);

function log(msg: string, data?: any) {
  console.log(`[${new Date().toISOString()}] [Sora] ${msg}`, data || '');
}

// 获取Sora中转API配置
function getSoraApiConfig() {
  const config = getSoraProxyConfig();
  return {
    baseUrl: config?.base_url || 'https://future-api.vodeshop.com',
    apiKey: config?.api_key || '',
    isActive: config?.is_active === 1,
    channel: config?.channel || 'sora2api',
  };
}

// 解析模型名称，提取方向和时长
// 格式: sora-video-{orientation}-{duration}s 或 sora-2 等
function parseModelName(model: string): { orientation: 'landscape' | 'portrait'; duration: number; baseModel: string } {
  // 默认值
  let orientation: 'landscape' | 'portrait' = 'landscape';
  let duration = 10;
  let baseModel = 'sora-2';
  
  // 解析 sora-video-landscape-10s 格式
  const match = model.match(/sora-video-(landscape|portrait)-(\d+)s?/i);
  if (match) {
    orientation = match[1].toLowerCase() as 'landscape' | 'portrait';
    duration = parseInt(match[2], 10);
  }
  
  // 解析 sora-2-pro 等
  if (model.includes('pro')) {
    baseModel = 'sora-2-pro';
  }
  
  return { orientation, duration, baseModel };
}

// 从消息中提取prompt
function extractPromptFromMessages(messages: any[]): string {
  if (!messages || !Array.isArray(messages)) return '';
  
  // 找最后一条用户消息
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        return msg.content;
      }
      // 处理多模态消息
      if (Array.isArray(msg.content)) {
        const textPart = msg.content.find((p: any) => p.type === 'text');
        if (textPart) return textPart.text;
      }
    }
  }
  return '';
}

// 从消息中提取图片URL
function extractImagesFromMessages(messages: any[]): string[] {
  const images: string[] = [];
  if (!messages || !Array.isArray(messages)) return images;
  
  for (const msg of messages) {
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'image_url' && part.image_url?.url) {
          images.push(part.image_url.url);
        }
      }
    }
  }
  return images;
}

// 从消息中提取视频URL
function extractVideoFromMessages(messages: any[]): string | null {
  if (!messages || !Array.isArray(messages)) return null;
  
  for (const msg of messages) {
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'video_url' && part.video_url?.url) {
          return part.video_url.url;
        }
      }
    }
  }
  return null;
}

// 通过 future-sora-api 创建角色
// API: POST /v1/characters { url, timestamps }
async function createCharacterViaFutureSoraApi(
  config: { baseUrl: string; apiKey: string },
  videoUrl: string
): Promise<any> {
  log('使用 future-sora-api 创建角色', { baseUrl: config.baseUrl, videoUrl: videoUrl.substring(0, 80) });
  
  // 默认timestamps: 1,3 (视频的1-3秒用于角色识别)
  const response = await axios.post(
    `${config.baseUrl}/v1/characters`,
    {
      url: videoUrl,
      timestamps: '1,3',
    },
    {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    }
  );
  
  log('角色创建成功', { response: JSON.stringify(response.data).substring(0, 200) });
  return response.data;
}

// 提取所有媒体URL（视频和图片）
function extractAllMediaUrls(content: string): { url: string; type: 'video' | 'image' }[] {
  const results: { url: string; type: 'video' | 'image' }[] = [];
  
  // 提取视频URL
  const videoRegex = /<video[^>]+src=['"]([^'"]+)['"]/gi;
  let match;
  while ((match = videoRegex.exec(content)) !== null) {
    results.push({ url: match[1], type: 'video' });
  }
  
  // 提取图片URL
  const imgRegex = /<img[^>]+src=['"]([^'"]+)['"]/gi;
  while ((match = imgRegex.exec(content)) !== null) {
    results.push({ url: match[1], type: 'image' });
  }
  
  return results;
}

// 替换URL
function replaceUrl(content: string, oldUrl: string, newUrl: string): string {
  return content.split(oldUrl).join(newUrl);
}

// 解析SSE响应
function parseSSEResponse(sseText: string): { content: string; rawChunks: any[] } {
  const lines = sseText.split('\n');
  const chunks: any[] = [];
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.substring(6).trim();
      if (data === '[DONE]') break;
      try { chunks.push(JSON.parse(data)); } catch {}
    }
  }
  
  let fullContent = '';
  for (const chunk of chunks) {
    const content = chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.message?.content;
    if (content && typeof content === 'string') fullContent += content;
  }
  
  return { content: fullContent, rawChunks: chunks };
}

// 通过 future-sora-api 中转创建视频
// API文档: POST /v1/videos (multipart/form-data), GET /v1/videos/{id}
async function createVideoViaFutureSoraApi(
  config: { baseUrl: string; apiKey: string },
  params: { prompt: string; images: string[]; orientation: string; duration: number; model: string }
): Promise<any> {
  // orientation 映射为 size: landscape -> 1280x720, portrait -> 720x1280
  const size = params.orientation === 'portrait' ? '720x1280' : '1280x720';
  
  log('使用 future-sora-api 创建视频', { 
    baseUrl: config.baseUrl, 
    orientation: params.orientation,
    size: size,
    seconds: params.duration,
    model: params.model,
    hasImages: params.images.length > 0 
  });
  
  // 构建 multipart/form-data 请求体
  const formData = new FormData();
  formData.append('model', params.model);
  formData.append('prompt', params.prompt);
  formData.append('seconds', params.duration.toString());
  formData.append('size', size);
  formData.append('watermark', 'false');
  formData.append('private', 'false');
  
  // 如果有参考图片，下载并作为 input_reference 文件上传
  if (params.images && params.images.length > 0) {
    const imageUrl = params.images[0];
    try {
      let imageBuffer: Buffer;
      let imageName = 'reference.png';
      
      if (imageUrl.startsWith('data:')) {
        // base64 图片
        const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');
        imageBuffer = Buffer.from(base64Data, 'base64');
        log('使用 base64 图片作为参考');
      } else if (imageUrl.startsWith('http')) {
        // URL 图片，需要下载
        log('下载参考图片', { url: imageUrl.substring(0, 80) });
        const imageResponse = await axios.get(imageUrl, { 
          responseType: 'arraybuffer',
          timeout: 30000,
        });
        imageBuffer = Buffer.from(imageResponse.data);
        // 从URL提取文件名
        try {
          const urlPath = new URL(imageUrl).pathname;
          imageName = urlPath.split('/').pop() || 'reference.png';
        } catch {}
        log('参考图片下载成功', { size: imageBuffer.length, name: imageName });
      } else {
        throw new Error('不支持的图片格式');
      }
      
      // 添加图片作为 input_reference 文件
      formData.append('input_reference', imageBuffer, {
        filename: imageName,
        contentType: 'image/png',
      });
      log('已添加 input_reference 文件到视频创建请求');
    } catch (imgError: any) {
      log('处理参考图片失败', { error: imgError.message });
      // 继续创建视频，但不使用参考图片
    }
  }
  
  // 创建视频任务 - POST /v1/videos
  const createResponse = await axios.post(
    `${config.baseUrl}/v1/videos`,
    formData,
    {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        ...formData.getHeaders(),
      },
      timeout: 60000,
    }
  );
  
  // 响应中获取 task_id
  const taskId = createResponse.data.id || createResponse.data.task_id;
  log('视频任务已创建', { taskId, response: JSON.stringify(createResponse.data).substring(0, 200) });
  
  if (!taskId) {
    log('未获取到任务ID', { response: createResponse.data });
    return { success: false, error: '未获取到任务ID' };
  }
  
  // 轮询查询任务状态 - GET /v1/videos/{task_id}
  const maxAttempts = 180; // 最多等待15分钟
  const pollInterval = 5000; // 5秒查询一次
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    
    const queryResponse = await axios.get(
      `${config.baseUrl}/v1/videos/${taskId}`,
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
        },
        timeout: 30000,
      }
    );
    
    const data = queryResponse.data;
    const status = data.status;
    log(`任务状态查询 [${attempt + 1}/${maxAttempts}]`, { taskId, status });
    
    // 检查是否完成
    if (status === 'completed' || status === 'success' || status === 'done') {
      const videoUrl = data.video_url || data.url || data.result?.url;
      log('视频生成完成', { taskId, videoUrl: videoUrl?.substring(0, 80) });
      return { success: true, videoUrl, data };
    }
    
    // 检查是否失败
    if (status === 'failed' || status === 'error') {
      const error = data.error || data.message || '视频生成失败';
      log('视频生成失败', { taskId, error });
      return { success: false, error };
    }
    
    // 其他状态继续等待: pending, processing, queued 等
  }
  
  return { success: false, error: '视频生成超时' };
}

// 统一的chat/completions接口（处理视频、角色等所有sora功能）
router.post('/chat/completions', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const soraConfig = getSoraApiConfig();
  
  // 检查是否使用 future-sora-api 中转
  const useFutureSoraApi = soraConfig.isActive && soraConfig.channel === 'future-sora-api' && soraConfig.apiKey;
  
  log('收到请求', { 
    model: req.body.model, 
    stream: req.body.stream, 
    channel: useFutureSoraApi ? 'future-sora-api' : 'sora2api'
  });
  
  // ========== 使用 future-sora-api 中转 ==========
  if (useFutureSoraApi) {
    try {
      const { orientation, duration, baseModel } = parseModelName(req.body.model || '');
      const prompt = extractPromptFromMessages(req.body.messages);
      const images = extractImagesFromMessages(req.body.messages);
      const videoUrl = extractVideoFromMessages(req.body.messages);
      
      log('解析参数', { 
        orientation, duration, baseModel, 
        promptLength: prompt.length, 
        imageCount: images.length,
        hasVideo: !!videoUrl
      });
      
      // ===== 角色创建：有视频但没有prompt =====
      if (videoUrl && !prompt) {
        // future-sora-api 只接受 HTTP URL，不接受 base64
        if (videoUrl.startsWith('data:')) {
          log('角色创建请求包含base64视频，future-sora-api不支持，跳过');
          return res.status(400).json({
            error: { 
              message: '角色创建需要HTTP视频URL，不支持base64。请使用waule/server的futureSoraCreateCharacter方法。', 
              type: 'invalid_request' 
            }
          });
        }
        
        log('检测到角色创建请求 (HTTP URL)');
        try {
          const characterResult = await createCharacterViaFutureSoraApi(
            { baseUrl: soraConfig.baseUrl, apiKey: soraConfig.apiKey },
            videoUrl
          );
          
          // 返回角色信息
          const characterName = characterResult.id || characterResult.username || '';
          const avatarUrl = characterResult.profile_picture_url || '';
          const content = `角色名@${characterName}\n头像:${avatarUrl}`;
          
          log(`角色创建成功: ${characterName}`);
          
          return res.json({
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: req.body.model,
            choices: [{
              index: 0,
              message: { role: 'assistant', content },
              finish_reason: 'stop',
            }],
          });
        } catch (error: any) {
          const errorData = error.response?.data;
          log(`角色创建失败: ${error.message}`, { data: errorData });
          return res.status(error.response?.status || 500).json({
            error: { message: errorData?.message || error.message, type: 'character_creation_error' },
          });
        }
      }
      
      // ===== 视频生成：有prompt =====
      if (!prompt) {
        return res.status(400).json({
          error: { message: '未找到有效的prompt', type: 'invalid_request' }
        });
      }
      
      const result = await createVideoViaFutureSoraApi(
        { baseUrl: soraConfig.baseUrl, apiKey: soraConfig.apiKey },
        { prompt, images, orientation, duration, model: baseModel }
      );
      
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      
      if (result.success) {
        const videoHtml = `<video controls autoplay loop src="${result.videoUrl}"></video>`;
        log(`视频生成成功, 总耗时 ${totalTime}s`);
        
        return res.json({
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: req.body.model,
          choices: [{
            index: 0,
            message: { role: 'assistant', content: videoHtml },
            finish_reason: 'stop',
          }],
        });
      } else {
        log(`视频生成失败: ${result.error}`);
        return res.status(500).json({
          error: { message: result.error, type: 'video_generation_error' }
        });
      }
    } catch (error: any) {
      const errorData = error.response?.data;
      log(`future-sora-api 请求失败: ${error.message}`, { 
        status: error.response?.status,
        data: typeof errorData === 'string' ? errorData : JSON.stringify(errorData)
      });
      return res.status(error.response?.status || 500).json({
        error: { 
          message: errorData?.message || errorData?.error || error.message, 
          type: 'sora_error',
          detail: errorData
        },
      });
    }
  }
  
  // ========== 使用 sora2api 直连 ==========
  const apiKey = SORA_API_KEY || req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
  
  if (!apiKey) {
    return res.status(500).json({
      error: { message: 'Sora API key not configured', type: 'configuration_error' }
    });
  }
  
  try {
    const response = await axios.post(
      `${SORA2API_URL}/v1/chat/completions`,
      req.body,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        responseType: 'text',
        timeout: 600000,
      }
    );
    
    const isSSE = response.headers['content-type']?.includes('text/event-stream');
    log(`收到sora2api响应, SSE=${isSSE}`);
    
    let finalResponse: any;
    
    if (isSSE) {
      const { content, rawChunks } = parseSSEResponse(response.data);
      log(`解析内容长度: ${content.length}`);
      
      // 提取所有媒体URL
      const mediaUrls = extractAllMediaUrls(content);
      log(`发现 ${mediaUrls.length} 个媒体URL`);
      
      // 直接使用 Sora 返回的原始 URL，不再上传 OSS
      let processedContent = content;
      for (const media of mediaUrls) {
        log(`使用原始 ${media.type} URL: ${media.url.substring(0, 80)}...`);
      }
      
      finalResponse = {
        id: rawChunks[0]?.id || `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: req.body.model,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: processedContent },
          finish_reason: 'stop',
        }],
      };
    } else {
      const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      let content = data.choices?.[0]?.message?.content || '';
      
      // 直接使用 Sora 返回的原始 URL，不再上传 OSS
      const mediaUrls = extractAllMediaUrls(content);
      log(`发现 ${mediaUrls.length} 个媒体 URL，直接使用原始 URL`);
      
      for (const media of mediaUrls) {
        log(`使用原始 ${media.type} URL: ${media.url.substring(0, 80)}...`);
      }
      
      data.choices[0].message.content = content;
      finalResponse = data;
    }
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`请求完成, 总耗时 ${totalTime}s`);
    
    res.json(finalResponse);
  } catch (error: any) {
    log(`请求失败: ${error.message}`);
    res.status(error.response?.status || 500).json({
      error: { message: error.message, type: 'sora_error' },
    });
  }
});

export default router;
