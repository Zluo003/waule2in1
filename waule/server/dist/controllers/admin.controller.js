"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAssetLibraryAssets = exports.getUserAssetLibraries = exports.getUserWorkflows = exports.cancelTask = exports.refundTask = exports.getTaskStats = exports.getTasks = exports.getServerMetrics = exports.getStatistics = exports.updateSettings = exports.getSettings = exports.deleteAIModel = exports.updateAIModel = exports.createAIModel = exports.upsertModelCapabilities = exports.getAIPresets = exports.getAllAIModels = exports.deleteUser = exports.updateUser = exports.getAllUsers = void 0;
const index_1 = require("../index");
const errorHandler_1 = require("../middleware/errorHandler");
const express_validator_1 = require("express-validator");
const ai_models_presets_1 = require("../config/ai-models-presets");
const os_1 = __importDefault(require("os"));
const child_process_1 = require("child_process");
const util_1 = require("util");
// 🚀 优化：使用异步 exec 避免阻塞事件循环
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * 获取所有用户
 */
exports.getAllUsers = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { page = 1, limit = 20, search, role, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const where = {};
    if (search) {
        where.OR = [
            { email: { contains: search, mode: 'insensitive' } },
            { username: { contains: search, mode: 'insensitive' } },
            { nickname: { contains: search, mode: 'insensitive' } },
        ];
    }
    if (role) {
        where.role = role;
    }
    if (status) {
        where.isActive = status === 'active';
    }
    const [users, total] = await Promise.all([
        index_1.prisma.user.findMany({
            where,
            select: {
                id: true,
                phone: true,
                email: true,
                username: true,
                nickname: true,
                avatar: true,
                role: true,
                credits: true,
                membershipExpireAt: true,
                isActive: true,
                createdAt: true,
                lastLoginAt: true,
                _count: {
                    select: {
                        projects: true,
                        assets: true,
                    },
                },
            },
            skip,
            take,
            orderBy: { createdAt: 'desc' },
        }),
        index_1.prisma.user.count({ where }),
    ]);
    res.json({
        success: true,
        data: users,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit)),
        },
    });
});
/**
 * 更新用户
 */
exports.updateUser = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { role, isActive, nickname, membershipExpireAt } = req.body;
    // 检查目标用户
    const targetUser = await index_1.prisma.user.findUnique({
        where: { id },
        select: { role: true },
    });
    if (!targetUser) {
        throw new errorHandler_1.AppError('用户不存在', 404);
    }
    // 禁止禁用管理员账户
    if (targetUser.role === 'ADMIN' && isActive === false) {
        throw new errorHandler_1.AppError('管理员账户不能被禁用', 403);
    }
    // 处理会员到期时间
    let expireAtValue = undefined;
    if (membershipExpireAt !== undefined) {
        if (membershipExpireAt === null || membershipExpireAt === '') {
            expireAtValue = null; // 永久会员
        }
        else {
            expireAtValue = new Date(membershipExpireAt);
        }
    }
    const user = await index_1.prisma.user.update({
        where: { id },
        data: {
            ...(role && { role }),
            ...(typeof isActive === 'boolean' && { isActive }),
            ...(nickname && { nickname }),
            ...(expireAtValue !== undefined && { membershipExpireAt: expireAtValue }),
        },
        select: {
            id: true,
            email: true,
            username: true,
            nickname: true,
            role: true,
            isActive: true,
            membershipExpireAt: true,
        },
    });
    res.json({
        success: true,
        message: '用户更新成功',
        data: user,
    });
});
/**
 * 删除用户
 */
exports.deleteUser = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    // 不能删除自己
    if (id === req.user.id) {
        throw new errorHandler_1.AppError('不能删除自己的账户', 400);
    }
    await index_1.prisma.user.delete({
        where: { id },
    });
    res.json({
        success: true,
        message: '用户删除成功',
    });
});
/**
 * 获取所有AI模型
 */
exports.getAllAIModels = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { type, provider, isActive, generationType } = req.query;
    const where = {};
    if (type) {
        where.type = type;
    }
    if (provider) {
        where.provider = provider;
    }
    if (typeof isActive !== 'undefined') {
        where.isActive = isActive === 'true';
    }
    const models = await index_1.prisma.aIModel.findMany({
        where,
        orderBy: [
            { isActive: 'desc' },
            { createdAt: 'desc' },
        ],
    });
    let data = models;
    if (generationType) {
        const gt = String(generationType);
        const syns = [gt, gt.toLowerCase()];
        if (gt === '首尾帧' || gt.toLowerCase().includes('fl2v') || gt.toLowerCase().includes('first')) {
            syns.push('fl2v', 'First-and-Last-Frame', 'first_last_frame', '首尾');
        }
        const ids = data.map((m) => m.id);
        const caps = await index_1.prisma.modelCapability.findMany({
            where: { aiModelId: { in: ids }, capability: { in: syns } },
        });
        const capMap = new Map();
        for (const c of caps)
            capMap.set(c.aiModelId, c);
        data = data.filter((m) => {
            const cfg = m.config || {};
            const cfgSupported = Array.isArray(cfg.supportedGenerationTypes) && cfg.supportedGenerationTypes.some((t) => syns.includes(String(t)) || String(t) === gt);
            const cap = capMap.get(m.id);
            if (cap)
                return !!cap.supported;
            return !!cfgSupported;
        });
    }
    try {
        const ids = data.map((m) => m.id);
        if (ids.length > 0) {
            const caps = await index_1.prisma.modelCapability.findMany({ where: { aiModelId: { in: ids } } });
            const capMap = new Map();
            for (const c of caps) {
                const arr = capMap.get(c.aiModelId) || [];
                arr.push({ capability: c.capability, supported: c.supported, signature: c.signature, overrides: c.overrides, source: c.source, lastVerifiedAt: c.lastVerifiedAt });
                capMap.set(c.aiModelId, arr);
            }
            data = data.map((m) => ({ ...m, capabilities: capMap.get(m.id) || [] }));
        }
    }
    catch { }
    res.json({
        success: true,
        data,
    });
});
exports.getAIPresets = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { type, provider } = req.query;
    let presets = (0, ai_models_presets_1.getAllPresets)();
    if (type)
        presets = presets.filter((p) => p.type === type);
    if (provider)
        presets = presets.filter((p) => p.provider === provider);
    res.json({
        success: true,
        data: presets,
    });
});
exports.upsertModelCapabilities = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { aiModelId, capabilities } = req.body;
    if (!aiModelId || !Array.isArray(capabilities))
        throw new errorHandler_1.AppError('aiModelId 与 capabilities 必填', 400);
    const model = await index_1.prisma.aIModel.findUnique({ where: { id: aiModelId } });
    if (!model)
        throw new errorHandler_1.AppError('模型不存在', 404);
    const results = [];
    for (const cap of capabilities) {
        const { capability, supported = true, signature, overrides, source } = cap || {};
        if (!capability)
            continue;
        const row = await index_1.prisma.modelCapability.upsert({
            where: { aiModelId_capability: { aiModelId, capability } },
            update: { supported, signature, overrides, source, lastVerifiedAt: new Date() },
            create: { aiModelId, capability, supported, signature, overrides, source, lastVerifiedAt: new Date() },
        });
        results.push(row);
    }
    res.json({ success: true, data: results });
});
/**
 * 创建AI模型
 */
exports.createAIModel = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array(),
        });
    }
    const { name, provider, modelId, type, config, apiKey, apiUrl, isActive, pricePerUse } = req.body;
    // 检查是否已存在
    const existing = await index_1.prisma.aIModel.findUnique({
        where: {
            provider_modelId: {
                provider,
                modelId,
            },
        },
    });
    if (existing) {
        throw new errorHandler_1.AppError('该模型已存在', 409);
    }
    const model = await index_1.prisma.aIModel.create({
        data: {
            name,
            provider,
            modelId,
            type,
            config: (() => {
                const cfg = config || {};
                const { targetModel, ...rest } = cfg;
                return rest;
            })(),
            apiKey: apiKey || null,
            apiUrl: apiUrl || null,
            isActive: isActive !== false,
            pricePerUse: pricePerUse ? String(pricePerUse) : null,
        },
    });
    res.status(201).json({
        success: true,
        message: 'AI模型创建成功',
        data: model,
    });
});
/**
 * 更新AI模型
 */
exports.updateAIModel = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { name, provider, modelId, config, apiKey, apiUrl, isActive, pricePerUse } = req.body;
    const dataToUpdate = {};
    if (name)
        dataToUpdate.name = name;
    if (config)
        dataToUpdate.config = config;
    if (apiKey !== undefined)
        dataToUpdate.apiKey = apiKey || null;
    if (apiUrl !== undefined)
        dataToUpdate.apiUrl = apiUrl || null;
    if (typeof isActive === 'boolean')
        dataToUpdate.isActive = isActive;
    if (pricePerUse !== undefined)
        dataToUpdate.pricePerUse = pricePerUse ? String(pricePerUse) : null;
    if (provider)
        dataToUpdate.provider = provider;
    if (modelId)
        dataToUpdate.modelId = modelId;
    const current = await index_1.prisma.aIModel.findUnique({ where: { id } });
    if (!current) {
        throw new errorHandler_1.AppError('模型不存在', 404);
    }
    const targetProvider = provider || current.provider;
    const targetModelId = modelId || current.modelId;
    const conflict = await index_1.prisma.aIModel.findUnique({
        where: { provider_modelId: { provider: targetProvider, modelId: targetModelId } },
    });
    if (conflict && conflict.id !== id) {
        throw new errorHandler_1.AppError('该模型已存在', 409);
    }
    const model = await index_1.prisma.aIModel.update({ where: { id }, data: dataToUpdate });
    res.json({
        success: true,
        message: 'AI模型更新成功',
        data: model,
    });
});
/**
 * 删除AI模型
 */
exports.deleteAIModel = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    await index_1.prisma.aIModel.delete({
        where: { id },
    });
    res.json({
        success: true,
        message: 'AI模型删除成功',
    });
});
/**
 * 获取系统设置
 */
exports.getSettings = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { category } = req.query;
    const where = category ? { category: category } : {};
    const settings = await index_1.prisma.setting.findMany({
        where,
        orderBy: { category: 'asc' },
    });
    res.json({
        success: true,
        data: settings,
    });
});
/**
 * 更新系统设置
 */
exports.updateSettings = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { settings } = req.body;
    if (!Array.isArray(settings)) {
        throw new errorHandler_1.AppError('设置必须是数组格式', 400);
    }
    // 批量更新
    const updates = settings.map((setting) => index_1.prisma.setting.upsert({
        where: { key: setting.key },
        update: { value: setting.value },
        create: {
            key: setting.key,
            value: setting.value,
            type: setting.type || 'string',
            category: setting.category || 'general',
        },
    }));
    await Promise.all(updates);
    res.json({
        success: true,
        message: '设置更新成功',
    });
});
/**
 * 获取运营仪表板统计数据
 */
exports.getStatistics = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    console.log('[Admin Stats] 开始获取统计数据...');
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    // ========== 用户统计 ==========
    const [totalUsers, activeUsers, vipUsers, svipUsers, todayNewUsers, yesterdayNewUsers, todayNewVipUsers,] = await Promise.all([
        index_1.prisma.user.count(),
        index_1.prisma.user.count({ where: { isActive: true } }),
        index_1.prisma.user.count({ where: { role: 'VIP' } }),
        index_1.prisma.user.count({ where: { role: 'SVIP' } }),
        index_1.prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
        index_1.prisma.user.count({ where: { createdAt: { gte: yesterdayStart, lt: todayStart } } }),
        index_1.prisma.user.count({
            where: {
                createdAt: { gte: todayStart },
                role: { in: ['VIP', 'SVIP'] }
            }
        }),
    ]);
    // ========== 收入统计 ==========
    const [todayRevenue, yesterdayRevenue, monthRevenue] = await Promise.all([
        index_1.prisma.paymentOrder.aggregate({
            where: { status: 'PAID', paidAt: { gte: todayStart } },
            _sum: { amount: true },
        }),
        index_1.prisma.paymentOrder.aggregate({
            where: { status: 'PAID', paidAt: { gte: yesterdayStart, lt: todayStart } },
            _sum: { amount: true },
        }),
        index_1.prisma.paymentOrder.aggregate({
            where: { status: 'PAID', paidAt: { gte: thirtyDaysAgo } },
            _sum: { amount: true },
        }),
    ]);
    // ========== 项目和资产统计 ==========
    const [totalProjects, activeProjects, totalAssets, todayAssets] = await Promise.all([
        index_1.prisma.project.count(),
        index_1.prisma.project.count({ where: { status: 'IN_PROGRESS' } }),
        index_1.prisma.asset.count(),
        index_1.prisma.asset.count({ where: { createdAt: { gte: todayStart } } }),
    ]);
    // ========== AI 使用统计 ==========
    const [totalUsageRecords, todayUsageRecords, todayCreditsUsed] = await Promise.all([
        index_1.prisma.usageRecord.count(),
        index_1.prisma.usageRecord.count({ where: { createdAt: { gte: todayStart } } }),
        index_1.prisma.usageRecord.aggregate({
            where: { createdAt: { gte: todayStart } },
            _sum: { creditsCharged: true },
        }),
    ]);
    // ========== 实时在线统计 ==========
    let onlineNow = 0;
    let peakOnlineToday = 0;
    try {
        const activeKeys = await index_1.redis.keys('user:active:*');
        onlineNow = activeKeys.length;
        // 尝试获取今日峰值（如果有记录的话）
        const peakKey = `stats:peak_online:${todayStart.toISOString().split('T')[0]}`;
        const peakValue = await index_1.redis.get(peakKey);
        peakOnlineToday = peakValue ? parseInt(peakValue, 10) : onlineNow;
        // 更新峰值
        if (onlineNow > peakOnlineToday) {
            await index_1.redis.setex(peakKey, 86400 * 2, onlineNow.toString());
            peakOnlineToday = onlineNow;
        }
    }
    catch (e) {
        // Redis 错误时忽略
    }
    // ========== 24小时活跃度趋势（每小时）- 优化：1次聚合查询替代24次循环查询 ==========
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    twentyFourHoursAgo.setMinutes(0, 0, 0);
    // 使用 groupBy 聚合查询（转换为 int 避免 bigint 序列化问题）
    // 注意：createdAt 存储的是 UTC 时间，需要转换到 Asia/Shanghai 时区
    const hourlyRaw = await index_1.prisma.$queryRaw `
    SELECT EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::int as hour, COUNT(*)::int as count
    FROM usage_records
    WHERE "createdAt" >= ${twentyFourHoursAgo}
    GROUP BY EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')
  `;
    // 构建完整的24小时数据（填充空时段）
    const hourlyMap = new Map();
    hourlyRaw.forEach(r => hourlyMap.set(r.hour, r.count));
    const hourlyActivity = [];
    for (let i = 23; i >= 0; i--) {
        const hourStart = new Date(now.getTime() - i * 60 * 60 * 1000);
        hourStart.setMinutes(0, 0, 0);
        const hour = hourStart.getHours();
        hourlyActivity.push({
            hour,
            count: hourlyMap.get(hour) || 0,
        });
    }
    // ========== 7天用户增长趋势 - 优化：1次聚合查询替代7次循环查询 ==========
    // 注意：createdAt 存储的是 UTC 时间，需要转换到 Asia/Shanghai 时区
    const userGrowthRaw = await index_1.prisma.$queryRaw `
    SELECT DATE(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::text as date, COUNT(*)::int as count
    FROM users
    WHERE "createdAt" >= ${sevenDaysAgo}
    GROUP BY DATE(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')
    ORDER BY date
  `;
    // 构建完整的7天数据（填充空日期）
    const userGrowthMap = new Map();
    userGrowthRaw.forEach(r => userGrowthMap.set(r.date, r.count));
    const dailyUserGrowth = [];
    for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(todayStart.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = dayStart.toISOString().split('T')[0];
        dailyUserGrowth.push({
            date: dateStr,
            count: userGrowthMap.get(dateStr) || 0,
        });
    }
    // ========== 7天收入趋势 - 优化：1次聚合查询替代7次循环查询 ==========
    // 注意：paidAt 存储的是 UTC 时间，需要转换到 Asia/Shanghai 时区
    const revenueRaw = await index_1.prisma.$queryRaw `
    SELECT DATE(("paidAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::text as date, COALESCE(SUM(amount), 0)::int as amount
    FROM payment_orders
    WHERE status = 'PAID' AND "paidAt" >= ${sevenDaysAgo}
    GROUP BY DATE(("paidAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')
    ORDER BY date
  `;
    // 构建完整的7天数据（填充空日期）
    const revenueMap = new Map();
    revenueRaw.forEach(r => revenueMap.set(r.date, r.amount || 0));
    const dailyRevenue = [];
    for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(todayStart.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = dayStart.toISOString().split('T')[0];
        dailyRevenue.push({
            date: dateStr,
            amount: (revenueMap.get(dateStr) || 0) / 100, // 转换为元
        });
    }
    // ========== 最近用户 ==========
    const recentUsers = await index_1.prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            phone: true,
            nickname: true,
            role: true,
            createdAt: true,
        },
    });
    // ========== 最近订单 ==========
    const recentOrdersRaw = await index_1.prisma.paymentOrder.findMany({
        take: 10,
        where: { status: 'PAID' },
        orderBy: { paidAt: 'desc' },
        select: {
            id: true,
            orderNo: true,
            amount: true,
            credits: true,
            paidAt: true,
            userId: true,
        },
    });
    // 获取订单关联的用户信息
    const orderUserIds = [...new Set(recentOrdersRaw.map(o => o.userId))];
    const orderUsers = await index_1.prisma.user.findMany({
        where: { id: { in: orderUserIds } },
        select: { id: true, nickname: true, phone: true },
    });
    const userMap = new Map(orderUsers.map(u => [u.id, u]));
    const recentOrders = recentOrdersRaw.map(o => ({
        ...o,
        user: userMap.get(o.userId) || null,
    }));
    // ========== AI 使用分布 ==========
    const usageByOperation = await index_1.prisma.usageRecord.groupBy({
        by: ['operation'],
        where: { createdAt: { gte: sevenDaysAgo } },
        _count: true,
        _sum: { creditsCharged: true },
    });
    // 调试日志
    console.log('[Admin Stats] trends数据:', JSON.stringify({
        hourlyActivity: hourlyActivity.slice(0, 3),
        dailyUserGrowth,
        dailyRevenue
    }, null, 2));
    res.json({
        success: true,
        data: {
            users: {
                total: totalUsers,
                active: activeUsers,
                vip: vipUsers,
                svip: svipUsers,
                paidTotal: vipUsers + svipUsers,
                todayNew: todayNewUsers,
                yesterdayNew: yesterdayNewUsers,
                todayNewPaid: todayNewVipUsers,
                growthRate: yesterdayNewUsers > 0 ? ((todayNewUsers - yesterdayNewUsers) / yesterdayNewUsers * 100).toFixed(1) : '0',
            },
            revenue: {
                today: (todayRevenue._sum.amount || 0) / 100,
                yesterday: (yesterdayRevenue._sum.amount || 0) / 100,
                month: (monthRevenue._sum.amount || 0) / 100,
                growthRate: (yesterdayRevenue._sum.amount || 0) > 0
                    ? (((todayRevenue._sum.amount || 0) - (yesterdayRevenue._sum.amount || 0)) / (yesterdayRevenue._sum.amount || 1) * 100).toFixed(1)
                    : '0',
            },
            projects: {
                total: totalProjects,
                active: activeProjects,
            },
            assets: {
                total: totalAssets,
                todayNew: todayAssets,
            },
            usage: {
                totalRecords: totalUsageRecords,
                todayRecords: todayUsageRecords,
                todayCredits: todayCreditsUsed._sum.creditsCharged || 0,
                byOperation: usageByOperation,
            },
            online: {
                current: onlineNow,
                peakToday: peakOnlineToday,
            },
            trends: {
                hourlyActivity,
                dailyUserGrowth,
                dailyRevenue,
            },
            recent: {
                users: recentUsers,
                orders: recentOrders,
            },
        },
    });
});
/**
 * 获取服务器监控指标
 */
exports.getServerMetrics = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    // ========== CPU 信息 ==========
    const cpus = os_1.default.cpus();
    const cpuCount = cpus.length;
    // 计算 CPU 使用率
    let totalIdle = 0, totalTick = 0;
    cpus.forEach(cpu => {
        for (const type in cpu.times) {
            totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
    });
    const cpuUsage = ((1 - totalIdle / totalTick) * 100).toFixed(1);
    // ========== 内存信息 ==========
    const totalMem = os_1.default.totalmem();
    const freeMem = os_1.default.freemem();
    const usedMem = totalMem - freeMem;
    const memUsage = ((usedMem / totalMem) * 100).toFixed(1);
    // ========== Swap 信息 - 🚀 优化：使用异步执行 ==========
    let swapTotal = 0, swapUsed = 0, swapFree = 0;
    try {
        const { stdout: swapInfo } = await execAsync('free -b | grep Swap');
        const parts = swapInfo.trim().split(/\s+/);
        swapTotal = parseInt(parts[1]) || 0;
        swapUsed = parseInt(parts[2]) || 0;
        swapFree = parseInt(parts[3]) || 0;
    }
    catch (e) {
        // Swap 信息获取失败时忽略
    }
    // ========== 磁盘信息 - 🚀 优化：使用异步执行 ==========
    let diskTotal = 0, diskUsed = 0, diskFree = 0;
    try {
        const { stdout: diskInfo } = await execAsync('df -B1 / | tail -1');
        const parts = diskInfo.trim().split(/\s+/);
        diskTotal = parseInt(parts[1]) || 0;
        diskUsed = parseInt(parts[2]) || 0;
        diskFree = parseInt(parts[3]) || 0;
    }
    catch (e) {
        // 磁盘信息获取失败时忽略
    }
    // ========== 系统负载 ==========
    const loadAvg = os_1.default.loadavg();
    // ========== 系统运行时间 ==========
    const uptime = os_1.default.uptime();
    // ========== 进程信息 ==========
    const processMemory = process.memoryUsage();
    const processUptime = process.uptime();
    // ========== PM2 进程信息 - 🚀 优化：使用异步执行 ==========
    let pm2Processes = [];
    try {
        const { stdout: pm2List } = await execAsync('pm2 jlist 2>/dev/null');
        pm2Processes = JSON.parse(pm2List).map((p) => ({
            name: p.name,
            pid: p.pid,
            status: p.pm2_env?.status,
            cpu: p.monit?.cpu || 0,
            memory: p.monit?.memory || 0,
            uptime: p.pm2_env?.pm_uptime ? Date.now() - p.pm2_env.pm_uptime : 0,
            restarts: p.pm2_env?.restart_time || 0,
        }));
    }
    catch (e) {
        // PM2 信息获取失败时忽略
    }
    // ========== Socket.io 在线连接数 ==========
    let onlineConnections = 0;
    try {
        const sockets = await index_1.io.fetchSockets();
        onlineConnections = sockets.length;
    }
    catch (e) {
        // 获取失败时忽略
    }
    // ========== 数据库性能指标 ==========
    let dbStats = {};
    try {
        // 数据库连接数
        const connResult = await index_1.prisma.$queryRaw `
      SELECT count(*) as total, 
             count(*) FILTER (WHERE state = 'active') as active,
             count(*) FILTER (WHERE state = 'idle') as idle
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `;
        // 数据库大小
        const sizeResult = await index_1.prisma.$queryRaw `
      SELECT pg_database_size(current_database()) as size
    `;
        // 活跃查询数
        const activeQueries = await index_1.prisma.$queryRaw `
      SELECT count(*) as count 
      FROM pg_stat_activity 
      WHERE state = 'active' AND query NOT LIKE '%pg_stat_activity%'
    `;
        // 慢查询统计（最近1小时）
        const slowQueries = await index_1.prisma.$queryRaw `
      SELECT count(*) as count 
      FROM pg_stat_activity 
      WHERE state = 'active' 
        AND query_start < NOW() - INTERVAL '5 seconds'
        AND query NOT LIKE '%pg_stat_activity%'
    `;
        dbStats = {
            connections: {
                total: Number(connResult[0]?.total) || 0,
                active: Number(connResult[0]?.active) || 0,
                idle: Number(connResult[0]?.idle) || 0,
            },
            size: Number(sizeResult[0]?.size) || 0,
            activeQueries: Number(activeQueries[0]?.count) || 0,
            slowQueries: Number(slowQueries[0]?.count) || 0,
        };
    }
    catch (e) {
        dbStats = { error: e.message };
    }
    // ========== 会话统计 ==========
    const validSessions = await index_1.prisma.session.count({
        where: {
            expiresAt: { gt: new Date() },
        },
    });
    // ========== 实时在线用户（基于 Redis 活跃追踪） ==========
    let onlineUsersNow = 0;
    try {
        const activeKeys = await index_1.redis.keys('user:active:*');
        onlineUsersNow = activeKeys.length;
    }
    catch (e) {
        // Redis 错误时忽略
    }
    // ========== 活跃用户统计（基于 AI 使用记录） ==========
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [activeUsers1h, activeUsers24h, recentRequests] = await Promise.all([
        index_1.prisma.usageRecord.groupBy({
            by: ['userId'],
            where: { createdAt: { gte: oneHourAgo } },
        }).then(r => r.length),
        index_1.prisma.usageRecord.groupBy({
            by: ['userId'],
            where: { createdAt: { gte: oneDayAgo } },
        }).then(r => r.length),
        index_1.prisma.usageRecord.count({
            where: { createdAt: { gte: oneDayAgo } },
        }),
    ]);
    res.json({
        success: true,
        data: {
            timestamp: new Date().toISOString(),
            system: {
                hostname: os_1.default.hostname(),
                platform: os_1.default.platform(),
                arch: os_1.default.arch(),
                uptime,
                loadAvg: {
                    '1m': loadAvg[0].toFixed(2),
                    '5m': loadAvg[1].toFixed(2),
                    '15m': loadAvg[2].toFixed(2),
                },
            },
            cpu: {
                count: cpuCount,
                model: cpus[0]?.model || 'Unknown',
                usage: parseFloat(cpuUsage),
            },
            memory: {
                total: totalMem,
                used: usedMem,
                free: freeMem,
                usage: parseFloat(memUsage),
            },
            swap: {
                total: swapTotal,
                used: swapUsed,
                free: swapFree,
                usage: swapTotal > 0 ? parseFloat(((swapUsed / swapTotal) * 100).toFixed(1)) : 0,
            },
            disk: {
                total: diskTotal,
                used: diskUsed,
                free: diskFree,
                usage: diskTotal > 0 ? parseFloat(((diskUsed / diskTotal) * 100).toFixed(1)) : 0,
            },
            process: {
                pid: process.pid,
                uptime: processUptime,
                memory: {
                    heapTotal: processMemory.heapTotal,
                    heapUsed: processMemory.heapUsed,
                    rss: processMemory.rss,
                    external: processMemory.external,
                },
            },
            pm2: pm2Processes,
            connections: {
                socket: onlineConnections,
                validSessions,
                onlineNow: onlineUsersNow,
                activeUsers: {
                    last1hour: activeUsers1h,
                    last24hours: activeUsers24h,
                },
            },
            database: dbStats,
            traffic: {
                last24h: recentRequests,
            },
        },
    });
});
/**
 * 获取任务列表（支持多重筛选）
 */
exports.getTasks = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { page = 1, limit = 20, status, type, modelId, userId, nickname, dateFrom, dateTo, isZombie, sortBy = 'createdAt', sortOrder = 'desc', } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    // 构建查询条件
    const where = {};
    if (status) {
        where.status = status;
    }
    if (type) {
        where.type = type;
    }
    if (modelId) {
        where.modelId = modelId;
    }
    // 按用户 ID 或昵称筛选
    if (userId) {
        where.userId = userId;
    }
    else if (nickname) {
        const user = await index_1.prisma.user.findFirst({
            where: { nickname: { contains: nickname, mode: 'insensitive' } },
            select: { id: true },
        });
        if (user) {
            where.userId = user.id;
        }
        else {
            // 没找到用户，返回空结果
            return res.json({
                success: true,
                data: [],
                pagination: { page: Number(page), limit: Number(limit), total: 0, totalPages: 0 },
            });
        }
    }
    // 日期范围
    if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) {
            where.createdAt.gte = new Date(dateFrom);
        }
        if (dateTo) {
            where.createdAt.lte = new Date(dateTo);
        }
    }
    // 僵尸任务筛选（PENDING/PROCESSING 超过 30 分钟）
    if (isZombie === 'true') {
        const zombieThreshold = new Date(Date.now() - 30 * 60 * 1000);
        where.status = { in: ['PENDING', 'PROCESSING'] };
        where.updatedAt = { lt: zombieThreshold };
    }
    // 排序
    const orderBy = {};
    orderBy[sortBy] = sortOrder === 'asc' ? 'asc' : 'desc';
    const [tasks, total] = await Promise.all([
        index_1.prisma.generationTask.findMany({
            where,
            skip,
            take,
            orderBy,
            select: {
                id: true,
                userId: true,
                type: true,
                modelId: true,
                prompt: true,
                ratio: true,
                generationType: true,
                status: true,
                progress: true,
                resultUrl: true,
                errorMessage: true,
                metadata: true,
                sourceNodeId: true,
                previewNodeCreated: true,
                createdAt: true,
                updatedAt: true,
                completedAt: true,
                externalTaskId: true,
                // 注意：不选择 referenceImages（大字段）
            },
        }),
        index_1.prisma.generationTask.count({ where }),
    ]);
    // 获取关联的用户信息
    const userIds = [...new Set(tasks.map(t => t.userId))];
    const users = await index_1.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, nickname: true, phone: true, email: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));
    // 获取关联的模型信息
    const modelIds = [...new Set(tasks.map(t => t.modelId).filter(Boolean))];
    const models = await index_1.prisma.aIModel.findMany({
        where: { id: { in: modelIds } },
        select: { id: true, name: true, provider: true },
    });
    const modelMap = new Map(models.map(m => [m.id, m]));
    // 组装数据（确保日期字段正确序列化为 ISO 字符串）
    const tasksWithInfo = tasks.map(task => ({
        ...task,
        createdAt: task.createdAt ? task.createdAt.toISOString() : null,
        updatedAt: task.updatedAt ? task.updatedAt.toISOString() : null,
        completedAt: task.completedAt ? task.completedAt.toISOString() : null,
        user: userMap.get(task.userId) || null,
        model: modelMap.get(task.modelId) || null,
        // 提取扣费信息
        creditsCharged: task.metadata?.creditsCharged || 0,
        usageRecordId: task.metadata?.usageRecordId || null,
        isFreeUsage: task.metadata?.isFreeUsage || false,
    }));
    res.json({
        success: true,
        data: tasksWithInfo,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit)),
        },
    });
});
/**
 * 获取任务统计数据
 */
exports.getTaskStats = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const zombieThreshold = new Date(Date.now() - 30 * 60 * 1000);
    // 总体统计
    const [totalTasks, pendingTasks, processingTasks, successTasks, failureTasks, zombieTasks] = await Promise.all([
        index_1.prisma.generationTask.count(),
        index_1.prisma.generationTask.count({ where: { status: 'PENDING' } }),
        index_1.prisma.generationTask.count({ where: { status: 'PROCESSING' } }),
        index_1.prisma.generationTask.count({ where: { status: 'SUCCESS' } }),
        index_1.prisma.generationTask.count({ where: { status: 'FAILURE' } }),
        index_1.prisma.generationTask.count({
            where: {
                status: { in: ['PENDING', 'PROCESSING'] },
                updatedAt: { lt: zombieThreshold },
            },
        }),
    ]);
    // 今日统计
    const [todayTotal, todaySuccess, todayFailure] = await Promise.all([
        index_1.prisma.generationTask.count({ where: { createdAt: { gte: todayStart } } }),
        index_1.prisma.generationTask.count({ where: { createdAt: { gte: todayStart }, status: 'SUCCESS' } }),
        index_1.prisma.generationTask.count({ where: { createdAt: { gte: todayStart }, status: 'FAILURE' } }),
    ]);
    // 按模型统计（7天）
    const modelStats = await index_1.prisma.$queryRaw `
    SELECT 
      "modelId",
      COUNT(*)::bigint as total,
      COUNT(*) FILTER (WHERE status = 'SUCCESS')::bigint as success,
      COUNT(*) FILTER (WHERE status = 'FAILURE')::bigint as failure
    FROM generation_tasks
    WHERE "createdAt" >= ${sevenDaysAgo}
    GROUP BY "modelId"
    ORDER BY total DESC
    LIMIT 20
  `;
    // 获取模型名称
    const modelIds = modelStats.map(m => m.modelId).filter(Boolean);
    const models = await index_1.prisma.aIModel.findMany({
        where: { id: { in: modelIds } },
        select: { id: true, name: true, provider: true },
    });
    const modelMap = new Map(models.map(m => [m.id, m]));
    const modelStatsWithName = modelStats.map(stat => {
        const model = modelMap.get(stat.modelId);
        const total = Number(stat.total);
        const success = Number(stat.success);
        const failure = Number(stat.failure);
        return {
            modelId: stat.modelId,
            modelName: model?.name || '未知模型',
            provider: model?.provider || '',
            total,
            success,
            failure,
            successRate: total > 0 ? ((success / total) * 100).toFixed(1) : '0',
        };
    });
    // 按类型统计（7天）
    const typeStats = await index_1.prisma.$queryRaw `
    SELECT 
      type,
      COUNT(*)::bigint as total,
      COUNT(*) FILTER (WHERE status = 'SUCCESS')::bigint as success,
      COUNT(*) FILTER (WHERE status = 'FAILURE')::bigint as failure
    FROM generation_tasks
    WHERE "createdAt" >= ${sevenDaysAgo}
    GROUP BY type
  `;
    const typeStatsFormatted = typeStats.map(stat => {
        const total = Number(stat.total);
        const success = Number(stat.success);
        const failure = Number(stat.failure);
        return {
            type: stat.type,
            total,
            success,
            failure,
            successRate: total > 0 ? ((success / total) * 100).toFixed(1) : '0',
        };
    });
    // 扣费统计（从 metadata 中提取）
    const chargedTasks = await index_1.prisma.$queryRaw `
    SELECT SUM((metadata->>'creditsCharged')::int)::bigint as total_charged
    FROM generation_tasks
    WHERE "createdAt" >= ${sevenDaysAgo}
      AND metadata->>'creditsCharged' IS NOT NULL
  `;
    const totalCreditsCharged = Number(chargedTasks[0]?.total_charged || 0);
    res.json({
        success: true,
        data: {
            overview: {
                total: totalTasks,
                pending: pendingTasks,
                processing: processingTasks,
                success: successTasks,
                failure: failureTasks,
                zombie: zombieTasks,
                successRate: (successTasks + failureTasks) > 0
                    ? ((successTasks / (successTasks + failureTasks)) * 100).toFixed(1)
                    : '0',
            },
            today: {
                total: todayTotal,
                success: todaySuccess,
                failure: todayFailure,
                successRate: (todaySuccess + todayFailure) > 0
                    ? ((todaySuccess / (todaySuccess + todayFailure)) * 100).toFixed(1)
                    : '0',
            },
            byModel: modelStatsWithName,
            byType: typeStatsFormatted,
            credits: {
                totalCharged7d: totalCreditsCharged,
            },
        },
    });
});
/**
 * 手动退款（将积分返还给用户）
 */
exports.refundTask = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const task = await index_1.prisma.generationTask.findUnique({
        where: { id },
        select: {
            id: true,
            userId: true,
            status: true,
            metadata: true,
        },
    });
    if (!task) {
        throw new errorHandler_1.AppError('任务不存在', 404);
    }
    const metadata = task.metadata;
    const creditsCharged = metadata?.creditsCharged || 0;
    if (creditsCharged <= 0) {
        throw new errorHandler_1.AppError('该任务没有扣费记录或已退款', 400);
    }
    // 检查是否已退款（通过在 metadata 中标记）
    if (metadata?.refunded) {
        throw new errorHandler_1.AppError('该任务已退款', 400);
    }
    // 退还积分
    await index_1.prisma.user.update({
        where: { id: task.userId },
        data: { credits: { increment: creditsCharged } },
    });
    // 更新任务 metadata 标记已退款
    await index_1.prisma.generationTask.update({
        where: { id },
        data: {
            metadata: {
                ...metadata,
                refunded: true,
                refundedAt: new Date().toISOString(),
                refundedBy: req.user.id,
            },
        },
    });
    // 清除用户缓存
    try {
        await index_1.redis.del(`user:profile:${task.userId}`);
    }
    catch (e) {
        // Redis 错误时忽略
    }
    res.json({
        success: true,
        message: `已退还 ${creditsCharged} 积分`,
        data: {
            taskId: id,
            userId: task.userId,
            creditsRefunded: creditsCharged,
        },
    });
});
/**
 * 取消任务（标记为失败）
 */
exports.cancelTask = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { refund = true } = req.body;
    const task = await index_1.prisma.generationTask.findUnique({
        where: { id },
        select: {
            id: true,
            userId: true,
            status: true,
            metadata: true,
        },
    });
    if (!task) {
        throw new errorHandler_1.AppError('任务不存在', 404);
    }
    if (task.status === 'SUCCESS' || task.status === 'FAILURE') {
        throw new errorHandler_1.AppError('任务已完成，无法取消', 400);
    }
    const metadata = task.metadata;
    const creditsCharged = metadata?.creditsCharged || 0;
    let creditsRefunded = 0;
    // 如果需要退款且有扣费记录且未退款
    if (refund && creditsCharged > 0 && !metadata?.refunded) {
        await index_1.prisma.user.update({
            where: { id: task.userId },
            data: { credits: { increment: creditsCharged } },
        });
        creditsRefunded = creditsCharged;
        // 清除用户缓存
        try {
            await index_1.redis.del(`user:profile:${task.userId}`);
        }
        catch (e) {
            // Redis 错误时忽略
        }
    }
    // 更新任务状态
    await index_1.prisma.generationTask.update({
        where: { id },
        data: {
            status: 'FAILURE',
            errorMessage: '管理员手动取消',
            completedAt: new Date(),
            metadata: {
                ...metadata,
                cancelledAt: new Date().toISOString(),
                cancelledBy: req.user.id,
                ...(creditsRefunded > 0 ? { refunded: true, refundedAt: new Date().toISOString() } : {}),
            },
        },
    });
    res.json({
        success: true,
        message: creditsRefunded > 0 ? `任务已取消，已退还 ${creditsRefunded} 积分` : '任务已取消',
        data: {
            taskId: id,
            userId: task.userId,
            creditsRefunded,
        },
    });
});
/**
 * 获取指定用户的工作流列表（管理员巡查）
 */
exports.getUserWorkflows = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    // 验证用户存在
    const user = await index_1.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, nickname: true, phone: true },
    });
    if (!user) {
        throw new errorHandler_1.AppError('用户不存在', 404);
    }
    const [workflows, total] = await Promise.all([
        index_1.prisma.workflow.findMany({
            where: { userId },
            select: {
                id: true,
                name: true,
                description: true,
                data: true, // 包含 nodes 和 edges
                createdAt: true,
                updatedAt: true,
                project: {
                    select: { id: true, name: true },
                },
                episode: {
                    select: { id: true, name: true },
                },
            },
            orderBy: { updatedAt: 'desc' },
            skip,
            take,
        }),
        index_1.prisma.workflow.count({ where: { userId } }),
    ]);
    // 处理工作流数据，提取节点统计
    const workflowsWithStats = workflows.map((wf) => {
        const data = wf.data;
        const nodes = data?.nodes || [];
        const nodeTypes = {};
        nodes.forEach((node) => {
            nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
        });
        return {
            ...wf,
            nodeCount: nodes.length,
            edgeCount: (data?.edges || []).length,
            nodeTypes,
        };
    });
    res.json({
        success: true,
        data: {
            user,
            workflows: workflowsWithStats,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / take),
            },
        },
    });
});
/**
 * 获取指定用户的资产库列表（管理员巡查）
 */
exports.getUserAssetLibraries = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    // 验证用户存在
    const user = await index_1.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, nickname: true, phone: true },
    });
    if (!user) {
        throw new errorHandler_1.AppError('用户不存在', 404);
    }
    const [libraries, total] = await Promise.all([
        index_1.prisma.assetLibrary.findMany({
            where: { userId },
            select: {
                id: true,
                name: true,
                description: true,
                thumbnail: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: { assets: true },
                },
            },
            orderBy: { updatedAt: 'desc' },
            skip,
            take,
        }),
        index_1.prisma.assetLibrary.count({ where: { userId } }),
    ]);
    res.json({
        success: true,
        data: {
            user,
            libraries: libraries.map((lib) => ({
                ...lib,
                assetCount: lib._count.assets,
                _count: undefined,
            })),
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / take),
            },
        },
    });
});
/**
 * 获取指定资产库的资产列表（管理员巡查）
 */
exports.getAssetLibraryAssets = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { libraryId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    // 验证资产库存在
    const library = await index_1.prisma.assetLibrary.findUnique({
        where: { id: libraryId },
        select: {
            id: true,
            name: true,
            userId: true,
            user: {
                select: { id: true, nickname: true, phone: true },
            },
        },
    });
    if (!library) {
        throw new errorHandler_1.AppError('资产库不存在', 404);
    }
    const [assets, total] = await Promise.all([
        index_1.prisma.asset.findMany({
            where: { assetLibraryId: libraryId },
            select: {
                id: true,
                name: true,
                type: true,
                url: true,
                thumbnail: true,
                metadata: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take,
        }),
        index_1.prisma.asset.count({ where: { assetLibraryId: libraryId } }),
    ]);
    res.json({
        success: true,
        data: {
            library,
            assets,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / take),
            },
        },
    });
});
//# sourceMappingURL=admin.controller.js.map