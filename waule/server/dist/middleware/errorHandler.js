"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = exports.errorHandler = exports.AppError = void 0;
const logger_1 = require("../utils/logger");
// 敏感字段列表（日志中应隐藏）
const SENSITIVE_FIELDS = [
    'password',
    'currentPassword',
    'newPassword',
    'token',
    'accessToken',
    'refreshToken',
    'apiKey',
    'secret',
    'privateKey',
    'creditCard',
    'cvv',
    'ssn',
    'code', // 验证码
];
/**
 * 对请求体进行脱敏处理
 */
function sanitizeBody(body) {
    if (!body || typeof body !== 'object') {
        return body;
    }
    const sanitized = Array.isArray(body) ? [] : {};
    for (const key of Object.keys(body)) {
        const lowerKey = key.toLowerCase();
        // 检查是否为敏感字段
        if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))) {
            sanitized[key] = '[REDACTED]';
        }
        else if (typeof body[key] === 'object' && body[key] !== null) {
            sanitized[key] = sanitizeBody(body[key]);
        }
        else {
            sanitized[key] = body[key];
        }
    }
    return sanitized;
}
// 自定义错误类
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
// 错误处理中间件
const errorHandler = (err, req, res, next) => {
    let statusCode = 500;
    let message = '服务器内部错误';
    let isOperational = false;
    if (err instanceof AppError) {
        statusCode = err.statusCode;
        message = err.message;
        isOperational = err.isOperational;
    }
    // 记录错误日志（敏感信息已脱敏）
    if (statusCode >= 500) {
        logger_1.logger.error('Server Error:', {
            message: err.message,
            stack: err.stack,
            url: req.originalUrl,
            method: req.method,
            body: sanitizeBody(req.body), // 脱敏处理
            user: req.user?.id,
        });
    }
    else {
        logger_1.logger.warn('Client Error:', {
            message: err.message,
            url: req.originalUrl,
            method: req.method,
            body: sanitizeBody(req.body), // 脱敏处理
        });
    }
    // 返回错误响应（生产环境隐藏详细错误信息）
    const isDev = process.env.NODE_ENV === 'development';
    res.status(statusCode).json({
        success: false,
        message: isDev || statusCode < 500 ? message : '服务器内部错误，请稍后重试',
        ...(isDev && {
            error: err.message,
            stack: err.stack,
        }),
    });
};
exports.errorHandler = errorHandler;
// 异步错误处理包装器
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
exports.default = exports.errorHandler;
//# sourceMappingURL=errorHandler.js.map