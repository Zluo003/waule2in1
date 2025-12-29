import { Request, Response, NextFunction } from 'express';
import { toCdnUrl } from '../utils/oss';

/**
 * 递归转换对象中的 OSS URL 为 CDN URL
 */
function transformUrls(obj: any): any {
  if (!obj) return obj;
  if (typeof obj === 'string') {
    return obj.includes('.aliyuncs.com/') ? toCdnUrl(obj) : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(transformUrls);
  }
  if (typeof obj === 'object') {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = transformUrls(obj[key]);
    }
    return result;
  }
  return obj;
}

/**
 * 中间件：自动将响应中的 OSS URL 转换为 CDN URL
 */
export const cdnTransformMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);

  res.json = (body: any) => {
    return originalJson(transformUrls(body));
  };

  next();
};
