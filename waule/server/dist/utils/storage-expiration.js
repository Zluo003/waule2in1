"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateStorageExpiresAt = calculateStorageExpiresAt;
exports.calculateStorageExpiresAtByRole = calculateStorageExpiresAtByRole;
exports.getStorageRetentionConfigs = getStorageRetentionConfigs;
const index_1 = require("../index");
const logger_1 = __importDefault(require("./logger"));
/**
 * 根据用户ID计算存储过期时间
 * @param userId 用户ID
 * @returns 过期时间，null表示永久保留
 */
async function calculateStorageExpiresAt(userId) {
    try {
        // 获取用户角色
        const user = await index_1.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
        });
        if (!user) {
            logger_1.default.warn(`[StorageExpiration] 用户不存在: ${userId}`);
            return null; // 找不到用户时永久保留
        }
        return calculateStorageExpiresAtByRole(user.role);
    }
    catch (error) {
        logger_1.default.error(`[StorageExpiration] 计算过期时间失败: ${error.message}`);
        return null; // 出错时永久保留
    }
}
/**
 * 根据用户角色计算存储过期时间
 * @param userRole 用户角色
 * @returns 过期时间，null表示永久保留
 */
async function calculateStorageExpiresAtByRole(userRole) {
    try {
        // 获取该等级的存储保留天数配置
        const config = await index_1.prisma.userLevelConfig.findUnique({
            where: { userRole },
            select: { storageRetentionDays: true },
        });
        // 没有配置或配置为-1表示永久保留
        if (!config || config.storageRetentionDays === -1 || config.storageRetentionDays === undefined) {
            return null;
        }
        const retentionDays = config.storageRetentionDays;
        if (retentionDays <= 0) {
            return null;
        }
        // 计算过期时间
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + retentionDays);
        return expiresAt;
    }
    catch (error) {
        logger_1.default.error(`[StorageExpiration] 计算过期时间失败: ${error.message}`);
        return null; // 出错时永久保留
    }
}
/**
 * 获取所有等级的存储保留天数配置（用于前端展示）
 */
async function getStorageRetentionConfigs() {
    const configs = await index_1.prisma.userLevelConfig.findMany({
        where: { isActive: true },
        select: {
            userRole: true,
            storageRetentionDays: true,
        },
    });
    return configs.map(c => ({
        userRole: c.userRole,
        retentionDays: c.storageRetentionDays ?? -1,
        description: c.storageRetentionDays === -1 || c.storageRetentionDays === undefined
            ? '永久保留'
            : `${c.storageRetentionDays} 天`,
    }));
}
//# sourceMappingURL=storage-expiration.js.map