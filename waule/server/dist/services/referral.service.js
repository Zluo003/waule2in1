"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateReferralCode = generateReferralCode;
exports.getReferralConfig = getReferralConfig;
exports.updateReferralConfig = updateReferralConfig;
exports.ensureUserReferralCode = ensureUserReferralCode;
exports.findReferrerByCode = findReferrerByCode;
exports.bindReferralAndGrantBonus = bindReferralAndGrantBonus;
exports.processRechargeCommission = processRechargeCommission;
exports.getUserReferralInfo = getUserReferralInfo;
exports.getUserReferrals = getUserReferrals;
exports.getCommissionRecords = getCommissionRecords;
exports.requestWithdrawal = requestWithdrawal;
exports.getWithdrawalRecords = getWithdrawalRecords;
exports.getWithdrawalRequests = getWithdrawalRequests;
exports.processWithdrawal = processWithdrawal;
exports.getReferralStats = getReferralStats;
const index_1 = require("../index");
const client_1 = require("@prisma/client");
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * 生成唯一推荐码（6位字母数字）
 */
async function generateReferralCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 排除容易混淆的字符
    let code;
    let exists = true;
    while (exists) {
        code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const existing = await index_1.prisma.user.findUnique({ where: { referralCode: code } });
        exists = !!existing;
    }
    return code;
}
/**
 * 获取推荐配置（单例，如果不存在则创建默认配置）
 */
async function getReferralConfig() {
    let config = await index_1.prisma.referralConfig.findFirst();
    if (!config) {
        config = await index_1.prisma.referralConfig.create({
            data: {
                isActive: true,
                referrerBonus: 100,
                refereeBonus: 50,
                commissionRate: 0.1,
                minWithdrawAmount: 20000,
                withdrawToCreditsRate: 100,
            },
        });
    }
    return config;
}
/**
 * 更新推荐配置
 */
async function updateReferralConfig(data) {
    const config = await getReferralConfig();
    return index_1.prisma.referralConfig.update({
        where: { id: config.id },
        data,
    });
}
/**
 * 为用户分配推荐码（如果还没有）
 */
async function ensureUserReferralCode(userId) {
    const user = await index_1.prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true },
    });
    if (user?.referralCode) {
        return user.referralCode;
    }
    const code = await generateReferralCode();
    await index_1.prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
    });
    return code;
}
/**
 * 通过推荐码查找推荐人
 */
async function findReferrerByCode(code) {
    return index_1.prisma.user.findUnique({
        where: { referralCode: code.toUpperCase() },
        select: { id: true, nickname: true, username: true },
    });
}
/**
 * 绑定推荐关系并发放注册奖励
 */
async function bindReferralAndGrantBonus(params) {
    const { refereeId, referralCode } = params;
    // 获取配置
    const config = await getReferralConfig();
    if (!config.isActive) {
        return { success: false, message: '推荐系统暂未开放' };
    }
    // 查找推荐人
    const referrer = await findReferrerByCode(referralCode);
    if (!referrer) {
        return { success: false, message: '推荐码无效' };
    }
    // 不能自己推荐自己
    if (referrer.id === refereeId) {
        return { success: false, message: '不能使用自己的推荐码' };
    }
    // 检查是否已绑定
    const referee = await index_1.prisma.user.findUnique({
        where: { id: refereeId },
        select: { referredById: true },
    });
    if (referee?.referredById) {
        return { success: false, message: '已绑定推荐人' };
    }
    // 事务：绑定关系 + 发放奖励
    await index_1.prisma.$transaction(async (tx) => {
        // 1. 绑定推荐关系
        await tx.user.update({
            where: { id: refereeId },
            data: { referredById: referrer.id },
        });
        // 2. 发放推荐人奖励（积分）
        if (config.referrerBonus > 0) {
            await tx.user.update({
                where: { id: referrer.id },
                data: { credits: { increment: config.referrerBonus } },
            });
            await tx.referralCommission.create({
                data: {
                    referrerId: referrer.id,
                    refereeId,
                    type: client_1.CommissionType.REGISTER_BONUS,
                    amount: config.referrerBonus,
                    status: client_1.CommissionStatus.SETTLED,
                    description: '推荐新用户注册奖励',
                },
            });
            // 记录积分交易
            const referrerUser = await tx.user.findUnique({ where: { id: referrer.id }, select: { credits: true } });
            await tx.creditTransaction.create({
                data: {
                    userId: referrer.id,
                    type: 'GIFT',
                    amount: config.referrerBonus,
                    balance: referrerUser?.credits || 0,
                    description: '推荐新用户注册奖励',
                },
            });
        }
        // 3. 发放被推荐人奖励（积分）
        if (config.refereeBonus > 0) {
            await tx.user.update({
                where: { id: refereeId },
                data: { credits: { increment: config.refereeBonus } },
            });
            // 记录积分交易
            const refereeUser = await tx.user.findUnique({ where: { id: refereeId }, select: { credits: true } });
            await tx.creditTransaction.create({
                data: {
                    userId: refereeId,
                    type: 'GIFT',
                    amount: config.refereeBonus,
                    balance: refereeUser?.credits || 0,
                    description: '使用推荐码注册奖励',
                },
            });
        }
    });
    logger_1.default.info(`[Referral] 推荐关系绑定成功: ${referrer.id} -> ${refereeId}, 推荐人奖励=${config.referrerBonus}, 被推荐人奖励=${config.refereeBonus}`);
    return { success: true, message: '推荐码绑定成功' };
}
/**
 * 处理充值返利
 */
async function processRechargeCommission(params) {
    const { userId, orderId, amount } = params;
    // 获取配置
    const config = await getReferralConfig();
    if (!config.isActive || config.commissionRate <= 0) {
        return;
    }
    // 查找用户的推荐人
    const user = await index_1.prisma.user.findUnique({
        where: { id: userId },
        select: { referredById: true },
    });
    if (!user?.referredById) {
        return; // 没有推荐人
    }
    // 计算返利金额
    const commissionAmount = Math.floor(amount * config.commissionRate);
    if (commissionAmount <= 0) {
        return;
    }
    // 检查是否已经处理过该订单的返利
    const existing = await index_1.prisma.referralCommission.findFirst({
        where: { orderId, type: client_1.CommissionType.RECHARGE_COMMISSION },
    });
    if (existing) {
        return;
    }
    // 事务：记录返利 + 更新余额
    await index_1.prisma.$transaction(async (tx) => {
        // 1. 创建返利记录
        await tx.referralCommission.create({
            data: {
                referrerId: user.referredById,
                refereeId: userId,
                orderId,
                type: client_1.CommissionType.RECHARGE_COMMISSION,
                amount: commissionAmount,
                rate: config.commissionRate,
                status: client_1.CommissionStatus.SETTLED,
                description: `下级用户充值返利 ${(amount / 100).toFixed(2)}元 × ${(config.commissionRate * 100).toFixed(0)}%`,
            },
        });
        // 2. 更新推荐人返利余额
        await tx.user.update({
            where: { id: user.referredById },
            data: {
                referralBalance: { increment: commissionAmount },
                referralTotalEarned: { increment: commissionAmount },
            },
        });
    });
    logger_1.default.info(`[Referral] 充值返利: 推荐人=${user.referredById}, 被推荐人=${userId}, 充值=${amount}分, 返利=${commissionAmount}分 (${(config.commissionRate * 100).toFixed(0)}%)`);
}
/**
 * 获取用户的推荐信息
 */
async function getUserReferralInfo(userId) {
    const user = await index_1.prisma.user.findUnique({
        where: { id: userId },
        select: {
            referralCode: true,
            referralBalance: true,
            referralTotalEarned: true,
            referredBy: {
                select: { id: true, nickname: true, username: true },
            },
        },
    });
    if (!user) {
        return null;
    }
    // 确保有推荐码
    let referralCode = user.referralCode;
    if (!referralCode) {
        referralCode = await ensureUserReferralCode(userId);
    }
    // 统计推荐人数
    const referralCount = await index_1.prisma.user.count({
        where: { referredById: userId },
    });
    // 获取配置
    const config = await getReferralConfig();
    return {
        referralCode,
        referralBalance: user.referralBalance,
        referralTotalEarned: user.referralTotalEarned,
        referralCount,
        referredBy: user.referredBy,
        config: {
            isActive: config.isActive,
            referrerBonus: config.referrerBonus,
            refereeBonus: config.refereeBonus,
            commissionRate: config.commissionRate,
            minWithdrawAmount: config.minWithdrawAmount,
            withdrawToCreditsRate: config.withdrawToCreditsRate,
        },
    };
}
/**
 * 获取用户推荐的下级列表
 */
async function getUserReferrals(userId, params) {
    const { page = 1, pageSize = 20 } = params;
    const skip = (page - 1) * pageSize;
    const [referrals, total] = await Promise.all([
        index_1.prisma.user.findMany({
            where: { referredById: userId },
            select: {
                id: true,
                nickname: true,
                username: true,
                avatar: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: pageSize,
        }),
        index_1.prisma.user.count({ where: { referredById: userId } }),
    ]);
    // 获取每个下级的返利总额
    const referralIds = referrals.map(r => r.id);
    const commissions = await index_1.prisma.referralCommission.groupBy({
        by: ['refereeId'],
        where: {
            referrerId: userId,
            refereeId: { in: referralIds },
            type: client_1.CommissionType.RECHARGE_COMMISSION,
            status: client_1.CommissionStatus.SETTLED,
        },
        _sum: { amount: true },
    });
    const commissionMap = new Map(commissions.map(c => [c.refereeId, c._sum.amount || 0]));
    return {
        list: referrals.map(r => ({
            ...r,
            totalCommission: commissionMap.get(r.id) || 0,
        })),
        total,
        page,
        pageSize,
    };
}
/**
 * 获取返利记录
 */
async function getCommissionRecords(userId, params) {
    const { page = 1, pageSize = 20, type } = params;
    const skip = (page - 1) * pageSize;
    const where = {
        referrerId: userId,
        ...(type && { type }),
    };
    const [records, total] = await Promise.all([
        index_1.prisma.referralCommission.findMany({
            where,
            include: {
                referee: {
                    select: { id: true, nickname: true, username: true, avatar: true },
                },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: pageSize,
        }),
        index_1.prisma.referralCommission.count({ where }),
    ]);
    return { list: records, total, page, pageSize };
}
/**
 * 申请提现
 */
async function requestWithdrawal(params) {
    const { userId, amount, type, alipayAccount, alipayName } = params;
    // 获取配置
    const config = await getReferralConfig();
    // 获取用户余额
    const user = await index_1.prisma.user.findUnique({
        where: { id: userId },
        select: { referralBalance: true },
    });
    if (!user) {
        return { success: false, message: '用户不存在' };
    }
    // 检查余额
    if (user.referralBalance < amount) {
        return { success: false, message: '余额不足' };
    }
    // 检查最低提现金额
    if (amount < config.minWithdrawAmount) {
        return { success: false, message: `最低提现金额为 ${(config.minWithdrawAmount / 100).toFixed(0)} 元` };
    }
    // 支付宝提现需要账号信息
    if (type === client_1.WithdrawalType.ALIPAY) {
        if (!alipayAccount || !alipayName) {
            return { success: false, message: '请填写支付宝账号和姓名' };
        }
    }
    // 检查是否有待处理的提现申请
    const pending = await index_1.prisma.withdrawalRequest.findFirst({
        where: { userId, status: { in: [client_1.WithdrawalStatus.PENDING, client_1.WithdrawalStatus.APPROVED] } },
    });
    if (pending) {
        return { success: false, message: '您有待处理的提现申请，请等待处理完成' };
    }
    // 事务：扣减余额 + 创建提现申请
    const result = await index_1.prisma.$transaction(async (tx) => {
        // 1. 扣减余额
        await tx.user.update({
            where: { id: userId },
            data: { referralBalance: { decrement: amount } },
        });
        // 2. 创建提现申请
        const withdrawal = await tx.withdrawalRequest.create({
            data: {
                userId,
                amount,
                type,
                alipayAccount: type === client_1.WithdrawalType.ALIPAY ? alipayAccount : null,
                alipayName: type === client_1.WithdrawalType.ALIPAY ? alipayName : null,
                status: type === client_1.WithdrawalType.CREDITS ? client_1.WithdrawalStatus.PENDING : client_1.WithdrawalStatus.PENDING,
            },
        });
        // 如果是兑换积分，自动处理
        if (type === client_1.WithdrawalType.CREDITS) {
            const creditsToGrant = Math.floor((amount / 100) * config.withdrawToCreditsRate);
            await tx.user.update({
                where: { id: userId },
                data: { credits: { increment: creditsToGrant } },
            });
            const userAfter = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
            await tx.creditTransaction.create({
                data: {
                    userId,
                    type: 'GIFT',
                    amount: creditsToGrant,
                    balance: userAfter?.credits || 0,
                    description: `返利余额兑换积分 (${(amount / 100).toFixed(2)}元)`,
                },
            });
            await tx.withdrawalRequest.update({
                where: { id: withdrawal.id },
                data: {
                    status: client_1.WithdrawalStatus.COMPLETED,
                    creditsGranted: creditsToGrant,
                    processedAt: new Date(),
                },
            });
            return { withdrawal, creditsGranted: creditsToGrant };
        }
        return { withdrawal };
    });
    if (type === client_1.WithdrawalType.CREDITS) {
        logger_1.default.info(`[Referral] 积分兑换: userId=${userId}, amount=${amount}分, credits=${result.creditsGranted}`);
        return { success: true, message: `兑换成功，已到账 ${result.creditsGranted} 积分`, data: result };
    }
    logger_1.default.info(`[Referral] 提现申请: userId=${userId}, amount=${amount}分, alipay=${alipayAccount}`);
    return { success: true, message: '提现申请已提交，请等待审核', data: result };
}
/**
 * 获取用户的提现记录
 */
async function getWithdrawalRecords(userId, params) {
    const { page = 1, pageSize = 20 } = params;
    const skip = (page - 1) * pageSize;
    const [records, total] = await Promise.all([
        index_1.prisma.withdrawalRequest.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            skip,
            take: pageSize,
        }),
        index_1.prisma.withdrawalRequest.count({ where: { userId } }),
    ]);
    return { list: records, total, page, pageSize };
}
// ============== 管理后台功能 ==============
/**
 * 获取提现申请列表（管理后台）
 */
async function getWithdrawalRequests(params) {
    const { page = 1, pageSize = 20, status } = params;
    const skip = (page - 1) * pageSize;
    const where = status ? { status } : {};
    const [records, total] = await Promise.all([
        index_1.prisma.withdrawalRequest.findMany({
            where,
            include: {
                user: {
                    select: { id: true, nickname: true, username: true, phone: true },
                },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: pageSize,
        }),
        index_1.prisma.withdrawalRequest.count({ where }),
    ]);
    return { list: records, total, page, pageSize };
}
/**
 * 处理提现申请（管理后台）
 */
async function processWithdrawal(params) {
    const { id, action, adminId, rejectReason } = params;
    const withdrawal = await index_1.prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!withdrawal) {
        return { success: false, message: '提现申请不存在' };
    }
    if (action === 'approve') {
        if (withdrawal.status !== client_1.WithdrawalStatus.PENDING) {
            return { success: false, message: '只能审核待处理的申请' };
        }
        await index_1.prisma.withdrawalRequest.update({
            where: { id },
            data: { status: client_1.WithdrawalStatus.APPROVED, processedBy: adminId },
        });
        return { success: true, message: '已通过，请尽快完成打款' };
    }
    if (action === 'complete') {
        if (withdrawal.status !== client_1.WithdrawalStatus.APPROVED) {
            return { success: false, message: '只能完成已通过的申请' };
        }
        await index_1.prisma.withdrawalRequest.update({
            where: { id },
            data: { status: client_1.WithdrawalStatus.COMPLETED, processedAt: new Date() },
        });
        logger_1.default.info(`[Referral] 提现完成: id=${id}, userId=${withdrawal.userId}, amount=${withdrawal.amount}分`);
        return { success: true, message: '已标记为完成' };
    }
    if (action === 'reject') {
        if (withdrawal.status !== client_1.WithdrawalStatus.PENDING) {
            return { success: false, message: '只能拒绝待处理的申请' };
        }
        // 退回余额
        await index_1.prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: withdrawal.userId },
                data: { referralBalance: { increment: withdrawal.amount } },
            });
            await tx.withdrawalRequest.update({
                where: { id },
                data: {
                    status: client_1.WithdrawalStatus.REJECTED,
                    processedBy: adminId,
                    processedAt: new Date(),
                    rejectReason,
                },
            });
        });
        logger_1.default.info(`[Referral] 提现拒绝: id=${id}, userId=${withdrawal.userId}, reason=${rejectReason}`);
        return { success: true, message: '已拒绝，余额已退回' };
    }
    return { success: false, message: '无效操作' };
}
/**
 * 获取推荐统计（管理后台）
 */
async function getReferralStats() {
    const [totalUsers, usersWithReferrer, totalCommissions, pendingWithdrawals, completedWithdrawals,] = await Promise.all([
        index_1.prisma.user.count(),
        index_1.prisma.user.count({ where: { referredById: { not: null } } }),
        index_1.prisma.referralCommission.aggregate({
            where: { status: client_1.CommissionStatus.SETTLED },
            _sum: { amount: true },
        }),
        index_1.prisma.withdrawalRequest.aggregate({
            where: { status: client_1.WithdrawalStatus.PENDING },
            _sum: { amount: true },
            _count: true,
        }),
        index_1.prisma.withdrawalRequest.aggregate({
            where: { status: client_1.WithdrawalStatus.COMPLETED },
            _sum: { amount: true },
            _count: true,
        }),
    ]);
    return {
        totalUsers,
        usersWithReferrer,
        referralRate: totalUsers > 0 ? (usersWithReferrer / totalUsers * 100).toFixed(1) : '0',
        totalCommissions: totalCommissions._sum.amount || 0,
        pendingWithdrawals: {
            count: pendingWithdrawals._count || 0,
            amount: pendingWithdrawals._sum.amount || 0,
        },
        completedWithdrawals: {
            count: completedWithdrawals._count || 0,
            amount: completedWithdrawals._sum.amount || 0,
        },
    };
}
exports.default = {
    generateReferralCode,
    getReferralConfig,
    updateReferralConfig,
    ensureUserReferralCode,
    findReferrerByCode,
    bindReferralAndGrantBonus,
    processRechargeCommission,
    getUserReferralInfo,
    getUserReferrals,
    getCommissionRecords,
    requestWithdrawal,
    getWithdrawalRecords,
    getWithdrawalRequests,
    processWithdrawal,
    getReferralStats,
};
//# sourceMappingURL=referral.service.js.map