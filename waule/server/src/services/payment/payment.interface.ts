/**
 * 支付服务接口定义
 * 用于支持多种支付渠道的统一抽象
 */

export interface QRCodeResult {
  success: boolean;
  qrCodeUrl?: string;      // 二维码内容（用于前端生成二维码图片）
  outTradeNo: string;      // 商户订单号
  expireTime?: Date;       // 二维码过期时间
  errorMessage?: string;
}

export interface PaymentStatus {
  success: boolean;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
  tradeNo?: string;        // 第三方交易号
  paidAt?: Date;           // 支付时间
  amount?: number;         // 实际支付金额（分）
  errorMessage?: string;
}

export interface RefundResult {
  success: boolean;
  refundNo?: string;       // 退款单号
  amount?: number;         // 退款金额（分）
  errorMessage?: string;
}

export interface CallbackResult {
  success: boolean;
  orderNo: string;         // 商户订单号
  tradeNo?: string;        // 第三方交易号
  status: 'PAID' | 'FAILED';
  amount?: number;         // 支付金额（分）
  paidAt?: Date;           // 支付时间
  errorMessage?: string;
}

export interface CreateOrderParams {
  orderNo: string;         // 商户订单号
  amount: number;          // 金额（分）
  subject: string;         // 订单标题
  body?: string;           // 订单描述
  timeoutExpress?: string; // 超时时间（如 '30m'）
}

export interface PaymentProviderConfig {
  appId: string;
  privateKey: string;
  publicKey: string;       // 支付宝公钥或证书
  isSandbox?: boolean;
  notifyUrl?: string;      // 异步通知地址
  signType?: string;       // 签名类型
  gateway?: string;        // 网关地址
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
