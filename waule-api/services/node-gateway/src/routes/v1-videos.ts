/**
 * 视频生成路由
 * POST /v1/videos/generations
 */

import { Router, Request, Response } from 'express';
import * as doubao from '../providers/doubao';
import * as vidu from '../providers/vidu';
import * as wanx from '../providers/wanx';
import * as minimax from '../providers/minimax';

const router = Router();

function log(msg: string, data?: any) {
  console.log(`[${new Date().toISOString()}] [Videos] ${msg}`, data || '');
}

router.post('/generations', async (req: Request, res: Response) => {
  try {
    const { 
      model, 
      prompt, 
      duration: durationRaw = 5, 
      aspect_ratio = '16:9',
      resolution = '720p',
      reference_images,
      image, // 兼容单图参数
      use_intl, // 使用国际区域
      // 视频换人参数
      replace_image_url,
      replace_video_url,
      mode,
      // Vidu 特有参数
      subjects,
      audio,
      voice_id,
      bgm,
      movement_amplitude,
      generation_type,
    } = req.body;
    
    // 确保 duration 是数字
    const duration = typeof durationRaw === 'string' ? parseInt(durationRaw, 10) : durationRaw;
    
    // 合并 image 和 reference_images
    let refImages = reference_images || [];
    if (image && !refImages.includes(image)) {
      refImages = [image, ...refImages];
    }
    
    if (!model) {
      return res.status(400).json({
        error: { message: 'model is required', type: 'invalid_request' }
      });
    }
    
    // 首尾帧视频生成时 prompt 可以为空
    const finalPrompt = prompt || '';
    
    log(`视频生成请求: model=${model}, duration=${duration}s, resolution=${resolution}, refImages=${refImages.length}`);
    
    let result: { url: string; duration: number };
    const modelLower = model.toLowerCase();
    
    // 根据模型选择provider (sora使用独立的/v1/sora/*路由)
    if (modelLower.includes('doubao') || modelLower.includes('seedance')) {
      result = await doubao.generateVideo({ 
        model, prompt: finalPrompt, duration, aspectRatio: aspect_ratio, resolution, referenceImages: refImages 
      });
    } else if (modelLower.includes('vidu')) {
      result = await vidu.generateVideo({ 
        model, 
        prompt: finalPrompt, 
        duration, 
        aspectRatio: aspect_ratio, 
        resolution,
        referenceImages: refImages,
        subjects,
        audio,
        voice_id,
        bgm,
        movement_amplitude,
        generationType: generation_type,
      });
    } else if (modelLower.includes('minimax') || modelLower.includes('hailuo')) {
      result = await minimax.generateVideo({ 
        model, prompt: finalPrompt, duration, aspectRatio: aspect_ratio, resolution, referenceImages: refImages 
      });
    } else if (modelLower.includes('video-style')) {
      // 视频风格转绘
      const stylizeResult = await wanx.generateVideoStylize({
        videoUrl: replace_video_url || (refImages.length > 0 ? refImages[0] : ''),
        style: req.body.style,
        videoFps: req.body.video_fps,
        minLen: req.body.min_len,
        useIntl: use_intl,
      });
      result = { url: stylizeResult.url, duration: 0 };
    } else if (modelLower.includes('videoretalk')) {
      // 视频换人
      const retalkResult = await wanx.generateVideoRetalk({
        videoUrl: replace_video_url || '',
        audioUrl: req.body.audio_url || '',
        refImageUrl: refImages.length > 0 ? refImages[0] : undefined,
        videoExtension: req.body.video_extension,
        useIntl: use_intl,
      });
      result = { url: retalkResult.url, duration: 0 };
    } else if (modelLower.includes('wanx') || modelLower.includes('tongyi') || modelLower.includes('wan2')) {
      result = await wanx.generateVideo({ 
        model, 
        prompt: finalPrompt, 
        duration, 
        resolution, 
        aspectRatio: aspect_ratio, 
        referenceImages: refImages,
        useIntl: use_intl,
        replaceImageUrl: replace_image_url,
        replaceVideoUrl: replace_video_url,
        mode,
      });
    } else {
      return res.status(400).json({
        error: { message: `Unknown video model: ${model}`, type: 'invalid_model' }
      });
    }
    
    log(`视频生成成功: ${result.url}`);
    
    res.json({
      created: Math.floor(Date.now() / 1000),
      data: [{ url: result.url, duration: result.duration }],
    });
    
  } catch (error: any) {
    log(`视频生成失败: ${error.message}`);
    res.status(500).json({
      error: { message: error.message, type: 'generation_error' }
    });
  }
});

// 智能超清
router.post('/upscale', async (req: Request, res: Response) => {
  try {
    const { video_url, video_creation_id, upscale_resolution = '1080p' } = req.body;
    
    log(`智能超清请求: resolution=${upscale_resolution}`);
    
    const result = await vidu.upscaleVideo({
      videoUrl: video_url,
      videoCreationId: video_creation_id,
      upscaleResolution: upscale_resolution,
    });
    
    log(`智能超清成功: ${result.url}`);
    
    res.json({
      created: Math.floor(Date.now() / 1000),
      data: [{ url: result.url }],
    });
    
  } catch (error: any) {
    log(`智能超清失败: ${error.message}`);
    res.status(500).json({
      error: { message: error.message, type: 'upscale_error' }
    });
  }
});

// 广告成片
router.post('/commercial', async (req: Request, res: Response) => {
  try {
    const { images, prompt, duration = 30, ratio = '16:9', language = 'zh' } = req.body;
    
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        error: { message: '必须提供至少一张图片', type: 'invalid_request' }
      });
    }
    
    log(`广告成片请求: images=${images.length}, duration=${duration}s`);
    
    const result = await vidu.createCommercialVideo({
      images,
      prompt,
      duration,
      ratio,
      language,
    });
    
    log(`广告成片成功: ${result.url}`);
    
    res.json({
      created: Math.floor(Date.now() / 1000),
      data: [{ url: result.url }],
    });
    
  } catch (error: any) {
    log(`广告成片失败: ${error.message}`);
    res.status(500).json({
      error: { message: error.message, type: 'commercial_error' }
    });
  }
});

export default router;
