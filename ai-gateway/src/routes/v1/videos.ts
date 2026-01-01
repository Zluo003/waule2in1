import { Router } from 'express';
import { doubao } from '../../providers/doubao';
import { vidu } from '../../providers/vidu';
import { wanx } from '../../providers/wanx';
import { minimax } from '../../providers/minimax';
import { veo } from '../../providers/veo';
import { inferProvider } from '../../providers';

const router = Router();

router.post('/generations', async (req, res) => {
  try {
    const {
      model, prompt, duration, resolution, aspect_ratio,
      reference_images, first_frame_image, last_frame_image,
      subjects, audio, voice_id, bgm, movement_amplitude,
      replace_image_url, replace_video_url, mode,
      style, video_fps, min_len
    } = req.body;

    // video-style-transform 模型使用 stylize 接口
    if (model === 'video-style-transform') {
      const result = await wanx.stylizeVideo({
        video_url: replace_video_url,
        style, video_fps, min_len
      });
      return res.json(result);
    }

    // videoretalk 模型使用 retalk 接口
    if (model === 'videoretalk') {
      const result = await wanx.retalkVideo({
        video_url: replace_video_url,
        audio_url: req.body.audio_url,
        ref_image_url: req.body.ref_image_url,
        video_extension: req.body.video_extension,
      });
      return res.json(result);
    }

    const provider = inferProvider(model || 'vidu');
    let result;

    switch (provider) {
      case 'doubao':
        result = await doubao.generateVideo({
          model, prompt, duration, resolution, aspect_ratio,
          reference_images, first_frame_image, last_frame_image
        });
        break;
      case 'vidu':
        result = await vidu.generateVideo({
          model, prompt, duration, resolution, aspect_ratio,
          reference_images, first_frame_image, last_frame_image,
          subjects, audio, voice_id, bgm, movement_amplitude
        });
        break;
      case 'wanx':
        result = await wanx.generateVideo({
          model, prompt, duration, resolution, aspect_ratio,
          reference_images, first_frame_image,
          replace_image_url, replace_video_url, mode
        });
        break;
      case 'minimax':
        result = await minimax.generateVideo({
          model, prompt: prompt || '', resolution, first_frame_image, last_frame_image
        });
        break;
      case 'veo':
        result = await veo.generateVideo({
          model, prompt, aspect_ratio, first_frame_image, reference_images,
          enhance_prompt: req.body.enhance_prompt
        });
        break;
      default:
        return res.status(400).json({ error: `Unsupported model: ${model}` });
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/upscale', async (req, res) => {
  try {
    const { video_url, video_creation_id, upscale_resolution } = req.body;
    const result = await vidu.upscaleVideo({ video_url, video_creation_id, upscale_resolution });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/commercial', async (req, res) => {
  try {
    const { images, prompt, duration, aspect_ratio, language } = req.body;
    if (!images?.length) {
      return res.status(400).json({ error: 'images are required' });
    }
    const result = await vidu.createCommercialVideo({ images, prompt, duration, aspect_ratio, language });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/retalk', async (req, res) => {
  try {
    const { video_url, audio_url, ref_image_url, video_extension } = req.body;
    if (!video_url || !audio_url) {
      return res.status(400).json({ error: 'video_url and audio_url are required' });
    }
    const result = await wanx.retalkVideo({ video_url, audio_url, ref_image_url, video_extension });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/stylize', async (req, res) => {
  try {
    const { video_url, style, video_fps, min_len } = req.body;
    if (!video_url) {
      return res.status(400).json({ error: 'video_url is required' });
    }
    const result = await wanx.stylizeVideo({ video_url, style, video_fps, min_len });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
