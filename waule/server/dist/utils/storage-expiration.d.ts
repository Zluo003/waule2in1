import { UserRole } from '@prisma/client';
/**
 * 根据用户ID计算存储过期时间
 * @param userId 用户ID
 * @returns 过期时间，null表示永久保留
 */
export declare function calculateStorageExpiresAt(userId: string): Promise<Date | null>;
/**
 * 根据用户角色计算存储过期时间
 * @param userRole 用户角色
 * @returns 过期时间，null表示永久保留
 */
export declare function calculateStorageExpiresAtByRole(userRole: UserRole): Promise<Date | null>;
/**
 * 获取所有等级的存储保留天数配置（用于前端展示）
 */
export declare function getStorageRetentionConfigs(): Promise<Array<{
    userRole: UserRole;
    retentionDays: number;
    description: string;
}>>;
//# sourceMappingURL=storage-expiration.d.ts.map