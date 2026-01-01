import { Request, Response, NextFunction } from 'express';
import { getApiSecret } from '../config';
import { getSession, deleteSession } from '../database';

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

// Session认证（管理后台）- 使用JSON文件存储，支持多实例
export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const sessionToken = req.cookies?.session;
  if (!sessionToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const session = getSession(sessionToken);
  if (!session || session.expires_at < Date.now()) {
    if (session) deleteSession(sessionToken);
    return res.status(401).json({ error: 'Session expired' });
  }

  next();
}
