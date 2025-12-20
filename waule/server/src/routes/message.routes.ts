import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import * as messageController from '../controllers/message.controller';

const router = Router();

// ==================== 用户端 API ====================

// 获取消息列表
router.get('/', authenticateToken, messageController.getMessages);

// 获取未读消息数量
router.get('/unread-count', authenticateToken, messageController.getUnreadCount);

// 标记消息为已读
router.put('/:id/read', authenticateToken, messageController.markAsRead);

// 标记所有消息为已读
router.put('/read-all', authenticateToken, messageController.markAllAsRead);

// 删除消息
router.delete('/:id', authenticateToken, messageController.deleteMessage);

// 清空所有消息
router.delete('/', authenticateToken, messageController.clearAllMessages);

// ==================== 管理员 API ====================

// 发送消息
router.post('/admin/send', authenticateToken, authorizeRoles('ADMIN'), messageController.sendMessage);

// 获取系统消息列表
router.get('/admin/list', authenticateToken, authorizeRoles('ADMIN'), messageController.getSystemMessages);

// 删除系统消息
router.delete('/admin/:id', authenticateToken, authorizeRoles('ADMIN'), messageController.deleteSystemMessage);

export default router;
