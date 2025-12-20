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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshToken = exports.getCurrentUser = exports.logout = exports.getTotpStatus = exports.disableTotp = exports.confirmTotp = exports.setupTotp = exports.adminLogin = exports.loginWithPhone = exports.sendVerificationCode = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const express_validator_1 = require("express-validator");
const index_1 = require("../index");
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = require("../utils/logger");
const aliyun_sms_service_1 = require("../services/aliyun-sms.service");
const verification_code_service_1 = require("../services/verification-code.service");
const user_level_service_1 = require("../services/user-level.service");
const totp_service_1 = require("../services/totp.service");
const referralService = __importStar(require("../services/referral.service"));
// 生成JWT token
const TOKEN_TTL_DAYS = parseInt(process.env.JWT_EXPIRES_IN_DAYS || '15', 10);
const TOKEN_TTL_MS = TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
const POSITIVE_ADJECTIVES = ['灵感', '闪耀', '活力', '星辉', '卓越', '璀璨', '热忱', '光芒', '飞跃', '奋进'];
const generateToken = (userId, identifier, role) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('服务器配置错误: JWT_SECRET 未设置');
    }
    return jsonwebtoken_1.default.sign({ userId, identifier, role }, secret, { expiresIn: `${TOKEN_TTL_DAYS}d` });
};
const generateCreatorNickname = () => {
    const adjective = POSITIVE_ADJECTIVES[Math.floor(Math.random() * POSITIVE_ADJECTIVES.length)] || '灵感';
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const suffix = Array.from({ length: 4 })
        .map(() => chars[Math.floor(Math.random() * chars.length)])
        .join('');
    return `${adjective}创作者${suffix}`;
};
/**
 * 发送手机验证码
 */
exports.sendVerificationCode = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array(),
        });
    }
    const { phone } = req.body;
    // 检查发送频率
    const canSend = await verification_code_service_1.verificationCodeService.canSendCode(phone);
    if (!canSend) {
        throw new errorHandler_1.AppError('验证码发送过于频繁，请稍后再试', 429);
    }
    // 生成验证码
    const code = verification_code_service_1.verificationCodeService.generateCode();
    // 发送短信
    const sent = await aliyun_sms_service_1.aliyunSMSService.sendVerificationCode(phone, code);
    if (!sent) {
        throw new errorHandler_1.AppError('验证码发送失败，请稍后再试', 500);
    }
    // 保存验证码
    await verification_code_service_1.verificationCodeService.saveCode(phone, code);
    logger_1.logger.info(`验证码已发送到: ${phone}`);
    res.json({
        success: true,
        message: '验证码已发送',
    });
});
/**
 * 手机验证码登录/注册
 */
exports.loginWithPhone = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array(),
        });
    }
    const { phone, code, referralCode: inviteCode } = req.body;
    // 验证验证码
    const isValid = await verification_code_service_1.verificationCodeService.verifyCode(phone, code);
    if (!isValid) {
        throw new errorHandler_1.AppError('验证码错误或已过期', 401);
    }
    // 查找或创建用户
    let user = await index_1.prisma.user.findUnique({
        where: { phone },
    });
    const isNewUser = !user;
    if (!user) {
        // 首次登录，创建新用户（同时生成推荐码）
        const userReferralCode = await referralService.generateReferralCode();
        user = await index_1.prisma.user.create({
            data: {
                phone,
                nickname: generateCreatorNickname(),
                loginType: 'PHONE',
                role: 'USER',
                referralCode: userReferralCode,
            },
        });
        logger_1.logger.info(`新用户注册: ${phone}, 推荐码: ${userReferralCode}`);
        // 如果有推荐码，绑定推荐关系并发放奖励
        if (inviteCode) {
            try {
                const result = await referralService.bindReferralAndGrantBonus({
                    refereeId: user.id,
                    referralCode: inviteCode,
                });
                if (result.success) {
                    logger_1.logger.info(`[Referral] 新用户 ${user.id} 绑定推荐码 ${inviteCode} 成功`);
                }
                else {
                    logger_1.logger.warn(`[Referral] 新用户 ${user.id} 绑定推荐码失败: ${result.message}`);
                }
            }
            catch (err) {
                logger_1.logger.error(`[Referral] 绑定推荐码异常: ${err.message}`);
                // 不影响注册流程
            }
        }
    }
    else {
        // 检查用户是否被禁用
        if (!user.isActive) {
            throw new errorHandler_1.AppError('账户已被禁用，请联系管理员', 403);
        }
    }
    // 生成token
    const token = generateToken(user.id, phone, user.role);
    // 单点登录：查询并删除该用户所有已有会话，同时清除缓存
    const oldSessions = await index_1.prisma.session.findMany({
        where: { userId: user.id },
        select: { token: true },
    });
    // 清除旧 session 的 Redis 缓存（立即失效）
    if (oldSessions.length > 0) {
        const cacheKeys = oldSessions.map(s => `auth:session:${s.token.slice(-32)}`);
        try {
            await index_1.redis.del(...cacheKeys);
        }
        catch { }
        await index_1.prisma.session.deleteMany({ where: { userId: user.id } });
        // 🔒 实时踢出旧设备
        (0, index_1.forceLogoutUser)(user.id);
    }
    // 保存session
    await index_1.prisma.session.create({
        data: {
            userId: user.id,
            token,
            expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        },
    });
    // 更新最后登录时间
    await index_1.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
    });
    // 处理每日赠送积分（异步执行，不阻塞登录）
    user_level_service_1.userLevelService.processGiftCredits(user.id).then(result => {
        if (result.gifted) {
            logger_1.logger.info(`用户 ${phone} 获得每日赠送积分: ${result.amount}`);
        }
    }).catch(err => {
        logger_1.logger.warn(`用户 ${phone} 赠送积分处理失败:`, err.message);
    });
    logger_1.logger.info(`用户登录: ${phone}`);
    // 返回用户信息（不包含敏感信息）
    const { password: _, ...userWithoutPassword } = user;
    res.json({
        success: true,
        message: '登录成功',
        token,
        user: userWithoutPassword,
    });
});
/**
 * 管理员登录（用户名密码 + 可选 TOTP）
 */
exports.adminLogin = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array(),
        });
    }
    const { username, password, totpCode } = req.body;
    // 查找管理员用户
    const user = await index_1.prisma.user.findUnique({
        where: { username },
    });
    if (!user || user.loginType !== 'ADMIN') {
        throw new errorHandler_1.AppError('用户名或密码错误', 401);
    }
    // 验证密码
    if (!user.password) {
        throw new errorHandler_1.AppError('账户配置错误，请联系系统管理员', 500);
    }
    const isPasswordValid = await bcryptjs_1.default.compare(password, user.password);
    if (!isPasswordValid) {
        throw new errorHandler_1.AppError('用户名或密码错误', 401);
    }
    // 检查用户是否被禁用
    if (!user.isActive) {
        throw new errorHandler_1.AppError('账户已被禁用，请联系管理员', 403);
    }
    // 验证是否为管理员角色
    if (user.role !== 'ADMIN' && user.role !== 'INTERNAL') {
        throw new errorHandler_1.AppError('无管理员权限', 403);
    }
    // 检查是否启用了双因素认证
    if (user.totpEnabled) {
        if (!totpCode) {
            // 需要 TOTP 但未提供，返回特殊状态
            return res.json({
                success: false,
                requireTotp: true,
                message: '请输入双因素认证验证码',
            });
        }
        // 验证 TOTP
        const isTotpValid = totp_service_1.totpService.verifyToken(totpCode, user.totpSecret);
        if (!isTotpValid) {
            throw new errorHandler_1.AppError('验证码错误，请重新输入', 401);
        }
    }
    // 生成token
    const token = generateToken(user.id, username, user.role);
    // 单点登录：查询并删除该用户所有已有会话，同时清除缓存
    const oldSessions = await index_1.prisma.session.findMany({
        where: { userId: user.id },
        select: { token: true },
    });
    if (oldSessions.length > 0) {
        const cacheKeys = oldSessions.map(s => `auth:session:${s.token.slice(-32)}`);
        try {
            await index_1.redis.del(...cacheKeys);
        }
        catch { }
        await index_1.prisma.session.deleteMany({ where: { userId: user.id } });
        // 🔒 实时踢出旧设备
        (0, index_1.forceLogoutUser)(user.id);
    }
    // 保存session
    await index_1.prisma.session.create({
        data: {
            userId: user.id,
            token,
            expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        },
    });
    // 更新最后登录时间
    await index_1.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
    });
    logger_1.logger.info(`管理员登录: ${username}`);
    // 返回用户信息（不包含密码和 TOTP 密钥）
    const { password: _, totpSecret: __, ...userWithoutSensitive } = user;
    res.json({
        success: true,
        message: '登录成功',
        token,
        user: userWithoutSensitive,
    });
});
/**
 * 设置 TOTP 双因素认证（生成二维码）
 */
exports.setupTotp = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const user = req.user;
    // 只有管理员可以设置 TOTP
    if (user.role !== 'ADMIN' && user.role !== 'INTERNAL') {
        throw new errorHandler_1.AppError('无权限', 403);
    }
    const accountName = user.username || user.email || user.phone || user.id;
    const result = await totp_service_1.totpService.setupTotp(user.id, accountName);
    res.json({
        success: true,
        message: '请使用 Google Authenticator 扫描二维码',
        qrCode: result.qrCode,
        secret: result.secret, // 用于手动输入
    });
});
/**
 * 确认并激活 TOTP
 */
exports.confirmTotp = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { code } = req.body;
    const user = req.user;
    if (!code || code.length !== 6) {
        throw new errorHandler_1.AppError('请输入 6 位验证码', 400);
    }
    const success = await totp_service_1.totpService.confirmTotp(user.id, code);
    if (!success) {
        throw new errorHandler_1.AppError('验证码错误，请重新输入', 400);
    }
    res.json({
        success: true,
        message: '双因素认证已启用',
    });
});
/**
 * 禁用 TOTP
 */
exports.disableTotp = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { code } = req.body;
    const user = req.user;
    // 验证当前 TOTP
    const isValid = await totp_service_1.totpService.verifyUserTotp(user.id, code);
    if (!isValid) {
        throw new errorHandler_1.AppError('验证码错误', 400);
    }
    await totp_service_1.totpService.disableTotp(user.id);
    res.json({
        success: true,
        message: '双因素认证已禁用',
    });
});
/**
 * 获取 TOTP 状态
 */
exports.getTotpStatus = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const user = req.user;
    const enabled = await totp_service_1.totpService.isTotpEnabled(user.id);
    res.json({
        success: true,
        totpEnabled: enabled,
    });
});
/**
 * 用户登出
 */
exports.logout = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (token) {
        // 删除session
        await index_1.prisma.session.deleteMany({
            where: {
                token,
                userId: req.user.id,
            },
        });
    }
    logger_1.logger.info(`User logged out: ${req.user.identifier}`);
    res.json({
        success: true,
        message: '登出成功',
    });
});
/**
 * 获取当前用户信息
 */
exports.getCurrentUser = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const user = await index_1.prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
            id: true,
            phone: true,
            email: true,
            username: true,
            nickname: true,
            avatar: true,
            role: true,
            credits: true,
            loginType: true,
            createdAt: true,
            updatedAt: true,
            lastLoginAt: true,
            membershipExpireAt: true,
            giftStartDate: true,
        },
    });
    if (!user) {
        throw new errorHandler_1.AppError('用户不存在', 404);
    }
    // 获取有效等级（考虑会员过期）
    const effectiveRole = await user_level_service_1.userLevelService.getEffectiveUserRole(user.id);
    // 获取等级配置
    const levelConfig = await user_level_service_1.userLevelService.getUserLevelConfig(effectiveRole);
    // 获取今日赠送积分状态
    const giftStatus = await user_level_service_1.userLevelService.getGiftCreditsStatus(user.id);
    res.json({
        success: true,
        user: {
            ...user,
            effectiveRole,
            levelConfig: levelConfig ? {
                dailyGiftCredits: levelConfig.dailyGiftCredits,
                giftDays: levelConfig.giftDays,
                maxConcurrency: levelConfig.maxConcurrency,
            } : null,
            giftStatus,
        },
    });
});
/**
 * 刷新token
 */
exports.refreshToken = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const user = req.user;
    // 生成新token
    const newToken = generateToken(user.id, user.phone || user.email || user.username || '', user.role);
    // 单点登录：查询并删除该用户所有已有会话，同时清除缓存
    const oldSessions = await index_1.prisma.session.findMany({
        where: { userId: user.id },
        select: { token: true },
    });
    if (oldSessions.length > 0) {
        const cacheKeys = oldSessions.map(s => `auth:session:${s.token.slice(-32)}`);
        try {
            await index_1.redis.del(...cacheKeys);
        }
        catch { }
        await index_1.prisma.session.deleteMany({ where: { userId: user.id } });
        // 🔒 实时踢出旧设备
        (0, index_1.forceLogoutUser)(user.id);
    }
    // 保存新session
    await index_1.prisma.session.create({
        data: {
            userId: user.id,
            token: newToken,
            expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        },
    });
    res.json({
        success: true,
        token: newToken,
    });
});
//# sourceMappingURL=auth.controller.js.map