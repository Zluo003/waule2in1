import express from 'express';
import { translateText, smartTranslate, detectLanguage } from '../controllers/translation.controller';

const router = express.Router();

/**
 * POST /api/translation/translate
 * 翻译文本
 */
router.post('/translate', translateText);

/**
 * POST /api/translation/smart-translate
 * 智能翻译（自动检测语言，如果不是英文则翻译）
 */
router.post('/smart-translate', smartTranslate);

/**
 * POST /api/translation/detect
 * 检测语言
 */
router.post('/detect', detectLanguage);

export default router;

