import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as aiController from '../controllers/ai.controller';

const router = Router();

router.post('/video/minimax/callback', async (req, res) => {
  try {
    const body = req.body || {};
    const challenge = body.challenge;
    if (challenge) {
      return res.json({ challenge });
    }
    const taskId = String(body.task_id || body.data?.task_id || '');
    const status = String(body.status || body.data?.status || '');
    const fileId = body.file_id || body.data?.file_id;
    const meta: any = body.base_resp || body.data?.base_resp || {};
    if (!taskId || !status) return res.json({ ok: true });
    const { prisma } = require('../index');
    const tasks = await prisma.generationTask.findMany({ where: { OR: [ { metadata: { path: ['minimaxiTaskId'], equals: taskId } }, { externalTaskId: taskId } ] } });
    for (const t of tasks) {
      const s = status.toLowerCase();
      if (s === 'success' && fileId) {
        const { downloadVideoToOss } = require('../services/ai/minimaxi.service');
        const model = await prisma.aIModel.findUnique({ where: { id: t.modelId } });
        const apiKey = model?.apiKey || process.env.MINIMAX_API_KEY || process.env.MINIMAXI_API_KEY || process.env.MINIMAX_API_TOKEN;
        const apiUrl = model?.apiUrl || 'https://api.minimaxi.com/v1';
        const publicUrl = await downloadVideoToOss(apiUrl, apiKey, String(fileId));
        await prisma.generationTask.update({ where: { id: t.id }, data: { status: 'SUCCESS', progress: 100, resultUrl: publicUrl, previewNodeData: { type: 'videoPreview', url: publicUrl, ratio: t.ratio || '16:9', timestamp: Date.now() }, completedAt: new Date() } });
      } else if (s === 'failed' || s === 'fail') {
        await prisma.generationTask.update({ where: { id: t.id }, data: { status: 'FAILURE', errorMessage: meta?.status_msg || 'MiniMax 生成失败', completedAt: new Date() } });
      } else {
        await prisma.generationTask.update({ where: { id: t.id }, data: { status: 'PROCESSING', progress: 50 } });
      }
    }
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, message: e.message });
  }
});

router.use(authenticateToken);

// 获取AI模型列表
router.get('/models', async (req, res) => {
  try {
    const { provider, isActive, type } = req.query;
    const { prisma } = require('../index');
    
    const where: any = {};
    if (provider) where.provider = String(provider);
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (type) where.type = String(type);
    
    const models = await prisma.aIModel.findMany({ where });
    res.json(models);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /ai/image/generate:
 *   post:
 *     summary: 生成图片
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 */
router.post('/image/generate', aiController.generateImage);

/**
 * @swagger
 * /ai/text/generate:
 *   post:
 *     summary: 生成文本
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 */
router.post('/text/generate', aiController.generateText);

/**
 * @swagger
 * /ai/video/generate:
 *   post:
 *     summary: 生成视频
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 */
router.post('/video/generate', aiController.generateVideo);

// Debug: query MiniMax task status by external task id
router.get('/video/minimax/debug-query', async (req, res) => {
  try {
    const taskId = String((req.query.taskId || '').toString());
    if (!taskId) return res.status(400).json({ ok: false, message: 'taskId 必填' });
    const modelId = String((req.query.modelId || '').toString());
    let apiKey = process.env.MINIMAX_API_KEY || process.env.MINIMAXI_API_KEY || process.env.MINIMAX_API_TOKEN || '';
    let apiUrl = 'https://api.minimaxi.com/v1';
    if (req.query.genTaskId) {
      const { prisma } = require('../index');
      const gt = await prisma.generationTask.findUnique({ where: { id: String(req.query.genTaskId) } });
      if (gt) {
        const model = await prisma.aIModel.findUnique({ where: { id: gt.modelId } });
        apiKey = model?.apiKey || apiKey;
        apiUrl = model?.apiUrl || apiUrl;
      }
    }
    const { queryVideoTaskStatus } = require('../services/ai/minimaxi.service');
    const data = await queryVideoTaskStatus(apiUrl, apiKey, taskId);
    res.json({ ok: true, data });
  } catch (e: any) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// 语音克隆与合成
router.post('/audio/voice/create', aiController.createVoiceEnrollment);
router.get('/audio/voice/status', aiController.queryVoiceStatus);
router.post('/audio/synthesize', aiController.synthesizeAudio);
router.get('/audio/voice/presets', aiController.listVoicePresets);
router.get('/audio/voice/diagnose', aiController.diagnoseMinimaxVoice);
router.post('/audio/voice/design', aiController.designVoice);

// 用户音色管理（最多10个）
router.get('/audio/voices', aiController.listUserVoices);
router.post('/audio/voices', aiController.addUserVoice);
router.put('/audio/voices/:id', aiController.updateUserVoice);
router.delete('/audio/voices/:id', aiController.deleteUserVoice);

// 视频超清
router.post('/video-upscale', aiController.upscaleVideo);

// 广告成片
router.post('/commercial-video', aiController.createCommercial);

// 图片编辑（工作流节点）
router.get('/image-editing/models', aiController.getImageEditingModels);
router.post('/image-editing/edit', aiController.imageEdit);
router.post('/image-editing/identify-points', aiController.identifyImagePoints);

// 保留旧的路由用于兼容
router.post('/script/adapt', (req, res) => res.json({ success: true, message: 'Adapt script with AI' }));

export default router;
