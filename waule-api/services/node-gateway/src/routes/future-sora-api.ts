/**
 * Future Sora API 中转路由
 * 提供sora2video的中转API接入功能
 * 支持：创建视频、创建角色、查询任务
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import { getSoraProxyConfig } from '../db';

const router = Router();

function log(msg: string, data?: any) {
  console.log(`[${new Date().toISOString()}] [FutureSoraAPI] ${msg}`, data || '');
}

// 获取API配置
function getApiConfig() {
  const config = getSoraProxyConfig();
  return {
    baseUrl: config?.base_url || 'https://future-api.vodeshop.com',
    apiKey: config?.api_key || '',
    isActive: config?.is_active === 1,
    channel: config?.channel || 'sora2api',
  };
}

// 创建视频
// POST /v1/videos (multipart/form-data: model, prompt, seconds, size)
router.post('/videos', async (req: Request, res: Response) => {
  const config = getApiConfig();
  
  if (!config.isActive || config.channel !== 'future-sora-api') {
    return res.status(400).json({
      success: false,
      error: 'Future Sora API is not enabled. Please use sora2api instead.',
    });
  }
  
  if (!config.apiKey) {
    return res.status(500).json({
      success: false,
      error: 'API key not configured',
    });
  }
  
  const { model, orientation, prompt, seconds, imageUrl } = req.body;
  // orientation 映射为 size
  const size = orientation === 'portrait' ? '720x1280' : '1280x720';
  
  log('创建视频请求', { model, orientation, seconds, size, hasImage: !!imageUrl });
  
  try {
    // 构建 multipart/form-data
    const formData = new FormData();
    formData.append('model', model || 'sora-2');
    formData.append('prompt', prompt);
    formData.append('seconds', (seconds || 10).toString());
    formData.append('size', size);
    formData.append('watermark', 'false');
    formData.append('private', 'false');
    
    // 如果有图片参考，下载并作为文件上传
    if (imageUrl) {
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
          const urlPath = new URL(imageUrl).pathname;
          imageName = urlPath.split('/').pop() || 'reference.png';
          log('参考图片下载成功', { size: imageBuffer.length, name: imageName });
        } else {
          throw new Error('不支持的图片格式');
        }
        
        // 添加图片作为 input_reference 文件
        formData.append('input_reference', imageBuffer, {
          filename: imageName,
          contentType: 'image/png',
        });
        log('已添加 input_reference 文件');
      } catch (imgError: any) {
        log('处理参考图片失败', { error: imgError.message });
        // 继续创建视频，但不使用参考图片
      }
    }
    
    const response = await axios.post(
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
    
    log('创建视频成功', { id: response.data.id, response: JSON.stringify(response.data).substring(0, 100) });
    res.json(response.data);
  } catch (error: any) {
    log('创建视频失败', { error: error.message, response: error.response?.data });
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
});

// 查询视频详情
// GET /v1/videos/{task_id}
router.get('/videos/:taskId', async (req: Request, res: Response) => {
  const config = getApiConfig();
  
  if (!config.isActive || config.channel !== 'future-sora-api') {
    return res.status(400).json({
      success: false,
      error: 'Future Sora API is not enabled',
    });
  }
  
  if (!config.apiKey) {
    return res.status(500).json({
      success: false,
      error: 'API key not configured',
    });
  }
  
  const taskId = req.params.taskId;
  
  if (!taskId) {
    return res.status(400).json({
      success: false,
      error: 'Task ID is required',
    });
  }
  
  log('查询任务', { taskId });
  
  try {
    const response = await axios.get(
      `${config.baseUrl}/v1/videos/${taskId}`,
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
        },
        timeout: 30000,
      }
    );
    
    log('查询任务成功', { id: response.data.id, status: response.data.status });
    res.json(response.data);
  } catch (error: any) {
    log('查询任务失败', { error: error.message });
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
});

// 创建角色
// 使用 POST /v1/videos 接口，通过 character_url 参数创建角色
router.post('/characters', async (req: Request, res: Response) => {
  const config = getApiConfig();
  
  log('收到角色创建请求', { 
    isActive: config.isActive, 
    channel: config.channel,
    hasApiKey: !!config.apiKey,
    body: req.body 
  });
  
  if (!config.isActive || config.channel !== 'future-sora-api') {
    log('Future Sora API 未启用', { isActive: config.isActive, channel: config.channel });
    return res.status(400).json({
      success: false,
      error: 'Future Sora API is not enabled',
    });
  }
  
  if (!config.apiKey) {
    log('API key 未配置');
    return res.status(500).json({
      success: false,
      error: 'API key not configured',
    });
  }
  
  const { url, timestamps } = req.body;
  
  if (!url) {
    log('缺少视频URL');
    return res.status(400).json({
      success: false,
      error: 'Video URL is required',
    });
  }
  
  // 检查URL是否为HTTP URL（不接受base64）
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    log('URL格式错误，需要HTTP URL', { urlPrefix: url.substring(0, 50) });
    return res.status(400).json({
      success: false,
      error: 'Video URL must be HTTP/HTTPS URL, not base64',
    });
  }
  
  log('调用 future-api 创建角色 (通过 /v1/videos + character_url)', { 
    apiUrl: `${config.baseUrl}/v1/videos`,
    character_url: url.substring(0, 80),
    character_timestamps: timestamps || '1,3'
  });
  
  try {
    // 使用 /v1/videos 接口，通过 character_url 和 character_timestamps 参数创建角色
    const formData = new FormData();
    formData.append('model', 'sora-2');
    formData.append('prompt', '创建角色'); // 需要一个prompt
    formData.append('seconds', '10');
    formData.append('size', '1280x720');
    formData.append('character_url', url);
    formData.append('character_timestamps', timestamps || '1,3');
    formData.append('character_create', 'true');
    
    const response = await axios.post(
      `${config.baseUrl}/v1/videos`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          ...formData.getHeaders(),
        },
        timeout: 300000, // 5分钟
      }
    );
    
    log('创建角色API响应', { 
      status: response.status,
      contentType: response.headers['content-type'],
      data: JSON.stringify(response.data).substring(0, 300)
    });
    
    // 检查响应是否为HTML（错误情况）
    if (typeof response.data === 'string' && response.data.includes('<!doctype')) {
      log('API返回HTML而不是JSON，可能是错误页面');
      return res.status(500).json({
        success: false,
        error: 'API returned HTML instead of JSON - possible authentication or endpoint error',
      });
    }
    
    // 返回任务ID，需要轮询获取角色信息
    const taskId = response.data.id || response.data.task_id;
    log('角色创建任务已提交', { taskId });
    
    // 轮询等待任务完成 (最多15分钟)
    const maxPolls = 180;
    const pollInterval = 5000;
    
    for (let i = 0; i < maxPolls; i++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      const statusResponse = await axios.get(
        `${config.baseUrl}/v1/videos/${taskId}`,
        {
          headers: { 'Authorization': `Bearer ${config.apiKey}` },
          timeout: 30000,
        }
      );
      
      const status = statusResponse.data.status;
      log(`角色创建任务状态: ${status}`, { poll: i + 1 });
      
      if (status === 'completed' || status === 'complete') {
        // 提取角色信息
        const characterName = statusResponse.data.character_name || '';
        const characterUrl = statusResponse.data.character_url || '';
        // 返回生成的视频URL，让前端截取首帧作为头像（不上传OSS）
        const videoUrl = statusResponse.data.video_url || '';
        
        log('角色创建成功', { characterName, characterUrl, videoUrl });
        
        return res.json({
          id: characterName,
          username: characterName,
          permalink: '',
          profile_picture_url: characterUrl,
          video_url: videoUrl, // 前端用于截取首帧
        });
      } else if (status === 'failed' || status === 'error') {
        log('角色创建失败', { data: statusResponse.data });
        return res.status(500).json({
          success: false,
          error: statusResponse.data.error || '角色创建失败',
        });
      }
    }
    
    return res.status(504).json({
      success: false,
      error: '角色创建超时',
    });
  } catch (error: any) {
    const errorData = error.response?.data;
    log('创建角色失败', { 
      status: error.response?.status,
      error: error.message,
      data: typeof errorData === 'string' ? errorData.substring(0, 200) : JSON.stringify(errorData)
    });
    res.status(error.response?.status || 500).json({
      success: false,
      error: errorData || error.message,
    });
  }
});

// 健康检查
router.get('/health', (req: Request, res: Response) => {
  const config = getApiConfig();
  res.json({
    success: true,
    service: 'future-sora-api',
    enabled: config.isActive && config.channel === 'future-sora-api',
    channel: config.channel,
  });
});

export default router;
