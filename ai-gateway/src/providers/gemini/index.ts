/**
 * Gemini Provider
 * Google AI 图片/文本生成
 *
 * 支持模型:
 * - gemini-3-pro-preview: 深度推理对话
 * - gemini-3-flash-preview: 快速对话
 * - gemini-3-pro-image-preview: 图片生成 (支持 4K)
 */

import { generateImage } from './image';
import { chatCompletion } from './chat';

export const gemini = {
  generateImage,
  chatCompletion,
};

export { generateImage, chatCompletion };
