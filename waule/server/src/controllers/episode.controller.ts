import { Request, Response } from 'express';
import { prisma, redis } from '../index';

// 🚀 检查用户是否有项目访问权限（所有者或协作者）- 带缓存
async function checkProjectAccess(projectId: string, userId: string): Promise<{ hasAccess: boolean; isOwner: boolean }> {
  const cacheKey = `project:access:${projectId}:${userId}`;
  
  // 尝试从缓存获取
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {}
  
  // 🚀 并行查询所有者和协作者
  const [project, share] = await Promise.all([
    prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    }),
    prisma.projectShare.findFirst({
      where: { projectId, targetUserId: userId },
      select: { id: true },
    }),
  ]);
  
  let result: { hasAccess: boolean; isOwner: boolean };
  if (project) {
    result = { hasAccess: true, isOwner: true };
  } else if (share) {
    result = { hasAccess: true, isOwner: false };
  } else {
    result = { hasAccess: false, isOwner: false };
  }
  
  // 缓存 2 分钟
  try { await redis.set(cacheKey, JSON.stringify(result), 'EX', 120); } catch {}
  
  return result;
}

// 检查用户是否有剧集编辑权限
// 所有者始终有编辑权限，协作者需要单独授权
async function checkEpisodeEditPermission(projectId: string, episodeId: string, userId: string): Promise<boolean> {
  // 检查是否是项目所有者
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });
  
  if (project) {
    return true; // 所有者有编辑权限
  }
  
  // 检查是否有剧集编辑权限
  const permission = await prisma.episodePermission.findFirst({
    where: { episodeId, userId, permission: 'EDIT' },
  });
  
  return !!permission;
}

// 获取项目的所有剧集
export const getEpisodes = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user?.id;

    // 验证项目访问权限（所有者或协作者）
    const access = await checkProjectAccess(projectId, userId);
    if (!access.hasAccess) {
      return res.status(404).json({ message: '项目不存在或无权访问' });
    }

    // 🚀 尝试从缓存获取
    const cacheKey = `episodes:${projectId}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
    } catch {}

    const episodes = await prisma.episode.findMany({
      where: {
        projectId,
      },
      orderBy: {
        episodeNumber: 'asc',
      },
      select: {
        id: true,
        name: true,
        episodeNumber: true,
        description: true,
        status: true,
        thumbnail: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const result = { success: true, data: episodes };
    
    // 🚀 缓存 1 分钟
    try { await redis.set(cacheKey, JSON.stringify(result), 'EX', 60); } catch {}

    res.json(result);
  } catch (error) {
    console.error('Get episodes error:', error);
    res.status(500).json({ message: '获取剧集列表失败' });
  }
};

// 获取单个剧集（包含当前用户的权限信息）
export const getEpisode = async (req: Request, res: Response) => {
  try {
    const { projectId, episodeId } = req.params;
    const userId = (req as any).user?.id;

    // 验证项目访问权限（所有者或协作者）
    const access = await checkProjectAccess(projectId, userId);
    if (!access.hasAccess) {
      return res.status(404).json({ message: '项目不存在或无权访问' });
    }

    const episode = await prisma.episode.findFirst({
      where: {
        id: episodeId,
        projectId,
      },
    });

    if (!episode) {
      return res.status(404).json({ message: '剧集不存在' });
    }

    // 获取当前用户对该剧集的权限
    let canEdit = access.isOwner; // 所有者始终可编辑
    if (!access.isOwner) {
      // 检查剧集级权限
      const episodePermission = await prisma.episodePermission.findFirst({
        where: { episodeId, userId },
      });
      canEdit = episodePermission?.permission === 'EDIT';
    }

    res.json({ 
      success: true, 
      data: {
        ...episode,
        canEdit,
        isOwner: access.isOwner,
      }
    });
  } catch (error) {
    console.error('Get episode error:', error);
    res.status(500).json({ message: '获取剧集失败' });
  }
};

// 创建剧集（只有项目所有者可以创建剧集）
export const createEpisode = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { name, description, episodeNumber, thumbnail } = req.body;
    const userId = (req as any).user?.id;

    // 只有项目所有者可以创建剧集
    const access = await checkProjectAccess(projectId, userId);
    if (!access.hasAccess) {
      return res.status(404).json({ message: '项目不存在或无权访问' });
    }
    if (!access.isOwner) {
      return res.status(403).json({ message: '只有项目所有者可以创建剧集' });
    }

    // 如果没有指定集数，自动生成下一个集数
    let finalEpisodeNumber = episodeNumber;
    if (!finalEpisodeNumber) {
      const lastEpisode = await prisma.episode.findFirst({
        where: { projectId },
        orderBy: { episodeNumber: 'desc' },
      });
      finalEpisodeNumber = lastEpisode ? lastEpisode.episodeNumber + 1 : 1;
    }

    // 检查集数是否已存在
    const existingEpisode = await prisma.episode.findFirst({
      where: {
        projectId,
        episodeNumber: finalEpisodeNumber,
      },
    });

    if (existingEpisode) {
      return res.status(400).json({ message: '该集数已存在' });
    }

    const episode = await prisma.episode.create({
      data: {
        projectId,
        name,
        description,
        episodeNumber: finalEpisodeNumber,
        thumbnail,
      },
    });

    // 🚀 清除剧集列表缓存
    try { await redis.del(`episodes:${projectId}`); } catch {}

    res.status(201).json({ success: true, data: episode });
  } catch (error) {
    console.error('Create episode error:', error);
    res.status(500).json({ message: '创建剧集失败' });
  }
};

// 更新剧集（所有者或有剧集编辑权限的协作者）
export const updateEpisode = async (req: Request, res: Response) => {
  try {
    const { projectId, episodeId } = req.params;
    const { name, description, episodeNumber, status, thumbnail, scriptJson } = req.body;
    const userId = (req as any).user?.id;

    // 验证项目访问权限
    const access = await checkProjectAccess(projectId, userId);
    if (!access.hasAccess) {
      return res.status(404).json({ message: '项目不存在或无权访问' });
    }
    
    // 检查剧集编辑权限
    const canEdit = await checkEpisodeEditPermission(projectId, episodeId, userId);
    if (!canEdit) {
      return res.status(403).json({ message: '没有该剧集的编辑权限' });
    }

    const episode = await prisma.episode.findFirst({
      where: {
        id: episodeId,
        projectId,
      },
    });

    if (!episode) {
      return res.status(404).json({ message: '剧集不存在' });
    }

    // 如果更新集数，检查新集数是否与其他剧集冲突
    if (episodeNumber && episodeNumber !== episode.episodeNumber) {
      const existingEpisode = await prisma.episode.findFirst({
        where: {
          projectId,
          episodeNumber,
          id: { not: episodeId },
        },
      });

      if (existingEpisode) {
        return res.status(400).json({ message: '该集数已被占用' });
      }
    }

    const updatedEpisode = await prisma.episode.update({
      where: { id: episodeId },
      data: {
        name,
        description,
        episodeNumber,
        status,
        thumbnail,
        ...(scriptJson !== undefined && { scriptJson }),
      },
    });

    // 🚀 清除剧集列表缓存
    try { await redis.del(`episodes:${projectId}`); } catch {}

    res.json({ success: true, data: updatedEpisode });
  } catch (error) {
    console.error('Update episode error:', error);
    res.status(500).json({ message: '更新剧集失败' });
  }
};

// 删除剧集（只有项目所有者可以删除剧集）
export const deleteEpisode = async (req: Request, res: Response) => {
  try {
    const { projectId, episodeId } = req.params;
    const userId = (req as any).user?.id;

    // 只有项目所有者可以删除剧集
    const access = await checkProjectAccess(projectId, userId);
    if (!access.hasAccess) {
      return res.status(404).json({ message: '项目不存在或无权访问' });
    }
    if (!access.isOwner) {
      return res.status(403).json({ message: '只有项目所有者可以删除剧集' });
    }

    const episode = await prisma.episode.findFirst({
      where: {
        id: episodeId,
        projectId,
      },
    });

    if (!episode) {
      return res.status(404).json({ message: '剧集不存在' });
    }

    await prisma.episode.delete({
      where: { id: episodeId },
    });

    // 🚀 清除剧集列表缓存
    try { await redis.del(`episodes:${projectId}`); } catch {}

    res.json({ success: true, message: '剧集已删除' });
  } catch (error) {
    console.error('Delete episode error:', error);
    res.status(500).json({ message: '删除剧集失败' });
  }
};

// 获取剧集的协作者列表（继承项目协作者，包含剧集级权限）
export const getEpisodeCollaborators = async (req: Request, res: Response) => {
  try {
    const { projectId, episodeId } = req.params;
    const userId = (req as any).user?.id;

    // 验证项目所有者权限
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) {
      return res.status(404).json({ message: '项目不存在或无权访问' });
    }

    // 获取项目的所有协作者
    const projectShares = await prisma.projectShare.findMany({
      where: { projectId },
      include: {
        target: { select: { id: true, nickname: true, avatar: true } },
      },
    });

    // 获取该剧集的权限设置
    const episodePermissions = await prisma.episodePermission.findMany({
      where: { episodeId },
    });

    const permissionMap = new Map(episodePermissions.map(p => [p.userId, p.permission]));

    // 合并协作者列表和权限
    const collaborators = projectShares.map(share => ({
      id: share.target.id,
      nickname: share.target.nickname,
      avatar: share.target.avatar,
      permission: permissionMap.get(share.targetUserId) || 'READ', // 默认只读
      sharedAt: share.createdAt,
    }));

    res.json({ success: true, data: collaborators });
  } catch (error) {
    console.error('Get episode collaborators error:', error);
    res.status(500).json({ message: '获取协作者列表失败' });
  }
};

// 更新剧集协作者权限
export const updateEpisodePermission = async (req: Request, res: Response) => {
  try {
    const { projectId, episodeId } = req.params;
    const { targetUserId, permission } = req.body;
    const userId = (req as any).user?.id;

    if (!targetUserId || !permission) {
      return res.status(400).json({ message: '请指定协作者和权限' });
    }

    if (!['READ', 'EDIT'].includes(permission)) {
      return res.status(400).json({ message: '无效的权限值' });
    }

    // 验证项目所有者权限
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) {
      return res.status(404).json({ message: '项目不存在或无权访问' });
    }

    // 验证目标用户是项目协作者
    const share = await prisma.projectShare.findFirst({
      where: { projectId, targetUserId },
    });

    if (!share) {
      return res.status(400).json({ message: '该用户不是项目协作者' });
    }

    // 验证剧集存在
    const episode = await prisma.episode.findFirst({
      where: { id: episodeId, projectId },
    });

    if (!episode) {
      return res.status(404).json({ message: '剧集不存在' });
    }

    // 更新或创建权限记录
    if (permission === 'READ') {
      // READ是默认权限，删除记录即可
      await prisma.episodePermission.deleteMany({
        where: { episodeId, userId: targetUserId },
      });
    } else {
      // EDIT权限需要创建或更新记录
      await prisma.episodePermission.upsert({
        where: { episodeId_userId: { episodeId, userId: targetUserId } },
        create: { episodeId, userId: targetUserId, permission: 'EDIT' },
        update: { permission: 'EDIT' },
      });
    }

    res.json({ success: true, message: '权限更新成功' });
  } catch (error) {
    console.error('Update episode permission error:', error);
    res.status(500).json({ message: '更新权限失败' });
  }
};
