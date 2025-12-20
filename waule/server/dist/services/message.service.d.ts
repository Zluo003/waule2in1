import { MessageType, MessageTargetType } from '@prisma/client';
/**
 * 创建并发送系统消息
 */
export declare function createAndSendMessage(params: {
    title: string;
    content: string;
    type?: MessageType;
    targetType?: MessageTargetType;
    targetRoles?: string[];
    targetUsers?: string[];
    senderId: string;
}): Promise<{
    success: boolean;
    message: string;
    data: {
        type: import(".prisma/client").$Enums.MessageType;
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        content: string;
        targetType: import(".prisma/client").$Enums.MessageTargetType;
        targetRoles: string[];
        targetUsers: string[];
        senderId: string;
    };
}>;
/**
 * 获取系统消息列表（管理员）
 */
export declare function getSystemMessages(params: {
    page?: number;
    pageSize?: number;
}): Promise<{
    list: {
        recipientCount: number;
        readCount: number;
        _count: {
            userMessages: number;
        };
        sender: {
            id: string;
            username: string | null;
            nickname: string | null;
        };
        type: import(".prisma/client").$Enums.MessageType;
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        content: string;
        targetType: import(".prisma/client").$Enums.MessageTargetType;
        targetRoles: string[];
        targetUsers: string[];
        senderId: string;
    }[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}>;
/**
 * 删除系统消息（管理员）
 */
export declare function deleteSystemMessage(id: string): Promise<{
    success: boolean;
    message: string;
}>;
/**
 * 获取用户消息列表
 */
export declare function getUserMessages(userId: string, params: {
    page?: number;
    pageSize?: number;
}): Promise<{
    list: {
        id: string;
        title: string;
        content: string;
        type: import(".prisma/client").$Enums.MessageType;
        isRead: boolean;
        readAt: Date | null;
        createdAt: Date;
    }[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}>;
/**
 * 获取未读消息数量
 */
export declare function getUnreadCount(userId: string): Promise<{
    count: number;
}>;
/**
 * 标记消息为已读
 */
export declare function markAsRead(userId: string, messageId: string): Promise<{
    success: boolean;
}>;
/**
 * 标记所有消息为已读
 */
export declare function markAllAsRead(userId: string): Promise<{
    success: boolean;
    message: string;
}>;
/**
 * 删除消息（软删除）
 */
export declare function deleteUserMessage(userId: string, messageId: string): Promise<{
    success: boolean;
    message: string;
}>;
/**
 * 清空所有消息（软删除）
 */
export declare function clearAllMessages(userId: string): Promise<{
    success: boolean;
    message: string;
}>;
//# sourceMappingURL=message.service.d.ts.map