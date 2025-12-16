import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { prisma } from '../index';
import { logger } from '../utils/logger';

/**
 * TOTP 双因素认证服务
 * 使用 Google Authenticator 兼容的 TOTP 算法
 */
class TotpService {
  private readonly issuer = 'Waule Admin';

  /**
   * 生成新的 TOTP 密钥
   */
  generateSecret(): string {
    return authenticator.generateSecret();
  }

  /**
   * 生成用于 Google Authenticator 扫描的 otpauth URL
   */
  generateOtpAuthUrl(secret: string, accountName: string): string {
    return authenticator.keyuri(accountName, this.issuer, secret);
  }

  /**
   * 生成二维码 Data URL (可直接用于 img src)
   */
  async generateQRCode(otpauthUrl: string): Promise<string> {
    try {
      return await QRCode.toDataURL(otpauthUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
    } catch (error) {
      logger.error('生成 TOTP 二维码失败:', error);
      throw new Error('生成二维码失败');
    }
  }

  /**
   * 验证 TOTP 验证码
   * @param token 用户输入的 6 位验证码
   * @param secret 用户的 TOTP 密钥
   */
  verifyToken(token: string, secret: string): boolean {
    try {
      return authenticator.verify({ token, secret });
    } catch (error) {
      logger.error('TOTP 验证失败:', error);
      return false;
    }
  }

  /**
   * 为用户设置 TOTP (首次绑定)
   * 返回二维码和密钥，用户需要扫码后输入验证码确认
   */
  async setupTotp(userId: string, accountName: string): Promise<{
    secret: string;
    qrCode: string;
    otpauthUrl: string;
  }> {
    const secret = this.generateSecret();
    const otpauthUrl = this.generateOtpAuthUrl(secret, accountName);
    const qrCode = await this.generateQRCode(otpauthUrl);

    // 临时保存密钥（未激活状态）
    await prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: secret,
        totpEnabled: false, // 需要验证后才激活
      },
    });

    logger.info(`用户 ${userId} 开始设置 TOTP`);

    return { secret, qrCode, otpauthUrl };
  }

  /**
   * 确认并激活 TOTP
   * 用户扫码后输入验证码，验证成功后激活
   */
  async confirmTotp(userId: string, token: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
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
    await prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true },
    });

    logger.info(`用户 ${userId} TOTP 激活成功`);
    return true;
  }

  /**
   * 禁用 TOTP
   */
  async disableTotp(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: null,
        totpEnabled: false,
      },
    });

    logger.info(`用户 ${userId} TOTP 已禁用`);
  }

  /**
   * 检查用户是否启用了 TOTP
   */
  async isTotpEnabled(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totpEnabled: true },
    });
    return user?.totpEnabled ?? false;
  }

  /**
   * 验证用户的 TOTP
   */
  async verifyUserTotp(userId: string, token: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totpSecret: true, totpEnabled: true },
    });

    if (!user?.totpEnabled || !user.totpSecret) {
      return true; // 未启用 TOTP，直接通过
    }

    return this.verifyToken(token, user.totpSecret);
  }
}

export const totpService = new TotpService();
