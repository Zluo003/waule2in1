import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { prisma, redis } from '../index';
import * as geminiService from '../services/ai/gemini-proxy.service';
import * as doubaoService from '../services/ai/doubao.service';
import * as wanxService from '../services/ai/wanx.service';
import * as soraService from '../services/ai/sora.service';
import * as viduService from '../services/ai/vidu.service';
import * as minimaxiService from '../services/ai/minimaxi.service';
import * as minimaxiImageService from '../services/ai/minimaxi.image.service';
import midjourneyService from '../services/midjourney.service';
import * as aliyunService from '../services/ai/aliyun.service';
import cosyvoiceService from '../services/ai/cosyvoice.service';
import minimaxiAudioService from '../services/ai/minimaxi.audio.service';
import { ensureAliyunOssUrl, uploadBuffer } from '../utils/oss';
import { downloadToLocal } from '../utils/file';
import { userLevelService } from '../services/user-level.service';

// 🚀 获取 AI 模型（带缓存）
async function getAIModel(modelId: string) {
  const cacheKey = `ai:model:${modelId}`;
  
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {}
  
  const model = await prisma.aIModel.findUnique({
    where: { id: modelId },
  });
  
  if (model) {
    try { await redis.set(cacheKey, JSON.stringify(model), 'EX', 600); } catch {}
  }
  
  return model;
}

/**
 * 生成图片
 */
export const generateImage = asyncHandler(async (req: Request, res: Response) => {
  const { modelId, prompt, ratio = '1:1', referenceImages } = req.body;

  if (!modelId || !prompt) {
    throw new AppError('模型ID和提示词是必需的', 400);
  }

  // 🚀 获取模型配置（使用缓存）
  const model = await getAIModel(modelId);

  if (!model) {
    throw new AppError('模型不存在', 404);
  }

  if (!model.isActive) {
    throw new AppError('模型未启用', 400);
  }

  if (model.type !== 'IMAGE_GENERATION') {
    throw new AppError('该模型不支持图片生成', 400);
  }

  let imageUrl: string | string[];

  try {
    // 根据提供商调用不同的服务
    switch (model.provider.toLowerCase()) {
      case 'google':
        imageUrl = await geminiService.generateImage({
          prompt,
          modelId: model.modelId,
          aspectRatio: ratio,
          referenceImages: referenceImages || undefined,
          apiKey: model.apiKey || undefined,
          apiUrl: model.apiUrl || undefined,
        });
        break;

      case 'openai':
        // TODO: 实现 OpenAI DALL-E API
        throw new AppError('OpenAI 图片生成暂未实现', 501);

      case 'stability':
        // TODO: 实现 Stability AI API
        throw new AppError('Stability AI 图片生成暂未实现', 501);

      case 'bytedance':
        imageUrl = await doubaoService.generateImage({
          prompt,
          modelId: model.modelId,
          aspectRatio: ratio,
          referenceImages: referenceImages || undefined,
          apiKey: model.apiKey || undefined,
          apiUrl: model.apiUrl || undefined,
        });
        break;

      case 'minimaxi':
      case 'hailuo':
      case '海螺':
        imageUrl = await minimaxiImageService.generateImage({
          prompt,
          modelId: model.modelId,
          aspectRatio: ratio,
          referenceImages: referenceImages || undefined,
          apiKey: model.apiKey || undefined,
          apiUrl: model.apiUrl || undefined,
        });
        break;

      case 'midjourney':
        // 使用 Midjourney 生成图片
        console.log('🎨 [AI Controller] 使用 Midjourney 生成图片');

        // 构建完整的提示词（添加比例参数）
        let fullPrompt = prompt;

        // 检查是否已有 --ar 参数，没有则添加
        if (ratio && ratio !== '1:1' && !fullPrompt.includes('--ar')) {
          fullPrompt += ` --ar ${ratio}`;
        }

        // 检查是否已有 --v 参数，没有则根据模型ID添加
        if (!fullPrompt.includes('--v') && !fullPrompt.includes('--version')) {
          if (model.modelId.includes('v7')) {
            fullPrompt += ' --v 7.0';  // V7 使用 7.0
          } else if (model.modelId.includes('v6')) {
            fullPrompt += ' --v 6.0';  // V6 使用 6.0
          }
        }

        console.log('📝 完整提示词:', fullPrompt);

        // 提交 imagine 任务
        const imagineResponse = await midjourneyService.imagine({
          prompt: fullPrompt,
          base64Array: referenceImages || undefined,
        });

        if (imagineResponse.code !== 1) {
          throw new AppError(`Midjourney 任务提交失败: ${imagineResponse.description}`, 500);
        }

        const taskId = imagineResponse.result;
        console.log('✅ Midjourney 任务已提交:', taskId);

        // 轮询等待任务完成
        console.log('⏳ 等待 Midjourney 生成...');
        const taskResult = await midjourneyService.pollTask(taskId!);

        console.log('📊 [Midjourney] Task Result:', JSON.stringify(taskResult, null, 2));

        if (!taskResult.imageUrl) {
          console.error('❌ [Midjourney] 未获取到图片URL');
          console.error('Task Result:', taskResult);
          throw new AppError('Midjourney 生成失败: 未获取到图片URL', 500);
        }

        imageUrl = taskResult.imageUrl;
        console.log('🎉 Midjourney 生成完成!');
        console.log('   图片URL:', imageUrl);
        console.log('   按钮数量:', taskResult.buttons?.length || 0);
        break;

      case 'sora':
        imageUrl = await soraService.generateImage({
          prompt,
          modelId: model.modelId,
          aspectRatio: ratio,
          referenceImages: referenceImages || undefined,
          apiKey: model.apiKey || undefined,
          apiUrl: model.apiUrl || undefined,
        });
        break;

      case 'aliyun':
        imageUrl = await aliyunService.generateImage({
          prompt,
          modelId: model.modelId,
          aspectRatio: ratio,
          referenceImages: referenceImages || undefined,
          apiKey: model.apiKey || undefined,
          apiUrl: model.apiUrl || undefined,
        });
        break;

      default:
        throw new AppError(`不支持的提供商: ${model.provider}`, 400);
    }

    // 记录使用
    await prisma.usageRecord.create({
      data: {
        userId: req.user!.id,
        modelId: model.id,
        operation: 'IMAGE_GENERATION',
        cost: model.pricePerUse || 0,
        metadata: {
          prompt,
          ratio,
          provider: model.provider,
        },
      },
    });

    const responseData = {
      success: true,
      data: {
        imageUrl,
        model: model.name,
        ratio,
      },
    };

    console.log('📤 [AI Controller] 返回响应:', JSON.stringify(responseData, null, 2));

    res.json(responseData);
  } catch (error: any) {
    console.error('Image generation error:', error);
    throw new AppError(`图片生成失败: ${error.message}`, 500);
  }
});

/**
 * 生成文本
 */
export const generateText = asyncHandler(async (req: Request, res: Response) => {
  const { modelId, prompt, systemPrompt, temperature, maxTokens, documentFiles, imageUrls, videoUrls } = req.body;
  const userId = req.user!.id;

  if (!modelId || !prompt) {
    throw new AppError('模型ID和提示词是必需的', 400);
  }

  // 🚀 获取模型配置（使用缓存）
  const model = await getAIModel(modelId);

  if (!model) {
    throw new AppError('模型不存在', 404);
  }

  if (!model.isActive) {
    throw new AppError('模型未启用', 400);
  }

  if (model.type !== 'TEXT_GENERATION') {
    throw new AppError('该模型不支持文本生成', 400);
  }

  // 扣费逻辑
  const { billingService } = await import('../services/billing.service');
  let creditsCharged = 0;
  try {
    const usageRecord = await billingService.chargeUser({
      userId,
      aiModelId: modelId,
      operation: '文本生成',
      quantity: 1,
    });
    if (usageRecord) {
      creditsCharged = usageRecord.creditsCharged || 0;
      console.log(`[AI] 文本生成扣费: ${creditsCharged} 积分, 用户: ${userId}`);
    }
  } catch (error: any) {
    if (error.message?.includes('Insufficient')) {
      throw new AppError('积分不足，请充值后再试', 402);
    }
    console.warn('[AI] 文本生成扣费失败:', error.message);
  }

  let text: string;

  try {
    // 根据提供商调用不同的服务
    switch (model.provider.toLowerCase()) {
      case 'google':
        text = await geminiService.generateText({
          prompt,
          systemPrompt,
          modelId: model.modelId,
          temperature,
          maxTokens,
          documentFiles,
          imageUrls,
          videoUrls,
          apiKey: model.apiKey || undefined,
          apiUrl: model.apiUrl || undefined,
        });
        break;

      case 'openai':
        // TODO: 实现 OpenAI API
        throw new AppError('OpenAI 文本生成暂未实现', 501);

      case 'bytedance':
        text = await doubaoService.generateText({
          prompt,
          systemPrompt,
          modelId: model.modelId,
          temperature,
          maxTokens,
          imageUrls,
          videoUrls,
          apiKey: model.apiKey || undefined,
          apiUrl: model.apiUrl || undefined,
        });
        break;
      case 'doubao':
        text = await doubaoService.generateText({
          prompt,
          systemPrompt,
          modelId: model.modelId,
          temperature,
          maxTokens,
          imageUrls,
          videoUrls,
          apiKey: model.apiKey || undefined,
          apiUrl: model.apiUrl || undefined,
        });
        break;

      default:
        throw new AppError(`不支持的提供商: ${model.provider}`, 400);
    }

    res.json({
      success: true,
      data: {
        text,
        model: model.name,
      },
      creditsCharged,
    });
  } catch (error: any) {
    console.error('Text generation error:', error);
    throw new AppError(`文本生成失败: ${error.message}`, 500);
  }
});

/**
 * 生成视频
 */
export const generateVideo = asyncHandler(async (req: Request, res: Response) => {
  const {
    modelId,
    prompt,
    ratio = '16:9',
    resolution = '1080p',  // 注意：小写p
    generationType = '文生视频',
    duration = 5,
    referenceImages
  } = req.body;

  console.log('🎬 视频生成请求参数:', {
    modelId,
    prompt: prompt?.substring(0, 100),
    ratio,
    resolution,
    generationType,
    duration,
    referenceImagesCount: referenceImages?.length || 0,
    referenceImages: referenceImages?.map((img: string) => ({
      type: img.startsWith('data:') ? 'base64' : (img.startsWith('http') ? 'url' : 'unknown'),
      preview: img.substring(0, 100) + '...'
    }))
  });

  if (!modelId || !prompt) {
    throw new AppError('模型ID和提示词是必需的', 400);
  }

  // 🚀 获取模型配置（使用缓存）
  const model = await getAIModel(modelId);

  if (!model) {
    throw new AppError('模型不存在', 404);
  }

  if (!model.isActive) {
    throw new AppError('模型未启用', 400);
  }

  if (model.type !== 'VIDEO_GENERATION') {
    throw new AppError('该模型不支持视频生成', 400);
  }

  let videoUrl: string;

  try {
    // 根据提供商调用不同的服务
    const providerLower = model.provider.toLowerCase();

    switch (providerLower) {
      case 'doubao':
      case 'bytedance':
        videoUrl = await doubaoService.generateVideo({
          prompt,
          modelId: model.modelId,
          ratio,
          resolution,
          generationType,
          duration,
          referenceImages,
          apiKey: model.apiKey || undefined,
          apiUrl: model.apiUrl || undefined,
        });
        break;
      case 'minimaxi':
      case 'hailuo':
      case '海螺':
        {
          const referenceImageList = referenceImages || [];
          const videoDuration = typeof duration === 'number' ? duration : 5;
          const genType = (referenceImageList.length >= 2 ? 'fl2v' : (referenceImageList.length === 1 ? 'i2v' : 't2v'));
          if (genType === 'fl2v') {
            const modelCaps = await prisma.modelCapability.findMany({ where: { aiModelId: model.id, capability: '首尾帧' } });
            const cfg = typeof model.config === 'object' ? (model.config as any) : {};
            const supportedByBackend = modelCaps.length > 0 ? !!modelCaps[0].supported : (Array.isArray(cfg.supportedGenerationTypes) && cfg.supportedGenerationTypes.includes('首尾帧'));
            if (!supportedByBackend) {
              throw new AppError(`当前模型不支持首尾帧: ${model.modelId}`, 400);
            }
          }
          const videoUrlRes = await minimaxiService.generateVideo({
            prompt,
            modelId: model.modelId,
            aspectRatio: ratio,
            resolution,
            duration: videoDuration,
            referenceImages: referenceImageList,
            generationType: genType,
            apiKey: model.apiKey || undefined,
            apiUrl: model.apiUrl || undefined,
          });
          videoUrl = videoUrlRes;
        }
        break;

      case 'aliyun':
      case 'tongyi':
      case 'wanx':
        // 通义万相视频生成
        // 提取首帧图片（如果是首帧模式）
        const firstFrameImage = referenceImages && referenceImages.length > 0 ? referenceImages[0] : undefined;

        // 通义万相duration是整数（秒），直接使用
        const wanxDuration = duration; // 5 或 10（秒）

        // 通义万相resolution格式：'480P'、'720P'、'1080P'
        // 如果传入的是其他格式，转换为标准格式
        let wanxResolution = resolution;
        if (resolution === '1280x720') {
          wanxResolution = '720P';
        } else if (resolution === '1920x1080') {
          wanxResolution = '1080P';
        } else if (!['480P', '720P', '1080P'].includes(resolution)) {
          // 默认使用1080P
          wanxResolution = '1080P';
        }

        videoUrl = await wanxService.generateVideoFromFirstFrame({
          prompt,
          modelId: model.modelId,
          firstFrameImage,
          duration: wanxDuration, // 整数：5 或 10
          resolution: wanxResolution, // 字符串：'480P'、'720P'、'1080P'
          apiKey: model.apiKey || undefined,
          apiUrl: model.apiUrl || undefined,
        });
        break;

      case 'sora':
        // Sora 视频生成（支持文生视频和图生视频）
        const referenceImage = referenceImages && referenceImages.length > 0 ? referenceImages[0] : undefined;

        videoUrl = await soraService.generateVideo({
          prompt,
          modelId: model.modelId,
          aspectRatio: ratio,
          referenceImage,
          apiKey: model.apiKey || undefined,
          apiUrl: model.apiUrl || undefined,
        });
        break;

      case 'vidu':
        // Vidu Q2 图生视频（支持单张首帧图或首尾帧）
        if (!referenceImages || referenceImages.length === 0) {
          throw new AppError('Vidu 需要提供首帧图像', 400);
        }

        console.log('🎬 [Vidu] 开始图生视频生成');
        console.log('   - 模型:', model.modelId);
        console.log('   - 时长:', duration);
        console.log('   - 分辨率:', resolution);
        console.log('   - 图片数量:', referenceImages.length);
        console.log('   - 生成类型:', referenceImages.length === 2 ? '首尾帧' : '图生视频');

        videoUrl = await viduService.imageToVideo({
          images: referenceImages.length === 2 ? [referenceImages[0], referenceImages[1]] : [referenceImages[0]], // 支持首尾帧或单张首帧
          prompt: prompt || undefined,
          model: model.modelId,
          duration,
          resolution,
          apiKey: model.apiKey!,
          apiUrl: model.apiUrl || undefined,
        });

        console.log('✅ [Vidu] 视频生成成功:', videoUrl);
        break;

      default:
        throw new AppError(`不支持的提供商: ${model.provider}`, 400);
    }

    res.json({
      success: true,
      data: {
        url: videoUrl,
      },
    });
  } catch (error: any) {
    console.error('视频生成失败:', error);
    throw new AppError(error.message || '视频生成失败', 500);
  }
});

export const createVoiceEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const { modelId, targetModel, prefix, url, promptUrl, promptText } = req.body;
  if (!targetModel && !modelId) {
    throw new AppError('必须提供 targetModel 或模型ID', 400);
  }
  let model: any | null = null;
  if (modelId) {
    model = await prisma.aIModel.findUnique({ where: { id: modelId } });
    if (!model) throw new AppError('模型不存在', 404);
    if (!model.isActive) throw new AppError('模型未启用', 400);
    if (model.type !== 'AUDIO_SYNTHESIS') throw new AppError('模型类型必须为语音合成', 400);
  }
  const tm = targetModel || model?.modelId || 'cosyvoice-v2';
  const apiKey = model?.apiKey || undefined;
  const apiUrl = model?.apiUrl || undefined;
  const providerLower = (model?.provider || '').toLowerCase();

  if (providerLower === 'minimaxi' || providerLower === 'hailuo' || providerLower === '海螺') {
    if (!url) throw new AppError('MiniMax 声音克隆需要上传音频文件URL', 400);

    const rawPrefix = String(prefix || 'voice').toLowerCase();
    let base = rawPrefix.replace(/[^a-z0-9-_]/g, '-');
    if (!/^[a-z]/.test(base)) base = `v-${base}`;
    base = base.replace(/[-_]{2,}/g, '-');
    base = base.replace(/[-_]$/g, '');

    // User provided voiceId is not passed in body? 
    // The previous code generated a random ID. 
    // The new requirement says "Voice ID: Text Input (User defined)".
    // So we should check if `voiceId` is passed in body, or use `prefix` as base.
    // But the function signature in `req.body` destructuring didn't include `voiceId`.
    // Let's check if I can add it.

    // Actually, looking at the previous code: `const { modelId, targetModel, prefix, url, promptUrl, promptText } = req.body;`
    // It seems `voiceId` was not expected.
    // But the new node will send `voiceId`.
    // I should extract `voiceId` from req.body if available.

    const { voiceId: userVoiceId, previewText: userPreviewText } = req.body;

    const customVoiceId = userVoiceId || `${base}-${Date.now()}`.slice(0, 64);

    // 立即返回，后台执行上传与克隆
    // Note: If the user wants to see the preview immediately, maybe we shouldn't return immediately?
    // But file upload might take time.
    // The new node logic says "Display returned preview audio".
    // If we return immediately, we can't return the preview URL.
    // So we should probably await the process if it's MiniMax, or at least await the clone part.
    // However, `createVoiceEnrollment` is designed to be async for CosyVoice usually?
    // Let's change it to await for MiniMax so we can return the sample audio.

    // But wait, `uploadFile` might take time.
    // If we await, the UI might block.
    // But the user expects a result.

    // Let's try to await it.

    try {
      // 1. Upload Clone Audio
      // purpose='voice_clone'
      const fileId = await minimaxiAudioService.uploadFile({ filePath: url, purpose: 'voice_clone', apiKey, apiUrl });

      // 2. Upload Prompt Audio (if any)
      let promptFileId: string | undefined;
      if (promptUrl) {
        try {
          promptFileId = await minimaxiAudioService.uploadFile({ filePath: promptUrl, purpose: 'prompt_audio', apiKey, apiUrl });
        } catch (e) {
          console.warn('Prompt audio upload failed, ignoring:', e);
        }
      }

      // 3. Clone
      const promptTextSafe = String(promptText || '').trim();
      // We use a default preview text if not provided, to get a sample audio
      const finalPreviewText = userPreviewText || promptTextSafe || "欢迎使用 MiniMax 语音克隆服务，这是一个合成示例。";

      const result = await minimaxiAudioService.voiceClone({
        clone_file_id: fileId,
        voice_id: customVoiceId,
        prompt_audio_file_id: promptFileId,
        apiKey,
        apiUrl,
        prompt_text: promptTextSafe || undefined,
        model: tm,
        text: finalPreviewText // Request a preview generation
      });

      // result.sampleFileId might be a URL now (demo_audio)
      let finalSampleUrl = result.sampleFileId;
      if (finalSampleUrl) {
        try {
          // User requested local download instead of OSS
          finalSampleUrl = await downloadToLocal(finalSampleUrl, 'audio');
        } catch (e) {
          console.warn('Failed to download sample audio locally, using original URL:', e);
        }
      }

      res.json({ success: true, data: { voiceId: customVoiceId, sampleUrl: finalSampleUrl } });

    } catch (e: any) {
      throw new AppError(e.message || 'MiniMax 克隆失败', 500);
    }

  } else {
    const { voiceId, requestId } = await cosyvoiceService.createVoice({ targetModel: tm, prefix, url, apiKey, apiUrl });
    res.json({ success: true, data: { voiceId, requestId } });
  }
});

export const queryVoiceStatus = asyncHandler(async (req: Request, res: Response) => {
  const { voiceId, modelId } = req.query as any;
  if (!voiceId) throw new AppError('voiceId 必填', 400);
  let model: any | null = null;
  if (modelId) model = await prisma.aIModel.findUnique({ where: { id: String(modelId) } });
  const { status, requestId } = await cosyvoiceService.queryVoice({ voiceId: String(voiceId), apiKey: model?.apiKey || undefined, apiUrl: model?.apiUrl || undefined });
  res.json({ success: true, data: { status, requestId } });
});

export const synthesizeAudio = asyncHandler(async (req: Request, res: Response) => {
  const { modelId, voiceId, text, format = 'mp3', sampleRate, volume, rate, pitch, emotion, stream, subtitle_enable, language_boost, pronunciation_dict, timber_weights, voice_modify, output_format, aigc_watermark } = req.body;
  if (!modelId || !voiceId || !text) throw new AppError('modelId, voiceId, text 必填', 400);
  const model = await prisma.aIModel.findUnique({ where: { id: modelId } });
  if (!model) throw new AppError('模型不存在', 404);
  if (!model.isActive) throw new AppError('模型未启用', 400);
  if (String(model.type) !== 'AUDIO_SYNTHESIS') throw new AppError('模型类型必须为语音合成', 400);
  const cfg: any = (model as any).config || {};
  const knownModels = ['cosyvoice-v1', 'cosyvoice-v2', 'cosyvoice-v3', 'cosyvoice-v3-plus'];
  const matchedModel = knownModels.find((m) => String(voiceId).startsWith(m));
  const modelForSynthesis = matchedModel || (model.modelId || 'cosyvoice-v2');
  let audioUrl: string | undefined;
  try {
    const providerLower = (model.provider || '').toLowerCase();
    if (providerLower === 'minimaxi' || providerLower === 'hailuo' || providerLower === '海螺') {
      const voiceSetting: any = { voice_id: voiceId };
      if (typeof rate === 'number') voiceSetting.speed = rate;
      if (typeof volume === 'number') voiceSetting.vol = volume;
      if (typeof pitch === 'number') voiceSetting.pitch = pitch;
      const normalizeEmotion = (e?: string) => {
        const key = String(e || '').toLowerCase();
        const map: Record<string, string> = {
          neutral: 'neutral',
          happy: 'happy',
          sad: 'sad',
          angry: 'angry',
          fear: 'fear',
          disgust: 'disgust',
          surprise: 'surprise',
          serious: 'serious',
          friendly: 'friendly',
        };
        return map[key] || key;
      };
      const voiceModifyCombined: any = { ...(voice_modify || {}) };
      if (typeof emotion === 'string' && emotion) {
        const em = normalizeEmotion(emotion);
        voiceModifyCombined.emotion = em;
        if (!voiceModifyCombined.style) voiceModifyCombined.style = em;
      }
      const audioSetting: any = { format };
      if (typeof sampleRate === 'number') audioSetting.sample_rate = sampleRate;
      if (typeof audioSetting.channel === 'undefined') audioSetting.channel = 2;
      {
        const maxAttempts = 8;
        let attempt = 0;
        let lastErr: any = null;
        while (attempt < maxAttempts) {
          attempt++;
          try {
            audioUrl = await minimaxiAudioService.synthesizeSync({ model: model.modelId, text, voice: voiceSetting, audio: audioSetting, apiKey: model.apiKey || undefined, apiUrl: model.apiUrl || undefined, stream, subtitle_enable, language_boost, pronunciation_dict, timber_weights, voice_modify: voiceModifyCombined, output_format, aigc_watermark });
            lastErr = null;
            break;
          } catch (e: any) {
            lastErr = e;
            const code = e?.response?.data?.base_resp?.status_code || e?.status;
            const msg = String(e?.response?.data?.base_resp?.status_msg || e?.message || '').toLowerCase();
            if (code === 2054 || /voice id not exist/i.test(msg)) {
              await new Promise((r) => setTimeout(r, 2500));
              continue;
            }
            throw e;
          }
        }
        if (lastErr) throw lastErr;
      }
    } else {
      audioUrl = await cosyvoiceService.synthesize({ model: modelForSynthesis, voice: voiceId, text, format, sampleRate, volume, rate, pitch, apiKey: model.apiKey || undefined, apiUrl: model.apiUrl || undefined });
    }
  } catch (e: any) {
    const raw = e?.message || '';
    const status = e?.response?.data?.base_resp?.status_code || e?.status;
    const msg = e?.response?.data?.base_resp?.status_msg || e?.response?.data?.message || e?.message;
    if (/timeout/i.test(String(e?.code || '')) || /ECONNABORTED/.test(String(e?.code || ''))) {
      throw new AppError('MiniMax: 网络超时，请稍后重试或检查网络/权限', 504);
    }
    if (typeof status === 'number' && status === 2054) {
      throw new AppError('MiniMax: Voice ID 不存在或未就绪，请确认已创建并可用', 400);
    }
    if (/403/.test(raw) && /Access denied/i.test(raw)) {
      throw new AppError(
        '访问被拒绝：请确认账号状态正常且该模型/功能已开通，或API Key权限有效。',
        403
      );
    }
    if (/url error/i.test(raw)) {
      throw new AppError('音频URL不可达或不符合要求（需公网直链，支持http/https），请检查训练音频链接', 400);
    }
    throw new AppError(msg || 'MiniMax 合成失败', typeof status === 'number' ? status : 500);
  }
  // 记录使用
  await prisma.usageRecord.create({
    data: {
      userId: req.user!.id,
      modelId: model.id,
      operation: 'AUDIO_SYNTHESIS',
      cost: model.pricePerUse || 0,
      metadata: { voiceId, format },
    },
  });
  // 更新该用户保存的该 Voice 的最后使用时间（用于一周保留判断）
  try {
    const list = await prisma.setting.findMany({ where: { key: { startsWith: `user:${req.user!.id}:voice:` }, type: 'VOICE_ID' } });
    for (const row of list) {
      try {
        const payload: any = JSON.parse(row.value || '{}');
        if (String(payload.voiceId) === String(voiceId)) {
          payload.lastUsed = Date.now();
          await prisma.setting.update({ where: { id: row.id }, data: { value: JSON.stringify(payload) } });
          break;
        }
      } catch { }
    }
  } catch { }
  try {
    if (audioUrl && /^https?:\/\//.test(audioUrl)) {
      const axios = require('axios');
      const res2 = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 60000, maxRedirects: 3, validateStatus: (s: number) => s >= 200 && s < 400 });
      const buf = Buffer.from(res2.data || Buffer.alloc(0));
      if (!buf.length || buf.length <= 0) {
        throw new AppError('MiniMax 合成返回空音频，请稍后重试或检查 Voice ID 是否就绪', 500);
      }
      const ct = String(res2.headers?.['content-type'] || '');
      const ext = ct.includes('wav') ? '.wav' : '.mp3';
      // 上传到 OSS
      audioUrl = await uploadBuffer(buf, ext);
    } else if (audioUrl && !/^https?:\/\//.test(audioUrl)) {
      const pathMod = require('path');
      const fs = require('fs');
      const fullPath = pathMod.join(process.cwd(), audioUrl.startsWith('/') ? audioUrl.slice(1) : audioUrl);
      if (fs.existsSync(fullPath)) {
        const stat = await fs.promises.stat(fullPath);
        if (!stat.size || stat.size <= 0) {
          throw new AppError('本地音频文件为空，合成失败', 500);
        }
      }
    }
  } catch (e: any) {
    if (e instanceof AppError) throw e;
  }
  res.json({ success: true, data: { url: audioUrl || '' } });
});

export const listUserVoices = asyncHandler(async (req: Request, res: Response) => {
  const list = await prisma.setting.findMany({
    where: { key: { startsWith: `user:${req.user!.id}:voice:` }, type: 'VOICE_ID' },
    orderBy: { createdAt: 'desc' },
  });
  const now = Date.now();
  const expireMs = 7 * 24 * 60 * 60 * 1000;
  const keep: typeof list = [];
  for (const s of list) {
    let lastUsed = 0;
    try {
      const payload = JSON.parse(s.value || '{}');
      if (payload && typeof payload.lastUsed === 'number') lastUsed = payload.lastUsed;
    } catch { }
    if (!lastUsed) {
      try { lastUsed = (s as any).updatedAt ? new Date((s as any).updatedAt).getTime() : 0; } catch { }
      if (!lastUsed) {
        try { lastUsed = s.createdAt ? new Date(s.createdAt as any).getTime() : 0; } catch { }
      }
    }
    if (lastUsed && now - lastUsed > expireMs) {
      try { await prisma.setting.delete({ where: { id: s.id } }); } catch { }
    } else {
      keep.push(s);
    }
  }
  const data = keep.map((s) => {
    try { return { id: s.id, ...(JSON.parse(s.value || '{}')) }; } catch { return { id: s.id, voiceId: s.value }; }
  });
  res.json({ success: true, data });
});

export const addUserVoice = asyncHandler(async (req: Request, res: Response) => {
  const { voiceId, prefix, targetModel, provider } = req.body;
  if (!voiceId) throw new AppError('voiceId 必填', 400);
  const id = `${Date.now()}`;
  const key = `user:${req.user!.id}:voice:${id}`;
  const value = JSON.stringify({ voiceId, prefix, targetModel, provider, lastUsed: Date.now() });
  const row = await prisma.setting.create({ data: { key, value, type: 'VOICE_ID' } });
  res.json({ success: true, data: { id: row.id, voiceId, prefix, targetModel, provider } });
});

export const updateUserVoice = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { prefix } = req.body;
  const row = await prisma.setting.findUnique({ where: { id } });
  if (!row) throw new AppError('记录不存在', 404);
  if (!row.key.startsWith(`user:${req.user!.id}:voice:`) || row.type !== 'VOICE_ID') throw new AppError('无权限', 403);
  let payload: any = {};
  try { payload = JSON.parse(row.value || '{}'); } catch { }
  payload.prefix = prefix || payload.prefix;
  const updated = await prisma.setting.update({ where: { id }, data: { value: JSON.stringify(payload) } });
  res.json({ success: true, data: { id: updated.id, ...payload } });
});

export const deleteUserVoice = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const row = await prisma.setting.findUnique({ where: { id } });
  if (!row) throw new AppError('记录不存在', 404);
  if (!row.key.startsWith(`user:${req.user!.id}:voice:`) || row.type !== 'VOICE_ID') throw new AppError('无权限', 403);
  try {
    const payload: any = JSON.parse(row.value || '{}');
    const voiceId = payload.voiceId;
    const provider = String(payload.provider || '').toLowerCase();
    if (voiceId && ['minimaxi', 'hailuo', '海螺'].includes(provider)) {
      await minimaxiAudioService.deleteVoice({ voiceId });
    }
  } catch { }
  await prisma.setting.delete({ where: { id } });
  res.json({ success: true });
});

export const listVoicePresets = asyncHandler(async (req: Request, res: Response) => {
  const { modelId } = req.query as any;
  let apiKey: string | undefined;
  let apiUrl: string | undefined;
  if (modelId) {
    const model = await prisma.aIModel.findUnique({ where: { id: String(modelId) } });
    if (model && ['minimaxi', 'hailuo', '海螺'].includes((model.provider || '').toLowerCase())) {
      apiKey = model.apiKey || undefined;
      apiUrl = model.apiUrl || undefined;
    }
  }
  try {
    const list = await minimaxiAudioService.listVoices({ apiKey, apiUrl });
    res.json({ success: true, data: list });
  } catch (e: any) {
    res.json({ success: true, data: [] });
  }
});

export const diagnoseMinimaxVoice = asyncHandler(async (req: Request, res: Response) => {
  const { modelId, voiceId } = req.query as any;
  if (!modelId || !voiceId) throw new AppError('modelId 与 voiceId 必填', 400);
  const model = await prisma.aIModel.findUnique({ where: { id: String(modelId) } });
  if (!model) throw new AppError('模型不存在', 404);
  const providerLower = (model.provider || '').toLowerCase();
  if (!['minimaxi', 'hailuo', '海螺'].includes(providerLower)) throw new AppError('该模型不是 MiniMax 提供商', 400);
  let exists: boolean = false;
  let count: number = 0;
  let groupId: string = process.env.MINIMAX_GROUP_ID || process.env.MINIMAXI_GROUP_ID || '';
  let recentFiles: any[] = [];
  try {
    const list = await minimaxiAudioService.listVoices({ apiKey: model.apiKey || undefined, apiUrl: model.apiUrl || undefined });
    count = Array.isArray(list) ? list.length : 0;
    exists = Array.isArray(list) && list.some((v: any) => String(v.voiceId) === String(voiceId));
  } catch { }
  try {
    recentFiles = await (minimaxiAudioService as any).listFiles({ apiKey: model.apiKey || undefined, apiUrl: model.apiUrl || undefined, limit: 10 });
  } catch { }
  res.json({ success: true, data: { exists, count, groupId, recentFiles } });
});

export const designVoice = asyncHandler(async (req: Request, res: Response) => {
  const { modelId, prompt, preview_text, voice_id, aigc_watermark } = req.body as any;
  if (!modelId || !prompt) throw new AppError('modelId 与 prompt 必填', 400);
  const model = await prisma.aIModel.findUnique({ where: { id: String(modelId) } });
  if (!model) throw new AppError('模型不存在', 404);
  if (!model.isActive) throw new AppError('模型未启用', 400);
  if ((model.provider || '').toLowerCase() !== 'minimaxi' && (model.provider || '').toLowerCase() !== 'hailuo' && (model.provider || '').toLowerCase() !== '海螺') {
    throw new AppError('当前模型不支持音色设计（需 MiniMax 提供商）', 400);
  }
  try {
    const { voiceId, requestId, hex } = await minimaxiAudioService.voiceDesign({ prompt, preview_text, voice_id, aigc_watermark, apiKey: model.apiKey || undefined, apiUrl: model.apiUrl || undefined });
    // 保存到用户音色列表（便于后续使用），保留最近10个
    try {
      const key = `user:${req.user!.id}:voice:${Date.now()}`;
      const value = JSON.stringify({ voiceId, prefix: voice_id || voiceId, targetModel: model.id, provider: model.provider, lastUsed: Date.now() });
      await prisma.setting.create({ data: { key, value, type: 'VOICE_ID' } });
    } catch { }
    const payload: any = { voice_id: voiceId, request_id: requestId };
    if (hex && typeof hex === 'string' && hex.length > 0) payload.trial_audio = hex;
    res.json({ success: true, data: payload });
  } catch (e: any) {
    const msg = e?.response?.data?.base_resp?.status_msg || e?.response?.data?.message || e?.message || '音色设计失败';
    throw new AppError(msg, e?.status || 500);
  }
});

/**
 * 智能超清 (视频放大)
 */
export const upscaleVideo = asyncHandler(async (req: Request, res: Response) => {
  const { video_url, video_creation_id, upscale_resolution = '1080p', apiKey, apiUrl } = req.body;
  const userId = (req as any).user?.id;

  if (!userId) {
    throw new AppError('未授权', 401);
  }

  if (!video_url && !video_creation_id) {
    throw new AppError('必须提供 video_url 或 video_creation_id', 400);
  }

  try {
    // 创建数据库任务记录
    const task = await prisma.generationTask.create({
      data: {
        userId,
        type: 'VIDEO',
        modelId: 'vidu-upscale', // 虚拟模型ID
        prompt: `智能超清: ${upscale_resolution}`,
        status: 'PENDING',
        progress: 0,
        metadata: {
          video_url,
          video_creation_id,
          upscale_resolution,
        },
      },
    });

    // 异步处理（不等待）
    processUpscaleTask(task.id, {
      video_url,
      video_creation_id,
      upscale_resolution,
    }).catch(error => {
      console.error(`[UpscaleVideo] 任务处理失败: ${task.id}`, error);
    });

    res.json({
      success: true,
      taskId: task.id,
    });
  } catch (error: any) {
    throw new AppError(error.message || '创建超清任务失败', error.status || 500);
  }
});

/**
 * 广告成片
 */
export const createCommercial = asyncHandler(async (req: Request, res: Response) => {
  const { images, prompt, duration, ratio, language, apiKey, apiUrl } = req.body;
  const userId = (req as any).user?.id;

  console.log('[Commercial] 📥 收到原始请求体:', JSON.stringify(req.body, null, 2));
  console.log('[Commercial] 📥 解构后的参数:', { 
    imageCount: images?.length, 
    duration, 
    ratio, 
    language 
  });

  if (!userId) {
    throw new AppError('未授权', 401);
  }

  // 权限检查
  const permissionResult = await userLevelService.checkPermission({
    userId,
    moduleType: 'commercial-video',
  });

  if (!permissionResult.allowed) {
    throw new AppError(permissionResult.reason || '您没有权限使用广告成片功能', 403);
  }

  if (!images || !Array.isArray(images) || images.length === 0) {
    throw new AppError('必须提供至少一张图片', 400);
  }

  if (images.length > 15) {
    throw new AppError('最多支持15张图片', 400);
  }

  let creditsCharged = 0;
  let usageRecordId: string | undefined;
  
  if (!permissionResult.isFree) {
    const { billingService } = await import('../services/billing.service');
    const billingParams = {
      userId,
      nodeType: 'ad_composition',
      operation: '广告成片',
      duration: duration || 30,
    };
    console.log('[Commercial] 扣费参数:', billingParams);
    try {
      const usageRecord = await billingService.chargeUser(billingParams);
      if (usageRecord) {
        creditsCharged = usageRecord.creditsCharged || 0;
        usageRecordId = usageRecord.id;
        console.log(`[Commercial] 已扣除积分: ${creditsCharged}`);
      }
    } catch (error: any) {
      console.error('[Commercial] 扣费失败:', error.message);
      throw new AppError(error.message?.includes('Insufficient') ? '积分不足，请充值后再试' : (error.message || '扣费失败'), error.message?.includes('Insufficient') ? 402 : 400);
    }
  }

  try {
    // 创建数据库任务记录
    const task = await prisma.generationTask.create({
      data: {
        userId,
        type: 'VIDEO',
        modelId: 'vidu-commercial', // 虚拟模型ID
        prompt: prompt || '广告成片',
        status: 'PENDING',
        progress: 0,
        metadata: {
          images,
          prompt,
          duration: duration || 30,
          ratio: ratio || '16:9',
          language: language || 'zh',
        },
      },
    });

    // 异步处理（不等待）
    console.log('[Commercial] 📤 准备调用 processCommercialTask, ratio:', ratio);
    processCommercialTask(task.id, {
      images,
      prompt,
      duration,
      ratio,
      language,
    }).catch(error => {
      console.error(`[Commercial] 任务处理失败: ${task.id}`, error);
    });

    res.json({
      success: true,
      taskId: task.id,
      creditsCharged,
      isFreeUsage: permissionResult.isFree || false,
    });
  } catch (error: any) {
    throw new AppError(error.message || '创建广告成片任务失败', error.status || 500);
  }
});

/**
 * 异步处理广告成片任务
 */
async function processCommercialTask(
  taskId: string,
  options: {
    images: string[];
    prompt: string;
    duration?: number;
    ratio?: '16:9' | '9:16' | '1:1';
    language?: 'zh' | 'en';
  }
) {
  console.log(`[Commercial] 🚀 开始处理广告成片任务: ${taskId}`);
  try {
    // 更新为处理中
    await prisma.generationTask.update({
      where: { id: taskId },
      data: { status: 'PROCESSING', progress: 10 },
    });
    console.log(`[Commercial] ✅ 任务状态已更新为 PROCESSING: ${taskId}`);

    // 调用 Vidu 广告成片 API（会自动轮询直到完成）
    console.log(`[Commercial] 📡 开始调用 Vidu API...`);
    const result = await viduService.createCommercialVideo(options);
    const videoUrl = result.status;
    console.log(`[Commercial] ✅ Vidu API 返回成功, videoUrl: ${videoUrl?.substring(0, 100)}...`);

    // 更新为成功
    await prisma.generationTask.update({
      where: { id: taskId },
      data: {
        status: 'SUCCESS',
        progress: 100,
        resultUrl: videoUrl,
        completedAt: new Date(),
      },
    });
    console.log(`[Commercial] ✅ 任务完成: ${taskId}`);
  } catch (error: any) {
    console.error(`[Commercial] ❌ 任务失败: ${taskId}`, error.message);
    // 更新为失败
    await prisma.generationTask.update({
      where: { id: taskId },
      data: {
        status: 'FAILURE',
        errorMessage: error.message || '广告成片失败',
        completedAt: new Date(),
      },
    });
  }
}

/**
 * 异步处理超清任务
 */
async function processUpscaleTask(
  taskId: string,
  options: {
    video_url?: string;
    video_creation_id?: string;
    upscale_resolution: '1080p' | '2K' | '4K' | '8K';
  }
) {
  try {
    // 更新为处理中
    await prisma.generationTask.update({
      where: { id: taskId },
      data: { status: 'PROCESSING', progress: 10 },
    });

    // 调用 Vidu 超清 API
    const result = await viduService.upscaleVideo(options);
    const videoUrl = result.status;

    // 更新为成功
    await prisma.generationTask.update({
      where: { id: taskId },
      data: {
        status: 'SUCCESS',
        progress: 100,
        resultUrl: videoUrl,
        completedAt: new Date(),
      },
    });
  } catch (error: any) {
    // 更新为失败
    await prisma.generationTask.update({
      where: { id: taskId },
      data: {
        status: 'FAILURE',
        errorMessage: error.message || '智能超清失败',
        completedAt: new Date(),
      },
    });
  }
}
