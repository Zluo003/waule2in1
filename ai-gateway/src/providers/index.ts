import { doubao } from './doubao';
import { vidu } from './vidu';
import { wanx } from './wanx';
import { minimax } from './minimax';
import { qwen } from './qwen';
import { gemini } from './gemini';
import { veo } from './veo';

export const providers = {
  doubao,
  vidu,
  wanx,
  minimax,
  qwen,
  gemini,
  veo,
};

// 根据模型名称推断提供商（与 waule-api 保持一致）
export function inferProvider(model: string): string | null {
  const modelLower = model.toLowerCase();

  // Doubao (豆包)
  if (modelLower.includes('doubao') || modelLower.includes('seedream') || modelLower.includes('seedance')) {
    return 'doubao';
  }

  // Vidu (生数科技)
  if (modelLower.includes('vidu')) {
    return 'vidu';
  }

  // MiniMax (海螺) - 注意：image-01 和 video-01 是 minimax 的模型，speech 系列也是
  if (modelLower.includes('minimax') || modelLower.includes('hailuo') ||
      modelLower === 'image-01' || modelLower === 'video-01' ||
      modelLower.startsWith('speech-')) {
    return 'minimax';
  }

  // Qwen (通义千问图像编辑) - 必须在 wanx 之前判断
  if (modelLower.includes('qwen-vl') || modelLower.includes('qwen2-vl') || modelLower.includes('qwen-image')) {
    return 'qwen';
  }

  // Wanx (通义万相/阿里云) - 包括 videoretalk, video-style, cosyvoice 等
  if (modelLower.includes('wanx') || modelLower.includes('tongyi') || modelLower.includes('alibaba') ||
      modelLower.includes('dashscope') || modelLower.includes('wan2') ||
      modelLower.includes('videoretalk') || modelLower.includes('video-style') ||
      modelLower.includes('cosyvoice')) {
    return 'wanx';
  }

  // Gemini (Google AI)
  if (modelLower.includes('gemini')) {
    return 'gemini';
  }

  // Veo (Google Veo 视频生成)
  if (modelLower.includes('veo')) {
    return 'veo';
  }

  return null;
}

export { doubao, vidu, wanx, minimax, qwen, gemini, veo };
