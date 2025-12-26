import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      tenantUser?: {
        id: string;
        tenantId: string;
        username: string;
        nickname: string | null;
        isAdmin: boolean;
        personalCredits: number;
        tenant: {
          id: string;
          name: string;
          apiKey: string;
          credits: number;
          creditMode: string;
          isActive: boolean;
        };
      };
    }
  }
}

/**
 * 租户用户认证中间件
 */
export const authenticateTenantUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: '未提供认证令牌' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as {
      userId: string;
      tenantId: string;
      type: string;
    };

    // 验证是租户用户 token
    if (decoded.type !== 'tenant_user') {
      return res.status(401).json({ success: false, message: '无效的认证令牌' });
    }

    // 获取用户信息（包含 currentToken 用于单点登录验证）
    const tenantUser = await prisma.tenantUser.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        tenantId: true,
        username: true,
        nickname: true,
        isAdmin: true,
        isActive: true,
        currentToken: true,
        personalCredits: true,
        tenant: {
          select: {
            id: true,
            name: true,
            apiKey: true,
            credits: true,
            creditMode: true,
            isActive: true,
          },
        },
      },
    });

    if (!tenantUser) {
      return res.status(401).json({ success: false, message: '用户不存在' });
    }

    if (!tenantUser.isActive) {
      return res.status(401).json({ success: false, message: '账号已被禁用' });
    }

    if (!tenantUser.tenant.isActive) {
      return res.status(401).json({ success: false, message: '租户已被禁用' });
    }

    // 单点登录验证：检查 token 是否为当前有效的登录 token
    if (tenantUser.currentToken && tenantUser.currentToken !== token) {
      return res.status(401).json({ 
        success: false, 
        message: '账号已在其他设备登录，请重新登录',
        code: 'SESSION_EXPIRED',
      });
    }

    // 将用户信息附加到请求对象
    req.tenantUser = {
      id: tenantUser.id,
      tenantId: tenantUser.tenantId,
      username: tenantUser.username,
      nickname: tenantUser.nickname,
      isAdmin: tenantUser.isAdmin,
      personalCredits: tenantUser.personalCredits,
      tenant: tenantUser.tenant,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ success: false, message: '认证令牌已过期' });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ success: false, message: '无效的认证令牌' });
    }
    console.error('Tenant auth error:', error);
    return res.status(500).json({ success: false, message: '认证失败' });
  }
};

/**
 * 租户管理员授权中间件
 */
export const authorizeTenantAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.tenantUser?.isAdmin) {
    return res.status(403).json({ success: false, message: '需要管理员权限' });
  }
  next();
};

/**
 * 租户 API Key 认证中间件
 * 用于租户服务端调用（不需要用户 token，只需要租户 API Key）
 */
export const authenticateTenantApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: '未提供认证令牌' });
    }

    const apiKey = authHeader.split(' ')[1];
    
    // 检查是否是租户 API Key（格式：wk_live_xxx）
    if (!apiKey.startsWith('wk_live_')) {
      return res.status(401).json({ success: false, message: '无效的 API Key' });
    }

    // 查找租户
    const tenant = await prisma.tenant.findUnique({
      where: { apiKey },
      select: {
        id: true,
        name: true,
        apiKey: true,
        credits: true,
        creditMode: true,
        isActive: true,
      },
    });

    if (!tenant) {
      return res.status(401).json({ success: false, message: '无效的 API Key' });
    }

    if (!tenant.isActive) {
      return res.status(401).json({ success: false, message: '租户已被禁用' });
    }

    // 将租户信息附加到请求对象（模拟一个系统用户）
    req.tenantUser = {
      id: 'system',
      tenantId: tenant.id,
      username: 'tenant-server',
      nickname: '租户服务端',
      isAdmin: true,
      personalCredits: 0,
      tenant: tenant,
    };

    next();
  } catch (error) {
    console.error('Tenant API Key auth error:', error);
    return res.status(500).json({ success: false, message: '认证失败' });
  }
};

/**
 * 混合认证中间件：支持用户 token 或租户 API Key
 * 优先检查 X-Tenant-API-Key 头（租户服务端使用）
 * 其次检查 Authorization 头（用户 token 或 API Key）
 */
export const authenticateTenantUserOrApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // 1. 优先检查 X-Tenant-API-Key 头（租户服务端专用）
  const tenantApiKey = req.headers['x-tenant-api-key'] as string;
  if (tenantApiKey && tenantApiKey.startsWith('wk_live_')) {
    // 直接使用 API Key 进行认证
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { apiKey: tenantApiKey },
        select: {
          id: true,
          name: true,
          apiKey: true,
          credits: true,
          creditMode: true,
          isActive: true,
        },
      });

      if (!tenant) {
        return res.status(401).json({ success: false, message: '无效的 API Key' });
      }

      if (!tenant.isActive) {
        return res.status(401).json({ success: false, message: '租户已被禁用' });
      }

      // 将租户信息附加到请求对象（模拟一个系统用户）
      req.tenantUser = {
        id: 'system',
        tenantId: tenant.id,
        username: 'tenant-server',
        nickname: '租户服务端',
        isAdmin: true,
        personalCredits: 0,
        tenant: tenant,
      };

      return next();
    } catch (error) {
      console.error('Tenant API Key auth error:', error);
      return res.status(500).json({ success: false, message: '认证失败' });
    }
  }

  // 2. 检查 Authorization 头
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '未提供认证令牌' });
  }

  const token = authHeader.split(' ')[1];
  
  // 如果是 API Key，使用 API Key 认证
  if (token.startsWith('wk_live_')) {
    return authenticateTenantApiKey(req, res, next);
  }
  
  // 否则使用用户 token 认证
  return authenticateTenantUser(req, res, next);
};




