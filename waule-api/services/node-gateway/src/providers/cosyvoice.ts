/**
 * CosyVoice Provider
 * 阿里云语音合成服务
 */

import axios from 'axios';
import { uploadBuffer } from '../oss';
import { log, getApiKey, recordKeyUsage } from './utils';

const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/api/v1';

export interface CosyVoiceOptions {
  model: string;
  text: string;
  voiceId?: string;
  speed?: number;
}

export async function synthesizeSpeech(options: CosyVoiceOptions): Promise<{
  url: string;
  duration?: number;
}> {
  const { text, voiceId = 'longxiaochun', speed = 1.0 } = options;
  const { key: API_KEY, keyId } = getApiKey('alibaba', 'DASHSCOPE_API_KEY');
  
  log('CosyVoice', `语音合成: chars=${text.length}`);
  
  try {
    const response = await axios.post(
      `${DASHSCOPE_API_URL}/services/aigc/text2audio/audio-synthesis`,
      {
        model: 'cosyvoice-v1',
        input: {
          text,
          voice: voiceId,
        },
        parameters: {
          rate: speed,
          format: 'mp3',
        },
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
      throw new Error(errorData.message || 'CosyVoice synthesis failed');
    }
    
    recordKeyUsage(keyId, true);
    const ossUrl = await uploadBuffer(Buffer.from(response.data), '.mp3', 'cosyvoice');
    
    log('CosyVoice', `语音合成成功: ${ossUrl}`);
    return { url: ossUrl };
    
  } catch (error: any) {
    recordKeyUsage(keyId, false, error.message);
    log('CosyVoice', `语音合成失败: ${error.message}`);
    throw new Error(`CosyVoice TTS failed: ${error.response?.data?.message || error.message}`);
  }
}
