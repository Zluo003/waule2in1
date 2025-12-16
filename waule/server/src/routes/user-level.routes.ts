import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import * as userLevelController from '../controllers/user-level.controller';

const router = Router();

// 所有路由需要认证和管理员权限
router.use(authenticateToken);
router.use(authorizeRoles('ADMIN'));

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

export default router;
