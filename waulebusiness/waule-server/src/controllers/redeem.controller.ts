/**
 * 兑换码控制器
 */

import { Request, Response } from 'express';
import { prisma } from '../index';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import crypto from 'crypto';

// 会员等级优先级
const ROLE_PRIORITY: Record<string, number> = {
  USER: 0,
  VIP: 1,
  SVIP: 2,
  ADMIN: 3,
};

/**
 * 生成16位兑换码
 */
function generateCode(): string {
  // 使用大写字母和数字，排除容易混淆的字符（0, O, I, 1, L）
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = crypto.randomBytes(16);
  for (let i = 0; i < 16; i++) {
    code += chars[bytes[i] % chars.length];
  }
  // 格式化为 XXXX-XXXX-XXXX-XXXX
  return code;
}

// ============== 管理员接口 ==============

/**
 * 获取兑换码列表
 */
export const getRedeemCodes = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, pageSize = 20, status, batchId } = req.query;
  
  const where: any = {};
  if (status === 'used') {
    where.isUsed = true;
  } else if (status === 'unused') {
    where.isUsed = false;
  }
  if (batchId) {
    where.batchId = batchId;
  }
  
  const [codes, total] = await Promise.all([
    prisma.redeemCode.findMany({
      where,
      include: {
        usedBy: { select: { id: true, nickname: true, phone: true } },
        createdBy: { select: { id: true, nickname: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(pageSize),
      take: Number(pageSize),
    }),
    prisma.redeemCode.count({ where }),
  ]);

  res.json({
    success: true,
    data: codes,
    pagination: {
      page: Number(page),
      pageSize: Number(pageSize),
      total,
      totalPages: Math.ceil(total / Number(pageSize)),
    },
  });
});

/**
 * 批量生成兑换码
 */
export const generateRedeemCodes = asyncHandler(async (req: Request, res: Response) => {
  const { count = 1, credits, memberLevel, memberDays, expireAt, remark } = req.body;
  const adminId = req.user!.id;

  if (!credits || credits <= 0) {
    throw new AppError('积分数量必须大于0', 400);
  }

  if (count < 1 || count > 100) {
    throw new AppError('单次生成数量必须在1-100之间', 400);
  }

  // 生成批次ID
  const batchId = `BATCH_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  // 生成兑换码
  const codes: string[] = [];
  const existingCodes = new Set<string>();
  
  // 先查询现有兑换码避免重复
  const existing = await prisma.redeemCode.findMany({
    select: { code: true },
  });
  existing.forEach((e: { code: string }) => existingCodes.add(e.code));

  // 生成唯一的兑换码
  while (codes.length < count) {
    const code = generateCode();
    if (!existingCodes.has(code) && !codes.includes(code)) {
      codes.push(code);
    }
  }

  // 批量插入
  const data = codes.map(code => ({
    code,
    credits: Number(credits),
    memberLevel: memberLevel || null,
    memberDays: memberDays ? Number(memberDays) : null,
    expireAt: expireAt ? new Date(expireAt) : null,
    remark: remark || null,
    batchId,
    createdById: adminId,
  }));

  await prisma.redeemCode.createMany({ data });

  logger.info(`[Redeem] 管理员 ${adminId} 生成了 ${count} 个兑换码，批次 ${batchId}`);

  res.json({
    success: true,
    message: `成功生成 ${count} 个兑换码`,
    data: {
      batchId,
      codes,
      count,
    },
  });
});

/**
 * 删除兑换码
 */
export const deleteRedeemCode = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const code = await prisma.redeemCode.findUnique({ where: { id } });
  if (!code) {
    throw new AppError('兑换码不存在', 404);
  }
  if (code.isUsed) {
    throw new AppError('已使用的兑换码无法删除', 400);
  }

  await prisma.redeemCode.delete({ where: { id } });

  res.json({
    success: true,
    message: '删除成功',
  });
});

/**
 * 批量删除兑换码（按批次）
 */
export const deleteBatch = asyncHandler(async (req: Request, res: Response) => {
  const { batchId } = req.params;

  const result = await prisma.redeemCode.deleteMany({
    where: {
      batchId,
      isUsed: false, // 只删除未使用的
    },
  });

  res.json({
    success: true,
    message: `成功删除 ${result.count} 个兑换码`,
    data: { deletedCount: result.count },
  });
});

/**
 * 获取批次列表
 */
export const getBatches = asyncHandler(async (req: Request, res: Response) => {
  const batches = await prisma.redeemCode.groupBy({
    by: ['batchId', 'credits', 'memberLevel', 'memberDays', 'remark'],
    _count: { id: true },
    _min: { createdAt: true },
    where: { batchId: { not: null } },
    orderBy: { _min: { createdAt: 'desc' } },
  });

  // 统计每个批次的使用情况
  const batchStats = await Promise.all(
    batches.map(async (batch: any) => {
      const used = await prisma.redeemCode.count({
        where: { batchId: batch.batchId!, isUsed: true },
      });
      return {
        batchId: batch.batchId,
        credits: batch.credits,
        memberLevel: batch.memberLevel,
        memberDays: batch.memberDays,
        remark: batch.remark,
        total: batch._count.id,
        used,
        unused: batch._count.id - used,
        createdAt: batch._min.createdAt,
      };
    })
  );

  res.json({
    success: true,
    data: batchStats,
  });
});

// ============== 用户接口 ==============

/**
 * 兑换码兑换
 */
export const redeemCode = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body;
  const userId = req.user!.id;

  if (!code) {
    throw new AppError('请输入兑换码', 400);
  }

  // 清理兑换码格式（去除空格和横杠）
  const cleanCode = code.replace(/[\s-]/g, '').toUpperCase();

  // 查找兑换码
  const redeemCode = await prisma.redeemCode.findUnique({
    where: { code: cleanCode },
  });

  if (!redeemCode) {
    throw new AppError('兑换码不存在', 404);
  }

  if (redeemCode.isUsed) {
    throw new AppError('兑换码已被使用', 400);
  }

  if (redeemCode.expireAt && new Date() > redeemCode.expireAt) {
    throw new AppError('兑换码已过期', 400);
  }

  // 获取用户当前信息
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError('用户不存在', 404);
  }

  // 计算新的会员等级（向上原则）
  let newRole = user.role;
  if (redeemCode.memberLevel) {
    const currentPriority = ROLE_PRIORITY[user.role] || 0;
    const codePriority = ROLE_PRIORITY[redeemCode.memberLevel] || 0;
    if (codePriority > currentPriority) {
      newRole = redeemCode.memberLevel;
    }
  }

  // 事务：更新兑换码状态、用户积分和等级、创建流水
  const result = await prisma.$transaction(async (tx) => {
    // 1. 标记兑换码已使用
    await tx.redeemCode.update({
      where: { id: redeemCode.id },
      data: {
        isUsed: true,
        usedAt: new Date(),
        usedById: userId,
      },
    });

    // 2. 更新用户积分和等级
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        credits: { increment: redeemCode.credits },
        role: newRole,
      },
    });

    // 3. 创建积分流水
    await tx.creditTransaction.create({
      data: {
        userId,
        type: 'REDEEM',
        amount: redeemCode.credits,
        balance: updatedUser.credits,
        description: `兑换码兑换：${cleanCode.substring(0, 4)}****`,
      },
    });

    return updatedUser;
  });

  logger.info(`[Redeem] 用户 ${userId} 使用兑换码 ${cleanCode}，获得 ${redeemCode.credits} 积分`);

  res.json({
    success: true,
    message: '兑换成功',
    data: {
      credits: redeemCode.credits,
      memberLevel: newRole !== user.role ? newRole : null,
      newBalance: result.credits,
    },
  });
});
