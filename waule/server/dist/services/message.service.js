"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAndSendMessage = createAndSendMessage;
exports.getSystemMessages = getSystemMessages;
exports.deleteSystemMessage = deleteSystemMessage;
exports.getUserMessages = getUserMessages;
exports.getUnreadCount = getUnreadCount;
exports.markAsRead = markAsRead;
exports.markAllAsRead = markAllAsRead;
exports.deleteUserMessage = deleteUserMessage;
exports.clearAllMessages = clearAllMessages;
const index_1 = require("../index");
const logger_1 = __importDefault(require("../utils/logger"));
// ==================== 管理员功能 ====================
/**
 * 创建并发送系统消息
 */
async function createAndSendMessage(params) {
    const { title, content, type = 'NOTIFICATION', targetType = 'ALL', targetRoles = [], targetUsers = [], senderId, } = params;
    // 创建系统消息
    const systemMessage = await index_1.prisma.systemMessage.create({
        data: {
            title,
            content,
            type,
            targetType,
            targetRoles,
            targetUsers,
            senderId,
        },
    });
    // 获取目标用户列表
    let users = [];
    if (targetType === 'ALL') {
        users = await index_1.prisma.user.findMany({
            where: { isActive: true },
            select: { id: true },
        });
    }
    else if (targetType === 'ROLE') {
        users = await index_1.prisma.user.findMany({
            where: {
                isActive: true,
                role: { in: targetRoles },
            },
            select: { id: true },
        });
    }
    else if (targetType === 'USER') {
        users = await index_1.prisma.user.findMany({
            where: {
                isActive: true,
                id: { in: targetUsers },
            },
            select: { id: true },
        });
    }
    // 为每个用户创建消息记录
    if (users.length > 0) {
        await index_1.prisma.userMessage.createMany({
            data: users.map(user => ({
                userId: user.id,
                systemMessageId: systemMessage.id,
            })),
            skipDuplicates: true,
        });
    }
    logger_1.default.info(`[MessageService] 消息已发送: ${title}, 目标用户数: ${users.length}`);
    return {
        success: true,
        message: `消息已发送给 ${users.length} 个用户`,
        data: systemMessage,
    };
}
/**
 * 获取系统消息列表（管理员）
 */
async function getSystemMessages(params) {
    const { page = 1, pageSize = 20 } = params;
    const [list, total] = await Promise.all([
        index_1.prisma.systemMessage.findMany({
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: {
                sender: {
                    select: { id: true, nickname: true, username: true },
                },
                _count: {
                    select: { userMessages: true },
                },
            },
        }),
        index_1.prisma.systemMessage.count(),
    ]);
    // 获取每条消息的已读数
    const messagesWithStats = await Promise.all(list.map(async (msg) => {
        const readCount = await index_1.prisma.userMessage.count({
            where: { systemMessageId: msg.id, isRead: true },
        });
        return {
            ...msg,
            recipientCount: msg._count.userMessages,
            readCount,
        };
    }));
    return {
        list: messagesWithStats,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
    };
}
/**
 * 删除系统消息（管理员）
 */
async function deleteSystemMessage(id) {
    await index_1.prisma.systemMessage.delete({
        where: { id },
    });
    return { success: true, message: '消息已删除' };
}
// ==================== 用户功能 ====================
/**
 * 获取用户消息列表
 */
async function getUserMessages(userId, params) {
    const { page = 1, pageSize = 20 } = params;
    const [list, total] = await Promise.all([
        index_1.prisma.userMessage.findMany({
            where: {
                userId,
                isDeleted: false,
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: {
                systemMessage: {
                    select: {
                        id: true,
                        title: true,
                        content: true,
                        type: true,
                        createdAt: true,
                    },
                },
            },
        }),
        index_1.prisma.userMessage.count({
            where: { userId, isDeleted: false },
        }),
    ]);
    return {
        list: list.map(msg => ({
            id: msg.id,
            title: msg.systemMessage.title,
            content: msg.systemMessage.content,
            type: msg.systemMessage.type,
            isRead: msg.isRead,
            readAt: msg.readAt,
            createdAt: msg.systemMessage.createdAt,
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
    };
}
/**
 * 获取未读消息数量
 */
async function getUnreadCount(userId) {
    const count = await index_1.prisma.userMessage.count({
        where: {
            userId,
            isDeleted: false,
            isRead: false,
        },
    });
    return { count };
}
/**
 * 标记消息为已读
 */
async function markAsRead(userId, messageId) {
    await index_1.prisma.userMessage.update({
        where: {
            id: messageId,
            userId,
        },
        data: {
            isRead: true,
            readAt: new Date(),
        },
    });
    return { success: true };
}
/**
 * 标记所有消息为已读
 */
async function markAllAsRead(userId) {
    await index_1.prisma.userMessage.updateMany({
        where: {
            userId,
            isDeleted: false,
            isRead: false,
        },
        data: {
            isRead: true,
            readAt: new Date(),
        },
    });
    return { success: true, message: '已全部标记为已读' };
}
/**
 * 删除消息（软删除）
 */
async function deleteUserMessage(userId, messageId) {
    await index_1.prisma.userMessage.update({
        where: {
            id: messageId,
            userId,
        },
        data: {
            isDeleted: true,
            deletedAt: new Date(),
        },
    });
    return { success: true, message: '消息已删除' };
}
/**
 * 清空所有消息（软删除）
 */
async function clearAllMessages(userId) {
    await index_1.prisma.userMessage.updateMany({
        where: {
            userId,
            isDeleted: false,
        },
        data: {
            isDeleted: true,
            deletedAt: new Date(),
        },
    });
    return { success: true, message: '已清空所有消息' };
}
//# sourceMappingURL=message.service.js.map