import { Router } from 'express';
import { minimax } from '../../providers/minimax';
import { wanx } from '../../providers/wanx';
import { inferProvider } from '../../providers';

const router = Router();

router.post('/speech', async (req, res) => {
  try {
    const { model, input, voice, speed } = req.body;

    if (!input) {
      return res.status(400).json({ error: 'input is required' });
    }

    // 根据模型推断提供商
    const provider = inferProvider(model || 'minimax');

    let result;
    if (provider === 'wanx' || model?.includes('cosyvoice')) {
      result = await wanx.synthesizeSpeech({ model, input, voice, speed });
    } else {
      result = await minimax.generateSpeech({ model, input, voice, speed });
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
