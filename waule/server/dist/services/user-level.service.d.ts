import { UserRole } from '@prisma/client';
interface CheckPermissionParams {
    userId: string;
    aiModelId?: string;
    nodeType?: string;
    moduleType?: string;
}
interface PermissionResult {
    allowed: boolean;
    reason?: string;
    isFree?: boolean;
    creditsRequired?: number;
    dailyLimitReached?: boolean;
    currentUsage?: number;
    dailyLimit?: number;
}
interface UsageLimitResult {
    allowed: boolean;
    reason?: string;
    currentUsage: number;
    dailyLimit: number;
    freeUsageRemaining: number;
}
/**
 * 用户等级权限服务
 * 负责处理用户等级相关的权限检查、积分赠送、使用限制等
 */
declare class UserLevelService {
    /**
     * 获取用户的有效等级（考虑会员过期）
     */
    getEffectiveUserRole(userId: string): Promise<UserRole>;
    /**
     * 检查用户是否有会员有效期内
     */
    isMembershipActive(userId: string): Promise<boolean>;
    /**
     * 检查老会员免费配额
     * 仅对 legacyMemberExpireAt 有值且未过期的用户生效
     */
    checkLegacyMemberFreeQuota(params: {
        userId: string;
        aiModelId?: string;
        nodeType?: string;
    }): Promise<{
        isLegacy: boolean;
        isFree: boolean;
        freeRemaining: number;
    }>;
    /**
     * 🚀 获取用户等级配置（带缓存）
     */
    getUserLevelConfig(userRole: UserRole): Promise<any>;
    /**
     * 获取所有用户等级配置
     */
    getAllLevelConfigs(): Promise<{
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        userRole: import(".prisma/client").$Enums.UserRole;
        dailyGiftCredits: number;
        giftDays: number;
        giftDescription: string | null;
        maxConcurrency: number;
        storageRetentionDays: number;
    }[]>;
    /**
     * 更新或创建用户等级配置
     */
    upsertLevelConfig(data: {
        userRole: UserRole;
        dailyGiftCredits?: number;
        giftDays?: number;
        giftDescription?: string;
        maxConcurrency?: number;
        storageRetentionDays?: number;
        isActive?: boolean;
    }): Promise<{
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        userRole: import(".prisma/client").$Enums.UserRole;
        dailyGiftCredits: number;
        giftDays: number;
        giftDescription: string | null;
        maxConcurrency: number;
        storageRetentionDays: number;
    }>;
    /**
     * 🚀 获取模型权限配置（带缓存）
     */
    getModelPermission(params: {
        aiModelId?: string;
        nodeType?: string;
        moduleType?: string;
        userRole: UserRole;
    }): Promise<any>;
    /**
     * 获取模型的所有等级权限配置
     */
    getModelPermissions(params: {
        aiModelId?: string;
        nodeType?: string;
        moduleType?: string;
    }): Promise<{
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        aiModelId: string | null;
        nodeType: string | null;
        moduleType: string | null;
        userRole: import(".prisma/client").$Enums.UserRole;
        isAllowed: boolean;
        dailyLimit: number;
        isFreeForMember: boolean;
        freeDailyLimit: number;
    }[]>;
    /**
     * 批量更新或创建模型权限配置
     */
    upsertModelPermissions(permissions: Array<{
        aiModelId?: string;
        nodeType?: string;
        moduleType?: string;
        userRole: UserRole;
        isAllowed?: boolean;
        dailyLimit?: number;
        isFreeForMember?: boolean;
        freeDailyLimit?: number;
        isActive?: boolean;
    }>): Promise<{
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        aiModelId: string | null;
        nodeType: string | null;
        moduleType: string | null;
        userRole: import(".prisma/client").$Enums.UserRole;
        isAllowed: boolean;
        dailyLimit: number;
        isFreeForMember: boolean;
        freeDailyLimit: number;
    }[]>;
    /**
     * 检查用户是否有权限使用指定模型/节点
     */
    checkPermission(params: CheckPermissionParams): Promise<PermissionResult>;
    /**
     * 检查每日使用限制
     */
    checkDailyUsageLimit(params: {
        userId: string;
        aiModelId?: string;
        nodeType?: string;
        moduleType?: string;
        dailyLimit: number;
    }): Promise<UsageLimitResult>;
    /**
     * 检查免费使用次数
     */
    checkFreeUsageLimit(params: {
        userId: string;
        aiModelId?: string;
        nodeType?: string;
        moduleType?: string;
        freeDailyLimit: number;
    }): Promise<{
        freeUsageRemaining: number;
    }>;
    /**
     * 记录使用次数
     */
    recordUsage(params: {
        userId: string;
        aiModelId?: string;
        nodeType?: string;
        moduleType?: string;
        isFreeUsage?: boolean;
    }): Promise<void>;
    /**
     * 检查用户并发限制
     */
    checkConcurrencyLimit(userId: string): Promise<{
        allowed: boolean;
        reason?: string;
        current: number;
        max: number;
    }>;
    /**
     * 处理每日赠送积分（应在用户登录或定时任务中调用）
     *
     * 赠送规则：
     * 1. 普通用户（USER）：注册后7天内，如果没有充值过，每天赠送积分（不累加，补足到上限）
     * 2. VIP/SVIP：会员有效期内每天赠送积分
     */
    processGiftCredits(userId: string): Promise<{
        gifted: boolean;
        amount: number;
        message?: string;
    }>;
    /**
     * 获取用户今日赠送积分状态
     */
    getGiftCreditsStatus(userId: string): Promise<{
        hasReceivedToday: boolean;
        todayGifted: number;
        todayUsed: number;
        todayRemaining: number;
        configuredDailyGift: any;
        giftDays: any;
    }>;
    /**
     * 获取用户每日使用统计
     */
    getUserDailyUsageStats(userId: string, date?: Date): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        aiModelId: string | null;
        nodeType: string | null;
        date: Date;
        moduleType: string | null;
        usageCount: number;
        freeUsageCount: number;
    }[]>;
    /**
     * 删除模型权限配置
     */
    deleteModelPermission(id: string): Promise<{
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        aiModelId: string | null;
        nodeType: string | null;
        moduleType: string | null;
        userRole: import(".prisma/client").$Enums.UserRole;
        isAllowed: boolean;
        dailyLimit: number;
        isFreeForMember: boolean;
        freeDailyLimit: number;
    }>;
    /**
     * 获取所有模型的权限配置（用于管理界面）
     */
    getAllModelPermissions(): Promise<({
        aiModel: {
            type: import(".prisma/client").$Enums.AIModelType;
            id: string;
            name: string;
            provider: string;
            modelId: string;
        } | null;
    } & {
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        aiModelId: string | null;
        nodeType: string | null;
        moduleType: string | null;
        userRole: import(".prisma/client").$Enums.UserRole;
        isAllowed: boolean;
        dailyLimit: number;
        isFreeForMember: boolean;
        freeDailyLimit: number;
    })[]>;
}
export declare const userLevelService: UserLevelService;
export {};
//# sourceMappingURL=user-level.service.d.ts.map