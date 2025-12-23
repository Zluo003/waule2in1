"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userLevelService = void 0;
const index_1 = require("../index");
/**
 * 老会员免费配额配置（已禁用）
 * 2024-12-23: 迁移到新平台后取消老会员特权，避免权限检查逻辑复杂导致的问题
 * 如需恢复，取消下面的注释即可
 */
const LEGACY_MEMBER_FREE_QUOTAS = {
    VIP: {},
    SVIP: {},
    USER: {},
    ADMIN: {},
    INTERNAL: {},
};
/**
 * 用户等级权限服务
 * 负责处理用户等级相关的权限检查、积分赠送、使用限制等
 */
class UserLevelService {
    /**
     * 获取用户的有效等级（考虑会员过期）
     */
    async getEffectiveUserRole(userId) {
        const user = await index_1.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true, membershipExpireAt: true },
        });
        if (!user) {
            return 'USER';
        }
        // 如果是VIP或SVIP，检查会员是否过期
        if (user.role === 'VIP' || user.role === 'SVIP') {
            if (user.membershipExpireAt && new Date() > user.membershipExpireAt) {
                // 会员已过期，返回USER
                return 'USER';
            }
        }
        return user.role;
    }
    /**
     * 检查用户是否有会员有效期内
     */
    async isMembershipActive(userId) {
        const user = await index_1.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true, membershipExpireAt: true },
        });
        if (!user)
            return false;
        if (user.role === 'VIP' || user.role === 'SVIP') {
            if (!user.membershipExpireAt)
                return true; // 无过期时间表示永久会员
            return new Date() <= user.membershipExpireAt;
        }
        return false;
    }
    /**
     * 检查老会员免费配额
     * 仅对 legacyMemberExpireAt 有值且未过期的用户生效
     */
    async checkLegacyMemberFreeQuota(params) {
        const { userId, aiModelId, nodeType } = params;
        // 获取用户信息（legacyMemberExpireAt 是新字段，需要类型断言）
        const user = await index_1.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true, legacyMemberExpireAt: true },
        });
        // 检查是否有老会员特权到期日
        if (!user || !user.legacyMemberExpireAt) {
            return { isLegacy: false, isFree: false, freeRemaining: 0 };
        }
        // 检查老会员特权是否已过期
        if (new Date() > user.legacyMemberExpireAt) {
            return { isLegacy: true, isFree: false, freeRemaining: 0 };
        }
        if (user.role !== 'VIP' && user.role !== 'SVIP') {
            return { isLegacy: false, isFree: false, freeRemaining: 0 };
        }
        // 获取老会员配额配置
        const quotas = LEGACY_MEMBER_FREE_QUOTAS[user.role] || {};
        const modelKey = aiModelId || nodeType || '';
        const dailyLimit = quotas[modelKey] || 0;
        if (dailyLimit === 0) {
            return { isLegacy: true, isFree: false, freeRemaining: 0 };
        }
        // 检查今日已使用次数
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const usage = await index_1.prisma.dailyUsageRecord.findFirst({
            where: {
                userId,
                date: today,
                aiModelId: aiModelId || null,
                nodeType: nodeType || null,
                moduleType: null,
            },
        });
        const freeUsed = usage?.freeUsageCount || 0;
        const freeRemaining = Math.max(0, dailyLimit - freeUsed);
        console.log(`[UserLevel] 老会员配额检查: userId=${userId}, role=${user.role}, model=${modelKey}, limit=${dailyLimit}, used=${freeUsed}, remaining=${freeRemaining}`);
        return {
            isLegacy: true,
            isFree: freeRemaining > 0,
            freeRemaining,
        };
    }
    /**
     * 🚀 获取用户等级配置（带缓存）
     */
    async getUserLevelConfig(userRole) {
        const cacheKey = `level:config:${userRole}`;
        try {
            const cached = await index_1.redis.get(cacheKey);
            if (cached)
                return JSON.parse(cached);
        }
        catch { }
        const config = await index_1.prisma.userLevelConfig.findUnique({
            where: { userRole },
        });
        if (config) {
            try {
                await index_1.redis.set(cacheKey, JSON.stringify(config), 'EX', 600);
            }
            catch { }
        }
        return config;
    }
    /**
     * 获取所有用户等级配置
     */
    async getAllLevelConfigs() {
        return index_1.prisma.userLevelConfig.findMany({
            orderBy: { userRole: 'asc' },
        });
    }
    /**
     * 更新或创建用户等级配置
     */
    async upsertLevelConfig(data) {
        return index_1.prisma.userLevelConfig.upsert({
            where: { userRole: data.userRole },
            create: {
                userRole: data.userRole,
                dailyGiftCredits: data.dailyGiftCredits ?? 0,
                giftDays: data.giftDays ?? 0,
                giftDescription: data.giftDescription,
                maxConcurrency: data.maxConcurrency ?? 1,
                storageRetentionDays: data.storageRetentionDays ?? -1,
                isActive: data.isActive ?? true,
            },
            update: {
                ...(data.dailyGiftCredits !== undefined && { dailyGiftCredits: data.dailyGiftCredits }),
                ...(data.giftDays !== undefined && { giftDays: data.giftDays }),
                ...(data.giftDescription !== undefined && { giftDescription: data.giftDescription }),
                ...(data.maxConcurrency !== undefined && { maxConcurrency: data.maxConcurrency }),
                ...(data.storageRetentionDays !== undefined && { storageRetentionDays: data.storageRetentionDays }),
                ...(data.isActive !== undefined && { isActive: data.isActive }),
            },
        });
    }
    /**
     * 🚀 获取模型权限配置（带缓存）
     */
    async getModelPermission(params) {
        // 构建缓存 key
        let cacheKey = `perm:${params.userRole}:`;
        if (params.aiModelId)
            cacheKey += `model:${params.aiModelId}`;
        else if (params.nodeType)
            cacheKey += `node:${params.nodeType}`;
        else if (params.moduleType)
            cacheKey += `module:${params.moduleType}`;
        // 尝试从缓存获取
        try {
            const cached = await index_1.redis.get(cacheKey);
            if (cached)
                return cached === 'null' ? null : JSON.parse(cached);
        }
        catch { }
        const where = {
            userRole: params.userRole,
            isActive: true,
        };
        if (params.aiModelId) {
            where.aiModelId = params.aiModelId;
        }
        else if (params.nodeType) {
            where.nodeType = params.nodeType;
        }
        else if (params.moduleType) {
            where.moduleType = params.moduleType;
        }
        const result = await index_1.prisma.modelPermission.findFirst({ where });
        // 缓存结果 10 分钟（包括 null 结果）
        try {
            await index_1.redis.set(cacheKey, result ? JSON.stringify(result) : 'null', 'EX', 600);
        }
        catch { }
        return result;
    }
    /**
     * 获取模型的所有等级权限配置
     */
    async getModelPermissions(params) {
        const where = { isActive: true };
        if (params.aiModelId) {
            where.aiModelId = params.aiModelId;
        }
        else if (params.nodeType) {
            where.nodeType = params.nodeType;
        }
        else if (params.moduleType) {
            where.moduleType = params.moduleType;
        }
        return index_1.prisma.modelPermission.findMany({
            where,
            orderBy: { userRole: 'asc' },
        });
    }
    /**
     * 批量更新或创建模型权限配置
     */
    async upsertModelPermissions(permissions) {
        const results = [];
        for (const perm of permissions) {
            // Find existing permission
            const existing = await index_1.prisma.modelPermission.findFirst({
                where: {
                    aiModelId: perm.aiModelId || null,
                    nodeType: perm.nodeType || null,
                    moduleType: perm.moduleType || null,
                    userRole: perm.userRole,
                },
            });
            let result;
            if (existing) {
                // Update existing
                result = await index_1.prisma.modelPermission.update({
                    where: { id: existing.id },
                    data: {
                        ...(perm.isAllowed !== undefined && { isAllowed: perm.isAllowed }),
                        ...(perm.dailyLimit !== undefined && { dailyLimit: perm.dailyLimit }),
                        ...(perm.isFreeForMember !== undefined && { isFreeForMember: perm.isFreeForMember }),
                        ...(perm.freeDailyLimit !== undefined && { freeDailyLimit: perm.freeDailyLimit }),
                        ...(perm.isActive !== undefined && { isActive: perm.isActive }),
                    },
                });
            }
            else {
                // Create new
                result = await index_1.prisma.modelPermission.create({
                    data: {
                        aiModelId: perm.aiModelId || null,
                        nodeType: perm.nodeType || null,
                        moduleType: perm.moduleType || null,
                        userRole: perm.userRole,
                        isAllowed: perm.isAllowed ?? true,
                        dailyLimit: perm.dailyLimit ?? -1,
                        isFreeForMember: perm.isFreeForMember ?? false,
                        freeDailyLimit: perm.freeDailyLimit ?? 0,
                        isActive: perm.isActive ?? true,
                    },
                });
            }
            results.push(result);
        }
        return results;
    }
    /**
     * 检查用户是否有权限使用指定模型/节点
     */
    async checkPermission(params) {
        const { userId, aiModelId, nodeType, moduleType } = params;
        // 获取用户有效等级
        const userRole = await this.getEffectiveUserRole(userId);
        console.log(`[UserLevel] 检查权限: userId=${userId}, role=${userRole}, aiModelId=${aiModelId}, nodeType=${nodeType}, moduleType=${moduleType}`);
        // ADMIN 和 INTERNAL 角色拥有全部权限
        if (userRole === 'ADMIN' || userRole === 'INTERNAL') {
            console.log(`[UserLevel] 管理员/内部用户，允许访问`);
            return { allowed: true, isFree: true };
        }
        // 🔥 老会员免费配额检查（已禁用 2024-12-23）
        // 迁移到新平台后取消老会员特权，直接走正常权限配置
        // const legacyResult = await this.checkLegacyMemberFreeQuota({
        //   userId,
        //   aiModelId,
        //   nodeType,
        // });
        // if (legacyResult.isLegacy && legacyResult.isFree) {
        //   console.log(`[UserLevel] 老会员免费配额生效，剩余 ${legacyResult.freeRemaining} 次`);
        //   return { allowed: true, isFree: true };
        // }
        // 获取权限配置
        const permission = await this.getModelPermission({
            aiModelId,
            nodeType,
            moduleType,
            userRole,
        });
        console.log(`[UserLevel] 权限配置:`, permission ? { id: permission.id, isAllowed: permission.isAllowed, dailyLimit: permission.dailyLimit } : '无配置');
        // 如果没有配置权限，默认允许（走正常计费）
        if (!permission) {
            console.log(`[UserLevel] 无权限配置，默认允许`);
            return { allowed: true, isFree: false };
        }
        // 检查是否允许使用
        if (!permission.isAllowed) {
            console.log(`[UserLevel] 权限配置禁止访问`);
            return {
                allowed: false,
                reason: `${userRole} 等级用户无权使用此功能`,
            };
        }
        // 检查每日使用限制
        if (permission.dailyLimit !== -1) {
            const usageResult = await this.checkDailyUsageLimit({
                userId,
                aiModelId,
                nodeType,
                moduleType,
                dailyLimit: permission.dailyLimit,
            });
            if (!usageResult.allowed) {
                return {
                    allowed: false,
                    reason: usageResult.reason,
                    dailyLimitReached: true,
                    currentUsage: usageResult.currentUsage,
                    dailyLimit: usageResult.dailyLimit,
                };
            }
        }
        // 检查是否可以免费使用
        let isFree = false;
        if (permission.isFreeForMember) {
            const isMemberActive = await this.isMembershipActive(userId);
            if (isMemberActive) {
                // 检查免费使用次数
                const freeUsageResult = await this.checkFreeUsageLimit({
                    userId,
                    aiModelId,
                    nodeType,
                    moduleType,
                    freeDailyLimit: permission.freeDailyLimit,
                });
                isFree = freeUsageResult.freeUsageRemaining > 0;
            }
        }
        return {
            allowed: true,
            isFree,
        };
    }
    /**
     * 检查每日使用限制
     */
    async checkDailyUsageLimit(params) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const usage = await index_1.prisma.dailyUsageRecord.findFirst({
            where: {
                userId: params.userId,
                date: today,
                aiModelId: params.aiModelId || null,
                nodeType: params.nodeType || null,
                moduleType: params.moduleType || null,
            },
        });
        const currentUsage = usage?.usageCount || 0;
        if (currentUsage >= params.dailyLimit) {
            return {
                allowed: false,
                reason: `今日使用次数已达上限 (${params.dailyLimit}次)`,
                currentUsage,
                dailyLimit: params.dailyLimit,
                freeUsageRemaining: 0,
            };
        }
        return {
            allowed: true,
            currentUsage,
            dailyLimit: params.dailyLimit,
            freeUsageRemaining: (usage?.freeUsageCount || 0),
        };
    }
    /**
     * 检查免费使用次数
     */
    async checkFreeUsageLimit(params) {
        if (params.freeDailyLimit === 0) {
            return { freeUsageRemaining: 0 };
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const usage = await index_1.prisma.dailyUsageRecord.findFirst({
            where: {
                userId: params.userId,
                date: today,
                aiModelId: params.aiModelId || null,
                nodeType: params.nodeType || null,
                moduleType: params.moduleType || null,
            },
        });
        const freeUsed = usage?.freeUsageCount || 0;
        const freeRemaining = Math.max(0, params.freeDailyLimit - freeUsed);
        return { freeUsageRemaining: freeRemaining };
    }
    /**
     * 记录使用次数
     */
    async recordUsage(params) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Find existing record
        const existing = await index_1.prisma.dailyUsageRecord.findFirst({
            where: {
                userId: params.userId,
                date: today,
                aiModelId: params.aiModelId || null,
                nodeType: params.nodeType || null,
                moduleType: params.moduleType || null,
            },
        });
        if (existing) {
            // Update existing
            await index_1.prisma.dailyUsageRecord.update({
                where: { id: existing.id },
                data: {
                    usageCount: { increment: 1 },
                    ...(params.isFreeUsage && { freeUsageCount: { increment: 1 } }),
                },
            });
        }
        else {
            // Create new
            await index_1.prisma.dailyUsageRecord.create({
                data: {
                    userId: params.userId,
                    date: today,
                    aiModelId: params.aiModelId || null,
                    nodeType: params.nodeType || null,
                    moduleType: params.moduleType || null,
                    usageCount: 1,
                    freeUsageCount: params.isFreeUsage ? 1 : 0,
                },
            });
        }
    }
    /**
     * 检查用户并发限制
     */
    async checkConcurrencyLimit(userId) {
        const userRole = await this.getEffectiveUserRole(userId);
        // ADMIN 和 INTERNAL 不限制
        if (userRole === 'ADMIN' || userRole === 'INTERNAL') {
            return { allowed: true, current: 0, max: -1 };
        }
        const config = await this.getUserLevelConfig(userRole);
        const maxConcurrency = config?.maxConcurrency ?? 1;
        // 统计当前正在处理的任务数
        const processingCount = await index_1.prisma.generationTask.count({
            where: {
                userId,
                status: { in: ['PENDING', 'PROCESSING'] },
            },
        });
        if (processingCount >= maxConcurrency) {
            return {
                allowed: false,
                reason: `您当前有 ${processingCount} 个任务正在执行，已达到允许的最大并发数 ${maxConcurrency} 个，请等待任务完成后再提交新任务`,
                current: processingCount,
                max: maxConcurrency,
            };
        }
        return {
            allowed: true,
            current: processingCount,
            max: maxConcurrency,
        };
    }
    /**
     * 处理每日赠送积分（应在用户登录或定时任务中调用）
     *
     * 赠送规则：
     * 1. 普通用户（USER）：注册后7天内，如果没有充值过，每天赠送积分（不累加，补足到上限）
     * 2. VIP/SVIP：会员有效期内每天赠送积分
     */
    async processGiftCredits(userId) {
        const user = await index_1.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                role: true,
                credits: true, // 获取当前积分用于计算补足数量
                createdAt: true,
                giftStartDate: true,
                membershipExpireAt: true,
            },
        });
        if (!user) {
            return { gifted: false, amount: 0, message: '用户不存在' };
        }
        const userRole = await this.getEffectiveUserRole(userId);
        const config = await this.getUserLevelConfig(userRole);
        if (!config || !config.isActive || config.dailyGiftCredits <= 0) {
            return { gifted: false, amount: 0, message: '该等级无赠送积分配置' };
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // 检查今天是否已经赠送过
        const existingRecord = await index_1.prisma.giftCreditsRecord.findUnique({
            where: { userId_date: { userId, date: today } },
        });
        if (existingRecord) {
            return { gifted: false, amount: 0, message: '今日已赠送' };
        }
        // 检查是否在赠送期限内
        const giftStartDate = user.giftStartDate || user.createdAt;
        if (config.giftDays > 0) {
            const giftEndDate = new Date(giftStartDate);
            giftEndDate.setDate(giftEndDate.getDate() + config.giftDays);
            if (today > giftEndDate) {
                return { gifted: false, amount: 0, message: '赠送期限已结束' };
            }
        }
        // 对于VIP/SVIP，检查会员是否有效
        if (userRole === 'VIP' || userRole === 'SVIP') {
            const isMemberActive = await this.isMembershipActive(userId);
            if (!isMemberActive) {
                return { gifted: false, amount: 0, message: '会员已过期' };
            }
        }
        // 【新增】对于普通用户（USER），检查是否有过充值记录
        // 如果用户已经充值过，则不再赠送新用户积分
        if (userRole === 'USER') {
            const hasRechargeRecord = await index_1.prisma.paymentOrder.findFirst({
                where: {
                    userId,
                    status: 'PAID',
                },
                select: { id: true },
            });
            if (hasRechargeRecord) {
                return { gifted: false, amount: 0, message: '用户已充值，不再赠送新用户积分' };
            }
        }
        // 【修改】计算实际应赠送的积分数量（不累加逻辑）
        // 赠送积分 + 剩余积分 不超过配置的每日赠送上限
        const currentCredits = user.credits || 0;
        const actualGiftAmount = Math.max(0, config.dailyGiftCredits - currentCredits);
        if (actualGiftAmount <= 0) {
            return { gifted: false, amount: 0, message: `当前积分已达上限 ${config.dailyGiftCredits}，无需赠送` };
        }
        // 执行赠送
        await index_1.prisma.$transaction(async (tx) => {
            // 创建今日赠送记录
            await tx.giftCreditsRecord.create({
                data: {
                    userId,
                    date: today,
                    giftedCredits: actualGiftAmount,
                    usedCredits: 0,
                    remainingCredits: actualGiftAmount,
                    userRole,
                },
            });
            // 增加用户积分（只增加补足的数量）
            await tx.user.update({
                where: { id: userId },
                data: { credits: { increment: actualGiftAmount } },
            });
            // 记录积分流水
            const updatedUser = await tx.user.findUnique({
                where: { id: userId },
                select: { credits: true },
            });
            await tx.creditTransaction.create({
                data: {
                    userId,
                    type: 'GIFT',
                    amount: actualGiftAmount,
                    balance: updatedUser?.credits || 0,
                    description: `每日赠送积分 (${userRole})${currentCredits > 0 ? `，补足至${config.dailyGiftCredits}` : ''}`,
                },
            });
        });
        return {
            gifted: true,
            amount: actualGiftAmount,
            message: `成功赠送 ${actualGiftAmount} 积分${currentCredits > 0 ? `（原有${currentCredits}，补足至${currentCredits + actualGiftAmount}）` : ''}`,
        };
    }
    /**
     * 获取用户今日赠送积分状态
     */
    async getGiftCreditsStatus(userId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const record = await index_1.prisma.giftCreditsRecord.findUnique({
            where: { userId_date: { userId, date: today } },
        });
        const userRole = await this.getEffectiveUserRole(userId);
        const config = await this.getUserLevelConfig(userRole);
        return {
            hasReceivedToday: !!record,
            todayGifted: record?.giftedCredits || 0,
            todayUsed: record?.usedCredits || 0,
            todayRemaining: record?.remainingCredits || 0,
            configuredDailyGift: config?.dailyGiftCredits || 0,
            giftDays: config?.giftDays || 0,
        };
    }
    /**
     * 获取用户每日使用统计
     */
    async getUserDailyUsageStats(userId, date) {
        const targetDate = date || new Date();
        targetDate.setHours(0, 0, 0, 0);
        const records = await index_1.prisma.dailyUsageRecord.findMany({
            where: {
                userId,
                date: targetDate,
            },
        });
        return records;
    }
    /**
     * 删除模型权限配置
     */
    async deleteModelPermission(id) {
        return index_1.prisma.modelPermission.delete({
            where: { id },
        });
    }
    /**
     * 获取所有模型的权限配置（用于管理界面）
     */
    async getAllModelPermissions() {
        return index_1.prisma.modelPermission.findMany({
            include: {
                aiModel: {
                    select: {
                        id: true,
                        name: true,
                        provider: true,
                        modelId: true,
                        type: true,
                    },
                },
            },
            orderBy: [
                { aiModelId: 'asc' },
                { nodeType: 'asc' },
                { moduleType: 'asc' },
                { userRole: 'asc' },
            ],
        });
    }
}
exports.userLevelService = new UserLevelService();
//# sourceMappingURL=user-level.service.js.map