"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = exports.redis = exports.prisma = void 0;
exports.forceLogoutUser = forceLogoutUser;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const compression_1 = __importDefault(require("compression"));
// Swagger 仅在开发环境加载
let swaggerUi, swaggerJsdoc;
if (process.env.NODE_ENV !== 'production') {
    swaggerUi = require('swagger-ui-express');
    swaggerJsdoc = require('swagger-jsdoc');
}
const client_1 = require("@prisma/client");
const ioredis_1 = __importDefault(require("ioredis"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const redis_adapter_1 = require("@socket.io/redis-adapter");
// 加载环境变量
dotenv_1.default.config();
// 导入路由
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const project_routes_1 = __importDefault(require("./routes/project.routes"));
const episode_routes_1 = __importDefault(require("./routes/episode.routes"));
const workflow_routes_1 = __importDefault(require("./routes/workflow.routes"));
const asset_routes_1 = __importDefault(require("./routes/asset.routes"));
const asset_library_routes_1 = __importDefault(require("./routes/asset-library.routes"));
const ai_routes_1 = __importDefault(require("./routes/ai.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const agent_routes_1 = __importDefault(require("./routes/agent.routes"));
const agent_role_routes_1 = __importDefault(require("./routes/agent-role.routes"));
const document_routes_1 = __importDefault(require("./routes/document.routes"));
const midjourney_routes_1 = __importDefault(require("./routes/midjourney.routes"));
const translation_routes_1 = __importDefault(require("./routes/translation.routes"));
const task_routes_1 = __importDefault(require("./routes/task.routes"));
const billing_routes_1 = __importDefault(require("./routes/billing.routes"));
const proxy_routes_1 = __importDefault(require("./routes/proxy.routes"));
const sora_character_routes_1 = __importDefault(require("./routes/sora-character.routes"));
const payment_routes_1 = __importDefault(require("./routes/payment.routes"));
const redeem_routes_1 = __importDefault(require("./routes/redeem.routes"));
const user_level_routes_1 = __importDefault(require("./routes/user-level.routes"));
const node_prompt_routes_1 = __importDefault(require("./routes/node-prompt.routes"));
const referral_routes_1 = __importDefault(require("./routes/referral.routes"));
const message_routes_1 = __importDefault(require("./routes/message.routes"));
// 导入中间件
const errorHandler_1 = require("./middleware/errorHandler");
const logger_1 = require("./utils/logger");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
// 初始化数据库和Redis（优化连接池配置）
exports.prisma = new client_1.PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
});
// Prisma 中间件：记录慢查询
exports.prisma.$use(async (params, next) => {
    const start = Date.now();
    const result = await next(params);
    const duration = Date.now() - start;
    if (duration > 1000) {
        logger_1.logger.warn(`[Prisma] 慢查询警告: ${params.model}.${params.action} 耗时 ${duration}ms`);
    }
    return result;
});
exports.redis = new ioredis_1.default(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 50, 2000),
    lazyConnect: true, // 延迟连接，不在创建时立即连接
});
// 静默处理 Redis 连接错误，不影响服务器启动
exports.redis.on('error', (err) => {
    logger_1.logger.warn('Redis 连接失败（非致命错误）:', err.message);
});
// 创建Express应用
const app = (0, express_1.default)();
// 创建HTTP服务器
const httpServer = (0, http_1.createServer)(app);
// 禁用 ETag，避免 304 返回导致前端拿不到 JSON 体
app.set('etag', false);
const PORT = parseInt(process.env.PORT || '3000', 10);
const API_PREFIX = process.env.API_PREFIX || '/api';
// Socket.io 配置
exports.io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            // 允许所有源连接（开发环境）
            callback(null, true);
        },
        credentials: true,
    },
});
// 🚀 PM2 集群模式：配置 Socket.io Redis Adapter 实现跨进程通信
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const pubClient = new ioredis_1.default(redisUrl);
const subClient = pubClient.duplicate();
Promise.all([pubClient.ping(), subClient.ping()])
    .then(() => {
    exports.io.adapter((0, redis_adapter_1.createAdapter)(pubClient, subClient));
    logger_1.logger.info('[Socket.io] Redis Adapter 已启用，支持集群模式');
})
    .catch((err) => {
    logger_1.logger.warn('[Socket.io] Redis Adapter 启用失败，Socket 跨进程通信将不可用:', err.message);
});
// 🚀 Socket.io JWT 认证中间件（带 Redis 缓存优化）
exports.io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
        if (!token) {
            logger_1.logger.warn(`[Socket] 连接被拒绝: 未提供认证令牌 ${socket.id}`);
            return next(new Error('未提供认证令牌'));
        }
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            logger_1.logger.error('[Socket] JWT_SECRET 未配置');
            return next(new Error('服务器配置错误'));
        }
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        // 🔧 优先从 Redis 缓存获取用户信息（避免每次连接都查询数据库）
        const cacheKey = `socket:user:${decoded.userId}`;
        let user = null;
        try {
            const cached = await exports.redis.get(cacheKey);
            if (cached) {
                user = JSON.parse(cached);
            }
        }
        catch {
            // Redis 不可用，继续查询数据库
        }
        // 缓存未命中，查询数据库
        if (!user) {
            user = await exports.prisma.user.findUnique({
                where: { id: decoded.userId },
                // 🔧 修复：添加 nickname 和 avatar 字段用于在线用户列表显示
                select: { id: true, isActive: true, role: true, nickname: true, avatar: true },
            });
            // 缓存用户信息 5 分钟
            if (user) {
                try {
                    await exports.redis.set(cacheKey, JSON.stringify(user), 'EX', 300);
                }
                catch {
                    // Redis 写入失败，忽略
                }
            }
        }
        if (!user || !user.isActive) {
            logger_1.logger.warn(`[Socket] 连接被拒绝: 用户不存在或已禁用 ${decoded.userId}`);
            return next(new Error('用户不存在或已被禁用'));
        }
        // 将用户信息附加到 socket
        socket.user = { id: user.id, role: user.role };
        // 🔇 减少日志输出，仅在 debug 模式下记录
        if (process.env.LOG_LEVEL === 'debug') {
            logger_1.logger.info(`[Socket] 用户 ${user.id} 认证成功`);
        }
        next();
    }
    catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            logger_1.logger.warn(`[Socket] 连接被拒绝: 令牌无效或过期`);
            return next(new Error('认证令牌无效或已过期'));
        }
        logger_1.logger.error(`[Socket] 认证错误:`, error.message);
        next(new Error('认证失败'));
    }
});
// 🚀 使用 Redis 存储在线用户（支持 PM2 集群模式）
const ONLINE_USERS_PREFIX = 'workflow:online:';
const ONLINE_USER_TTL = 3600; // 1小时过期（防止僵尸数据）
// 添加在线用户到 Redis
async function addOnlineUser(workflowId, user) {
    try {
        const key = `${ONLINE_USERS_PREFIX}${workflowId}`;
        await exports.redis.hset(key, user.socketId, JSON.stringify(user));
        await exports.redis.expire(key, ONLINE_USER_TTL);
    }
    catch (e) {
        logger_1.logger.warn('Redis addOnlineUser failed:', e);
    }
}
// 从 Redis 移除在线用户
async function removeOnlineUser(workflowId, socketId) {
    try {
        const key = `${ONLINE_USERS_PREFIX}${workflowId}`;
        await exports.redis.hdel(key, socketId);
    }
    catch (e) {
        logger_1.logger.warn('Redis removeOnlineUser failed:', e);
    }
}
// 获取指定工作流的在线用户列表（从 Redis）
async function getOnlineUsers(workflowId) {
    try {
        const key = `${ONLINE_USERS_PREFIX}${workflowId}`;
        const data = await exports.redis.hgetall(key);
        if (!data || Object.keys(data).length === 0)
            return [];
        // 解析并去重（同一用户可能有多个连接）
        const uniqueUsers = new Map();
        Object.values(data).forEach(json => {
            try {
                const u = JSON.parse(json);
                if (!uniqueUsers.has(u.id)) {
                    uniqueUsers.set(u.id, u);
                }
            }
            catch { }
        });
        return Array.from(uniqueUsers.values());
    }
    catch (e) {
        logger_1.logger.warn('Redis getOnlineUsers failed:', e);
        return [];
    }
}
// 广播在线用户列表
async function broadcastOnlineUsers(workflowId) {
    const users = await getOnlineUsers(workflowId);
    exports.io.to(`workflow:${workflowId}`).emit('users:online', { users });
}
// Socket.io 连接处理
exports.io.on('connection', (socket) => {
    const user = socket.user;
    // 🔇 减少连接日志
    if (process.env.LOG_LEVEL === 'debug') {
        logger_1.logger.info(`[Socket] 新连接: ${socket.id} (用户: ${user?.id})`);
    }
    // 🔒 单点登录：加入用户专属房间（用于强制退出通知）
    if (user?.id) {
        socket.join(`user:${user.id}`);
    }
    // 🚀 加入工作流房间（带缓存优化）
    socket.on('join-workflow', async (workflowId) => {
        // 🔧 优先从 Redis 缓存检查权限
        const permissionCacheKey = `workflow:permission:${workflowId}:${user.id}`;
        let hasAccess = false;
        try {
            const cachedPermission = await exports.redis.get(permissionCacheKey);
            if (cachedPermission === '1') {
                hasAccess = true;
            }
            else if (cachedPermission === '0') {
                // 明确无权限
                if (user.role !== 'ADMIN') {
                    socket.emit('error', { message: '无权访问该工作流' });
                    return;
                }
                hasAccess = true;
            }
        }
        catch {
            // Redis 不可用，继续查询数据库
        }
        // 缓存未命中，查询数据库
        if (!hasAccess) {
            const workflow = await exports.prisma.workflow.findFirst({
                where: {
                    id: workflowId,
                    OR: [
                        { userId: user.id },
                        { shares: { some: { targetUserId: user.id } } },
                    ],
                },
                select: { id: true }, // 🔧 只查询 id，减少数据传输
            });
            hasAccess = !!workflow || user.role === 'ADMIN';
            // 缓存权限结果 10 分钟
            try {
                await exports.redis.set(permissionCacheKey, hasAccess ? '1' : '0', 'EX', 600);
            }
            catch {
                // Redis 写入失败，忽略
            }
        }
        if (!hasAccess) {
            logger_1.logger.warn(`[Socket] ${socket.id} 无权加入房间: workflow:${workflowId}`);
            socket.emit('error', { message: '无权访问该工作流' });
            return;
        }
        if (process.env.LOG_LEVEL === 'debug') {
            logger_1.logger.info(`[Socket] ${socket.id} 加入房间: workflow:${workflowId}`);
        }
        socket.join(`workflow:${workflowId}`);
        // 🔧 从 Socket 认证时已缓存的用户信息获取（避免再次查询）
        const userCacheKey = `socket:user:${user.id}`;
        let userInfo = null;
        try {
            const cached = await exports.redis.get(userCacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                userInfo = { id: parsed.id, nickname: parsed.nickname, avatar: parsed.avatar };
            }
        }
        catch {
            // 缓存读取失败
        }
        // 缓存未命中，查询数据库
        if (!userInfo) {
            const dbUser = await exports.prisma.user.findUnique({
                where: { id: user.id },
                select: { id: true, nickname: true, avatar: true }
            });
            if (dbUser) {
                userInfo = { id: dbUser.id, nickname: dbUser.nickname || undefined, avatar: dbUser.avatar || undefined };
            }
        }
        if (userInfo) {
            // 记录用户当前所在的工作流（用于 disconnect 时清理）
            socket.currentWorkflowId = workflowId;
            // 🚀 添加到 Redis 在线用户列表
            await addOnlineUser(workflowId, {
                id: userInfo.id,
                socketId: socket.id,
                nickname: userInfo.nickname || undefined,
                avatar: userInfo.avatar || undefined,
                joinedAt: new Date(),
            });
            // 广播更新后的在线用户列表
            await broadcastOnlineUsers(workflowId);
        }
    });
    // 离开工作流房间
    socket.on('leave-workflow', async (workflowId) => {
        logger_1.logger.debug(`[Socket] ${socket.id} 离开房间: workflow:${workflowId}`);
        socket.leave(`workflow:${workflowId}`);
        // 🚀 从 Redis 在线用户列表中移除
        await removeOnlineUser(workflowId, socket.id);
        await broadcastOnlineUsers(workflowId);
        socket.currentWorkflowId = null;
    });
    // 所有者广播工作流更新信号（保留旧接口兼容）
    socket.on('workflow-updated', (workflowId) => {
        logger_1.logger.debug(`[Socket] ${socket.id} 广播更新到房间: workflow:${workflowId}`); // 🔧 改为 debug 级别减少日志量
        socket.to(`workflow:${workflowId}`).emit('workflow-changed', { workflowId });
    });
    // ========== 实时协作事件 ==========
    // 节点添加
    socket.on('node:add', (data) => {
        logger_1.logger.debug(`[Socket] node:add 房间: workflow:${data.workflowId}`);
        socket.to(`workflow:${data.workflowId}`).emit('node:add', {
            node: data.node,
            userId: user.id
        });
    });
    // 节点更新（内容变更）
    socket.on('node:update', (data) => {
        logger_1.logger.debug(`[Socket] node:update 房间: workflow:${data.workflowId}, 节点: ${data.nodeId}`);
        socket.to(`workflow:${data.workflowId}`).emit('node:update', {
            nodeId: data.nodeId,
            changes: data.changes,
            userId: user.id
        });
    });
    // 节点删除
    socket.on('node:delete', (data) => {
        logger_1.logger.debug(`[Socket] node:delete 房间: workflow:${data.workflowId}, 节点: ${data.nodeId}`);
        socket.to(`workflow:${data.workflowId}`).emit('node:delete', {
            nodeId: data.nodeId,
            userId: user.id
        });
    });
    // 节点移动（位置变更）
    socket.on('node:move', (data) => {
        // 位置变更频繁，不记录日志
        socket.to(`workflow:${data.workflowId}`).emit('node:move', {
            nodeId: data.nodeId,
            position: data.position,
            userId: user.id
        });
    });
    // 批量节点移动（多选拖动）
    socket.on('nodes:move', (data) => {
        socket.to(`workflow:${data.workflowId}`).emit('nodes:move', {
            nodes: data.nodes,
            userId: user.id
        });
    });
    // 边添加
    socket.on('edge:add', (data) => {
        logger_1.logger.debug(`[Socket] edge:add 房间: workflow:${data.workflowId}`);
        socket.to(`workflow:${data.workflowId}`).emit('edge:add', {
            edge: data.edge,
            userId: user.id
        });
    });
    // 边删除
    socket.on('edge:delete', (data) => {
        logger_1.logger.debug(`[Socket] edge:delete 房间: workflow:${data.workflowId}, 边: ${data.edgeId}`);
        socket.to(`workflow:${data.workflowId}`).emit('edge:delete', {
            edgeId: data.edgeId,
            userId: user.id
        });
    });
    // 编组更新
    socket.on('groups:update', (data) => {
        logger_1.logger.debug(`[Socket] groups:update 房间: workflow:${data.workflowId}, 编组数: ${data.groups.length}`);
        socket.to(`workflow:${data.workflowId}`).emit('groups:update', {
            groups: data.groups,
            userId: user.id
        });
    });
    // 用户加入/离开通知
    socket.on('user:join', async (data) => {
        const userInfo = await exports.prisma.user.findUnique({
            where: { id: user.id },
            select: { id: true, nickname: true, avatar: true }
        });
        socket.to(`workflow:${data.workflowId}`).emit('user:join', {
            user: userInfo
        });
    });
    socket.on('disconnect', async () => {
        logger_1.logger.debug(`[Socket] 断开连接: ${socket.id} (用户: ${user?.id})`);
        // 🚀 清理 Redis 在线用户列表
        const workflowId = socket.currentWorkflowId;
        if (workflowId) {
            await removeOnlineUser(workflowId, socket.id);
            await broadcastOnlineUsers(workflowId);
        }
    });
});
// 🔒 单点登录：强制踢出用户的所有其他连接
async function forceLogoutUser(userId, reason = '您的账号已在其他设备登录') {
    exports.io.to(`user:${userId}`).emit('force-logout', { reason });
    logger_1.logger.info(`[Socket] 强制退出用户: ${userId}`);
}
// Swagger配置（仅开发环境）
let swaggerSpec;
if (process.env.NODE_ENV !== 'production' && swaggerJsdoc) {
    const swaggerOptions = {
        definition: {
            openapi: '3.0.0',
            info: {
                title: 'Waule API',
                version: '1.0.0',
                description: 'AI视频短剧制作平台 API 文档',
                contact: {
                    name: 'Waule Team',
                    email: 'support@waule.ai',
                },
            },
            servers: [
                {
                    url: `http://localhost:${PORT}${API_PREFIX}`,
                    description: '开发服务器',
                },
            ],
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                    },
                },
            },
            security: [
                {
                    bearerAuth: [],
                },
            ],
        },
        apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
    };
    swaggerSpec = swaggerJsdoc(swaggerOptions);
}
// 中间件配置
// CORS配置：开发环境允许所有源，生产环境使用白名单
const isDevelopment = process.env.NODE_ENV !== 'production';
const allowAllCors = String(process.env.ALLOW_ALL_CORS || '').toLowerCase() === 'true';
const extraOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
const allowedOrigins = [
    'http://localhost:8088',
    'http://127.0.0.1:8088',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    process.env.CORS_ORIGIN,
    ...extraOrigins,
].filter(Boolean);
const corsOptions = {
    origin: (origin, callback) => {
        // 生产环境禁止全域 CORS
        if (allowAllCors && isDevelopment) {
            return callback(null, true);
        }
        // 空 Origin 处理
        // 同源请求（如 waule.ai -> waule.ai/api）浏览器不发送 Origin 头
        // nginx 反代场景下允许空 Origin
        if (!origin) {
            return callback(null, true);
        }
        // 开发环境：允许本地网络和允许的域名
        if (isDevelopment) {
            const isLocalNetwork = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin);
            const isAllowedDomain = /^https?:\/\/([a-zA-Z0-9-]+\.)?waule\.ai(:\d+)?$/.test(origin);
            if (isLocalNetwork || isAllowedDomain || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
        }
        // 生产环境：仅允许白名单和允许的域名
        const isAllowedDomain = /^https?:\/\/([a-zA-Z0-9-]+\.)?waule\.ai(:\d+)?$/.test(origin);
        if (isAllowedDomain || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        logger_1.logger.warn(`CORS阻止的源: ${origin}`);
        callback(new Error('CORS策略不允许该源'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    optionsSuccessStatus: 204,
    maxAge: 86400, // 预检请求缓存24小时
};
app.use((0, cors_1.default)(corsOptions));
app.options('*', (0, cors_1.default)(corsOptions));
// 安全头配置（生产环境启用）
if (process.env.NODE_ENV === 'production') {
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: false, // API 服务器不需要 CSP
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    }));
    logger_1.logger.info('已启用 Helmet 安全头');
}
// gzip 压缩，降低公网传输体积
app.use((0, compression_1.default)());
// 全局速率限制（创作平台操作频繁，禁用全局限制）
// 敏感接口（登录、短信）仍有单独限制
// if (process.env.NODE_ENV === 'production') {
//   app.use(generalLimiter);
//   logger.info('已启用全局速率限制');
// }
// 启动时确保关键索引与扩展存在（提升分页与搜索性能）
async function ensureIndexes() {
    try {
        await exports.prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    }
    catch (e) {
        logger_1.logger.warn(`pg_trgm 扩展创建失败或已存在: ${e.message}`);
    }
    const statements = [
        // 项目列表常用索引
        `CREATE INDEX IF NOT EXISTS idx_projects_user_updated_id ON projects ("userId", "updatedAt" DESC, "id" DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_projects_user_type_status_updated ON projects ("userId", type, status, "updatedAt" DESC)`,
        // 项目搜索索引
        `CREATE INDEX IF NOT EXISTS idx_projects_name_trgm ON projects USING gin (name gin_trgm_ops)`,
        `CREATE INDEX IF NOT EXISTS idx_projects_desc_trgm ON projects USING gin (description gin_trgm_ops)`,
        // 关联表索引（计数/聚合更快）
        `CREATE INDEX IF NOT EXISTS idx_episodes_project ON episodes ("projectId", "updatedAt" DESC, "id" DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_workflows_project ON workflows ("projectId", "updatedAt" DESC, "id" DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_assets_project ON assets ("projectId", "createdAt" DESC, "id" DESC)`,
    ];
    for (const sql of statements) {
        try {
            await exports.prisma.$executeRawUnsafe(sql);
        }
        catch (e) {
            logger_1.logger.warn(`索引创建失败或已存在: ${sql} -> ${e.message}`);
        }
    }
    logger_1.logger.info('数据库索引与扩展检查完成');
}
// 请求体大小限制（视频生成可能包含 base64 图片，需要较大限制）
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express_1.default.static('uploads', {
    etag: true,
    maxAge: isDevelopment ? 0 : '7d',
    immutable: false,
}));
app.use('/images', express_1.default.static('public/images', {
    etag: true,
    maxAge: isDevelopment ? 0 : '30d',
    immutable: true,
}));
// HTTP请求日志
app.use(logger_1.httpLogger);
// Swagger文档（仅开发环境）
if (isDevelopment && swaggerUi && swaggerSpec) {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
// 健康检查
app.get('/health', async (req, res) => {
    try {
        // 检查数据库连接
        await exports.prisma.$queryRaw `SELECT 1`;
        // 检查Redis连接（可选）
        let redisStatus = 'disconnected';
        try {
            await exports.redis.ping();
            redisStatus = 'connected';
        }
        catch (redisError) {
            redisStatus = 'disconnected';
        }
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            database: 'connected',
            redis: redisStatus,
        });
    }
    catch (error) {
        logger_1.logger.error('Health check failed:', error);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Service unavailable',
        });
    }
});
// API路由
app.use(`${API_PREFIX}/auth`, auth_routes_1.default);
app.use(`${API_PREFIX}/users`, user_routes_1.default);
app.use(`${API_PREFIX}/projects`, project_routes_1.default);
app.use(`${API_PREFIX}`, episode_routes_1.default);
app.use(`${API_PREFIX}/workflows`, workflow_routes_1.default);
app.use(`${API_PREFIX}/assets`, asset_routes_1.default);
app.use(`${API_PREFIX}/asset-libraries`, asset_library_routes_1.default);
app.use(`${API_PREFIX}/ai`, ai_routes_1.default);
app.use(`${API_PREFIX}/admin`, admin_routes_1.default);
app.use(`${API_PREFIX}/agents`, agent_routes_1.default);
app.use(`${API_PREFIX}/agent-roles`, agent_role_routes_1.default);
app.use(`${API_PREFIX}/documents`, document_routes_1.default);
app.use(`${API_PREFIX}/midjourney`, midjourney_routes_1.default);
app.use(`${API_PREFIX}/translation`, translation_routes_1.default);
app.use(`${API_PREFIX}/tasks`, task_routes_1.default);
app.use(`${API_PREFIX}/billing`, billing_routes_1.default); // 普通用户的billing功能
app.use(`${API_PREFIX}/admin/billing`, billing_routes_1.default); // 管理员的billing功能（兼容旧路径）
app.use(`${API_PREFIX}/proxy`, proxy_routes_1.default); // 代理路由（解决CORS问题）
app.use(`${API_PREFIX}/sora-characters`, sora_character_routes_1.default); // Sora角色管理
app.use(`${API_PREFIX}/payment`, payment_routes_1.default); // 支付与充值
app.use(`${API_PREFIX}/redeem`, redeem_routes_1.default); // 兑换码
app.use(`${API_PREFIX}/admin/user-levels`, user_level_routes_1.default); // 用户等级权限管理
app.use(API_PREFIX, node_prompt_routes_1.default); // 节点提示词管理
app.use(`${API_PREFIX}/referral`, referral_routes_1.default); // 推荐返利系统
app.use(`${API_PREFIX}/messages`, message_routes_1.default); // 站内消息系统
// 404处理
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: '请求的资源不存在',
        path: req.originalUrl,
    });
});
// 启动索引与扩展检查（异步执行，不阻塞启动）
(async () => {
    try {
        await ensureIndexes();
    }
    catch (e) {
        logger_1.logger.warn(`ensureIndexes 执行失败: ${e.message}`);
    }
})();
// 错误处理中间件
app.use(errorHandler_1.errorHandler);
// 🚀 定时任务：清理过期 Session 和监控内存
let cleanupInterval = null;
let memoryCheckInterval = null;
const startScheduledTasks = () => {
    // 每小时清理过期 Session
    cleanupInterval = setInterval(async () => {
        try {
            const deleted = await exports.prisma.session.deleteMany({
                where: { expiresAt: { lt: new Date() } },
            });
            if (deleted.count > 0) {
                logger_1.logger.info(`[定时任务] 已清理 ${deleted.count} 个过期 Session`);
            }
            // 🔧 清理过期的 Redis 缓存统计
            try {
                const cacheInfo = await exports.redis.dbsize();
                if (cacheInfo > 10000) {
                    logger_1.logger.warn(`[Redis] 缓存条目较多: ${cacheInfo}`);
                }
            }
            catch { }
        }
        catch (err) {
            logger_1.logger.error(`[定时任务] 执行失败: ${err.message}`);
        }
    }, 60 * 60 * 1000); // 1小时
    // 🔧 每 2 分钟检查内存使用（更频繁以便及时发现问题）
    memoryCheckInterval = setInterval(() => {
        const used = process.memoryUsage();
        const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
        const rssMB = Math.round(used.rss / 1024 / 1024);
        const externalMB = Math.round(used.external / 1024 / 1024);
        // 🚨 分级内存管理，提前触发 GC 避免被 PM2 强制重启
        // PM2 max_memory_restart = 1200MB (RSS)，需要在 RSS 接近之前主动清理
        if (rssMB > 1000 || heapUsedMB > 800) {
            // RSS 超过 1000MB 或堆超过 800MB：立即触发 GC
            logger_1.logger.error(`[内存告警] 内存过高！堆: ${heapUsedMB}MB, RSS: ${rssMB}MB，正在触发 GC...`);
            if (global.gc) {
                global.gc();
                // GC 后再次检查
                const afterGC = process.memoryUsage();
                const afterHeapMB = Math.round(afterGC.heapUsed / 1024 / 1024);
                const afterRssMB = Math.round(afterGC.rss / 1024 / 1024);
                logger_1.logger.info(`[内存告警] GC 完成，堆: ${heapUsedMB}MB -> ${afterHeapMB}MB, RSS: ${rssMB}MB -> ${afterRssMB}MB`);
            }
            else {
                logger_1.logger.warn('[内存告警] global.gc 不可用，请确保启动参数包含 --expose-gc');
            }
        }
        else if (rssMB > 800 || heapUsedMB > 600) {
            // RSS 超过 800MB 或堆超过 600MB：警告并尝试 GC
            logger_1.logger.warn(`[内存监控] 内存较高，堆: ${heapUsedMB}MB, RSS: ${rssMB}MB，尝试 GC...`);
            if (global.gc) {
                global.gc();
            }
        }
        // 正常情况下不打印日志，减少噪音
    }, 2 * 60 * 1000); // 2分钟
    // 🧹 启动僵尸任务定时清理（每5分钟检查，超过30分钟未完成的任务自动取消并退款）
    const taskService = require('./services/task.service').default;
    taskService.startZombieCleanupScheduler(5, 30);
    // 🗑️ OSS 存储清理任务（每天凌晨 3 点执行）
    const scheduleStorageCleanup = () => {
        const now = new Date();
        const nextRun = new Date();
        nextRun.setHours(3, 0, 0, 0); // 凌晨 3 点
        if (nextRun <= now) {
            nextRun.setDate(nextRun.getDate() + 1); // 如果今天已过 3 点，则明天执行
        }
        const delay = nextRun.getTime() - now.getTime();
        logger_1.logger.info(`[StorageCleanup] 下次清理时间: ${nextRun.toLocaleString()}, ${Math.round(delay / 1000 / 60)} 分钟后`);
        setTimeout(async () => {
            try {
                const { runStorageCleanup } = require('./services/storage-cleanup.service');
                logger_1.logger.info('[StorageCleanup] 开始执行 OSS 存储清理...');
                const result = await runStorageCleanup();
                logger_1.logger.info(`[StorageCleanup] 清理完成: 删除=${result.totalDeleted}, 失败=${result.totalFailed}, 耗时=${result.durationMs}ms`);
            }
            catch (err) {
                logger_1.logger.error(`[StorageCleanup] 执行失败: ${err.message}`);
            }
            // 递归调度下一次
            scheduleStorageCleanup();
        }, delay);
    };
    scheduleStorageCleanup();
};
// 启动服务器
const startServer = async () => {
    try {
        // 测试数据库连接
        await exports.prisma.$connect();
        logger_1.logger.info('数据库连接成功');
        // 尝试连接Redis（非必需）
        try {
            await exports.redis.connect();
            await exports.redis.ping();
            logger_1.logger.info('Redis连接成功');
        }
        catch (redisError) {
            logger_1.logger.warn('Redis 连接失败，将继续启动服务器（某些功能可能受限）');
        }
        // 启动服务器 - 监听所有网络接口以支持WSL
        httpServer.listen(PORT, '0.0.0.0', () => {
            logger_1.logger.info(`服务器运行在 http://localhost:${PORT}`);
            logger_1.logger.info(`API文档地址: http://localhost:${PORT}/api-docs`);
            logger_1.logger.info(`Socket.io 已启用`);
            logger_1.logger.info(`环境: ${process.env.NODE_ENV || 'development'}`);
            // 启动定时任务
            startScheduledTasks();
            logger_1.logger.info('定时任务已启动');
            // 🚀 PM2 集群模式：发送就绪信号
            if (process.send) {
                process.send('ready');
                logger_1.logger.info('[PM2] 已发送就绪信号');
            }
        });
        // HTTP 超时配置（防止 Slowloris 攻击，但保留足够时间给长轮询/AI生成）
        httpServer.setTimeout(300000); // 5分钟总超时
        httpServer.headersTimeout = 60000; // 1分钟请求头超时
        httpServer.requestTimeout = 300000; // 5分钟请求体超时
    }
    catch (error) {
        logger_1.logger.error('服务器启动失败:', error);
        process.exit(1);
    }
};
// 🚀 优雅关闭（支持 PM2 集群模式）
const gracefulShutdown = async () => {
    logger_1.logger.info('正在关闭服务器...');
    try {
        // 清理定时任务
        if (cleanupInterval) {
            clearInterval(cleanupInterval);
        }
        if (memoryCheckInterval) {
            clearInterval(memoryCheckInterval);
        }
        logger_1.logger.info('定时任务已停止');
        // 停止接受新连接
        httpServer.close(() => {
            logger_1.logger.info('HTTP 服务器已关闭');
        });
        // 关闭所有 Socket 连接
        exports.io.close(() => {
            logger_1.logger.info('Socket.io 已关闭');
        });
        await exports.prisma.$disconnect();
        logger_1.logger.info('数据库连接已关闭');
        exports.redis.disconnect();
        logger_1.logger.info('Redis连接已关闭');
        // 等待一小段时间确保所有资源释放
        setTimeout(() => {
            process.exit(0);
        }, 1000);
    }
    catch (error) {
        logger_1.logger.error('关闭服务器时出错:', error);
        process.exit(1);
    }
};
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('uncaughtException', (err) => {
    logger_1.logger.error(`未捕获异常: ${err.message}`);
});
process.on('unhandledRejection', (reason) => {
    const msg = typeof reason === 'string' ? reason : reason?.message || '未知原因';
    logger_1.logger.error(`未处理的Promise拒绝: ${msg}`);
});
// 启动
startServer();
exports.default = app;
//# sourceMappingURL=index.js.map