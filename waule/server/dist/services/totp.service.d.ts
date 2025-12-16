/**
 * TOTP 双因素认证服务
 * 使用 Google Authenticator 兼容的 TOTP 算法
 */
declare class TotpService {
    private readonly issuer;
    /**
     * 生成新的 TOTP 密钥
     */
    generateSecret(): string;
    /**
     * 生成用于 Google Authenticator 扫描的 otpauth URL
     */
    generateOtpAuthUrl(secret: string, accountName: string): string;
    /**
     * 生成二维码 Data URL (可直接用于 img src)
     */
    generateQRCode(otpauthUrl: string): Promise<string>;
    /**
     * 验证 TOTP 验证码
     * @param token 用户输入的 6 位验证码
     * @param secret 用户的 TOTP 密钥
     */
    verifyToken(token: string, secret: string): boolean;
    /**
     * 为用户设置 TOTP (首次绑定)
     * 返回二维码和密钥，用户需要扫码后输入验证码确认
     */
    setupTotp(userId: string, accountName: string): Promise<{
        secret: string;
        qrCode: string;
        otpauthUrl: string;
    }>;
    /**
     * 确认并激活 TOTP
     * 用户扫码后输入验证码，验证成功后激活
     */
    confirmTotp(userId: string, token: string): Promise<boolean>;
    /**
     * 禁用 TOTP
     */
    disableTotp(userId: string): Promise<void>;
    /**
     * 检查用户是否启用了 TOTP
     */
    isTotpEnabled(userId: string): Promise<boolean>;
    /**
     * 验证用户的 TOTP
     */
    verifyUserTotp(userId: string, token: string): Promise<boolean>;
}
export declare const totpService: TotpService;
export {};
//# sourceMappingURL=totp.service.d.ts.map