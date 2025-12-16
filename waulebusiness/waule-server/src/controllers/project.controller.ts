import { Request, Response } from 'express';
import { prisma, redis } from '../index';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { validationResult } from 'express-validator';

/**
 * 获取所有项目
 */
export const getAllProjects = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 20, type, status, search, includeCounts, withTotal, fields } = req.query as any;

  const where: any = { userId: req.user!.id };
  if (type) where.type = type;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { name: { contains: String(search), mode: 'insensitive' } },
      { description: { contains: String(search), mode: 'insensitive' } },
    ];
  }

  const take = Math.min(Number(limit) || 20, 100);
  const pageNum = Math.max(Number(page) || 1, 1);
  const skip = (pageNum - 1) * take;

  // Prisma 限制：不能同时使用 select 与 include
  const useMinimal = fields === 'minimal' && includeCounts !== 'true';
  const select = useMinimal
    ? { id: true, name: true, description: true, thumbnail: true, type: true, updatedAt: true }
    : undefined;
  const include = !useMinimal && includeCounts === 'true'
    ? { _count: { select: { episodes: true, workflows: true, assets: true } } }
    : undefined;

  // Redis 缓存：同一用户 + 参数组合的项目列表缓存，TTL 15s
  const cacheKey = `projects:list:user:${req.user!.id}:p:${pageNum}:l:${take}:type:${type || 'all'}:status:${status || 'all'}:q:${search ? String(search) : ''}:counts:${includeCounts === 'true' ? '1' : '0'}:fields:${fields || 'full'}:total:${String(withTotal) === 'true' ? '1' : '0'}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return res.json(parsed);
    }
  } catch {}

  const shouldCount = String(withTotal) === 'true';
  let projectsPromise: Promise<any[]>;
  if (select) {
    projectsPromise = prisma.project.findMany({
      where,
      select,
      skip,
      take,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
  } else if (include) {
    projectsPromise = prisma.project.findMany({
      where,
      include,
      skip,
      take,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
  } else {
    projectsPromise = prisma.project.findMany({
      where,
      skip,
      take,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
  }
  const countPromise = shouldCount ? prisma.project.count({ where }) : Promise.resolve(undefined as any);
  const [projects, total] = await Promise.all([projectsPromise, countPromise]);

  // 为DRAMA项目获取协作者数量
  const projectIds = projects.filter((p: any) => p.type === 'DRAMA').map((p: any) => p.id);
  let shareCountMap = new Map<string, number>();
  if (projectIds.length > 0) {
    try {
      const shareCounts = await prisma.projectShare.groupBy({
        by: ['projectId'],
        where: { projectId: { in: projectIds } },
        _count: { projectId: true },
      });
      shareCounts.forEach((sc: any) => {
        shareCountMap.set(sc.projectId, sc._count.projectId);
      });
    } catch {}
  }

  // 为项目添加 hasCollaborators 标记
  const projectsWithShareInfo = projects.map((p: any) => ({
    ...p,
    hasCollaborators: shareCountMap.get(p.id) ? shareCountMap.get(p.id)! > 0 : false,
  }));

  const payload = {
    success: true,
    data: projectsWithShareInfo,
    pagination: {
      page: pageNum,
      limit: take,
      total: shouldCount ? total : undefined,
      totalPages: shouldCount && total ? Math.ceil(total / take) : undefined,
    },
  };

  try {
    await redis.set(cacheKey, JSON.stringify(payload), 'EX', 15);
  } catch {}

  res.json(payload);
});

async function invalidateProjectListCache(userId: string) {
  try {
    const pattern = `projects:list:user:${userId}:*`;
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = String(next);
      if (Array.isArray(keys) && keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch {}
}

/**
 * 获取单个项目
 */
export const getProjectById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      episodes: {
        orderBy: { episodeNumber: 'asc' },
        include: {
          scenes: {
            orderBy: { sceneNumber: 'asc' },
          },
        },
      },
      workflows: {
        orderBy: { updatedAt: 'desc' },
      },
      assets: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      _count: {
        select: {
          episodes: true,
          workflows: true,
          assets: true,
        },
      },
    },
  });
  
  if (!project) {
    throw new AppError('项目不存在', 404);
  }
  
  // 检查权限：所有者或协作者
  let isOwner = project.userId === userId;
  let isShared = false;
  let shareInfo = null;
  
  if (!isOwner) {
    // 检查是否是协作者
    const share = await prisma.projectShare.findFirst({
      where: { projectId: id, targetUserId: userId },
      include: {
        owner: { select: { id: true, nickname: true, avatar: true } },
      },
    });
    
    if (share) {
      isShared = true;
      shareInfo = {
        owner: share.owner,
        sharedAt: share.createdAt,
      };
    } else {
      throw new AppError('无权访问此项目', 403);
    }
  }
  
  res.json({
    success: true,
    data: {
      ...project,
      isOwner,
      isShared,
      shareInfo,
    },
  });
});

/**
 * 创建项目
 */
export const createProject = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }
  
  const { name, description, type, thumbnail } = req.body;
  
  const project = await prisma.project.create({
    data: {
      name,
      description,
      type: type || 'DRAMA',
      thumbnail,
      userId: req.user!.id,
      status: 'DRAFT',
    },
  });
  await invalidateProjectListCache(req.user!.id);
  
  res.status(201).json({
    success: true,
    message: '项目创建成功',
    data: project,
  });
});

/**
 * 更新项目
 */
export const updateProject = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, thumbnail, status } = req.body;
  
  // 检查项目是否存在和权限
  const existingProject = await prisma.project.findUnique({
    where: { id },
  });
  
  if (!existingProject) {
    throw new AppError('项目不存在', 404);
  }
  
  if (existingProject.userId !== req.user!.id) {
    throw new AppError('无权修改此项目', 403);
  }
  
  const project = await prisma.project.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(thumbnail !== undefined && { thumbnail }),
      ...(status && { status }),
    },
  });
  await invalidateProjectListCache(req.user!.id);
  
  res.json({
    success: true,
    message: '项目更新成功',
    data: project,
  });
});

/**
 * 删除项目
 */
export const deleteProject = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  // 检查项目是否存在和权限
  const project = await prisma.project.findUnique({
    where: { id },
  });
  
  if (!project) {
    throw new AppError('项目不存在', 404);
  }
  
  if (project.userId !== req.user!.id) {
    throw new AppError('无权删除此项目', 403);
  }
  
  // 先删除关联的工作流共享记录和工作流（确保协作者不再看到）
  const workflows = await prisma.workflow.findMany({
    where: { projectId: id },
    select: { id: true },
  });
  const workflowIds = workflows.map(w => w.id);
  
  if (workflowIds.length > 0) {
    // 删除工作流共享记录
    await prisma.workflowShare.deleteMany({
      where: { workflowId: { in: workflowIds } },
    });
    // 删除工作流
    await prisma.workflow.deleteMany({
      where: { id: { in: workflowIds } },
    });
  }
  
  // 删除项目共享记录
  await prisma.projectShare.deleteMany({
    where: { projectId: id },
  });
  
  // 最后删除项目
  await prisma.project.delete({
    where: { id },
  });
  await invalidateProjectListCache(req.user!.id);
  
  res.json({
    success: true,
    message: '项目删除成功',
  });
});

/**
 * 获取项目的所有集数
 */
export const getEpisodes = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  
  // 验证项目权限
  const project = await prisma.project.findUnique({
    where: { id },
    select: { userId: true },
  });
  
  if (!project) {
    throw new AppError('项目不存在', 404);
  }
  
  // 检查是否是所有者或协作者
  if (project.userId !== userId) {
    const share = await prisma.projectShare.findFirst({
      where: { projectId: id, targetUserId: userId },
    });
    if (!share) {
      throw new AppError('无权访问此项目', 403);
    }
  }
  
  const episodes = await prisma.episode.findMany({
    where: { projectId: id },
    include: {
      _count: {
        select: {
          scenes: true,
        },
      },
    },
    orderBy: { episodeNumber: 'asc' },
  });
  
  res.json({
    success: true,
    data: episodes,
  });
});

/**
 * 创建集数
 */
export const createEpisode = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, episodeNumber, thumbnail } = req.body;
  
  // 验证项目权限
  const project = await prisma.project.findUnique({
    where: { id },
    select: { userId: true },
  });
  
  if (!project) {
    throw new AppError('项目不存在', 404);
  }
  
  if (project.userId !== req.user!.id) {
    throw new AppError('无权访问此项目', 403);
  }
  
  // 如果没有提供集数，自动计算
  let newEpisodeNumber = episodeNumber;
  if (!newEpisodeNumber) {
    const lastEpisode = await prisma.episode.findFirst({
      where: { projectId: id },
      orderBy: { episodeNumber: 'desc' },
    });
    newEpisodeNumber = (lastEpisode?.episodeNumber || 0) + 1;
  }
  
  const episode = await prisma.episode.create({
    data: {
      projectId: id,
      episodeNumber: newEpisodeNumber,
      name,
      description,
      status: 'DRAFT',
      thumbnail,
    },
  });
  
  res.status(201).json({
    success: true,
    message: '集数创建成功',
    data: episode,
  });
});

/**
 * 搜索用户（用于添加协作者）
 */
export const searchUsers = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { q } = req.query;
  const query = typeof q === 'string' ? q.trim() : '';

  const whereCondition: any = {
    id: { not: userId },
    isActive: true,
  };

  if (query.length > 0) {
    whereCondition.OR = [
      { nickname: { contains: query, mode: 'insensitive' } },
      { username: { contains: query, mode: 'insensitive' } },
    ];
  }

  const users = await prisma.user.findMany({
    where: whereCondition,
    select: {
      id: true,
      nickname: true,
      avatar: true,
      username: true,
    },
    orderBy: { lastLoginAt: 'desc' },
    take: 5,
  });

  res.json({ success: true, data: users });
});

/**
 * 获取项目的协作者列表
 */
export const getProjectCollaborators = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;

  // 验证项目存在且属于当前用户
  const project = await prisma.project.findFirst({
    where: { id, userId },
  });

  if (!project) {
    throw new AppError('项目不存在', 404);
  }

  const shares = await prisma.projectShare.findMany({
    where: { projectId: id },
    include: {
      target: { select: { id: true, nickname: true, avatar: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const collaborators = shares.map((share: any) => ({
    id: share.target.id,
    nickname: share.target.nickname,
    avatar: share.target.avatar,
    sharedAt: share.createdAt,
  }));

  res.json({ success: true, data: collaborators });
});

/**
 * 添加项目协作者（项目级只有只读权限，管理员可公开共享给所有人）
 */
export const addProjectCollaborator = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const userRole = req.user!.role;
  const { targetUserId } = req.body;

  if (!targetUserId) {
    throw new AppError('请指定协作者', 400);
  }

  // 验证项目存在且属于当前用户
  const project = await prisma.project.findFirst({
    where: { id, userId },
  });

  if (!project) {
    throw new AppError('项目不存在', 404);
  }

  // 处理"所有人"公开共享（仅管理员可用）
  if (targetUserId === '*' || targetUserId === 'all') {
    if (userRole !== 'ADMIN') {
      throw new AppError('仅管理员可以公开共享给所有人', 403);
    }

    // 设置项目为公开
    await prisma.project.update({
      where: { id },
      data: { isPublic: true },
    });

    res.json({ success: true, message: '已公开共享给所有人', data: { isPublic: true } });
    return;
  }

  if (targetUserId === userId) {
    throw new AppError('不能将自己添加为协作者', 400);
  }

  // 验证目标用户存在
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, nickname: true, avatar: true },
  });

  if (!targetUser) {
    throw new AppError('用户不存在', 404);
  }

  // 检查是否已共享
  const existingShare = await prisma.projectShare.findFirst({
    where: { projectId: id, targetUserId },
  });

  if (existingShare) {
    throw new AppError('该用户已是协作者', 400);
  }

  // 创建共享记录（项目级只有只读权限）
  const share = await prisma.projectShare.create({
    data: {
      projectId: id,
      ownerUserId: userId,
      targetUserId,
    },
    include: {
      target: { select: { id: true, nickname: true, avatar: true } },
    },
  });

  res.json({ success: true, data: share });
});

/**
 * 移除项目协作者
 */
export const removeProjectCollaborator = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const { targetUserId } = req.body;

  if (!targetUserId) {
    throw new AppError('请指定要移除的协作者', 400);
  }

  // 验证项目存在且属于当前用户
  const project = await prisma.project.findFirst({
    where: { id, userId },
  });

  if (!project) {
    throw new AppError('项目不存在', 404);
  }

  // 删除共享记录
  const deleted = await prisma.projectShare.deleteMany({
    where: { projectId: id, targetUserId },
  });

  if (deleted.count === 0) {
    throw new AppError('该用户不是协作者', 404);
  }

  res.json({ success: true, message: '已移除协作者' });
});

/**
 * 获取共享给我的项目列表（包括公开项目）
 */
export const getSharedProjects = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { type } = req.query;

  // 查询直接共享给我的项目
  const whereCondition: any = { 
    targetUserId: userId,
  };
  if (type) {
    whereCondition.project = { type };
  }

  const shares = await prisma.projectShare.findMany({
    where: whereCondition,
    include: {
      project: {
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          _count: { select: { episodes: true, workflows: true, assets: true } },
        },
      },
      owner: { select: { id: true, nickname: true, avatar: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // 额外过滤：确保 project 不为 null（双重保险）
  const validShares = shares.filter((share: any) => share.project !== null);

  const sharedProjects = validShares.map((share: any) => ({
    ...share.project,
    isOwner: false,
    isShared: true,
    isPublic: false,
    hasCollaborators: false,
    shareInfo: {
      owner: share.owner,
      sharedAt: share.createdAt,
    },
  }));

  // 获取公开项目（不包括自己的）
  const publicProjectsWhere: any = {
    isPublic: true,
    userId: { not: userId },
  };
  if (type) {
    publicProjectsWhere.type = type;
  }

  const publicProjects = await prisma.project.findMany({
    where: publicProjectsWhere,
    include: {
      user: { select: { id: true, nickname: true, avatar: true } },
      _count: { select: { episodes: true, workflows: true, assets: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // 过滤掉已经通过直接共享获取的（避免重复）
  const sharedIds = new Set(sharedProjects.map((p: any) => p.id));
  const uniquePublicProjects = publicProjects
    .filter((p: any) => !sharedIds.has(p.id))
    .map((p: any) => ({
      ...p,
      isOwner: false,
      isShared: true,
      isPublic: true,
      hasCollaborators: false,
      shareInfo: {
        owner: p.user,
        isPublic: true,
      },
    }));

  const allProjects = [...sharedProjects, ...uniquePublicProjects];

  res.json({ success: true, data: allProjects });
});

