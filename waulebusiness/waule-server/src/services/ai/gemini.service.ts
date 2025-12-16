import axios from 'axios';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { uploadBuffer } from '../../utils/oss';

// 🌐 SOCKS5 代理配置（用于访问 Google API）
// 延迟创建，确保 dotenv.config() 已执行
let _proxyAgent: SocksProxyAgent | undefined;
function getProxyAgent(): SocksProxyAgent | undefined {
  if (_proxyAgent === undefined) {
    const proxyUrl = process.env.SOCKS_PROXY;
    if (proxyUrl) {
      _proxyAgent = new SocksProxyAgent(proxyUrl);
      console.log('🌐 [Gemini] 使用 SOCKS5 代理:', proxyUrl);
    }
  }
  return _proxyAgent;
}

/**
 * Gemini AI 服务
 */

interface GeminiImageGenerateOptions {
  prompt: string;
  modelId?: string;
  aspectRatio?: string;
  imageSize?: string; // 图片分辨率（2K/4K，仅用于 Gemini 3 Pro Image）
  referenceImages?: string[]; // Base64 图片数据数组
  apiKey?: string;
  apiUrl?: string;
}

interface GeminiTextGenerateOptions {
  prompt: string;
  systemPrompt?: string;
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  documentFiles?: Array<{
    filePath: string;
    mimeType: string;
  }>;
  imageUrls?: string[]; // 图片URL数组
  videoUrls?: string[]; // 视频URL数组
  inlineImages?: Array<{ mimeType: string; data: string }>; // 直接传入的内联图片数据
  apiKey?: string;
  apiUrl?: string;
}

/**
 * 使用 Gemini 2.5 Flash Image 生成图片
 */
export const generateImage = async (options: GeminiImageGenerateOptions): Promise<string> => {
  const {
    prompt,
    modelId = 'gemini-2.5-flash-image',
    aspectRatio = '1:1',
    imageSize, // 分辨率（2K/4K）
    referenceImages,
    apiKey,
    apiUrl,
  } = options;

  const API_KEY = apiKey || process.env.GOOGLE_API_KEY;
  if (!API_KEY) {
    throw new Error('Google API Key is required (数据库未配置且环境变量 GOOGLE_API_KEY 未设置)');
  }

  const endpoint = apiUrl || process.env.GOOGLE_API_URL || `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;

  try {
    // 构建 parts 数组
    const parts: any[] = [];

    console.log(`📸 [Gemini] 参考图片数量: ${referenceImages?.length || 0}`);

    // 如果有参考图片，先添加图片（支持 data:base64、公网URL、本地相对路径）
    if (referenceImages && referenceImages.length > 0) {
      for (const imageInput of referenceImages) {
        console.log(`🖼️  [Gemini] 处理参考图: ${imageInput.substring(0, 50)}...`);
        let mimeType = 'image/jpeg';
        let base64Data: string | null = null;

        if (imageInput.startsWith('data:')) {
          // 直接 data URL
          const matches = imageInput.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            mimeType = matches[1];
            base64Data = matches[2];
          }
        } else {
          // 是 URL 或本地路径，先下载/读取为 base64
          try {
            let fileBuffer: Buffer;
            if (imageInput.startsWith('http://') || imageInput.startsWith('https://')) {
              const resp = await axios.get(imageInput, { responseType: 'arraybuffer' });
              fileBuffer = Buffer.from(resp.data);
              mimeType = resp.headers['content-type'] || mimeType;
            } else {
              // 相对路径（例如 /uploads/...）
              const fullPath = path.join(process.cwd(), imageInput);
              fileBuffer = await fs.promises.readFile(fullPath);
              const ext = path.extname(fullPath).toLowerCase();
              const mimeMap: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
              mimeType = mimeMap[ext] || mimeType;
            }
            base64Data = fileBuffer.toString('base64');
          } catch (e: any) {
            console.error('❌ 无法获取参考图:', imageInput, e.message);
          }
        }

        if (base64Data) {
          parts.push({
            inlineData: {
              mimeType,
              data: base64Data,
            },
          });
          console.log(`✅ [Gemini] 参考图已添加到请求: ${mimeType}, 大小: ${base64Data.length} 字符`);
        } else {
          console.warn(`⚠️  [Gemini] 无法获取参考图的base64数据: ${imageInput}`);
        }
      }
      console.log(`📦 [Gemini] 总共添加 ${parts.length} 个图片到 parts 数组`);
    }

    // 添加文本提示词
    parts.push({
      text: prompt,
    });

    // 构建 imageConfig（如果有 aspectRatio 或 imageSize）
    const imageConfig: any = {};
    if (aspectRatio) {
      imageConfig.aspectRatio = aspectRatio;
    }
    if (imageSize) {
      imageConfig.imageSize = imageSize;
    }

    console.log(`🎨 [Gemini] 图片生成参数:`, {
      modelId,
      aspectRatio,
      imageSize,
      imageConfig,
      hasReferenceImages: referenceImages && referenceImages.length > 0,
      partsCount: parts.length,
      partsStructure: parts.map((p, i) => ({
        index: i,
        type: p.text ? 'text' : p.inlineData ? 'image' : 'unknown',
        hasData: p.inlineData ? true : false,
        textPreview: p.text ? p.text.substring(0, 50) + '...' : undefined
      }))
    });

    // 构建请求体
    const requestBody: any = {
      contents: [
        {
          parts: parts,
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
        ...(Object.keys(imageConfig).length > 0 && { imageConfig }),
      },
    };

    // 如果是 Gemini 3 Pro Image，暂时禁用 Google 搜索工具（测试速度）
    // if (modelId === 'gemini-3-pro-image-preview') {
    //   requestBody.tools = [{ googleSearch: {} }];
    //   console.log('🔍 [Gemini] 启用 Google 搜索功能');
    // }
    console.log('🚫 [Gemini] Google 搜索已禁用（提速测试）');

    // 打印完整请求体（不包含图片数据，避免日志过长）
    console.log('📡 [Gemini] 完整请求体:', JSON.stringify({
      ...requestBody,
      contents: [{
        parts: requestBody.contents[0].parts.map((p: any, i: number) =>
          p.inlineData
            ? { inlineData: { mimeType: p.inlineData.mimeType, dataLength: p.inlineData.data?.length || 0 } }
            : p
        )
      }]
    }, null, 2));

    const agent = getProxyAgent();
    console.log('🌐 [Gemini] 请求使用代理:', agent ? '是' : '否');
    
    const apiStartTime = Date.now();
    const response = await axios.post(
      `${endpoint}?key=${API_KEY}`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 600000, // 600秒超时（10分钟）- Gemini 3 Pro Image 可能需要更长时间进行推理和搜索
        httpsAgent: agent,
        httpAgent: agent,
      }
    );

    // 从响应中提取图片数据
    const apiDuration = ((Date.now() - apiStartTime) / 1000).toFixed(1);
    console.log(`📥 [Gemini] API 响应状态: ${response.status}, API耗时: ${apiDuration}s`);
    console.log('📥 [Gemini] 响应头 Content-Type:', response.headers['content-type']);

    const candidates = response.data?.candidates;
    if (!candidates || candidates.length === 0) {
      console.error('❌ [Gemini] No candidates in response. Full response:', JSON.stringify(response.data, null, 2));
      throw new Error('No image generated');
    }

    console.log('✅ [Gemini] 收到 candidates 数量:', candidates.length);

    // 检查 finishReason
    const finishReason = candidates[0]?.finishReason;
    if (finishReason === 'NO_IMAGE') {
      console.error('❌ [Gemini] 模型拒绝生成图片，finishReason: NO_IMAGE');
      throw new Error('Gemini 无法为此提示词生成图片，可能触发了内容安全策略或提示词不适合图片生成');
    }
    if (finishReason === 'SAFETY') {
      console.error('❌ [Gemini] 安全过滤器拦截，finishReason: SAFETY');
      throw new Error('提示词触发了 Gemini 安全过滤器，请修改提示词后重试');
    }

    const responseParts = candidates[0]?.content?.parts;
    if (!responseParts || responseParts.length === 0) {
      console.error('No parts in response. Candidate:', JSON.stringify(candidates[0], null, 2));
      throw new Error(`图片生成失败: ${finishReason || '未知原因'}`);
    }

    // 查找图片数据（inlineData 格式）
    const imagePart = responseParts.find((part: any) => part.inlineData);
    if (!imagePart || !imagePart.inlineData) {
      console.error('No inline data found. Parts:', JSON.stringify(responseParts, null, 2));
      throw new Error('No inline image data found');
    }

    // 将 Base64 图片数据保存为文件（不直接返回base64，避免数据量过大）
    const base64Data = imagePart.inlineData.data;
    const mimeType = imagePart.inlineData.mimeType || 'image/png';

    console.log('📦 [Gemini] 图片数据信息:', {
      mimeType,
      base64Length: base64Data.length,
      estimatedSizeKB: Math.round(base64Data.length * 0.75 / 1024), // base64 to bytes conversion
    });

    // 将base64转换为Buffer
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const ext = mimeType.includes('png') ? '.png' : '.jpg';

    const fileSizeMB = (imageBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`📏 [Gemini] 文件大小: ${fileSizeMB} MB (${imageBuffer.length} bytes)`);

    // 上传到 OSS
    const ossStartTime = Date.now();
    const ossUrl = await uploadBuffer(imageBuffer, ext);
    const ossDuration = ((Date.now() - ossStartTime) / 1000).toFixed(1);
    console.log(`💾 [Gemini] 图片已上传到 OSS: ${ossUrl}, OSS上传耗时: ${ossDuration}s`);
    console.log(`⏱️ [Gemini] 总耗时: API ${apiDuration}s + OSS ${ossDuration}s`);

    return ossUrl;
  } catch (error: any) {
    console.error('Gemini image generation error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
    });

    // 如果是 API 错误响应，输出完整信息
    if (error.response?.data) {
      console.error('Full API error response:', JSON.stringify(error.response.data, null, 2));
    }

    throw new Error(
      `Failed to generate image: ${error.response?.data?.error?.message || error.message}`
    );
  }
};

/**
 * 使用 Gemini 生成文本
 */
export const generateText = async (options: GeminiTextGenerateOptions): Promise<string> => {
  const {
    prompt,
    systemPrompt,
    modelId = 'gemini-2.5-pro',
    temperature = 0.7,
    maxTokens = 8192,
    documentFiles,
    imageUrls,
    videoUrls,
    apiKey,
    apiUrl,
  } = options;

  // 优先通过 waule-api 网关调用（统一管理密钥）
  // 只有当明确提供了 apiKey 时才直接调用 Google API
  if (!apiKey) {
    console.log('[Gemini] 通过 waule-api 网关调用:', { modelId, temperature, maxTokens });
    
    const { wauleApiClient } = await import('../wauleapi-client');
    
    // 构建消息
    const messages: Array<{ role: string; content: any }> = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    
    // 构建用户消息内容（支持多模态）
    const userContent: any[] = [{ type: 'text', text: prompt }];
    
    // 添加图片
    if (imageUrls && imageUrls.length > 0) {
      for (const url of imageUrls) {
        userContent.push({
          type: 'image_url',
          image_url: { url },
        });
      }
    }
    
    // 添加视频
    if (videoUrls && videoUrls.length > 0) {
      for (const url of videoUrls) {
        userContent.push({
          type: 'video_url',
          video_url: { url },
        });
      }
    }
    
    // 处理文档文件（提取文本后添加到 prompt）
    if (documentFiles && documentFiles.length > 0) {
      let docTexts: string[] = [];
      for (const doc of documentFiles) {
        try {
          let fileBuffer: Buffer | null = null;
          const fullPath = path.join(process.cwd(), doc.filePath);
          
          if (fs.existsSync(fullPath)) {
            fileBuffer = fs.readFileSync(fullPath);
          } else if (doc.filePath.startsWith('http://') || doc.filePath.startsWith('https://')) {
            const resp = await axios.get(doc.filePath, { responseType: 'arraybuffer' });
            fileBuffer = Buffer.from(resp.data);
          }
          
          if (fileBuffer) {
            let docText = '';
            const mime = (doc.mimeType || '').toLowerCase();
            if (mime === 'application/pdf') {
              const pdfParse = (await import('pdf-parse')).default as any;
              const pdfData = await pdfParse(fileBuffer);
              docText = String(pdfData?.text || '');
            } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
              const mammoth = await import('mammoth');
              const result = await mammoth.extractRawText({ buffer: fileBuffer });
              docText = String(result?.value || '');
            } else if (mime.startsWith('text/')) {
              docText = fileBuffer.toString('utf8');
            }
            if (docText) {
              docTexts.push(`[文档内容]\n${docText}`);
            }
          }
        } catch (e) {
          console.error('[Gemini] 处理文档失败:', e);
        }
      }
      if (docTexts.length > 0) {
        userContent[0] = { type: 'text', text: `${prompt}\n\n${docTexts.join('\n\n')}` };
      }
    }
    
    messages.push({ role: 'user', content: userContent });
    
    const result = await wauleApiClient.chat({
      model: modelId,
      messages,
      temperature,
      max_tokens: maxTokens,
    });
    
    const text = result.choices?.[0]?.message?.content || '';
    console.log('[Gemini] waule-api 返回文本长度:', text.length);
    return text;
  }

  // 直接调用 Google API（仅当提供了 apiKey 时）
  console.log('[Gemini] 直接调用 Google API:', { modelId, hasApiKey: !!apiKey });
  
  const API_KEY = apiKey;
  const endpoint = apiUrl || process.env.GOOGLE_API_URL || `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;

  try {
    const contents = [];

    // 如果有系统提示词，添加为第一条消息
    if (systemPrompt) {
      contents.push({
        role: 'user',
        parts: [{ text: systemPrompt }],
      });
      contents.push({
        role: 'model',
        parts: [{ text: '好的，我明白了。' }],
      });
    }

    // 构建用户消息的parts数组
    const userParts: any[] = [];

    // 先添加文本提示词（根据官方文档，提示词应该在文档之前）
    userParts.push({ text: prompt });

    // 如果有文档文件，添加到parts中
    if (documentFiles && documentFiles.length > 0) {
      console.log('📄 处理文档文件:', documentFiles.length, '个');
      for (const doc of documentFiles) {
        try {
          const fullPath = path.join(process.cwd(), doc.filePath);
          console.log('📂 读取文件:', fullPath);

          let fileBuffer: Buffer | null = null;
          if (fs.existsSync(fullPath)) {
            fileBuffer = fs.readFileSync(fullPath);
          } else if (doc.filePath.startsWith('http://') || doc.filePath.startsWith('https://')) {
            console.log('🌐 文档为远程URL，开始下载:', doc.filePath);
            const resp = await axios.get(doc.filePath, { responseType: 'arraybuffer' });
            fileBuffer = Buffer.from(resp.data);
          }

          if (!fileBuffer) {
            console.error('❌ 无法获取文档内容:', doc.filePath);
            continue;
          }

          console.log('✅ 文档已获取，大小:', fileBuffer.length, 'bytes, MIME:', doc.mimeType);

          let docText = '';
          const mime = (doc.mimeType || '').toLowerCase();
          if (mime === 'application/pdf') {
            const pdfParse = (await import('pdf-parse')).default as any;
            const pdfData = await pdfParse(fileBuffer);
            docText = String(pdfData?.text || '');
          } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const mammoth = await import('mammoth');
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            docText = String(result?.value || '');
          } else if (mime.startsWith('text/')) {
            docText = fileBuffer.toString('utf8');
          }

          if (docText && docText.trim()) {
            userParts.push({ text: docText });
          }
        } catch (error: any) {
          console.error('❌ 处理文档失败:', error.message);
        }
      }
    }

    // 如果有图片URL，下载并添加到parts中
    if (imageUrls && imageUrls.length > 0) {
      console.log('🖼️ 处理图片URL:', imageUrls.length, '个');
      for (const imageUrl of imageUrls) {
        try {
          let base64Data: string;
          let mimeType: string;

          // 检查是否已经是base64格式
          if (imageUrl.startsWith('data:')) {
            const matches = imageUrl.match(/^data:(.+);base64,(.+)$/);
            if (matches) {
              mimeType = matches[1];
              base64Data = matches[2];
              console.log('✅ 使用base64图片, MIME:', mimeType);
            } else {
              console.error('❌ 无效的base64格式:', imageUrl.substring(0, 50));
              continue;
            }
          } else {
            // 下载图片
            console.log('📥 下载图片:', imageUrl);
            const response = await axios.get(imageUrl, { responseType: 'stream' });
            const chunks: Buffer[] = [];
            await new Promise<void>((resolve, reject) => {
              response.data.on('data', (chunk: Buffer) => chunks.push(chunk));
              response.data.on('end', () => resolve());
              response.data.on('error', reject);
            });
            const buf = Buffer.concat(chunks);
            base64Data = buf.toString('base64');
            mimeType = response.headers['content-type'] || 'image/jpeg';
            console.log('✅ 图片已下载，大小:', buf.length, 'bytes, MIME:', mimeType);
          }

          userParts.push({
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          });
        } catch (error: any) {
          console.error('❌ 处理图片失败:', error.message);
        }
      }
    }

    // 如果有视频URL，下载并添加到parts中
    if (videoUrls && videoUrls.length > 0) {
      console.log('🎬 处理视频URL:', videoUrls.length, '个');
      for (const videoUrl of videoUrls) {
        try {
          let base64Data: string;
          let mimeType: string;

          // 检查是否已经是base64格式
          if (videoUrl.startsWith('data:')) {
            const matches = videoUrl.match(/^data:(.+);base64,(.+)$/);
            if (matches) {
              mimeType = matches[1];
              base64Data = matches[2];
              console.log('✅ 使用base64视频, MIME:', mimeType);
            } else {
              console.error('❌ 无效的base64格式:', videoUrl.substring(0, 50));
              continue;
            }
          } else {
            // 下载视频
            console.log('📥 下载视频:', videoUrl);
            const response = await axios.get(videoUrl, { responseType: 'stream' });
            const chunks: Buffer[] = [];
            await new Promise<void>((resolve, reject) => {
              response.data.on('data', (chunk: Buffer) => chunks.push(chunk));
              response.data.on('end', () => resolve());
              response.data.on('error', reject);
            });
            const buf = Buffer.concat(chunks);
            base64Data = buf.toString('base64');
            mimeType = response.headers['content-type'] || 'video/mp4';
            console.log('✅ 视频已下载，大小:', buf.length, 'bytes, MIME:', mimeType);
          }

          userParts.push({
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          });
        } catch (error: any) {
          console.error('❌ 处理视频失败:', error.message);
        }
      }
    }

    // 处理直接传入的 inlineImages (用于视频帧分析等场景)
    if (options.inlineImages && options.inlineImages.length > 0) {
      console.log('🖼️ 处理内联图片:', options.inlineImages.length, '个');
      options.inlineImages.forEach(img => {
        userParts.push({
          inline_data: {
            mime_type: img.mimeType,
            data: img.data
          }
        });
      });
    }

    // 添加用户消息
    contents.push({
      parts: userParts,
    });

    // 打印请求结构（不包含base64数据）
    console.log('📤 Gemini API请求结构:', JSON.stringify({
      endpoint,
      model: modelId,
      contentsLength: contents.length,
      contentsStructure: contents.map(c => ({
        role: c.role,
        partsCount: c.parts?.length,
        partsTypes: c.parts?.map(p => p.text ? 'text' : (p.inline_data ? 'inline_data' : 'unknown'))
      })),
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      }
    }, null, 2));

    const response = await axios.post(
      `${endpoint}?key=${API_KEY}`,
      {
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 180000, // 增加超时到3分钟，处理多图片需要更长时间
        ...(getProxyAgent() ? { httpsAgent: getProxyAgent(), httpAgent: getProxyAgent() } : {}),
      }
    );

    const candidates = response.data?.candidates;
    if (!candidates || candidates.length === 0) {
      console.error('❌ Gemini API 返回结构:', JSON.stringify(response.data, null, 2));
      throw new Error('No text generated');
    }

    const text = candidates[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('❌ Gemini 候选响应:', JSON.stringify(candidates[0], null, 2));
      console.error('❌ 完整响应数据:', JSON.stringify(response.data, null, 2));
      
      // 检查是否有安全过滤或其他问题
      if (candidates[0]?.finishReason) {
        throw new Error(`Gemini 停止生成，原因: ${candidates[0].finishReason}`);
      }
      
      throw new Error('No text in response');
    }

    return text;
  } catch (error: any) {
    console.error('Gemini text generation error:');
    console.error('Error message:', error.message);
    console.error('Response status:', error.response?.status);
    console.error('Response data:', JSON.stringify(error.response?.data, null, 2));
    console.error('Request config:', {
      endpoint,
      modelId,
      temperature,
      maxTokens,
      systemPromptLength: systemPrompt?.length || 0,
      promptLength: prompt?.length || 0,
    });

    const errorMessage = error.response?.data?.error?.message || error.message;
    throw new Error(`Failed to generate text with ${modelId}: ${errorMessage}`);
  }
};

/**
 * 根据比例获取图片尺寸（用于前端显示）
 * Gemini 2.5 Flash Image 现在支持 10 种宽高比
 */
function getImageDimensions(aspectRatio: string): { width: number; height: number } {
  // 这些尺寸仅用于前端预览估算
  const dimensions: Record<string, { width: number; height: number }> = {
    '21:9': { width: 1536, height: 656 }, // 超宽屏
    '16:9': { width: 1344, height: 768 }, // 宽屏
    '4:3': { width: 1152, height: 896 },  // 标准横屏
    '3:2': { width: 1216, height: 832 },  // 横屏
    '5:4': { width: 1120, height: 896 },  // 接近正方形
    '1:1': { width: 1024, height: 1024 }, // 正方形
    '4:5': { width: 896, height: 1120 },  // 接近正方形竖屏
    '2:3': { width: 832, height: 1216 },  // 竖屏
    '3:4': { width: 896, height: 1152 },  // 标准竖屏
    '9:16': { width: 768, height: 1344 }, // 竖屏
  };

  return dimensions[aspectRatio] || dimensions['1:1'];
}

export default {
  generateImage,
  generateText,
};
