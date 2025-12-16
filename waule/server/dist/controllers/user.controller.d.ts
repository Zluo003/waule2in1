import { Request, Response } from 'express';
import multer from 'multer';
export declare const avatarUpload: multer.Multer;
export declare const getProfile: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateProfile: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const uploadAvatar: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const checkNickname: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const changePassword: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 获取头像直传 OSS 的预签名 URL
 */
export declare const getAvatarUploadUrl: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * 确认头像直传完成，更新用户头像
 */
export declare const confirmAvatarUpload: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=user.controller.d.ts.map