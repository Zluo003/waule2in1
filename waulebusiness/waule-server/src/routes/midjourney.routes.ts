import { Router } from 'express';
import {
  imagine,
  fetchTask,
  pollTask,
  action,
  blend,
  describe,
  uploadReferenceImage,
  saveMidjourneyResult,
} from '../controllers/midjourney.controller';
import { getMidjourneySettings } from '../controllers/settings.controller';
import { authenticateTenantUser } from '../middleware/tenant-auth';

const router = Router();

// 所有 Midjourney 路由需要租户用户鉴权（商业版）
router.use(authenticateTenantUser);

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
 * @route   POST /api/midjourney/blend
 * @desc    图片混合
 * @body    { base64Array: string[] }
 */
router.post('/blend', blend);

/**
 * @route   POST /api/midjourney/describe
 * @desc    图生文
 * @body    { base64: string }
 */
router.post('/describe', describe);

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

/**
 * @route   POST /api/midjourney/save-result
 * @desc    保存 Midjourney 结果到本地（自动下载到 tenant-server 并删除 OSS）
 * @body    { mjTaskId: string, imageUrl: string, prompt?: string, action?: string, nodeId?: string }
 */
router.post('/save-result', saveMidjourneyResult);

export default router;

