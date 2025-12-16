"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = exports.authorizeRoles = exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const index_1 = require("../index");
const errorHandler_1 = require("./errorHandler");
// 更新用户活跃状态到 Redis（用于统计在线用户）
const updateUserActivity = async (userId) => {
    try {
        const key = `user:active:${userId}`;
        // 设置 5 分钟过期，如果用户 5 分钟内没有请求则自动移除
        await index_1.redis.setex(key, 300, Date.now().toString());
    }
    catch (e) {
        // Redis 错误不影响正常请求
    }
};
// 验证JWT token
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
        if (!token) {
            throw new errorHandler_1.AppError('未提供认证令牌', 401);
        }
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new errorHandler_1.AppError('服务器配置错误: JWT_SECRET 未设置', 500);
        }
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        // 🔒 单点登录验证：检查 session 是否存在（支持缓存）
        const sessionCacheKey = `auth:session:${token.slice(-32)}`; // 用 token 后32位作为 key
        let sessionValid = false;
        try {
            const cached = await index_1.redis.get(sessionCacheKey);
            if (cached === '1') {
                sessionValid = true;
            }
            else if (cached === '0') {
                // 缓存标记为无效
                throw new errorHandler_1.AppError('登录已在其他设备失效，请重新登录', 401);
            }
        }
        catch (e) {
            if (e instanceof errorHandler_1.AppError)
                throw e;
        }
        // 缓存未命中，查询数据库
        if (!sessionValid) {
            const session = await index_1.prisma.session.findFirst({
                where: {
                    token,
                    userId: decoded.userId,
                    expiresAt: { gt: new Date() },
                },
            });
            if (!session) {
                // 缓存无效状态 30 秒
                try {
                    await index_1.redis.set(sessionCacheKey, '0', 'EX', 30);
                }
                catch { }
                throw new errorHandler_1.AppError('登录已在其他设备失效，请重新登录', 401);
            }
            // 缓存有效状态 5 分钟（减少数据库查询）
            try {
                await index_1.redis.set(sessionCacheKey, '1', 'EX', 300);
            }
            catch { }
        }
        // 🚀 优化：从 Redis 缓存获取用户信息，减少数据库查询
        const cacheKey = `auth:user:${decoded.userId}`;
        let user = null;
        try {
            const cached = await index_1.redis.get(cacheKey);
            if (cached) {
                user = JSON.parse(cached);
            }
        }
        catch { }
        // 缓存未命中，查询数据库
        if (!user) {
            user = await index_1.prisma.user.findUnique({
                where: { id: decoded.userId },
                select: {
                    id: true,
                    phone: true,
                    email: true,
                    username: true,
                    role: true,
                    isActive: true,
                },
            });
            // 缓存用户信息 5 分钟（减少数据库查询）
            if (user) {
                try {
                    await index_1.redis.set(cacheKey, JSON.stringify(user), 'EX', 300);
                }
                catch { }
            }
        }
        if (!user || !user.isActive) {
            throw new errorHandler_1.AppError('用户不存在或已被禁用', 401);
        }
        req.user = {
            id: user.id,
            identifier: decoded.identifier,
            phone: user.phone || undefined,
            email: user.email || undefined,
            username: user.username || undefined,
            role: user.role,
        };
        // 更新用户活跃状态（异步，不阻塞请求）
        updateUserActivity(user.id);
        next();
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            next(new errorHandler_1.AppError('无效的认证令牌', 401));
        }
        else if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            next(new errorHandler_1.AppError('认证令牌已过期', 401));
        }
        else {
            next(error);
        }
    }
};
exports.authenticateToken = authenticateToken;
// 验证用户角色
const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        // 🔇 减少日志输出（server-metrics 每 5 秒调用一次）
        if (!req.user) {
            return next(new errorHandler_1.AppError('未认证', 401));
        }
        if (!roles.includes(req.user.role)) {
            return next(new errorHandler_1.AppError('没有权限访问此资源', 403));
        }
        next();
    };
};
exports.authorizeRoles = authorizeRoles;
// 可选认证（不强制要求登录）
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (token) {
            const secret = process.env.JWT_SECRET;
            if (!secret) {
                return next();
            }
            const decoded = jsonwebtoken_1.default.verify(token, secret);
            // 🔒 单点登录验证：检查 session 是否存在
            const sessionCacheKey = `auth:session:${token.slice(-32)}`;
            let sessionValid = false;
            try {
                const cached = await index_1.redis.get(sessionCacheKey);
                if (cached === '1')
                    sessionValid = true;
                else if (cached === '0')
                    return next(); // session 无效，跳过认证
            }
            catch { }
            if (!sessionValid) {
                const session = await index_1.prisma.session.findFirst({
                    where: {
                        token,
                        userId: decoded.userId,
                        expiresAt: { gt: new Date() },
                    },
                });
                if (!session) {
                    try {
                        await index_1.redis.set(sessionCacheKey, '0', 'EX', 30);
                    }
                    catch { }
                    return next(); // session 无效，跳过认证
                }
                try {
                    await index_1.redis.set(sessionCacheKey, '1', 'EX', 300);
                }
                catch { }
            }
            // 🚀 优化：使用缓存
            const cacheKey = `auth:user:${decoded.userId}`;
            let user = null;
            try {
                const cached = await index_1.redis.get(cacheKey);
                if (cached)
                    user = JSON.parse(cached);
            }
            catch { }
            if (!user) {
                user = await index_1.prisma.user.findUnique({
                    where: { id: decoded.userId },
                    select: {
                        id: true,
                        phone: true,
                        email: true,
                        username: true,
                        role: true,
                        isActive: true,
                    },
                });
                if (user) {
                    try {
                        await index_1.redis.set(cacheKey, JSON.stringify(user), 'EX', 300);
                    }
                    catch { }
                }
            }
            if (user && user.isActive) {
                req.user = {
                    id: user.id,
                    identifier: decoded.identifier,
                    phone: user.phone || undefined,
                    email: user.email || undefined,
                    username: user.username || undefined,
                    role: user.role,
                };
            }
        }
        next();
    }
    catch (error) {
        // 可选认证失败不报错，继续处理
        next();
    }
};
exports.optionalAuth = optionalAuth;
exports.default = {
    authenticateToken: exports.authenticateToken,
    authorizeRoles: exports.authorizeRoles,
    optionalAuth: exports.optionalAuth,
};
//# sourceMappingURL=auth.js.map