"use strict";
/**
 * 支付服务
 * 管理支付配置、订单创建、状态查询等
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaymentProvider = getPaymentProvider;
exports.clearProviderCache = clearProviderCache;
exports.testConnection = testConnection;
exports.generateOrderNo = generateOrderNo;
exports.createRechargeOrder = createRechargeOrder;
exports.queryOrderStatus = queryOrderStatus;
exports.handlePaymentSuccess = handlePaymentSuccess;
exports.handlePaymentCallback = handlePaymentCallback;
exports.getUserOrders = getUserOrders;
exports.getUserTransactions = getUserTransactions;
const index_1 = require("../../index");
const alipay_provider_1 = require("./alipay.provider");
const logger_1 = require("../../utils/logger");
// 缓存支付提供者实例
const providerCache = new Map();
/**
 * 获取支付提供者实例
 */
async function getPaymentProvider(provider) {
    // 检查缓存
    const cacheKey = provider;
    if (providerCache.has(cacheKey)) {
        return providerCache.get(cacheKey);
    }
    // 从数据库获取配置
    const config = await index_1.prisma.paymentConfig.findUnique({
        where: { provider },
    });
    if (!config || !config.isActive) {
        logger_1.logger.warn(`[PaymentService] 支付配置不存在或未启用: ${provider}`);
        return null;
    }
    // 构建配置
    const providerConfig = {
        appId: config.appId,
        privateKey: config.privateKey,
        publicKey: config.publicKey,
        isSandbox: config.isSandbox,
        ...(config.config || {}),
    };
    // 创建提供者实例
    let instance;
    switch (provider) {
        case 'ALIPAY':
            instance = new alipay_provider_1.AlipayProvider(providerConfig);
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
function clearProviderCache(provider) {
    if (provider) {
        providerCache.delete(provider);
    }
    else {
        providerCache.clear();
    }
}
/**
 * 测试支付配置连通性
 */
async function testConnection(config) {
    const startTime = Date.now();
    try {
        // 构建配置
        const providerConfig = {
            appId: config.appId,
            privateKey: config.privateKey,
            publicKey: config.publicKey,
            isSandbox: config.isSandbox,
            ...(config.config || {}),
        };
        // 创建临时提供者实例（不使用缓存）
        let instance;
        switch (config.provider) {
            case 'ALIPAY':
                instance = new alipay_provider_1.AlipayProvider(providerConfig);
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
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.logger.error(`[PaymentService] 测试连通失败:`, error);
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
function generateOrderNo() {
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
async function createRechargeOrder(params) {
    const { userId, packageId, paymentMethod, clientIp } = params;
    // 获取套餐信息
    const pkg = await index_1.prisma.creditPackage.findUnique({
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
    const order = await index_1.prisma.paymentOrder.create({
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
    const createParams = {
        orderNo,
        amount: pkg.price,
        subject: `${pkg.name} - ${pkg.credits + pkg.bonusCredits}积分`,
        body: pkg.description || undefined,
        timeoutExpress: '30m',
    };
    const result = await provider.createQRCode(createParams);
    if (!result.success) {
        // 更新订单状态为失败
        await index_1.prisma.paymentOrder.update({
            where: { id: order.id },
            data: {
                status: 'FAILED',
                metadata: {
                    ...(order.metadata || {}),
                    errorMessage: result.errorMessage,
                },
            },
        });
        throw new Error(result.errorMessage || '创建支付订单失败');
    }
    // 更新订单二维码信息
    await index_1.prisma.paymentOrder.update({
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
async function queryOrderStatus(orderNo) {
    const order = await index_1.prisma.paymentOrder.findUnique({
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
        await index_1.prisma.paymentOrder.update({
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
async function handlePaymentSuccess(orderId, tradeNo, paidAt) {
    const now = paidAt || new Date();
    // 使用事务确保数据一致性
    await index_1.prisma.$transaction(async (tx) => {
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
            const memberData = { role: order.package.memberLevel };
            // 设置会员到期时间
            if (order.package.memberDays && order.package.memberDays > 0) {
                // 如果用户已有会员且未过期，则在原有基础上续期
                const currentExpire = user.membershipExpireAt;
                const baseDate = (currentExpire && currentExpire > now) ? currentExpire : now;
                memberData.membershipExpireAt = new Date(baseDate.getTime() + order.package.memberDays * 24 * 60 * 60 * 1000);
                logger_1.logger.info(`[PaymentService] 设置会员到期时间: ${memberData.membershipExpireAt}, 天数: ${order.package.memberDays}`);
            }
            // 如果 memberDays 为 0 或 null，则表示永久会员，不设置过期时间
            await tx.user.update({
                where: { id: order.userId },
                data: memberData,
            });
        }
        logger_1.logger.info(`[PaymentService] 支付成功处理完成: ${order.orderNo}, 用户: ${order.userId}, 积分: +${order.credits}`);
    });
    // 处理推荐返利（在事务外异步处理，不影响主流程）
    try {
        const order = await index_1.prisma.paymentOrder.findUnique({ where: { id: orderId } });
        if (order) {
            const { processRechargeCommission } = await Promise.resolve().then(() => __importStar(require('../referral.service')));
            await processRechargeCommission({
                userId: order.userId,
                orderId: order.id,
                amount: order.amount,
            });
        }
    }
    catch (err) {
        logger_1.logger.error(`[PaymentService] 处理推荐返利失败: ${err.message}`);
        // 返利失败不影响支付成功
    }
}
/**
 * 处理支付回调
 */
async function handlePaymentCallback(provider, data) {
    const paymentProvider = await getPaymentProvider(provider);
    if (!paymentProvider) {
        throw new Error('支付渠道未配置');
    }
    const result = await paymentProvider.handleCallback(data);
    if (!result.success) {
        logger_1.logger.error(`[PaymentService] 回调处理失败: ${result.errorMessage}`);
        throw new Error(result.errorMessage);
    }
    if (result.status === 'PAID') {
        // 查找订单
        const order = await index_1.prisma.paymentOrder.findUnique({
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
async function getUserOrders(userId, options = {}) {
    const { page = 1, limit = 20, status } = options;
    const skip = (page - 1) * limit;
    const where = { userId };
    if (status) {
        where.status = status;
    }
    const [orders, total] = await Promise.all([
        index_1.prisma.paymentOrder.findMany({
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
        index_1.prisma.paymentOrder.count({ where }),
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
async function getUserTransactions(userId, options = {}) {
    const { page = 1, limit = 20, type } = options;
    const skip = (page - 1) * limit;
    const where = { userId };
    if (type) {
        where.type = type;
    }
    const [transactions, total] = await Promise.all([
        index_1.prisma.creditTransaction.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        }),
        index_1.prisma.creditTransaction.count({ where }),
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
//# sourceMappingURL=payment.service.js.map