import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import { prisma, redis, forceLogoutUser } from '../index';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { aliyunSMSService } from '../services/aliyun-sms.service';
import { verificationCodeService } from '../services/verification-code.service';
import { userLevelService } from '../services/user-level.service';
import { totpService } from '../services/totp.service';
import * as referralService from '../services/referral.service';

// 生成JWT token
const TOKEN_TTL_DAYS = parseInt(process.env.JWT_EXPIRES_IN_DAYS || '15', 10);
const TOKEN_TTL_MS = TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
const POSITIVE_ADJECTIVES = ['灵感', '闪耀', '活力', '星辉', '卓越', '璀璨', '热忱', '光芒', '飞跃', '奋进'];

const generateToken = (userId: string, identifier: string, role: string): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('服务器配置错误: JWT_SECRET 未设置');
  }
  return jwt.sign({ userId, identifier, role }, secret, { expiresIn: `${TOKEN_TTL_DAYS}d` });
};

const generateCreatorNickname = (): string => {
  const adjective = POSITIVE_ADJECTIVES[Math.floor(Math.random() * POSITIVE_ADJECTIVES.length)] || '灵感';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const suffix = Array.from({ length: 4 })
    .map(() => chars[Math.floor(Math.random() * chars.length)])
    .join('');
  return `${adjective}创作者${suffix}`;
};

/**
 * 发送手机验证码
 */
export const sendVerificationCode = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  const { phone } = req.body;

  // 检查发送频率
  const canSend = await verificationCodeService.canSendCode(phone);
  if (!canSend) {
    throw new AppError('验证码发送过于频繁，请稍后再试', 429);
  }

  // 生成验证码
  const code = verificationCodeService.generateCode();

  // 发送短信
  const sent = await aliyunSMSService.sendVerificationCode(phone, code);
  if (!sent) {
    throw new AppError('验证码发送失败，请稍后再试', 500);
  }

  // 保存验证码
  await verificationCodeService.saveCode(phone, code);

  logger.info(`验证码已发送到: ${phone}`);

  res.json({
    success: true,
    message: '验证码已发送',
  });
});

/**
 * 手机验证码登录/注册
 */
export const loginWithPhone = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  const { phone, code, referralCode: inviteCode } = req.body;

  // 验证验证码
  const isValid = await verificationCodeService.verifyCode(phone, code);
  if (!isValid) {
    throw new AppError('验证码错误或已过期', 401);
  }

  // 查找或创建用户
  let user = await prisma.user.findUnique({
    where: { phone },
  });

  const isNewUser = !user;
  if (!user) {
    // 首次登录，创建新用户（同时生成推荐码）
    const userReferralCode = await referralService.generateReferralCode();
    user = await prisma.user.create({
      data: {
        phone,
        nickname: generateCreatorNickname(),
        loginType: 'PHONE',
        role: 'USER',
        referralCode: userReferralCode,
      },
    });
    logger.info(`新用户注册: ${phone}, 推荐码: ${userReferralCode}`);

    // 🔧 先处理每日赠送积分（新用户首次登录，当前积分为0，会获得完整的每日赠送）
    try {
      const giftResult = await userLevelService.processGiftCredits(user.id);
      if (giftResult.gifted) {
        logger.info(`[Auth] 新用户 ${phone} 首日赠送积分: ${giftResult.amount}`);
      }
    } catch (err: any) {
      logger.warn(`[Auth] 新用户赠送积分失败: ${err.message}`);
    }

    // 🔧 再处理推荐码绑定和奖励（在每日赠送之后，奖励是额外的）
    if (inviteCode) {
      try {
        const result = await referralService.bindReferralAndGrantBonus({
          refereeId: user.id,
          referralCode: inviteCode,
        });
        if (result.success) {
          logger.info(`[Referral] 新用户 ${user.id} 绑定推荐码 ${inviteCode} 成功，奖励已发放`);
        } else {
          logger.warn(`[Referral] 新用户 ${user.id} 绑定推荐码失败: ${result.message}`);
        }
      } catch (err: any) {
        logger.error(`[Referral] 绑定推荐码异常: ${err.message}`);
        // 不影响注册流程
      }
    }
  } else {
    // 检查用户是否被禁用
    if (!user.isActive) {
      throw new AppError('账户已被禁用，请联系管理员', 403);
    }
  }

  // 生成token
  const token = generateToken(user.id, phone, user.role);

  // 单点登录：查询并删除该用户所有已有会话，同时清除缓存
  const oldSessions = await prisma.session.findMany({
    where: { userId: user.id },
    select: { token: true },
  });
  
  // 清除旧 session 的 Redis 缓存（立即失效）
  if (oldSessions.length > 0) {
    const cacheKeys = oldSessions.map(s => `auth:session:${s.token.slice(-32)}`);
    try { await redis.del(...cacheKeys); } catch {}
    await prisma.session.deleteMany({ where: { userId: user.id } });
    // 🔒 实时踢出旧设备
    forceLogoutUser(user.id);
  }

  // 保存session
  await prisma.session.create({
    data: {
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  // 更新最后登录时间
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // 处理每日赠送积分（异步执行，不阻塞登录）
  // 注意：新用户已在注册流程中同步处理过，这里只处理老用户
  if (!isNewUser) {
    userLevelService.processGiftCredits(user.id).then(result => {
      if (result.gifted) {
        logger.info(`用户 ${phone} 获得每日赠送积分: ${result.amount}`);
      }
    }).catch(err => {
      logger.warn(`用户 ${phone} 赠送积分处理失败:`, err.message);
    });
  }

  logger.info(`用户登录: ${phone}`);

  // 返回用户信息（不包含敏感信息）
  const { password: _, ...userWithoutPassword } = user;

  res.json({
    success: true,
    message: '登录成功',
    token,
    user: userWithoutPassword,
  });
});

/**
 * 管理员登录（用户名密码 + 可选 TOTP）
 */
export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  const { username, password, totpCode } = req.body;

  // 查找管理员用户
  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user || user.loginType !== 'ADMIN') {
    throw new AppError('用户名或密码错误', 401);
  }

  // 验证密码
  if (!user.password) {
    throw new AppError('账户配置错误，请联系系统管理员', 500);
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new AppError('用户名或密码错误', 401);
  }

  // 检查用户是否被禁用
  if (!user.isActive) {
    throw new AppError('账户已被禁用，请联系管理员', 403);
  }

  // 验证是否为管理员角色
  if (user.role !== 'ADMIN' && user.role !== 'INTERNAL') {
    throw new AppError('无管理员权限', 403);
  }

  // 检查是否启用了双因素认证
  if ((user as any).totpEnabled) {
    if (!totpCode) {
      // 需要 TOTP 但未提供，返回特殊状态
      return res.json({
        success: false,
        requireTotp: true,
        message: '请输入双因素认证验证码',
      });
    }

    // 验证 TOTP
    const isTotpValid = totpService.verifyToken(totpCode, (user as any).totpSecret);
    if (!isTotpValid) {
      throw new AppError('验证码错误，请重新输入', 401);
    }
  }

  // 生成token
  const token = generateToken(user.id, username, user.role);

  // 单点登录：查询并删除该用户所有已有会话，同时清除缓存
  const oldSessions = await prisma.session.findMany({
    where: { userId: user.id },
    select: { token: true },
  });
  
  if (oldSessions.length > 0) {
    const cacheKeys = oldSessions.map(s => `auth:session:${s.token.slice(-32)}`);
    try { await redis.del(...cacheKeys); } catch {}
    await prisma.session.deleteMany({ where: { userId: user.id } });
    // 🔒 实时踢出旧设备
    forceLogoutUser(user.id);
  }

  // 保存session
  await prisma.session.create({
    data: {
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  // 更新最后登录时间
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  logger.info(`管理员登录: ${username}`);

  // 返回用户信息（不包含密码和 TOTP 密钥）
  const { password: _, totpSecret: __, ...userWithoutSensitive } = user as any;

  res.json({
    success: true,
    message: '登录成功',
    token,
    user: userWithoutSensitive,
  });
});

/**
 * 设置 TOTP 双因素认证（生成二维码）
 */
export const setupTotp = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;

  // 只有管理员可以设置 TOTP
  if (user.role !== 'ADMIN' && user.role !== 'INTERNAL') {
    throw new AppError('无权限', 403);
  }

  const accountName = user.username || user.email || user.phone || user.id;
  const result = await totpService.setupTotp(user.id, accountName);

  res.json({
    success: true,
    message: '请使用 Google Authenticator 扫描二维码',
    qrCode: result.qrCode,
    secret: result.secret, // 用于手动输入
  });
});

/**
 * 确认并激活 TOTP
 */
export const confirmTotp = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body;
  const user = req.user!;

  if (!code || code.length !== 6) {
    throw new AppError('请输入 6 位验证码', 400);
  }

  const success = await totpService.confirmTotp(user.id, code);

  if (!success) {
    throw new AppError('验证码错误，请重新输入', 400);
  }

  res.json({
    success: true,
    message: '双因素认证已启用',
  });
});

/**
 * 禁用 TOTP
 */
export const disableTotp = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body;
  const user = req.user!;

  // 验证当前 TOTP
  const isValid = await totpService.verifyUserTotp(user.id, code);
  if (!isValid) {
    throw new AppError('验证码错误', 400);
  }

  await totpService.disableTotp(user.id);

  res.json({
    success: true,
    message: '双因素认证已禁用',
  });
});

/**
 * 获取 TOTP 状态
 */
export const getTotpStatus = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const enabled = await totpService.isTotpEnabled(user.id);

  res.json({
    success: true,
    totpEnabled: enabled,
  });
});

/**
 * 用户登出
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.headers['authorization']?.split(' ')[1];
  
  if (token) {
    // 删除session
    await prisma.session.deleteMany({
      where: {
        token,
        userId: req.user!.id,
      },
    });
  }
  
  logger.info(`User logged out: ${req.user!.identifier}`);
  
  res.json({
    success: true,
    message: '登出成功',
  });
});

/**
 * 获取当前用户信息
 */
export const getCurrentUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      phone: true,
      email: true,
      username: true,
      nickname: true,
      avatar: true,
      role: true,
      credits: true,
      loginType: true,
      createdAt: true,
      updatedAt: true,
      lastLoginAt: true,
      membershipExpireAt: true,
      giftStartDate: true,
    },
  });
  
  if (!user) {
    throw new AppError('用户不存在', 404);
  }

  // 获取有效等级（考虑会员过期）
  const effectiveRole = await userLevelService.getEffectiveUserRole(user.id);

  // 获取等级配置
  const levelConfig = await userLevelService.getUserLevelConfig(effectiveRole);

  // 获取今日赠送积分状态
  const giftStatus = await userLevelService.getGiftCreditsStatus(user.id);
  
  res.json({
    success: true,
    user: {
      ...user,
      effectiveRole,
      levelConfig: levelConfig ? {
        dailyGiftCredits: levelConfig.dailyGiftCredits,
        giftDays: levelConfig.giftDays,
        maxConcurrency: levelConfig.maxConcurrency,
      } : null,
      giftStatus,
    },
  });
});

/**
 * 刷新token
 */
export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  
  // 生成新token
  const newToken = generateToken(user.id, user.phone || user.email || user.username || '', user.role);
  
  // 单点登录：查询并删除该用户所有已有会话，同时清除缓存
  const oldSessions = await prisma.session.findMany({
    where: { userId: user.id },
    select: { token: true },
  });
  
  if (oldSessions.length > 0) {
    const cacheKeys = oldSessions.map(s => `auth:session:${s.token.slice(-32)}`);
    try { await redis.del(...cacheKeys); } catch {}
    await prisma.session.deleteMany({ where: { userId: user.id } });
    // 🔒 实时踢出旧设备
    forceLogoutUser(user.id);
  }
  
  // 保存新session
  await prisma.session.create({
    data: {
      userId: user.id,
      token: newToken,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
  
  res.json({
    success: true,
    token: newToken,
  });
});

