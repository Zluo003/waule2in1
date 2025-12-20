import { Request, Response } from 'express';
/**
 * 获取用户推荐信息
 */
export declare const getReferralInfo: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取我推荐的用户列表
 */
export declare const getReferrals: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取返利记录
 */
export declare const getCommissions: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 申请提现
 */
export declare const requestWithdrawal: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取提现记录
 */
export declare const getWithdrawals: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 绑定推荐码（注册后补填）
 */
export declare const bindReferralCode: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取推荐配置（管理后台）
 */
export declare const getConfig: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 更新推荐配置（管理后台）
 */
export declare const updateConfig: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取推荐统计（管理后台）
 */
export declare const getStats: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取提现申请列表（管理后台）
 */
export declare const getWithdrawalRequests: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 处理提现申请（管理后台）
 */
export declare const processWithdrawal: (req: Request, res: Response, next: import("express").NextFunction) => void;
//# sourceMappingURL=referral.controller.d.ts.map