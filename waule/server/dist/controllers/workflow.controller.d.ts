import { Request, Response } from 'express';
/**
 * 获取所有工作流（包含共享给我的）
 */
export declare const getAllWorkflows: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取单个工作流（支持协作者访问，根据权限返回 canEdit）
 * 🚀 优化：添加 Redis 缓存减少数据库查询
 */
export declare const getWorkflowById: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取或创建项目的工作流
 */
export declare const getOrCreateProjectWorkflow: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取或创建剧集的工作流
 */
export declare const getOrCreateEpisodeWorkflow: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 保存/更新工作流
 */
export declare const saveWorkflow: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 通过ID更新工作流（支持协作者编辑）
 */
export declare const updateWorkflowById: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 保存/更新剧集工作流
 */
export declare const saveEpisodeWorkflow: (req: Request, res: Response, next: import("express").NextFunction) => void;
export declare const getOrCreateShotWorkflow: (req: Request, res: Response, next: import("express").NextFunction) => void;
export declare const saveShotWorkflow: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 删除工作流
 */
export declare const deleteWorkflow: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取工作流协作者列表
 */
export declare const getWorkflowCollaborators: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 添加工作流协作者（支持权限设置，管理员可公开共享给所有人）
 */
export declare const shareWorkflow: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 更新协作者权限
 */
export declare const updateWorkflowSharePermission: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 取消工作流分享
 */
export declare const unshareWorkflow: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 搜索用户（用于添加协作者）
 */
export declare const searchUsersForWorkflow: (req: Request, res: Response, next: import("express").NextFunction) => void;
//# sourceMappingURL=workflow.controller.d.ts.map