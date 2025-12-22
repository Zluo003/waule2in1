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
import * as gemini3Proxy from '../providers/gemini3-proxy';
import * as doubao from '../providers/doubao';
import * as wanx from '../providers/wanx';
import * as qwen from '../providers/qwen';
import * as minimax from '../providers/minimax';
import { getProxyApiConfig, getGemini3ProxyConfig } from '../db';

const router = Router();

function log(msg: string, data?: any) {
  console.log(`[${new Date().toISOString()}] [Images] ${msg}`, data || '');
}

// 移除提示词末尾的比例后缀（原生API和My API Key CC不需要这个后缀）
function stripAspectRatioSuffix(prompt: string): string {
  // 匹配类似 "，生成16:9的比例" 或 "，生成1:1比例的图片" 等模式
  return prompt.replace(/[,，]\s*生成\d+:\d+(的)?比例(的图片)?$/g, '').trim();
}

// 判断是否是 Gemini 3.0 Pro Image 模型
function isGemini3ProImageModel(model: string): boolean {
  const modelLower = model.toLowerCase();
  return modelLower.includes('gemini-3-pro-image') || 
         modelLower.includes('gemini-3.0-pro-image') ||
         modelLower === 'gemini-3-pro-image-preview-2k' ||
         modelLower === 'gemini-3-pro-image-preview-4k';
}

// 判断使用哪个通道 (旧版 Future API)
function shouldUseProxyChannel(model: string): boolean {
  const config = getProxyApiConfig();
  if (!config) return false;
  
  // 如果模型是 Gemini 3.0 Pro Image，检查配置的通道
  if (isGemini3ProImageModel(model)) {
    return config.channel === 'proxy' && config.is_active === 1 && !!config.api_key;
  }
  
  return false;
}

// 判断是否使用 Gemini 3 Pro 专用中转通道 (my.api-key.cc 等)
function shouldUseGemini3ProxyChannel(model: string): boolean {
  const config = getGemini3ProxyConfig();
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
      // 优先检查 Gemini 3 Pro 专用中转通道 (my.api-key.cc)
      const useGemini3Proxy = shouldUseGemini3ProxyChannel(model);
      // 回退到旧的 Future API 中转
      const useFutureProxy = !useGemini3Proxy && shouldUseProxyChannel(model);
      
      if (useGemini3Proxy) {
        // My API Key CC 通道：移除比例后缀（API通过aspectRatio参数控制比例）
        const cleanPrompt = stripAspectRatioSuffix(prompt);
        log(`Gemini 3.0 Pro Image 模型, 使用 Gemini 3 专用中转API (${gemini3Proxy.getProviderName()}), 清理后提示词长度: ${cleanPrompt.length}`);
        result = await gemini3Proxy.generateImage({ 
          prompt: cleanPrompt, 
          imageSize: image_size, 
          aspectRatio: size, 
          referenceImages: reference_images 
        });
      } else if (useFutureProxy) {
        log(`Gemini 3.0 Pro Image 模型, 使用 Future API 中转通道`);
        result = await futureApi.generateImage({ model, prompt, size, imageSize: image_size, referenceImages: reference_images });
      } else {
        // 原生 Google API 通道：移除比例后缀（API通过aspectRatio参数控制比例）
        const cleanPrompt = stripAspectRatioSuffix(prompt);
        log(`Gemini 3.0 Pro Image 模型, 使用原生 Google API 通道, 清理后提示词长度: ${cleanPrompt.length}`);
        result = await gemini.generateImage({ model, prompt: cleanPrompt, size, imageSize: image_size, referenceImages: reference_images });
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
