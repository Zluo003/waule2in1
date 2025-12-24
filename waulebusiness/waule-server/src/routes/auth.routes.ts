import { Router } from 'express';
import { body } from 'express-validator';
import * as authController from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth';
import { authLimiter, smsLimiter, smsHourlyLimiter } from '../middleware/rateLimiter';

const router = Router();

/**
 * @swagger
 * /auth/send-code:
 *   post:
 *     summary: 发送手机验证码
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *             properties:
 *               phone:
 *                 type: string
 *                 description: 手机号码
 *     responses:
 *       200:
 *         description: 验证码发送成功
 *       429:
 *         description: 发送过于频繁
 */
router.post(
  '/send-code',
  smsLimiter,
  smsHourlyLimiter,
  [
    body('phone')
      .matches(/^1[3-9]\d{9}$/)
      .withMessage('请输入有效的手机号码'),
  ],
  authController.sendVerificationCode
);

/**
 * @swagger
 * /auth/login-phone:
 *   post:
 *     summary: 手机验证码登录
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - code
 *             properties:
 *               phone:
 *                 type: string
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: 登录成功
 *       401:
 *         description: 验证码错误
 */
router.post(
  '/login-phone',
  authLimiter,
  [
    body('phone')
      .matches(/^1[3-9]\d{9}$/)
      .withMessage('请输入有效的手机号码'),
    body('code')
      .isLength({ min: 6, max: 6 })
      .withMessage('验证码为6位数字'),
  ],
  authController.loginWithPhone
);

/**
 * @swagger
 * /auth/admin-login:
 *   post:
 *     summary: 管理员登录
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: 登录成功
 *       401:
 *         description: 认证失败
 */
router.post(
  '/admin-login',
  authLimiter,
  [
    body('username').notEmpty().withMessage('请输入用户名'),
    body('password').notEmpty().withMessage('请输入密码'),
  ],
  authController.adminLogin
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: 用户登出
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 登出成功
 */
router.post('/logout', authenticateToken, authController.logout);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: 获取当前用户信息
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取用户信息
 */
router.get('/me', authenticateToken, authController.getCurrentUser);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: 刷新token
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功刷新token
 */
router.post('/refresh', authenticateToken, authController.refreshToken);

// ========== TOTP 双因素认证 ==========

/**
 * @swagger
 * /auth/totp/setup:
 *   post:
 *     summary: 设置双因素认证（生成二维码）
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 返回二维码和密钥
 */
router.post('/totp/setup', authenticateToken, authController.setupTotp);

/**
 * @swagger
 * /auth/totp/confirm:
 *   post:
 *     summary: 确认并激活双因素认证
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 description: 6位验证码
 *     responses:
 *       200:
 *         description: 激活成功
 */
router.post(
  '/totp/confirm',
  authenticateToken,
  [body('code').isLength({ min: 6, max: 6 }).withMessage('请输入6位验证码')],
  authController.confirmTotp
);

/**
 * @swagger
 * /auth/totp/disable:
 *   post:
 *     summary: 禁用双因素认证
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/totp/disable',
  authenticateToken,
  [body('code').isLength({ min: 6, max: 6 }).withMessage('请输入6位验证码')],
  authController.disableTotp
);

/**
 * @swagger
 * /auth/totp/status:
 *   get:
 *     summary: 获取双因素认证状态
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.get('/totp/status', authenticateToken, authController.getTotpStatus);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: 修改密码
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: 密码修改成功
 */
router.post(
  '/change-password',
  authenticateToken,
  [
    body('currentPassword').notEmpty().withMessage('请输入当前密码'),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('新密码至少6位'),
  ],
  authController.changePassword
);

export default router;

