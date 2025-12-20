import { prisma } from '../index';
import { CommissionType, CommissionStatus, WithdrawalType, WithdrawalStatus } from '@prisma/client';
import logger from '../utils/logger';

/**
 * 生成唯一推荐码（6位字母数字）
 */
export async function generateReferralCode(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 排除容易混淆的字符
  let code: string;
  let exists = true;
  
  while (exists) {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const existing = await prisma.user.findUnique({ where: { referralCode: code } });
    exists = !!existing;
  }
  
  return code!;
}

/**
 * 获取推荐配置（单例，如果不存在则创建默认配置）
 */
export async function getReferralConfig() {
  let config = await prisma.referralConfig.findFirst();
  
  if (!config) {
    config = await prisma.referralConfig.create({
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
export async function updateReferralConfig(data: {
  isActive?: boolean;
  referrerBonus?: number;
  refereeBonus?: number;
  commissionRate?: number;
  minWithdrawAmount?: number;
  withdrawToCreditsRate?: number;
}) {
  const config = await getReferralConfig();
  
  return prisma.referralConfig.update({
    where: { id: config.id },
    data,
  });
}

/**
 * 为用户分配推荐码（如果还没有）
 */
export async function ensureUserReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  
  if (user?.referralCode) {
    return user.referralCode;
  }
  
  const code = await generateReferralCode();
  await prisma.user.update({
    where: { id: userId },
    data: { referralCode: code },
  });
  
  return code;
}

/**
 * 通过推荐码查找推荐人
 */
export async function findReferrerByCode(code: string) {
  return prisma.user.findUnique({
    where: { referralCode: code.toUpperCase() },
    select: { id: true, nickname: true, username: true },
  });
}

/**
 * 绑定推荐关系并发放注册奖励
 */
export async function bindReferralAndGrantBonus(params: {
  refereeId: string;
  referralCode: string;
}): Promise<{ success: boolean; message: string }> {
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
  const referee = await prisma.user.findUnique({
    where: { id: refereeId },
    select: { referredById: true },
  });
  
  if (referee?.referredById) {
    return { success: false, message: '已绑定推荐人' };
  }
  
  // 事务：绑定关系 + 发放奖励
  await prisma.$transaction(async (tx) => {
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
          type: CommissionType.REGISTER_BONUS,
          amount: config.referrerBonus,
          status: CommissionStatus.SETTLED,
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
  
  logger.info(`[Referral] 推荐关系绑定成功: ${referrer.id} -> ${refereeId}, 推荐人奖励=${config.referrerBonus}, 被推荐人奖励=${config.refereeBonus}`);
  
  return { success: true, message: '推荐码绑定成功' };
}

/**
 * 处理充值返利
 */
export async function processRechargeCommission(params: {
  userId: string;
  orderId: string;
  amount: number; // 充值金额（分）
}): Promise<void> {
  const { userId, orderId, amount } = params;
  
  // 获取配置
  const config = await getReferralConfig();
  if (!config.isActive || config.commissionRate <= 0) {
    return;
  }
  
  // 查找用户的推荐人
  const user = await prisma.user.findUnique({
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
  const existing = await prisma.referralCommission.findFirst({
    where: { orderId, type: CommissionType.RECHARGE_COMMISSION },
  });
  if (existing) {
    return;
  }
  
  // 事务：记录返利 + 更新余额
  await prisma.$transaction(async (tx) => {
    // 1. 创建返利记录
    await tx.referralCommission.create({
      data: {
        referrerId: user.referredById!,
        refereeId: userId,
        orderId,
        type: CommissionType.RECHARGE_COMMISSION,
        amount: commissionAmount,
        rate: config.commissionRate,
        status: CommissionStatus.SETTLED,
        description: `下级用户充值返利 ${(amount / 100).toFixed(2)}元 × ${(config.commissionRate * 100).toFixed(0)}%`,
      },
    });
    
    // 2. 更新推荐人返利余额
    await tx.user.update({
      where: { id: user.referredById! },
      data: {
        referralBalance: { increment: commissionAmount },
        referralTotalEarned: { increment: commissionAmount },
      },
    });
  });
  
  logger.info(`[Referral] 充值返利: 推荐人=${user.referredById}, 被推荐人=${userId}, 充值=${amount}分, 返利=${commissionAmount}分 (${(config.commissionRate * 100).toFixed(0)}%)`);
}

/**
 * 获取用户的推荐信息
 */
export async function getUserReferralInfo(userId: string) {
  const user = await prisma.user.findUnique({
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
  const referralCount = await prisma.user.count({
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
export async function getUserReferrals(userId: string, params: {
  page?: number;
  pageSize?: number;
}) {
  const { page = 1, pageSize = 20 } = params;
  const skip = (page - 1) * pageSize;
  
  const [referrals, total] = await Promise.all([
    prisma.user.findMany({
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
    prisma.user.count({ where: { referredById: userId } }),
  ]);
  
  // 获取每个下级的返利总额
  const referralIds = referrals.map(r => r.id);
  const commissions = await prisma.referralCommission.groupBy({
    by: ['refereeId'],
    where: {
      referrerId: userId,
      refereeId: { in: referralIds },
      type: CommissionType.RECHARGE_COMMISSION,
      status: CommissionStatus.SETTLED,
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
export async function getCommissionRecords(userId: string, params: {
  page?: number;
  pageSize?: number;
  type?: CommissionType;
}) {
  const { page = 1, pageSize = 20, type } = params;
  const skip = (page - 1) * pageSize;
  
  const where = {
    referrerId: userId,
    ...(type && { type }),
  };
  
  const [records, total] = await Promise.all([
    prisma.referralCommission.findMany({
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
    prisma.referralCommission.count({ where }),
  ]);
  
  return { list: records, total, page, pageSize };
}

/**
 * 申请提现
 */
export async function requestWithdrawal(params: {
  userId: string;
  amount: number;
  type: WithdrawalType;
  alipayAccount?: string;
  alipayName?: string;
}): Promise<{ success: boolean; message: string; data?: any }> {
  const { userId, amount, type, alipayAccount, alipayName } = params;
  
  // 获取配置
  const config = await getReferralConfig();
  
  // 获取用户余额
  const user = await prisma.user.findUnique({
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
  if (type === WithdrawalType.ALIPAY) {
    if (!alipayAccount || !alipayName) {
      return { success: false, message: '请填写支付宝账号和姓名' };
    }
  }
  
  // 检查是否有待处理的提现申请
  const pending = await prisma.withdrawalRequest.findFirst({
    where: { userId, status: { in: [WithdrawalStatus.PENDING, WithdrawalStatus.APPROVED] } },
  });
  if (pending) {
    return { success: false, message: '您有待处理的提现申请，请等待处理完成' };
  }
  
  // 事务：扣减余额 + 创建提现申请
  const result = await prisma.$transaction(async (tx) => {
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
        alipayAccount: type === WithdrawalType.ALIPAY ? alipayAccount : null,
        alipayName: type === WithdrawalType.ALIPAY ? alipayName : null,
        status: type === WithdrawalType.CREDITS ? WithdrawalStatus.PENDING : WithdrawalStatus.PENDING,
      },
    });
    
    // 如果是兑换积分，自动处理
    if (type === WithdrawalType.CREDITS) {
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
          status: WithdrawalStatus.COMPLETED,
          creditsGranted: creditsToGrant,
          processedAt: new Date(),
        },
      });
      
      return { withdrawal, creditsGranted: creditsToGrant };
    }
    
    return { withdrawal };
  });
  
  if (type === WithdrawalType.CREDITS) {
    logger.info(`[Referral] 积分兑换: userId=${userId}, amount=${amount}分, credits=${(result as any).creditsGranted}`);
    return { success: true, message: `兑换成功，已到账 ${(result as any).creditsGranted} 积分`, data: result };
  }
  
  logger.info(`[Referral] 提现申请: userId=${userId}, amount=${amount}分, alipay=${alipayAccount}`);
  return { success: true, message: '提现申请已提交，请等待审核', data: result };
}

/**
 * 获取用户的提现记录
 */
export async function getWithdrawalRecords(userId: string, params: {
  page?: number;
  pageSize?: number;
}) {
  const { page = 1, pageSize = 20 } = params;
  const skip = (page - 1) * pageSize;
  
  const [records, total] = await Promise.all([
    prisma.withdrawalRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.withdrawalRequest.count({ where: { userId } }),
  ]);
  
  return { list: records, total, page, pageSize };
}

// ============== 管理后台功能 ==============

/**
 * 获取提现申请列表（管理后台）
 */
export async function getWithdrawalRequests(params: {
  page?: number;
  pageSize?: number;
  status?: WithdrawalStatus;
}) {
  const { page = 1, pageSize = 20, status } = params;
  const skip = (page - 1) * pageSize;
  
  const where = status ? { status } : {};
  
  const [records, total] = await Promise.all([
    prisma.withdrawalRequest.findMany({
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
    prisma.withdrawalRequest.count({ where }),
  ]);
  
  return { list: records, total, page, pageSize };
}

/**
 * 处理提现申请（管理后台）
 */
export async function processWithdrawal(params: {
  id: string;
  action: 'approve' | 'complete' | 'reject';
  adminId: string;
  rejectReason?: string;
}): Promise<{ success: boolean; message: string }> {
  const { id, action, adminId, rejectReason } = params;
  
  const withdrawal = await prisma.withdrawalRequest.findUnique({ where: { id } });
  if (!withdrawal) {
    return { success: false, message: '提现申请不存在' };
  }
  
  if (action === 'approve') {
    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      return { success: false, message: '只能审核待处理的申请' };
    }
    await prisma.withdrawalRequest.update({
      where: { id },
      data: { status: WithdrawalStatus.APPROVED, processedBy: adminId },
    });
    return { success: true, message: '已通过，请尽快完成打款' };
  }
  
  if (action === 'complete') {
    if (withdrawal.status !== WithdrawalStatus.APPROVED) {
      return { success: false, message: '只能完成已通过的申请' };
    }
    await prisma.withdrawalRequest.update({
      where: { id },
      data: { status: WithdrawalStatus.COMPLETED, processedAt: new Date() },
    });
    logger.info(`[Referral] 提现完成: id=${id}, userId=${withdrawal.userId}, amount=${withdrawal.amount}分`);
    return { success: true, message: '已标记为完成' };
  }
  
  if (action === 'reject') {
    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      return { success: false, message: '只能拒绝待处理的申请' };
    }
    
    // 退回余额
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: withdrawal.userId },
        data: { referralBalance: { increment: withdrawal.amount } },
      });
      await tx.withdrawalRequest.update({
        where: { id },
        data: {
          status: WithdrawalStatus.REJECTED,
          processedBy: adminId,
          processedAt: new Date(),
          rejectReason,
        },
      });
    });
    
    logger.info(`[Referral] 提现拒绝: id=${id}, userId=${withdrawal.userId}, reason=${rejectReason}`);
    return { success: true, message: '已拒绝，余额已退回' };
  }
  
  return { success: false, message: '无效操作' };
}

/**
 * 获取推荐统计（管理后台）
 */
export async function getReferralStats() {
  const [
    totalUsers,
    usersWithReferrer,
    totalCommissions,
    pendingWithdrawals,
    completedWithdrawals,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { referredById: { not: null } } }),
    prisma.referralCommission.aggregate({
      where: { status: CommissionStatus.SETTLED },
      _sum: { amount: true },
    }),
    prisma.withdrawalRequest.aggregate({
      where: { status: WithdrawalStatus.PENDING },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.withdrawalRequest.aggregate({
      where: { status: WithdrawalStatus.COMPLETED },
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

export default {
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
