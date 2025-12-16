import { Request, Response } from 'express';
/**
 * 翻译文本
 */
export declare const translateText: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 智能翻译（自动检测语言，如果不是英文则翻译）
 */
export declare const smartTranslate: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 检测语言
 */
export declare const detectLanguage: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=translation.controller.d.ts.map