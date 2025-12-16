import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma, redis } from '../index';
import { AppError } from './errorHandler';

// 更新用户活跃状态到 Redis（用于统计在线用户）
const updateUserActivity = async (userId: string) => {
  try {
    const key = `user:active:${userId}`;
    // 设置 5 分钟过期，如果用户 5 分钟内没有请求则自动移除
    await redis.setex(key, 300, Date.now().toString());
  } catch (e) {
    // Redis 错误不影响正常请求
  }
};

// 扩展Request类型以包含user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        identifier: string; // phone, email, username
        phone?: string;
        email?: string;
        username?: string;
        role: string;
      };
    }
  }
}

interface JwtPayload {
  userId: string;
  identifier: string;
  role: string;
}

// 验证JWT token
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      throw new AppError('未提供认证令牌', 401);
    }
    
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new AppError('服务器配置错误: JWT_SECRET 未设置', 500);
    }
    const decoded = jwt.verify(token, secret) as JwtPayload;
    
    // 🚀 优化：从 Redis 缓存获取用户信息，减少数据库查询
    const cacheKey = `auth:user:${decoded.userId}`;
    let user: any = null;
    
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        user = JSON.parse(cached);
      }
    } catch {}
    
    // 缓存未命中，查询数据库
    if (!user) {
      user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          phone: true,
          email: true,
          username: true,
          role: true,
          isActive: true,
        },
      });
      
      // 缓存用户信息 2 分钟
      if (user) {
        try { await redis.set(cacheKey, JSON.stringify(user), 'EX', 120); } catch {}
      }
    }
    
    if (!user || !user.isActive) {
      throw new AppError('用户不存在或已被禁用', 401);
    }
    
    req.user = {
      id: user.id,
      identifier: decoded.identifier,
      phone: user.phone || undefined,
      email: user.email || undefined,
      username: user.username || undefined,
      role: user.role,
    };
    
    // 更新用户活跃状态（异步，不阻塞请求）
    updateUserActivity(user.id);
    
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('无效的认证令牌', 401));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new AppError('认证令牌已过期', 401));
    } else {
      next(error);
    }
  }
};

// 验证用户角色
export const authorizeRoles = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // 🔇 减少日志输出（server-metrics 每 5 秒调用一次）
    if (!req.user) {
      return next(new AppError('未认证', 401));
    }
    
    if (!roles.includes(req.user.role)) {
      return next(new AppError('没有权限访问此资源', 403));
    }
    
    next();
  };
};

// 可选认证（不强制要求登录）
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        return next();
      }
      const decoded = jwt.verify(token, secret) as JwtPayload;
      
      // 🚀 优化：使用缓存
      const cacheKey = `auth:user:${decoded.userId}`;
      let user: any = null;
      
      try {
        const cached = await redis.get(cacheKey);
        if (cached) user = JSON.parse(cached);
      } catch {}
      
      if (!user) {
        user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: {
            id: true,
            phone: true,
            email: true,
            username: true,
            role: true,
            isActive: true,
          },
        });
        if (user) {
          try { await redis.set(cacheKey, JSON.stringify(user), 'EX', 120); } catch {}
        }
      }
      
      if (user && user.isActive) {
        req.user = {
          id: user.id,
          identifier: decoded.identifier,
          phone: user.phone || undefined,
          email: user.email || undefined,
          username: user.username || undefined,
          role: user.role,
        };
      }
    }
    
    next();
  } catch (error) {
    // 可选认证失败不报错，继续处理
    next();
  }
};

export default {
  authenticateToken,
  authorizeRoles,
  optionalAuth,
};

