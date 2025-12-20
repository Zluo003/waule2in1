import { Request, Response } from 'express';
/**
 * 获取所有节点提示词模板（管理员）
 */
export declare const getAllNodePrompts: (req: Request, res: Response) => Promise<void>;
/**
 * 根据节点类型获取提示词模板
 */
export declare const getNodePromptByType: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 根据ID获取提示词模板（管理员）
 */
export declare const getNodePromptById: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 创建节点提示词模板（管理员）
 */
export declare const createNodePrompt: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 更新节点提示词模板（管理员）
 */
export declare const updateNodePrompt: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 删除节点提示词模板（管理员）
 */
export declare const deleteNodePrompt: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 切换节点提示词模板启用状态（管理员）
 */
export declare const toggleNodePromptActive: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 初始化高清放大节点的默认提示词模板（管理员）
 */
export declare const initHDUpscaleTemplate: (_req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 初始化智能溶图节点的默认提示词模板（管理员）
 */
export declare const initImageFusionTemplate: (_req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 初始化智能分镜节点的默认提示词模板（管理员）
 */
export declare const initSmartStoryboardTemplate: (_req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=node-prompt.controller.d.ts.map