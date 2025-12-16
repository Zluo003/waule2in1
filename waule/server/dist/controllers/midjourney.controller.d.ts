import { Request, Response } from 'express';
/**
 * 提交 Imagine 任务
 */
export declare const imagine: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 查询任务状态
 */
export declare const fetchTask: (req: Request, res: Response) => Promise<void>;
/**
 * 轮询任务直到完成
 */
export declare const pollTask: (req: Request, res: Response) => Promise<void>;
/**
 * 执行动作（Upscale、Variation 等）
 */
export declare const action: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * Blend（图片混合）
 */
export declare const blend: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * Describe（图生文）
 */
export declare const describe: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 上传参考图到 Discord（用于 V7 Omni-Reference）
 */
export declare const uploadReferenceImage: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=midjourney.controller.d.ts.map