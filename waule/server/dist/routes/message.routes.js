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
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const messageController = __importStar(require("../controllers/message.controller"));
const router = (0, express_1.Router)();
// ==================== 用户端 API ====================
// 获取消息列表
router.get('/', auth_1.authenticateToken, messageController.getMessages);
// 获取未读消息数量
router.get('/unread-count', auth_1.authenticateToken, messageController.getUnreadCount);
// 标记消息为已读
router.put('/:id/read', auth_1.authenticateToken, messageController.markAsRead);
// 标记所有消息为已读
router.put('/read-all', auth_1.authenticateToken, messageController.markAllAsRead);
// 删除消息
router.delete('/:id', auth_1.authenticateToken, messageController.deleteMessage);
// 清空所有消息
router.delete('/', auth_1.authenticateToken, messageController.clearAllMessages);
// ==================== 管理员 API ====================
// 发送消息
router.post('/admin/send', auth_1.authenticateToken, (0, auth_1.authorizeRoles)('ADMIN'), messageController.sendMessage);
// 获取系统消息列表
router.get('/admin/list', auth_1.authenticateToken, (0, auth_1.authorizeRoles)('ADMIN'), messageController.getSystemMessages);
// 删除系统消息
router.delete('/admin/:id', auth_1.authenticateToken, (0, auth_1.authorizeRoles)('ADMIN'), messageController.deleteSystemMessage);
exports.default = router;
//# sourceMappingURL=message.routes.js.map