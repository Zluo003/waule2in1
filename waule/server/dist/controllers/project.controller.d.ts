import { Request, Response } from 'express';
/**
 * 获取所有项目
 */
export declare const getAllProjects: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取单个项目
 */
export declare const getProjectById: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 创建项目
 */
export declare const createProject: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 更新项目
 */
export declare const updateProject: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 删除项目
 */
export declare const deleteProject: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取项目的所有集数
 */
export declare const getEpisodes: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 创建集数
 */
export declare const createEpisode: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 搜索用户（用于添加协作者）
 */
export declare const searchUsers: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取项目的协作者列表
 */
export declare const getProjectCollaborators: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 添加项目协作者（项目级只有只读权限，管理员可公开共享给所有人）
 */
export declare const addProjectCollaborator: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 移除项目协作者
 */
export declare const removeProjectCollaborator: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取共享给我的项目列表（包括公开项目）
 */
export declare const getSharedProjects: (req: Request, res: Response, next: import("express").NextFunction) => void;
//# sourceMappingURL=project.controller.d.ts.map