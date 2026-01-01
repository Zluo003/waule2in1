import { Router } from 'express';
import {
  imagine,
  fetchTask,
  pollTask,
  action,
  uploadReferenceImage,
} from '../controllers/midjourney.controller';
import { getMidjourneySettings } from '../controllers/settings.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// 所有 Midjourney 路由需要鉴权
router.use(authenticateToken);

/**
 * @route   POST /api/midjourney/imagine
 * @desc    提交 Imagine 任务（文生图）
 * @body    { prompt: string, base64Array?: string[] }
 */
router.post('/imagine', imagine);

/**
 * @route   GET /api/midjourney/task/:taskId
 * @desc    查询任务状态
 */
router.get('/task/:taskId', fetchTask);

/**
 * @route   GET /api/midjourney/task/:taskId/poll
 * @desc    轮询任务直到完成
 */
router.get('/task/:taskId/poll', pollTask);

/**
 * @route   POST /api/midjourney/action
 * @desc    执行动作（Upscale、Variation 等）
 * @body    { taskId: string, customId: string }
 */
router.post('/action', action);

/**
 * @route   POST /api/midjourney/upload-reference
 * @desc    上传参考图到 Discord 获取 CDN URL（用于 Omni-Reference）
 * @body    { imageUrl: string } 或 { base64: string, filename?: string }
 */
router.post('/upload-reference', uploadReferenceImage);

/**
 * @route   GET /api/midjourney/settings
 * @desc    获取 Midjourney 设置（Fast 模式是否可用等）
 */
router.get('/settings', getMidjourneySettings);

export default router;

