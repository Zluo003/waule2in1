/**
 * Gemini Provider - 对话生成
 * 支持 gemini-3-pro-preview, gemini-3-flash-preview 等模型
 * 支持官方API和中转API
 */

import axios from 'axios';
import { log } from '../../utils/logger';
import { getActiveApiKey, recordKeyUsage, addRequestLog, getActiveChannelForModel, recordChannelUsage, recordChannelKeyUsage } from '../../database';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export interface ChatCompletionParams {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  thinking_level?: 'low' | 'high' | 'minimal' | 'medium';
  stream?: boolean;
}

export interface ChatCompletionResult {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 从 URL 获取图片并转为 base64
 */
async function fetchImageAsBase64(url: string): Promise<{ mimeType: string; data: string } | null> {
  if (url.startsWith('data:')) {
    const matches = url.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      return { mimeType: matches[1], data: matches[2] };
    }
  } else if (url.startsWith('http')) {
    try {
      const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
      const mimeType = resp.headers['content-type'] || 'image/jpeg';
      const data = Buffer.from(resp.data).toString('base64');
      return { mimeType, data };
    } catch {
      return null;
    }
  }
  return null;
}

export async function chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
  const startTime = Date.now();
  const modelId = params.model || 'gemini-3-flash-preview';

  // 优先查找模型配置的渠道
  const channelResult = getActiveChannelForModel(modelId);

  let apiKey: string;
  let apiBase: string;
  let actualModel: string = modelId; // 实际发送给API的模型名称
  let channelId: number | null = null;
  let channelKeyId: number | null = null;
  let keyRecordId: number | null = null;

  if (channelResult) {
    // 使用渠道配置
    const { channel, key, targetModels } = channelResult;
    apiKey = key.api_key;
    channelId = channel.id;
    channelKeyId = key.id;

    // 如果配置了目标模型名称，使用第一个（对话场景通常只需要一个）
    if (targetModels && targetModels.length > 0) {
      actualModel = targetModels[0];
    }

    if (channel.channel_type === 'proxy' && channel.base_url) {
      // 中转API - 使用OpenAI兼容格式
      apiBase = channel.base_url;
    } else {
      // 官方API
      apiBase = GEMINI_API_BASE;
    }
    log('gemini', 'Using channel', { channel: channel.name, type: channel.channel_type, key: key.name, targetModel: actualModel });
  } else {
    // 回退到旧的api_keys表
    const keyRecord = getActiveApiKey('gemini');
    if (!keyRecord) {
      throw new Error('No active API key or channel for gemini');
    }
    apiKey = keyRecord.api_key;
    keyRecordId = keyRecord.id;
    apiBase = GEMINI_API_BASE;
  }

  // Gemini 3 系列模型强制使用温度 1
  const temperature = modelId.includes('gemini-3') ? 1 : (params.temperature ?? 1);

  try {
    log('gemini', 'Chat completion', { model: modelId, actualModel, messageCount: params.messages.length });

    // 根据渠道类型选择不同的请求方式
    if (channelResult?.channel.channel_type === 'proxy' && channelResult.channel.base_url) {
      // 中转API - OpenAI兼容格式
      return await callProxyApi(params, actualModel, apiKey, apiBase, temperature, startTime, channelId!, channelKeyId!);
    } else {
      // 官方API - Gemini原生格式
      return await callOfficialApi(params, actualModel, apiKey, apiBase, temperature, startTime, channelId, channelKeyId, keyRecordId);
    }
  } catch (error: any) {
    if (channelKeyId) {
      recordChannelKeyUsage(channelKeyId, false);
    }
    if (channelId) {
      recordChannelUsage(channelId, false);
    } else if (keyRecordId) {
      recordKeyUsage(keyRecordId, false);
    }
    addRequestLog('gemini', '/chat/completions', modelId, 'error', Date.now() - startTime, error.message);
    log('gemini', 'Chat completion failed', { error: error.message });
    throw new Error(`Gemini chat failed: ${error.response?.data?.error?.message || error.message}`);
  }
}

// 调用中转API (OpenAI兼容格式)
async function callProxyApi(
  params: ChatCompletionParams,
  modelId: string,
  apiKey: string,
  apiBase: string,
  temperature: number,
  startTime: number,
  channelId: number,
  channelKeyId: number
): Promise<ChatCompletionResult> {
  const requestBody: any = {
    model: modelId,
    messages: params.messages,
    temperature,
    max_tokens: params.max_tokens || 8192,
  };

  if (params.thinking_level && modelId.includes('gemini-3')) {
    requestBody.thinking_level = params.thinking_level;
  }

  const response = await axios.post(
    `${apiBase}/v1/chat/completions`,
    requestBody,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: 180000,
    }
  );

  recordChannelKeyUsage(channelKeyId, true);
  recordChannelUsage(channelId, true);
  addRequestLog('gemini', '/chat/completions', modelId, 'success', Date.now() - startTime);

  return response.data;
}

// 调用官方API (Gemini原生格式)
async function callOfficialApi(
  params: ChatCompletionParams,
  modelId: string,
  apiKey: string,
  apiBase: string,
  temperature: number,
  startTime: number,
  channelId: number | null,
  channelKeyId: number | null,
  keyRecordId: number | null
): Promise<ChatCompletionResult> {
  // 转换消息格式为 Gemini 格式
  const contents: any[] = [];
  let systemInstruction: string | undefined;

  for (const msg of params.messages) {
    if (msg.role === 'system') {
      systemInstruction = typeof msg.content === 'string' ? msg.content : '';
      continue;
    }

    const role = msg.role === 'assistant' ? 'model' : 'user';

    if (typeof msg.content === 'string') {
      contents.push({ role, parts: [{ text: msg.content }] });
    } else if (Array.isArray(msg.content)) {
      const parts: any[] = [];
      for (const item of msg.content) {
        if (item.type === 'text' && item.text) {
          parts.push({ text: item.text });
        } else if (item.type === 'image_url' && item.image_url?.url) {
          const imageData = await fetchImageAsBase64(item.image_url.url);
          if (imageData) {
            parts.push({ inlineData: imageData });
          }
        }
      }
      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }
  }

  const requestBody: any = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: params.max_tokens || 8192,
    },
  };

  if (systemInstruction) {
    requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  if (params.thinking_level && modelId.includes('gemini-3')) {
    requestBody.generationConfig.thinkingConfig = {
      thinkingLevel: params.thinking_level.toUpperCase(),
    };
  }

  const response = await axios.post(
    `${apiBase}/${modelId}:generateContent?key=${apiKey}`,
    requestBody,
    { headers: { 'Content-Type': 'application/json' }, timeout: 180000 }
  );

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const usageMetadata = response.data?.usageMetadata;

  if (channelKeyId) {
    recordChannelKeyUsage(channelKeyId, true);
  }
  if (channelId) {
    recordChannelUsage(channelId, true);
  } else if (keyRecordId) {
    recordKeyUsage(keyRecordId, true);
  }
  addRequestLog('gemini', '/chat/completions', modelId, 'success', Date.now() - startTime);

  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: modelId,
    choices: [{
      index: 0,
      message: { role: 'assistant', content: text },
      finish_reason: 'stop',
    }],
    usage: usageMetadata ? {
      prompt_tokens: usageMetadata.promptTokenCount || 0,
      completion_tokens: usageMetadata.candidatesTokenCount || 0,
      total_tokens: usageMetadata.totalTokenCount || 0,
    } : undefined,
  };
}
