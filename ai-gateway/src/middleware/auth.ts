import { Request, Response, NextFunction } from 'express';
import { getApiSecret } from '../config';

export function apiAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.slice(7);
  const apiSecret = getApiSecret();

  if (token !== apiSecret) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
}

// Session认证（管理后台）
export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const sessionToken = req.cookies?.session;
  if (!sessionToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // 简单的session验证
  const validSession = sessionStore.get(sessionToken);
  if (!validSession || validSession.expires < Date.now()) {
    sessionStore.delete(sessionToken);
    return res.status(401).json({ error: 'Session expired' });
  }

  next();
}

// 简单的内存session存储
export const sessionStore = new Map<string, { username: string; expires: number }>();
