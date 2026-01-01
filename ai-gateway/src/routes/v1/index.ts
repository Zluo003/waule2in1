import { Router } from 'express';
import imagesRouter from './images';
import videosRouter from './videos';
import audioRouter from './audio';
import chatRouter from './chat';
import soraRouter from './sora';

const router = Router();

router.use('/images', imagesRouter);
router.use('/videos', videosRouter);
router.use('/audio', audioRouter);
router.use('/chat', chatRouter);
router.use('/sora', soraRouter);

// 模型列表
router.get('/models', (_req, res) => {
  res.json({
    data: [
      // Doubao
      { id: 'doubao-seedream-4-5-251128', provider: 'doubao', type: 'image' },
      { id: 'doubao-seedance-1-0-lite-250428', provider: 'doubao', type: 'video' },
      // Vidu
      { id: 'vidu-2.0', provider: 'vidu', type: 'video' },
      { id: 'vidu-2.0-master', provider: 'vidu', type: 'video' },
      // Wanx
      { id: 'wanx-v1', provider: 'wanx', type: 'image' },
      { id: 'wanx-video-synthesis', provider: 'wanx', type: 'video' },
      { id: 'videoretalk', provider: 'wanx', type: 'video' },
      // MiniMax
      { id: 'image-01', provider: 'minimax', type: 'image' },
      { id: 'video-01', provider: 'minimax', type: 'video' },
      { id: 'speech-01', provider: 'minimax', type: 'audio' },
      // Veo
      { id: 'veo3.1', provider: 'veo', type: 'video' },
      { id: 'veo3.1-pro', provider: 'veo', type: 'video' },
      { id: 'veo3.1-components', provider: 'veo', type: 'video' },
      // Gemini
      { id: 'gemini-3-pro-preview', provider: 'gemini', type: 'chat' },
      { id: 'gemini-3-flash-preview', provider: 'gemini', type: 'chat' },
      { id: 'gemini-3-pro-image-preview', provider: 'gemini', type: 'image' },
      // Sora
      { id: 'sora-2', provider: 'sora', type: 'video' },
      { id: 'sora-2-hd', provider: 'sora', type: 'video' },
    ]
  });
});

export default router;
