"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRoleImageUrls = getRoleImageUrls;
exports.convertRolesToSubjects = convertRolesToSubjects;
exports.getSubjectsFromRoleIds = getSubjectsFromRoleIds;
const logger_1 = require("./logger");
const index_1 = require("../index");
/**
 * 从角色资产获取图片URL列表
 * @param roleMetadata 角色元数据
 * @param userId 用户ID
 * @returns 图片URL数组（最多3张，按优先级：face > front > side）
 */
async function getRoleImageUrls(roleMetadata, userId) {
    const { images } = roleMetadata;
    const imageUrls = [];
    // 按优先级顺序获取图片：face > front > side
    const assetIds = [
        images.faceAssetId,
        images.frontAssetId,
        images.sideAssetId,
    ].filter(Boolean);
    // 最多取3张图片
    const selectedIds = assetIds.slice(0, 3);
    try {
        // 批量查询图片资产
        const assets = await index_1.prisma.asset.findMany({
            where: {
                id: { in: selectedIds },
                userId,
            },
            select: {
                id: true,
                url: true,
            },
        });
        // 按原始顺序排列图片URL
        for (const assetId of selectedIds) {
            const asset = assets.find(a => a.id === assetId);
            if (asset && asset.url) {
                imageUrls.push(asset.url);
            }
        }
        logger_1.logger.info(`[RoleHelpers] 角色 "${roleMetadata.name}" 获取到 ${imageUrls.length} 张图片`);
    }
    catch (error) {
        logger_1.logger.error(`[RoleHelpers] 获取角色图片失败:`, error.message);
    }
    return imageUrls;
}
/**
 * 将角色资产转换为 Vidu Subjects 格式
 * @param roles 角色资产数组
 * @param userId 用户ID
 * @returns Vidu Subjects 数组
 */
async function convertRolesToSubjects(roles, userId) {
    const subjects = [];
    for (const role of roles) {
        try {
            const metadata = role.metadata;
            // 验证角色类型
            if (!metadata || metadata.kind !== 'ROLE') {
                logger_1.logger.warn(`[RoleHelpers] 跳过非角色资产: ${role.id}`);
                continue;
            }
            // 获取图片URLs
            const imageUrls = await getRoleImageUrls(metadata, userId);
            if (imageUrls.length === 0) {
                logger_1.logger.warn(`[RoleHelpers] 角色 "${metadata.name}" 没有可用图片`);
                continue;
            }
            // 构建 subject
            const subject = {
                id: metadata.name, // 使用角色名称作为ID
                images: imageUrls,
                // voice_id 暂时留空，让系统自动推荐
            };
            subjects.push(subject);
            logger_1.logger.info(`[RoleHelpers] 角色 "${metadata.name}" 转换为 subject，包含 ${imageUrls.length} 张图片`);
        }
        catch (error) {
            logger_1.logger.error(`[RoleHelpers] 转换角色失败:`, error.message);
        }
    }
    return subjects;
}
/**
 * 从角色ID数组获取 Vidu Subjects
 * @param roleIds 角色资产ID数组
 * @param userId 用户ID
 * @returns Vidu Subjects 数组
 */
async function getSubjectsFromRoleIds(roleIds, userId) {
    try {
        // 查询角色资产
        const roles = await index_1.prisma.asset.findMany({
            where: {
                id: { in: roleIds },
                userId,
                type: 'DOCUMENT',
            },
            select: {
                id: true,
                name: true,
                metadata: true,
            },
        });
        // 过滤出真正的角色资产
        const validRoles = roles.filter(role => {
            const meta = role.metadata;
            return meta && meta.kind === 'ROLE';
        });
        if (validRoles.length === 0) {
            logger_1.logger.warn(`[RoleHelpers] 未找到有效的角色资产`);
            return [];
        }
        logger_1.logger.info(`[RoleHelpers] 找到 ${validRoles.length} 个有效角色`);
        // 转换为 subjects
        return await convertRolesToSubjects(validRoles, userId);
    }
    catch (error) {
        logger_1.logger.error(`[RoleHelpers] 获取 subjects 失败:`, error.message);
        return [];
    }
}
//# sourceMappingURL=role-helpers.js.map