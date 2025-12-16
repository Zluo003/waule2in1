import { Request, Response } from 'express';
/**
 * 获取所有设置（管理员）
 */
export declare const getAllSettings: (req: Request, res: Response) => Promise<void>;
/**
 * 获取 Midjourney 设置
 */
export declare const getMidjourneySettings: (req: Request, res: Response) => Promise<void>;
/**
 * 更新 Midjourney 设置（管理员）
 */
export declare const updateMidjourneySettings: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=settings.controller.d.ts.map