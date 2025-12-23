import { Request, Response } from 'express';
/**
 * 创建图片生成任务
 */
export declare const createImageTask: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 创建图片编辑任务
 */
export declare const createImageEditTask: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 创建视频生成任务
 */
export declare const createVideoTask: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 创建视频编辑任务（wan2.2-animate-mix 等专用）
 */
export declare const createVideoEditTask: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 查询任务状态
 */
export declare const getTaskStatus: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 获取用户的任务列表
 */
export declare const getUserTasks: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 获取进行中的任务（用于页面刷新后恢复轮询）
 */
export declare const getActiveTask: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 获取待创建的预览节点（用于页面刷新后恢复）
 */
export declare const getPendingPreviewNodes: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 创建分镜脚本任务（TEXT → JSON → 保存到 Episode.scriptJson）
 */
export declare const createStoryboardTask: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 标记预览节点已创建
 */
export declare const markPreviewNodeCreated: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 保存节点任务ID到Redis
 */
export declare const saveNodeTask: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 获取节点的任务ID（批量）
 */
export declare const getNodeTasks: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 删除节点的任务ID
 */
export declare const deleteNodeTask: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=task.controller.d.ts.map