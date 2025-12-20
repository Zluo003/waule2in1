import { Request, Response } from 'express';
import { prisma } from '../index';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { userLevelService } from '../services/user-level.service';
import { UserRole } from '@prisma/client';

/**
 * 获取所有用户等级配置
 */
export const getAllLevelConfigs = asyncHandler(async (req: Request, res: Response) => {
  const configs = await userLevelService.getAllLevelConfigs();

  // 确保所有等级都有配置（如果没有则返回默认值）
  const allRoles: UserRole[] = ['USER', 'VIP', 'SVIP'];
  const configMap = new Map(configs.map(c => [c.userRole, c]));

  const result = allRoles.map(role => {
    const config = configMap.get(role);
    if (config) return config;

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
export const updateLevelConfig = asyncHandler(async (req: Request, res: Response) => {
  const { userRole, dailyGiftCredits, giftDays, giftDescription, maxConcurrency, storageRetentionDays, isActive } = req.body;

  if (!userRole || !['USER', 'VIP', 'SVIP'].includes(userRole)) {
    throw new AppError('无效的用户等级', 400);
  }

  const config = await userLevelService.upsertLevelConfig({
    userRole,
    dailyGiftCredits,
    giftDays,
    giftDescription,
    maxConcurrency,
    storageRetentionDays,
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
export const batchUpdateLevelConfigs = asyncHandler(async (req: Request, res: Response) => {
  const { configs } = req.body;

  if (!Array.isArray(configs)) {
    throw new AppError('配置必须是数组格式', 400);
  }

  const results = [];
  for (const config of configs) {
    if (!config.userRole || !['USER', 'VIP', 'SVIP'].includes(config.userRole)) {
      continue;
    }

    const result = await userLevelService.upsertLevelConfig({
      userRole: config.userRole,
      dailyGiftCredits: config.dailyGiftCredits,
      giftDays: config.giftDays,
      giftDescription: config.giftDescription,
      maxConcurrency: config.maxConcurrency,
      storageRetentionDays: config.storageRetentionDays,
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
export const getAllModelPermissions = asyncHandler(async (req: Request, res: Response) => {
  const { aiModelId, nodeType, moduleType } = req.query;

  let permissions;

  if (aiModelId || nodeType || moduleType) {
    // 获取特定模型/节点/模块的权限配置
    permissions = await userLevelService.getModelPermissions({
      aiModelId: aiModelId as string,
      nodeType: nodeType as string,
      moduleType: moduleType as string,
    });
  } else {
    // 获取所有权限配置
    permissions = await userLevelService.getAllModelPermissions();
  }

  res.json({
    success: true,
    data: permissions,
  });
});

/**
 * 更新模型权限配置
 */
export const updateModelPermission = asyncHandler(async (req: Request, res: Response) => {
  const { 
    aiModelId, 
    nodeType, 
    moduleType, 
    userRole, 
    isAllowed, 
    dailyLimit, 
    isFreeForMember, 
    freeDailyLimit,
    isActive,
  } = req.body;

  if (!userRole || !['USER', 'VIP', 'SVIP'].includes(userRole)) {
    throw new AppError('无效的用户等级', 400);
  }

  if (!aiModelId && !nodeType && !moduleType) {
    throw new AppError('必须指定 aiModelId、nodeType 或 moduleType 之一', 400);
  }

  const results = await userLevelService.upsertModelPermissions([{
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
export const batchUpdateModelPermissions = asyncHandler(async (req: Request, res: Response) => {
  const { permissions } = req.body;

  if (!Array.isArray(permissions)) {
    throw new AppError('权限配置必须是数组格式', 400);
  }

  // 验证每个权限配置
  for (const perm of permissions) {
    if (!perm.userRole || !['USER', 'VIP', 'SVIP'].includes(perm.userRole)) {
      throw new AppError('无效的用户等级', 400);
    }
    if (!perm.aiModelId && !perm.nodeType && !perm.moduleType) {
      throw new AppError('必须指定 aiModelId、nodeType 或 moduleType 之一', 400);
    }
  }

  const results = await userLevelService.upsertModelPermissions(permissions);

  res.json({
    success: true,
    message: '模型权限配置批量更新成功',
    data: results,
  });
});

/**
 * 删除模型权限配置
 */
export const deleteModelPermission = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  await userLevelService.deleteModelPermission(id);

  res.json({
    success: true,
    message: '模型权限配置删除成功',
  });
});

/**
 * 获取模型权限配置摘要（按模型分组）
 */
export const getModelPermissionsSummary = asyncHandler(async (req: Request, res: Response) => {
  // 获取所有AI模型
  const models = await prisma.aIModel.findMany({
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
  const nodeTypePermissions = await prisma.modelPermission.findMany({
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
  const nodeTypeMap = new Map<string, any[]>();
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
  const moduleTypePermissions = await prisma.modelPermission.findMany({
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
  const moduleTypeMap = new Map<string, any[]>();
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
export const setModelPermissionsForAllLevels = asyncHandler(async (req: Request, res: Response) => {
  const { aiModelId, nodeType, moduleType, permissions } = req.body;

  if (!aiModelId && !nodeType && !moduleType) {
    throw new AppError('必须指定 aiModelId、nodeType 或 moduleType 之一', 400);
  }

  if (!permissions || typeof permissions !== 'object') {
    throw new AppError('permissions 必须是对象格式', 400);
  }

  const allRoles: UserRole[] = ['USER', 'VIP', 'SVIP'];
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

  const results = await userLevelService.upsertModelPermissions(permissionsToCreate);

  res.json({
    success: true,
    message: '模型权限配置设置成功',
    data: results,
  });
});

/**
 * 获取用户使用统计
 */
export const getUserUsageStats = asyncHandler(async (req: Request, res: Response) => {
  const { userId, date } = req.query;

  if (!userId) {
    throw new AppError('userId 必填', 400);
  }

  let targetDate: Date | undefined;
  if (date) {
    targetDate = new Date(date as string);
  }

  const stats = await userLevelService.getUserDailyUsageStats(userId as string, targetDate);

  res.json({
    success: true,
    data: stats,
  });
});

/**
 * 手动赠送用户积分
 */
export const grantGiftCredits = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.body;

  if (!userId) {
    throw new AppError('userId 必填', 400);
  }

  const result = await userLevelService.processGiftCredits(userId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * 获取用户赠送积分状态
 */
export const getGiftCreditsStatus = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.query;

  if (!userId) {
    throw new AppError('userId 必填', 400);
  }

  const status = await userLevelService.getGiftCreditsStatus(userId as string);

  res.json({
    success: true,
    data: status,
  });
});

/**
 * 更新用户会员信息
 */
export const updateUserMembership = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { role, membershipExpireAt, giftStartDate } = req.body;

  const updateData: any = {};

  if (role && ['USER', 'VIP', 'SVIP', 'ADMIN', 'INTERNAL'].includes(role)) {
    updateData.role = role;
  }

  if (membershipExpireAt !== undefined) {
    updateData.membershipExpireAt = membershipExpireAt ? new Date(membershipExpireAt) : null;
  }

  if (giftStartDate !== undefined) {
    updateData.giftStartDate = giftStartDate ? new Date(giftStartDate) : null;
  }

  const user = await prisma.user.update({
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

/**
 * 预览存储清理（不实际删除）
 */
export const previewStorageCleanup = asyncHandler(async (req: Request, res: Response) => {
  const { previewStorageCleanup: preview } = await import('../services/storage-cleanup.service');
  const result = await preview();
  
  res.json({
    success: true,
    data: result,
  });
});

/**
 * 手动执行存储清理
 */
export const runStorageCleanup = asyncHandler(async (req: Request, res: Response) => {
  const { runStorageCleanup: cleanup } = await import('../services/storage-cleanup.service');
  const result = await cleanup();
  
  res.json({
    success: true,
    message: `清理完成: 删除 ${result.totalDeleted} 个文件, 失败 ${result.totalFailed} 个`,
    data: result,
  });
});
