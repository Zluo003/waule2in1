import { generateImage } from './image';
import { generateVideo, retalkVideo, stylizeVideo } from './video';
import { synthesizeSpeech } from './speech';

export const wanx = {
  generateImage,
  generateVideo,
  retalkVideo,
  stylizeVideo,
  synthesizeSpeech,
};

export * from './image';
export * from './video';
export * from './speech';
