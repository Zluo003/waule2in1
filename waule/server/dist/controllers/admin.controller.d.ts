import { Request, Response } from 'express';
/**
 * 获取所有用户
 */
export declare const getAllUsers: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 更新用户
 */
export declare const updateUser: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 删除用户
 */
export declare const deleteUser: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取所有AI模型
 */
export declare const getAllAIModels: (req: Request, res: Response, next: import("express").NextFunction) => void;
export declare const getAIPresets: (req: Request, res: Response, next: import("express").NextFunction) => void;
export declare const upsertModelCapabilities: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 创建AI模型
 */
export declare const createAIModel: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 更新AI模型
 */
export declare const updateAIModel: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 删除AI模型
 */
export declare const deleteAIModel: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取系统设置
 */
export declare const getSettings: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 更新系统设置
 */
export declare const updateSettings: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取运营仪表板统计数据
 */
export declare const getStatistics: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取服务器监控指标
 */
export declare const getServerMetrics: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取任务列表（支持多重筛选）
 */
export declare const getTasks: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取任务统计数据
 */
export declare const getTaskStats: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 手动退款（将积分返还给用户）
 */
export declare const refundTask: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 取消任务（标记为失败）
 */
export declare const cancelTask: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取指定用户的工作流列表（管理员巡查）
 */
export declare const getUserWorkflows: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取指定用户的资产库列表（管理员巡查）
 */
export declare const getUserAssetLibraries: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取指定资产库的资产列表（管理员巡查）
 */
export declare const getAssetLibraryAssets: (req: Request, res: Response, next: import("express").NextFunction) => void;
//# sourceMappingURL=admin.controller.d.ts.map