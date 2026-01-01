import { Router } from 'express';
import { body } from 'express-validator';
import * as tenantAuthController from '../controllers/tenant-auth.controller';
import { authenticateTenantUser, authorizeTenantAdmin } from '../middleware/tenant-auth';

const router = Router();

/**
 * @swagger
 * /tenant-auth/login:
 *   post:
 *     summary: 租户用户登录
 *     tags: [Tenant Auth]
 *     description: 从请求头 X-Tenant-ID 获取租户ID（客户端激活后自动携带）
 */
router.post(
  '/login',
  [
    body('username').notEmpty().withMessage('用户名不能为空'),
    body('password').notEmpty().withMessage('密码不能为空'),
  ],
  tenantAuthController.login
);

/**
 * @swagger
 * /tenant-auth/me:
 *   get:
 *     summary: 获取当前用户信息
 *     tags: [Tenant Auth]
 */
router.get('/me', authenticateTenantUser, tenantAuthController.getCurrentUser);

/**
 * @swagger
 * /tenant-auth/logout:
 *   post:
 *     summary: 退出登录
 *     tags: [Tenant Auth]
 */
router.post('/logout', authenticateTenantUser, tenantAuthController.logout);

/**
 * @swagger
 * /tenant-auth/change-password:
 *   post:
 *     summary: 修改密码
 *     tags: [Tenant Auth]
 */
router.post(
  '/change-password',
  authenticateTenantUser,
  [
    body('oldPassword').notEmpty().withMessage('旧密码不能为空'),
    body('newPassword').notEmpty().isLength({ min: 6 }).withMessage('新密码至少6位'),
  ],
  tenantAuthController.changePassword
);

/**
 * @swagger
 * /tenant-auth/update-profile:
 *   put:
 *     summary: 更新用户资料
 *     tags: [Tenant Auth]
 */
router.put('/update-profile', authenticateTenantUser, tenantAuthController.updateProfile);

// ==================== 租户管理员功能 ====================

/**
 * @swagger
 * /tenant-auth/admin/users:
 *   get:
 *     summary: "[管理员] 获取租户用户列表"
 *     tags: [Tenant Admin]
 */
router.get('/admin/users', authenticateTenantUser, authorizeTenantAdmin, tenantAuthController.getUsers);

/**
 * @swagger
 * /tenant-auth/admin/users:
 *   post:
 *     summary: "[管理员] 创建用户"
 *     tags: [Tenant Admin]
 */
router.post(
  '/admin/users',
  authenticateTenantUser,
  authorizeTenantAdmin,
  [
    body('username').notEmpty().withMessage('用户名不能为空'),
    body('password').notEmpty().isLength({ min: 6 }).withMessage('密码至少6位'),
  ],
  tenantAuthController.createUser
);

/**
 * @swagger
 * /tenant-auth/admin/users/{userId}:
 *   put:
 *     summary: "[管理员] 更新用户"
 *     tags: [Tenant Admin]
 */
router.put('/admin/users/:userId', authenticateTenantUser, authorizeTenantAdmin, tenantAuthController.updateUser);

/**
 * @swagger
 * /tenant-auth/admin/users/{userId}:
 *   delete:
 *     summary: "[管理员] 删除用户"
 *     tags: [Tenant Admin]
 */
router.delete('/admin/users/:userId', authenticateTenantUser, authorizeTenantAdmin, tenantAuthController.deleteUser);

/**
 * @swagger
 * /tenant-auth/admin/users/{userId}/reset-password:
 *   post:
 *     summary: "[管理员] 重置用户密码"
 *     tags: [Tenant Admin]
 */
router.post(
  '/admin/users/:userId/reset-password',
  authenticateTenantUser,
  authorizeTenantAdmin,
  [body('password').notEmpty().isLength({ min: 6 }).withMessage('密码至少6位')],
  tenantAuthController.resetUserPassword
);

/**
 * @swagger
 * /tenant-auth/admin/credits:
 *   get:
 *     summary: "[管理员] 获取积分信息"
 *     tags: [Tenant Admin]
 */
router.get('/admin/credits', authenticateTenantUser, authorizeTenantAdmin, tenantAuthController.getCredits);

/**
 * @swagger
 * /tenant-auth/admin/credit-logs:
 *   get:
 *     summary: "[管理员] 获取积分消耗明细"
 *     tags: [Tenant Admin]
 */
router.get('/admin/credit-logs', authenticateTenantUser, authorizeTenantAdmin, tenantAuthController.getCreditLogs);

/**
 * @swagger
 * /tenant-auth/admin/usage:
 *   get:
 *     summary: "[管理员] 获取使用统计"
 *     tags: [Tenant Admin]
 */
router.get('/admin/usage', authenticateTenantUser, authorizeTenantAdmin, tenantAuthController.getUsageStats);

/**
 * @swagger
 * /tenant-auth/admin/assets:
 *   get:
 *     summary: "[管理员] 获取租户资产列表"
 *     tags: [Tenant Admin]
 */
router.get('/admin/assets', authenticateTenantUser, authorizeTenantAdmin, tenantAuthController.getAssets);

/**
 * @swagger
 * /tenant-auth/admin/recycle-bin:
 *   get:
 *     summary: "[管理员] 获取回收站资产"
 *     tags: [Tenant Admin]
 */
router.get('/admin/recycle-bin', authenticateTenantUser, authorizeTenantAdmin, tenantAuthController.getRecycleBin);

// ==================== 设备管理 ====================

/**
 * @swagger
 * /tenant-auth/admin/activations:
 *   get:
 *     summary: "[管理员] 获取已激活设备列表"
 *     tags: [Tenant Admin]
 */
router.get('/admin/activations', authenticateTenantUser, authorizeTenantAdmin, tenantAuthController.getActivations);

/**
 * @swagger
 * /tenant-auth/admin/activations/{activationId}/unbind:
 *   post:
 *     summary: "[管理员] 解绑设备"
 *     tags: [Tenant Admin]
 */
router.post('/admin/activations/:activationId/unbind', authenticateTenantUser, authorizeTenantAdmin, tenantAuthController.unbindDevice);

// ==================== 存储设置 ====================

/**
 * @swagger
 * /tenant-auth/admin/settings/storage:
 *   get:
 *     summary: "[管理员] 获取存储配置"
 *     tags: [Tenant Admin]
 */
router.get('/admin/settings/storage', authenticateTenantUser, authorizeTenantAdmin, tenantAuthController.getStorageConfig);

/**
 * @swagger
 * /tenant-auth/admin/settings/storage:
 *   put:
 *     summary: "[管理员] 更新存储配置"
 *     tags: [Tenant Admin]
 */
router.put('/admin/settings/storage', authenticateTenantUser, authorizeTenantAdmin, tenantAuthController.updateStorageConfig);

// ==================== 数据报表 ====================

/**
 * @swagger
 * /tenant-auth/admin/reports/staff:
 *   get:
 *     summary: "[管理员] 获取员工效率报表"
 *     tags: [Tenant Admin]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *         description: 开始日期 (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *         description: 结束日期 (YYYY-MM-DD)
 */
router.get('/admin/reports/staff', authenticateTenantUser, authorizeTenantAdmin, tenantAuthController.getStaffReport);

/**
 * @swagger
 * /tenant-auth/admin/users/{userId}/workflows:
 *   get:
 *     summary: "[管理员] 获取指定用户的工作流列表"
 *     tags: [Tenant Admin]
 */
router.get('/admin/users/:userId/workflows', authenticateTenantUser, authorizeTenantAdmin, tenantAuthController.getUserWorkflows);

/**
 * @swagger
 * /tenant-auth/heartbeat:
 *   post:
 *     summary: "客户端心跳上报"
 *     tags: [Tenant Auth]
 *     description: 定期上报心跳，更新在线状态
 */
router.post('/heartbeat', authenticateTenantUser, tenantAuthController.heartbeat);

export default router;

