import { Request, Response } from 'express';
/**
 * 获取所有用户等级配置
 */
export declare const getAllLevelConfigs: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 更新用户等级配置
 */
export declare const updateLevelConfig: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 批量更新用户等级配置
 */
export declare const batchUpdateLevelConfigs: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取所有模型权限配置
 */
export declare const getAllModelPermissions: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 更新模型权限配置
 */
export declare const updateModelPermission: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 批量更新模型权限配置
 */
export declare const batchUpdateModelPermissions: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 删除模型权限配置
 */
export declare const deleteModelPermission: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取模型权限配置摘要（按模型分组）
 */
export declare const getModelPermissionsSummary: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 快速为模型设置所有等级权限
 */
export declare const setModelPermissionsForAllLevels: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取用户使用统计
 */
export declare const getUserUsageStats: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 手动赠送用户积分
 */
export declare const grantGiftCredits: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取用户赠送积分状态
 */
export declare const getGiftCreditsStatus: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 更新用户会员信息
 */
export declare const updateUserMembership: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 预览存储清理（不实际删除）
 */
export declare const previewStorageCleanup: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 手动执行存储清理
 */
export declare const runStorageCleanup: (req: Request, res: Response, next: import("express").NextFunction) => void;
//# sourceMappingURL=user-level.controller.d.ts.map