import { Router } from 'express';
import { doubao } from '../../providers/doubao';
import { wanx } from '../../providers/wanx';
import { minimax } from '../../providers/minimax';
import { qwen } from '../../providers/qwen';
import { gemini } from '../../providers/gemini';
import { inferProvider } from '../../providers';

const router = Router();

router.post('/generations', async (req, res) => {
  try {
    const { model, prompt, size, n, reference_images, use_intl, max_images, image_size } = req.body;

    if (!model || !prompt) {
      return res.status(400).json({ error: 'model and prompt are required' });
    }

    const provider = inferProvider(model);
    let result;

    switch (provider) {
      case 'doubao':
        result = await doubao.generateImage({ model, prompt, size, n, reference_images, max_images });
        break;
      case 'wanx':
        result = await wanx.generateImage({ model, prompt, size, n, reference_images });
        break;
      case 'minimax':
        result = await minimax.generateImage({ model, prompt, aspect_ratio: size, n });
        break;
      case 'qwen':
        result = await qwen.generateImage({ model, prompt, size, n, reference_images, use_intl });
        break;
      case 'gemini':
        result = await gemini.generateImage({ model, prompt, size, image_size, reference_images });
        break;
      default:
        return res.status(400).json({ error: `Unsupported model: ${model}` });
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
