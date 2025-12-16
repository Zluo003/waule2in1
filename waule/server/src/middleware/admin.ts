import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

// 检查用户是否为管理员
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(new AppError('未认证', 401));
  }

  if (req.user.role !== 'ADMIN') {
    return next(new AppError('需要管理员权限', 403));
  }

  next();
};

export default isAdmin;

