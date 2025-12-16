import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';
import { Prisma } from '@prisma/client';
import { asyncHandler } from '../middleware/errorHandler';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = '7d';

/**
 * 生成租户用户 JWT Token
 */
function generateToken(userId: string, tenantId: string): string {
  return jwt.sign(
    { userId, tenantId, type: 'tenant_user' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * 租户用户登录
 * 从请求头 X-Tenant-ID 获取租户ID（客户端激活后自动携带）
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { username, password } = req.body;
  const tenantId = req.headers['x-tenant-id'] as string;

  // 检查租户ID
  if (!tenantId) {
    return res.status(400).json({ success: false, message: '客户端未激活，请先激活' });
  }

  // 查找租户
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    return res.status(401).json({ success: false, message: '企业账号无效' });
  }

  if (!tenant.isActive) {
    return res.status(401).json({ success: false, message: '企业账号已被禁用' });
  }

  // 查找用户
  const user = await prisma.tenantUser.findUnique({
    where: {
      tenantId_username: {
        tenantId: tenant.id,
        username,
      },
    },
  });

  if (!user) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }

  if (!user.isActive) {
    return res.status(401).json({ success: false, message: '账号已被禁用' });
  }

  // 验证密码
  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }

  // 生成 token
  const token = generateToken(user.id, tenant.id);

  // 更新最后登录时间和当前 token（实现单点登录）
  await prisma.tenantUser.update({
    where: { id: user.id },
    data: { 
      lastLoginAt: new Date(),
      currentToken: token,  // 存储当前 token，之前的登录将失效
    },
  });

  res.json({
    success: true,
    message: '登录成功',
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        isAdmin: user.isAdmin,
        tenant: {
          id: tenant.id,
          name: tenant.name,
          credits: tenant.credits,
          // 仅管理员可见 API Key
          ...(user.isAdmin && { apiKey: tenant.apiKey }),
        },
      },
    },
  });
});

/**
 * 获取当前用户信息
 */
export const getCurrentUser = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;

  res.json({
    success: true,
    data: {
      user: {
        id: tenantUser.id,
        username: tenantUser.username,
        nickname: tenantUser.nickname,
        isAdmin: tenantUser.isAdmin,
        tenant: {
          id: tenantUser.tenant.id,
          name: tenantUser.tenant.name,
          credits: tenantUser.tenant.credits,
          // 仅管理员可见 API Key
          ...(tenantUser.isAdmin && { apiKey: tenantUser.tenant.apiKey }),
        },
      },
    },
  });
});

/**
 * 退出登录
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  // JWT 无状态，前端清除 token 即可
  res.json({ success: true, message: '已退出登录' });
});

/**
 * 修改密码
 */
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { oldPassword, newPassword } = req.body;
  const tenantUser = req.tenantUser!;

  // 获取用户完整信息（包含密码）
  const user = await prisma.tenantUser.findUnique({
    where: { id: tenantUser.id },
  });

  if (!user) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }

  // 验证旧密码
  const isValidPassword = await bcrypt.compare(oldPassword, user.password);
  if (!isValidPassword) {
    return res.status(400).json({ success: false, message: '原密码错误' });
  }

  // 更新密码
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.tenantUser.update({
    where: { id: tenantUser.id },
    data: { password: hashedPassword },
  });

  res.json({ success: true, message: '密码修改成功' });
});

/**
 * 更新用户资料
 */
export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const { nickname, avatar } = req.body;
  const tenantUser = req.tenantUser!;

  const updatedUser = await prisma.tenantUser.update({
    where: { id: tenantUser.id },
    data: { nickname, avatar },
    select: {
      id: true,
      username: true,
      nickname: true,
      avatar: true,
    },
  });

  res.json({ success: true, message: '资料更新成功', data: updatedUser });
});

// ==================== 租户管理员功能 ====================

/**
 * [管理员] 获取用户列表
 */
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { page = '1', limit = '20', search } = req.query;
  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);
  const skip = (pageNum - 1) * limitNum;

  const where: any = { tenantId: tenantUser.tenantId };
  if (search) {
    where.OR = [
      { username: { contains: search as string, mode: 'insensitive' } },
      { nickname: { contains: search as string, mode: 'insensitive' } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.tenantUser.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatar: true,
        isAdmin: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
    }),
    prisma.tenantUser.count({ where }),
  ]);

  res.json({
    success: true,
    data: users,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * [管理员] 创建用户
 * 用户名和昵称在租户内必须唯一
 */
export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const tenantUser = req.tenantUser!;
  const { username, password, nickname, isAdmin = false } = req.body;

  // 检查用户名是否已存在
  const existingUsername = await prisma.tenantUser.findUnique({
    where: {
      tenantId_username: {
        tenantId: tenantUser.tenantId,
        username,
      },
    },
  });

  if (existingUsername) {
    return res.status(400).json({ success: false, message: '用户名已存在' });
  }

  // 检查昵称是否已存在（昵称默认为用户名）
  const finalNickname = nickname || username;
  const existingNickname = await prisma.tenantUser.findFirst({
    where: {
      tenantId: tenantUser.tenantId,
      nickname: finalNickname,
    },
  });

  if (existingNickname) {
    return res.status(400).json({ success: false, message: '昵称已被使用' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = await prisma.tenantUser.create({
    data: {
      tenantId: tenantUser.tenantId,
      username,
      password: hashedPassword,
      nickname: finalNickname,
      isAdmin,
    },
    select: {
      id: true,
      username: true,
      nickname: true,
      isAdmin: true,
      isActive: true,
      createdAt: true,
    },
  });

  res.status(201).json({ success: true, message: '用户创建成功', data: newUser });
});

/**
 * [管理员] 更新用户
 * 用户名和昵称在租户内必须唯一
 */
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { userId } = req.params;
  const { username, nickname, isAdmin, isActive } = req.body;

  // 验证用户属于当前租户
  const targetUser = await prisma.tenantUser.findFirst({
    where: { id: userId, tenantId: tenantUser.tenantId },
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }

  // 如果要修改用户名，检查是否重复
  if (username && username !== targetUser.username) {
    const existingUsername = await prisma.tenantUser.findUnique({
      where: {
        tenantId_username: {
          tenantId: tenantUser.tenantId,
          username,
        },
      },
    });
    if (existingUsername) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }
  }

  // 如果要修改昵称，检查是否重复
  if (nickname && nickname !== targetUser.nickname) {
    const existingNickname = await prisma.tenantUser.findFirst({
      where: {
        tenantId: tenantUser.tenantId,
        nickname,
        id: { not: userId },
      },
    });
    if (existingNickname) {
      return res.status(400).json({ success: false, message: '昵称已被使用' });
    }
  }

  const updatedUser = await prisma.tenantUser.update({
    where: { id: userId },
    data: { username, nickname, isAdmin, isActive },
    select: {
      id: true,
      username: true,
      nickname: true,
      isAdmin: true,
      isActive: true,
    },
  });

  res.json({ success: true, message: '用户更新成功', data: updatedUser });
});

/**
 * [管理员] 删除用户
 */
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { userId } = req.params;

  // 不能删除自己
  if (userId === tenantUser.id) {
    return res.status(400).json({ success: false, message: '不能删除自己' });
  }

  // 验证用户属于当前租户
  const targetUser = await prisma.tenantUser.findFirst({
    where: { id: userId, tenantId: tenantUser.tenantId },
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }

  await prisma.tenantUser.delete({ where: { id: userId } });

  res.json({ success: true, message: '用户已删除' });
});

/**
 * [管理员] 重置用户密码
 */
export const resetUserPassword = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const tenantUser = req.tenantUser!;
  const { userId } = req.params;
  const { password } = req.body;

  // 验证用户属于当前租户
  const targetUser = await prisma.tenantUser.findFirst({
    where: { id: userId, tenantId: tenantUser.tenantId },
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await prisma.tenantUser.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });

  res.json({ success: true, message: '密码已重置' });
});

/**
 * [管理员] 获取积分信息
 */
export const getCredits = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantUser.tenantId },
    select: { credits: true },
  });

  res.json({
    success: true,
    data: {
      credits: tenant?.credits || 0,
    },
  });
});

/**
 * [管理员] 获取积分消耗明细
 */
export const getCreditLogs = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { page = '1', limit = '20', type } = req.query;
  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);
  const skip = (pageNum - 1) * limitNum;

  const where: any = { tenantId: tenantUser.tenantId };
  if (type) {
    where.type = type;
  }

  const [logs, total] = await Promise.all([
    prisma.tenantCreditLog.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.tenantCreditLog.count({ where }),
  ]);

  res.json({
    success: true,
    data: logs,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * [管理员] 获取使用统计
 */
export const getUsageStats = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { startDate, endDate } = req.query;

  const where: any = { tenantId: tenantUser.tenantId };
  if (startDate && endDate) {
    where.createdAt = {
      gte: new Date(startDate as string),
      lte: new Date(endDate as string),
    };
  }

  // 按操作类型统计
  const byOperation = await prisma.tenantUsageRecord.groupBy({
    by: ['operation'],
    where,
    _sum: { creditsCharged: true },
    _count: true,
  });

  // 总使用量
  const totals = await prisma.tenantUsageRecord.aggregate({
    where: { tenantId: tenantUser.tenantId },
    _sum: { creditsCharged: true },
    _count: true,
  });

  // 用户使用量排行
  const userUsage = await prisma.tenantUsageRecord.groupBy({
    by: ['userId'],
    where: { tenantId: tenantUser.tenantId },
    _sum: { creditsCharged: true },
    _count: true,
    orderBy: { _sum: { creditsCharged: 'desc' } },
    take: 10,
  });

  res.json({
    success: true,
    data: {
      byOperation,
      totals: {
        totalCredits: totals._sum.creditsCharged || 0,
        totalRecords: totals._count || 0,
      },
      userUsage,
    },
  });
});

/**
 * [管理员] 获取租户资产列表
 * 合并资产库资产和工作流生成的资产，去重优先显示资产库名称
 */
export const getAssets = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { page = '1', limit = '20', type, userId, search } = req.query;
  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);

  // 获取用户ID列表（用于筛选）
  let targetUserIds: string[] | undefined;
  if (search) {
    const searchStr = search as string;
    const matchingUsers = await prisma.tenantUser.findMany({
      where: {
        tenantId: tenantUser.tenantId,
        OR: [
          { username: { contains: searchStr, mode: 'insensitive' } },
          { nickname: { contains: searchStr, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    if (matchingUsers.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 0 },
      });
    }
    targetUserIds = matchingUsers.map(u => u.id);
  } else if (userId) {
    targetUserIds = [userId as string];
  }

  // 1. 查询资产库中的资产（带库名）
  const assetLibraryWhere: any = { tenantId: tenantUser.tenantId };
  if (type && type !== 'all') {
    assetLibraryWhere.type = (type as string).toUpperCase();
  }
  if (targetUserIds) {
    assetLibraryWhere.tenantUserId = { in: targetUserIds };
  }

  const libraryAssets = await prisma.tenantAsset.findMany({
    where: { ...assetLibraryWhere, libraryId: { not: null } },
    orderBy: { createdAt: 'desc' },
    include: {
      library: { select: { name: true } },
    },
  });

  // 收集资产库中资产的 URL 用于去重
  const libraryAssetUrls = new Set(libraryAssets.map(a => a.url));

  // 2. 查询工作流生成的资产（从已完成任务中获取，排除已在资产库中的）
  const taskWhere: any = {
    tenantId: tenantUser.tenantId,
    status: 'SUCCESS',
  };
  if (type && type !== 'all') {
    taskWhere.type = (type as string).toUpperCase();
  }
  if (targetUserIds) {
    taskWhere.tenantUserId = { in: targetUserIds };
  }

  const completedTasks = await prisma.tenantTask.findMany({
    where: taskWhere,
    orderBy: { completedAt: 'desc' },
    select: {
      id: true,
      tenantUserId: true,
      type: true,
      output: true,
      completedAt: true,
      createdAt: true,
      sourceNodeId: true,
    },
  });

  // 获取工作流和项目信息
  const workflowSourceNodeIds = completedTasks
    .filter(t => t.sourceNodeId)
    .map(t => t.sourceNodeId!);

  // 查询包含这些节点的工作流
  const workflows = await prisma.tenantWorkflow.findMany({
    where: { tenantId: tenantUser.tenantId },
    select: { id: true, name: true, projectId: true, nodes: true },
  });

  // 获取项目名称
  const projectIds = [...new Set(workflows.map(w => w.projectId))];
  const projects = await prisma.tenantProject.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, name: true },
  });
  const projectMap = new Map(projects.map(p => [p.id, p.name]));

  // 构建 sourceNodeId -> 项目名称 的映射
  const nodeToProjectMap = new Map<string, string>();
  for (const wf of workflows) {
    const projectName = projectMap.get(wf.projectId) || '未知项目';
    const nodes = wf.nodes as any[];
    if (Array.isArray(nodes)) {
      for (const node of nodes) {
        if (node.id) {
          nodeToProjectMap.set(node.id, projectName);
        }
      }
    }
  }

  // 处理工作流资产，排除已在资产库中的
  const workflowAssets: any[] = [];
  const projectAssetCounters = new Map<string, number>(); // 项目资产计数器
  const addedUrls = new Set<string>(); // 用于去重

  // 2a. 从 TenantTask 中获取资产
  for (const task of completedTasks) {
    const output = task.output as any;
    // 优先使用本地URL（已下载到本地的文件），否则使用原始resultUrl
    const assetUrl = (output?.localDownloaded && output?.localUrl) ? output.localUrl : output?.resultUrl;
    if (!assetUrl) continue;
    
    // 跳过已在资产库中的资产
    if (libraryAssetUrls.has(assetUrl)) continue;
    addedUrls.add(assetUrl);

    const projectName = task.sourceNodeId 
      ? (nodeToProjectMap.get(task.sourceNodeId) || '工作流')
      : '工作流';
    
    // 计数器
    const counterKey = `${task.tenantUserId}-${projectName}-${task.type}`;
    const count = (projectAssetCounters.get(counterKey) || 0) + 1;
    projectAssetCounters.set(counterKey, count);

    const typeLabel = task.type === 'IMAGE' ? '图片' : task.type === 'VIDEO' ? '视频' : '资产';
    const displayName = `${projectName}-${typeLabel}${String(count).padStart(3, '0')}`;

    workflowAssets.push({
      id: task.id,
      name: displayName,
      type: task.type.toLowerCase(),
      url: assetUrl,
      thumbnailUrl: task.type === 'IMAGE' ? assetUrl : undefined,
      size: null,
      userId: task.tenantUserId,
      createdAt: task.completedAt || task.createdAt,
      libraryId: null,
      source: 'workflow',
      projectName,
    });
  }

  // 2b. 从工作流节点中提取 imagePreview/videoPreview 节点的资产（Midjourney 等直接存储在节点中的）
  for (const wf of workflows) {
    const projectName = projectMap.get(wf.projectId) || '未知项目';
    const nodes = wf.nodes as any[];
    if (!Array.isArray(nodes)) continue;

    for (const node of nodes) {
      // 只处理预览节点
      if (node.type !== 'imagePreview' && node.type !== 'videoPreview') continue;
      
      const nodeData = node.data || {};
      const url = nodeData.url || nodeData.imageUrl;
      if (!url) continue;
      
      // 跳过已添加的和已在资产库中的
      if (addedUrls.has(url) || libraryAssetUrls.has(url)) continue;
      addedUrls.add(url);

      // 过滤类型
      const nodeType = node.type === 'imagePreview' ? 'image' : 'video';
      if (type && type !== 'all' && nodeType !== (type as string).toLowerCase()) continue;

      // 计数器
      const counterKey = `workflow-${projectName}-${nodeType}`;
      const count = (projectAssetCounters.get(counterKey) || 0) + 1;
      projectAssetCounters.set(counterKey, count);

      const typeLabel = nodeType === 'image' ? '图片' : '视频';
      const displayName = `${projectName}-${typeLabel}${String(count).padStart(3, '0')}`;

      // 尝试解析节点创建时间
      let createdAt = new Date();
      if (nodeData.midjourneyData?.taskId) {
        // 从 taskId 中提取时间戳（如果有的话）
      }

      workflowAssets.push({
        id: node.id,
        name: displayName,
        type: nodeType,
        url: url,
        thumbnailUrl: nodeType === 'image' ? url : undefined,
        size: null,
        userId: null, // 节点不一定有用户信息
        createdAt: createdAt,
        libraryId: null,
        source: 'workflow-node',
        projectName,
      });
    }
  }

  // 3. 合并资产列表
  const allAssets = [
    ...libraryAssets.map(asset => ({
      id: asset.id,
      name: asset.library ? `${asset.library.name}/${asset.name}` : asset.name,
      type: asset.type.toLowerCase(),
      url: asset.url,
      thumbnailUrl: asset.type === 'IMAGE' ? asset.url : undefined,
      size: asset.size,
      userId: asset.tenantUserId,
      createdAt: asset.createdAt,
      libraryId: asset.libraryId,
      source: 'library',
      libraryName: asset.library?.name,
    })),
    ...workflowAssets,
  ];

  // 按创建时间排序
  allAssets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // 获取用户信息（过滤掉 null）
  const userIds = [...new Set(allAssets.map(a => a.userId).filter((id): id is string => id != null))];
  const users = userIds.length > 0 ? await prisma.tenantUser.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, nickname: true },
  }) : [];
  const userMap = new Map(users.map(u => [u.id, u]));

  // 分页
  const total = allAssets.length;
  const skip = (pageNum - 1) * limitNum;
  const pagedAssets = allAssets.slice(skip, skip + limitNum);

  // 格式化返回数据
  const formattedAssets = pagedAssets.map(asset => {
    const user = userMap.get(asset.userId);
    return {
      ...asset,
      username: user?.nickname || user?.username || '-',
      createdAt: asset.createdAt instanceof Date 
        ? asset.createdAt.toISOString() 
        : asset.createdAt,
    };
  });

  res.json({
    success: true,
    data: formattedAssets,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * [管理员] 获取回收站资产
 * 查询被标记为删除的资产（来自删除的资产库）、任务（来自删除的项目）和预览节点
 */
export const getRecycleBin = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { page = '1', limit = '20', type } = req.query;
  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);

  // 1. 查询被标记删除的资产（来自删除的资产库）
  const deletedAssets = await prisma.tenantAsset.findMany({
    where: {
      tenantId: tenantUser.tenantId,
      metadata: { path: ['deletedAt'], not: Prisma.DbNull },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // 2. 查询被标记删除的任务（来自删除的项目）
  const deletedTasks = await prisma.tenantTask.findMany({
    where: {
      tenantId: tenantUser.tenantId,
      status: 'SUCCESS',
      output: { path: ['deletedAt'], not: Prisma.DbNull },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // 3. 查询回收站中的预览节点（工作流中删除的生成内容）
  const recycleItems = await prisma.tenantRecycleItem.findMany({
    where: {
      tenantId: tenantUser.tenantId,
      isDeleted: true,
    },
    orderBy: { deletedAt: 'desc' },
  });

  // 获取用户信息
  const userIds = [...new Set([
    ...deletedAssets.map(a => a.tenantUserId),
    ...deletedTasks.map(t => t.tenantUserId),
    ...recycleItems.map(r => r.tenantUserId),
  ])];
  const users = await prisma.tenantUser.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, nickname: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));

  // 合并回收站项目
  const recycleBinItems: any[] = [];

  // 处理删除的资产
  for (const asset of deletedAssets) {
    const metadata = asset.metadata as any;
    if (type && type !== 'all' && asset.type.toLowerCase() !== (type as string).toLowerCase()) {
      continue;
    }
    const user = userMap.get(asset.tenantUserId);
    recycleBinItems.push({
      id: asset.id,
      name: asset.name,
      type: asset.type.toLowerCase(),
      url: asset.url,
      thumbnailUrl: asset.type === 'IMAGE' ? asset.url : undefined,
      size: asset.size,
      userId: asset.tenantUserId,
      username: user?.nickname || user?.username || '-',
      createdAt: asset.createdAt.toISOString(),
      deletedAt: metadata.deletedAt,
      deletedFrom: metadata.deletedFrom || 'library',
      originalName: metadata.originalLibraryName,
      source: 'asset',
    });
  }

  // 处理删除的任务
  for (const task of deletedTasks) {
    const output = task.output as any;
    if (!output?.resultUrl) continue;
    if (type && type !== 'all' && task.type.toLowerCase() !== (type as string).toLowerCase()) {
      continue;
    }
    const user = userMap.get(task.tenantUserId);
    recycleBinItems.push({
      id: task.id,
      name: `${output.originalProjectName || '项目'}-${task.type === 'IMAGE' ? '图片' : '视频'}`,
      type: task.type.toLowerCase(),
      url: output.resultUrl,
      thumbnailUrl: task.type === 'IMAGE' ? output.resultUrl : undefined,
      size: null,
      userId: task.tenantUserId,
      username: user?.nickname || user?.username || '-',
      createdAt: task.createdAt.toISOString(),
      deletedAt: output.deletedAt,
      deletedFrom: output.deletedFrom || 'project',
      originalName: output.originalProjectName,
      source: 'task',
    });
  }

  // 处理删除的预览节点
  for (const item of recycleItems) {
    if (type && type !== 'all' && item.type.toLowerCase() !== (type as string).toLowerCase()) {
      continue;
    }
    const user = userMap.get(item.tenantUserId);
    recycleBinItems.push({
      id: item.id,
      name: item.name,
      type: item.type.toLowerCase(),
      url: item.url,
      thumbnailUrl: item.thumbnail || (item.type === 'IMAGE' ? item.url : undefined),
      size: item.size,
      userId: item.tenantUserId,
      username: user?.nickname || user?.username || '-',
      createdAt: item.createdAt.toISOString(),
      deletedAt: item.deletedAt?.toISOString() || item.createdAt.toISOString(),
      deletedFrom: 'workflow',
      originalName: item.originalName,
      source: 'recycle',
    });
  }

  // 按删除时间排序
  recycleBinItems.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());

  // 分页
  const total = recycleBinItems.length;
  const skip = (pageNum - 1) * limitNum;
  const pagedItems = recycleBinItems.slice(skip, skip + limitNum);

  res.json({
    success: true,
    data: pagedItems,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

// ==================== 设备管理 ====================

/**
 * [管理员] 获取已激活设备列表
 */
export const getActivations = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;

  const activations = await prisma.clientActivation.findMany({
    where: { tenantId: tenantUser.tenantId },
    orderBy: { createdAt: 'desc' },
  });

  // 获取租户的客户端配额
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantUser.tenantId },
    select: { maxClients: true },
  });

  const activatedCount = activations.filter((a) => a.isActivated).length;

  res.json({
    success: true,
    data: {
      activations,
      stats: {
        total: activations.length,
        activated: activatedCount,
        available: activations.filter((a) => !a.isActivated).length,
        maxClients: tenant?.maxClients || 5,
      },
    },
  });
});

/**
 * [管理员] 解绑设备
 */
export const unbindDevice = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { activationId } = req.params;

  // 验证激活记录属于当前租户
  const activation = await prisma.clientActivation.findFirst({
    where: {
      id: activationId,
      tenantId: tenantUser.tenantId,
    },
  });

  if (!activation) {
    return res.status(404).json({ success: false, message: '激活记录不存在' });
  }

  if (!activation.isActivated) {
    return res.status(400).json({ success: false, message: '该激活码未被使用' });
  }

  // 解绑设备
  await prisma.clientActivation.update({
    where: { id: activationId },
    data: {
      deviceFingerprint: null,
      deviceName: null,
      isActivated: false,
      activatedAt: null,
    },
  });

  res.json({ success: true, message: '设备已解绑' });
});

/**
 * [管理员] 获取员工效率报表
 * 统计每个员工的积分消耗、任务产出、成功率
 */
export const getStaffReport = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { startDate, endDate } = req.query;

  // 解析日期范围，默认最近30天
  const end = endDate ? new Date(endDate as string) : new Date();
  const start = startDate ? new Date(startDate as string) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  // 设置时间范围
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  // 1. 获取所有员工（排除管理员）
  const users = await prisma.tenantUser.findMany({
    where: { tenantId: tenantUser.tenantId, isAdmin: false },
    select: { id: true, username: true, nickname: true, isAdmin: true },
  });

  // 2. 统计每个员工的积分消耗（优先用 TenantUsageRecord，备用 TenantCreditLog）
  const usageRecords = await prisma.tenantUsageRecord.findMany({
    where: {
      tenantId: tenantUser.tenantId,
      createdAt: { gte: start, lte: end },
    },
    select: { userId: true, creditsCharged: true, operation: true },
  });

  // 如果 TenantUsageRecord 没数据，从 TenantCreditLog 获取（type=USAGE 的记录）
  const creditLogs = await prisma.tenantCreditLog.findMany({
    where: {
      tenantId: tenantUser.tenantId,
      type: 'USAGE',
      createdAt: { gte: start, lte: end },
    },
    select: { amount: true, description: true, operatorId: true },
  });

  // 3. 统计每个员工的任务（包括所有状态）
  const tasks = await prisma.tenantTask.findMany({
    where: {
      tenantId: tenantUser.tenantId,
      createdAt: { gte: start, lte: end },
    },
    select: { tenantUserId: true, type: true, status: true, creditsCost: true },
  });

  // 4. 聚合数据
  const userStatsMap = new Map<string, {
    creditsUsed: number;
    totalTasks: number;
    successTasks: number;
    failedTasks: number;
    imageCount: number;
    videoCount: number;
    audioCount: number;
  }>();

  // 初始化
  for (const user of users) {
    userStatsMap.set(user.id, {
      creditsUsed: 0,
      totalTasks: 0,
      successTasks: 0,
      failedTasks: 0,
      imageCount: 0,
      videoCount: 0,
      audioCount: 0,
    });
  }

  // 统计积分消耗 - 从 TenantUsageRecord
  for (const record of usageRecords) {
    if (record.userId) {
      const stats = userStatsMap.get(record.userId);
      if (stats) {
        stats.creditsUsed += record.creditsCharged;
      }
    }
  }

  // 如果 TenantUsageRecord 没数据，从 TenantCreditLog 补充
  if (usageRecords.length === 0 && creditLogs.length > 0) {
    for (const log of creditLogs) {
      if (log.operatorId) {
        const stats = userStatsMap.get(log.operatorId);
        if (stats) {
          stats.creditsUsed += Math.abs(log.amount); // amount 是负数
        }
      }
    }
  }

  // 统计任务
  for (const task of tasks) {
    const stats = userStatsMap.get(task.tenantUserId);
    if (stats) {
      stats.totalTasks++;
      // 如果没有从 UsageRecord 获取到积分，从任务的 creditsCost 获取
      if (task.creditsCost && task.creditsCost > 0) {
        stats.creditsUsed += task.creditsCost;
      }
      if (task.status === 'SUCCESS') {
        stats.successTasks++;
        if (task.type === 'IMAGE') stats.imageCount++;
        if (task.type === 'VIDEO') stats.videoCount++;
        if (task.type === 'AUDIO') stats.audioCount++;
      } else if (task.status === 'FAILURE') {
        stats.failedTasks++;
      }
    }
  }

  // 5. 格式化返回数据
  const report = users.map(user => {
    const stats = userStatsMap.get(user.id)!;
    const successRate = stats.totalTasks > 0 
      ? Math.round((stats.successTasks / stats.totalTasks) * 100) 
      : 0;
    const efficiency = stats.creditsUsed > 0 
      ? Math.round((stats.successTasks / stats.creditsUsed) * 100) / 100 
      : 0;

    return {
      userId: user.id,
      username: user.username,
      nickname: user.nickname,
      isAdmin: user.isAdmin,
      creditsUsed: stats.creditsUsed,
      totalTasks: stats.totalTasks,
      successTasks: stats.successTasks,
      failedTasks: stats.failedTasks,
      successRate,
      imageCount: stats.imageCount,
      videoCount: stats.videoCount,
      audioCount: stats.audioCount,
      efficiency, // 产出/积分消耗比
    };
  });

  // 按积分消耗排序
  report.sort((a, b) => b.creditsUsed - a.creditsUsed);

  // 6. 计算汇总
  const totalTasks = report.reduce((sum, r) => sum + r.totalTasks, 0);
  const totalSuccessTasks = report.reduce((sum, r) => sum + r.successTasks, 0);
  const summary = {
    totalCreditsUsed: report.reduce((sum, r) => sum + r.creditsUsed, 0),
    totalTasks,
    totalSuccessTasks,
    totalImages: report.reduce((sum, r) => sum + r.imageCount, 0),
    totalVideos: report.reduce((sum, r) => sum + r.videoCount, 0),
    avgSuccessRate: totalTasks > 0 ? Math.round((totalSuccessTasks / totalTasks) * 100) : 0,
  };

  res.json({
    success: true,
    data: {
      report,
      summary,
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    },
  });
});

/**
 * [管理员] 获取指定用户的工作流列表
 */
export const getUserWorkflows = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { userId } = req.params;

  // 验证用户属于当前租户
  const targetUser = await prisma.tenantUser.findFirst({
    where: { id: userId, tenantId: tenantUser.tenantId },
    select: { id: true, username: true, nickname: true },
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }

  // 获取用户的工作流（通过项目关联）
  const workflows = await prisma.tenantWorkflow.findMany({
    where: {
      tenantId: tenantUser.tenantId,
      tenantUserId: userId,
    },
    select: {
      id: true,
      name: true,
      projectId: true,
      nodes: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  // 获取项目名称
  const projectIds = [...new Set(workflows.map(w => w.projectId))];
  const projects = await prisma.tenantProject.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, name: true },
  });
  const projectMap = new Map(projects.map(p => [p.id, p.name]));

  const formattedWorkflows = workflows.map(wf => ({
    id: wf.id,
    name: wf.name,
    projectId: wf.projectId,
    projectName: projectMap.get(wf.projectId) || '未知项目',
    nodeCount: Array.isArray(wf.nodes) ? wf.nodes.length : 0,
    createdAt: wf.createdAt,
    updatedAt: wf.updatedAt,
  }));

  res.json({
    success: true,
    data: {
      user: targetUser,
      workflows: formattedWorkflows,
    },
  });
});

