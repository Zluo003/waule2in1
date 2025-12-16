"use strict";
/**
 * 支付控制器
 * 包含支付配置管理、套餐管理、订单管理等功能
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
exports.adminRecharge = exports.adminConfirmOrder = exports.wechatCallback = exports.alipayCallback = exports.getUserTransactions = exports.getUserOrders = exports.getOrderStatus = exports.createOrder = exports.deletePackage = exports.updatePackage = exports.createPackage = exports.getActivePackages = exports.getAllPackages = exports.testPaymentConfig = exports.deletePaymentConfig = exports.upsertPaymentConfig = exports.getPaymentConfig = exports.getPaymentConfigs = void 0;
const index_1 = require("../index");
const errorHandler_1 = require("../middleware/errorHandler");
const paymentService = __importStar(require("../services/payment/payment.service"));
const logger_1 = require("../utils/logger");
// ============== 支付配置管理（管理员） ==============
/**
 * 获取所有支付配置
 */
exports.getPaymentConfigs = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const configs = await index_1.prisma.paymentConfig.findMany({
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
exports.getPaymentConfig = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const config = await index_1.prisma.paymentConfig.findUnique({
        where: { id },
    });
    if (!config) {
        throw new errorHandler_1.AppError('支付配置不存在', 404);
    }
    res.json({
        success: true,
        data: config,
    });
});
/**
 * 创建或更新支付配置
 */
exports.upsertPaymentConfig = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { provider, name, appId, privateKey, publicKey, config, isActive, isSandbox } = req.body;
    if (!provider || !name || !appId) {
        throw new errorHandler_1.AppError('缺少必要参数', 400);
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
    const result = await index_1.prisma.paymentConfig.upsert({
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
exports.deletePaymentConfig = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const config = await index_1.prisma.paymentConfig.findUnique({
        where: { id },
    });
    if (!config) {
        throw new errorHandler_1.AppError('支付配置不存在', 404);
    }
    await index_1.prisma.paymentConfig.delete({
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
exports.testPaymentConfig = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const config = await index_1.prisma.paymentConfig.findUnique({
        where: { id },
    });
    if (!config) {
        throw new errorHandler_1.AppError('支付配置不存在', 404);
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
    }
    catch (error) {
        logger_1.logger.error(`[Payment] 测试连通失败:`, error);
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
exports.getAllPackages = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { type } = req.query;
    const packages = await index_1.prisma.creditPackage.findMany({
        where: type ? { type: type } : undefined,
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
exports.getActivePackages = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { type } = req.query;
    const packages = await index_1.prisma.creditPackage.findMany({
        where: {
            isActive: true,
            ...(type ? { type: type } : {}),
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
exports.createPackage = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { type, name, description, price, credits, bonusCredits, memberLevel, memberDays, coverImage, badge, badgeColor, sortOrder, isActive, isRecommend, } = req.body;
    if (!name || !price || !credits) {
        throw new errorHandler_1.AppError('缺少必要参数：name, price, credits', 400);
    }
    const pkg = await index_1.prisma.creditPackage.create({
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
exports.updatePackage = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { type, name, description, price, credits, bonusCredits, memberLevel, memberDays, coverImage, badge, badgeColor, sortOrder, isActive, isRecommend, } = req.body;
    const existing = await index_1.prisma.creditPackage.findUnique({
        where: { id },
    });
    if (!existing) {
        throw new errorHandler_1.AppError('套餐不存在', 404);
    }
    // 如果类型是积分购买，清除会员相关字段
    const effectiveType = type || existing.type;
    const pkg = await index_1.prisma.creditPackage.update({
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
exports.deletePackage = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const existing = await index_1.prisma.creditPackage.findUnique({
        where: { id },
    });
    if (!existing) {
        throw new errorHandler_1.AppError('套餐不存在', 404);
    }
    // 检查是否有关联订单
    const orderCount = await index_1.prisma.paymentOrder.count({
        where: { packageId: id },
    });
    if (orderCount > 0) {
        // 软删除（标记为不活跃）
        await index_1.prisma.creditPackage.update({
            where: { id },
            data: { isActive: false },
        });
        res.json({
            success: true,
            message: '套餐已下架（有关联订单，无法删除）',
        });
    }
    else {
        await index_1.prisma.creditPackage.delete({
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
exports.createOrder = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const { packageId, paymentMethod = 'ALIPAY' } = req.body;
    if (!packageId) {
        throw new errorHandler_1.AppError('请选择充值套餐', 400);
    }
    const clientIp = req.ip || req.headers['x-forwarded-for'];
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
exports.getOrderStatus = (0, errorHandler_1.asyncHandler)(async (req, res) => {
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
exports.getUserOrders = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const { page, limit, status } = req.query;
    const result = await paymentService.getUserOrders(userId, {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        status: status,
    });
    res.json({
        success: true,
        ...result,
    });
});
/**
 * 获取用户积分流水
 */
exports.getUserTransactions = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const { page, limit, type } = req.query;
    const result = await paymentService.getUserTransactions(userId, {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        type: type,
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
exports.alipayCallback = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    logger_1.logger.info('[Alipay] 收到回调:', JSON.stringify(req.body));
    try {
        await paymentService.handlePaymentCallback('ALIPAY', req.body);
        // 支付宝要求返回 "success" 字符串
        res.send('success');
    }
    catch (error) {
        logger_1.logger.error('[Alipay] 回调处理失败:', error);
        res.send('fail');
    }
});
/**
 * 微信支付回调（预留）
 */
exports.wechatCallback = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    logger_1.logger.info('[Wechat] 收到回调:', JSON.stringify(req.body));
    try {
        await paymentService.handlePaymentCallback('WECHAT', req.body);
        res.json({ code: 'SUCCESS', message: '成功' });
    }
    catch (error) {
        logger_1.logger.error('[Wechat] 回调处理失败:', error);
        res.json({ code: 'FAIL', message: error.message });
    }
});
// ============== 管理员订单管理 ==============
/**
 * 管理员手动确认订单（处理漏单情况）
 */
exports.adminConfirmOrder = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { orderNo, tradeNo } = req.body;
    if (!orderNo) {
        throw new errorHandler_1.AppError('缺少订单号', 400);
    }
    const order = await index_1.prisma.paymentOrder.findUnique({
        where: { orderNo },
        include: { package: true },
    });
    if (!order) {
        throw new errorHandler_1.AppError('订单不存在', 404);
    }
    // 检查是否已有积分交易记录
    const existingTransaction = await index_1.prisma.creditTransaction.findFirst({
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
    await index_1.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
            where: { id: order.userId },
        });
        if (!user) {
            throw new errorHandler_1.AppError('用户不存在', 404);
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
            const memberData = { role: order.package.memberLevel };
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
    logger_1.logger.info(`[Admin] 手动确认订单成功: ${orderNo}, 操作人: ${req.user?.id}`);
    res.json({
        success: true,
        message: '订单确认成功，积分已发放',
        data: { orderNo, credits: order.credits },
    });
});
/**
 * 管理员手动给用户充值
 */
exports.adminRecharge = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { userId, credits, description } = req.body;
    if (!userId || !credits) {
        throw new errorHandler_1.AppError('缺少必要参数：userId, credits', 400);
    }
    const creditsNum = Number(credits);
    if (isNaN(creditsNum) || creditsNum === 0) {
        throw new errorHandler_1.AppError('积分数量无效', 400);
    }
    await index_1.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            throw new errorHandler_1.AppError('用户不存在', 404);
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
//# sourceMappingURL=payment.controller.js.map