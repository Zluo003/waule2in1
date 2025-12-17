/**
 * 图片生成路由
 * POST /v1/images/generations
 * 
 * 支持的 Gemini 3.0 Pro Image 模型:
 * - gemini-3-pro-image-preview-2k: 2K分辨率
 * - gemini-3-pro-image-preview-4k: 4K分辨率
 * 
 * 通道控制:
 * - native: 使用原生 Google API
 * - proxy: 使用中转 API (future-api)
 */

import { Router, Request, Response } from 'express';
import * as gemini from '../providers/gemini';
import * as futureApi from '../providers/future-api';
import * as doubao from '../providers/doubao';
import * as wanx from '../providers/wanx';
import * as qwen from '../providers/qwen';
import * as minimax from '../providers/minimax';
import { getProxyApiConfig } from '../db';

const router = Router();

function log(msg: string, data?: any) {
  console.log(`[${new Date().toISOString()}] [Images] ${msg}`, data || '');
}

// 判断是否是 Gemini 3.0 Pro Image 模型
function isGemini3ProImageModel(model: string): boolean {
  const modelLower = model.toLowerCase();
  return modelLower.includes('gemini-3-pro-image') || 
         modelLower.includes('gemini-3.0-pro-image') ||
         modelLower === 'gemini-3-pro-image-preview-2k' ||
         modelLower === 'gemini-3-pro-image-preview-4k';
}

// 判断使用哪个通道
function shouldUseProxyChannel(model: string): boolean {
  const config = getProxyApiConfig();
  if (!config) return false;
  
  // 如果模型是 Gemini 3.0 Pro Image，检查配置的通道
  if (isGemini3ProImageModel(model)) {
    return config.channel === 'proxy' && config.is_active === 1 && !!config.api_key;
  }
  
  return false;
}

router.post('/generations', async (req: Request, res: Response) => {
  try {
    const { model, prompt, size, image_size, n = 1, reference_images, use_intl, max_images } = req.body;
    
    if (!model || !prompt) {
      return res.status(400).json({
        error: { message: 'model and prompt are required', type: 'invalid_request' }
      });
    }
    
    log(`图片生成请求: model=${model}, size=${size}, imageSize=${image_size || '默认'}, refImages=${reference_images?.length || 0}, maxImages=${max_images || 1}`);
    
    let result: { url: string; urls?: string[]; revisedPrompt?: string };
    const modelLower = model.toLowerCase();
    
    // 检查是否使用中转API通道
    if (isGemini3ProImageModel(model)) {
      const useProxy = shouldUseProxyChannel(model);
      log(`Gemini 3.0 Pro Image 模型, 使用${useProxy ? '中转API' : '原生API'}通道`);
      
      if (useProxy) {
        // 使用中转API
        result = await futureApi.generateImage({ model, prompt, size, imageSize: image_size, referenceImages: reference_images });
      } else {
        // 使用原生Gemini API，传递分辨率参数
        result = await gemini.generateImage({ model, prompt, size, imageSize: image_size, referenceImages: reference_images });
      }
    } else if (modelLower.includes('gemini')) {
      // 其他 Gemini 模型使用原生API
      result = await gemini.generateImage({ model, prompt, size, imageSize: image_size, referenceImages: reference_images });
    } else if (modelLower.includes('doubao') || modelLower.includes('seedream')) {
      result = await doubao.generateImage({ model, prompt, size, referenceImages: reference_images, maxImages: max_images });
    } else if (modelLower.includes('qwen-vl') || modelLower.includes('qwen2-vl') || modelLower.includes('qwen-image')) {
      // 阿里云百炼图像编辑
      result = await qwen.generateImage({ model, prompt, size, referenceImages: reference_images, useIntl: use_intl });
    } else if (modelLower.includes('wanx') || modelLower.includes('tongyi') || modelLower.includes('alibaba')) {
      result = await wanx.generateImage({ model, prompt, size, referenceImages: reference_images, useIntl: use_intl });
    } else if (modelLower.includes('minimax') || modelLower.includes('hailuo') || modelLower.includes('image-01')) {
      result = await minimax.generateImage({ model, prompt, aspectRatio: size, referenceImages: reference_images });
    } else {
      return res.status(400).json({
        error: { message: `Unknown image model: ${model}`, type: 'invalid_model' }
      });
    }
    
    log(`图片生成成功: ${result.url}${result.urls ? `, 共${result.urls.length}张` : ''}`);
    
    // 返回OpenAI兼容格式
    // 如果有多张图片，返回所有URL
    const imageData = result.urls 
      ? result.urls.map((url, index) => ({ url, revised_prompt: index === 0 ? result.revisedPrompt : undefined }))
      : [{ url: result.url, revised_prompt: result.revisedPrompt }];
    
    res.json({
      created: Math.floor(Date.now() / 1000),
      data: imageData,
    });
    
  } catch (error: any) {
    log(`图片生成失败: ${error.message}`);
    res.status(500).json({
      error: { message: error.message, type: 'generation_error' }
    });
  }
});

export default router;
