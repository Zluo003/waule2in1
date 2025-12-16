import axios from 'axios';

/**
 * Gemini 代理服务
 * 通过日本服务器调用 Gemini API，避免网络问题
 */

const GEMINI_SERVICE_URL = process.env.GEMINI_SERVICE_URL;
const GEMINI_SERVICE_SECRET = process.env.GEMINI_SERVICE_SECRET;
const MAX_RETRIES = 3; // 最大重试次数

// 如果没有配置远程服务，回退到本地直接调用
const useRemote = !!GEMINI_SERVICE_URL;

/**
 * 延迟函数
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 不可重试的错误关键词列表
 * 这些错误表示上游服务明确失败，重试没有意义
 */
const NON_RETRYABLE_ERRORS = [
  '中转API返回空内容',
  'content 为空',
  'completion_tokens 为 0',
  '中转API生成失败',
  '安全过滤器',
  '内容安全策略',
  'SAFETY',
  'NO_IMAGE',
  '触发了安全',
  'API Key',
  'apiKey',
  'unauthorized',
  'invalid_api_key',
  '余额不足',
  'insufficient',
  'quota exceeded',
];

/**
 * 判断错误是否可重试
 */
const isRetryableError = (error: any): boolean => {
  const errorMsg = error.response?.data?.error || error.message || '';
  
  // 首先检查是否是不可重试的错误
  for (const keyword of NON_RETRYABLE_ERRORS) {
    if (errorMsg.toLowerCase().includes(keyword.toLowerCase())) {
      console.log(`🚫 [Gemini Proxy] 检测到不可重试错误: "${keyword}"，直接失败`);
      return false;
    }
  }
  
  // 网络错误、超时可重试
  if (!error.response) return true;
  
  const status = error.response?.status;
  // 5xx 服务器错误可重试
  if (status >= 500 && status < 600) return true;
  // 429 限流可重试
  if (status === 429) return true;
  // "No image generated" 这类临时性 API 错误可重试
  if (errorMsg.includes('No image generated')) return true;
  
  return false;
};

// 懒加载本地服务（仅在需要时导入）
let localGeminiService: any = null;
async function getLocalService() {
  if (!localGeminiService) {
    localGeminiService = await import('./gemini.service');
  }
  return localGeminiService;
}

interface GeminiImageGenerateOptions {
  prompt: string;
  modelId?: string;
  aspectRatio?: string;
  imageSize?: string;
  referenceImages?: string[];
  apiKey?: string;
  apiUrl?: string;
}

interface GeminiTextGenerateOptions {
  prompt: string;
  systemPrompt?: string;
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  documentFiles?: Array<{ filePath: string; mimeType: string }>;
  imageUrls?: string[];
  videoUrls?: string[];
  inlineImages?: Array<{ mimeType: string; data: string }>;
  apiKey?: string;
  apiUrl?: string;
}

/**
 * 生成图片（通过日本服务器，带重试机制）
 */
export const generateImage = async (options: GeminiImageGenerateOptions): Promise<string> => {
  // 如果没有配置远程服务，使用本地
  if (!useRemote) {
    console.log('🔄 [Gemini Proxy] 未配置远程服务，使用本地调用');
    const local = await getLocalService();
    return local.generateImage(options);
  }

  // 环境变量生效时，所有请求都转发给日本服务器
  // 日本服务器负责判断调用官方API还是中转API

  let lastError: any;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`🌏 [Gemini Proxy] 通过日本服务器生成图片... (尝试 ${attempt}/${MAX_RETRIES})`);
    const startTime = Date.now();

    try {
      const response = await axios.post(
        `${GEMINI_SERVICE_URL}/api/gemini/image`,
        options,
        {
          headers: {
            'Content-Type': 'application/json',
            ...(GEMINI_SERVICE_SECRET && { Authorization: `Bearer ${GEMINI_SERVICE_SECRET}` }),
          },
          timeout: 600000, // 10分钟超时
        }
      );

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ [Gemini Proxy] 图片生成成功，耗时: ${duration}s`);

      if (!response.data.success) {
        throw new Error(response.data.error || '远程服务返回失败');
      }

      return response.data.imageUrl;
    } catch (error: any) {
      lastError = error;
      const errorMsg = error.response?.data?.error || error.message;
      console.error(`❌ [Gemini Proxy] 第 ${attempt} 次尝试失败:`, errorMsg);
      
      // 判断是否可重试
      if (!isRetryableError(error)) {
        // 不可重试错误，直接抛出
        throw new Error(`Gemini 图片生成失败: ${errorMsg}`);
      }
      
      if (attempt < MAX_RETRIES) {
        const waitTime = attempt * 2000; // 2s, 4s, 6s 递增等待
        console.log(`🔄 [Gemini Proxy] ${waitTime/1000}秒后重试...`);
        await delay(waitTime);
      }
    }
  }

  // 所有重试都失败
  throw new Error(`Gemini 远程服务调用失败 (已重试${MAX_RETRIES}次): ${lastError.response?.data?.error || lastError.message}`);
};

/**
 * 生成文本（通过日本服务器，带重试机制）
 */
export const generateText = async (options: GeminiTextGenerateOptions): Promise<string> => {
  // 如果没有配置远程服务，使用本地
  if (!useRemote) {
    console.log('🔄 [Gemini Proxy] 未配置远程服务，使用本地调用');
    const local = await getLocalService();
    return local.generateText(options);
  }

  let lastError: any;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`🌏 [Gemini Proxy] 通过日本服务器生成文本... (尝试 ${attempt}/${MAX_RETRIES})`);
    const startTime = Date.now();

    try {
      const response = await axios.post(
        `${GEMINI_SERVICE_URL}/api/gemini/text`,
        options,
        {
          headers: {
            'Content-Type': 'application/json',
            ...(GEMINI_SERVICE_SECRET && { Authorization: `Bearer ${GEMINI_SERVICE_SECRET}` }),
          },
          timeout: 180000, // 3分钟超时
        }
      );

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ [Gemini Proxy] 文本生成成功，耗时: ${duration}s，长度: ${response.data.text?.length || 0}`);

      if (!response.data.success) {
        throw new Error(response.data.error || '远程服务返回失败');
      }

      return response.data.text;
    } catch (error: any) {
      lastError = error;
      const errorMsg = error.response?.data?.error || error.message;
      console.error(`❌ [Gemini Proxy] 第 ${attempt} 次尝试失败:`, errorMsg);
      
      // 判断是否可重试
      if (!isRetryableError(error)) {
        // 不可重试错误，直接抛出
        throw new Error(`Gemini 文本生成失败: ${errorMsg}`);
      }
      
      if (attempt < MAX_RETRIES) {
        const waitTime = attempt * 2000; // 2s, 4s, 6s 递增等待
        console.log(`🔄 [Gemini Proxy] ${waitTime/1000}秒后重试...`);
        await delay(waitTime);
      }
    }
  }

  // 所有重试都失败
  throw new Error(`Gemini 远程服务调用失败 (已重试${MAX_RETRIES}次): ${lastError.response?.data?.error || lastError.message}`);
};

export default {
  generateImage,
  generateText,
};
