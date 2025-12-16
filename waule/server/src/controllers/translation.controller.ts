import { Request, Response } from 'express';
import { translationService } from '../services/translation.service';

/**
 * 翻译文本
 */
export const translateText = async (req: Request, res: Response) => {
  try {
    const { text, from = 'auto', to = 'en' } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: '请提供要翻译的文本',
      });
    }

    console.log('📝 [翻译控制器] 翻译请求:', {
      textLength: text.length,
      from,
      to,
    });

    const result = await translationService.translate(text, from, to);

    res.json({
      success: true,
      translatedText: result.translatedText,
      detectedLanguage: result.detectedLanguage,
    });
  } catch (error: any) {
    console.error('❌ [翻译控制器] 翻译失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '翻译失败',
    });
  }
};

/**
 * 智能翻译（自动检测语言，如果不是英文则翻译）
 */
export const smartTranslate = async (req: Request, res: Response) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: '请提供要翻译的文本',
      });
    }

    console.log('🧠 [翻译控制器] 智能翻译请求:', {
      textLength: text.length,
      preview: text.substring(0, 50),
    });

    const result = await translationService.smartTranslate(text);

    res.json({
      success: true,
      translatedText: result.translatedText,
      detectedLanguage: result.detectedLanguage,
      needsTranslation: result.needsTranslation,
    });
  } catch (error: any) {
    console.error('❌ [翻译控制器] 智能翻译失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '翻译失败',
    });
  }
};

/**
 * 检测语言
 */
export const detectLanguage = async (req: Request, res: Response) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: '请提供要检测的文本',
      });
    }

    const language = await translationService.detectLanguage(text);

    res.json({
      success: true,
      language,
    });
  } catch (error: any) {
    console.error('❌ [翻译控制器] 语言检测失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '语言检测失败',
    });
  }
};

