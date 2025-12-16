import axios from 'axios';
import { uploadBuffer, downloadAndUploadToOss } from '../../utils/oss';

const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1';

interface CreateVoiceOptions {
  targetModel: string;
  prefix: string;
  url: string;
  apiKey?: string;
  apiUrl?: string;
}

interface QueryVoiceOptions {
  voiceId: string;
  apiKey?: string;
  apiUrl?: string;
}

interface SynthesizeOptions {
  model: string;
  voice: string;
  text: string;
  format?: 'mp3' | 'wav';
  sampleRate?: number;
  volume?: number;
  rate?: number;
  pitch?: number;
  apiKey?: string;
  apiUrl?: string;
}

export async function createVoice(options: CreateVoiceOptions): Promise<{ voiceId: string; requestId?: string; }>
{
  const apiKey = options.apiKey || process.env.DASHSCOPE_API_KEY || process.env.ALIYUN_API_KEY;
  const base = options.apiUrl || DEFAULT_BASE_URL;
  if (!apiKey) throw new Error('阿里云百炼 API 密钥未配置');
  const endpoint = `${base}/services/audio/tts/customization`;
  const body = {
    model: 'voice-enrollment',
    input: {
      action: 'create_voice',
      target_model: options.targetModel,
      prefix: options.prefix,
      url: options.url,
    },
  };
  const resp = await axios.post(endpoint, body, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 180000,
  });
  const voiceId = resp.data?.output?.voice_id;
  if (!voiceId) throw new Error('未返回voice_id');
  return { voiceId, requestId: resp.data?.request_id };
}

export async function queryVoice(options: QueryVoiceOptions): Promise<{ status: string; requestId?: string; }> {
  const apiKey = options.apiKey || process.env.DASHSCOPE_API_KEY || process.env.ALIYUN_API_KEY;
  const base = options.apiUrl || DEFAULT_BASE_URL;
  if (!apiKey) throw new Error('阿里云百炼 API 密钥未配置');
  const endpoint = `${base}/services/audio/tts/customization`;
  const body = {
    model: 'voice-enrollment',
    input: {
      action: 'query_voice',
      voice_id: options.voiceId,
    },
  };
  const resp = await axios.post(endpoint, body, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 60000,
  });
  const status = resp.data?.output?.status || resp.data?.output?.voice?.status || 'UNKNOWN';
  return { status, requestId: resp.data?.request_id };
}

export async function synthesize(options: SynthesizeOptions): Promise<string> {
  const apiKey = options.apiKey || process.env.DASHSCOPE_API_KEY || process.env.ALIYUN_API_KEY;
  const base = options.apiUrl || DEFAULT_BASE_URL;
  if (!apiKey) throw new Error('阿里云百炼 API 密钥未配置');
  const endpoint = `${base}/services/audio/tts/speech_synthesizer`;
  const fmt = options.format || 'mp3';
  const body: any = {
    model: options.model,
    parameters: {
      voice: options.voice,
      format: fmt,
      sample_rate: options.sampleRate || 24000,
      volume: options.volume || 50,
      rate: options.rate || 1,
      pitch: options.pitch || 1,
    },
    input: { text: options.text },
  };
  let resp: any;
  try {
    resp = await axios.post(endpoint, body, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 240000,
    });
  } catch (err: any) {
    const status = err?.response?.status;
    const data = err?.response?.data;
    const msg = data?.message || data?.error || JSON.stringify(data || {}) || err?.message || '请求失败';
    throw new Error(`CosyVoice 合成失败(${status}): ${msg}`);
  }
  const audioBase64: string | undefined = resp.data?.output?.audio;
  const audioUrl: string | undefined = resp.data?.output?.url;
  const ext = fmt === 'wav' ? '.wav' : '.mp3';
  
  // Base64 直接上传到 OSS
  if (audioBase64) {
    const buf = Buffer.from(audioBase64, 'base64');
    return await uploadBuffer(buf, ext);
  }
  
  // URL 下载并上传到 OSS
  if (audioUrl) {
    try {
      return await downloadAndUploadToOss(audioUrl, 'cosyvoice');
    } catch {
      return audioUrl;
    }
  }
  
  throw new Error('未返回音频数据');
}

export default { createVoice, queryVoice, synthesize };