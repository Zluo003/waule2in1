"use strict";
/**
 * 支付宝当面付实现
 * 使用 alipay.trade.precreate 接口生成收款二维码
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlipayProvider = void 0;
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = require("../../utils/logger");
class AlipayProvider {
    constructor(config) {
        this.config = config;
        // 正式环境 vs 沙箱环境
        this.gateway = config.isSandbox
            ? 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
            : (config.gateway || 'https://openapi.alipay.com/gateway.do');
    }
    /**
     * 创建支付二维码
     */
    async createQRCode(params) {
        try {
            const bizContent = {
                out_trade_no: params.orderNo,
                total_amount: (params.amount / 100).toFixed(2), // 分转元
                subject: params.subject,
                body: params.body || params.subject,
                timeout_express: params.timeoutExpress || '30m',
            };
            const requestParams = this.buildRequestParams('alipay.trade.precreate', bizContent);
            logger_1.logger.info(`[Alipay] 创建预下单请求: ${params.orderNo}`);
            const response = await this.sendRequest(requestParams);
            if (response.alipay_trade_precreate_response) {
                const result = response.alipay_trade_precreate_response;
                if (result.code === '10000') {
                    return {
                        success: true,
                        qrCodeUrl: result.qr_code,
                        outTradeNo: params.orderNo,
                        expireTime: new Date(Date.now() + 30 * 60 * 1000), // 30分钟后过期
                    };
                }
                else {
                    logger_1.logger.error(`[Alipay] 预下单失败: ${result.code} - ${result.msg} - ${result.sub_msg}`);
                    return {
                        success: false,
                        outTradeNo: params.orderNo,
                        errorMessage: result.sub_msg || result.msg,
                    };
                }
            }
            return {
                success: false,
                outTradeNo: params.orderNo,
                errorMessage: '未知响应格式',
            };
        }
        catch (error) {
            logger_1.logger.error(`[Alipay] 创建二维码异常:`, error);
            return {
                success: false,
                outTradeNo: params.orderNo,
                errorMessage: error.message,
            };
        }
    }
    /**
     * 查询订单状态
     */
    async queryStatus(orderNo) {
        try {
            const bizContent = {
                out_trade_no: orderNo,
            };
            const requestParams = this.buildRequestParams('alipay.trade.query', bizContent);
            const response = await this.sendRequest(requestParams);
            if (response.alipay_trade_query_response) {
                const result = response.alipay_trade_query_response;
                if (result.code === '10000') {
                    // 交易状态映射
                    const statusMap = {
                        'WAIT_BUYER_PAY': 'PENDING',
                        'TRADE_CLOSED': 'CANCELLED',
                        'TRADE_SUCCESS': 'PAID',
                        'TRADE_FINISHED': 'PAID',
                    };
                    return {
                        success: true,
                        status: statusMap[result.trade_status] || 'PENDING',
                        tradeNo: result.trade_no,
                        paidAt: result.send_pay_date ? new Date(result.send_pay_date) : undefined,
                        amount: result.total_amount ? Math.round(parseFloat(result.total_amount) * 100) : undefined,
                    };
                }
                else if (result.code === '40004' && result.sub_code === 'ACQ.TRADE_NOT_EXIST') {
                    // 订单不存在，视为待支付
                    return {
                        success: true,
                        status: 'PENDING',
                    };
                }
                else {
                    return {
                        success: false,
                        status: 'PENDING',
                        errorMessage: result.sub_msg || result.msg,
                    };
                }
            }
            return {
                success: false,
                status: 'PENDING',
                errorMessage: '未知响应格式',
            };
        }
        catch (error) {
            logger_1.logger.error(`[Alipay] 查询订单状态异常:`, error);
            return {
                success: false,
                status: 'PENDING',
                errorMessage: error.message,
            };
        }
    }
    /**
     * 处理支付回调
     */
    async handleCallback(data) {
        try {
            // 验证签名
            if (!this.verifyCallback(data)) {
                return {
                    success: false,
                    orderNo: data.out_trade_no || '',
                    status: 'FAILED',
                    errorMessage: '签名验证失败',
                };
            }
            const tradeStatus = data.trade_status;
            const isPaid = tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED';
            return {
                success: true,
                orderNo: data.out_trade_no,
                tradeNo: data.trade_no,
                status: isPaid ? 'PAID' : 'FAILED',
                amount: data.total_amount ? Math.round(parseFloat(data.total_amount) * 100) : undefined,
                paidAt: data.gmt_payment ? new Date(data.gmt_payment) : new Date(),
            };
        }
        catch (error) {
            logger_1.logger.error(`[Alipay] 处理回调异常:`, error);
            return {
                success: false,
                orderNo: data.out_trade_no || '',
                status: 'FAILED',
                errorMessage: error.message,
            };
        }
    }
    /**
     * 申请退款
     */
    async refund(orderNo, amount, reason) {
        try {
            const bizContent = {
                out_trade_no: orderNo,
                refund_amount: (amount / 100).toFixed(2),
                refund_reason: reason || '用户申请退款',
                out_request_no: `${orderNo}_${Date.now()}`, // 退款请求号
            };
            const requestParams = this.buildRequestParams('alipay.trade.refund', bizContent);
            const response = await this.sendRequest(requestParams);
            if (response.alipay_trade_refund_response) {
                const result = response.alipay_trade_refund_response;
                if (result.code === '10000') {
                    return {
                        success: true,
                        refundNo: result.trade_no,
                        amount: Math.round(parseFloat(result.refund_fee) * 100),
                    };
                }
                else {
                    return {
                        success: false,
                        errorMessage: result.sub_msg || result.msg,
                    };
                }
            }
            return {
                success: false,
                errorMessage: '未知响应格式',
            };
        }
        catch (error) {
            logger_1.logger.error(`[Alipay] 退款异常:`, error);
            return {
                success: false,
                errorMessage: error.message,
            };
        }
    }
    /**
     * 验证回调签名
     */
    verifyCallback(data) {
        try {
            const sign = data.sign;
            const signType = data.sign_type || 'RSA2';
            if (!sign) {
                return false;
            }
            // 构建待签名字符串
            const params = { ...data };
            delete params.sign;
            delete params.sign_type;
            const sortedKeys = Object.keys(params).sort();
            const signStr = sortedKeys
                .filter((key) => params[key] !== '' && params[key] !== undefined)
                .map((key) => `${key}=${params[key]}`)
                .join('&');
            // 使用支付宝公钥验证签名
            const algorithm = signType === 'RSA2' ? 'RSA-SHA256' : 'RSA-SHA1';
            const publicKey = this.formatPublicKey(this.config.publicKey);
            const verify = crypto_1.default.createVerify(algorithm);
            verify.update(signStr, 'utf8');
            return verify.verify(publicKey, sign, 'base64');
        }
        catch (error) {
            logger_1.logger.error(`[Alipay] 验证签名异常:`, error);
            return false;
        }
    }
    /**
     * 构建请求参数
     */
    buildRequestParams(method, bizContent) {
        const params = {
            app_id: this.config.appId,
            method,
            format: 'JSON',
            charset: 'utf-8',
            sign_type: this.config.signType || 'RSA2',
            timestamp: this.formatDateTime(new Date()),
            version: '1.0',
            biz_content: JSON.stringify(bizContent),
        };
        if (this.config.notifyUrl) {
            params.notify_url = this.config.notifyUrl;
        }
        // 生成签名
        params.sign = this.sign(params);
        return params;
    }
    /**
     * 生成签名
     */
    sign(params) {
        const sortedKeys = Object.keys(params).sort();
        const signStr = sortedKeys
            .filter((key) => params[key] !== '' && params[key] !== undefined)
            .map((key) => `${key}=${params[key]}`)
            .join('&');
        const signType = this.config.signType || 'RSA2';
        const algorithm = signType === 'RSA2' ? 'RSA-SHA256' : 'RSA-SHA1';
        const privateKey = this.formatPrivateKey(this.config.privateKey);
        const signer = crypto_1.default.createSign(algorithm);
        signer.update(signStr, 'utf8');
        return signer.sign(privateKey, 'base64');
    }
    /**
     * 发送请求
     */
    async sendRequest(params) {
        const urlParams = new URLSearchParams(params);
        const response = await fetch(this.gateway, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
            },
            body: urlParams.toString(),
        });
        const text = await response.text();
        try {
            return JSON.parse(text);
        }
        catch {
            logger_1.logger.error(`[Alipay] 响应解析失败: ${text}`);
            throw new Error('响应解析失败');
        }
    }
    /**
     * 格式化私钥
     */
    formatPrivateKey(key) {
        if (key.includes('-----BEGIN')) {
            return key;
        }
        const formatted = key.replace(/(.{64})/g, '$1\n');
        return `-----BEGIN RSA PRIVATE KEY-----\n${formatted}\n-----END RSA PRIVATE KEY-----`;
    }
    /**
     * 格式化公钥
     */
    formatPublicKey(key) {
        if (key.includes('-----BEGIN')) {
            return key;
        }
        const formatted = key.replace(/(.{64})/g, '$1\n');
        return `-----BEGIN PUBLIC KEY-----\n${formatted}\n-----END PUBLIC KEY-----`;
    }
    /**
     * 格式化日期时间
     */
    formatDateTime(date) {
        const pad = (n) => n.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }
}
exports.AlipayProvider = AlipayProvider;
//# sourceMappingURL=alipay.provider.js.map