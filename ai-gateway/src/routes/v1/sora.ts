/**
 * Sora 视频生成路由
 * 通过渠道配置中转服务生成视频
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import { spawn } from 'child_process';
import { getActiveChannelForModel, recordChannelUsage, recordChannelKeyUsage, addRequestLog } from '../../database';
import { uploadBuffer } from '../../services/storage';

const router = Router();

function log(msg: string, data?: any) {
  console.log(`[${new Date().toISOString()}] [Sora] ${msg}`, data || '');
}

// 从视频URL截取第一帧并上传，返回图片URL
async function extractFirstFrame(videoUrl: string): Promise<string | null> {
  try {
    const ffmpeg = spawn('ffmpeg', [
      '-i', videoUrl,
      '-vframes', '1',
      '-f', 'image2pipe',
      '-vcodec', 'png',
      '-'
    ]);

    const chunks: Buffer[] = [];
    for await (const chunk of ffmpeg.stdout) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    if (buffer.length === 0) {
      log('截取视频第一帧失败: 输出为空');
      return null;
    }

    const imageUrl = await uploadBuffer(buffer, '.png');
    log('视频第一帧截取成功', { imageUrl });
    return imageUrl;
  } catch (e: any) {
    log('截取视频第一帧失败', { error: e.message });
    return null;
  }
}

// 获取渠道配置
function getChannelConfig(model: string) {
  let result = getActiveChannelForModel(model) || getActiveChannelForModel('sora-2');
  if (!result) return null;
  return {
    channelId: result.channel.id,
    keyId: result.key.id,
    baseUrl: result.channel.base_url || 'https://future-api.vodeshop.com',
    apiKey: result.key.api_key,
    targetModels: result.targetModels,
  };
}

// 处理图片：下载或解析 base64
async function processImage(imageUrl: string): Promise<{ buffer: Buffer; name: string } | null> {
  try {
    if (imageUrl.startsWith('data:')) {
      const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');
      return { buffer: Buffer.from(base64Data, 'base64'), name: 'reference.png' };
    }
    if (imageUrl.startsWith('http')) {
      const resp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
      const name = new URL(imageUrl).pathname.split('/').pop() || 'reference.png';
      return { buffer: Buffer.from(resp.data), name };
    }
  } catch (e: any) {
    log('处理图片失败', { error: e.message });
  }
  return null;
}

// 创建视频 - POST /v1/sora/videos
router.post('/videos', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { model, prompt, orientation, seconds, imageUrl } = req.body;

  const config = getChannelConfig(model || 'sora-2');
  if (!config) {
    return res.status(400).json({ error: { message: 'Sora 渠道未配置', type: 'configuration_error' } });
  }

  const size = orientation === 'portrait' ? '720x1280' : '1280x720';
  const targetModel = config.targetModels?.[0] || model || 'sora-2';

  log('创建视频', { model, targetModel, orientation, size, seconds });

  try {
    const formData = new FormData();
    formData.append('model', targetModel);
    formData.append('prompt', prompt);
    formData.append('seconds', (seconds || 10).toString());
    formData.append('size', size);
    formData.append('watermark', 'false');
    formData.append('private', 'false');

    if (imageUrl) {
      const img = await processImage(imageUrl);
      if (img) formData.append('input_reference', img.buffer, { filename: img.name, contentType: 'image/png' });
    }

    const response = await axios.post(`${config.baseUrl}/v1/videos`, formData, {
      headers: { 'Authorization': `Bearer ${config.apiKey}`, ...formData.getHeaders() },
      timeout: 60000,
    });

    recordChannelUsage(config.channelId, true);
    recordChannelKeyUsage(config.keyId, true);
    addRequestLog('sora', '/v1/sora/videos', model, 'success', Date.now() - startTime);
    log('创建视频成功', { id: response.data.id });
    res.json(response.data);
  } catch (error: any) {
    const errorMsg = error.response?.data?.error || error.message;
    recordChannelUsage(config.channelId, false);
    recordChannelKeyUsage(config.keyId, false);
    addRequestLog('sora', '/v1/sora/videos', model, 'error', Date.now() - startTime, errorMsg);
    log('创建视频失败', { error: errorMsg });
    res.status(error.response?.status || 500).json({ error: { message: errorMsg, type: 'sora_error' } });
  }
});

// 查询视频 - GET /v1/sora/videos/:taskId
router.get('/videos/:taskId', async (req: Request, res: Response) => {
  const config = getChannelConfig('sora-2');
  if (!config) {
    return res.status(400).json({ error: { message: 'Sora 渠道未配置', type: 'configuration_error' } });
  }

  try {
    const response = await axios.get(`${config.baseUrl}/v1/videos/${req.params.taskId}`, {
      headers: { 'Authorization': `Bearer ${config.apiKey}` },
      timeout: 30000,
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json({ error: { message: error.message, type: 'sora_error' } });
  }
});

// chat/completions 兼容接口
router.post('/chat/completions', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { model = 'sora-2', messages } = req.body;

  // orientation 和 seconds 优先从请求体获取，否则从 model 名称解析
  let orientation = req.body.orientation;
  let seconds = req.body.seconds;
  if (!orientation || !seconds) {
    const match = model.match(/(landscape|portrait)-(\d+)s?/i);
    if (match) {
      if (!orientation) orientation = match[1].toLowerCase();
      if (!seconds) seconds = parseInt(match[2], 10);
    }
  }
  orientation = orientation || 'landscape';
  seconds = seconds || 10;

  const config = getChannelConfig(model);
  if (!config) {
    return res.status(400).json({ error: { message: 'Sora 渠道未配置', type: 'configuration_error' } });
  }

  // 从 messages 提取 prompt 和图片
  let prompt = '';
  let imageUrl = '';
  for (let i = (messages?.length || 0) - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        prompt = msg.content;
        break;
      }
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text' && !prompt) prompt = part.text;
          if (part.type === 'image_url' && !imageUrl) imageUrl = part.image_url?.url;
        }
        if (prompt) break;
      }
    }
  }

  if (!prompt) {
    return res.status(400).json({ error: { message: '未找到有效的 prompt', type: 'invalid_request' } });
  }

  const size = orientation === 'portrait' ? '720x1280' : '1280x720';
  const targetModel = config.targetModels?.[0] || 'sora-2';

  log('chat/completions', { model, targetModel, orientation, size, seconds, hasImage: !!imageUrl });

  try {
    const formData = new FormData();
    formData.append('model', targetModel);
    formData.append('prompt', prompt);
    formData.append('seconds', seconds.toString());
    formData.append('size', size);
    formData.append('watermark', 'false');
    formData.append('private', 'false');

    if (imageUrl) {
      const img = await processImage(imageUrl);
      if (img) formData.append('input_reference', img.buffer, { filename: img.name, contentType: 'image/png' });
    }

    // 创建任务
    const createResp = await axios.post(`${config.baseUrl}/v1/videos`, formData, {
      headers: { 'Authorization': `Bearer ${config.apiKey}`, ...formData.getHeaders() },
      timeout: 60000,
    });

    const taskId = createResp.data.id || createResp.data.task_id;
    if (!taskId) throw new Error('未获取到任务 ID');
    log('任务已创建', { taskId });

    // 轮询等待完成
    for (let i = 0; i < 180; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const queryResp = await axios.get(`${config.baseUrl}/v1/videos/${taskId}`, {
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
        timeout: 30000,
      });

      const status = queryResp.data.status;
      if (status === 'completed' || status === 'success' || status === 'done') {
        const videoUrl = queryResp.data.video_url || queryResp.data.url;
        recordChannelUsage(config.channelId, true);
        recordChannelKeyUsage(config.keyId, true);
        addRequestLog('sora', '/v1/sora/chat/completions', model, 'success', Date.now() - startTime);
        log('视频生成成功');

        return res.json({
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, message: { role: 'assistant', content: `<video controls autoplay loop src="${videoUrl}"></video>` }, finish_reason: 'stop' }],
        });
      }

      if (status === 'failed' || status === 'error') {
        throw new Error(queryResp.data.error || '视频生成失败');
      }
    }

    throw new Error('视频生成超时');
  } catch (error: any) {
    const errorMsg = error.response?.data?.error || error.message;
    recordChannelUsage(config.channelId, false);
    recordChannelKeyUsage(config.keyId, false);
    addRequestLog('sora', '/v1/sora/chat/completions', model, 'error', Date.now() - startTime, errorMsg);
    log('视频生成失败', { error: errorMsg });
    res.status(error.response?.status || 500).json({ error: { message: errorMsg, type: 'sora_error' } });
  }
});

// 创建角色 - POST /v1/sora/characters
router.post('/characters', async (req: Request, res: Response) => {
  const config = getChannelConfig('sora-2');
  if (!config) {
    return res.status(400).json({ error: { message: 'Sora 渠道未配置', type: 'configuration_error' } });
  }

  const { url, timestamps } = req.body;
  if (!url) {
    return res.status(400).json({ error: { message: '缺少视频 URL', type: 'invalid_request' } });
  }

  log('创建角色', { url: url.substring(0, 80), timestamps });

  try {
    // 通过 /v1/videos 接口创建角色任务
    const formData = new FormData();
    formData.append('model', 'sora-2');
    formData.append('prompt', 'create character');
    formData.append('seconds', '10');
    formData.append('size', '1280x720');
    formData.append('character_url', url);
    formData.append('character_timestamps', timestamps || '1,3');

    const createResp = await axios.post(`${config.baseUrl}/v1/videos`, formData, {
      headers: { 'Authorization': `Bearer ${config.apiKey}`, ...formData.getHeaders() },
      timeout: 60000,
    });

    const taskId = createResp.data.id || createResp.data.task_id;
    if (!taskId) throw new Error('未获取到任务 ID');
    log('角色任务已创建', { taskId });

    // 轮询等待完成
    for (let i = 0; i < 180; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const queryResp = await axios.get(`${config.baseUrl}/v1/videos/${taskId}`, {
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
        timeout: 30000,
      });

      const status = queryResp.data.status;
      log(`角色任务状态 [${i + 1}]`, { taskId, status });

      if (status === 'completed' || status === 'success' || status === 'done') {
        // 打印完整响应以调试
        log('角色任务完成，完整响应', JSON.stringify(queryResp.data, null, 2));

        const characterName = queryResp.data.character_name || queryResp.data.character_id || '';
        const characterUrl = queryResp.data.character_url || queryResp.data.profile_picture_url || '';
        const videoUrl = queryResp.data.video_url || '';

        // 从视频截取第一帧作为头像
        const avatarUrl = await extractFirstFrame(characterUrl) || characterUrl;

        log('角色创建成功', { characterName, avatarUrl, videoUrl });
        recordChannelUsage(config.channelId, true);
        recordChannelKeyUsage(config.keyId, true);

        return res.json({
          id: characterName,
          username: characterName,
          permalink: '',
          profile_picture_url: avatarUrl,
          video_url: videoUrl,
        });
      }

      if (status === 'failed' || status === 'error') {
        throw new Error(queryResp.data.error || '角色创建失败');
      }
    }

    throw new Error('角色创建超时');
  } catch (error: any) {
    const errorMsg = error.response?.data?.error || error.message;
    log('角色创建失败', {
      error: errorMsg,
      status: error.response?.status,
      data: JSON.stringify(error.response?.data)
    });
    recordChannelUsage(config.channelId, false);
    recordChannelKeyUsage(config.keyId, false);
    res.status(error.response?.status || 500).json({ error: { message: errorMsg, type: 'sora_error' } });
  }
});

// 健康检查
router.get('/health', (_req: Request, res: Response) => {
  const config = getChannelConfig('sora-2');
  res.json({ success: true, service: 'sora', enabled: !!config });
});

export default router;
