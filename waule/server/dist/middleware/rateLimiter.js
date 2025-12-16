"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiLimiter = exports.smsHourlyLimiter = exports.smsLimiter = exports.authLimiter = exports.generalLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const logger_1 = require("../utils/logger");
/**
 * 获取客户端 IP（兼容 IPv4/IPv6 和代理）
 */
function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const ips = typeof forwarded === 'string' ? forwarded : forwarded[0];
        return ips.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
}
/**
 * 通用 API 速率限制
 * 默认: 15分钟内最多100次请求
 */
exports.generalLimiter = (0, express_rate_limit_1.default)({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15分钟
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    validate: false, // 禁用内置验证，使用自定义 getClientIp
    message: {
        success: false,
        message: '请求过于频繁，请稍后再试',
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger_1.logger.warn(`[RateLimit] IP ${getClientIp(req)} 触发通用限流`);
        res.status(429).json({
            success: false,
            message: '请求过于频繁，请稍后再试',
        });
    },
});
/**
 * 认证相关接口速率限制（更严格）
 * 1分钟内最多10次请求（防止暴力破解）
 */
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1分钟
    max: 10,
    validate: false, // 禁用内置验证，使用自定义 getClientIp
    message: {
        success: false,
        message: '登录尝试过于频繁，请1分钟后再试',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // 使用 IP + 手机号/用户名 作为限流键
        const identifier = req.body?.phone || req.body?.username || '';
        return `${getClientIp(req)}-${identifier}`;
    },
    handler: (req, res) => {
        logger_1.logger.warn(`[RateLimit] IP ${getClientIp(req)} 触发认证限流`);
        res.status(429).json({
            success: false,
            message: '登录尝试过于频繁，请1分钟后再试',
        });
    },
});
/**
 * 验证码发送速率限制（非常严格）
 * 1分钟内最多1次，1小时内最多5次
 */
exports.smsLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1分钟
    max: 1,
    validate: false, // 禁用内置验证，使用自定义 getClientIp
    message: {
        success: false,
        message: '验证码发送过于频繁，请1分钟后再试',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // 使用 IP + 手机号 作为限流键
        return `sms-${getClientIp(req)}-${req.body?.phone || ''}`;
    },
    handler: (req, res) => {
        logger_1.logger.warn(`[RateLimit] IP ${getClientIp(req)} 触发短信限流`);
        res.status(429).json({
            success: false,
            message: '验证码发送过于频繁，请1分钟后再试',
        });
    },
});
/**
 * 每小时短信限制（防止短信轰炸）
 */
exports.smsHourlyLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1小时
    max: 5,
    validate: false, // 禁用内置验证，使用自定义 getClientIp
    message: {
        success: false,
        message: '今日验证码发送次数已达上限，请1小时后再试',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return `sms-hourly-${getClientIp(req)}-${req.body?.phone || ''}`;
    },
    handler: (req, res) => {
        logger_1.logger.warn(`[RateLimit] IP ${getClientIp(req)} 触发小时短信限流`);
        res.status(429).json({
            success: false,
            message: '今日验证码发送次数已达上限，请1小时后再试',
        });
    },
});
/**
 * AI 生成接口速率限制
 * 1分钟内最多20次请求
 */
exports.aiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1分钟
    max: 20,
    validate: false, // 禁用内置验证，使用自定义 getClientIp
    message: {
        success: false,
        message: 'AI 请求过于频繁，请稍后再试',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // 使用用户ID作为限流键（需要认证）
        return `ai-${req.user?.id || getClientIp(req)}`;
    },
    handler: (req, res) => {
        logger_1.logger.warn(`[RateLimit] 用户 ${req.user?.id || getClientIp(req)} 触发AI限流`);
        res.status(429).json({
            success: false,
            message: 'AI 请求过于频繁，请稍后再试',
        });
    },
});
exports.default = {
    generalLimiter: exports.generalLimiter,
    authLimiter: exports.authLimiter,
    smsLimiter: exports.smsLimiter,
    smsHourlyLimiter: exports.smsHourlyLimiter,
    aiLimiter: exports.aiLimiter,
};
//# sourceMappingURL=rateLimiter.js.map