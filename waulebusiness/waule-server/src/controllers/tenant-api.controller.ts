/**
 * 租户用户 API 控制器
 * 所有操作使用租户积分，数据隔离到租户
 */
import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import { prisma } from '../index';
import { asyncHandler } from '../middleware/errorHandler';
import { generatePresignedUrl, uploadBuffer, TenantUploadInfo } from '../utils/oss';

// ==================== 辅助函数 ====================

/**
 * 扣除租户积分
 */
async function deductTenantCredits(
  tenantId: string,
  amount: number,
  operation: string,
  userId: string,
  description?: string
): Promise<boolean> {
  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { credits: true },
    });

    if (!tenant || tenant.credits < amount) {
      return false;
    }

    // 扣除积分
    await tx.tenant.update({
      where: { id: tenantId },
      data: { credits: { decrement: amount } },
    });

    // 记录使用
    await tx.tenantUsageRecord.create({
      data: {
        tenantId,
        userId,
        modelId: operation, // 使用 operation 作为 modelId
        operation,
        creditsCharged: amount,
        metadata: { description },
      },
    });

    // 记录积分流水
    await tx.tenantCreditLog.create({
      data: {
        tenantId,
        amount: -amount,
        balance: tenant.credits - amount,
        type: 'USAGE',
        description: description || operation,
      },
    });

    return true;
  });

  return result;
}

/**
 * 检查租户积分是否足够
 */
async function checkTenantCredits(tenantId: string, amount: number): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { credits: true },
  });
  return tenant ? tenant.credits >= amount : false;
}

// ==================== 项目管理 ====================

export const getProjects = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { type, page = '1', limit = '20' } = req.query;

  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);
  const skip = (pageNum - 1) * limitNum;

  // 查询该租户用户创建的项目
  const where: any = {
    tenantId: tenantUser.tenantId,
    tenantUserId: tenantUser.id,
  };
  if (type) {
    where.type = type;
  }

  const [projects, total] = await Promise.all([
    prisma.tenantProject.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.tenantProject.count({ where }),
  ]);

  res.json({
    success: true,
    data: projects,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

export const createProject = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const tenantUser = req.tenantUser!;
  const { name, description, type = 'QUICK', thumbnail } = req.body;

  const project = await prisma.tenantProject.create({
    data: {
      tenantId: tenantUser.tenantId,
      tenantUserId: tenantUser.id,
      name,
      description,
      type,
      thumbnail,
    },
  });

  res.status(201).json({ success: true, data: project });
});

export const getProject = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { id } = req.params;

  const project = await prisma.tenantProject.findFirst({
    where: {
      id,
      tenantId: tenantUser.tenantId,
    },
  });

  if (!project) {
    return res.status(404).json({ success: false, message: '项目不存在' });
  }

  res.json({ success: true, data: project });
});

export const updateProject = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { id } = req.params;
  const { name, description, status, thumbnail } = req.body;

  const project = await prisma.tenantProject.findFirst({
    where: { id, tenantId: tenantUser.tenantId },
  });

  if (!project) {
    return res.status(404).json({ success: false, message: '项目不存在' });
  }

  // 只有项目创建者可以修改
  if (project.tenantUserId !== tenantUser.id && !tenantUser.isAdmin) {
    return res.status(403).json({ success: false, message: '无权修改此项目' });
  }

  const updated = await prisma.tenantProject.update({
    where: { id },
    data: { name, description, status, thumbnail },
  });

  res.json({ success: true, data: updated });
});

export const deleteProject = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { id } = req.params;

  const project = await prisma.tenantProject.findFirst({
    where: { id, tenantId: tenantUser.tenantId },
    include: { workflows: true },
  });

  if (!project) {
    return res.status(404).json({ success: false, message: '项目不存在' });
  }

  if (project.tenantUserId !== tenantUser.id && !tenantUser.isAdmin) {
    return res.status(403).json({ success: false, message: '无权删除此项目' });
  }

  // 获取项目所有工作流中的节点ID
  const allNodeIds: string[] = [];
  for (const wf of project.workflows) {
    const nodes = wf.nodes as any[];
    if (Array.isArray(nodes)) {
      for (const node of nodes) {
        if (node.id) allNodeIds.push(node.id);
      }
    }
  }

  // 将关联的已完成任务标记为已删除（移入回收站）
  if (allNodeIds.length > 0) {
    const now = new Date().toISOString();
    await prisma.tenantTask.updateMany({
      where: {
        tenantId: tenantUser.tenantId,
        sourceNodeId: { in: allNodeIds },
        status: 'SUCCESS',
      },
      data: {
        output: {
          // 注意：updateMany 不支持 JSON 合并，这里用原始 SQL 或分批处理
        },
      },
    });

    // 使用事务分批更新任务的 output
    const tasks = await prisma.tenantTask.findMany({
      where: {
        tenantId: tenantUser.tenantId,
        sourceNodeId: { in: allNodeIds },
        status: 'SUCCESS',
      },
    });

    for (const task of tasks) {
      const existingOutput = (task.output as any) || {};
      await prisma.tenantTask.update({
        where: { id: task.id },
        data: {
          output: {
            ...existingOutput,
            deletedAt: now,
            deletedFrom: 'project',
            originalProjectId: id,
            originalProjectName: project.name,
          },
        },
      });
    }
  }

  await prisma.tenantProject.delete({ where: { id } });

  res.json({ success: true, message: '项目已删除，资产已移入回收站' });
});

// ==================== 剧集管理 ====================

export const getEpisodes = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { projectId } = req.params;

  // 验证项目属于当前租户
  const project = await prisma.tenantProject.findFirst({
    where: { id: projectId, tenantId: tenantUser.tenantId },
  });

  if (!project) {
    return res.status(404).json({ success: false, message: '项目不存在' });
  }

  const episodes = await prisma.tenantEpisode.findMany({
    where: { projectId },
    orderBy: { order: 'asc' },
  });

  // 映射字段名以匹配前端期望
  const mappedEpisodes = episodes.map(ep => ({
    id: ep.id,
    projectId: ep.projectId,
    name: ep.title, // title -> name
    description: ep.description,
    episodeNumber: ep.order, // order -> episodeNumber
    status: ep.status,
    createdAt: ep.createdAt,
    updatedAt: ep.updatedAt,
    thumbnail: ep.thumbnail,
  }));

  res.json({ success: true, data: mappedEpisodes });
});

export const createEpisode = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const tenantUser = req.tenantUser!;
  const { projectId } = req.params;
  const { title, description, order, thumbnail } = req.body;

  const project = await prisma.tenantProject.findFirst({
    where: { id: projectId, tenantId: tenantUser.tenantId },
  });

  if (!project) {
    return res.status(404).json({ success: false, message: '项目不存在' });
  }

  // 获取当前最大 order
  const maxOrder = await prisma.tenantEpisode.aggregate({
    where: { projectId },
    _max: { order: true },
  });

  const episode = await prisma.tenantEpisode.create({
    data: {
      projectId,
      title,
      description,
      order: order ?? (maxOrder._max.order ?? 0) + 1,
      thumbnail,
    },
  });

  // 映射返回字段以匹配前端期望
  res.status(201).json({
    success: true,
    data: {
      id: episode.id,
      projectId: episode.projectId,
      name: episode.title,
      description: episode.description,
      episodeNumber: episode.order,
      status: episode.status,
      thumbnail: episode.thumbnail,
      createdAt: episode.createdAt,
      updatedAt: episode.updatedAt,
    },
  });
});

export const getEpisode = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { projectId, episodeId } = req.params;

  const project = await prisma.tenantProject.findFirst({
    where: { id: projectId, tenantId: tenantUser.tenantId },
  });

  if (!project) {
    return res.status(404).json({ success: false, message: '项目不存在' });
  }

  const episode = await prisma.tenantEpisode.findFirst({
    where: { id: episodeId, projectId },
  });

  if (!episode) {
    return res.status(404).json({ success: false, message: '剧集不存在' });
  }

  // 检查权限：是否是项目所有者或协作者
  const isOwner = project.tenantUserId === tenantUser.id;
  let canEdit = isOwner;
  
  if (!isOwner) {
    // 检查是否是协作者
    const collab = await prisma.tenantProjectCollaborator.findUnique({
      where: {
        projectId_tenantUserId: {
          projectId,
          tenantUserId: tenantUser.id,
        },
      },
    });
    if (collab) {
      canEdit = collab.permission === 'EDIT';
    }
  }

  // 映射返回字段以匹配前端期望
  res.json({
    success: true,
    data: {
      id: episode.id,
      projectId: episode.projectId,
      name: episode.title,
      description: episode.description,
      episodeNumber: episode.order,
      status: episode.status,
      thumbnail: episode.thumbnail,
      createdAt: episode.createdAt,
      updatedAt: episode.updatedAt,
      scriptJson: (episode as any).scriptJson, // 包含分镜脚本数据
      isOwner,
      canEdit,
    },
  });
});

export const updateEpisode = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { projectId, episodeId } = req.params;
  const { title, description, order, status, thumbnail, scriptJson } = req.body;

  const project = await prisma.tenantProject.findFirst({
    where: { id: projectId, tenantId: tenantUser.tenantId },
  });

  if (!project) {
    return res.status(404).json({ success: false, message: '项目不存在' });
  }

  // 构建更新数据，只包含传入的字段
  const updateData: any = {};
  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (order !== undefined) updateData.order = order;
  if (status !== undefined) updateData.status = status;
  if (thumbnail !== undefined) updateData.thumbnail = thumbnail;
  if (scriptJson !== undefined) updateData.scriptJson = scriptJson;

  const episode = await prisma.tenantEpisode.update({
    where: { id: episodeId },
    data: updateData,
  });

  // 映射返回字段以匹配前端期望
  res.json({
    success: true,
    data: {
      id: episode.id,
      projectId: episode.projectId,
      name: episode.title,
      description: episode.description,
      episodeNumber: episode.order,
      status: episode.status,
      thumbnail: episode.thumbnail,
      createdAt: episode.createdAt,
      updatedAt: episode.updatedAt,
    },
  });
});

export const deleteEpisode = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { projectId, episodeId } = req.params;

  const project = await prisma.tenantProject.findFirst({
    where: { id: projectId, tenantId: tenantUser.tenantId },
  });

  if (!project) {
    return res.status(404).json({ success: false, message: '项目不存在' });
  }

  await prisma.tenantEpisode.delete({ where: { id: episodeId } });

  res.json({ success: true, message: '剧集已删除' });
});

// ==================== 工作流管理 ====================

export const getOrCreateProjectWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { projectId } = req.params;

  const project = await prisma.tenantProject.findFirst({
    where: { id: projectId, tenantId: tenantUser.tenantId },
  });

  if (!project) {
    return res.status(404).json({ success: false, message: '项目不存在' });
  }

  let workflow = await prisma.tenantWorkflow.findFirst({
    where: { projectId, episodeId: null },
    include: {
      collaborators: { select: { id: true } },
    },
  });

  if (!workflow) {
    workflow = await prisma.tenantWorkflow.create({
      data: {
        projectId,
        tenantId: tenantUser.tenantId,
        tenantUserId: tenantUser.id,
        name: project.name,
        nodes: [],
        edges: [],
      },
      include: {
        collaborators: { select: { id: true } },
      },
    });
  }

  // 检查权限
  const isOwner = workflow.tenantUserId === tenantUser.id;
  let canEdit = isOwner;
  let permission = 'EDIT';
  
  if (!isOwner) {
    const collab = await prisma.tenantWorkflowCollaborator.findUnique({
      where: {
        workflowId_tenantUserId: {
          workflowId: workflow.id,
          tenantUserId: tenantUser.id,
        },
      },
    });
    if (!collab) {
      return res.status(403).json({ success: false, message: '无权访问此工作流' });
    }
    permission = collab.permission || 'READ';
    canEdit = permission === 'EDIT';
  }

  // 返回与平台版兼容的格式（客户端期望 data.nodes 和 data.edges）
  res.json({
    success: true,
    data: {
      id: workflow.id,
      projectId: workflow.projectId,
      episodeId: workflow.episodeId,
      name: workflow.name,
      data: {
        nodes: workflow.nodes || [],
        edges: workflow.edges || [],
        nodeGroups: (workflow as any).nodeGroups || [],
      },
      viewport: workflow.viewport,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      // 权限信息
      currentUserId: tenantUser.id,
      isOwner,
      canEdit,
      permission,
      hasCollaborators: workflow.collaborators.length > 0,
    },
  });
});

export const getOrCreateEpisodeWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { projectId, episodeId } = req.params;

  // 查找项目（不限制 tenantId，协作者可能来自其他租户）
  const project = await prisma.tenantProject.findFirst({
    where: { id: projectId },
    include: {
      collaborators: true,
    },
  });

  if (!project) {
    return res.status(404).json({ success: false, message: '项目不存在' });
  }

  // 检查项目级别权限
  const isProjectOwner = project.tenantUserId === tenantUser.id;
  const projectCollab = project.collaborators.find(c => c.tenantUserId === tenantUser.id);
  
  if (!isProjectOwner && !projectCollab) {
    return res.status(403).json({ success: false, message: '无权访问此项目' });
  }

  const episode = await prisma.tenantEpisode.findFirst({
    where: { id: episodeId, projectId },
  });

  if (!episode) {
    return res.status(404).json({ success: false, message: '剧集不存在' });
  }

  let workflow = await prisma.tenantWorkflow.findFirst({
    where: { projectId, episodeId, scene: null, shot: null },
    include: {
      collaborators: { select: { id: true } },
    },
  });

  if (!workflow) {
    // 项目所有者或有编辑权限的协作者可以创建工作流
    const canCreate = isProjectOwner || projectCollab?.permission === 'EDIT';
    if (!canCreate) {
      return res.status(403).json({ success: false, message: '无权创建工作流' });
    }
    workflow = await prisma.tenantWorkflow.create({
      data: {
        projectId,
        episodeId,
        scene: null,
        shot: null,
        tenantId: tenantUser.tenantId,
        tenantUserId: project.tenantUserId, // 使用项目所有者作为工作流所有者
        name: episode.title,
        nodes: [],
        edges: [],
      },
      include: {
        collaborators: { select: { id: true } },
      },
    });
  }

  // 权限：项目所有者拥有完整权限，协作者根据项目协作权限决定
  const isOwner = isProjectOwner;
  let permission = isProjectOwner ? 'EDIT' : (projectCollab?.permission || 'READ');
  let canEdit = permission === 'EDIT';

  // 返回与平台版兼容的格式
  // 使用项目级别的协作者来判断是否有协作者
  const hasCollaborators = project.collaborators.length > 0;

  res.json({
    success: true,
    data: {
      id: workflow.id,
      projectId: workflow.projectId,
      episodeId: workflow.episodeId,
      name: workflow.name,
      data: {
        nodes: workflow.nodes || [],
        edges: workflow.edges || [],
        nodeGroups: (workflow as any).nodeGroups || [],
      },
      viewport: workflow.viewport,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      // 权限信息
      currentUserId: tenantUser.id,
      isOwner,
      canEdit,
      permission,
      hasCollaborators,
    },
  });
});

export const saveProjectWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { projectId } = req.params;
  const { nodes, edges, nodeGroups, viewport } = req.body;

  const project = await prisma.tenantProject.findFirst({
    where: { id: projectId, tenantId: tenantUser.tenantId },
  });

  if (!project) {
    return res.status(404).json({ success: false, message: '项目不存在' });
  }

  // 使用 findFirst + update/create 因为 episodeId 为 null 时 upsert 不工作
  let workflow = await prisma.tenantWorkflow.findFirst({
    where: { projectId, episodeId: null },
  });

  if (workflow) {
    workflow = await prisma.tenantWorkflow.update({
      where: { id: workflow.id },
      data: {
        nodes: nodes || [],
        edges: edges || [],
        nodeGroups: nodeGroups || [],
        viewport: viewport || {},
      },
    });
  } else {
    workflow = await prisma.tenantWorkflow.create({
      data: {
        projectId,
        tenantId: tenantUser.tenantId,
        tenantUserId: tenantUser.id,
        name: project.name,
        nodes: nodes || [],
        edges: edges || [],
        nodeGroups: nodeGroups || [],
        viewport: viewport || {},
      },
    });
  }

  res.json({
    success: true,
    data: {
      id: workflow.id,
      projectId: workflow.projectId,
      episodeId: workflow.episodeId,
      name: workflow.name,
      data: {
        nodes: workflow.nodes || [],
        edges: workflow.edges || [],
        nodeGroups: workflow.nodeGroups || [],
      },
      viewport: workflow.viewport,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    },
  });
});

/**
 * 获取工作流列表
 */
export const getWorkflows = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { includeShared } = req.query;

  // 获取自己的工作流
  const ownWorkflows = await prisma.tenantWorkflow.findMany({
    where: {
      tenantId: tenantUser.tenantId,
      tenantUserId: tenantUser.id,
    },
    include: {
      project: { select: { id: true, name: true, thumbnail: true } },
      collaborators: { select: { id: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const ownWorkflowsFormatted = ownWorkflows.map(w => ({
    ...w,
    isOwner: true,
    isShared: false,
    hasCollaborators: w.collaborators.length > 0,
    collaborators: undefined as undefined, // 不返回协作者详情
  }));

  let result: any[] = ownWorkflowsFormatted;

  // 如果需要包含共享给我的工作流
  if (includeShared === 'true') {
    const sharedCollaborations = await prisma.tenantWorkflowCollaborator.findMany({
      where: { tenantUserId: tenantUser.id },
      include: {
        workflow: {
          include: {
            project: { select: { id: true, name: true, thumbnail: true } },
          },
        },
      },
    });

    // 获取共享者信息
    const ownerIds = [...new Set(sharedCollaborations.map(c => c.workflow.tenantUserId))];
    const owners = await prisma.tenantUser.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, username: true, nickname: true, avatar: true },
    });
    const ownerMap = new Map(owners.map(o => [o.id, o]));

    const sharedWorkflows = sharedCollaborations.map(c => ({
      ...c.workflow,
      isOwner: false,
      isShared: true,
      hasCollaborators: false,
      permission: c.permission,
      shareInfo: {
        owner: ownerMap.get(c.workflow.tenantUserId),
        sharedAt: c.createdAt,
      },
    }));

    result = [...result, ...sharedWorkflows];
  }

  res.json({ success: true, data: result });
});

/**
 * 获取单个工作流（支持协作者访问）
 */
export const getWorkflowById = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { workflowId } = req.params;

  // 查找工作流
  const workflow = await prisma.tenantWorkflow.findFirst({
    where: {
      id: workflowId,
      tenantId: tenantUser.tenantId,
    },
    include: {
      project: { select: { id: true, name: true, thumbnail: true } },
      collaborators: { select: { id: true } }, // 用于判断是否有协作者
    },
  });

  if (!workflow) {
    return res.status(404).json({ success: false, message: '工作流不存在' });
  }

  // 检查权限：是创建者、协作者或管理员
  const isOwner = workflow.tenantUserId === tenantUser.id;
  const isAdmin = tenantUser.isAdmin;
  
  if (!isOwner && !isAdmin) {
    // 检查是否是协作者
    const collaboration = await prisma.tenantWorkflowCollaborator.findUnique({
      where: {
        workflowId_tenantUserId: {
          workflowId,
          tenantUserId: tenantUser.id,
        },
      },
    });

    if (!collaboration) {
      return res.status(403).json({ success: false, message: '无权访问此工作流' });
    }
  }

  // 获取协作者权限信息（如果是协作者或管理员）
  let permission = 'EDIT'; // 创建者默认有编辑权限
  if (!isOwner) {
    if (isAdmin) {
      // 管理员只有只读权限
      permission = 'READ';
    } else {
      const collab = await prisma.tenantWorkflowCollaborator.findUnique({
        where: {
          workflowId_tenantUserId: {
            workflowId,
            tenantUserId: tenantUser.id,
          },
        },
      });
      permission = collab?.permission || 'READ';
    }
  }

  // 获取工作流所有者信息（如果是协作者或管理员访问）
  let shareInfo = undefined;
  if (!isOwner) {
    const owner = await prisma.tenantUser.findUnique({
      where: { id: workflow.tenantUserId },
      select: { id: true, username: true, nickname: true, avatar: true },
    });
    if (isAdmin) {
      // 管理员查看模式
      shareInfo = {
        owner,
        sharedAt: new Date(),
        isAdminView: true,
      };
    } else {
      const collab = await prisma.tenantWorkflowCollaborator.findUnique({
        where: {
          workflowId_tenantUserId: {
            workflowId,
            tenantUserId: tenantUser.id,
          },
        },
      });
      shareInfo = {
        owner,
        sharedAt: collab?.createdAt,
      };
    }
  }

  // 返回与平台版兼容的格式（客户端期望 data.nodes 和 data.edges）
  res.json({
    success: true,
    data: {
      id: workflow.id,
      projectId: workflow.projectId,
      episodeId: workflow.episodeId,
      name: workflow.name,
      description: workflow.project?.name,
      data: {
        nodes: workflow.nodes || [],
        edges: workflow.edges || [],
        nodeGroups: (workflow as any).nodeGroups || [],
      },
      viewport: workflow.viewport || { x: 0, y: 0, zoom: 1 },
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      currentUserId: tenantUser.id, // 当前用户ID，用于前端判断节点所有权
      isOwner,
      canEdit: isOwner || permission === 'EDIT',
      permission,
      shareInfo,
      hasCollaborators: workflow.collaborators.length > 0, // 是否有协作者（用于启用 WebSocket）
    },
  });
});

/**
 * 更新工作流（直接访问模式，支持有编辑权限的协作者保存）
 */
export const updateWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { workflowId } = req.params;
  const { data } = req.body;

  // 查找工作流
  const workflow = await prisma.tenantWorkflow.findFirst({
    where: {
      id: workflowId,
      tenantId: tenantUser.tenantId,
    },
  });

  if (!workflow) {
    return res.status(404).json({ success: false, message: '工作流不存在' });
  }

  // 检查权限：是创建者或有编辑权限的协作者
  const isOwner = workflow.tenantUserId === tenantUser.id;
  
  if (!isOwner) {
    const collaboration = await prisma.tenantWorkflowCollaborator.findUnique({
      where: {
        workflowId_tenantUserId: {
          workflowId,
          tenantUserId: tenantUser.id,
        },
      },
    });

    if (!collaboration || collaboration.permission !== 'EDIT') {
      return res.status(403).json({ success: false, message: '无权修改此工作流' });
    }
  }

  // 更新工作流
  const updated = await prisma.tenantWorkflow.update({
    where: { id: workflowId },
    data: {
      nodes: data?.nodes || [],
      edges: data?.edges || [],
      nodeGroups: data?.nodeGroups || [],
      viewport: data?.viewport || {},
      updatedAt: new Date(),
    },
  });

  res.json({ success: true, data: updated });
});

export const saveEpisodeWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { projectId, episodeId } = req.params;
  const { nodes, edges, nodeGroups, viewport } = req.body;

  // 查找项目并包含协作者
  const project = await prisma.tenantProject.findFirst({
    where: { id: projectId },
    include: {
      collaborators: true,
    },
  });

  if (!project) {
    return res.status(404).json({ success: false, message: '项目不存在' });
  }

  // 检查权限：必须是项目所有者或有编辑权限的协作者
  const isProjectOwner = project.tenantUserId === tenantUser.id;
  const projectCollab = project.collaborators.find(c => c.tenantUserId === tenantUser.id);
  const canEdit = isProjectOwner || projectCollab?.permission === 'EDIT';

  if (!canEdit) {
    return res.status(403).json({ success: false, message: '无权编辑此工作流' });
  }

  const episode = await prisma.tenantEpisode.findFirst({
    where: { id: episodeId, projectId },
  });

  if (!episode) {
    return res.status(404).json({ success: false, message: '剧集不存在' });
  }

  // 查找剧集级别的工作流（scene 和 shot 为 null）
  let workflow = await prisma.tenantWorkflow.findFirst({
    where: {
      projectId,
      episodeId,
      scene: null,
      shot: null,
    },
  });

  if (workflow) {
    // 更新现有工作流
    workflow = await prisma.tenantWorkflow.update({
      where: { id: workflow.id },
      data: {
        nodes: nodes || [],
        edges: edges || [],
        nodeGroups: nodeGroups || [],
        viewport: viewport || {},
      },
    });
  } else {
    // 创建新工作流
    workflow = await prisma.tenantWorkflow.create({
      data: {
        projectId,
        episodeId,
        scene: null,
        shot: null,
        tenantId: project.tenantId,
        tenantUserId: project.tenantUserId,
        name: episode.title,
        nodes: nodes || [],
        edges: edges || [],
        nodeGroups: nodeGroups || [],
        viewport: viewport || {},
      },
    });
  }

  res.json({
    success: true,
    data: {
      id: workflow.id,
      projectId: workflow.projectId,
      episodeId: workflow.episodeId,
      name: workflow.name,
      data: {
        nodes: workflow.nodes || [],
        edges: workflow.edges || [],
        nodeGroups: workflow.nodeGroups || [],
      },
      viewport: workflow.viewport,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    },
  });
});

// 获取/创建镜头工作流
export const getOrCreateShotWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { projectId, episodeId } = req.params;
  const scene = Number(req.query.scene as string);
  const shot = Number(req.query.shot as string);

  if (!Number.isFinite(scene) || scene <= 0 || !Number.isFinite(shot) || shot <= 0) {
    return res.status(400).json({ success: false, message: '无效的分镜参数' });
  }

  // 查找项目并包含协作者
  const project = await prisma.tenantProject.findFirst({
    where: { id: projectId },
    include: { collaborators: true },
  });

  if (!project) {
    return res.status(404).json({ success: false, message: '项目不存在' });
  }

  // 检查项目级别权限
  const isProjectOwner = project.tenantUserId === tenantUser.id;
  const projectCollab = project.collaborators.find(c => c.tenantUserId === tenantUser.id);
  
  if (!isProjectOwner && !projectCollab) {
    return res.status(403).json({ success: false, message: '无权访问此项目' });
  }

  const episode = await prisma.tenantEpisode.findFirst({
    where: { id: episodeId, projectId },
  });

  if (!episode) {
    return res.status(404).json({ success: false, message: '剧集不存在' });
  }

  let workflow = await prisma.tenantWorkflow.findFirst({
    where: { projectId, episodeId, scene, shot },
    include: { collaborators: { select: { id: true } } },
  });

  if (!workflow) {
    // 项目所有者或有编辑权限的协作者可以创建工作流
    const canCreate = isProjectOwner || projectCollab?.permission === 'EDIT';
    if (!canCreate) {
      return res.status(403).json({ success: false, message: '无权创建工作流' });
    }
    workflow = await prisma.tenantWorkflow.create({
      data: {
        projectId,
        episodeId,
        scene,
        shot,
        tenantId: tenantUser.tenantId,
        tenantUserId: project.tenantUserId, // 使用项目所有者作为工作流所有者
        name: `${episode.title} - 第${scene}幕第${shot}镜`,
        nodes: [],
        edges: [],
      },
      include: { collaborators: { select: { id: true } } },
    });
  }

  // 权限：项目所有者拥有完整权限，协作者根据项目协作权限决定
  const isOwner = isProjectOwner;
  const permission = isProjectOwner ? 'EDIT' : (projectCollab?.permission || 'READ');
  const canEdit = permission === 'EDIT';
  const hasCollaborators = project.collaborators.length > 0;

  res.json({
    success: true,
    data: {
      id: workflow.id,
      projectId: workflow.projectId,
      episodeId: workflow.episodeId,
      scene: workflow.scene,
      shot: workflow.shot,
      name: workflow.name,
      data: {
        nodes: workflow.nodes || [],
        edges: workflow.edges || [],
        nodeGroups: (workflow as any).nodeGroups || [],
      },
      viewport: workflow.viewport,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      currentUserId: tenantUser.id,
      isOwner,
      canEdit,
      permission,
      hasCollaborators,
    },
  });
});

// 保存镜头工作流
export const saveShotWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { projectId, episodeId } = req.params;
  const scene = Number(req.query.scene as string);
  const shot = Number(req.query.shot as string);
  const { nodes, edges, nodeGroups, viewport } = req.body;

  if (!Number.isFinite(scene) || scene <= 0 || !Number.isFinite(shot) || shot <= 0) {
    return res.status(400).json({ success: false, message: '无效的分镜参数' });
  }

  // 查找项目并包含协作者
  const project = await prisma.tenantProject.findFirst({
    where: { id: projectId },
    include: { collaborators: true },
  });

  if (!project) {
    return res.status(404).json({ success: false, message: '项目不存在' });
  }

  // 检查权限：必须是项目所有者或有编辑权限的协作者
  const isProjectOwner = project.tenantUserId === tenantUser.id;
  const projectCollab = project.collaborators.find(c => c.tenantUserId === tenantUser.id);
  const canEdit = isProjectOwner || projectCollab?.permission === 'EDIT';

  if (!canEdit) {
    return res.status(403).json({ success: false, message: '无权编辑此工作流' });
  }

  const episode = await prisma.tenantEpisode.findFirst({
    where: { id: episodeId, projectId },
  });

  if (!episode) {
    return res.status(404).json({ success: false, message: '剧集不存在' });
  }

  const workflow = await prisma.tenantWorkflow.upsert({
    where: {
      projectId_episodeId_scene_shot: { projectId, episodeId, scene, shot },
    },
    create: {
      projectId,
      episodeId,
      scene,
      shot,
      tenantId: project.tenantId,
      tenantUserId: project.tenantUserId,
      name: `${episode.title} - 第${scene}幕第${shot}镜`,
      nodes: nodes || [],
      edges: edges || [],
      nodeGroups: nodeGroups || [],
      viewport: viewport || {},
    },
    update: {
      nodes: nodes || [],
      edges: edges || [],
      nodeGroups: nodeGroups || [],
      viewport: viewport || {},
    },
  });

  res.json({
    success: true,
    data: {
      id: workflow.id,
      projectId: workflow.projectId,
      episodeId: workflow.episodeId,
      scene: workflow.scene,
      shot: workflow.shot,
      name: workflow.name,
      data: {
        nodes: workflow.nodes || [],
        edges: workflow.edges || [],
        nodeGroups: (workflow as any).nodeGroups || [],
      },
      viewport: workflow.viewport,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    },
  });
});

// ==================== 资产管理 ====================

export const getAssets = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { page = '1', limit = '20', type } = req.query;

  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {
    tenantId: tenantUser.tenantId,
    tenantUserId: tenantUser.id,
  };
  if (type) {
    where.type = type;
  }

  const [assets, total] = await Promise.all([
    prisma.tenantAsset.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.tenantAsset.count({ where }),
  ]);

  res.json({
    success: true,
    data: assets,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

export const getPresignedUrl = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { fileName, contentType } = req.body;

  // 获取文件扩展名
  const ext = path.extname(fileName || '') || '.bin';
  
  // 构建租户上传信息：目录结构为 tenantId/userId/年/月/文件名
  const tenantInfo: TenantUploadInfo = {
    tenantId: tenantUser.tenantId,
    userId: tenantUser.id,
  };
  
  // 调用 OSS 获取预签名 URL（带租户路径）
  const result = await generatePresignedUrl(ext, contentType || 'application/octet-stream', tenantInfo);
  
  res.json({
    success: true,
    data: result,
  });
});

export const confirmUpload = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { objectKey, publicUrl, fileName, contentType, size } = req.body;

  const asset = await prisma.tenantAsset.create({
    data: {
      tenantId: tenantUser.tenantId,
      tenantUserId: tenantUser.id,
      name: fileName,
      type: contentType.startsWith('image/') ? 'IMAGE' :
            contentType.startsWith('video/') ? 'VIDEO' :
            contentType.startsWith('audio/') ? 'AUDIO' : 'OTHER',
      url: publicUrl,
      size,
      mimeType: contentType,
    },
  });

  res.json({ success: true, data: asset });
});

/**
 * 服务器中转上传（回退方案）
 * 目录结构：tenantId/userId/年/月/文件名
 */
export const uploadAsset = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  
  // 构建租户上传信息
  const tenantInfo: TenantUploadInfo = {
    tenantId: tenantUser.tenantId,
    userId: tenantUser.id,
  };
  
  // 使用 multer 或直接从 req 获取文件
  const file = (req as any).file;
  if (!file) {
    // 尝试从 body 获取 base64 数据
    const { fileData, fileName, contentType } = req.body;
    if (!fileData) {
      return res.status(400).json({ success: false, message: '未提供文件' });
    }
    
    // 解析 base64
    const buffer = Buffer.from(fileData.replace(/^data:[^;]+;base64,/, ''), 'base64');
    const ext = path.extname(fileName || '') || '.bin';
    
    // 上传到 OSS（带租户路径）
    const url = await uploadBuffer(buffer, ext, tenantInfo);
    
    // 创建资产记录
    const asset = await prisma.tenantAsset.create({
      data: {
        tenantId: tenantUser.tenantId,
        tenantUserId: tenantUser.id,
        name: fileName || 'uploaded-file',
        type: (contentType || '').startsWith('image/') ? 'IMAGE' :
              (contentType || '').startsWith('video/') ? 'VIDEO' :
              (contentType || '').startsWith('audio/') ? 'AUDIO' : 'OTHER',
        url,
        size: buffer.length,
        mimeType: contentType,
      },
    });
    
    return res.json({ success: true, data: asset });
  }
  
  // multer 上传的文件
  const ext = path.extname(file.originalname || '') || '.bin';
  const url = await uploadBuffer(file.buffer, ext, tenantInfo);
  
  const asset = await prisma.tenantAsset.create({
    data: {
      tenantId: tenantUser.tenantId,
      tenantUserId: tenantUser.id,
      name: file.originalname || 'uploaded-file',
      type: (file.mimetype || '').startsWith('image/') ? 'IMAGE' :
            (file.mimetype || '').startsWith('video/') ? 'VIDEO' :
            (file.mimetype || '').startsWith('audio/') ? 'AUDIO' : 'OTHER',
      url,
      size: file.size,
      mimeType: file.mimetype,
    },
  });
  
  res.json({ success: true, data: asset });
});

export const deleteAsset = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { id } = req.params;

  const asset = await prisma.tenantAsset.findFirst({
    where: { id, tenantId: tenantUser.tenantId },
    include: { library: true },
  });

  if (!asset) {
    return res.status(404).json({ success: false, message: '资产不存在' });
  }

  // 只有资产库的所有者或管理员才能删除资产（协作者不能删除）
  const isLibraryOwner = asset.library?.tenantUserId === tenantUser.id;
  if (!isLibraryOwner && !tenantUser.isAdmin) {
    return res.status(403).json({ success: false, message: '只有资产库所有者才能删除资产' });
  }

  await prisma.tenantAsset.delete({ where: { id } });

  res.json({ success: true, message: '资产已删除' });
});

export const updateAsset = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { id } = req.params;
  const { name } = req.body;

  const asset = await prisma.tenantAsset.findFirst({
    where: { id, tenantId: tenantUser.tenantId },
  });

  if (!asset) {
    return res.status(404).json({ success: false, message: '资产不存在' });
  }

  if (asset.tenantUserId !== tenantUser.id && !tenantUser.isAdmin) {
    return res.status(403).json({ success: false, message: '无权修改此资产' });
  }

  const updated = await prisma.tenantAsset.update({
    where: { id },
    data: { name },
  });

  res.json({ success: true, data: updated });
});

/**
 * 代理下载（解决 CORS 问题）
 */
export const proxyDownload = asyncHandler(async (req: Request, res: Response) => {
  const { url } = req.query;
  
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, message: '缺少 URL 参数' });
  }

  const axios = require('axios');
  
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000,
    });
    
    const contentType = response.headers['content-type'] || 'application/octet-stream';
    res.set('Content-Type', contentType);
    res.send(response.data);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: '下载失败: ' + error.message });
  }
});

/**
 * 服务器转存（前端转存失败时的回退）
 * 转存的文件保存到租户目录：tenantId/userId/年/月/文件名
 */
export const transferUrl = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ success: false, message: '缺少 URL 参数' });
  }

  const { ensureAliyunOssUrl } = require('../utils/oss');
  
  // 构建租户上传信息
  const tenantInfo: TenantUploadInfo = {
    tenantId: tenantUser.tenantId,
    userId: tenantUser.id,
  };
  
  try {
    const ossUrl = await ensureAliyunOssUrl(url, tenantInfo);
    res.json({ success: true, data: { url: ossUrl } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: '转存失败: ' + error.message });
  }
});

// ==================== 资产库管理 ====================

export const getAssetLibraries = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { includeShared, category } = req.query;

  // 私有模式：返回自己创建的资产库
  const whereCondition: any = { 
    tenantId: tenantUser.tenantId,
    tenantUserId: tenantUser.id,
  };
  
  if (category && category !== 'ALL') {
    whereCondition.category = category;
  }

  const ownLibraries = await prisma.tenantAssetLibrary.findMany({
    where: whereCondition,
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: {
        select: { assets: true },
      },
    },
  });

  // 标记为所有者
  const ownLibrariesWithFlag = ownLibraries.map(lib => ({
    ...lib,
    isOwner: true,
    isShared: false,
  }));

  // 如果需要包含共享的资产库
  if (includeShared === 'true') {
    const sharedCollaborations = await prisma.tenantAssetLibraryCollaborator.findMany({
      where: { tenantUserId: tenantUser.id },
      include: {
        library: {
          include: {
            _count: { select: { assets: true } },
          },
        },
      },
    });

    // 获取共享者信息
    const ownerIds = [...new Set(sharedCollaborations.map(c => c.library.tenantUserId))];
    const owners = await prisma.tenantUser.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, username: true, nickname: true, avatar: true },
    });
    const ownerMap = new Map(owners.map(o => [o.id, o]));

    const sharedLibraries = sharedCollaborations
      .filter(c => !category || category === 'ALL' || c.library.category === category)
      .map(c => {
        const owner = ownerMap.get(c.library.tenantUserId);
        return {
          ...c.library,
          isOwner: false,
          isShared: true,
          shareInfo: {
            canDownload: c.canDownload,
            sharedAt: c.createdAt.toISOString(),
            owner: owner ? { id: owner.id, nickname: owner.nickname, avatar: owner.avatar } : null,
          },
        };
      });

    // 合并自己的和共享的，自己的在前
    res.json({ success: true, data: [...ownLibrariesWithFlag, ...sharedLibraries] });
  } else {
    res.json({ success: true, data: ownLibrariesWithFlag });
  }
});

export const createAssetLibrary = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { name, description, category, thumbnail } = req.body;

  const library = await prisma.tenantAssetLibrary.create({
    data: {
      tenantId: tenantUser.tenantId,
      tenantUserId: tenantUser.id,
      name,
      description,
      category,
      thumbnail,
    },
  });

  res.status(201).json({ success: true, data: library });
});

export const getAssetLibrary = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { id } = req.params;

  const library = await prisma.tenantAssetLibrary.findFirst({
    where: { id, tenantId: tenantUser.tenantId },
  });

  if (!library) {
    return res.status(404).json({ success: false, message: '资产库不存在' });
  }

  // 检查访问权限：是所有者或协作者
  const isOwner = library.tenantUserId === tenantUser.id;
  if (!isOwner && !tenantUser.isAdmin) {
    const collaboration = await prisma.tenantAssetLibraryCollaborator.findUnique({
      where: { libraryId_tenantUserId: { libraryId: id, tenantUserId: tenantUser.id } },
    });
    
    if (!collaboration) {
      return res.status(403).json({ success: false, message: '无权访问此资产库' });
    }
  }

  res.json({ success: true, data: library });
});

export const updateAssetLibrary = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { id } = req.params;
  const { name, description, thumbnail } = req.body;  // 移除 category，不允许修改类别

  const library = await prisma.tenantAssetLibrary.findFirst({
    where: { id, tenantId: tenantUser.tenantId },
  });

  if (!library) {
    return res.status(404).json({ success: false, message: '资产库不存在' });
  }

  // 只有所有者或管理员可以修改资产库
  if (library.tenantUserId !== tenantUser.id && !tenantUser.isAdmin) {
    return res.status(403).json({ success: false, message: '只有资产库所有者才能修改' });
  }

  const updated = await prisma.tenantAssetLibrary.update({
    where: { id },
    data: { name, description, thumbnail },  // 不更新 category
  });

  res.json({ success: true, data: updated });
});

export const deleteAssetLibrary = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { id } = req.params;

  const library = await prisma.tenantAssetLibrary.findFirst({
    where: { id, tenantId: tenantUser.tenantId },
    include: { assets: true },
  });

  if (!library) {
    return res.status(404).json({ success: false, message: '资产库不存在' });
  }

  // 只有资产库所有者或管理员才能删除
  if (library.tenantUserId !== tenantUser.id && !tenantUser.isAdmin) {
    return res.status(403).json({ success: false, message: '只有资产库所有者才能删除' });
  }

  // 将资产库中的资产移入回收站（标记删除信息到 metadata）
  if (library.assets.length > 0) {
    const now = new Date().toISOString();
    for (const asset of library.assets) {
      const existingMetadata = (asset.metadata as any) || {};
      await prisma.tenantAsset.update({
        where: { id: asset.id },
        data: {
          libraryId: null,
          metadata: {
            ...existingMetadata,
            deletedAt: now,
            deletedFrom: 'library',
            originalLibraryId: id,
            originalLibraryName: library.name,
          },
        },
      });
    }
  }

  await prisma.tenantAssetLibrary.delete({ where: { id } });

  res.json({ success: true, message: '资产库已删除，资产已移入回收站' });
});

export const getAssetLibraryAssets = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { id } = req.params;

  const library = await prisma.tenantAssetLibrary.findFirst({
    where: { id, tenantId: tenantUser.tenantId },
  });

  if (!library) {
    return res.status(404).json({ success: false, message: '资产库不存在' });
  }

  // 检查访问权限：是所有者或协作者
  const isOwner = library.tenantUserId === tenantUser.id;
  let isCollaborator = false;
  let canDownload = false;

  if (!isOwner) {
    const collaboration = await prisma.tenantAssetLibraryCollaborator.findUnique({
      where: { libraryId_tenantUserId: { libraryId: id, tenantUserId: tenantUser.id } },
    });
    
    if (!collaboration && !tenantUser.isAdmin) {
      return res.status(403).json({ success: false, message: '无权访问此资产库' });
    }
    
    isCollaborator = !!collaboration;
    canDownload = collaboration?.canDownload ?? false;
  } else {
    canDownload = true;  // 所有者默认可下载
  }

  const assets = await prisma.tenantAsset.findMany({
    where: { libraryId: id },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ 
    success: true, 
    data: assets,
    permissions: {
      isOwner,
      isCollaborator,
      canDownload,
      canDelete: isOwner || tenantUser.isAdmin,  // 只有所有者或管理员可删除
    }
  });
});

// 辅助函数：从 MIME 类型获取扩展名
function getExtensionFromMimeType(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'application/pdf': '.pdf',
  };
  return mimeMap[mimeType] || '.bin';
}

// 辅助函数：从 MIME 类型获取资产类型
function getAssetTypeFromMimeType(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (mimeType.startsWith('audio/')) return 'AUDIO';
  return 'OTHER';
}

/**
 * 上传文件到资产库
 */
export const uploadAssetToLibrary = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { id } = req.params;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ success: false, message: '缺少文件' });
  }

  // 验证资产库存在且属于当前租户
  const library = await prisma.tenantAssetLibrary.findFirst({
    where: { id, tenantId: tenantUser.tenantId },
  });

  if (!library) {
    return res.status(404).json({ success: false, message: '资产库不存在' });
  }

  // 检查权限：必须是所有者
  if (library.tenantUserId !== tenantUser.id && !tenantUser.isAdmin) {
    return res.status(403).json({ success: false, message: '只有资产库所有者才能上传资产' });
  }

  const tenantInfo: TenantUploadInfo = {
    tenantId: tenantUser.tenantId,
    userId: tenantUser.id,
  };

  // 解码文件名（处理中文乱码）
  let decodedName = file.originalname;
  try {
    decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
  } catch {
    // 如果解码失败，尝试 URI 解码
    try {
      decodedName = decodeURIComponent(file.originalname);
    } catch {
      decodedName = file.originalname;
    }
  }

  // 上传到 OSS
  const ext = path.extname(decodedName) || '.bin';
  const fileUrl = await uploadBuffer(file.buffer, ext, tenantInfo);

  // 确定资产类型
  const assetType = getAssetTypeFromMimeType(file.mimetype);

  // 去除文件扩展名作为显示名称
  const displayName = decodedName.replace(/\.[^/.]+$/, '');

  // 保存到数据库
  const asset = await prisma.tenantAsset.create({
    data: {
      tenantId: tenantUser.tenantId,
      tenantUserId: tenantUser.id,
      libraryId: id,
      name: displayName,
      mimeType: file.mimetype,
      size: file.size,
      url: fileUrl,
      type: assetType,
    },
  });

  res.json({ success: true, data: asset });
});

/**
 * 从URL添加资产到资产库
 */
export const addAssetFromUrl = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { id } = req.params;
  const { url, name } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, message: '缺少资源URL' });
  }

  // 验证资产库存在且属于当前租户
  const library = await prisma.tenantAssetLibrary.findFirst({
    where: { id, tenantId: tenantUser.tenantId },
  });

  if (!library) {
    return res.status(404).json({ success: false, message: '资产库不存在' });
  }

  const tenantInfo: TenantUploadInfo = {
    tenantId: tenantUser.tenantId,
    userId: tenantUser.id,
  };

  // 判断URL类型：base64 / 远程URL
  const isBase64 = url.startsWith('data:');
  const isExternalUrl = url.startsWith('http://') || url.startsWith('https://');
  let fileUrl: string;
  let mimeType: string;
  let fileSize: number = 0;
  let originalName: string;

  if (isBase64) {
    // 处理base64数据
    const matches = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ success: false, message: 'Invalid base64 format' });
    }
    
    mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    fileSize = buffer.length;
    
    const ext = getExtensionFromMimeType(mimeType);
    originalName = `ai-generated${ext}`;
    
    // 上传到 OSS（使用租户路径）
    fileUrl = await uploadBuffer(buffer, ext, tenantInfo);
  } else if (isExternalUrl) {
    // 下载远程文件
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 120000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    mimeType = response.headers['content-type'] || 'application/octet-stream';
    fileSize = Buffer.from(response.data).length;

    // 从URL提取文件名
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    originalName = pathParts[pathParts.length - 1].split('?')[0] || `asset-${Date.now()}`;

    const ext = path.extname(originalName) || getExtensionFromMimeType(mimeType);
    
    // 上传到 OSS（使用租户路径）
    fileUrl = await uploadBuffer(Buffer.from(response.data), ext, tenantInfo);
  } else {
    return res.status(400).json({ success: false, message: '不支持的URL格式' });
  }

  // 确定资产类型
  const assetType = getAssetTypeFromMimeType(mimeType);

  // 保存到数据库
  const asset = await prisma.tenantAsset.create({
    data: {
      tenantId: tenantUser.tenantId,
      tenantUserId: tenantUser.id,
      libraryId: id,
      name: name?.trim() || originalName,
      mimeType,
      size: fileSize,
      url: fileUrl,
      type: assetType,
    },
  });

  res.json({ success: true, data: asset });
});

// ==================== AI 服务 ====================

/**
 * 获取 AI 模型列表
 */
export const getAIModels = asyncHandler(async (req: Request, res: Response) => {
  const { provider, isActive, type } = req.query;

  const where: any = {};
  if (provider) {
    where.provider = provider;
  }
  if (isActive === 'true') {
    where.isActive = true;
  }
  if (type) {
    where.type = type;
  }

  const models = await prisma.aIModel.findMany({
    where,
    orderBy: [{ provider: 'asc' }, { name: 'asc' }],
  });

  res.json({ success: true, data: models });
});

export const generateText = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { modelId, prompt, systemPrompt, temperature, maxTokens, imageUrls, videoUrls } = req.body;

  // 检查积分
  const creditCost = 1; // 文本生成每次 1 积分
  const hasCredits = await checkTenantCredits(tenantUser.tenantId, creditCost);
  if (!hasCredits) {
    return res.status(402).json({ success: false, message: '积分不足' });
  }

  try {
    // 如果 modelId 是 UUID，从数据库查找实际的模型标识符
    let actualModelId = modelId || 'gemini-2.5-pro';
    if (modelId && modelId.includes('-') && modelId.length > 30) {
      const model = await prisma.aIModel.findUnique({ where: { id: modelId } });
      if (model) {
        actualModelId = model.modelId;
        console.log(`[TenantAPI] 模型 UUID ${modelId} -> ${actualModelId}`);
      }
    }

    // 调用 Gemini 服务生成文本
    const { generateText: geminiGenerateText } = await import('../services/ai/gemini.service');
    
    const text = await geminiGenerateText({
      prompt: prompt || '',
      systemPrompt: systemPrompt || '',
      modelId: actualModelId,
      temperature: temperature || 0.7,
      maxTokens: maxTokens || 8192,
      imageUrls: imageUrls || [],
      videoUrls: videoUrls || [],
    });

    // 扣除积分
    await deductTenantCredits(
      tenantUser.tenantId,
      creditCost,
      'TEXT_GENERATE',
      tenantUser.id,
      `文本生成 - ${modelId}`
    );

    res.json({
      success: true,
      data: {
        text,
        usage: { credits: creditCost },
      },
    });
  } catch (error: any) {
    console.error('[TenantAPI] 文本生成失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '文本生成失败',
    });
  }
});

export const generateImage = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { modelId, prompt, ratio, referenceImages } = req.body;

  // 检查积分
  const creditCost = 10; // 图片生成每次 10 积分
  const hasCredits = await checkTenantCredits(tenantUser.tenantId, creditCost);
  if (!hasCredits) {
    return res.status(402).json({ success: false, message: '积分不足' });
  }

  // TODO: 调用实际的 AI 图片生成服务

  // 扣除积分
  await deductTenantCredits(
    tenantUser.tenantId,
    creditCost,
    'IMAGE_GENERATE',
    tenantUser.id,
    `图片生成 - ${modelId}`
  );

  res.json({
    success: true,
    data: {
      imageUrl: 'https://example.com/generated-image.png',
      usage: { credits: creditCost },
    },
  });
});

export const generateVideo = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { modelId, prompt, ratio, duration, referenceImages } = req.body;

  // 检查积分
  const creditCost = 50; // 视频生成每次 50 积分
  const hasCredits = await checkTenantCredits(tenantUser.tenantId, creditCost);
  if (!hasCredits) {
    return res.status(402).json({ success: false, message: '积分不足' });
  }

  // TODO: 调用实际的 AI 视频生成服务

  // 扣除积分
  await deductTenantCredits(
    tenantUser.tenantId,
    creditCost,
    'VIDEO_GENERATE',
    tenantUser.id,
    `视频生成 - ${modelId}`
  );

  res.json({
    success: true,
    data: {
      videoUrl: 'https://example.com/generated-video.mp4',
      usage: { credits: creditCost },
    },
  });
});

export const synthesizeAudio = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { modelId, voiceId, text } = req.body;

  // 检查积分
  const creditCost = 5; // 语音合成每次 5 积分
  const hasCredits = await checkTenantCredits(tenantUser.tenantId, creditCost);
  if (!hasCredits) {
    return res.status(402).json({ success: false, message: '积分不足' });
  }

  // TODO: 调用实际的语音合成服务

  // 扣除积分
  await deductTenantCredits(
    tenantUser.tenantId,
    creditCost,
    'AUDIO_SYNTHESIZE',
    tenantUser.id,
    `语音合成 - ${modelId}`
  );

  res.json({
    success: true,
    data: {
      audioUrl: 'https://example.com/synthesized-audio.mp3',
      usage: { credits: creditCost },
    },
  });
});

/**
 * 获取用户语音列表
 */
export const getVoices = asyncHandler(async (req: Request, res: Response) => {
  // 租户版暂不支持自定义语音
  res.json({ success: true, data: [] });
});

/**
 * 添加用户语音
 */
export const addVoice = asyncHandler(async (req: Request, res: Response) => {
  // 租户版暂不支持自定义语音
  res.json({ success: true, data: null, message: '租户版暂不支持自定义语音' });
});

/**
 * 获取语音预设列表
 */
export const getVoicePresets = asyncHandler(async (req: Request, res: Response) => {
  // 租户版暂不支持语音预设
  res.json({ success: true, data: [] });
});

/**
 * 创建自定义语音
 */
export const createVoice = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { modelId, targetModel, prefix, url, promptUrl, promptText, voiceId, previewText } = req.body;
  
  // TODO: 调用实际的语音克隆服务
  
  res.json({
    success: true,
    data: {
      voiceId: `custom_${Date.now()}`,
      status: 'processing',
    },
  });
});

/**
 * 查询语音创建状态
 */
export const getVoiceStatus = asyncHandler(async (req: Request, res: Response) => {
  const { voiceId, modelId } = req.query;
  
  // TODO: 查询实际的语音状态
  
  res.json({
    success: true,
    data: {
      voiceId,
      status: 'completed',
    },
  });
});

/**
 * 设计语音
 */
export const designVoice = asyncHandler(async (req: Request, res: Response) => {
  const { modelId, prompt, preview_text, voice_id, aigc_watermark } = req.body;
  
  // TODO: 调用实际的语音设计服务
  
  res.json({
    success: true,
    data: {
      voiceId: voice_id || `design_${Date.now()}`,
      previewUrl: 'https://example.com/preview.mp3',
    },
  });
});

/**
 * 商业视频生成
 */
export const commercialVideo = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { images, prompt, duration, ratio, language, apiKey, apiUrl } = req.body;

  // 检查积分
  const creditCost = 100; // 商业视频每次 100 积分
  const hasCredits = await checkTenantCredits(tenantUser.tenantId, creditCost);
  if (!hasCredits) {
    return res.status(402).json({ success: false, message: '积分不足' });
  }

  // TODO: 调用实际的商业视频生成服务

  // 扣除积分
  await deductTenantCredits(
    tenantUser.tenantId,
    creditCost,
    'COMMERCIAL_VIDEO',
    tenantUser.id,
    '商业视频生成'
  );

  res.json({
    success: true,
    taskId: `task_${Date.now()}`,
    creditsCharged: creditCost,
  });
});

/**
 * 视频超清
 */
export const videoUpscale = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { video_url, upscale_resolution, apiKey, apiUrl } = req.body;

  // 检查积分
  const creditCost = 30; // 视频超清每次 30 积分
  const hasCredits = await checkTenantCredits(tenantUser.tenantId, creditCost);
  if (!hasCredits) {
    return res.status(402).json({ success: false, message: '积分不足' });
  }

  // TODO: 调用实际的视频超清服务

  // 扣除积分
  await deductTenantCredits(
    tenantUser.tenantId,
    creditCost,
    'VIDEO_UPSCALE',
    tenantUser.id,
    '视频超清'
  );

  res.json({
    success: true,
    taskId: `task_${Date.now()}`,
    creditsCharged: creditCost,
  });
});

// ==================== 任务管理 ====================

export const createImageTask = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { modelId, prompt, ratio, imageSize, referenceImages, sourceNodeId, metadata } = req.body;

  if (!modelId) {
    return res.status(400).json({ error: '缺少模型ID' });
  }

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: '提示词是必需的' });
  }

  try {
    const { tenantTaskService } = await import('../services/tenant-task.service');
    
    const task = await tenantTaskService.createTask({
      tenantId: tenantUser.tenantId,
      tenantUserId: tenantUser.id,
      type: 'IMAGE',
      modelId,
      prompt,
      ratio: ratio || '1:1',
      imageSize,
      referenceImages: referenceImages || [],
      sourceNodeId,
      metadata,
    });

    res.status(201).json({
      success: true,
      taskId: task.id,
      status: task.status,
      creditsCharged: task.creditsCharged,
      isFreeUsage: false,
      freeUsageRemaining: 0,
    });
  } catch (error: any) {
    if (error.message?.includes('积分不足')) {
      return res.status(402).json({ success: false, error: error.message });
    }
    throw error;
  }
});

export const createVideoTask = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { modelId, prompt, ratio, referenceImages, roleIds, subjects, generationType, sourceNodeId, metadata } = req.body;
  const duration = req.body.duration || req.body.metadata?.duration;
  const resolution = req.body.resolution || req.body.metadata?.resolution;

  if (!modelId) {
    return res.status(400).json({ error: '缺少模型ID' });
  }

  try {
    const { tenantTaskService } = await import('../services/tenant-task.service');
    
    const task = await tenantTaskService.createTask({
      tenantId: tenantUser.tenantId,
      tenantUserId: tenantUser.id,
      type: 'VIDEO',
      modelId,
      prompt: prompt || '',
      ratio: ratio || '16:9',
      referenceImages: referenceImages || [],
      roleIds: roleIds || [],
      subjects: subjects || [],
      generationType: generationType || '文生视频',
      sourceNodeId,
      metadata: {
        ...(metadata || {}),
        duration,
        resolution,
      },
    });

    res.status(201).json({
      success: true,
      taskId: task.id,
      status: task.status,
      creditsCharged: task.creditsCharged,
      isFreeUsage: false,
      freeUsageRemaining: 0,
    });
  } catch (error: any) {
    if (error.message?.includes('积分不足')) {
      return res.status(402).json({ success: false, error: error.message });
    }
    throw error;
  }
});

export const getTaskStatus = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { taskId } = req.params;

  const task = await prisma.tenantTask.findFirst({
    where: { id: taskId, tenantId: tenantUser.tenantId },
  });

  if (!task) {
    return res.status(404).json({ success: false, message: '任务不存在' });
  }

  // 返回与平台版兼容的格式
  const output = task.output as any;
  
  // 如果已下载到本地且 OSS 已删除，优先返回本地 URL
  // 这确保页面刷新后不会尝试访问已删除的 OSS 文件
  const finalResultUrl = (output?.localDownloaded && output?.localUrl) 
    ? output.localUrl 
    : output?.resultUrl;
  
  res.json({
    success: true,
    task: {
      id: task.id,
      type: task.type,
      status: task.status,
      progress: task.status === 'SUCCESS' ? 100 : (task.status === 'PROCESSING' ? 50 : 0),
      resultUrl: finalResultUrl,
      previewNodeData: output ? {
        type: output.type,
        url: finalResultUrl,
        ratio: output.ratio,
        allImageUrls: output.allImageUrls,
      } : undefined,
      errorMessage: task.error,
      metadata: output,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
    },
  });
});

export const getUserTasks = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { limit = '10' } = req.query;

  const tasks = await prisma.tenantTask.findMany({
    where: { tenantUserId: tenantUser.id },
    take: parseInt(limit as string, 10),
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, data: tasks });
});

/**
 * 获取进行中的任务（用于页面刷新后恢复轮询）
 * 增强：同时返回最近完成但未创建预览节点的任务
 */
export const getActiveTask = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { sourceNodeId } = req.query;

  if (!sourceNodeId) {
    return res.status(400).json({ success: false, message: '缺少源节点ID' });
  }

  console.log(`[getActiveTask] 查询任务: tenantUserId=${tenantUser.id}, sourceNodeId=${sourceNodeId}`);

  // 1. 首先查询进行中的任务
  let task = await prisma.tenantTask.findFirst({
    where: {
      tenantUserId: tenantUser.id,
      sourceNodeId: sourceNodeId as string,
      status: { in: ['PENDING', 'PROCESSING'] },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      status: true,
      createdAt: true,
      output: true,
      previewNodeCreated: true,
    },
  });

  if (task) {
    console.log(`[getActiveTask] 找到进行中的任务: ${task.id}, 状态: ${task.status}`);
  } else {
    // 2. 如果没有进行中的任务，查询最近完成但未创建预览节点的任务（5分钟内）
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const successTask = await prisma.tenantTask.findFirst({
      where: {
        tenantUserId: tenantUser.id,
        sourceNodeId: sourceNodeId as string,
        status: 'SUCCESS',
        previewNodeCreated: false,
        completedAt: { gte: fiveMinutesAgo },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
        output: true,
        previewNodeCreated: true,
      },
    });

    if (successTask) {
      console.log(`[getActiveTask] 找到未创建预览节点的已完成任务: ${successTask.id}`);
      task = successTask;
    } else {
      // 调试：查看最近的任务状态
      const recentTask = await prisma.tenantTask.findFirst({
        where: {
          tenantUserId: tenantUser.id,
          sourceNodeId: sourceNodeId as string,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          createdAt: true,
          previewNodeCreated: true,
        },
      });
      console.log(`[getActiveTask] 没有可恢复的任务, 最近任务: ${recentTask ? `${recentTask.id} (${recentTask.status}, previewCreated=${recentTask.previewNodeCreated})` : '无'}`);
    }
  }

  res.json({
    success: true,
    task: task ? {
      id: task.id,
      type: task.type,
      status: task.status,
      createdAt: task.createdAt,
      progress: task.status === 'PROCESSING' ? 50 : (task.status === 'SUCCESS' ? 100 : 0),
      // 如果是已完成的任务，返回 resultUrl
      resultUrl: task.status === 'SUCCESS' && task.output ? (task.output as any).resultUrl || (task.output as any).localUrl : undefined,
    } : null,
  });
});

/**
 * 获取待创建的预览节点（用于页面刷新后恢复）
 */
export const getPendingPreviewNodes = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { sourceNodeId } = req.query;

  if (!sourceNodeId) {
    return res.status(400).json({ success: false, message: '缺少源节点ID' });
  }

  // 查询已完成但未创建预览节点的任务
  const tasks = await prisma.tenantTask.findMany({
    where: {
      tenantUserId: tenantUser.id,
      sourceNodeId: sourceNodeId as string,
      status: 'SUCCESS',
      previewNodeCreated: false,
    },
    orderBy: { completedAt: 'asc' },
    select: {
      id: true,
      type: true,
      output: true,
    },
  });

  // 转换为前端期望的格式
  const previewNodes = tasks.map(task => {
    const output = task.output as any;
    return {
      taskId: task.id,
      type: task.type,
      previewNodeData: output ? {
        type: output.type,
        url: output.resultUrl,
        ratio: output.ratio,
        allImageUrls: output.allImageUrls,
      } : null,
    };
  }).filter(n => n.previewNodeData);

  res.json({
    success: true,
    previewNodes,
  });
});

/**
 * 标记预览节点已创建
 */
export const markPreviewNodeCreated = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { taskId } = req.params;

  const task = await prisma.tenantTask.findFirst({
    where: { id: taskId, tenantUserId: tenantUser.id },
  });

  if (!task) {
    return res.status(404).json({ success: false, message: '任务不存在' });
  }

  await prisma.tenantTask.update({
    where: { id: taskId },
    data: { previewNodeCreated: true },
  });

  res.json({ success: true });
});

// ==================== 代理 (Agents) ====================

/**
 * 获取代理列表
 */
export const getAgents = asyncHandler(async (req: Request, res: Response) => {
  // 获取系统代理列表（包含所有智能体，前端根据 isActive 筛选）
  const agents = await prisma.agent.findMany({
    orderBy: { name: 'asc' },
  });
  
  res.json({ success: true, data: agents });
});

/**
 * 获取代理详情
 */
export const getAgent = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const agent = await prisma.agent.findUnique({
    where: { id },
  });
  
  if (!agent) {
    return res.status(404).json({ success: false, message: '代理不存在' });
  }
  
  res.json({ success: true, data: agent });
});

/**
 * 获取指定智能体的角色列表
 */
export const getAgentRoles = asyncHandler(async (req: Request, res: Response) => {
  const { agentId } = req.params;
  
  const roles = await prisma.agentRole.findMany({
    where: { agentId },
    include: {
      aiModel: { select: { id: true, name: true, provider: true, modelId: true } },
    },
    orderBy: { order: 'asc' },
  });
  
  res.json(roles);
});

/**
 * 执行智能体角色（文本生成）
 */
export const executeAgentRole = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { id } = req.params;
  const { prompt, systemPrompt, temperature, maxTokens, documentFiles, imageUrls, videoUrls } = req.body || {};
  
  if (!prompt) {
    return res.status(400).json({ success: false, message: 'prompt 是必需的' });
  }

  const role = await prisma.agentRole.findUnique({
    where: { id },
    include: {
      aiModel: { select: { id: true, name: true, provider: true, modelId: true, apiKey: true, apiUrl: true, isActive: true, type: true, pricePerUse: true } },
      agent: { select: { id: true, name: true, isActive: true } },
    },
  });
  
  if (!role) {
    return res.status(404).json({ success: false, message: '角色不存在' });
  }
  
  const model = role.aiModel;
  if (!model) {
    return res.status(404).json({ success: false, message: 'AI 模型不存在' });
  }
  if (!model.isActive) {
    return res.status(400).json({ success: false, message: '模型未启用' });
  }
  if (model.type !== 'TEXT_GENERATION') {
    return res.status(400).json({ success: false, message: '该模型不支持文本生成' });
  }

  // 检查租户积分
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantUser.tenantId } });
  if (!tenant) {
    return res.status(404).json({ success: false, message: '租户不存在' });
  }
  
  const cost = Number(model.pricePerUse || 0);
  if (Number(tenant.credits) < cost) {
    return res.status(400).json({ success: false, message: '积分不足' });
  }

  const mergedSystemPromptRaw = [role.systemPrompt || '', systemPrompt || ''].filter(Boolean).join('\n\n');
  const trim = (s: string, max: number) => (s || '').length > max ? (s || '').slice(0, max) : (s || '');
  const mergedSystemPrompt = trim(mergedSystemPromptRaw, 8000);
  const promptTrimmed = trim(String(prompt), 12000);

  let text: string;
  try {
    switch ((model.provider || '').toLowerCase()) {
      case 'google': {
        const { generateText } = await import('../services/ai/gemini.service');
        text = await generateText({
          prompt: promptTrimmed,
          systemPrompt: mergedSystemPrompt,
          modelId: model.modelId,
          temperature: temperature ?? role.temperature ?? 0,
          maxTokens: maxTokens ?? role.maxTokens ?? 2000,
          documentFiles,
          imageUrls,
          videoUrls,
          apiKey: model.apiKey || undefined,
          apiUrl: model.apiUrl || undefined,
        });
        break;
      }
      case 'bytedance':
      case 'doubao': {
        const { generateText } = await import('../services/ai/doubao.service');
        text = await generateText({
          prompt: promptTrimmed,
          systemPrompt: mergedSystemPrompt,
          modelId: model.modelId,
          temperature: temperature ?? role.temperature ?? 0,
          maxTokens: maxTokens ?? role.maxTokens ?? 2000,
          imageUrls,
          videoUrls,
          apiKey: model.apiKey || undefined,
          apiUrl: model.apiUrl || undefined,
        });
        break;
      }
      default:
        return res.status(400).json({ success: false, message: `不支持的提供商: ${model.provider}` });
    }
    
    // 若返回空文本，尝试仅用JSON约束再次请求
    if (!text || !String(text).trim()) {
      const jsonConstraint = '请严格输出符合以下结构的JSON，不要包含多余文字：{"locale":"zh-CN","acts":[{"actIndex":1,"shots":[{"shotIndex":1,"画面":"...","景别/镜头":"...","内容/动作":"...","声音/对话":"...","时长":"6s","提示词":"...","media":{"type":"video","aspectRatio":"16:9","orientation":"horizontal"}}]}]}]}'
      switch ((model.provider || '').toLowerCase()) {
        case 'google': {
          const { generateText } = await import('../services/ai/gemini.service');
          text = await generateText({
            prompt: promptTrimmed,
            systemPrompt: jsonConstraint,
            modelId: model.modelId,
            temperature: 0,
            maxTokens: maxTokens ?? role.maxTokens ?? 2000,
            apiKey: model.apiKey || undefined,
            apiUrl: model.apiUrl || undefined,
          });
          break;
        }
        case 'bytedance':
        case 'doubao': {
          const { generateText } = await import('../services/ai/doubao.service');
          text = await generateText({
            prompt: promptTrimmed,
            systemPrompt: jsonConstraint,
            modelId: model.modelId,
            temperature: 0,
            maxTokens: maxTokens ?? role.maxTokens ?? 2000,
            apiKey: model.apiKey || undefined,
            apiUrl: model.apiUrl || undefined,
          });
          break;
        }
      }
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, message: `文本生成失败: ${err?.message || '未知错误'}` });
  }

  // 扣除积分
  await prisma.tenant.update({
    where: { id: tenantUser.tenantId },
    data: { credits: { decrement: cost } },
  });

  // 记录积分流水
  await prisma.tenantCreditLog.create({
    data: {
      tenantId: tenantUser.tenantId,
      type: 'CONSUME',
      amount: cost,
      balance: Number(tenant.credits) - cost,
      description: `智能体角色执行: ${role.name} (${model.name})`,
    },
  });

  res.json({ success: true, data: { text, model: model.name } });
});

/**
 * 创建分镜脚本任务
 * 同步执行并返回结果，结果保存到 TenantEpisode.scriptJson
 */
export const createStoryboardTask = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { projectId, episodeId, roleId, prompt, systemPrompt, temperature, attachments } = req.body;
  
  if (!projectId || !episodeId || !roleId) {
    return res.status(400).json({ success: false, message: '缺少必要参数' });
  }

  // 验证项目和剧集属于当前租户
  const project = await prisma.tenantProject.findFirst({
    where: { id: projectId, tenantId: tenantUser.tenantId },
  });
  if (!project) {
    return res.status(404).json({ success: false, message: '项目不存在' });
  }

  const episode = await prisma.tenantEpisode.findFirst({
    where: { id: episodeId, projectId },
  });
  if (!episode) {
    return res.status(404).json({ success: false, message: '剧集不存在' });
  }

  // 获取角色和模型
  const role = await prisma.agentRole.findUnique({
    where: { id: roleId },
    include: { aiModel: true },
  });
  if (!role || !role.aiModel) {
    return res.status(404).json({ success: false, message: '角色或模型不存在' });
  }
  if (!role.aiModel.isActive || role.aiModel.type !== 'TEXT_GENERATION') {
    return res.status(400).json({ success: false, message: '模型未启用或不支持文本生成' });
  }

  const model = role.aiModel;
  
  // 检查租户积分
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantUser.tenantId } });
  if (!tenant) {
    return res.status(404).json({ success: false, message: '租户不存在' });
  }
  
  const cost = Number(model.pricePerUse || 0);
  if (Number(tenant.credits) < cost) {
    return res.status(400).json({ success: false, message: '积分不足' });
  }

  // 创建任务记录
  const task = await prisma.tenantTask.create({
    data: {
      tenantId: tenantUser.tenantId,
      tenantUserId: tenantUser.id,
      type: 'STORYBOARD',
      status: 'PROCESSING',
      modelId: model.id,
      input: { prompt, systemPrompt, temperature, attachments, projectId, episodeId },
      creditsCost: cost,
    },
  });

  try {
    const mergedSystem = [role.systemPrompt || '', systemPrompt || ''].filter(Boolean).join('\n\n');
    const provider = (model.provider || '').toLowerCase();
    const temp = temperature ?? role.temperature ?? 0;

    console.log('[Storyboard] 开始生成分镜脚本:', {
      roleId,
      modelId: model.id,
      modelName: model.name,
      provider,
      hasApiKey: !!model.apiKey,
      hasApiUrl: !!model.apiUrl,
    });

    let text: string;
    if (provider === 'google') {
      const { generateText } = await import('../services/ai/gemini.service');
      text = await generateText({
        prompt: String(prompt || ''),
        systemPrompt: mergedSystem,
        modelId: model.modelId,
        temperature: temp,
        maxTokens: 32000,
        documentFiles: attachments?.documentFiles,
        imageUrls: attachments?.imageUrls,
        videoUrls: attachments?.videoUrls,
        apiKey: model.apiKey || undefined,
        apiUrl: model.apiUrl || undefined,
      });
    } else if (provider === 'bytedance' || provider === 'doubao') {
      const { generateText } = await import('../services/ai/doubao.service');
      text = await generateText({
        prompt: String(prompt || ''),
        systemPrompt: mergedSystem,
        modelId: model.modelId,
        temperature: temp,
        maxTokens: 4000,
        imageUrls: attachments?.imageUrls,
        videoUrls: attachments?.videoUrls,
        apiKey: model.apiKey || undefined,
        apiUrl: model.apiUrl || undefined,
      });
    } else {
      throw new Error(`不支持的文本生成提供商: ${provider}`);
    }

    // 解析为JSON
    console.log('[Storyboard] AI 返回文本长度:', text?.length, '前100字符:', text?.substring(0, 100));
    
    let json: any;
    try {
      json = JSON.parse(text);
      console.log('[Storyboard] JSON 直接解析成功');
    } catch (parseErr) {
      console.log('[Storyboard] JSON 直接解析失败，尝试提取:', parseErr);
      const m = /\{[\s\S]*\}/.exec(text || '');
      if (m) {
        json = JSON.parse(m[0]);
        console.log('[Storyboard] JSON 提取解析成功');
      }
    }
    
    if (!json || !Array.isArray(json.acts)) {
      console.error('[Storyboard] 返回数据结构不正确:', { hasJson: !!json, hasActs: !!json?.acts, isArray: Array.isArray(json?.acts) });
      throw new Error('返回数据不符合分镜脚本结构');
    }
    
    console.log('[Storyboard] 分镜脚本解析成功，场次数:', json.acts.length);

    // 保存到 TenantEpisode.scriptJson
    await prisma.tenantEpisode.update({
      where: { id: episodeId },
      data: { scriptJson: { acts: json.acts } },
    });

    // 更新任务状态
    await prisma.tenantTask.update({
      where: { id: task.id },
      data: { status: 'SUCCESS', output: { text, scriptJson: json }, completedAt: new Date() },
    });

    // 扣除积分
    await prisma.tenant.update({
      where: { id: tenantUser.tenantId },
      data: { credits: { decrement: cost } },
    });

    // 记录积分流水
    await prisma.tenantCreditLog.create({
      data: {
        tenantId: tenantUser.tenantId,
        type: 'CONSUME',
        amount: cost,
        balance: Number(tenant.credits) - cost,
        description: `分镜脚本生成 (任务: ${task.id.substring(0, 8)}...)`,
      },
    });

    res.json({ success: true, taskId: task.id, status: 'SUCCESS', scriptJson: json });
  } catch (err: any) {
    console.error('[Storyboard] 分镜脚本生成失败:', err);
    
    // 更新任务状态为失败
    await prisma.tenantTask.update({
      where: { id: task.id },
      data: { status: 'FAILURE', error: err?.message || '未知错误', completedAt: new Date() },
    });

    return res.status(500).json({ success: false, message: `分镜脚本生成失败: ${err?.message || '未知错误'}` });
  }
});

/**
 * 获取分镜脚本任务状态
 */
export const getStoryboardTaskStatus = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { taskId } = req.params;

  const task = await prisma.tenantTask.findFirst({
    where: { id: taskId, tenantUserId: tenantUser.id },
  });

  if (!task) {
    return res.status(404).json({ success: false, message: '任务不存在' });
  }

  res.json({
    success: true,
    data: {
      taskId: task.id,
      status: task.status,
      error: task.error,
      output: task.output,
    },
  });
});

// ==================== 计费相关 ====================

/**
 * 积分估算 - 使用 BillingRule 计费规则
 */
export const estimateCredits = asyncHandler(async (req: Request, res: Response) => {
  const { aiModelId, nodeType, moduleType, quantity = 1, duration, resolution, mode, operationType, characterCount } = req.body;
  
  // 使用 billingService 计算积分
  const { billingService } = await import('../services/billing.service');
  let credits = 0;
  
  try {
    credits = await billingService.calculateCredits({
      aiModelId,
      nodeType,
      moduleType,
      quantity,
      duration,
      resolution,
      mode,
      operationType,
      characterCount,
    });
  } catch (error: any) {
    console.warn('[estimateCredits] 计费规则计算失败:', error.message);
  }
  
  // 如果计费规则返回0，回退到模型默认价格或硬编码值
  if (credits === 0) {
    if (aiModelId) {
      const model = await prisma.aIModel.findUnique({ where: { id: aiModelId } });
      if (model) {
        credits = model.pricePerUse?.toNumber() || 1;
      }
    } else if (nodeType) {
      // 根据节点类型的默认值
      switch (nodeType) {
        case 'aiImage':
          credits = 5 * quantity;
          break;
        case 'aiVideo':
          credits = 50 * quantity;
          break;
        case 'aiAudio':
          credits = 3 * quantity;
          break;
        case 'aiText':
          credits = 1 * quantity;
          break;
        default:
          credits = 1 * quantity;
      }
    }
  }
  
  res.json({
    success: true,
    data: {
      credits,
      originalCredits: credits,
      isFreeUsage: false,
      freeUsageRemaining: 0,
    },
  });
});

// ==================== 用户信息 ====================

export const getCurrentUser = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;

  // 基础租户信息
  const tenantInfo: any = {
    id: tenantUser.tenant.id,
    name: tenantUser.tenant.name,
    credits: tenantUser.tenant.credits,
  };

  // 仅管理员可见 API Key
  if (tenantUser.isAdmin) {
    tenantInfo.apiKey = tenantUser.tenant.apiKey;
  }

  res.json({
    success: true,
    data: {
      user: {
        id: tenantUser.id,
        username: tenantUser.username,
        nickname: tenantUser.nickname,
        isAdmin: tenantUser.isAdmin,
      },
      tenant: tenantInfo,
    },
  });
});

/**
 * 检查昵称在租户内是否可用
 */
export const checkNickname = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { nickname } = req.query;

  if (!nickname || typeof nickname !== 'string') {
    return res.json({ success: true, available: false, message: '昵称不能为空' });
  }

  // 检查是否是自己当前的昵称
  if (nickname === tenantUser.nickname) {
    return res.json({ success: true, available: true });
  }

  // 检查在租户内是否已存在
  const existing = await prisma.tenantUser.findFirst({
    where: {
      tenantId: tenantUser.tenantId,
      nickname: nickname,
      id: { not: tenantUser.id },
    },
  });

  res.json({
    success: true,
    available: !existing,
    message: existing ? '该昵称已被使用' : undefined,
  });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { nickname, avatar } = req.body;

  // 如果要更新昵称，检查在租户内的唯一性
  if (nickname && nickname !== tenantUser.nickname) {
    const existing = await prisma.tenantUser.findFirst({
      where: {
        tenantId: tenantUser.tenantId,
        nickname: nickname,
        id: { not: tenantUser.id },
      },
    });
    if (existing) {
      return res.status(400).json({ success: false, message: '该昵称已被使用' });
    }
  }

  const updated = await prisma.tenantUser.update({
    where: { id: tenantUser.id },
    data: { nickname, avatar },
    select: { id: true, username: true, nickname: true, avatar: true },
  });

  res.json({ success: true, data: updated });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { oldPassword, newPassword } = req.body;

  const user = await prisma.tenantUser.findUnique({
    where: { id: tenantUser.id },
  });

  if (!user) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }

  const isValid = await bcrypt.compare(oldPassword, user.password);
  if (!isValid) {
    return res.status(400).json({ success: false, message: '原密码错误' });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.tenantUser.update({
    where: { id: tenantUser.id },
    data: { password: hashedPassword },
  });

  res.json({ success: true, message: '密码修改成功' });
});

// ==================== 用户搜索（共享功能） ====================

/**
 * 搜索租户用户（用于共享工作流、资产库）
 * 只返回本租户下的用户
 */
export const searchTenantUsers = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { query } = req.query;

  if (!query || typeof query !== 'string' || query.trim().length < 1) {
    return res.json({ success: true, data: [] });
  }

  const searchQuery = query.trim();

  // 只搜索本租户下的用户
  const users = await prisma.tenantUser.findMany({
    where: {
      tenantId: tenantUser.tenantId,
      id: { not: tenantUser.id }, // 排除自己
      OR: [
        { username: { contains: searchQuery, mode: 'insensitive' } },
        { nickname: { contains: searchQuery, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      username: true,
      nickname: true,
      avatar: true,
      isAdmin: true,
    },
    take: 10,
  });

  res.json({ success: true, data: users });
});

// ==================== 工作流协作者管理 ====================

/**
 * 获取工作流协作者列表
 */
export const getWorkflowCollaborators = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { workflowId } = req.params;

  // 验证工作流存在且属于当前租户
  const workflow = await prisma.tenantWorkflow.findFirst({
    where: { id: workflowId, tenantId: tenantUser.tenantId },
  });

  if (!workflow) {
    return res.status(404).json({ success: false, message: '工作流不存在' });
  }

  const collaborators = await prisma.tenantWorkflowCollaborator.findMany({
    where: { workflowId },
  });

  // 获取用户信息
  const userIds = collaborators.map(c => c.tenantUserId);
  const users = await prisma.tenantUser.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, nickname: true, avatar: true },
  });

  const userMap = new Map(users.map(u => [u.id, u]));
  const result = collaborators.map(c => {
    const user = userMap.get(c.tenantUserId);
    return {
      id: c.id,
      userId: c.tenantUserId,
      permission: c.permission,
      createdAt: c.createdAt,
      user: user || { id: c.tenantUserId, username: '未知用户', nickname: null, avatar: null },
      // 兼容前端字段
      username: user?.username || '未知用户',
      nickname: user?.nickname,
      avatar: user?.avatar,
    };
  });

  res.json({ success: true, data: result });
});

/**
 * 添加工作流协作者
 */
export const addWorkflowCollaborator = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { workflowId } = req.params;
  const { targetUserId, permission = 'READ' } = req.body;

  if (!targetUserId) {
    return res.status(400).json({ success: false, message: '缺少目标用户ID' });
  }

  // 验证工作流存在且是自己创建的
  const workflow = await prisma.tenantWorkflow.findFirst({
    where: { id: workflowId, tenantId: tenantUser.tenantId, tenantUserId: tenantUser.id },
  });

  if (!workflow) {
    return res.status(404).json({ success: false, message: '工作流不存在或无权限' });
  }

  // 验证目标用户存在且属于同一租户
  const targetUser = await prisma.tenantUser.findFirst({
    where: { id: targetUserId, tenantId: tenantUser.tenantId },
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: '目标用户不存在' });
  }

  // 不能添加自己
  if (targetUserId === tenantUser.id) {
    return res.status(400).json({ success: false, message: '不能添加自己为协作者' });
  }

  // 创建或更新协作者
  const collaborator = await prisma.tenantWorkflowCollaborator.upsert({
    where: { workflowId_tenantUserId: { workflowId, tenantUserId: targetUserId } },
    create: { workflowId, tenantUserId: targetUserId, permission },
    update: { permission },
  });

  res.json({ success: true, data: collaborator });
});

/**
 * 更新工作流协作者权限
 */
export const updateWorkflowCollaboratorPermission = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { workflowId, targetUserId } = req.params;
  const { permission } = req.body;

  if (!permission || !['READ', 'EDIT'].includes(permission)) {
    return res.status(400).json({ success: false, message: '无效的权限类型' });
  }

  // 验证工作流存在且是自己创建的
  const workflow = await prisma.tenantWorkflow.findFirst({
    where: { id: workflowId, tenantId: tenantUser.tenantId, tenantUserId: tenantUser.id },
  });

  if (!workflow) {
    return res.status(404).json({ success: false, message: '工作流不存在或无权限' });
  }

  const updated = await prisma.tenantWorkflowCollaborator.update({
    where: { workflowId_tenantUserId: { workflowId, tenantUserId: targetUserId } },
    data: { permission },
  });

  res.json({ success: true, data: updated });
});

/**
 * 移除工作流协作者
 */
export const removeWorkflowCollaborator = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { workflowId, targetUserId } = req.params;

  // 验证工作流存在且是自己创建的
  const workflow = await prisma.tenantWorkflow.findFirst({
    where: { id: workflowId, tenantId: tenantUser.tenantId, tenantUserId: tenantUser.id },
  });

  if (!workflow) {
    return res.status(404).json({ success: false, message: '工作流不存在或无权限' });
  }

  await prisma.tenantWorkflowCollaborator.delete({
    where: { workflowId_tenantUserId: { workflowId, tenantUserId: targetUserId } },
  });

  res.json({ success: true, message: '已移除协作者' });
});

/**
 * 获取共享给我的工作流
 */
export const getSharedWorkflows = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;

  // 找到我作为协作者的工作流
  const collaborations = await prisma.tenantWorkflowCollaborator.findMany({
    where: { tenantUserId: tenantUser.id },
    include: {
      workflow: {
        include: {
          project: { select: { id: true, name: true } },
        },
      },
    },
  });

  // 获取工作流创建者信息
  const ownerIds = [...new Set(collaborations.map(c => c.workflow.tenantUserId))];
  const owners = await prisma.tenantUser.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, username: true, nickname: true, avatar: true },
  });
  const ownerMap = new Map(owners.map(o => [o.id, o]));

  const result = collaborations.map(c => ({
    id: c.workflow.id,
    name: c.workflow.name,
    projectId: c.workflow.projectId,
    projectName: c.workflow.project.name,
    permission: c.permission,
    owner: ownerMap.get(c.workflow.tenantUserId),
    createdAt: c.workflow.createdAt,
    updatedAt: c.workflow.updatedAt,
  }));

  res.json({ success: true, data: result });
});

// ==================== 项目协作者管理 ====================

/**
 * 获取项目协作者列表
 */
export const getProjectCollaborators = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { projectId } = req.params;

  const project = await prisma.tenantProject.findFirst({
    where: { id: projectId, tenantId: tenantUser.tenantId },
  });

  if (!project) {
    return res.status(404).json({ success: false, message: '项目不存在' });
  }

  const collaborators = await prisma.tenantProjectCollaborator.findMany({
    where: { projectId },
  });

  const userIds = collaborators.map(c => c.tenantUserId);
  const users = await prisma.tenantUser.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, nickname: true, avatar: true },
  });

  const userMap = new Map(users.map(u => [u.id, u]));
  const result = collaborators.map(c => {
    const user = userMap.get(c.tenantUserId);
    return {
      id: c.id,
      userId: c.tenantUserId,
      permission: c.permission,
      createdAt: c.createdAt,
      user: user || { id: c.tenantUserId, username: '未知用户', nickname: null, avatar: null },
      username: user?.username || '未知用户',
      nickname: user?.nickname,
      avatar: user?.avatar,
    };
  });

  res.json({ success: true, data: result });
});

/**
 * 添加项目协作者
 */
export const addProjectCollaborator = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { projectId } = req.params;
  const { targetUserId, permission = 'READ' } = req.body;

  if (!targetUserId) {
    return res.status(400).json({ success: false, message: '缺少目标用户ID' });
  }

  const project = await prisma.tenantProject.findFirst({
    where: { id: projectId, tenantId: tenantUser.tenantId, tenantUserId: tenantUser.id },
  });

  if (!project) {
    return res.status(404).json({ success: false, message: '项目不存在或无权限' });
  }

  const targetUser = await prisma.tenantUser.findFirst({
    where: { id: targetUserId, tenantId: tenantUser.tenantId },
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: '目标用户不存在' });
  }

  if (targetUserId === tenantUser.id) {
    return res.status(400).json({ success: false, message: '不能添加自己为协作者' });
  }

  const collaborator = await prisma.tenantProjectCollaborator.upsert({
    where: { projectId_tenantUserId: { projectId, tenantUserId: targetUserId } },
    create: { projectId, tenantUserId: targetUserId, permission },
    update: { permission },
  });

  res.json({ success: true, data: collaborator });
});

/**
 * 更新项目协作者权限
 */
export const updateProjectCollaboratorPermission = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { projectId, targetUserId } = req.params;
  const { permission } = req.body;

  console.log('[updateProjectCollaboratorPermission] projectId:', projectId, 'targetUserId:', targetUserId, 'permission:', permission);

  if (!permission || !['READ', 'EDIT'].includes(permission)) {
    return res.status(400).json({ success: false, message: '无效的权限类型' });
  }

  const project = await prisma.tenantProject.findFirst({
    where: { id: projectId, tenantId: tenantUser.tenantId, tenantUserId: tenantUser.id },
  });

  if (!project) {
    return res.status(404).json({ success: false, message: '项目不存在或无权限' });
  }

  // 先检查协作者是否存在
  const existing = await prisma.tenantProjectCollaborator.findUnique({
    where: { projectId_tenantUserId: { projectId, tenantUserId: targetUserId } },
  });

  if (!existing) {
    return res.status(404).json({ success: false, message: '协作者不存在' });
  }

  const updated = await prisma.tenantProjectCollaborator.update({
    where: { projectId_tenantUserId: { projectId, tenantUserId: targetUserId } },
    data: { permission },
  });

  res.json({ success: true, data: updated });
});

/**
 * 移除项目协作者
 */
export const removeProjectCollaborator = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { projectId, targetUserId } = req.params;

  const project = await prisma.tenantProject.findFirst({
    where: { id: projectId, tenantId: tenantUser.tenantId, tenantUserId: tenantUser.id },
  });

  if (!project) {
    return res.status(404).json({ success: false, message: '项目不存在或无权限' });
  }

  await prisma.tenantProjectCollaborator.delete({
    where: { projectId_tenantUserId: { projectId, tenantUserId: targetUserId } },
  });

  res.json({ success: true, message: '已移除协作者' });
});

/**
 * 获取共享给我的项目
 */
export const getSharedProjects = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;

  const collaborations = await prisma.tenantProjectCollaborator.findMany({
    where: { tenantUserId: tenantUser.id },
    include: {
      project: true,
    },
  });

  const ownerIds = [...new Set(collaborations.map(c => c.project.tenantUserId))];
  const owners = await prisma.tenantUser.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, username: true, nickname: true, avatar: true },
  });
  const ownerMap = new Map(owners.map(o => [o.id, o]));

  const result = collaborations.map(c => ({
    ...c.project,
    permission: c.permission,
    owner: ownerMap.get(c.project.tenantUserId),
  }));

  res.json({ success: true, data: result });
});

// ==================== 资产库协作者管理 ====================

/**
 * 获取资产库协作者列表
 */
export const getAssetLibraryCollaborators = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { libraryId } = req.params;

  const library = await prisma.tenantAssetLibrary.findFirst({
    where: { id: libraryId, tenantId: tenantUser.tenantId },
  });

  if (!library) {
    return res.status(404).json({ success: false, message: '资产库不存在' });
  }

  const collaborators = await prisma.tenantAssetLibraryCollaborator.findMany({
    where: { libraryId },
  });

  const userIds = collaborators.map(c => c.tenantUserId);
  const users = await prisma.tenantUser.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, nickname: true, avatar: true },
  });

  const userMap = new Map(users.map(u => [u.id, u]));
  const result = collaborators.map(c => {
    const user = userMap.get(c.tenantUserId);
    return {
      id: c.id,
      userId: c.tenantUserId,
      canDownload: c.canDownload,
      createdAt: c.createdAt,
      user: user || { id: c.tenantUserId, username: '未知用户', nickname: null, avatar: null },
      username: user?.username || '未知用户',
      nickname: user?.nickname,
      avatar: user?.avatar,
    };
  });

  res.json({ success: true, data: result });
});

/**
 * 添加资产库协作者
 */
export const addAssetLibraryCollaborator = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { libraryId } = req.params;
  const { targetUserId, canDownload = true } = req.body;

  if (!targetUserId) {
    return res.status(400).json({ success: false, message: '缺少目标用户ID' });
  }

  const library = await prisma.tenantAssetLibrary.findFirst({
    where: { id: libraryId, tenantId: tenantUser.tenantId, tenantUserId: tenantUser.id },
  });

  if (!library) {
    return res.status(404).json({ success: false, message: '资产库不存在或无权限' });
  }

  const targetUser = await prisma.tenantUser.findFirst({
    where: { id: targetUserId, tenantId: tenantUser.tenantId },
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: '目标用户不存在' });
  }

  if (targetUserId === tenantUser.id) {
    return res.status(400).json({ success: false, message: '不能添加自己为协作者' });
  }

  const collaborator = await prisma.tenantAssetLibraryCollaborator.upsert({
    where: { libraryId_tenantUserId: { libraryId, tenantUserId: targetUserId } },
    create: { libraryId, tenantUserId: targetUserId, canDownload },
    update: { canDownload },
  });

  res.json({ success: true, data: collaborator });
});

/**
 * 移除资产库协作者
 */
export const removeAssetLibraryCollaborator = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { libraryId, targetUserId } = req.params;

  const library = await prisma.tenantAssetLibrary.findFirst({
    where: { id: libraryId, tenantId: tenantUser.tenantId, tenantUserId: tenantUser.id },
  });

  if (!library) {
    return res.status(404).json({ success: false, message: '资产库不存在或无权限' });
  }

  // 先检查协作者是否存在
  const collaborator = await prisma.tenantAssetLibraryCollaborator.findUnique({
    where: { libraryId_tenantUserId: { libraryId, tenantUserId: targetUserId } },
  });

  if (!collaborator) {
    return res.status(404).json({ success: false, message: '协作者不存在' });
  }

  await prisma.tenantAssetLibraryCollaborator.delete({
    where: { libraryId_tenantUserId: { libraryId, tenantUserId: targetUserId } },
  });

  res.json({ success: true, message: '已移除协作者' });
});

/**
 * 获取共享给我的资产库
 */
export const getSharedAssetLibraries = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;

  const collaborations = await prisma.tenantAssetLibraryCollaborator.findMany({
    where: { tenantUserId: tenantUser.id },
    include: {
      library: {
        include: {
          _count: { select: { assets: true } },
        },
      },
    },
  });

  const ownerIds = [...new Set(collaborations.map(c => c.library.tenantUserId))];
  const owners = await prisma.tenantUser.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, username: true, nickname: true, avatar: true },
  });
  const ownerMap = new Map(owners.map(o => [o.id, o]));

  const result = collaborations.map(c => ({
    ...c.library,
    canDownload: c.canDownload,
    owner: ownerMap.get(c.library.tenantUserId),
  }));

  res.json({ success: true, data: result });
});

// ==================== 本地存储支持 ====================

/**
 * 确认本地下载完成，删除 OSS 临时文件
 * 当租户服务端成功下载 AI 生成的文件后，调用此接口通知平台删除 OSS 临时文件
 * 支持两种模式：
 * 1. 通过 taskId 查找任务并删除 OSS 文件（标准流程）
 * 2. 直接提供 ossUrl 删除文件（用于 Midjourney 等非 TenantTask 的任务）
 */
export const confirmLocalDownload = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { taskId } = req.params;
  const { localUrl, ossUrl: directOssUrl } = req.body;

  console.log(`[confirmLocalDownload] 收到请求: taskId=${taskId}, tenantId=${tenantUser.tenantId}, directOssUrl=${directOssUrl?.substring(0, 50)}`);

  // 查找任务
  const task = await prisma.tenantTask.findFirst({
    where: {
      id: taskId,
      tenantId: tenantUser.tenantId,
    },
  });

  // 如果任务不存在，但提供了直接的 OSS URL，也尝试删除
  if (!task && !directOssUrl) {
    console.log(`[confirmLocalDownload] ❌ 任务不存在且未提供 ossUrl: taskId=${taskId}`);
    return res.status(404).json({ success: false, message: '任务不存在' });
  }

  // 获取要删除的 OSS URL（优先使用直接提供的 URL）
  const output = task?.output as any;
  const ossUrl = directOssUrl || output?.resultUrl || output?.ossUrl;
  
  console.log(`[confirmLocalDownload] 任务输出: resultUrl=${ossUrl?.substring(0, 80)}...`);

  if (!ossUrl) {
    console.log(`[confirmLocalDownload] ⚠️ OSS URL 不存在，无需删除`);
    return res.json({ success: true, message: 'OSS URL 不存在，无需删除' });
  }

  // 检查是否是 OSS URL
  if (!ossUrl.includes('aliyuncs.com')) {
    console.log(`[confirmLocalDownload] ⚠️ 非 OSS URL，无需删除: ${ossUrl.substring(0, 50)}`);
    return res.json({ success: true, message: '非 OSS URL，无需删除' });
  }

  try {
    // 删除 OSS 文件
    console.log(`[confirmLocalDownload] 🗑️ 正在删除 OSS 文件...`);
    const { deleteOssFile } = await import('../utils/oss');
    const deleted = await deleteOssFile(ossUrl);

    if (deleted) {
      console.log(`[confirmLocalDownload] ✅ OSS 文件已删除: ${ossUrl.substring(0, 80)}`);
      
      // 只有当任务存在时才更新任务记录并删除相关文件
      if (task) {
        await prisma.tenantTask.update({
          where: { id: taskId },
          data: {
            output: {
              ...output,
              localDownloaded: true,
              localDownloadedAt: new Date().toISOString(),
              localUrl: localUrl || undefined,
              ossDeleted: true,
            },
          },
        });

        // 如果是多图任务，检查是否有其他图片需要删除
        if (output?.allImageUrls && Array.isArray(output.allImageUrls)) {
          console.log(`[confirmLocalDownload] 处理多图任务: ${output.allImageUrls.length} 张图片`);
          for (const imgUrl of output.allImageUrls) {
            if (imgUrl && imgUrl.includes('aliyuncs.com') && imgUrl !== ossUrl) {
              await deleteOssFile(imgUrl);
              console.log(`[confirmLocalDownload] ✅ 多图文件已删除: ${imgUrl.substring(0, 80)}`);
            }
          }
        }
        
        // 删除参考素材（referenceImages）的 OSS 临时文件
        const input = task.input as any;
        if (input?.referenceImages && Array.isArray(input.referenceImages)) {
          console.log(`[confirmLocalDownload] 处理参考素材: ${input.referenceImages.length} 个文件`);
          for (const refUrl of input.referenceImages) {
            // 只删除 OSS 临时文件，跳过 base64 和本地文件
            if (refUrl && typeof refUrl === 'string' && refUrl.includes('aliyuncs.com')) {
              try {
                await deleteOssFile(refUrl);
                console.log(`[confirmLocalDownload] ✅ 参考素材已删除: ${refUrl.substring(0, 80)}`);
              } catch (err) {
                console.warn(`[confirmLocalDownload] ⚠️ 删除参考素材失败: ${refUrl.substring(0, 50)}`, err);
              }
            }
          }
        }
      } else {
        console.log(`[confirmLocalDownload] ℹ️ 任务不存在，仅删除 OSS 文件`);
      }

      res.json({ success: true, message: 'OSS 文件已删除' });
    } else {
      console.log(`[confirmLocalDownload] ⚠️ OSS 文件删除失败，可能已被删除`);
      res.json({ success: true, message: 'OSS 文件删除失败，可能已被删除' });
    }
  } catch (error: any) {
    console.error(`[confirmLocalDownload] ❌ 删除 OSS 文件失败:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 获取租户存储配置
 * 返回租户是否启用本地存储，以及本地服务端地址
 */
export const getTenantStorageConfig = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;

  // 获取租户信息
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantUser.tenantId },
    select: {
      id: true,
      name: true,
      storageConfig: true,
    },
  });

  if (!tenant) {
    return res.status(404).json({ success: false, message: '租户不存在' });
  }

  const storageConfig = tenant.storageConfig as any;

  res.json({
    success: true,
    data: {
      // 存储模式: 'OSS' | 'LOCAL'
      mode: storageConfig?.mode || 'OSS',
      // 本地服务端 URL（仅在 LOCAL 模式下有效）
      localServerUrl: storageConfig?.localServerUrl || null,
      // 是否已配置本地存储
      isLocalStorageConfigured: !!(storageConfig?.mode === 'LOCAL' && storageConfig?.localServerUrl),
    },
  });
});

/**
 * 更新租户存储配置（仅租户管理员可用）
 */
export const updateTenantStorageConfig = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { mode, localServerUrl } = req.body;

  // 检查是否是租户管理员
  if (!tenantUser.isAdmin) {
    return res.status(403).json({ success: false, message: '仅租户管理员可修改存储配置' });
  }

  // 验证参数
  if (mode && !['OSS', 'LOCAL'].includes(mode)) {
    return res.status(400).json({ success: false, message: '无效的存储模式' });
  }

  // 获取当前配置
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantUser.tenantId },
    select: { storageConfig: true },
  });

  const currentConfig = (tenant?.storageConfig as any) || {};

  // 更新配置
  const newConfig = {
    ...currentConfig,
    ...(mode && { mode }),
    ...(localServerUrl !== undefined && { localServerUrl }),
    updatedAt: new Date().toISOString(),
  };

  await prisma.tenant.update({
    where: { id: tenantUser.tenantId },
    data: { storageConfig: newConfig },
  });

  res.json({ success: true, message: '存储配置已更新' });
});

// ==================== 回收站 ====================

/**
 * 获取回收站列表
 */
export const getRecycleBin = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { type, q } = req.query;

  const where: any = {
    tenantId: tenantUser.tenantId,
    tenantUserId: tenantUser.id,
    isDeleted: true,
  };

  if (type && type !== 'ALL') {
    where.type = type;
  }

  if (q) {
    where.name = { contains: q as string, mode: 'insensitive' };
  }

  const items = await prisma.tenantRecycleItem.findMany({
    where,
    orderBy: { deletedAt: 'desc' },
    take: 100,
  });

  res.json({ success: true, data: items });
});

/**
 * 记录删除的预览节点到回收站
 */
export const recordRecycleItem = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { url, type, projectName } = req.body;

  if (!url || !type) {
    return res.status(400).json({ success: false, message: '缺少必要参数' });
  }

  // 从 URL 中提取文件名
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');
  const fileName = pathParts[pathParts.length - 1] || 'unknown';

  // 创建回收站记录
  const item = await prisma.tenantRecycleItem.create({
    data: {
      tenantId: tenantUser.tenantId,
      tenantUserId: tenantUser.id,
      name: projectName ? `${projectName}-${type === 'IMAGE' ? '图片' : '视频'}` : fileName,
      originalName: fileName,
      type: type.toUpperCase(),
      url,
      thumbnail: type === 'IMAGE' ? url : null,
      isDeleted: true,
      deletedAt: new Date(),
    },
  });

  res.json({ success: true, data: item });
});

/**
 * 从回收站恢复
 */
export const restoreRecycleItem = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { id } = req.params;

  const item = await prisma.tenantRecycleItem.findFirst({
    where: {
      id,
      tenantId: tenantUser.tenantId,
      tenantUserId: tenantUser.id,
    },
  });

  if (!item) {
    return res.status(404).json({ success: false, message: '回收站项目不存在' });
  }

  // 标记为未删除
  await prisma.tenantRecycleItem.update({
    where: { id },
    data: { isDeleted: false, deletedAt: null },
  });

  res.json({ success: true, message: '已恢复' });
});

/**
 * 永久删除回收站项目
 */
export const permanentDeleteRecycleItem = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { id } = req.params;

  const item = await prisma.tenantRecycleItem.findFirst({
    where: {
      id,
      tenantId: tenantUser.tenantId,
      tenantUserId: tenantUser.id,
    },
  });

  if (!item) {
    return res.status(404).json({ success: false, message: '回收站项目不存在' });
  }

  // 删除记录
  await prisma.tenantRecycleItem.delete({ where: { id } });

  res.json({ success: true, message: '已永久删除' });
});

// ==================== 角色库管理 ====================

/**
 * 创建角色
 */
export const createRole = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { id } = req.params;
  const { 
    name, 
    faceAssetId, frontAssetId, sideAssetId, backAssetId, voiceAssetId, documentAssetId,
    faceUrl, frontUrl, sideUrl, backUrl  // 直接接收 URL
  } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: '角色名称不能为空' });
  }

  // 使用租户资产库表
  const library = await prisma.tenantAssetLibrary.findFirst({ where: { id, tenantId: tenantUser.tenantId } });
  if (!library) {
    return res.status(404).json({ message: '资产库不存在' });
  }

  // 检查权限：所有者或协作者
  const isOwner = library.tenantUserId === tenantUser.id;
  if (!isOwner && !tenantUser.isAdmin) {
    const collaboration = await prisma.tenantAssetLibraryCollaborator.findUnique({
      where: { libraryId_tenantUserId: { libraryId: id, tenantUserId: tenantUser.id } },
    });
    if (!collaboration) {
      return res.status(403).json({ success: false, message: '无权访问此资产库' });
    }
  }

  const hasAnyAsset = Boolean(faceAssetId || frontAssetId || sideAssetId || backAssetId || voiceAssetId || documentAssetId || faceUrl || frontUrl || sideUrl || backUrl);
  if (!hasAnyAsset) {
    return res.status(400).json({ message: '至少上传一项素材' });
  }

  // 优先使用直接传递的 URL，否则尝试从数据库查找
  const thumb = faceUrl || frontUrl || sideUrl || backUrl || null;
  const roleUrl = `role://${id}/${Date.now()}`;
  const metadata: any = {
    kind: 'ROLE',
    name: String(name).trim(),
    thumbnail: thumb,
    images: {
      faceAssetId: faceAssetId || null,
      faceUrl: faceUrl || null,
      frontAssetId: frontAssetId || null,
      frontUrl: frontUrl || null,
      sideAssetId: sideAssetId || null,
      sideUrl: sideUrl || null,
      backAssetId: backAssetId || null,
      backUrl: backUrl || null,
    },
    voiceAssetId: voiceAssetId || null,
    documentAssetId: documentAssetId || null,
  };

  const roleAsset = await prisma.tenantAsset.create({
    data: {
      tenantId: tenantUser.tenantId,
      tenantUserId: tenantUser.id,
      libraryId: id,
      name: String(name).trim(),
      mimeType: 'application/json',
      size: 0,
      url: roleUrl,
      type: 'DOCUMENT',
      metadata,
    },
  });

  res.status(201).json({ success: true, data: { ...roleAsset, thumbnail: thumb } });
});

/**
 * 获取角色列表
 */
export const getRoles = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { id } = req.params;

  // 检查资产库是否存在
  const library = await prisma.tenantAssetLibrary.findFirst({ where: { id, tenantId: tenantUser.tenantId } });
  if (!library) {
    return res.status(404).json({ message: '资产库不存在' });
  }

  // 检查权限：所有者或协作者
  const isOwner = library.tenantUserId === tenantUser.id;
  if (!isOwner && !tenantUser.isAdmin) {
    const collaboration = await prisma.tenantAssetLibraryCollaborator.findUnique({
      where: { libraryId_tenantUserId: { libraryId: id, tenantUserId: tenantUser.id } },
    });
    if (!collaboration) {
      return res.status(403).json({ success: false, message: '无权访问此资产库' });
    }
  }

  const assets = await prisma.tenantAsset.findMany({
    where: { libraryId: id, type: 'DOCUMENT' },
    orderBy: { createdAt: 'desc' },
  });

  const roles = assets.filter((a) => {
    try {
      const m: any = a.metadata || {};
      return m && m.kind === 'ROLE';
    } catch {
      return false;
    }
  });

  // 为每个角色添加 thumbnail 字段（从 metadata 中提取）
  const rolesWithThumbnail = roles.map((r) => {
    const m: any = r.metadata || {};
    return { ...r, thumbnail: m.thumbnail || null };
  });

  res.json({ success: true, data: rolesWithThumbnail });
});

/**
 * 更新角色
 */
export const updateRole = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { id, roleId } = req.params;
  const { name, faceAssetId, frontAssetId, sideAssetId, backAssetId, voiceAssetId, documentAssetId } = req.body;

  const role = await prisma.tenantAsset.findFirst({ where: { id: roleId, tenantId: tenantUser.tenantId, libraryId: id } });
  if (!role) {
    return res.status(404).json({ message: '角色不存在' });
  }

  const m: any = role.metadata || {};
  if (!m || m.kind !== 'ROLE') {
    return res.status(400).json({ message: '资产不是角色类型' });
  }

  const findAsset = async (aid?: string | null) => (aid ? await prisma.tenantAsset.findFirst({ where: { id: aid, tenantId: tenantUser.tenantId } }) : null);
  const face = await findAsset(faceAssetId);
  const front = await findAsset(frontAssetId);
  const side = await findAsset(sideAssetId);
  const back = await findAsset(backAssetId);
  const voice = await findAsset(voiceAssetId);
  const doc = await findAsset(documentAssetId);

  const thumb = face?.url || front?.url || m.thumbnail || null;
  const newMetadata: any = {
    ...m,
    name: name !== undefined ? String(name).trim() : m.name,
    thumbnail: thumb,
    images: {
      faceAssetId: faceAssetId !== undefined ? (face?.id || null) : m.images?.faceAssetId || null,
      frontAssetId: frontAssetId !== undefined ? (front?.id || null) : m.images?.frontAssetId || null,
      sideAssetId: sideAssetId !== undefined ? (side?.id || null) : m.images?.sideAssetId || null,
      backAssetId: backAssetId !== undefined ? (back?.id || null) : m.images?.backAssetId || null,
    },
    voiceAssetId: voiceAssetId !== undefined ? (voice?.id || null) : m.voiceAssetId || null,
    documentAssetId: documentAssetId !== undefined ? (doc?.id || null) : m.documentAssetId || null,
  };

  const updated = await prisma.tenantAsset.update({
    where: { id: roleId },
    data: {
      name: name !== undefined ? String(name).trim() : role.name,
      metadata: newMetadata,
    },
  });

  res.json({ success: true, data: { ...updated, thumbnail: thumb } });
});

/**
 * 删除角色
 */
export const deleteRole = asyncHandler(async (req: Request, res: Response) => {
  const tenantUser = req.tenantUser!;
  const { id, roleId } = req.params;

  const role = await prisma.tenantAsset.findFirst({ where: { id: roleId, tenantId: tenantUser.tenantId, libraryId: id } });
  if (!role) {
    return res.status(404).json({ message: '角色不存在' });
  }

  const m: any = role.metadata || {};
  if (!m || m.kind !== 'ROLE') {
    return res.status(400).json({ message: '资产不是角色类型' });
  }

  await prisma.tenantAsset.delete({ where: { id: roleId } });

  res.json({ success: true, message: '角色已删除' });
});

/**
 * 获取可用的文本生成模型（用于工作流智能体节点）
 */
export const getAvailableAgentModels = asyncHandler(async (req: Request, res: Response) => {
  const models = await prisma.aIModel.findMany({
    where: {
      isActive: true,
      type: 'TEXT_GENERATION',
    },
    select: {
      id: true,
      name: true,
      provider: true,
      modelId: true,
      type: true,
      pricePerUse: true,
    },
    orderBy: { name: 'asc' },
  });
  
  res.json(models);
});

/**
 * 提取文档文本（PDF、Word等）
 */
export const extractDocumentText = asyncHandler(async (req: Request, res: Response) => {
  const { filePath } = req.body;
  
  if (!filePath) {
    return res.status(400).json({ success: false, message: 'filePath 是必需的' });
  }

  try {
    const fs = await import('fs');
    const path = await import('path');
    const axios = (await import('axios')).default;
    
    let fileBuffer: Buffer | null = null;
    let mimeType = '';
    
    // 判断是本地路径还是URL
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      const resp = await axios.get(filePath, { responseType: 'arraybuffer' });
      fileBuffer = Buffer.from(resp.data);
      mimeType = resp.headers['content-type'] || '';
    } else {
      // 本地文件路径
      const fullPath = path.join(process.cwd(), filePath);
      if (fs.existsSync(fullPath)) {
        fileBuffer = fs.readFileSync(fullPath);
        // 根据扩展名判断类型
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.pdf') mimeType = 'application/pdf';
        else if (ext === '.docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (ext === '.doc') mimeType = 'application/msword';
        else if (ext === '.txt') mimeType = 'text/plain';
      }
    }
    
    if (!fileBuffer) {
      return res.status(404).json({ success: false, message: '文件不存在或无法访问' });
    }
    
    let text = '';
    
    if (mimeType.includes('pdf')) {
      const pdfParse = (await import('pdf-parse')).default as any;
      const pdfData = await pdfParse(fileBuffer);
      text = String(pdfData?.text || '');
    } else if (mimeType.includes('wordprocessingml') || mimeType.includes('msword')) {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      text = String(result?.value || '');
    } else if (mimeType.startsWith('text/') || filePath.endsWith('.txt')) {
      text = fileBuffer.toString('utf8');
    } else {
      return res.status(400).json({ success: false, message: '不支持的文件格式' });
    }
    
    res.json({ success: true, data: { text, mimeType } });
  } catch (error: any) {
    console.error('[extractDocumentText] 提取文档失败:', error);
    res.status(500).json({ success: false, message: error.message || '提取文档失败' });
  }
});

