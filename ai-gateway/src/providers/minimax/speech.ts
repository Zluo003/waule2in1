import { httpRequest } from '../../utils/http';
import { log } from '../../utils/logger';
import { getActiveApiKey, recordKeyUsage, addRequestLog } from '../../database';
import { uploadBuffer } from '../../services/storage';

const BASE_URL = 'https://api.minimaxi.com/v1';

export interface SpeechGenerationParams {
  model?: string;
  input: string;
  voice?: string;
  speed?: number;
}

export interface SpeechGenerationResult {
  data: Array<{ url: string }>;
}

export async function generateSpeech(params: SpeechGenerationParams): Promise<SpeechGenerationResult> {
  const startTime = Date.now();
  const keyRecord = getActiveApiKey('minimax');
  if (!keyRecord) {
    throw new Error('No active API key for minimax');
  }

  try {
    log('minimax', 'Generating speech', { voice: params.voice, textLength: params.input.length });

    const requestBody = {
      model: params.model || 'speech-01',
      text: params.input,
      voice_id: params.voice || 'female-shaonv',
      speed: params.speed || 1.0,
    };

    const response = await httpRequest<ArrayBuffer>({
      method: 'POST',
      url: `${BASE_URL}/text_to_speech`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${keyRecord.api_key}`,
      },
      data: requestBody,
      timeout: 60000,
      responseType: 'arraybuffer',
    });

    const buffer = Buffer.from(response);
    const url = await uploadBuffer(buffer, '.mp3');

    recordKeyUsage(keyRecord.id, true);
    addRequestLog('minimax', '/audio/speech', params.model || 'speech-01', 'success', Date.now() - startTime);

    return { data: [{ url }] };
  } catch (error: any) {
    recordKeyUsage(keyRecord.id, false);
    addRequestLog('minimax', '/audio/speech', params.model || 'speech-01', 'error', Date.now() - startTime, error.message);
    throw error;
  }
}
