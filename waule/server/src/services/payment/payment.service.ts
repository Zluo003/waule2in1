/**
 * 支付服务
 * 管理支付配置、订单创建、状态查询等
 */

import { prisma } from '../../index';
import { PaymentProvider, PaymentProviderConfig, CreateOrderParams } from './payment.interface';
import { AlipayProvider } from './alipay.provider';
import { logger } from '../../utils/logger';
import { PaymentProvider as PaymentProviderEnum, OrderStatus, TransactionType } from '@prisma/client';

// 缓存支付提供者实例
const providerCache = new Map<string, PaymentProvider>();

/**
 * 获取支付提供者实例
 */
export async function getPaymentProvider(provider: PaymentProviderEnum): Promise<PaymentProvider | null> {
  // 检查缓存
  const cacheKey = provider;
  if (providerCache.has(cacheKey)) {
    return providerCache.get(cacheKey)!;
  }

  // 从数据库获取配置
  const config = await prisma.paymentConfig.findUnique({
    where: { provider },
  });

  if (!config || !config.isActive) {
    logger.warn(`[PaymentService] 支付配置不存在或未启用: ${provider}`);
    return null;
  }

  // 构建配置
  const providerConfig: PaymentProviderConfig = {
    appId: config.appId,
    privateKey: config.privateKey,
    publicKey: config.publicKey,
    isSandbox: config.isSandbox,
    ...(config.config as object || {}),
  };

  // 创建提供者实例
  let instance: PaymentProvider;

  switch (provider) {
    case 'ALIPAY':
      instance = new AlipayProvider(providerConfig);
      break;
    case 'WECHAT':
      // 预留微信支付
      throw new Error('微信支付暂未实现');
    default:
      throw new Error(`不支持的支付渠道: ${provider}`);
  }

  // 缓存实例
  providerCache.set(cacheKey, instance);

  return instance;
}

/**
 * 清除支付提供者缓存（配置更新后调用）
 */
export function clearProviderCache(provider?: PaymentProviderEnum) {
  if (provider) {
    providerCache.delete(provider);
  } else {
    providerCache.clear();
  }
}

/**
 * 测试支付配置连通性
 */
export async function testConnection(config: {
  provider: PaymentProviderEnum;
  appId: string;
  privateKey: string;
  publicKey: string;
  isSandbox: boolean;
  config?: any;
}): Promise<{ success: boolean; message: string; responseTime?: number }> {
  const startTime = Date.now();
  
  try {
    // 构建配置
    const providerConfig: PaymentProviderConfig = {
      appId: config.appId,
      privateKey: config.privateKey,
      publicKey: config.publicKey,
      isSandbox: config.isSandbox,
      ...(config.config as object || {}),
    };

    // 创建临时提供者实例（不使用缓存）
    let instance: PaymentProvider;

    switch (config.provider) {
      case 'ALIPAY':
        instance = new AlipayProvider(providerConfig);
        break;
      case 'WECHAT':
        return { success: false, message: '微信支付暂未实现' };
      case 'MANUAL':
        return { success: true, message: '人工充值无需测试连通性' };
      default:
        return { success: false, message: `不支持的支付渠道: ${config.provider}` };
    }

    // 用一个不存在的订单号查询来测试连通性
    // 如果签名正确，即使订单不存在也会返回 success: true
    const testOrderNo = `TEST_${Date.now()}`;
    const result = await instance.queryStatus(testOrderNo);
    const responseTime = Date.now() - startTime;

    // 如果返回成功（不管订单是否存在），说明配置正确、签名验证通过
    if (result.success) {
      return { 
        success: true, 
        message: `连接成功（响应时间: ${responseTime}ms）`,
        responseTime,
      };
    }

    // 如果返回失败，可能是签名错误或其他配置问题
    return { 
      success: false, 
      message: result.errorMessage || '连接失败',
      responseTime,
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    logger.error(`[PaymentService] 测试连通失败:`, error);
    
    // 分析错误信息
    const errorMsg = error.message || '未知错误';
    if (errorMsg.includes('签名') || errorMsg.includes('sign')) {
      return { success: false, message: '签名验证失败，请检查私钥和公钥配置', responseTime };
    }
    if (errorMsg.includes('appid') || errorMsg.includes('app_id')) {
      return { success: false, message: 'AppID 配置错误', responseTime };
    }
    if (errorMsg.includes('ENOTFOUND') || errorMsg.includes('network')) {
      return { success: false, message: '网络连接失败，请检查网络环境', responseTime };
    }
    
    return { success: false, message: errorMsg, responseTime };
  }
}

/**
 * 生成订单号
 */
export function generateOrderNo(): string {
  const date = new Date();
  const dateStr = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join('');
  
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  return `AV${dateStr}${random}`;
}

/**
 * 创建充值订单
 */
export async function createRechargeOrder(params: {
  userId: string;
  packageId: string;
  paymentMethod: PaymentProviderEnum;
  clientIp?: string;
}) {
  const { userId, packageId, paymentMethod, clientIp } = params;

  // 获取套餐信息
  const pkg = await prisma.creditPackage.findUnique({
    where: { id: packageId },
  });

  if (!pkg || !pkg.isActive) {
    throw new Error('套餐不存在或已下架');
  }

  // 获取支付提供者
  const provider = await getPaymentProvider(paymentMethod);
  if (!provider) {
    throw new Error('支付渠道未配置或未启用');
  }

  // 生成订单号
  const orderNo = generateOrderNo();

  // 计算过期时间（30分钟）
  const expireAt = new Date(Date.now() + 30 * 60 * 1000);

  // 创建订单
  const order = await prisma.paymentOrder.create({
    data: {
      orderNo,
      userId,
      packageId,
      amount: pkg.price,
      credits: pkg.credits + pkg.bonusCredits,
      paymentMethod,
      status: 'PENDING',
      expireAt,
      metadata: {
        clientIp,
        packageName: pkg.name,
        originalCredits: pkg.credits,
        bonusCredits: pkg.bonusCredits,
      },
    },
  });

  // 调用支付接口生成二维码
  const createParams: CreateOrderParams = {
    orderNo,
    amount: pkg.price,
    subject: `${pkg.name} - ${pkg.credits + pkg.bonusCredits}积分`,
    body: pkg.description || undefined,
    timeoutExpress: '30m',
  };

  const result = await provider.createQRCode(createParams);

  if (!result.success) {
    // 更新订单状态为失败
    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: 'FAILED',
        metadata: {
          ...(order.metadata as object || {}),
          errorMessage: result.errorMessage,
        },
      },
    });

    throw new Error(result.errorMessage || '创建支付订单失败');
  }

  // 更新订单二维码信息
  await prisma.paymentOrder.update({
    where: { id: order.id },
    data: {
      qrCodeUrl: result.qrCodeUrl,
      qrCodeExpireAt: result.expireTime,
    },
  });

  return {
    orderId: order.id,
    orderNo,
    qrCodeUrl: result.qrCodeUrl,
    amount: pkg.price,
    credits: pkg.credits + pkg.bonusCredits,
    expireAt: result.expireTime || expireAt,
    package: {
      name: pkg.name,
      credits: pkg.credits,
      bonusCredits: pkg.bonusCredits,
    },
  };
}

/**
 * 查询订单状态（主动查询）
 */
export async function queryOrderStatus(orderNo: string) {
  const order = await prisma.paymentOrder.findUnique({
    where: { orderNo },
    include: { package: true },
  });

  if (!order) {
    throw new Error('订单不存在');
  }

  // 如果订单已完成，直接返回
  if (order.status !== 'PENDING') {
    return {
      orderNo: order.orderNo,
      status: order.status,
      paidAt: order.paidAt,
      credits: order.credits,
    };
  }

  // 检查是否过期
  if (order.expireAt < new Date()) {
    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'EXPIRED' },
    });

    return {
      orderNo: order.orderNo,
      status: 'EXPIRED',
      credits: order.credits,
    };
  }

  // 主动查询支付状态
  const provider = await getPaymentProvider(order.paymentMethod);
  if (!provider) {
    return {
      orderNo: order.orderNo,
      status: order.status,
      credits: order.credits,
    };
  }

  const result = await provider.queryStatus(orderNo);

  if (result.success && result.status === 'PAID') {
    // 更新订单和用户积分
    await handlePaymentSuccess(order.id, result.tradeNo, result.paidAt);

    return {
      orderNo: order.orderNo,
      status: 'PAID',
      paidAt: result.paidAt,
      credits: order.credits,
    };
  }

  return {
    orderNo: order.orderNo,
    status: order.status,
    credits: order.credits,
  };
}

/**
 * 处理支付成功
 */
export async function handlePaymentSuccess(
  orderId: string,
  tradeNo?: string,
  paidAt?: Date
) {
  const now = paidAt || new Date();

  // 使用事务确保数据一致性
  await prisma.$transaction(async (tx) => {
    // 获取订单
    const order = await tx.paymentOrder.findUnique({
      where: { id: orderId },
      include: { package: true },
    });

    if (!order) {
      throw new Error('订单不存在');
    }

    if (order.status === 'PAID') {
      // 已处理过，跳过
      return;
    }

    // 更新订单状态
    await tx.paymentOrder.update({
      where: { id: orderId },
      data: {
        status: 'PAID',
        tradeNo,
        paidAt: now,
      },
    });

    // 获取用户当前积分
    const user = await tx.user.findUnique({
      where: { id: order.userId },
    });

    if (!user) {
      throw new Error('用户不存在');
    }

    const newBalance = user.credits + order.credits;

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
        description: `充值${order.package?.name || '积分包'} +${order.credits}积分`,
      },
    });

    // 如果套餐包含会员升级
    if (order.package?.memberLevel) {
      const memberData: any = { role: order.package.memberLevel };
      
      // 设置会员到期时间
      if (order.package.memberDays && order.package.memberDays > 0) {
        // 如果用户已有会员且未过期，则在原有基础上续期
        const currentExpire = user.membershipExpireAt;
        const baseDate = (currentExpire && currentExpire > now) ? currentExpire : now;
        memberData.membershipExpireAt = new Date(baseDate.getTime() + order.package.memberDays * 24 * 60 * 60 * 1000);
        logger.info(`[PaymentService] 设置会员到期时间: ${memberData.membershipExpireAt}, 天数: ${order.package.memberDays}`);
      }
      // 如果 memberDays 为 0 或 null，则表示永久会员，不设置过期时间
      
      await tx.user.update({
        where: { id: order.userId },
        data: memberData,
      });
    }

    logger.info(`[PaymentService] 支付成功处理完成: ${order.orderNo}, 用户: ${order.userId}, 积分: +${order.credits}`);
  });
}

/**
 * 处理支付回调
 */
export async function handlePaymentCallback(
  provider: PaymentProviderEnum,
  data: any
) {
  const paymentProvider = await getPaymentProvider(provider);
  if (!paymentProvider) {
    throw new Error('支付渠道未配置');
  }

  const result = await paymentProvider.handleCallback(data);

  if (!result.success) {
    logger.error(`[PaymentService] 回调处理失败: ${result.errorMessage}`);
    throw new Error(result.errorMessage);
  }

  if (result.status === 'PAID') {
    // 查找订单
    const order = await prisma.paymentOrder.findUnique({
      where: { orderNo: result.orderNo },
    });

    if (order && order.status === 'PENDING') {
      await handlePaymentSuccess(order.id, result.tradeNo, result.paidAt);
    }
  }

  return result;
}

/**
 * 获取用户订单列表
 */
export async function getUserOrders(
  userId: string,
  options: { page?: number; limit?: number; status?: OrderStatus } = {}
) {
  const { page = 1, limit = 20, status } = options;
  const skip = (page - 1) * limit;

  const where: any = { userId };
  if (status) {
    where.status = status;
  }

  const [orders, total] = await Promise.all([
    prisma.paymentOrder.findMany({
      where,
      include: {
        package: {
          select: {
            name: true,
            coverImage: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.paymentOrder.count({ where }),
  ]);

  return {
    orders,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * 获取用户积分流水
 */
export async function getUserTransactions(
  userId: string,
  options: { page?: number; limit?: number; type?: TransactionType } = {}
) {
  const { page = 1, limit = 20, type } = options;
  const skip = (page - 1) * limit;

  const where: any = { userId };
  if (type) {
    where.type = type;
  }

  const [transactions, total] = await Promise.all([
    prisma.creditTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.creditTransaction.count({ where }),
  ]);

  return {
    transactions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
