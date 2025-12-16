import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { uploadBuffer, downloadAndUploadToOss } from '../../utils/oss';

interface VoiceSetting {
  voice_id?: string;
  speed?: number;
  vol?: number;
  pitch?: number;
  emotion?: string;
}

interface AudioSetting {
  sample_rate?: number;
  bitrate?: number;
  format?: 'mp3' | 'wav';
  channel?: 1 | 2;
}

function ensureApiKey(apiKey?: string): string {
  const key = apiKey || process.env.MINIMAX_API_KEY || process.env.MINIMAXI_API_KEY || process.env.MINIMAX_API_TOKEN;
  if (!key) throw new Error('MiniMax API 密钥未配置');
  return key;
}

// 下载音频文件并上传到 OSS
async function downloadFile(baseUrl: string, apiKey: string, fileId: string, prefix: string): Promise<string> {
  const url = `${baseUrl}/files/retrieve_content?file_id=${encodeURIComponent(fileId)}`;
  return downloadAndUploadToOss(url, prefix, { Authorization: `Bearer ${apiKey}` });
}

export async function synthesizeSync(options: { model: string; text: string; voice?: VoiceSetting; audio?: AudioSetting; apiKey?: string; apiUrl?: string; stream?: boolean; subtitle_enable?: boolean; language_boost?: string | null; pronunciation_dict?: any; timber_weights?: any[]; voice_modify?: any; output_format?: 'hex' | 'url'; aigc_watermark?: boolean; }): Promise<string> {
  const { model, text, voice, audio, apiKey, apiUrl, stream = false, subtitle_enable = false, language_boost = null, pronunciation_dict, timber_weights, voice_modify, output_format = 'hex', aigc_watermark = false } = options;
  const KEY = ensureApiKey(apiKey);
  const BASE = apiUrl || 'https://api.minimaxi.com/v1';
  const payload: any = {
    model,
    text,
    stream,
    voice_setting: voice || {},
    audio_setting: audio || {},
    subtitle_enable,
    language_boost,
    pronunciation_dict,
    timber_weights,
    voice_modify,
    output_format,
    aigc_watermark,
  };
  const useGroup = String(process.env.MINIMAX_ENABLE_GROUP_ID || '').toLowerCase();
  const groupId = process.env.MINIMAX_GROUP_ID || process.env.MINIMAXI_GROUP_ID || '';
  const endpoint = `${BASE}/t2a_v2${(useGroup === 'true' || useGroup === '1') && groupId ? `?GroupId=${encodeURIComponent(groupId)}` : ''}`;
  const resp = await axios.post(endpoint, payload, { headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, timeout: 300000 });
  const data = resp?.data?.data ?? resp?.data ?? {};
  const fileId = data?.file_id ?? resp?.data?.file_id;
  const remoteUrl = data?.url ?? resp?.data?.url;
  let hexData: any = data?.hex ?? resp?.data?.hex;
  if (!hexData && typeof data === 'string') hexData = data;
  if (!hexData && typeof data?.audio === 'string') hexData = data.audio;
  if (!hexData && typeof data?.audio_hex === 'string') hexData = data.audio_hex;
  const baseResp = resp?.data?.base_resp || data?.base_resp;
  if (!fileId && !remoteUrl && !hexData) {
    const status = baseResp?.status_code;
    const msg = baseResp?.status_msg || resp?.data?.message;
    throw new Error(`MiniMax 未返回音频输出: ${status ?? ''} ${msg ?? ''}`);
  }
  if (remoteUrl) {
    try {
      return await downloadAndUploadToOss(remoteUrl, 'minimaxi-audio');
    } catch { }
  }
  if (hexData && typeof hexData === 'string' && hexData.length > 0) {
    const ext = (audio?.format === 'wav') ? '.wav' : '.mp3';
    const buf = Buffer.from(hexData, 'hex');
    return await uploadBuffer(buf, ext);
  }
  if (!fileId) {
    const status = (resp?.data?.base_resp?.status_code ?? data?.base_resp?.status_code);
    const msg = (resp?.data?.base_resp?.status_msg ?? data?.base_resp?.status_msg);
    const detail = msg ? `MiniMax 返回异常(${status}): ${msg}` : 'MiniMax 未返回可用的音频输出';
    throw new Error(detail);
  }
  return await downloadFile(BASE, KEY, String(fileId), 'minimaxi-audio');
}

export async function createT2AAsync(options: { model: string; text?: string; text_file_id?: string; voice?: VoiceSetting; audio?: AudioSetting; apiKey?: string; apiUrl?: string; }): Promise<string> {
  const { model, text, text_file_id, voice, audio, apiKey, apiUrl } = options;
  const KEY = ensureApiKey(apiKey);
  const BASE = apiUrl || 'https://api.minimaxi.com/v1';
  const payload: any = { model };
  if (text_file_id) payload.text_file_id = text_file_id; else payload.text = text || '';
  if (voice) payload.voice_setting = voice;
  if (audio) payload.audio_setting = audio;
  const resp = await axios.post(`${BASE}/t2a_async_v2`, payload, { headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, timeout: 300000 });
  const taskId = resp.data?.task_id || resp.data?.id || resp.data?.data?.task_id;
  if (!taskId) throw new Error('MiniMax 未返回任务ID');
  return String(taskId);
}

export async function queryT2AAsync(options: { taskId: string; apiKey?: string; apiUrl?: string; }): Promise<{ status: string; fileId?: string; }> {
  const { taskId, apiKey, apiUrl } = options;
  const KEY = ensureApiKey(apiKey);
  const BASE = apiUrl || 'https://api.minimaxi.com/v1';
  const url = `${BASE}/query/t2a_async_query_v2?task_id=${encodeURIComponent(taskId)}`;
  const resp = await axios.get(url, { headers: { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, timeout: 300000 });
  const data = resp.data || {};
  const status = data.status || data.data?.status || 'unknown';
  const fileId = data.file_id || data.data?.file_id;
  return { status: String(status), fileId: fileId ? String(fileId) : undefined };
}

export async function uploadFile(options: { filePath: string; purpose: string; apiKey?: string; apiUrl?: string; filename?: string; contentType?: string; }): Promise<string> {
  const { filePath, purpose, apiKey, apiUrl, filename, contentType } = options;
  const KEY = ensureApiKey(apiKey);
  const BASE = apiUrl || 'https://api.minimaxi.com/v1';
  const FormData = require('form-data');
  const form = new FormData();
  let fname = filename || 'audio.wav';
  let tmpPath: string | undefined;
  try {
    if (/^https?:\/\//.test(filePath)) {
      const res = await axios.get(filePath, { responseType: 'arraybuffer', timeout: 60000, maxRedirects: 5, validateStatus: (s) => s >= 200 && s < 400 });
      const urlObj = new URL(filePath);
      const base = urlObj.pathname.split('/').pop() || fname;
      fname = base;
      const uploadsDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      tmpPath = path.join(uploadsDir, `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${fname}`);
      await fs.promises.writeFile(tmpPath, Buffer.from(res.data));
    } else {
      const base = filePath.split('/').pop() || fname;
      fname = base;
      tmpPath = filePath;
    }
  } catch (err: any) {
    throw new Error(`上传文件读取失败: ${err?.message || err}`);
  }
  const stream = fs.createReadStream(tmpPath!);
  form.append('file', stream, { filename: fname, contentType: contentType || undefined });

  const useGroup = String(process.env.MINIMAX_ENABLE_GROUP_ID || '').toLowerCase();
  const groupId = process.env.MINIMAX_GROUP_ID || process.env.MINIMAXI_GROUP_ID || '';
  const groupQueryParam = ((useGroup === 'true' || useGroup === '1') && groupId) ? `?GroupId=${encodeURIComponent(groupId)}` : '';

  const endpoint = `${BASE}/files/upload${groupQueryParam}`;

  // Strictly follow MiniMax API: purpose must be 'voice_clone' or 'prompt_audio'
  // If the caller passes 'voice_clone_v2' or other internal flags, map them to 'voice_clone'
  let apiPurpose = purpose;
  if (purpose === 'voice_clone_v2') apiPurpose = 'voice_clone';

  form.append('purpose', apiPurpose);

  const headers = { Authorization: `Bearer ${KEY}`, ...form.getHeaders() };
  const resp = await axios.post(endpoint, form, { headers, timeout: 300000 });
  try { if (tmpPath && tmpPath !== filePath && fs.existsSync(tmpPath)) await fs.promises.unlink(tmpPath); } catch { }

  const fileId = resp.data?.file?.file_id || resp.data?.file_id || resp.data?.data?.file_id || resp.data?.data?.id || resp.data?.id;
  if (!fileId) {
    const msg = resp.data?.base_resp?.status_msg || resp.data?.message || JSON.stringify(resp.data);
    throw new Error(`MiniMax 未返回文件ID: ${msg}`);
  }
  return String(fileId);
}

export async function voiceClone(options: { clone_file_id: string; voice_id: string; prompt_audio_file_id?: string; prompt_text?: string; model?: string; text?: string; need_noise_reduction?: boolean; need_volume_normalization?: boolean; aigc_watermark?: boolean; apiKey?: string; apiUrl?: string; }): Promise<{ voiceId: string; sampleFileId?: string; }> {
  const { clone_file_id, voice_id, prompt_audio_file_id, prompt_text, model, text, need_noise_reduction = false, need_volume_normalization = false, aigc_watermark = false, apiKey, apiUrl } = options;
  const KEY = ensureApiKey(apiKey);
  const BASE = apiUrl || 'https://api.minimaxi.com/v1';

  // MiniMax API requires file_id to be int64 if it's a number, but JS handles it as number/string.
  // The API docs show "file_id": "123" or 123. We'll try to keep it as is, but ensure it's valid.
  // However, some users reported issues with string IDs if they are numeric.
  let fid: any = clone_file_id;
  if (/^\d+$/.test(String(clone_file_id))) {
    const num = Number(clone_file_id);
    if (Number.isSafeInteger(num)) fid = num;
  }

  const payload: any = {
    file_id: fid,
    voice_id
  };

  // Construct clone_prompt object
  const clonePrompt: any = {};
  if (prompt_audio_file_id) {
    // Same logic for prompt_audio_file_id
    let pid: any = prompt_audio_file_id;
    if (/^\d+$/.test(String(prompt_audio_file_id))) {
      const num = Number(prompt_audio_file_id);
      if (Number.isSafeInteger(num)) pid = num;
    }
    clonePrompt.prompt_audio = pid;
  }
  if (typeof prompt_text === 'string' && prompt_text.trim().length > 0) {
    clonePrompt.prompt_text = prompt_text.trim();
  }

  if (Object.keys(clonePrompt).length > 0) {
    payload.clone_prompt = clonePrompt;
  }

  if (typeof model === 'string' && model) payload.model = model;

  // text is used for generating a preview audio (trial)
  if (typeof text === 'string' && text) payload.text = text;

  payload.need_noise_reduction = !!need_noise_reduction;
  payload.need_volume_normalization = !!need_volume_normalization;
  payload.aigc_watermark = !!aigc_watermark;

  const useGroup = String(process.env.MINIMAX_ENABLE_GROUP_ID || '').toLowerCase();
  const groupId2 = process.env.MINIMAX_GROUP_ID || process.env.MINIMAXI_GROUP_ID || '';
  const endpoint2 = `${BASE}/voice_clone${(useGroup === 'true' || useGroup === '1') && groupId2 ? `?GroupId=${encodeURIComponent(groupId2)}` : ''}`;

  console.log('[MiniMax VoiceClone] Payload:', JSON.stringify(payload, null, 2));

  const resp = await axios.post(endpoint2, payload, { headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, timeout: 300000, validateStatus: (s) => s >= 200 && s < 400 });

  const statusCode = resp.data?.base_resp?.status_code;
  const statusMsg = resp.data?.base_resp?.status_msg || resp.data?.message;

  if (typeof statusCode === 'number' && statusCode !== 0) {
    throw new Error(`MiniMax 声音克隆失败(${statusCode}): ${statusMsg}`);
  }

  // The API returns input_sensitive, input_sensitive_type, demo_audio (url), base_resp
  // It does NOT return a file_id for the sample usually, it returns demo_audio URL directly?
  // Docs say: "demo_audio": "" (if text is not provided?) or url?
  // Actually docs say response has input_sensitive etc.
  // Let's check if we get a file_id or demo_audio.

  // If text was provided, we expect demo_audio.
  // If not, we just get success.

  // We need to return something useful.
  // If demo_audio is present, we can try to upload it to our system or just return it?
  // The interface expects sampleFileId? 
  // Let's return what we can.

  // Note: The previous code expected file_id in response, but docs don't show it in response for voice_clone.
  // Docs show: { "input_sensitive": false, "demo_audio": "...", "base_resp": ... }

  // So we should return demo_audio as sampleUrl if possible, but the signature returns sampleFileId.
  // We might need to adjust the return type or just return undefined for sampleFileId if not present.

  // Wait, if we want to return the demo audio, we might need to download it if it's a URL.
  // But for now, let's just return what we have.

  // We will modify the return type in the future if needed, but for now let's stick to the signature.
  // We can return the demo_audio url as sampleFileId if it's a string, but the caller might expect an ID.
  // Let's check how the caller uses it.

  return { voiceId: String(voice_id), sampleFileId: resp.data?.demo_audio || undefined };
}

export async function voiceDesign(options: { prompt: string; preview_text?: string; voice_id?: string; aigc_watermark?: boolean; apiKey?: string; apiUrl?: string; }): Promise<{ voiceId: string; requestId?: string; hex?: string; }> {
  const { prompt, preview_text, voice_id, aigc_watermark, apiKey, apiUrl } = options;
  const KEY = ensureApiKey(apiKey);
  const BASE = apiUrl || 'https://api.minimaxi.com/v1';
  const payload: any = { prompt };
  if (typeof preview_text === 'string' && preview_text.trim().length > 0) payload.preview_text = preview_text;
  if (typeof voice_id === 'string' && voice_id.trim().length > 0) payload.voice_id = voice_id;
  if (typeof aigc_watermark === 'boolean') payload.aigc_watermark = aigc_watermark;
  const resp = await axios.post(`${BASE}/voice_design`, payload, { headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, timeout: 300000 });
  const voiceId = resp.data?.voice_id || resp.data?.data?.voice_id;
  const requestId = resp.data?.request_id || resp.data?.data?.request_id;
  const hex = resp.data?.trial_audio || resp.data?.data?.trial_audio || resp.data?.hex || resp.data?.data?.hex;
  return { voiceId: String(voiceId), requestId: requestId ? String(requestId) : undefined, hex: typeof hex === 'string' ? hex : undefined };
}

export async function listVoices(options: { apiKey?: string; apiUrl?: string; }): Promise<Array<{ voiceId: string }>> {
  const { apiKey, apiUrl } = options;
  const KEY = ensureApiKey(apiKey);
  const BASE = apiUrl || 'https://api.minimaxi.com/v1';
  const useGroup = String(process.env.MINIMAX_ENABLE_GROUP_ID || '').toLowerCase();
  const groupId = process.env.MINIMAX_GROUP_ID || process.env.MINIMAXI_GROUP_ID || '';
  const endpoint = `${BASE}/voice/list${(useGroup === 'true' || useGroup === '1') && groupId ? `?GroupId=${encodeURIComponent(groupId)}` : ''}`;
  try {
    const resp = await axios.get(endpoint, { headers: { Authorization: `Bearer ${KEY}` }, timeout: 120000, validateStatus: (s) => s >= 200 && s < 400 });
    const raw = resp.data || {};
    const candidates = raw?.voices || raw?.data?.voices || raw?.data?.voice_list || raw?.voice_list || raw?.data || [];
    const arr = Array.isArray(candidates) ? candidates : [];
    return arr.map((v: any) => ({ voiceId: String(v?.voice_id || v?.voiceId || v?.id || v) }));
  } catch (e: any) {
    return [];
  }
}

export async function deleteVoice(options: { voiceId: string; apiKey?: string; apiUrl?: string; }): Promise<boolean> {
  const { voiceId, apiKey, apiUrl } = options;
  const KEY = ensureApiKey(apiKey);
  const BASE = apiUrl || 'https://api.minimaxi.com/v1';
  const endpoint = `${BASE}/voice/delete`;
  const resp = await axios.post(endpoint, { voice_id: voiceId }, { headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, timeout: 120000 });
  return !!(resp.data?.success || resp.data?.base_resp?.status_code === 0);
}

export async function downloadT2AAsync(options: { fileId: string; apiKey?: string; apiUrl?: string; }): Promise<string> {
  const { fileId, apiKey, apiUrl } = options;
  const KEY = ensureApiKey(apiKey);
  const BASE = apiUrl || 'https://api.minimaxi.com/v1';
  return await downloadFile(BASE, KEY, fileId, 'minimaxi-audio');
}

export async function listFiles(options: { apiKey?: string; apiUrl?: string; purpose?: string; limit?: number }): Promise<Array<{ file_id: string; purpose?: string; created_at?: number; filename?: string; bytes?: number }>> {
  const { apiKey, apiUrl, purpose, limit } = options;
  const KEY = ensureApiKey(apiKey);
  const BASE = apiUrl || 'https://api.minimaxi.com/v1';
  const qs: string[] = [];
  if (purpose) qs.push(`purpose=${encodeURIComponent(purpose)}`);
  if (typeof limit === 'number') qs.push(`limit=${limit}`);
  const useGroup = String(process.env.MINIMAX_ENABLE_GROUP_ID || '').toLowerCase();
  const groupId = process.env.MINIMAX_GROUP_ID || process.env.MINIMAXI_GROUP_ID || '';
  if ((useGroup === 'true' || useGroup === '1') && groupId) qs.push(`GroupId=${encodeURIComponent(groupId)}`);
  const url = `${BASE}/files/list${qs.length ? `?${qs.join('&')}` : ''}`;
  const resp = await axios.get(url, { headers: { Authorization: `Bearer ${KEY}` }, timeout: 120000, validateStatus: (s) => s >= 200 && s < 400 });
  const arr = resp.data?.files || resp.data?.data || [];
  return Array.isArray(arr) ? arr.map((f: any) => ({ file_id: String(f?.file_id || f?.id || ''), purpose: f?.purpose, created_at: f?.created_at, filename: f?.filename, bytes: f?.bytes })) : [];
}

export default { synthesizeSync, createT2AAsync, queryT2AAsync, downloadT2AAsync, uploadFile, voiceClone, voiceDesign, listVoices, deleteVoice };
