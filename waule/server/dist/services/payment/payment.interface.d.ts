/**
 * 支付服务接口定义
 * 用于支持多种支付渠道的统一抽象
 */
export interface QRCodeResult {
    success: boolean;
    qrCodeUrl?: string;
    outTradeNo: string;
    expireTime?: Date;
    errorMessage?: string;
}
export interface PaymentStatus {
    success: boolean;
    status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
    tradeNo?: string;
    paidAt?: Date;
    amount?: number;
    errorMessage?: string;
}
export interface RefundResult {
    success: boolean;
    refundNo?: string;
    amount?: number;
    errorMessage?: string;
}
export interface CallbackResult {
    success: boolean;
    orderNo: string;
    tradeNo?: string;
    status: 'PAID' | 'FAILED';
    amount?: number;
    paidAt?: Date;
    errorMessage?: string;
}
export interface CreateOrderParams {
    orderNo: string;
    amount: number;
    subject: string;
    body?: string;
    timeoutExpress?: string;
}
export interface PaymentProviderConfig {
    appId: string;
    privateKey: string;
    publicKey: string;
    isSandbox?: boolean;
    notifyUrl?: string;
    signType?: string;
    gateway?: string;
}
/**
 * 支付提供者接口
 * 所有支付渠道实现此接口
 */
export interface PaymentProvider {
    /**
     * 创建支付二维码（当面付）
     */
    createQRCode(params: CreateOrderParams): Promise<QRCodeResult>;
    /**
     * 查询订单状态
     */
    queryStatus(orderNo: string): Promise<PaymentStatus>;
    /**
     * 处理支付回调
     */
    handleCallback(data: any): Promise<CallbackResult>;
    /**
     * 申请退款
     */
    refund(orderNo: string, amount: number, reason?: string): Promise<RefundResult>;
    /**
     * 验证回调签名
     */
    verifyCallback(data: any): boolean;
}
//# sourceMappingURL=payment.interface.d.ts.map