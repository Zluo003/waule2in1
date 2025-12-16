/**
 * 兑换码控制器
 */
import { Request, Response } from 'express';
/**
 * 获取兑换码列表
 */
export declare const getRedeemCodes: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 批量生成兑换码
 */
export declare const generateRedeemCodes: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 删除兑换码
 */
export declare const deleteRedeemCode: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 批量删除兑换码（按批次）
 */
export declare const deleteBatch: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取批次列表
 */
export declare const getBatches: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 兑换码兑换
 */
export declare const redeemCode: (req: Request, res: Response, next: import("express").NextFunction) => void;
//# sourceMappingURL=redeem.controller.d.ts.map