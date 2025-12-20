import { Request, Response } from 'express';
/**
 * 获取用户消息列表
 */
export declare const getMessages: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取未读消息数量
 */
export declare const getUnreadCount: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 标记消息为已读
 */
export declare const markAsRead: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 标记所有消息为已读
 */
export declare const markAllAsRead: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 删除消息
 */
export declare const deleteMessage: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 清空所有消息
 */
export declare const clearAllMessages: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 发送消息（管理员）
 */
export declare const sendMessage: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取系统消息列表（管理员）
 */
export declare const getSystemMessages: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 删除系统消息（管理员）
 */
export declare const deleteSystemMessage: (req: Request, res: Response, next: import("express").NextFunction) => void;
//# sourceMappingURL=message.controller.d.ts.map