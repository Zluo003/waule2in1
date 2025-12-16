/**
 * 阿里云短信服务
 */
export declare class AliyunSMSService {
    private config;
    private readonly dypnsEndpoint;
    private readonly dysmsEndpoint;
    private useDypns;
    constructor();
    /**
     * 发送验证码短信
     */
    sendVerificationCode(phone: string, code: string): Promise<boolean>;
    /**
     * 发送验证码短信（Dypns）
     */
    private sendViaDypns;
    /**
     * 发送验证码短信（Dysms）
     */
    private sendViaDysms;
    /**
     * 公共 API 调用
     */
    private callAliyunAPI;
    /**
     * 生成签名
     */
    private generateSignature;
    /**
     * URL编码
     */
    private percentEncode;
    /**
     * 构建模板参数，支持通过环境变量自定义占位符
     */
    private buildTemplateParam;
}
export declare const aliyunSMSService: AliyunSMSService;
//# sourceMappingURL=aliyun-sms.service.d.ts.map