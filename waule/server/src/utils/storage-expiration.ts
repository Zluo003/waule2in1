import { prisma } from '../index';
import { UserRole } from '@prisma/client';
import logger from './logger';

/**
 * 根据用户ID计算存储过期时间
 * @param userId 用户ID
 * @returns 过期时间，null表示永久保留
 */
export async function calculateStorageExpiresAt(userId: string): Promise<Date | null> {
  try {
    // 获取用户角色
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      logger.warn(`[StorageExpiration] 用户不存在: ${userId}`);
      return null; // 找不到用户时永久保留
    }

    return calculateStorageExpiresAtByRole(user.role);
  } catch (error: any) {
    logger.error(`[StorageExpiration] 计算过期时间失败: ${error.message}`);
    return null; // 出错时永久保留
  }
}

/**
 * 根据用户角色计算存储过期时间
 * @param userRole 用户角色
 * @returns 过期时间，null表示永久保留
 */
export async function calculateStorageExpiresAtByRole(userRole: UserRole): Promise<Date | null> {
  try {
    // 获取该等级的存储保留天数配置
    const config = await prisma.userLevelConfig.findUnique({
      where: { userRole },
      select: { storageRetentionDays: true },
    });

    // 没有配置或配置为-1表示永久保留
    if (!config || (config as any).storageRetentionDays === -1 || (config as any).storageRetentionDays === undefined) {
      return null;
    }

    const retentionDays = (config as any).storageRetentionDays;
    if (retentionDays <= 0) {
      return null;
    }

    // 计算过期时间
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + retentionDays);
    
    return expiresAt;
  } catch (error: any) {
    logger.error(`[StorageExpiration] 计算过期时间失败: ${error.message}`);
    return null; // 出错时永久保留
  }
}

/**
 * 获取所有等级的存储保留天数配置（用于前端展示）
 */
export async function getStorageRetentionConfigs(): Promise<Array<{
  userRole: UserRole;
  retentionDays: number;
  description: string;
}>> {
  const configs = await prisma.userLevelConfig.findMany({
    where: { isActive: true },
    select: {
      userRole: true,
      storageRetentionDays: true,
    },
  });

  return configs.map(c => ({
    userRole: c.userRole,
    retentionDays: (c as any).storageRetentionDays ?? -1,
    description: (c as any).storageRetentionDays === -1 || (c as any).storageRetentionDays === undefined
      ? '永久保留'
      : `${(c as any).storageRetentionDays} 天`,
  }));
}
