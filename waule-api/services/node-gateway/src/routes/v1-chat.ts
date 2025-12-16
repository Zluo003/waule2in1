/**
 * 对话/文本生成路由
 * POST /v1/chat/completions
 */

import { Router, Request, Response } from 'express';
import * as gemini from '../providers/gemini';

const router = Router();

function log(msg: string, data?: any) {
  console.log(`[${new Date().toISOString()}] [Chat] ${msg}`, data || '');
}

router.post('/completions', async (req: Request, res: Response) => {
  try {
    const { model, messages, temperature, max_tokens } = req.body;
    
    if (!model || !messages) {
      return res.status(400).json({
        error: { message: 'model and messages are required', type: 'invalid_request' }
      });
    }
    
    log(`对话请求: model=${model}`);
    
    const modelLower = model.toLowerCase();
    
    // 根据模型选择provider
    if (modelLower.includes('gemini')) {
      const result = await gemini.chatCompletion({ 
        model, 
        messages, 
        temperature, 
        maxTokens: max_tokens 
      });
      
      log(`对话完成`);
      
      res.json({
        ...result,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
      });
    } else {
      return res.status(400).json({
        error: { message: `Unknown chat model: ${model}. Use /v1/sora/* for Sora models.`, type: 'invalid_model' }
      });
    }
    
  } catch (error: any) {
    log(`对话失败: ${error.message}`);
    res.status(500).json({
      error: { message: error.message, type: 'generation_error' }
    });
  }
});

export default router;
