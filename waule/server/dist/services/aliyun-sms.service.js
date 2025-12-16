"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aliyunSMSService = exports.AliyunSMSService = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = require("../utils/logger");
/**
 * 阿里云短信服务
 */
class AliyunSMSService {
    constructor() {
        this.dypnsEndpoint = 'https://dypnsapi.aliyuncs.com/';
        this.dysmsEndpoint = 'https://dysmsapi.aliyuncs.com/';
        this.config = {
            accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
            accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
            signName: process.env.ALIYUN_SMS_SIGN_NAME || '阿里云',
            templateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE || 'SMS_123456789',
        };
        const forcedMode = process.env.ALIYUN_SMS_USE_DYPNS;
        if (forcedMode !== undefined) {
            this.useDypns = forcedMode.toLowerCase() === 'true';
        }
        else {
            this.useDypns = !this.config.templateCode.toUpperCase().startsWith('SMS_');
        }
        if (!this.config.accessKeyId || !this.config.accessKeySecret) {
            logger_1.logger.warn('阿里云短信服务配置不完整，短信功能将无法使用');
        }
        logger_1.logger.info(`阿里云短信服务初始化: mode=${this.useDypns ? 'SMS_AUTH(Dypns)' : 'STANDARD_SMS(Dysms)'}`);
    }
    /**
     * 发送验证码短信
     */
    async sendVerificationCode(phone, code) {
        // 开发环境下，如果配置是默认值或是测试手机号，直接打印验证码
        if (process.env.NODE_ENV === 'development' || phone === '13800138000') {
            const isDefaultConfig = this.config.templateCode === 'SMS_123456789' ||
                this.config.accessKeyId.includes('YOUR_');
            if (isDefaultConfig || phone === '13800138000') {
                logger_1.logger.info(`[DEV/TEST] 模拟发送短信到 ${phone}, 验证码: ${code}`);
                // 同时也输出到控制台，确保开发者能看到
                console.log(`==========================================`);
                console.log(`[SMS MOCK] To: ${phone}, Code: ${code}`);
                console.log(`==========================================`);
                return true;
            }
        }
        try {
            const success = this.useDypns
                ? await this.sendViaDypns(phone, code)
                : await this.sendViaDysms(phone, code);
            if (success) {
                logger_1.logger.info(`验证码发送成功: ${phone}`);
            }
            return success;
        }
        catch (error) {
            logger_1.logger.error(`发送验证码异常: ${error.message}`);
            if (error.response) {
                logger_1.logger.error(`API响应数据: ${JSON.stringify(error.response.data)}`);
            }
            return false;
        }
    }
    /**
     * 发送验证码短信（Dypns）
     */
    async sendViaDypns(phone, code) {
        const params = {
            PhoneNumber: phone,
            VerifyCode: code,
            Scene: process.env.ALIYUN_SMS_SCENE || '1',
            ValidTime: process.env.ALIYUN_SMS_VALID_TIME || '300',
            ReturnVerifyCode: 'false',
        };
        if (this.config.signName) {
            params.SignName = this.config.signName;
        }
        if (this.config.templateCode) {
            params.TemplateCode = this.config.templateCode;
        }
        // Dypns 接口要求 TemplateParam，当传入自定义验证码时需要显式带上
        params.TemplateParam = this.buildTemplateParam(code, { includeDefaultMin: true });
        logger_1.logger.info(`尝试发送短信(DYPNS): Phone=${phone}, Scene=${params.Scene}`);
        const response = await this.callAliyunAPI(this.dypnsEndpoint, 'SendSmsVerifyCode', params);
        if (response.Code === 'OK') {
            return true;
        }
        logger_1.logger.error(`验证码发送失败(DYPNS): ${phone}, Code=${response.Code}, Message=${response.Message}`);
        return false;
    }
    /**
     * 发送验证码短信（Dysms）
     */
    async sendViaDysms(phone, code) {
        const params = {
            PhoneNumbers: phone,
            SignName: this.config.signName,
            TemplateCode: this.config.templateCode,
            TemplateParam: this.buildTemplateParam(code),
        };
        const response = await this.callAliyunAPI(this.dysmsEndpoint, 'SendSms', params);
        return response.Code === 'OK';
    }
    /**
     * 公共 API 调用
     */
    async callAliyunAPI(endpoint, action, params) {
        const commonParams = {
            Format: 'JSON',
            Version: '2017-05-25',
            AccessKeyId: this.config.accessKeyId,
            SignatureMethod: 'HMAC-SHA1',
            Timestamp: new Date().toISOString(),
            SignatureVersion: '1.0',
            SignatureNonce: Math.random().toString(),
            Action: action,
        };
        const allParams = { ...commonParams, ...params };
        const signature = this.generateSignature(allParams);
        // 重新排序并构建查询字符串，确保编码正确
        const queryString = Object.keys(allParams)
            .sort()
            .map(key => `${this.percentEncode(key)}=${this.percentEncode(allParams[key])}`)
            .join('&') + `&Signature=${this.percentEncode(signature)}`;
        const response = await axios_1.default.get(`${endpoint}?${queryString}`);
        return response.data;
    }
    /**
     * 生成签名
     */
    generateSignature(params) {
        const sortedParams = Object.keys(params)
            .sort()
            .map(key => `${this.percentEncode(key)}=${this.percentEncode(params[key])}`)
            .join('&');
        const stringToSign = `GET&${this.percentEncode('/')}&${this.percentEncode(sortedParams)}`;
        const hmac = crypto_1.default.createHmac('sha1', `${this.config.accessKeySecret}&`);
        return hmac.update(stringToSign).digest('base64');
    }
    /**
     * URL编码
     */
    percentEncode(value) {
        return encodeURIComponent(value)
            .replace(/!/g, '%21')
            .replace(/'/g, '%27')
            .replace(/\(/g, '%28')
            .replace(/\)/g, '%29')
            .replace(/\*/g, '%2A');
    }
    /**
     * 构建模板参数，支持通过环境变量自定义占位符
     */
    buildTemplateParam(code, options = {}) {
        const raw = process.env.ALIYUN_SMS_TEMPLATE_PARAM;
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                const replaced = Object.fromEntries(Object.entries(parsed).map(([key, value]) => {
                    if (typeof value === 'string') {
                        return [key, value.replace(/{{code}}/g, code)];
                    }
                    return [key, value];
                }));
                return JSON.stringify(replaced);
            }
            catch (err) {
                logger_1.logger.warn(`解析 ALIYUN_SMS_TEMPLATE_PARAM 失败，将使用默认模板参数: ${err.message}`);
            }
        }
        const defaultParam = { code };
        if (options.includeDefaultMin) {
            defaultParam.min = process.env.ALIYUN_SMS_TEMPLATE_MINUTES || '5';
        }
        return JSON.stringify(defaultParam);
    }
}
exports.AliyunSMSService = AliyunSMSService;
exports.aliyunSMSService = new AliyunSMSService();
//# sourceMappingURL=aliyun-sms.service.js.map