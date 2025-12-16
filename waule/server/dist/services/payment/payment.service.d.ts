/**
 * 支付服务
 * 管理支付配置、订单创建、状态查询等
 */
import { PaymentProvider } from './payment.interface';
import { PaymentProvider as PaymentProviderEnum, OrderStatus, TransactionType } from '@prisma/client';
/**
 * 获取支付提供者实例
 */
export declare function getPaymentProvider(provider: PaymentProviderEnum): Promise<PaymentProvider | null>;
/**
 * 清除支付提供者缓存（配置更新后调用）
 */
export declare function clearProviderCache(provider?: PaymentProviderEnum): void;
/**
 * 测试支付配置连通性
 */
export declare function testConnection(config: {
    provider: PaymentProviderEnum;
    appId: string;
    privateKey: string;
    publicKey: string;
    isSandbox: boolean;
    config?: any;
}): Promise<{
    success: boolean;
    message: string;
    responseTime?: number;
}>;
/**
 * 生成订单号
 */
export declare function generateOrderNo(): string;
/**
 * 创建充值订单
 */
export declare function createRechargeOrder(params: {
    userId: string;
    packageId: string;
    paymentMethod: PaymentProviderEnum;
    clientIp?: string;
}): Promise<{
    orderId: string;
    orderNo: string;
    qrCodeUrl: string | undefined;
    amount: number;
    credits: number;
    expireAt: Date;
    package: {
        name: string;
        credits: number;
        bonusCredits: number;
    };
}>;
/**
 * 查询订单状态（主动查询）
 */
export declare function queryOrderStatus(orderNo: string): Promise<{
    orderNo: string;
    status: "PAID" | "FAILED" | "EXPIRED" | "REFUNDED" | "CANCELLED";
    paidAt: Date | null;
    credits: number;
} | {
    orderNo: string;
    status: string;
    credits: number;
    paidAt?: undefined;
} | {
    orderNo: string;
    status: string;
    paidAt: Date | undefined;
    credits: number;
}>;
/**
 * 处理支付成功
 */
export declare function handlePaymentSuccess(orderId: string, tradeNo?: string, paidAt?: Date): Promise<void>;
/**
 * 处理支付回调
 */
export declare function handlePaymentCallback(provider: PaymentProviderEnum, data: any): Promise<import("./payment.interface").CallbackResult>;
/**
 * 获取用户订单列表
 */
export declare function getUserOrders(userId: string, options?: {
    page?: number;
    limit?: number;
    status?: OrderStatus;
}): Promise<{
    orders: ({
        package: {
            name: string;
            coverImage: string | null;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        credits: number;
        userId: string;
        amount: number;
        orderNo: string;
        packageId: string | null;
        paymentMethod: import(".prisma/client").$Enums.PaymentProvider;
        status: import(".prisma/client").$Enums.OrderStatus;
        tradeNo: string | null;
        qrCodeUrl: string | null;
        qrCodeExpireAt: Date | null;
        paidAt: Date | null;
        expireAt: Date;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
    })[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}>;
/**
 * 获取用户积分流水
 */
export declare function getUserTransactions(userId: string, options?: {
    page?: number;
    limit?: number;
    type?: TransactionType;
}): Promise<{
    transactions: {
        type: import(".prisma/client").$Enums.TransactionType;
        id: string;
        createdAt: Date;
        userId: string;
        amount: number;
        balance: number;
        usageRecordId: string | null;
        description: string;
        orderId: string | null;
    }[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}>;
//# sourceMappingURL=payment.service.d.ts.map