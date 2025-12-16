import { Request, Response } from 'express';
/**
 * 提取文档文本内容
 */
export declare const extractDocumentText: (req: Request, res: Response) => Promise<void>;
/**
 * 获取文档的base64编码（用于AI调用）
 */
export declare const getDocumentBase64: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=document.controller.d.ts.map