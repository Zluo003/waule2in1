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
const auth_1 = require("../middleware/auth");
const userLevelController = __importStar(require("../controllers/user-level.controller"));
const router = (0, express_1.Router)();
// 所有路由需要认证和管理员权限
router.use(auth_1.authenticateToken);
router.use((0, auth_1.authorizeRoles)('ADMIN'));
/**
 * @swagger
 * /admin/user-levels/configs:
 *   get:
 *     summary: 获取所有用户等级配置
 *     tags: [Admin - User Levels]
 *     security:
 *       - bearerAuth: []
 */
router.get('/configs', userLevelController.getAllLevelConfigs);
/**
 * @swagger
 * /admin/user-levels/configs:
 *   put:
 *     summary: 更新用户等级配置
 *     tags: [Admin - User Levels]
 *     security:
 *       - bearerAuth: []
 */
router.put('/configs', userLevelController.updateLevelConfig);
/**
 * @swagger
 * /admin/user-levels/configs/batch:
 *   put:
 *     summary: 批量更新用户等级配置
 *     tags: [Admin - User Levels]
 *     security:
 *       - bearerAuth: []
 */
router.put('/configs/batch', userLevelController.batchUpdateLevelConfigs);
/**
 * @swagger
 * /admin/user-levels/permissions:
 *   get:
 *     summary: 获取所有模型权限配置
 *     tags: [Admin - User Levels]
 *     security:
 *       - bearerAuth: []
 */
router.get('/permissions', userLevelController.getAllModelPermissions);
/**
 * @swagger
 * /admin/user-levels/permissions/summary:
 *   get:
 *     summary: 获取模型权限配置摘要（按模型分组）
 *     tags: [Admin - User Levels]
 *     security:
 *       - bearerAuth: []
 */
router.get('/permissions/summary', userLevelController.getModelPermissionsSummary);
/**
 * @swagger
 * /admin/user-levels/permissions:
 *   put:
 *     summary: 更新模型权限配置
 *     tags: [Admin - User Levels]
 *     security:
 *       - bearerAuth: []
 */
router.put('/permissions', userLevelController.updateModelPermission);
/**
 * @swagger
 * /admin/user-levels/permissions/batch:
 *   put:
 *     summary: 批量更新模型权限配置
 *     tags: [Admin - User Levels]
 *     security:
 *       - bearerAuth: []
 */
router.put('/permissions/batch', userLevelController.batchUpdateModelPermissions);
/**
 * @swagger
 * /admin/user-levels/permissions/model:
 *   put:
 *     summary: 快速为模型设置所有等级权限
 *     tags: [Admin - User Levels]
 *     security:
 *       - bearerAuth: []
 */
router.put('/permissions/model', userLevelController.setModelPermissionsForAllLevels);
/**
 * @swagger
 * /admin/user-levels/permissions/{id}:
 *   delete:
 *     summary: 删除模型权限配置
 *     tags: [Admin - User Levels]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/permissions/:id', userLevelController.deleteModelPermission);
/**
 * @swagger
 * /admin/user-levels/usage-stats:
 *   get:
 *     summary: 获取用户使用统计
 *     tags: [Admin - User Levels]
 *     security:
 *       - bearerAuth: []
 */
router.get('/usage-stats', userLevelController.getUserUsageStats);
/**
 * @swagger
 * /admin/user-levels/gift-credits:
 *   post:
 *     summary: 手动赠送用户积分
 *     tags: [Admin - User Levels]
 *     security:
 *       - bearerAuth: []
 */
router.post('/gift-credits', userLevelController.grantGiftCredits);
/**
 * @swagger
 * /admin/user-levels/gift-credits/status:
 *   get:
 *     summary: 获取用户赠送积分状态
 *     tags: [Admin - User Levels]
 *     security:
 *       - bearerAuth: []
 */
router.get('/gift-credits/status', userLevelController.getGiftCreditsStatus);
/**
 * @swagger
 * /admin/user-levels/users/{id}/membership:
 *   put:
 *     summary: 更新用户会员信息
 *     tags: [Admin - User Levels]
 *     security:
 *       - bearerAuth: []
 */
router.put('/users/:id/membership', userLevelController.updateUserMembership);
/**
 * @swagger
 * /admin/user-levels/storage-cleanup/preview:
 *   get:
 *     summary: 预览存储清理（不实际删除）
 *     tags: [Admin - User Levels]
 *     security:
 *       - bearerAuth: []
 */
router.get('/storage-cleanup/preview', userLevelController.previewStorageCleanup);
/**
 * @swagger
 * /admin/user-levels/storage-cleanup/run:
 *   post:
 *     summary: 手动执行存储清理
 *     tags: [Admin - User Levels]
 *     security:
 *       - bearerAuth: []
 */
router.post('/storage-cleanup/run', userLevelController.runStorageCleanup);
exports.default = router;
//# sourceMappingURL=user-level.routes.js.map