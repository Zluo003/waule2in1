"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.totpService = void 0;
const otplib_1 = require("otplib");
const qrcode_1 = __importDefault(require("qrcode"));
const index_1 = require("../index");
const logger_1 = require("../utils/logger");
/**
 * TOTP 双因素认证服务
 * 使用 Google Authenticator 兼容的 TOTP 算法
 */
class TotpService {
    constructor() {
        this.issuer = 'Waule Admin';
    }
    /**
     * 生成新的 TOTP 密钥
     */
    generateSecret() {
        return otplib_1.authenticator.generateSecret();
    }
    /**
     * 生成用于 Google Authenticator 扫描的 otpauth URL
     */
    generateOtpAuthUrl(secret, accountName) {
        return otplib_1.authenticator.keyuri(accountName, this.issuer, secret);
    }
    /**
     * 生成二维码 Data URL (可直接用于 img src)
     */
    async generateQRCode(otpauthUrl) {
        try {
            return await qrcode_1.default.toDataURL(otpauthUrl, {
                width: 256,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#ffffff',
                },
            });
        }
        catch (error) {
            logger_1.logger.error('生成 TOTP 二维码失败:', error);
            throw new Error('生成二维码失败');
        }
    }
    /**
     * 验证 TOTP 验证码
     * @param token 用户输入的 6 位验证码
     * @param secret 用户的 TOTP 密钥
     */
    verifyToken(token, secret) {
        try {
            return otplib_1.authenticator.verify({ token, secret });
        }
        catch (error) {
            logger_1.logger.error('TOTP 验证失败:', error);
            return false;
        }
    }
    /**
     * 为用户设置 TOTP (首次绑定)
     * 返回二维码和密钥，用户需要扫码后输入验证码确认
     */
    async setupTotp(userId, accountName) {
        const secret = this.generateSecret();
        const otpauthUrl = this.generateOtpAuthUrl(secret, accountName);
        const qrCode = await this.generateQRCode(otpauthUrl);
        // 临时保存密钥（未激活状态）
        await index_1.prisma.user.update({
            where: { id: userId },
            data: {
                totpSecret: secret,
                totpEnabled: false, // 需要验证后才激活
            },
        });
        logger_1.logger.info(`用户 ${userId} 开始设置 TOTP`);
        return { secret, qrCode, otpauthUrl };
    }
    /**
     * 确认并激活 TOTP
     * 用户扫码后输入验证码，验证成功后激活
     */
    async confirmTotp(userId, token) {
        const user = await index_1.prisma.user.findUnique({
            where: { id: userId },
            select: { totpSecret: true, totpEnabled: true },
        });
        if (!user?.totpSecret) {
            throw new Error('请先设置 TOTP');
        }
        if (user.totpEnabled) {
            throw new Error('TOTP 已激活');
        }
        const isValid = this.verifyToken(token, user.totpSecret);
        if (!isValid) {
            return false;
        }
        // 激活 TOTP
        await index_1.prisma.user.update({
            where: { id: userId },
            data: { totpEnabled: true },
        });
        logger_1.logger.info(`用户 ${userId} TOTP 激活成功`);
        return true;
    }
    /**
     * 禁用 TOTP
     */
    async disableTotp(userId) {
        await index_1.prisma.user.update({
            where: { id: userId },
            data: {
                totpSecret: null,
                totpEnabled: false,
            },
        });
        logger_1.logger.info(`用户 ${userId} TOTP 已禁用`);
    }
    /**
     * 检查用户是否启用了 TOTP
     */
    async isTotpEnabled(userId) {
        const user = await index_1.prisma.user.findUnique({
            where: { id: userId },
            select: { totpEnabled: true },
        });
        return user?.totpEnabled ?? false;
    }
    /**
     * 验证用户的 TOTP
     */
    async verifyUserTotp(userId, token) {
        const user = await index_1.prisma.user.findUnique({
            where: { id: userId },
            select: { totpSecret: true, totpEnabled: true },
        });
        if (!user?.totpEnabled || !user.totpSecret) {
            return true; // 未启用 TOTP，直接通过
        }
        return this.verifyToken(token, user.totpSecret);
    }
}
exports.totpService = new TotpService();
//# sourceMappingURL=totp.service.js.map