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
const authController = __importStar(require("../controllers/auth.controller"));
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const router = (0, express_1.Router)();
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
router.post('/send-code', rateLimiter_1.smsLimiter, rateLimiter_1.smsHourlyLimiter, [
    (0, express_validator_1.body)('phone')
        .matches(/^1[3-9]\d{9}$/)
        .withMessage('请输入有效的手机号码'),
], authController.sendVerificationCode);
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
router.post('/login-phone', rateLimiter_1.authLimiter, [
    (0, express_validator_1.body)('phone')
        .matches(/^1[3-9]\d{9}$/)
        .withMessage('请输入有效的手机号码'),
    (0, express_validator_1.body)('code')
        .isLength({ min: 6, max: 6 })
        .withMessage('验证码为6位数字'),
], authController.loginWithPhone);
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
router.post('/admin-login', rateLimiter_1.authLimiter, [
    (0, express_validator_1.body)('username').notEmpty().withMessage('请输入用户名'),
    (0, express_validator_1.body)('password').notEmpty().withMessage('请输入密码'),
], authController.adminLogin);
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
router.post('/logout', auth_1.authenticateToken, authController.logout);
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
router.get('/me', auth_1.authenticateToken, authController.getCurrentUser);
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
router.post('/refresh', auth_1.authenticateToken, authController.refreshToken);
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
router.post('/totp/setup', auth_1.authenticateToken, authController.setupTotp);
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
router.post('/totp/confirm', auth_1.authenticateToken, [(0, express_validator_1.body)('code').isLength({ min: 6, max: 6 }).withMessage('请输入6位验证码')], authController.confirmTotp);
/**
 * @swagger
 * /auth/totp/disable:
 *   post:
 *     summary: 禁用双因素认证
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.post('/totp/disable', auth_1.authenticateToken, [(0, express_validator_1.body)('code').isLength({ min: 6, max: 6 }).withMessage('请输入6位验证码')], authController.disableTotp);
/**
 * @swagger
 * /auth/totp/status:
 *   get:
 *     summary: 获取双因素认证状态
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.get('/totp/status', auth_1.authenticateToken, authController.getTotpStatus);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map