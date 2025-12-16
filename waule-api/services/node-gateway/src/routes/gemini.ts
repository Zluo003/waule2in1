import { Router, Request, Response } from 'express';
import axios from 'axios';
import { uploadBuffer } from '../oss';
import { getNextGeminiKey, recordGeminiKeyUsage, getGeminiConfig } from '../db';

const router = Router();

function log(msg: string, data?: any) {
  const time = new Date().toISOString();
  console.log(`[${time}] [Gemini] ${msg}`, data || '');
}

interface GeminiImageOptions {
  prompt: string;
  modelId?: string;
  aspectRatio?: string;
  imageSize?: string;
  referenceImages?: string[];
  apiKey?: string;
  apiUrl?: string;
}

interface GeminiTextOptions {
  prompt: string;
  systemPrompt?: string;
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  imageUrls?: string[];
  inlineImages?: Array<{ mimeType: string; data: string }>;
  apiKey?: string;
  apiUrl?: string;
}

// 获取可用的 API Key
function getApiKey(requestApiKey?: string): { key: string; keyId: number | null } {
  // 优先使用请求中的 key
  if (requestApiKey) {
    return { key: requestApiKey, keyId: null };
  }
  
  // 从数据库轮询获取
  const dbKey = getNextGeminiKey();
  if (dbKey) {
    return { key: dbKey.api_key, keyId: dbKey.id };
  }
  
  // 回退到环境变量
  const envKey = process.env.GOOGLE_API_KEY;
  if (envKey) {
    return { key: envKey, keyId: null };
  }
  
  throw new Error('No Gemini API Key available');
}

// 图片生成
async function generateImage(options: GeminiImageOptions): Promise<string> {
  const {
    prompt,
    modelId = 'gemini-2.0-flash-exp-image-generation',
    aspectRatio = '1:1',
    imageSize,
    referenceImages,
    apiUrl,
  } = options;

  const { key: API_KEY, keyId } = getApiKey(options.apiKey);

  const endpoint = apiUrl || process.env.GOOGLE_API_URL || 
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;

  try {
    const parts: any[] = [];

    log(`参考图片数量: ${referenceImages?.length || 0}`);

    // 处理参考图片
    if (referenceImages && referenceImages.length > 0) {
      for (const imageInput of referenceImages) {
        log(`处理参考图: ${imageInput.substring(0, 50)}...`);
        let mimeType = 'image/jpeg';
        let base64Data: string | null = null;

        if (imageInput.startsWith('data:')) {
          const matches = imageInput.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            mimeType = matches[1];
            base64Data = matches[2];
          }
        } else if (imageInput.startsWith('http://') || imageInput.startsWith('https://')) {
          try {
            const resp = await axios.get(imageInput, { responseType: 'arraybuffer', timeout: 30000 });
            const fileBuffer = Buffer.from(resp.data);
            mimeType = resp.headers['content-type'] || mimeType;
            base64Data = fileBuffer.toString('base64');
          } catch (e: any) {
            log(`无法获取参考图: ${imageInput} - ${e.message}`);
          }
        }

        if (base64Data) {
          parts.push({ inlineData: { mimeType, data: base64Data } });
          log(`参考图已添加: ${mimeType}`);
        }
      }
    }

    parts.push({ text: prompt });

    const imageConfig: any = {};
    if (aspectRatio) imageConfig.aspectRatio = aspectRatio;
    if (imageSize) imageConfig.imageSize = imageSize;

    log(`图片生成参数:`, { modelId, aspectRatio, imageSize });

    const requestBody: any = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        ...(Object.keys(imageConfig).length > 0 && { imageConfig }),
      },
    };

    const apiStartTime = Date.now();
    const response = await axios.post(
      `${endpoint}?key=${API_KEY}`,
      requestBody,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 300000,
      }
    );

    const apiDuration = ((Date.now() - apiStartTime) / 1000).toFixed(1);
    log(`API 响应状态: ${response.status}, 耗时: ${apiDuration}s`);

    // 记录成功
    if (keyId) recordGeminiKeyUsage(keyId, true);

    const candidates = response.data?.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error('No image generated');
    }

    const finishReason = candidates[0]?.finishReason;
    if (finishReason === 'NO_IMAGE') {
      throw new Error('Gemini 无法为此提示词生成图片');
    }
    if (finishReason === 'SAFETY') {
      throw new Error('提示词触发了安全过滤器');
    }

    const responseParts = candidates[0]?.content?.parts;
    const imagePart = responseParts?.find((part: any) => part.inlineData);
    if (!imagePart?.inlineData) {
      throw new Error('No inline image data found');
    }

    const base64Data = imagePart.inlineData.data;
    const mimeType = imagePart.inlineData.mimeType || 'image/png';
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const ext = mimeType.includes('png') ? '.png' : '.jpg';

    log(`图片大小: ${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // 上传到 OSS
    const ossStartTime = Date.now();
    const ossUrl = await uploadBuffer(imageBuffer, ext, 'gemini');
    const ossDuration = ((Date.now() - ossStartTime) / 1000).toFixed(1);
    
    log(`已上传到 OSS: ${ossUrl}`);
    log(`总耗时: API ${apiDuration}s + OSS ${ossDuration}s`);

    return ossUrl;
  } catch (error: any) {
    // 记录失败
    if (keyId) recordGeminiKeyUsage(keyId, false, error.message);
    
    log(`图片生成错误: ${error.message}`);
    if (error.response?.data) {
      log(`API error: ${JSON.stringify(error.response.data)}`);
    }
    throw new Error(`Failed to generate image: ${error.response?.data?.error?.message || error.message}`);
  }
}

// 文本生成
async function generateText(options: GeminiTextOptions): Promise<string> {
  const {
    prompt,
    systemPrompt,
    modelId = 'gemini-2.0-flash',
    temperature = 0.7,
    maxTokens = 8192,
    imageUrls,
    inlineImages,
    apiUrl,
  } = options;

  const { key: API_KEY, keyId } = getApiKey(options.apiKey);

  const endpoint = apiUrl || process.env.GOOGLE_API_URL || 
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;

  try {
    const contents = [];

    if (systemPrompt) {
      contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
      contents.push({ role: 'model', parts: [{ text: '好的，我明白了。' }] });
    }

    const userParts: any[] = [{ text: prompt }];

    // 处理图片
    if (imageUrls && imageUrls.length > 0) {
      for (const imageUrl of imageUrls) {
        try {
          let base64Data: string;
          let mimeType: string;

          if (imageUrl.startsWith('data:')) {
            const matches = imageUrl.match(/^data:(.+);base64,(.+)$/);
            if (matches) {
              mimeType = matches[1];
              base64Data = matches[2];
              userParts.push({ inline_data: { mime_type: mimeType, data: base64Data } });
            }
          } else {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
            base64Data = Buffer.from(response.data).toString('base64');
            mimeType = response.headers['content-type'] || 'image/jpeg';
            userParts.push({ inline_data: { mime_type: mimeType, data: base64Data } });
          }
        } catch (e: any) {
          log(`处理图片失败: ${e.message}`);
        }
      }
    }

    // 处理内联图片
    if (inlineImages && inlineImages.length > 0) {
      inlineImages.forEach(img => {
        userParts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
      });
    }

    contents.push({ parts: userParts });

    const response = await axios.post(
      `${endpoint}?key=${API_KEY}`,
      {
        contents,
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 180000,
      }
    );

    // 记录成功
    if (keyId) recordGeminiKeyUsage(keyId, true);

    const candidates = response.data?.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error('No text generated');
    }

    const text = candidates[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('No text in response');
    }

    return text;
  } catch (error: any) {
    // 记录失败
    if (keyId) recordGeminiKeyUsage(keyId, false, error.message);
    
    log(`文本生成错误: ${error.message}`);
    throw new Error(`Failed to generate text: ${error.response?.data?.error?.message || error.message}`);
  }
}

// ========== 路由 ==========

// 图片生成 API
router.post('/image', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    log('收到图片生成请求:', {
      prompt: req.body.prompt?.substring(0, 50),
      modelId: req.body.modelId,
      aspectRatio: req.body.aspectRatio,
      referenceImages: req.body.referenceImages?.length || 0,
    });

    const imageUrl = await generateImage({
      prompt: req.body.prompt,
      modelId: req.body.modelId,
      aspectRatio: req.body.aspectRatio,
      imageSize: req.body.imageSize,
      referenceImages: req.body.referenceImages,
      apiKey: req.body.apiKey,
      apiUrl: req.body.apiUrl,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`图片生成成功, 耗时: ${duration}s`);

    res.json({ success: true, imageUrl });
  } catch (error: any) {
    log(`图片生成失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 文本生成 API
router.post('/text', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    log('收到文本生成请求:', {
      prompt: req.body.prompt?.substring(0, 50),
      modelId: req.body.modelId,
      systemPrompt: req.body.systemPrompt?.substring(0, 30),
    });

    const text = await generateText({
      prompt: req.body.prompt,
      systemPrompt: req.body.systemPrompt,
      modelId: req.body.modelId,
      temperature: req.body.temperature,
      maxTokens: req.body.maxTokens,
      imageUrls: req.body.imageUrls,
      inlineImages: req.body.inlineImages,
      apiKey: req.body.apiKey,
      apiUrl: req.body.apiUrl,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`文本生成成功, 耗时: ${duration}s, 长度: ${text.length}`);

    res.json({ success: true, text });
  } catch (error: any) {
    log(`文本生成失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

export { router as geminiRouter };
