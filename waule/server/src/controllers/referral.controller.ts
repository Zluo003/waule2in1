import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as referralService from '../services/referral.service';
import { WithdrawalType, WithdrawalStatus } from '@prisma/client';

/**
 * 获取用户推荐信息
 */
export const getReferralInfo = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, message: '未授权' });
  }

  const info = await referralService.getUserReferralInfo(userId);
  res.json({ success: true, data: info });
});

/**
 * 获取我推荐的用户列表
 */
export const getReferrals = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, message: '未授权' });
  }

  const { page, pageSize } = req.query;
  const result = await referralService.getUserReferrals(userId, {
    page: page ? parseInt(page as string) : 1,
    pageSize: pageSize ? parseInt(pageSize as string) : 20,
  });

  res.json({ success: true, data: result });
});

/**
 * 获取返利记录
 */
export const getCommissions = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, message: '未授权' });
  }

  const { page, pageSize, type } = req.query;
  const result = await referralService.getCommissionRecords(userId, {
    page: page ? parseInt(page as string) : 1,
    pageSize: pageSize ? parseInt(pageSize as string) : 20,
    type: type as any,
  });

  res.json({ success: true, data: result });
});

/**
 * 申请提现
 */
export const requestWithdrawal = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, message: '未授权' });
  }

  const { amount, type, alipayAccount, alipayName } = req.body;

  if (!amount || !type) {
    return res.status(400).json({ success: false, message: '请填写提现金额和类型' });
  }

  if (!['ALIPAY', 'CREDITS'].includes(type)) {
    return res.status(400).json({ success: false, message: '无效的提现类型' });
  }

  const result = await referralService.requestWithdrawal({
    userId,
    amount: parseInt(amount),
    type: type as WithdrawalType,
    alipayAccount,
    alipayName,
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

/**
 * 获取提现记录
 */
export const getWithdrawals = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, message: '未授权' });
  }

  const { page, pageSize } = req.query;
  const result = await referralService.getWithdrawalRecords(userId, {
    page: page ? parseInt(page as string) : 1,
    pageSize: pageSize ? parseInt(pageSize as string) : 20,
  });

  res.json({ success: true, data: result });
});

/**
 * 绑定推荐码（注册后补填）
 */
export const bindReferralCode = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, message: '未授权' });
  }

  const { referralCode } = req.body;
  if (!referralCode) {
    return res.status(400).json({ success: false, message: '请填写推荐码' });
  }

  const result = await referralService.bindReferralAndGrantBonus({
    refereeId: userId,
    referralCode,
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

// ============== 管理后台 ==============

/**
 * 获取推荐配置（管理后台）
 */
export const getConfig = asyncHandler(async (req: Request, res: Response) => {
  const config = await referralService.getReferralConfig();
  res.json({ success: true, data: config });
});

/**
 * 更新推荐配置（管理后台）
 */
export const updateConfig = asyncHandler(async (req: Request, res: Response) => {
  const { isActive, referrerBonus, refereeBonus, commissionRate, minWithdrawAmount, withdrawToCreditsRate } = req.body;

  const config = await referralService.updateReferralConfig({
    isActive,
    referrerBonus,
    refereeBonus,
    commissionRate,
    minWithdrawAmount,
    withdrawToCreditsRate,
  });

  res.json({ success: true, message: '配置更新成功', data: config });
});

/**
 * 获取推荐统计（管理后台）
 */
export const getStats = asyncHandler(async (req: Request, res: Response) => {
  const stats = await referralService.getReferralStats();
  res.json({ success: true, data: stats });
});

/**
 * 获取提现申请列表（管理后台）
 */
export const getWithdrawalRequests = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, status } = req.query;

  const result = await referralService.getWithdrawalRequests({
    page: page ? parseInt(page as string) : 1,
    pageSize: pageSize ? parseInt(pageSize as string) : 20,
    status: status as WithdrawalStatus,
  });

  res.json({ success: true, data: result });
});

/**
 * 处理提现申请（管理后台）
 */
export const processWithdrawal = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { action, rejectReason } = req.body;
  const adminId = req.user?.id;

  if (!adminId) {
    return res.status(401).json({ success: false, message: '未授权' });
  }

  if (!['approve', 'complete', 'reject'].includes(action)) {
    return res.status(400).json({ success: false, message: '无效操作' });
  }

  const result = await referralService.processWithdrawal({
    id,
    action,
    adminId,
    rejectReason,
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});
