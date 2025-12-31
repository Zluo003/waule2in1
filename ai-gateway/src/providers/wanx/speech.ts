import { httpRequest } from '../../utils/http';
import { log } from '../../utils/logger';
import { getActiveApiKey, recordKeyUsage, addRequestLog } from '../../database';
import { uploadBuffer } from '../../services/storage';

const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/api/v1';

export interface SpeechSynthesisParams {
  model?: string;
  input: string;
  voice?: string;
  speed?: number;
}

export interface SpeechSynthesisResult {
  data: Array<{ url: string }>;
}

export async function synthesizeSpeech(params: SpeechSynthesisParams): Promise<SpeechSynthesisResult> {
  const startTime = Date.now();
  const keyRecord = getActiveApiKey('wanx');
  if (!keyRecord) {
    throw new Error('No active API key for wanx');
  }

  try {
    log('wanx', 'Synthesizing speech (CosyVoice)', { chars: params.input.length, voice: params.voice });

    const response = await httpRequest<ArrayBuffer>({
      method: 'POST',
      url: `${DASHSCOPE_API_URL}/services/aigc/text2audio/audio-synthesis`,
      headers: {
        'Authorization': `Bearer ${keyRecord.api_key}`,
        'Content-Type': 'application/json',
      },
      data: {
        model: params.model || 'cosyvoice-v1',
        input: {
          text: params.input,
          voice: params.voice || 'longxiaochun',
        },
        parameters: {
          rate: params.speed || 1.0,
          format: 'mp3',
        },
      },
      timeout: 60000,
      responseType: 'arraybuffer',
    });

    const buffer = Buffer.from(response);

    // 检查是否是错误响应（JSON格式）
    if (buffer.length < 1000) {
      try {
        const text = buffer.toString('utf-8');
        if (text.startsWith('{')) {
          const errorData = JSON.parse(text);
          throw new Error(errorData.message || 'CosyVoice synthesis failed');
        }
      } catch (e) {
        if (e instanceof SyntaxError) {
          // 不是JSON，继续处理
        } else {
          throw e;
        }
      }
    }

    const url = await uploadBuffer(buffer, '.mp3');

    recordKeyUsage(keyRecord.id, true);
    addRequestLog('wanx', '/audio/speech', params.model || 'cosyvoice-v1', 'success', Date.now() - startTime);

    log('wanx', 'Speech synthesis success', { url: url.substring(0, 80) });
    return { data: [{ url }] };
  } catch (error: any) {
    recordKeyUsage(keyRecord.id, false);
    addRequestLog('wanx', '/audio/speech', params.model || 'cosyvoice-v1', 'error', Date.now() - startTime, error.message);
    throw error;
  }
}
