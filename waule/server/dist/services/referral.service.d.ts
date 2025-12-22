import { CommissionType, WithdrawalType, WithdrawalStatus } from '@prisma/client';
/**
 * 生成唯一推荐码（6位字母数字）
 */
export declare function generateReferralCode(): Promise<string>;
/**
 * 获取推荐配置（单例，如果不存在则创建默认配置）
 */
export declare function getReferralConfig(): Promise<{
    id: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    referrerBonus: number;
    refereeBonus: number;
    commissionRate: number;
    minWithdrawAmount: number;
    withdrawToCreditsRate: number;
}>;
/**
 * 更新推荐配置
 */
export declare function updateReferralConfig(data: {
    isActive?: boolean;
    referrerBonus?: number;
    refereeBonus?: number;
    commissionRate?: number;
    minWithdrawAmount?: number;
    withdrawToCreditsRate?: number;
}): Promise<{
    id: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    referrerBonus: number;
    refereeBonus: number;
    commissionRate: number;
    minWithdrawAmount: number;
    withdrawToCreditsRate: number;
}>;
/**
 * 为用户分配推荐码（如果还没有）
 */
export declare function ensureUserReferralCode(userId: string): Promise<string>;
/**
 * 通过推荐码查找推荐人
 */
export declare function findReferrerByCode(code: string): Promise<{
    id: string;
    username: string | null;
    nickname: string | null;
} | null>;
/**
 * 绑定推荐关系并发放注册奖励
 */
export declare function bindReferralAndGrantBonus(params: {
    refereeId: string;
    referralCode: string;
}): Promise<{
    success: boolean;
    message: string;
}>;
/**
 * 处理充值返利
 */
export declare function processRechargeCommission(params: {
    userId: string;
    orderId: string;
    amount: number;
}): Promise<void>;
/**
 * 获取用户的推荐信息
 */
export declare function getUserReferralInfo(userId: string): Promise<{
    referralCode: string;
    referralBalance: number;
    referralTotalEarned: number;
    referralCount: number;
    referredBy: {
        id: string;
        username: string | null;
        nickname: string | null;
    } | null;
    config: {
        isActive: boolean;
        referrerBonus: number;
        refereeBonus: number;
        commissionRate: number;
        minWithdrawAmount: number;
        withdrawToCreditsRate: number;
    };
} | null>;
/**
 * 获取用户推荐的下级列表
 */
export declare function getUserReferrals(userId: string, params: {
    page?: number;
    pageSize?: number;
}): Promise<{
    list: {
        totalCommission: number;
        id: string;
        username: string | null;
        nickname: string | null;
        avatar: string | null;
        createdAt: Date;
    }[];
    total: number;
    page: number;
    pageSize: number;
}>;
/**
 * 获取返利记录
 */
export declare function getCommissionRecords(userId: string, params: {
    page?: number;
    pageSize?: number;
    type?: CommissionType;
}): Promise<{
    list: ({
        referee: {
            id: string;
            username: string | null;
            nickname: string | null;
            avatar: string | null;
        };
    } & {
        type: import(".prisma/client").$Enums.CommissionType;
        id: string;
        createdAt: Date;
        description: string | null;
        status: import(".prisma/client").$Enums.CommissionStatus;
        referrerId: string;
        refereeId: string;
        orderId: string | null;
        amount: number;
        rate: number | null;
    })[];
    total: number;
    page: number;
    pageSize: number;
}>;
/**
 * 申请提现
 */
export declare function requestWithdrawal(params: {
    userId: string;
    amount: number;
    type: WithdrawalType;
    alipayAccount?: string;
    alipayName?: string;
}): Promise<{
    success: boolean;
    message: string;
    data?: any;
}>;
/**
 * 获取用户的提现记录
 */
export declare function getWithdrawalRecords(userId: string, params: {
    page?: number;
    pageSize?: number;
}): Promise<{
    list: {
        type: import(".prisma/client").$Enums.WithdrawalType;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        status: import(".prisma/client").$Enums.WithdrawalStatus;
        remark: string | null;
        amount: number;
        alipayAccount: string | null;
        alipayName: string | null;
        processedAt: Date | null;
        processedBy: string | null;
        rejectReason: string | null;
        creditsGranted: number | null;
    }[];
    total: number;
    page: number;
    pageSize: number;
}>;
/**
 * 获取提现申请列表（管理后台）
 */
export declare function getWithdrawalRequests(params: {
    page?: number;
    pageSize?: number;
    status?: WithdrawalStatus;
}): Promise<{
    list: ({
        user: {
            id: string;
            username: string | null;
            nickname: string | null;
            phone: string | null;
        };
    } & {
        type: import(".prisma/client").$Enums.WithdrawalType;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        status: import(".prisma/client").$Enums.WithdrawalStatus;
        remark: string | null;
        amount: number;
        alipayAccount: string | null;
        alipayName: string | null;
        processedAt: Date | null;
        processedBy: string | null;
        rejectReason: string | null;
        creditsGranted: number | null;
    })[];
    total: number;
    page: number;
    pageSize: number;
}>;
/**
 * 处理提现申请（管理后台）
 */
export declare function processWithdrawal(params: {
    id: string;
    action: 'approve' | 'complete' | 'reject';
    adminId: string;
    rejectReason?: string;
}): Promise<{
    success: boolean;
    message: string;
}>;
/**
 * 获取推荐统计（管理后台）
 */
export declare function getReferralStats(): Promise<{
    totalUsers: number;
    usersWithReferrer: number;
    referralRate: string;
    totalCommissions: number;
    pendingWithdrawals: {
        count: number;
        amount: number;
    };
    completedWithdrawals: {
        count: number;
        amount: number;
    };
}>;
declare const _default: {
    generateReferralCode: typeof generateReferralCode;
    getReferralConfig: typeof getReferralConfig;
    updateReferralConfig: typeof updateReferralConfig;
    ensureUserReferralCode: typeof ensureUserReferralCode;
    findReferrerByCode: typeof findReferrerByCode;
    bindReferralAndGrantBonus: typeof bindReferralAndGrantBonus;
    processRechargeCommission: typeof processRechargeCommission;
    getUserReferralInfo: typeof getUserReferralInfo;
    getUserReferrals: typeof getUserReferrals;
    getCommissionRecords: typeof getCommissionRecords;
    requestWithdrawal: typeof requestWithdrawal;
    getWithdrawalRecords: typeof getWithdrawalRecords;
    getWithdrawalRequests: typeof getWithdrawalRequests;
    processWithdrawal: typeof processWithdrawal;
    getReferralStats: typeof getReferralStats;
};
export default _default;
//# sourceMappingURL=referral.service.d.ts.map