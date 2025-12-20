"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSystemMessage = exports.getSystemMessages = exports.sendMessage = exports.clearAllMessages = exports.deleteMessage = exports.markAllAsRead = exports.markAsRead = exports.getUnreadCount = exports.getMessages = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const messageService = __importStar(require("../services/message.service"));
// ==================== 用户端 API ====================
/**
 * 获取用户消息列表
 */
exports.getMessages = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ success: false, message: '未授权' });
    }
    const { page, pageSize } = req.query;
    const result = await messageService.getUserMessages(userId, {
        page: page ? parseInt(page) : 1,
        pageSize: pageSize ? parseInt(pageSize) : 20,
    });
    res.json({ success: true, data: result });
});
/**
 * 获取未读消息数量
 */
exports.getUnreadCount = (0, errorHandler_1.asyncHandler)(async (req, res) => {
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
exports.markAsRead = (0, errorHandler_1.asyncHandler)(async (req, res) => {
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
exports.markAllAsRead = (0, errorHandler_1.asyncHandler)(async (req, res) => {
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
exports.deleteMessage = (0, errorHandler_1.asyncHandler)(async (req, res) => {
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
exports.clearAllMessages = (0, errorHandler_1.asyncHandler)(async (req, res) => {
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
exports.sendMessage = (0, errorHandler_1.asyncHandler)(async (req, res) => {
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
exports.getSystemMessages = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { page, pageSize } = req.query;
    const result = await messageService.getSystemMessages({
        page: page ? parseInt(page) : 1,
        pageSize: pageSize ? parseInt(pageSize) : 20,
    });
    res.json({ success: true, data: result });
});
/**
 * 删除系统消息（管理员）
 */
exports.deleteSystemMessage = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const result = await messageService.deleteSystemMessage(id);
    res.json(result);
});
//# sourceMappingURL=message.controller.js.map