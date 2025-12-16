import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import * as tenantController from '../controllers/tenant.controller';

const router = Router();

// 所有租户管理路由需要管理员权限
router.use(authenticateToken);
router.use(authorizeRoles('ADMIN'));

// ==================== 租户管理 ====================

/**
 * @swagger
 * /admin/tenants:
 *   get:
 *     summary: 获取租户列表
 *     tags: [Admin - Tenants]
 */
router.get('/', tenantController.getTenants);

/**
 * @swagger
 * /admin/tenants/{id}:
 *   get:
 *     summary: 获取租户详情
 *     tags: [Admin - Tenants]
 */
router.get('/:id', tenantController.getTenantById);

/**
 * @swagger
 * /admin/tenants:
 *   post:
 *     summary: 创建租户
 *     tags: [Admin - Tenants]
 */
router.post(
  '/',
  [
    body('name').notEmpty().withMessage('租户名称不能为空'),
    body('contactName').optional(),
    body('contactPhone').optional(),
    body('contactEmail').optional().isEmail().withMessage('邮箱格式不正确'),
    body('initialCredits').optional().isInt({ min: 0 }).withMessage('初始积分必须为非负整数'),
    body('adminUsername').notEmpty().withMessage('管理员用户名不能为空'),
    body('adminPassword').notEmpty().isLength({ min: 6 }).withMessage('管理员密码至少6位'),
  ],
  tenantController.createTenant
);

/**
 * @swagger
 * /admin/tenants/{id}:
 *   put:
 *     summary: 更新租户信息
 *     tags: [Admin - Tenants]
 */
router.put('/:id', tenantController.updateTenant);

/**
 * @swagger
 * /admin/tenants/{id}:
 *   delete:
 *     summary: 删除租户
 *     tags: [Admin - Tenants]
 */
router.delete('/:id', tenantController.deleteTenant);

/**
 * @swagger
 * /admin/tenants/{id}/recharge:
 *   post:
 *     summary: 租户充值积分
 *     tags: [Admin - Tenants]
 */
router.post(
  '/:id/recharge',
  [
    body('amount').isInt({ min: 1 }).withMessage('充值金额必须为正整数'),
    body('description').optional(),
  ],
  tenantController.rechargeTenant
);

/**
 * @swagger
 * /admin/tenants/{id}/regenerate-key:
 *   post:
 *     summary: 重新生成租户API Key
 *     tags: [Admin - Tenants]
 */
router.post('/:id/regenerate-key', tenantController.regenerateApiKey);

// ==================== 租户用户管理 ====================

/**
 * @swagger
 * /admin/tenants/{tenantId}/users:
 *   get:
 *     summary: 获取租户下的用户列表
 *     tags: [Admin - Tenant Users]
 */
router.get('/:tenantId/users', tenantController.getTenantUsers);

/**
 * @swagger
 * /admin/tenants/{tenantId}/users:
 *   post:
 *     summary: 为租户创建用户
 *     tags: [Admin - Tenant Users]
 */
router.post(
  '/:tenantId/users',
  [
    body('username').notEmpty().withMessage('用户名不能为空'),
    body('password').notEmpty().isLength({ min: 6 }).withMessage('密码至少6位'),
    body('nickname').optional(),
    body('isAdmin').optional().isBoolean(),
  ],
  tenantController.createTenantUser
);

/**
 * @swagger
 * /admin/tenants/{tenantId}/users/{userId}:
 *   put:
 *     summary: 更新租户用户
 *     tags: [Admin - Tenant Users]
 */
router.put('/:tenantId/users/:userId', tenantController.updateTenantUser);

/**
 * @swagger
 * /admin/tenants/{tenantId}/users/{userId}:
 *   delete:
 *     summary: 删除租户用户
 *     tags: [Admin - Tenant Users]
 */
router.delete('/:tenantId/users/:userId', tenantController.deleteTenantUser);

/**
 * @swagger
 * /admin/tenants/{tenantId}/users/{userId}/reset-password:
 *   post:
 *     summary: 重置租户用户密码
 *     tags: [Admin - Tenant Users]
 */
router.post(
  '/:tenantId/users/:userId/reset-password',
  [body('password').notEmpty().isLength({ min: 6 }).withMessage('密码至少6位')],
  tenantController.resetTenantUserPassword
);

// ==================== 租户统计 ====================

/**
 * @swagger
 * /admin/tenants/{id}/usage:
 *   get:
 *     summary: 获取租户使用统计
 *     tags: [Admin - Tenants]
 */
router.get('/:id/usage', tenantController.getTenantUsage);

/**
 * @swagger
 * /admin/tenants/{id}/credit-logs:
 *   get:
 *     summary: 获取租户积分流水
 *     tags: [Admin - Tenants]
 */
router.get('/:id/credit-logs', tenantController.getTenantCreditLogs);

// ==================== 激活码管理 ====================

/**
 * @swagger
 * /admin/tenants/{id}/activations:
 *   get:
 *     summary: 获取租户的激活码列表
 *     tags: [Admin - Tenants]
 */
router.get('/:id/activations', tenantController.getTenantActivations);

/**
 * @swagger
 * /admin/tenants/{id}/activations:
 *   post:
 *     summary: 批量生成激活码
 *     tags: [Admin - Tenants]
 */
router.post('/:id/activations', tenantController.generateActivations);

/**
 * @swagger
 * /admin/tenants/{id}/activations/{activationId}:
 *   delete:
 *     summary: 删除激活码
 *     tags: [Admin - Tenants]
 */
router.delete('/:id/activations/:activationId', tenantController.deleteActivation);

/**
 * @swagger
 * /admin/tenants/{id}/activations/{activationId}/unbind:
 *   post:
 *     summary: 解绑激活码
 *     tags: [Admin - Tenants]
 */
router.post('/:id/activations/:activationId/unbind', tenantController.unbindActivation);

/**
 * @swagger
 * /admin/tenants/{id}/max-clients:
 *   put:
 *     summary: 更新客户端数量限制
 *     tags: [Admin - Tenants]
 */
router.put('/:id/max-clients', tenantController.updateMaxClients);

export default router;


