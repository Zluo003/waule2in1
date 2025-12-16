/**
 * Provider 共享工具函数
 */

import { getNextProviderKey, recordProviderKeyUsage } from '../db';

// 日志函数
export function log(provider: string, msg: string, data?: any) {
  const time = new Date().toISOString();
  console.log(`[${time}] [${provider}] ${msg}`, data || '');
}

// Provider ID 映射（与 db.ts 中的 PROVIDERS 保持一致）
const PROVIDER_ID_MAP: Record<string, string> = {
  'doubao': 'doubao',
  'seedream': 'doubao',
  'seedance': 'doubao',
  'wanx': 'wanx',
  'tongyi': 'wanx',
  'dashscope': 'wanx',
  'alibaba': 'wanx',  // 阿里云百炼/通义万相
  'aliyun': 'wanx',
  'qwen': 'wanx',
  'cosyvoice': 'cosyvoice',
  'minimax': 'minimax',
  'hailuo': 'minimax',
  'vidu': 'vidu',
  'openai': 'openai',
  'sora': 'openai',
  'google': 'google',
  'gemini': 'google',
};

/**
 * 获取供应商API Key（从数据库轮询）
 */
export function getApiKey(provider: string, envFallback?: string): { key: string; keyId: number | null } {
  const providerId = PROVIDER_ID_MAP[provider.toLowerCase()] || provider.toLowerCase();
  
  // 从数据库获取
  const dbKey = getNextProviderKey(providerId);
  if (dbKey) {
    return { key: dbKey.api_key, keyId: dbKey.id };
  }
  
  // 回退到环境变量
  if (envFallback) {
    const envKey = process.env[envFallback];
    if (envKey) {
      return { key: envKey, keyId: null };
    }
  }
  
  throw new Error(`No API Key available for provider: ${provider}`);
}

/**
 * 记录API Key使用情况
 */
export function recordKeyUsage(keyId: number | null, success: boolean, error?: string) {
  if (keyId) {
    recordProviderKeyUsage(keyId, success, error);
  }
}
