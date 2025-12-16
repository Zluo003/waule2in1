"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserMembership = exports.getGiftCreditsStatus = exports.grantGiftCredits = exports.getUserUsageStats = exports.setModelPermissionsForAllLevels = exports.getModelPermissionsSummary = exports.deleteModelPermission = exports.batchUpdateModelPermissions = exports.updateModelPermission = exports.getAllModelPermissions = exports.batchUpdateLevelConfigs = exports.updateLevelConfig = exports.getAllLevelConfigs = void 0;
const index_1 = require("../index");
const errorHandler_1 = require("../middleware/errorHandler");
const user_level_service_1 = require("../services/user-level.service");
/**
 * 获取所有用户等级配置
 */
exports.getAllLevelConfigs = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const configs = await user_level_service_1.userLevelService.getAllLevelConfigs();
    // 确保所有等级都有配置（如果没有则返回默认值）
    const allRoles = ['USER', 'VIP', 'SVIP'];
    const configMap = new Map(configs.map(c => [c.userRole, c]));
    const result = allRoles.map(role => {
        const config = configMap.get(role);
        if (config)
            return config;
        // 返回默认配置
        return {
            id: null,
            userRole: role,
            dailyGiftCredits: 0,
            giftDays: 0,
            giftDescription: null,
            maxConcurrency: 1,
            isActive: true,
            createdAt: null,
            updatedAt: null,
        };
    });
    res.json({
        success: true,
        data: result,
    });
});
/**
 * 更新用户等级配置
 */
exports.updateLevelConfig = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { userRole, dailyGiftCredits, giftDays, giftDescription, maxConcurrency, isActive } = req.body;
    if (!userRole || !['USER', 'VIP', 'SVIP'].includes(userRole)) {
        throw new errorHandler_1.AppError('无效的用户等级', 400);
    }
    const config = await user_level_service_1.userLevelService.upsertLevelConfig({
        userRole,
        dailyGiftCredits,
        giftDays,
        giftDescription,
        maxConcurrency,
        isActive,
    });
    res.json({
        success: true,
        message: '等级配置更新成功',
        data: config,
    });
});
/**
 * 批量更新用户等级配置
 */
exports.batchUpdateLevelConfigs = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { configs } = req.body;
    if (!Array.isArray(configs)) {
        throw new errorHandler_1.AppError('配置必须是数组格式', 400);
    }
    const results = [];
    for (const config of configs) {
        if (!config.userRole || !['USER', 'VIP', 'SVIP'].includes(config.userRole)) {
            continue;
        }
        const result = await user_level_service_1.userLevelService.upsertLevelConfig({
            userRole: config.userRole,
            dailyGiftCredits: config.dailyGiftCredits,
            giftDays: config.giftDays,
            giftDescription: config.giftDescription,
            maxConcurrency: config.maxConcurrency,
            isActive: config.isActive,
        });
        results.push(result);
    }
    res.json({
        success: true,
        message: '等级配置批量更新成功',
        data: results,
    });
});
/**
 * 获取所有模型权限配置
 */
exports.getAllModelPermissions = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { aiModelId, nodeType, moduleType } = req.query;
    let permissions;
    if (aiModelId || nodeType || moduleType) {
        // 获取特定模型/节点/模块的权限配置
        permissions = await user_level_service_1.userLevelService.getModelPermissions({
            aiModelId: aiModelId,
            nodeType: nodeType,
            moduleType: moduleType,
        });
    }
    else {
        // 获取所有权限配置
        permissions = await user_level_service_1.userLevelService.getAllModelPermissions();
    }
    res.json({
        success: true,
        data: permissions,
    });
});
/**
 * 更新模型权限配置
 */
exports.updateModelPermission = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { aiModelId, nodeType, moduleType, userRole, isAllowed, dailyLimit, isFreeForMember, freeDailyLimit, isActive, } = req.body;
    if (!userRole || !['USER', 'VIP', 'SVIP'].includes(userRole)) {
        throw new errorHandler_1.AppError('无效的用户等级', 400);
    }
    if (!aiModelId && !nodeType && !moduleType) {
        throw new errorHandler_1.AppError('必须指定 aiModelId、nodeType 或 moduleType 之一', 400);
    }
    const results = await user_level_service_1.userLevelService.upsertModelPermissions([{
            aiModelId,
            nodeType,
            moduleType,
            userRole,
            isAllowed,
            dailyLimit,
            isFreeForMember,
            freeDailyLimit,
            isActive,
        }]);
    res.json({
        success: true,
        message: '模型权限配置更新成功',
        data: results[0],
    });
});
/**
 * 批量更新模型权限配置
 */
exports.batchUpdateModelPermissions = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
        throw new errorHandler_1.AppError('权限配置必须是数组格式', 400);
    }
    // 验证每个权限配置
    for (const perm of permissions) {
        if (!perm.userRole || !['USER', 'VIP', 'SVIP'].includes(perm.userRole)) {
            throw new errorHandler_1.AppError('无效的用户等级', 400);
        }
        if (!perm.aiModelId && !perm.nodeType && !perm.moduleType) {
            throw new errorHandler_1.AppError('必须指定 aiModelId、nodeType 或 moduleType 之一', 400);
        }
    }
    const results = await user_level_service_1.userLevelService.upsertModelPermissions(permissions);
    res.json({
        success: true,
        message: '模型权限配置批量更新成功',
        data: results,
    });
});
/**
 * 删除模型权限配置
 */
exports.deleteModelPermission = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    await user_level_service_1.userLevelService.deleteModelPermission(id);
    res.json({
        success: true,
        message: '模型权限配置删除成功',
    });
});
/**
 * 获取模型权限配置摘要（按模型分组）
 */
exports.getModelPermissionsSummary = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    // 获取所有AI模型
    const models = await index_1.prisma.aIModel.findMany({
        where: { isActive: true },
        select: {
            id: true,
            name: true,
            provider: true,
            modelId: true,
            type: true,
            permissions: {
                where: { isActive: true },
                orderBy: { userRole: 'asc' },
            },
        },
        orderBy: [
            { type: 'asc' },
            { provider: 'asc' },
            { name: 'asc' },
        ],
    });
    // 获取节点类型权限
    const nodeTypePermissions = await index_1.prisma.modelPermission.findMany({
        where: {
            nodeType: { not: null },
            isActive: true,
        },
        orderBy: [
            { nodeType: 'asc' },
            { userRole: 'asc' },
        ],
    });
    // 按节点类型分组
    const nodeTypeMap = new Map();
    for (const perm of nodeTypePermissions) {
        if (perm.nodeType) {
            const perms = nodeTypeMap.get(perm.nodeType) || [];
            perms.push(perm);
            nodeTypeMap.set(perm.nodeType, perms);
        }
    }
    const nodeTypes = Array.from(nodeTypeMap.entries()).map(([nodeType, permissions]) => ({
        nodeType,
        permissions,
    }));
    // 获取模块类型权限
    const moduleTypePermissions = await index_1.prisma.modelPermission.findMany({
        where: {
            moduleType: { not: null },
            isActive: true,
        },
        orderBy: [
            { moduleType: 'asc' },
            { userRole: 'asc' },
        ],
    });
    // 按模块类型分组
    const moduleTypeMap = new Map();
    for (const perm of moduleTypePermissions) {
        if (perm.moduleType) {
            const perms = moduleTypeMap.get(perm.moduleType) || [];
            perms.push(perm);
            moduleTypeMap.set(perm.moduleType, perms);
        }
    }
    const moduleTypes = Array.from(moduleTypeMap.entries()).map(([moduleType, permissions]) => ({
        moduleType,
        permissions,
    }));
    res.json({
        success: true,
        data: {
            models,
            nodeTypes,
            moduleTypes,
        },
    });
});
/**
 * 快速为模型设置所有等级权限
 */
exports.setModelPermissionsForAllLevels = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { aiModelId, nodeType, moduleType, permissions } = req.body;
    if (!aiModelId && !nodeType && !moduleType) {
        throw new errorHandler_1.AppError('必须指定 aiModelId、nodeType 或 moduleType 之一', 400);
    }
    if (!permissions || typeof permissions !== 'object') {
        throw new errorHandler_1.AppError('permissions 必须是对象格式', 400);
    }
    const allRoles = ['USER', 'VIP', 'SVIP'];
    const permissionsToCreate = allRoles.map(role => ({
        aiModelId,
        nodeType,
        moduleType,
        userRole: role,
        isAllowed: permissions[role]?.isAllowed ?? true,
        dailyLimit: permissions[role]?.dailyLimit ?? -1,
        isFreeForMember: permissions[role]?.isFreeForMember ?? false,
        freeDailyLimit: permissions[role]?.freeDailyLimit ?? 0,
        isActive: true,
    }));
    const results = await user_level_service_1.userLevelService.upsertModelPermissions(permissionsToCreate);
    res.json({
        success: true,
        message: '模型权限配置设置成功',
        data: results,
    });
});
/**
 * 获取用户使用统计
 */
exports.getUserUsageStats = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { userId, date } = req.query;
    if (!userId) {
        throw new errorHandler_1.AppError('userId 必填', 400);
    }
    let targetDate;
    if (date) {
        targetDate = new Date(date);
    }
    const stats = await user_level_service_1.userLevelService.getUserDailyUsageStats(userId, targetDate);
    res.json({
        success: true,
        data: stats,
    });
});
/**
 * 手动赠送用户积分
 */
exports.grantGiftCredits = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { userId } = req.body;
    if (!userId) {
        throw new errorHandler_1.AppError('userId 必填', 400);
    }
    const result = await user_level_service_1.userLevelService.processGiftCredits(userId);
    res.json({
        success: true,
        data: result,
    });
});
/**
 * 获取用户赠送积分状态
 */
exports.getGiftCreditsStatus = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { userId } = req.query;
    if (!userId) {
        throw new errorHandler_1.AppError('userId 必填', 400);
    }
    const status = await user_level_service_1.userLevelService.getGiftCreditsStatus(userId);
    res.json({
        success: true,
        data: status,
    });
});
/**
 * 更新用户会员信息
 */
exports.updateUserMembership = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { role, membershipExpireAt, giftStartDate } = req.body;
    const updateData = {};
    if (role && ['USER', 'VIP', 'SVIP', 'ADMIN', 'INTERNAL'].includes(role)) {
        updateData.role = role;
    }
    if (membershipExpireAt !== undefined) {
        updateData.membershipExpireAt = membershipExpireAt ? new Date(membershipExpireAt) : null;
    }
    if (giftStartDate !== undefined) {
        updateData.giftStartDate = giftStartDate ? new Date(giftStartDate) : null;
    }
    const user = await index_1.prisma.user.update({
        where: { id },
        data: updateData,
        select: {
            id: true,
            nickname: true,
            role: true,
            membershipExpireAt: true,
            giftStartDate: true,
        },
    });
    res.json({
        success: true,
        message: '用户会员信息更新成功',
        data: user,
    });
});
//# sourceMappingURL=user-level.controller.js.map