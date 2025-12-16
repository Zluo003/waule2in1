/**
 * 支付控制器
 * 包含支付配置管理、套餐管理、订单管理等功能
 */
import { Request, Response } from 'express';
/**
 * 获取所有支付配置
 */
export declare const getPaymentConfigs: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取单个支付配置（包含完整信息）
 */
export declare const getPaymentConfig: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 创建或更新支付配置
 */
export declare const upsertPaymentConfig: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 删除支付配置
 */
export declare const deletePaymentConfig: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 测试支付配置连通性
 */
export declare const testPaymentConfig: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取所有套餐（管理员）
 */
export declare const getAllPackages: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取活跃套餐（用户端）
 */
export declare const getActivePackages: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 创建套餐
 */
export declare const createPackage: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 更新套餐
 */
export declare const updatePackage: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 删除套餐
 */
export declare const deletePackage: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 创建充值订单
 */
export declare const createOrder: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 查询订单状态
 */
export declare const getOrderStatus: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取用户订单列表
 */
export declare const getUserOrders: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取用户积分流水
 */
export declare const getUserTransactions: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 支付宝回调
 */
export declare const alipayCallback: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 微信支付回调（预留）
 */
export declare const wechatCallback: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 管理员手动确认订单（处理漏单情况）
 */
export declare const adminConfirmOrder: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 管理员手动给用户充值
 */
export declare const adminRecharge: (req: Request, res: Response, next: import("express").NextFunction) => void;
//# sourceMappingURL=payment.controller.d.ts.map