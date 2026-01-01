"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const midjourney_controller_1 = require("../controllers/midjourney.controller");
const settings_controller_1 = require("../controllers/settings.controller");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// 所有 Midjourney 路由需要鉴权
router.use(auth_1.authenticateToken);
/**
 * @route   POST /api/midjourney/imagine
 * @desc    提交 Imagine 任务（文生图）
 * @body    { prompt: string, base64Array?: string[] }
 */
router.post('/imagine', midjourney_controller_1.imagine);
/**
 * @route   GET /api/midjourney/task/:taskId
 * @desc    查询任务状态
 */
router.get('/task/:taskId', midjourney_controller_1.fetchTask);
/**
 * @route   GET /api/midjourney/task/:taskId/poll
 * @desc    轮询任务直到完成
 */
router.get('/task/:taskId/poll', midjourney_controller_1.pollTask);
/**
 * @route   POST /api/midjourney/action
 * @desc    执行动作（Upscale、Variation 等）
 * @body    { taskId: string, customId: string }
 */
router.post('/action', midjourney_controller_1.action);
/**
 * @route   POST /api/midjourney/upload-reference
 * @desc    上传参考图到 Discord 获取 CDN URL（用于 Omni-Reference）
 * @body    { imageUrl: string } 或 { base64: string, filename?: string }
 */
router.post('/upload-reference', midjourney_controller_1.uploadReferenceImage);
/**
 * @route   GET /api/midjourney/settings
 * @desc    获取 Midjourney 设置（Fast 模式是否可用等）
 */
router.get('/settings', settings_controller_1.getMidjourneySettings);
exports.default = router;
//# sourceMappingURL=midjourney.routes.js.map