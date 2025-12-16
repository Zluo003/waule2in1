import { Request, Response, NextFunction } from 'express';
/**
 * 发送手机验证码
 */
export declare const sendVerificationCode: (req: Request, res: Response, next: NextFunction) => void;
/**
 * 手机验证码登录/注册
 */
export declare const loginWithPhone: (req: Request, res: Response, next: NextFunction) => void;
/**
 * 管理员登录（用户名密码 + 可选 TOTP）
 */
export declare const adminLogin: (req: Request, res: Response, next: NextFunction) => void;
/**
 * 设置 TOTP 双因素认证（生成二维码）
 */
export declare const setupTotp: (req: Request, res: Response, next: NextFunction) => void;
/**
 * 确认并激活 TOTP
 */
export declare const confirmTotp: (req: Request, res: Response, next: NextFunction) => void;
/**
 * 禁用 TOTP
 */
export declare const disableTotp: (req: Request, res: Response, next: NextFunction) => void;
/**
 * 获取 TOTP 状态
 */
export declare const getTotpStatus: (req: Request, res: Response, next: NextFunction) => void;
/**
 * 用户登出
 */
export declare const logout: (req: Request, res: Response, next: NextFunction) => void;
/**
 * 获取当前用户信息
 */
export declare const getCurrentUser: (req: Request, res: Response, next: NextFunction) => void;
/**
 * 刷新token
 */
export declare const refreshToken: (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.controller.d.ts.map