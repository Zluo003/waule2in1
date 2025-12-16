"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const adminController = __importStar(require("../controllers/admin.controller"));
const settingsController = __importStar(require("../controllers/settings.controller"));
const router = (0, express_1.Router)();
// All admin routes require authentication and ADMIN role
router.use(auth_1.authenticateToken);
router.use((0, auth_1.authorizeRoles)('ADMIN'));
/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: 获取所有用户
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功获取用户列表
 */
router.get('/users', adminController.getAllUsers);
/**
 * @swagger
 * /admin/users/{id}:
 *   put:
 *     summary: 更新用户信息
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.put('/users/:id', adminController.updateUser);
/**
 * @swagger
 * /admin/users/{id}:
 *   delete:
 *     summary: 删除用户
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/users/:id', adminController.deleteUser);
/**
 * @swagger
 * /admin/ai-models:
 *   get:
 *     summary: 获取所有AI模型
 *     tags: [Admin - AI Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [TEXT_GENERATION, IMAGE_GENERATION, VIDEO_GENERATION, VIDEO_EDITING]
 *       - in: query
 *         name: provider
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: 成功获取AI模型列表
 */
router.get('/ai-models', adminController.getAllAIModels);
/**
 * @swagger
 * /admin/ai-models/presets:
 *   get:
 *     summary: 获取AI模型预设（可按类型、提供商筛选）
 *     tags: [Admin - AI Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [TEXT_GENERATION, IMAGE_GENERATION, VIDEO_GENERATION, VIDEO_EDITING, AUDIO_SYNTHESIS]
 *       - in: query
 *         name: provider
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功获取预设列表
 */
router.get('/ai-models/presets', adminController.getAIPresets);
// 模型能力签名与限制管理
router.post('/ai-models/capabilities', adminController.upsertModelCapabilities);
/**
 * @swagger
 * /admin/ai-models:
 *   post:
 *     summary: 创建AI模型配置
 *     tags: [Admin - AI Models]
 *     security:
 *       - bearerAuth: []
 */
router.post('/ai-models', [
    (0, express_validator_1.body)('name').notEmpty().withMessage('模型名称不能为空'),
    (0, express_validator_1.body)('provider').notEmpty().withMessage('提供商不能为空'),
    (0, express_validator_1.body)('modelId').notEmpty().withMessage('模型ID不能为空'),
    (0, express_validator_1.body)('type').isIn(['TEXT_GENERATION', 'IMAGE_GENERATION', 'VIDEO_GENERATION', 'VIDEO_EDITING', 'AUDIO_SYNTHESIS']).withMessage('无效的模型类型'),
    (0, express_validator_1.body)('config').custom((cfg) => {
        if (!cfg || typeof cfg !== 'object')
            return true;
        if (cfg.targetModel)
            throw new Error('请勿在 config 中提交 targetModel，与模型ID重复');
        return true;
    }),
], adminController.createAIModel);
/**
 * @swagger
 * /admin/ai-models/{id}:
 *   put:
 *     summary: 更新AI模型配置
 *     tags: [Admin - AI Models]
 *     security:
 *       - bearerAuth: []
 */
router.put('/ai-models/:id', adminController.updateAIModel);
/**
 * @swagger
 * /admin/ai-models/{id}:
 *   delete:
 *     summary: 删除AI模型配置
 *     tags: [Admin - AI Models]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/ai-models/:id', adminController.deleteAIModel);
/**
 * @swagger
 * /admin/settings:
 *   get:
 *     summary: 获取系统设置
 *     tags: [Admin - Settings]
 *     security:
 *       - bearerAuth: []
 */
router.get('/settings', adminController.getSettings);
/**
 * @swagger
 * /admin/settings:
 *   put:
 *     summary: 更新系统设置
 *     tags: [Admin - Settings]
 *     security:
 *       - bearerAuth: []
 */
router.put('/settings', adminController.updateSettings);
/**
 * @swagger
 * /admin/stats:
 *   get:
 *     summary: 获取统计数据
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/stats', adminController.getStatistics);
/**
 * @swagger
 * /admin/server-metrics:
 *   get:
 *     summary: 获取服务器监控指标
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取服务器监控数据
 */
router.get('/server-metrics', adminController.getServerMetrics);
// ========== Midjourney 设置 ==========
router.get('/settings/midjourney', settingsController.getMidjourneySettings);
router.put('/settings/midjourney', settingsController.updateMidjourneySettings);
// ========== 任务管理 ==========
/**
 * @swagger
 * /admin/tasks:
 *   get:
 *     summary: 获取任务列表（支持多重筛选）
 *     tags: [Admin - Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, PROCESSING, SUCCESS, FAILURE]
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [IMAGE, VIDEO]
 *       - in: query
 *         name: nickname
 *         schema:
 *           type: string
 *       - in: query
 *         name: isZombie
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: 成功获取任务列表
 */
router.get('/tasks', adminController.getTasks);
/**
 * @swagger
 * /admin/tasks/stats:
 *   get:
 *     summary: 获取任务统计数据
 *     tags: [Admin - Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取任务统计
 */
router.get('/tasks/stats', adminController.getTaskStats);
/**
 * @swagger
 * /admin/tasks/{id}/refund:
 *   post:
 *     summary: 手动退款
 *     tags: [Admin - Tasks]
 *     security:
 *       - bearerAuth: []
 */
router.post('/tasks/:id/refund', adminController.refundTask);
/**
 * @swagger
 * /admin/tasks/{id}/cancel:
 *   post:
 *     summary: 取消任务（标记为失败）
 *     tags: [Admin - Tasks]
 *     security:
 *       - bearerAuth: []
 */
router.post('/tasks/:id/cancel', adminController.cancelTask);
// ========== 管理员巡查功能 ==========
/**
 * @swagger
 * /admin/users/{userId}/workflows:
 *   get:
 *     summary: 查看指定用户的工作流列表
 *     tags: [Admin - Inspection]
 *     security:
 *       - bearerAuth: []
 */
router.get('/users/:userId/workflows', adminController.getUserWorkflows);
/**
 * @swagger
 * /admin/users/{userId}/asset-libraries:
 *   get:
 *     summary: 查看指定用户的资产库列表
 *     tags: [Admin - Inspection]
 *     security:
 *       - bearerAuth: []
 */
router.get('/users/:userId/asset-libraries', adminController.getUserAssetLibraries);
/**
 * @swagger
 * /admin/asset-libraries/{libraryId}/assets:
 *   get:
 *     summary: 查看指定资产库的资产列表
 *     tags: [Admin - Inspection]
 *     security:
 *       - bearerAuth: []
 */
router.get('/asset-libraries/:libraryId/assets', adminController.getAssetLibraryAssets);
exports.default = router;
//# sourceMappingURL=admin.routes.js.map