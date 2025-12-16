/**
 * 支付控制器
 * 包含支付配置管理、套餐管理、订单管理等功能
 */

import { Request, Response } from 'express';
import { prisma } from '../index';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import * as paymentService from '../services/payment/payment.service';
import { logger } from '../utils/logger';

// ============== 支付配置管理（管理员） ==============

/**
 * 获取所有支付配置
 */
export const getPaymentConfigs = asyncHandler(async (req: Request, res: Response) => {
  const configs = await prisma.paymentConfig.findMany({
    orderBy: { createdAt: 'desc' },
  });

  // 隐藏敏感信息
  const safeConfigs = configs.map((config) => ({
    ...config,
    privateKey: config.privateKey ? '******' : null,
    publicKey: config.publicKey ? '******' : null,
  }));

  res.json({
    success: true,
    data: safeConfigs,
  });
});

/**
 * 获取单个支付配置（包含完整信息）
 */
export const getPaymentConfig = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const config = await prisma.paymentConfig.findUnique({
    where: { id },
  });

  if (!config) {
    throw new AppError('支付配置不存在', 404);
  }

  res.json({
    success: true,
    data: config,
  });
});

/**
 * 创建或更新支付配置
 */
export const upsertPaymentConfig = asyncHandler(async (req: Request, res: Response) => {
  const { provider, name, appId, privateKey, publicKey, config, isActive, isSandbox } = req.body;

  if (!provider || !name || !appId) {
    throw new AppError('缺少必要参数', 400);
  }

  const data = {
    name,
    appId,
    privateKey: privateKey || '',
    publicKey: publicKey || '',
    config: config || {},
    isActive: isActive !== false,
    isSandbox: isSandbox || false,
  };

  const result = await prisma.paymentConfig.upsert({
    where: { provider },
    create: { provider, ...data },
    update: data,
  });

  // 清除缓存
  paymentService.clearProviderCache(provider);

  res.json({
    success: true,
    message: '支付配置保存成功',
    data: {
      ...result,
      privateKey: '******',
      publicKey: '******',
    },
  });
});

/**
 * 删除支付配置
 */
export const deletePaymentConfig = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const config = await prisma.paymentConfig.findUnique({
    where: { id },
  });

  if (!config) {
    throw new AppError('支付配置不存在', 404);
  }

  await prisma.paymentConfig.delete({
    where: { id },
  });

  // 清除缓存
  paymentService.clearProviderCache(config.provider);

  res.json({
    success: true,
    message: '支付配置删除成功',
  });
});

/**
 * 测试支付配置连通性
 */
export const testPaymentConfig = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const config = await prisma.paymentConfig.findUnique({
    where: { id },
  });

  if (!config) {
    throw new AppError('支付配置不存在', 404);
  }

  try {
    // 使用支付服务测试连通性
    const result = await paymentService.testConnection(config);
    
    res.json({
      success: result.success,
      message: result.message,
      data: {
        provider: config.provider,
        isSandbox: config.isSandbox,
        responseTime: result.responseTime,
      },
    });
  } catch (error: any) {
    logger.error(`[Payment] 测试连通失败:`, error);
    res.json({
      success: false,
      message: error.message || '连接测试失败',
    });
  }
});

// ============== 套餐管理（管理员） ==============

/**
 * 获取所有套餐（管理员）
 */
export const getAllPackages = asyncHandler(async (req: Request, res: Response) => {
  const { type } = req.query;
  
  const packages = await prisma.creditPackage.findMany({
    where: type ? { type: type as any } : undefined,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });

  res.json({
    success: true,
    data: packages,
  });
});

/**
 * 获取活跃套餐（用户端）
 */
export const getActivePackages = asyncHandler(async (req: Request, res: Response) => {
  const { type } = req.query;
  
  const packages = await prisma.creditPackage.findMany({
    where: { 
      isActive: true,
      ...(type ? { type: type as any } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });

  res.json({
    success: true,
    data: packages,
  });
});

/**
 * 创建套餐
 */
export const createPackage = asyncHandler(async (req: Request, res: Response) => {
  const {
    type,
    name,
    description,
    price,
    credits,
    bonusCredits,
    memberLevel,
    memberDays,
    coverImage,
    badge,
    badgeColor,
    sortOrder,
    isActive,
    isRecommend,
  } = req.body;

  if (!name || !price || !credits) {
    throw new AppError('缺少必要参数：name, price, credits', 400);
  }

  const pkg = await prisma.creditPackage.create({
    data: {
      type: type || 'RECHARGE',
      name,
      description,
      price: Number(price),
      credits: Number(credits),
      bonusCredits: Number(bonusCredits) || 0,
      memberLevel: type === 'CREDITS' ? null : memberLevel, // 积分购买不设置会员等级
      memberDays: type === 'CREDITS' ? null : (memberDays ? Number(memberDays) : null),
      coverImage,
      badge,
      badgeColor,
      sortOrder: Number(sortOrder) || 0,
      isActive: isActive !== false,
      isRecommend: isRecommend || false,
    },
  });

  res.status(201).json({
    success: true,
    message: '套餐创建成功',
    data: pkg,
  });
});

/**
 * 更新套餐
 */
export const updatePackage = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    type,
    name,
    description,
    price,
    credits,
    bonusCredits,
    memberLevel,
    memberDays,
    coverImage,
    badge,
    badgeColor,
    sortOrder,
    isActive,
    isRecommend,
  } = req.body;

  const existing = await prisma.creditPackage.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new AppError('套餐不存在', 404);
  }

  // 如果类型是积分购买，清除会员相关字段
  const effectiveType = type || existing.type;
  
  const pkg = await prisma.creditPackage.update({
    where: { id },
    data: {
      ...(type && { type }),
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(price !== undefined && { price: Number(price) }),
      ...(credits !== undefined && { credits: Number(credits) }),
      ...(bonusCredits !== undefined && { bonusCredits: Number(bonusCredits) }),
      ...(memberLevel !== undefined && { memberLevel: effectiveType === 'CREDITS' ? null : memberLevel }),
      ...(memberDays !== undefined && { memberDays: effectiveType === 'CREDITS' ? null : (memberDays ? Number(memberDays) : null) }),
      ...(coverImage !== undefined && { coverImage }),
      ...(badge !== undefined && { badge }),
      ...(badgeColor !== undefined && { badgeColor }),
      ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
      ...(typeof isActive === 'boolean' && { isActive }),
      ...(typeof isRecommend === 'boolean' && { isRecommend }),
    },
  });

  res.json({
    success: true,
    message: '套餐更新成功',
    data: pkg,
  });
});

/**
 * 删除套餐
 */
export const deletePackage = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const existing = await prisma.creditPackage.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new AppError('套餐不存在', 404);
  }

  // 检查是否有关联订单
  const orderCount = await prisma.paymentOrder.count({
    where: { packageId: id },
  });

  if (orderCount > 0) {
    // 软删除（标记为不活跃）
    await prisma.creditPackage.update({
      where: { id },
      data: { isActive: false },
    });

    res.json({
      success: true,
      message: '套餐已下架（有关联订单，无法删除）',
    });
  } else {
    await prisma.creditPackage.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: '套餐删除成功',
    });
  }
});

// ============== 用户支付功能 ==============

/**
 * 创建充值订单
 */
export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { packageId, paymentMethod = 'ALIPAY' } = req.body;

  if (!packageId) {
    throw new AppError('请选择充值套餐', 400);
  }

  const clientIp = req.ip || req.headers['x-forwarded-for'] as string;

  const result = await paymentService.createRechargeOrder({
    userId,
    packageId,
    paymentMethod,
    clientIp,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * 查询订单状态
 */
export const getOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const { orderNo } = req.params;

  const result = await paymentService.queryOrderStatus(orderNo);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * 获取用户订单列表
 */
export const getUserOrders = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { page, limit, status } = req.query;

  const result = await paymentService.getUserOrders(userId, {
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    status: status as any,
  });

  res.json({
    success: true,
    ...result,
  });
});

/**
 * 获取用户积分流水
 */
export const getUserTransactions = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { page, limit, type } = req.query;

  const result = await paymentService.getUserTransactions(userId, {
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    type: type as any,
  });

  res.json({
    success: true,
    ...result,
  });
});

// ============== 支付回调（公开接口） ==============

/**
 * 支付宝回调
 */
export const alipayCallback = asyncHandler(async (req: Request, res: Response) => {
  logger.info('[Alipay] 收到回调:', JSON.stringify(req.body));

  try {
    await paymentService.handlePaymentCallback('ALIPAY', req.body);
    // 支付宝要求返回 "success" 字符串
    res.send('success');
  } catch (error: any) {
    logger.error('[Alipay] 回调处理失败:', error);
    res.send('fail');
  }
});

/**
 * 微信支付回调（预留）
 */
export const wechatCallback = asyncHandler(async (req: Request, res: Response) => {
  logger.info('[Wechat] 收到回调:', JSON.stringify(req.body));

  try {
    await paymentService.handlePaymentCallback('WECHAT', req.body);
    res.json({ code: 'SUCCESS', message: '成功' });
  } catch (error: any) {
    logger.error('[Wechat] 回调处理失败:', error);
    res.json({ code: 'FAIL', message: error.message });
  }
});

// ============== 管理员订单管理 ==============

/**
 * 管理员手动确认订单（处理漏单情况）
 */
export const adminConfirmOrder = asyncHandler(async (req: Request, res: Response) => {
  const { orderNo, tradeNo } = req.body;

  if (!orderNo) {
    throw new AppError('缺少订单号', 400);
  }

  const order = await prisma.paymentOrder.findUnique({
    where: { orderNo },
    include: { package: true },
  });

  if (!order) {
    throw new AppError('订单不存在', 404);
  }

  // 检查是否已有积分交易记录
  const existingTransaction = await prisma.creditTransaction.findFirst({
    where: { orderId: order.id },
  });

  if (existingTransaction) {
    return res.json({
      success: false,
      message: '该订单已处理过积分发放，无需重复确认',
      data: { orderNo, status: order.status, transactionId: existingTransaction.id },
    });
  }

  // 使用事务处理积分发放
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: order.userId },
    });

    if (!user) {
      throw new AppError('用户不存在', 404);
    }

    const now = new Date();
    const newBalance = user.credits + order.credits;

    // 更新订单状态（如果还不是 PAID）
    if (order.status !== 'PAID') {
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: {
          status: 'PAID',
          tradeNo: tradeNo || `ADMIN_CONFIRM_${Date.now()}`,
          paidAt: now,
        },
      });
    }

    // 更新用户积分
    await tx.user.update({
      where: { id: order.userId },
      data: { credits: newBalance },
    });

    // 创建积分流水
    await tx.creditTransaction.create({
      data: {
        userId: order.userId,
        type: 'RECHARGE',
        amount: order.credits,
        balance: newBalance,
        orderId: order.id,
        description: `[管理员确认] 充值${order.package?.name || '积分包'} +${order.credits}积分`,
      },
    });

    // 如果套餐包含会员升级
    if (order.package?.memberLevel) {
      const memberData: any = { role: order.package.memberLevel };
      
      if (order.package.memberDays && order.package.memberDays > 0) {
        const currentExpire = user.membershipExpireAt;
        const baseDate = (currentExpire && currentExpire > now) ? currentExpire : now;
        memberData.membershipExpireAt = new Date(baseDate.getTime() + order.package.memberDays * 24 * 60 * 60 * 1000);
      }
      
      await tx.user.update({
        where: { id: order.userId },
        data: memberData,
      });
    }
  });

  logger.info(`[Admin] 手动确认订单成功: ${orderNo}, 操作人: ${req.user?.id}`);

  res.json({
    success: true,
    message: '订单确认成功，积分已发放',
    data: { orderNo, credits: order.credits },
  });
});

/**
 * 管理员手动给用户充值
 */
export const adminRecharge = asyncHandler(async (req: Request, res: Response) => {
  const { userId, credits, description } = req.body;

  if (!userId || !credits) {
    throw new AppError('缺少必要参数：userId, credits', 400);
  }

  const creditsNum = Number(credits);
  if (isNaN(creditsNum) || creditsNum === 0) {
    throw new AppError('积分数量无效', 400);
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('用户不存在', 404);
    }

    const newBalance = user.credits + creditsNum;

    await tx.user.update({
      where: { id: userId },
      data: { credits: newBalance },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        type: creditsNum > 0 ? 'ADMIN' : 'ADMIN',
        amount: creditsNum,
        balance: newBalance,
        description: description || `管理员${creditsNum > 0 ? '充值' : '扣除'} ${Math.abs(creditsNum)} 积分`,
      },
    });
  });

  res.json({
    success: true,
    message: `${creditsNum > 0 ? '充值' : '扣除'}成功`,
  });
});
