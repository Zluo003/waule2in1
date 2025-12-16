/**
 * 支付宝当面付实现
 * 使用 alipay.trade.precreate 接口生成收款二维码
 */
import { PaymentProvider, PaymentProviderConfig, CreateOrderParams, QRCodeResult, PaymentStatus, RefundResult, CallbackResult } from './payment.interface';
export declare class AlipayProvider implements PaymentProvider {
    private config;
    private gateway;
    constructor(config: PaymentProviderConfig);
    /**
     * 创建支付二维码
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
    /**
     * 构建请求参数
     */
    private buildRequestParams;
    /**
     * 生成签名
     */
    private sign;
    /**
     * 发送请求
     */
    private sendRequest;
    /**
     * 格式化私钥
     */
    private formatPrivateKey;
    /**
     * 格式化公钥
     */
    private formatPublicKey;
    /**
     * 格式化日期时间
     */
    private formatDateTime;
}
//# sourceMappingURL=alipay.provider.d.ts.map