import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as messageService from '../services/message.service';

// ==================== 用户端 API ====================

/**
 * 获取用户消息列表
 */
export const getMessages = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, message: '未授权' });
  }

  const { page, pageSize } = req.query;
  const result = await messageService.getUserMessages(userId, {
    page: page ? parseInt(page as string) : 1,
    pageSize: pageSize ? parseInt(pageSize as string) : 20,
  });

  res.json({ success: true, data: result });
});

/**
 * 获取未读消息数量
 */
export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, message: '未授权' });
  }

  const result = await messageService.getUnreadCount(userId);
  res.json({ success: true, data: result });
});

/**
 * 标记消息为已读
 */
export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, message: '未授权' });
  }

  const { id } = req.params;
  await messageService.markAsRead(userId, id);
  res.json({ success: true, message: '已标记为已读' });
});

/**
 * 标记所有消息为已读
 */
export const markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, message: '未授权' });
  }

  const result = await messageService.markAllAsRead(userId);
  res.json(result);
});

/**
 * 删除消息
 */
export const deleteMessage = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, message: '未授权' });
  }

  const { id } = req.params;
  const result = await messageService.deleteUserMessage(userId, id);
  res.json(result);
});

/**
 * 清空所有消息
 */
export const clearAllMessages = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, message: '未授权' });
  }

  const result = await messageService.clearAllMessages(userId);
  res.json(result);
});

// ==================== 管理员 API ====================

/**
 * 发送消息（管理员）
 */
export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const senderId = req.user?.id;
  if (!senderId) {
    return res.status(401).json({ success: false, message: '未授权' });
  }

  const { title, content, type, targetType, targetRoles, targetUsers } = req.body;

  if (!title || !content) {
    return res.status(400).json({ success: false, message: '请填写标题和内容' });
  }

  const result = await messageService.createAndSendMessage({
    title,
    content,
    type,
    targetType,
    targetRoles,
    targetUsers,
    senderId,
  });

  res.json(result);
});

/**
 * 获取系统消息列表（管理员）
 */
export const getSystemMessages = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize } = req.query;
  const result = await messageService.getSystemMessages({
    page: page ? parseInt(page as string) : 1,
    pageSize: pageSize ? parseInt(pageSize as string) : 20,
  });

  res.json({ success: true, data: result });
});

/**
 * 删除系统消息（管理员）
 */
export const deleteSystemMessage = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await messageService.deleteSystemMessage(id);
  res.json(result);
});
