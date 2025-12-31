import { Router } from 'express';
import { gemini } from '../../providers/gemini';
import { inferProvider } from '../../providers';

const router = Router();

router.post('/completions', async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, thinking_level, stream } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const provider = inferProvider(model || 'gemini-3-flash-preview');

    switch (provider) {
      case 'gemini':
        const result = await gemini.chatCompletion({
          model, messages, temperature, max_tokens, thinking_level, stream
        });
        return res.json(result);
      default:
        return res.status(400).json({ error: `Unsupported model for chat: ${model}` });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
