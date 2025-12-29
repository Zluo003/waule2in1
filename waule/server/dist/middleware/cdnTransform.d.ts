import { Request, Response, NextFunction } from 'express';
/**
 * 中间件：自动将响应中的 OSS URL 转换为 CDN URL
 */
export declare const cdnTransformMiddleware: (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=cdnTransform.d.ts.map