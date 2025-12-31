import { prisma } from '../index';
import { MessageType, MessageTargetType, UserRole } from '@prisma/client';
import logger from '../utils/logger';

// ==================== 管理员功能 ====================

/**
 * 创建并发送系统消息
 */
export async function createAndSendMessage(params: {
  title: string;
  content: string;
  type?: MessageType;
  targetType?: MessageTargetType;
  targetRoles?: string[];
  targetUsers?: string[];
  senderId: string;
}) {
  const {
    title,
    content,
    type = 'NOTIFICATION',
    targetType = 'ALL',
    targetRoles = [],
    targetUsers = [],
    senderId,
  } = params;

  // 创建系统消息
  const systemMessage = await prisma.systemMessage.create({
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
  let users: { id: string }[] = [];

  if (targetType === 'ALL') {
    users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true },
    });
  } else if (targetType === 'ROLE') {
    users = await prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: targetRoles as UserRole[] },
      },
      select: { id: true },
    });
  } else if (targetType === 'USER') {
    users = await prisma.user.findMany({
      where: {
        isActive: true,
        id: { in: targetUsers },
      },
      select: { id: true },
    });
  }

  // 为每个用户创建消息记录
  if (users.length > 0) {
    await prisma.userMessage.createMany({
      data: users.map(user => ({
        userId: user.id,
        systemMessageId: systemMessage.id,
      })),
      skipDuplicates: true,
    });
  }

  logger.info(`[MessageService] 消息已发送: ${title}, 目标用户数: ${users.length}`);

  return {
    success: true,
    message: `消息已发送给 ${users.length} 个用户`,
    data: systemMessage,
  };
}

/**
 * 获取系统消息列表（管理员）
 */
export async function getSystemMessages(params: {
  page?: number;
  pageSize?: number;
}) {
  const { page = 1, pageSize = 20 } = params;

  const [list, total] = await Promise.all([
    prisma.systemMessage.findMany({
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
    prisma.systemMessage.count(),
  ]);

  // 获取每条消息的已读数
  const messagesWithStats = await Promise.all(
    list.map(async msg => {
      const readCount = await prisma.userMessage.count({
        where: { systemMessageId: msg.id, isRead: true },
      });
      return {
        ...msg,
        createdAt: msg.createdAt ? new Date(msg.createdAt).toISOString() : null,
        updatedAt: msg.updatedAt ? new Date(msg.updatedAt).toISOString() : null,
        recipientCount: msg._count.userMessages,
        readCount,
      };
    })
  );

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
export async function deleteSystemMessage(id: string) {
  await prisma.systemMessage.delete({
    where: { id },
  });

  return { success: true, message: '消息已删除' };
}

// ==================== 用户功能 ====================

/**
 * 获取用户消息列表
 */
export async function getUserMessages(userId: string, params: {
  page?: number;
  pageSize?: number;
}) {
  const { page = 1, pageSize = 20 } = params;

  const [list, total] = await Promise.all([
    prisma.userMessage.findMany({
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
    prisma.userMessage.count({
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
      readAt: msg.readAt ? new Date(msg.readAt).toISOString() : null,
      createdAt: msg.systemMessage.createdAt ? new Date(msg.systemMessage.createdAt).toISOString() : null,
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
export async function getUnreadCount(userId: string) {
  const count = await prisma.userMessage.count({
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
export async function markAsRead(userId: string, messageId: string) {
  await prisma.userMessage.update({
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
export async function markAllAsRead(userId: string) {
  await prisma.userMessage.updateMany({
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
export async function deleteUserMessage(userId: string, messageId: string) {
  await prisma.userMessage.update({
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
export async function clearAllMessages(userId: string) {
  await prisma.userMessage.updateMany({
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
