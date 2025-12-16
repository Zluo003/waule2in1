/**
 * 语音合成路由
 * POST /v1/audio/speech
 */

import { Router, Request, Response } from 'express';
import * as cosyvoice from '../providers/cosyvoice';
import * as minimax from '../providers/minimax';

const router = Router();

function log(msg: string, data?: any) {
  console.log(`[${new Date().toISOString()}] [Audio] ${msg}`, data || '');
}

router.post('/speech', async (req: Request, res: Response) => {
  try {
    const { model, input, voice, speed = 1.0 } = req.body;
    
    if (!model || !input) {
      return res.status(400).json({
        error: { message: 'model and input are required', type: 'invalid_request' }
      });
    }
    
    log(`语音合成请求: model=${model}, chars=${input.length}`);
    
    let result: { url: string };
    const modelLower = model.toLowerCase();
    
    // 根据模型选择provider
    if (modelLower.includes('cosyvoice') || modelLower.includes('alibaba') || modelLower.includes('dashscope')) {
      result = await cosyvoice.synthesizeSpeech({ model, text: input, voiceId: voice, speed });
    } else if (modelLower.includes('minimax') || modelLower.includes('hailuo')) {
      result = await minimax.synthesizeSpeech({ model, text: input, voiceId: voice, speed });
    } else {
      return res.status(400).json({
        error: { message: `Unknown audio model: ${model}`, type: 'invalid_model' }
      });
    }
    
    log(`语音合成成功: ${result.url}`);
    
    res.json({
      created: Math.floor(Date.now() / 1000),
      url: result.url,
    });
    
  } catch (error: any) {
    log(`语音合成失败: ${error.message}`);
    res.status(500).json({
      error: { message: error.message, type: 'generation_error' }
    });
  }
});

export default router;
