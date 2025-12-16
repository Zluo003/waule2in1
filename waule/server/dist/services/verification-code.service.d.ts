/**
 * 验证码服务
 * 使用Redis存储验证码，确保集群模式下数据共享
 */
export declare class VerificationCodeService {
    private redis;
    private memoryStore;
    private useRedis;
    private initialized;
    constructor();
    private initRedis;
    private ensureInitialized;
    private readonly MAX_VERIFY_ATTEMPTS;
    /**
     * 生成6位数字验证码（使用加密安全随机数）
     */
    generateCode(): string;
    /**
     * 保存验证码（5分钟有效期）
     */
    saveCode(phone: string, code: string, ttl?: number): Promise<void>;
    /**
     * 验证验证码（带尝试次数限制）
     */
    verifyCode(phone: string, code: string): Promise<boolean>;
    /**
     * 获取验证尝试次数
     */
    private getAttempts;
    /**
     * 增加验证尝试次数
     */
    private incrementAttempts;
    /**
     * 检查验证码发送频率（60秒内只能发送一次）
     */
    canSendCode(phone: string): Promise<boolean>;
    /**
     * 清理过期的内存验证码
     */
    private cleanExpiredCodes;
    /**
     * 关闭Redis连接
     */
    close(): Promise<void>;
}
export declare const verificationCodeService: VerificationCodeService;
//# sourceMappingURL=verification-code.service.d.ts.map