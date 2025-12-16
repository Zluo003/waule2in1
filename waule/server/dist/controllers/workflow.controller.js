"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchUsersForWorkflow = exports.unshareWorkflow = exports.updateWorkflowSharePermission = exports.shareWorkflow = exports.getWorkflowCollaborators = exports.deleteWorkflow = exports.saveShotWorkflow = exports.getOrCreateShotWorkflow = exports.saveEpisodeWorkflow = exports.updateWorkflowById = exports.saveWorkflow = exports.getOrCreateEpisodeWorkflow = exports.getOrCreateProjectWorkflow = exports.getWorkflowById = exports.getAllWorkflows = void 0;
const index_1 = require("../index");
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = require("../utils/logger");
/**
 * 🛡️ 清理节点中的 base64 图片数据，防止工作流数据膨胀
 * base64 图片应该先上传到 OSS，然后使用 URL
 */
function sanitizeWorkflowNodes(nodes) {
    if (!Array.isArray(nodes))
        return nodes;
    let cleanedCount = 0;
    const sanitized = nodes.map(node => {
        if (!node || !node.data)
            return node;
        const data = { ...node.data };
        let modified = false;
        // 检查常见的图片字段
        const imageFields = ['imageUrl', 'url', 'thumbnail', 'src', 'image'];
        for (const field of imageFields) {
            if (typeof data[field] === 'string' && data[field].startsWith('data:image')) {
                // 检测到 base64 图片，清空该字段
                data[field] = '';
                modified = true;
                cleanedCount++;
            }
        }
        if (modified) {
            return { ...node, data };
        }
        return node;
    });
    if (cleanedCount > 0) {
        logger_1.logger.warn(`[Workflow] 清理了 ${cleanedCount} 个 base64 图片字段，请使用 URL 而非 base64`);
    }
    return sanitized;
}
/**
 * 获取所有工作流（包含共享给我的）
 */
exports.getAllWorkflows = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { projectId, episodeId, includeShared } = req.query;
    const userId = req.user.id;
    const where = {
        userId,
    };
    if (projectId) {
        where.projectId = projectId;
    }
    if (episodeId) {
        where.episodeId = episodeId;
    }
    // 🚀 优化：使用 Promise.all 并行执行所有查询，而不是串行
    const shouldIncludeShared = includeShared === 'true';
    // 🚀 关键优化：使用 select 排除巨大的 data 字段（有的工作流 data 超过 14MB）
    const workflowSelectFields = {
        id: true,
        name: true,
        description: true,
        userId: true,
        projectId: true,
        episodeId: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
        // 注意：不选择 data 字段，避免传输巨大 JSON
    };
    // 构建所有查询 Promise
    const ownWorkflowsPromise = index_1.prisma.workflow.findMany({
        where,
        select: {
            ...workflowSelectFields,
            project: {
                select: {
                    id: true,
                    name: true,
                },
            },
            _count: {
                select: { shares: true },
            },
        },
        orderBy: { updatedAt: 'desc' },
    });
    const sharedWorkflowsPromise = shouldIncludeShared
        ? index_1.prisma.workflow.findMany({
            where: {
                shares: {
                    some: { targetUserId: userId },
                },
            },
            select: {
                ...workflowSelectFields,
                project: {
                    select: {
                        id: true,
                        name: true,
                        thumbnail: true,
                    },
                },
                user: {
                    select: { id: true, nickname: true, avatar: true },
                },
                shares: {
                    where: { targetUserId: userId },
                    select: { createdAt: true },
                },
            },
            orderBy: { updatedAt: 'desc' },
        })
        : Promise.resolve([]);
    const publicWorkflowsPromise = shouldIncludeShared
        ? index_1.prisma.workflow.findMany({
            where: {
                isPublic: true,
                userId: { not: userId },
            },
            select: {
                ...workflowSelectFields,
                project: {
                    select: {
                        id: true,
                        name: true,
                        thumbnail: true,
                    },
                },
                user: {
                    select: { id: true, nickname: true, avatar: true },
                },
            },
            orderBy: { updatedAt: 'desc' },
            take: 50, // 🚀 限制公开工作流数量，避免数据量过大
        })
        : Promise.resolve([]);
    // 🚀 并行执行所有查询
    const [ownWorkflows, sharedWorkflows, publicWorkflows] = await Promise.all([
        ownWorkflowsPromise,
        sharedWorkflowsPromise,
        publicWorkflowsPromise,
    ]);
    // 标记自己的工作流
    const ownWithMeta = ownWorkflows.map((w) => ({
        ...w,
        isOwner: true,
        isShared: false,
        hasCollaborators: w._count.shares > 0,
    }));
    // 处理共享的工作流
    let sharedWithMeta = [];
    let publicWithMeta = [];
    if (shouldIncludeShared) {
        sharedWithMeta = sharedWorkflows.map((w) => ({
            ...w,
            isOwner: false,
            isShared: true,
            hasCollaborators: false,
            shareInfo: {
                owner: w.user,
                sharedAt: w.shares[0]?.createdAt,
            },
        }));
        // 过滤掉已经通过直接共享获取的
        const sharedIds = new Set(sharedWithMeta.map((w) => w.id));
        publicWithMeta = publicWorkflows
            .filter((w) => !sharedIds.has(w.id))
            .map((w) => ({
            ...w,
            isOwner: false,
            isShared: true,
            isPublic: true,
            hasCollaborators: false,
            shareInfo: {
                owner: w.user,
                isPublic: true,
            },
        }));
    }
    res.json({
        success: true,
        data: [...ownWithMeta, ...sharedWithMeta, ...publicWithMeta],
    });
});
/**
 * 获取单个工作流（支持协作者访问，根据权限返回 canEdit）
 * 🚀 优化：添加 Redis 缓存减少数据库查询
 */
exports.getWorkflowById = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    // 🔧 尝试从缓存获取工作流基础数据
    const cacheKey = `workflow:${id}`;
    let workflow = null;
    try {
        const cached = await index_1.redis.get(cacheKey);
        if (cached) {
            workflow = JSON.parse(cached);
        }
    }
    catch {
        // Redis 不可用，继续查询数据库
    }
    // 缓存未命中，查询数据库
    if (!workflow) {
        workflow = await index_1.prisma.workflow.findUnique({
            where: { id },
            include: {
                project: true,
                episode: true,
                nodes: true,
                user: { select: { id: true, nickname: true, avatar: true } },
            },
        });
        // 缓存工作流 30 秒（工作流数据可能频繁更新，不宜缓存太久）
        if (workflow) {
            try {
                await index_1.redis.set(cacheKey, JSON.stringify(workflow), 'EX', 30);
            }
            catch {
                // Redis 写入失败，忽略
            }
        }
    }
    if (!workflow) {
        throw new errorHandler_1.AppError('工作流不存在', 404);
    }
    const isOwner = workflow.userId === userId;
    let canEdit = isOwner; // 所有者始终可编辑
    let sharePermission;
    let isPublicWorkflow = false;
    // 如果不是所有者，检查权限（使用缓存）
    if (!isOwner) {
        // 先检查是否是公开工作流
        if (workflow.isPublic) {
            isPublicWorkflow = true;
            canEdit = false; // 公开工作流只能只读访问
            sharePermission = 'READ';
        }
        else {
            // 🔧 检查权限（使用缓存）
            const permCacheKey = `workflow:share:${id}:${userId}`;
            let share = null;
            try {
                const cachedPerm = await index_1.redis.get(permCacheKey);
                if (cachedPerm) {
                    share = JSON.parse(cachedPerm);
                }
            }
            catch {
                // Redis 不可用
            }
            if (!share) {
                share = await index_1.prisma.workflowShare.findUnique({
                    where: {
                        workflowId_targetUserId: { workflowId: id, targetUserId: userId },
                    },
                    select: { permission: true },
                });
                // 缓存权限 5 分钟
                if (share) {
                    try {
                        await index_1.redis.set(permCacheKey, JSON.stringify(share), 'EX', 300);
                    }
                    catch {
                        // Redis 写入失败，忽略
                    }
                }
            }
            if (!share) {
                throw new errorHandler_1.AppError('无权访问此工作流', 403);
            }
            // 根据分享权限设置 canEdit
            sharePermission = share.permission;
            canEdit = share.permission === 'EDIT';
        }
    }
    res.json({
        success: true,
        data: {
            ...workflow,
            isOwner,
            canEdit,
            sharePermission, // 协作者的权限类型
            currentUserId: userId, // 返回当前用户ID供前端判断节点所有权
            isShared: !isOwner,
            isPublic: isPublicWorkflow,
            shareInfo: !isOwner ? { owner: workflow.user } : undefined,
        },
    });
});
/**
 * 获取或创建项目的工作流
 */
exports.getOrCreateProjectWorkflow = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { projectId } = req.params;
    // 验证项目权限
    const project = await index_1.prisma.project.findUnique({
        where: { id: projectId },
    });
    if (!project) {
        throw new errorHandler_1.AppError('项目不存在', 404);
    }
    if (project.userId !== req.user.id) {
        throw new errorHandler_1.AppError('无权访问此项目', 403);
    }
    // 查找现有工作流
    let workflow = await index_1.prisma.workflow.findFirst({
        where: {
            projectId,
            userId: req.user.id,
        },
        include: {
            nodes: true,
            _count: {
                select: { shares: true },
            },
        },
    });
    // 如果不存在，创建新工作流
    if (!workflow) {
        workflow = await index_1.prisma.workflow.create({
            data: {
                name: `${project.name} - 工作流`,
                userId: req.user.id,
                projectId,
                data: {
                    nodes: [],
                    edges: [],
                    nodeGroups: [],
                    viewport: { x: 0, y: 0, zoom: 1 },
                },
            },
            include: {
                nodes: true,
                _count: {
                    select: { shares: true },
                },
            },
        });
    }
    const workflowData = { ...workflow };
    workflowData.hasCollaborators = workflow._count?.shares > 0;
    delete workflowData._count;
    res.json({
        success: true,
        data: workflowData,
    });
});
/**
 * 获取或创建剧集的工作流
 */
exports.getOrCreateEpisodeWorkflow = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { projectId, episodeId } = req.params;
    const userId = req.user.id;
    // 验证项目权限
    const project = await index_1.prisma.project.findUnique({
        where: { id: projectId },
        include: {
            user: { select: { id: true, nickname: true, avatar: true } },
        },
    });
    if (!project) {
        throw new errorHandler_1.AppError('项目不存在', 404);
    }
    // 检查是否是项目所有者
    const isOwner = project.userId === userId;
    // 如果不是所有者，检查是否是项目协作者
    let isCollaborator = false;
    if (!isOwner) {
        const share = await index_1.prisma.projectShare.findFirst({
            where: { projectId, targetUserId: userId },
        });
        isCollaborator = !!share;
    }
    if (!isOwner && !isCollaborator) {
        throw new errorHandler_1.AppError('无权访问此项目', 403);
    }
    // 验证剧集
    const episode = await index_1.prisma.episode.findFirst({
        where: {
            id: episodeId,
            projectId,
        },
    });
    if (!episode) {
        throw new errorHandler_1.AppError('剧集不存在', 404);
    }
    // 检查剧集级编辑权限（所有者始终可编辑，协作者需检查剧集权限）
    let canEdit = isOwner;
    if (!isOwner && isCollaborator) {
        const episodePermission = await index_1.prisma.episodePermission.findFirst({
            where: { episodeId, userId, permission: 'EDIT' },
        });
        canEdit = !!episodePermission;
    }
    // 查找项目所有者创建的工作流（剧集工作流共享使用所有者的工作流）
    let workflow = await index_1.prisma.workflow.findFirst({
        where: {
            episodeId,
            userId: project.userId, // 使用项目所有者的工作流
        },
        include: {
            nodes: true,
            _count: {
                select: { shares: true },
            },
        },
    });
    // 如果不存在，创建新工作流（由项目所有者拥有，所有协作者共享）
    if (!workflow) {
        workflow = await index_1.prisma.workflow.create({
            data: {
                name: `${project.name} - ${episode.name} - 工作流`,
                userId: project.userId, // 始终由项目所有者拥有
                projectId,
                episodeId,
                data: {
                    nodes: [],
                    edges: [],
                    nodeGroups: [],
                    viewport: { x: 0, y: 0, zoom: 1 },
                },
            },
            include: {
                nodes: true,
                _count: {
                    select: { shares: true },
                },
            },
        });
    }
    const workflowData = { ...workflow };
    workflowData.hasCollaborators = workflow._count?.shares > 0;
    workflowData.isOwner = isOwner;
    workflowData.canEdit = canEdit;
    // 如果是协作者，返回项目所有者信息
    if (!isOwner) {
        workflowData.isShared = true;
        workflowData.shareInfo = {
            owner: project.user,
        };
    }
    delete workflowData._count;
    res.json({
        success: true,
        data: workflowData,
    });
});
/**
 * 保存/更新工作流
 */
exports.saveWorkflow = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { projectId } = req.params;
    const { nodes, edges, nodeGroups, viewport } = req.body;
    // 验证项目权限
    const project = await index_1.prisma.project.findUnique({
        where: { id: projectId },
    });
    if (!project) {
        throw new errorHandler_1.AppError('项目不存在', 404);
    }
    if (project.userId !== req.user.id) {
        throw new errorHandler_1.AppError('无权访问此项目', 403);
    }
    // 查找或创建工作流
    let workflow = await index_1.prisma.workflow.findFirst({
        where: {
            projectId,
            userId: req.user.id,
        },
    });
    const workflowData = {
        nodes: sanitizeWorkflowNodes(nodes || []),
        edges: edges || [],
        nodeGroups: nodeGroups || [],
        viewport: viewport || { x: 0, y: 0, zoom: 1 },
    };
    if (workflow) {
        // 更新现有工作流
        workflow = await index_1.prisma.workflow.update({
            where: { id: workflow.id },
            data: {
                data: workflowData,
            },
        });
    }
    else {
        // 创建新工作流
        workflow = await index_1.prisma.workflow.create({
            data: {
                name: `${project.name} - 工作流`,
                userId: req.user.id,
                projectId,
                data: workflowData,
            },
        });
    }
    res.json({
        success: true,
        message: '工作流保存成功',
        data: workflow,
    });
});
/**
 * 通过ID更新工作流（支持协作者编辑）
 */
exports.updateWorkflowById = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    // 兼容两种格式：{ data: { nodes, edges, ... } } 或 { nodes, edges, ... }
    const bodyData = req.body.data || req.body;
    const { nodes, edges, nodeGroups, viewport } = bodyData;
    // 查找工作流
    const workflow = await index_1.prisma.workflow.findUnique({
        where: { id },
        include: {
            shares: {
                where: { targetUserId: userId },
                select: { permission: true },
            },
        },
    });
    if (!workflow) {
        throw new errorHandler_1.AppError('工作流不存在', 404);
    }
    // 检查权限：所有者或有编辑权限的协作者
    const isOwner = workflow.userId === userId;
    const share = workflow.shares[0];
    const canEdit = isOwner || (share && share.permission === 'EDIT');
    if (!canEdit) {
        throw new errorHandler_1.AppError('无权编辑此工作流', 403);
    }
    // 🛡️ 清理 base64 图片数据，防止数据膨胀
    const workflowData = {
        nodes: sanitizeWorkflowNodes(nodes || []),
        edges: edges || [],
        nodeGroups: nodeGroups || [],
        viewport: viewport || { x: 0, y: 0, zoom: 1 },
    };
    // 🚀 优化：更新后只返回必要字段，不返回 14MB 的 data
    const updatedWorkflow = await index_1.prisma.workflow.update({
        where: { id },
        data: { data: workflowData },
        select: {
            id: true,
            name: true,
            updatedAt: true,
            // 不返回 data 字段，避免传输 14MB 数据
        },
    });
    res.json({
        success: true,
        message: '工作流保存成功',
        data: updatedWorkflow,
    });
});
/**
 * 保存/更新剧集工作流
 */
exports.saveEpisodeWorkflow = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { projectId, episodeId } = req.params;
    const userId = req.user.id;
    const { nodes, edges, nodeGroups, viewport } = req.body;
    // 验证项目权限
    const project = await index_1.prisma.project.findUnique({
        where: { id: projectId },
    });
    if (!project) {
        throw new errorHandler_1.AppError('项目不存在', 404);
    }
    // 检查是否是项目所有者
    const isOwner = project.userId === userId;
    // 检查剧集级编辑权限
    let canEdit = isOwner;
    if (!isOwner) {
        // 检查是否是项目协作者
        const share = await index_1.prisma.projectShare.findFirst({
            where: { projectId, targetUserId: userId },
        });
        if (!share) {
            throw new errorHandler_1.AppError('无权访问此项目', 403);
        }
        // 检查剧集权限
        const episodePermission = await index_1.prisma.episodePermission.findFirst({
            where: { episodeId, userId, permission: 'EDIT' },
        });
        canEdit = !!episodePermission;
    }
    // 如果没有编辑权限，静默返回成功（不抛出403，前端已阻止保存）
    if (!canEdit) {
        return res.json({
            success: true,
            message: '只读模式',
            data: null,
        });
    }
    // 验证剧集
    const episode = await index_1.prisma.episode.findFirst({
        where: {
            id: episodeId,
            projectId,
        },
    });
    if (!episode) {
        throw new errorHandler_1.AppError('剧集不存在', 404);
    }
    // 查找项目所有者的工作流
    let workflow = await index_1.prisma.workflow.findFirst({
        where: {
            episodeId,
            userId: project.userId, // 使用项目所有者的工作流
        },
    });
    const workflowData = {
        nodes: sanitizeWorkflowNodes(nodes || []),
        edges: edges || [],
        nodeGroups: nodeGroups || [],
        viewport: viewport || { x: 0, y: 0, zoom: 1 },
    };
    // 🚀 优化：更新/创建后只返回必要字段
    const selectFields = { id: true, name: true, updatedAt: true };
    let result;
    if (workflow) {
        // 更新现有工作流
        result = await index_1.prisma.workflow.update({
            where: { id: workflow.id },
            data: { data: workflowData },
            select: selectFields,
        });
    }
    else if (isOwner) {
        // 只有所有者可以创建新工作流
        result = await index_1.prisma.workflow.create({
            data: {
                name: `${project.name} - ${episode.name} - 工作流`,
                userId: project.userId,
                projectId,
                episodeId,
                data: workflowData,
            },
            select: selectFields,
        });
    }
    else {
        throw new errorHandler_1.AppError('工作流不存在', 404);
    }
    res.json({
        success: true,
        message: '工作流保存成功',
        data: result,
    });
});
exports.getOrCreateShotWorkflow = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { projectId, episodeId } = req.params;
    const userId = req.user.id;
    const scene = Number(req.query.scene || req.params.scene);
    const shot = Number(req.query.shot || req.params.shot);
    const project = await index_1.prisma.project.findUnique({
        where: { id: projectId },
        include: {
            user: { select: { id: true, nickname: true, avatar: true } },
        },
    });
    if (!project)
        throw new errorHandler_1.AppError('项目不存在', 404);
    // 检查是否是项目所有者
    const isOwner = project.userId === userId;
    // 如果不是所有者，检查是否是项目协作者
    let isCollaborator = false;
    if (!isOwner) {
        const share = await index_1.prisma.projectShare.findFirst({
            where: { projectId, targetUserId: userId },
        });
        isCollaborator = !!share;
    }
    if (!isOwner && !isCollaborator) {
        throw new errorHandler_1.AppError('无权访问此项目', 403);
    }
    const episode = await index_1.prisma.episode.findFirst({ where: { id: episodeId, projectId } });
    if (!episode)
        throw new errorHandler_1.AppError('剧集不存在', 404);
    if (!Number.isFinite(scene) || scene <= 0 || !Number.isFinite(shot) || shot <= 0) {
        throw new errorHandler_1.AppError('无效的分镜参数', 400);
    }
    // 检查剧集级编辑权限
    let canEdit = isOwner;
    if (!isOwner && isCollaborator) {
        const episodePermission = await index_1.prisma.episodePermission.findFirst({
            where: { episodeId, userId, permission: 'EDIT' },
        });
        canEdit = !!episodePermission;
    }
    const expectedName = `${project.name} - ${episode.name} - 第${scene}幕第${shot}镜 - 工作流`;
    // 查找项目所有者创建的工作流
    let workflow = await index_1.prisma.workflow.findFirst({
        where: {
            episodeId,
            userId: project.userId, // 使用项目所有者的工作流
            name: expectedName,
        },
        include: {
            nodes: true,
            _count: {
                select: { shares: true },
            },
        },
    });
    // 如果不存在，创建新工作流（由项目所有者拥有，所有协作者共享）
    if (!workflow) {
        workflow = await index_1.prisma.workflow.create({
            data: {
                name: expectedName,
                userId: project.userId, // 始终由项目所有者拥有
                projectId,
                episodeId,
                data: {
                    scope: 'shot',
                    scene,
                    shot,
                    nodes: [],
                    edges: [],
                    nodeGroups: [],
                    viewport: { x: 0, y: 0, zoom: 1 },
                },
            },
            include: {
                nodes: true,
                _count: {
                    select: { shares: true },
                },
            },
        });
    }
    const workflowData = { ...workflow };
    workflowData.hasCollaborators = workflow._count?.shares > 0;
    workflowData.isOwner = isOwner;
    workflowData.canEdit = canEdit;
    // 如果是协作者，返回项目所有者信息
    if (!isOwner) {
        workflowData.isShared = true;
        workflowData.shareInfo = {
            owner: project.user,
        };
    }
    delete workflowData._count;
    res.json({ success: true, data: workflowData });
});
exports.saveShotWorkflow = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { projectId, episodeId } = req.params;
    const userId = req.user.id;
    const scene = Number(req.query.scene || req.params.scene);
    const shot = Number(req.query.shot || req.params.shot);
    const { nodes, edges, nodeGroups, viewport } = req.body;
    const project = await index_1.prisma.project.findUnique({ where: { id: projectId } });
    if (!project)
        throw new errorHandler_1.AppError('项目不存在', 404);
    // 检查是否是项目所有者
    const isOwner = project.userId === userId;
    // 检查剧集级编辑权限
    let canEdit = isOwner;
    if (!isOwner) {
        // 检查是否是项目协作者
        const share = await index_1.prisma.projectShare.findFirst({
            where: { projectId, targetUserId: userId },
        });
        if (!share) {
            throw new errorHandler_1.AppError('无权访问此项目', 403);
        }
        // 检查剧集权限
        const episodePermission = await index_1.prisma.episodePermission.findFirst({
            where: { episodeId, userId, permission: 'EDIT' },
        });
        canEdit = !!episodePermission;
    }
    // 如果没有编辑权限，静默返回成功（不抛出403，前端已阻止保存）
    if (!canEdit) {
        return res.json({
            success: true,
            message: '只读模式',
            data: null,
        });
    }
    const episode = await index_1.prisma.episode.findFirst({ where: { id: episodeId, projectId } });
    if (!episode)
        throw new errorHandler_1.AppError('剧集不存在', 404);
    if (!Number.isFinite(scene) || scene <= 0 || !Number.isFinite(shot) || shot <= 0) {
        throw new errorHandler_1.AppError('无效的分镜参数', 400);
    }
    const expectedName = `${project.name} - ${episode.name} - 第${scene}幕第${shot}镜 - 工作流`;
    // 查找项目所有者的工作流
    let workflow = await index_1.prisma.workflow.findFirst({
        where: {
            episodeId,
            userId: project.userId, // 使用项目所有者的工作流
            name: expectedName,
        },
    });
    const workflowData = {
        scope: 'shot',
        scene,
        shot,
        nodes: sanitizeWorkflowNodes(nodes || []),
        edges: edges || [],
        nodeGroups: nodeGroups || [],
        viewport: viewport || { x: 0, y: 0, zoom: 1 },
    };
    // 🚀 优化：保存后只返回必要字段
    const selectFields = { id: true, name: true, updatedAt: true };
    let result;
    if (workflow) {
        result = await index_1.prisma.workflow.update({
            where: { id: workflow.id },
            data: { data: workflowData },
            select: selectFields,
        });
    }
    else if (isOwner) {
        // 只有所有者可以创建新工作流
        result = await index_1.prisma.workflow.create({
            data: {
                name: expectedName,
                userId: project.userId,
                projectId,
                episodeId,
                data: workflowData,
            },
            select: selectFields,
        });
    }
    else {
        throw new errorHandler_1.AppError('工作流不存在', 404);
    }
    res.json({ success: true, message: '工作流保存成功', data: result });
});
/**
 * 删除工作流
 */
exports.deleteWorkflow = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const workflow = await index_1.prisma.workflow.findUnique({
        where: { id },
    });
    if (!workflow) {
        throw new errorHandler_1.AppError('工作流不存在', 404);
    }
    if (workflow.userId !== req.user.id) {
        throw new errorHandler_1.AppError('无权删除此工作流', 403);
    }
    await index_1.prisma.workflow.delete({
        where: { id },
    });
    res.json({
        success: true,
        message: '工作流删除成功',
    });
});
/**
 * 获取工作流协作者列表
 */
exports.getWorkflowCollaborators = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    // 验证工作流存在且属于当前用户
    const workflow = await index_1.prisma.workflow.findFirst({
        where: { id, userId },
    });
    if (!workflow) {
        throw new errorHandler_1.AppError('工作流不存在或无权访问', 404);
    }
    // 获取所有协作者
    const shares = await index_1.prisma.workflowShare.findMany({
        where: { workflowId: id },
        include: {
            target: { select: { id: true, nickname: true, avatar: true } },
        },
        orderBy: { createdAt: 'desc' },
    });
    const collaborators = shares.map((share) => ({
        id: share.target.id,
        nickname: share.target.nickname,
        avatar: share.target.avatar,
        permission: share.permission,
        sharedAt: share.createdAt,
    }));
    res.json({ success: true, data: collaborators });
});
/**
 * 添加工作流协作者（支持权限设置，管理员可公开共享给所有人）
 */
exports.shareWorkflow = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { targetUserId, permission = 'READ' } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;
    if (!targetUserId) {
        throw new errorHandler_1.AppError('请指定协作者', 400);
    }
    // 验证工作流存在且属于当前用户
    const workflow = await index_1.prisma.workflow.findFirst({
        where: { id, userId },
    });
    if (!workflow) {
        throw new errorHandler_1.AppError('工作流不存在或无权分享', 404);
    }
    // 处理"所有人"公开共享（仅管理员可用）
    if (targetUserId === '*' || targetUserId === 'all') {
        if (userRole !== 'ADMIN') {
            throw new errorHandler_1.AppError('仅管理员可以公开共享给所有人', 403);
        }
        // 设置工作流为公开
        await index_1.prisma.workflow.update({
            where: { id },
            data: { isPublic: true },
        });
        res.json({ success: true, message: '已公开共享给所有人', data: { isPublic: true } });
        return;
    }
    // 验证权限值
    if (!['READ', 'EDIT'].includes(permission)) {
        throw new errorHandler_1.AppError('无效的权限值', 400);
    }
    // 不能分享给自己
    if (targetUserId === userId) {
        throw new errorHandler_1.AppError('不能分享给自己', 400);
    }
    // 验证目标用户存在
    const targetUser = await index_1.prisma.user.findUnique({
        where: { id: targetUserId },
    });
    if (!targetUser) {
        throw new errorHandler_1.AppError('目标用户不存在', 404);
    }
    // 检查是否已经分享
    const existingShare = await index_1.prisma.workflowShare.findUnique({
        where: {
            workflowId_targetUserId: { workflowId: id, targetUserId },
        },
    });
    if (existingShare) {
        throw new errorHandler_1.AppError('已经分享给该用户', 400);
    }
    // 创建分享
    await index_1.prisma.workflowShare.create({
        data: {
            workflowId: id,
            ownerUserId: userId,
            targetUserId,
            permission: permission,
        },
    });
    res.json({ success: true, message: '分享成功' });
});
/**
 * 更新协作者权限
 */
exports.updateWorkflowSharePermission = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { targetUserId, permission } = req.body;
    const userId = req.user.id;
    if (!targetUserId || !permission) {
        throw new errorHandler_1.AppError('请指定协作者和权限', 400);
    }
    // 验证权限值
    if (!['READ', 'EDIT'].includes(permission)) {
        throw new errorHandler_1.AppError('无效的权限值', 400);
    }
    // 验证工作流存在且属于当前用户
    const workflow = await index_1.prisma.workflow.findFirst({
        where: { id, userId },
    });
    if (!workflow) {
        throw new errorHandler_1.AppError('工作流不存在或无权操作', 404);
    }
    // 更新权限
    const share = await index_1.prisma.workflowShare.update({
        where: {
            workflowId_targetUserId: { workflowId: id, targetUserId },
        },
        data: { permission: permission },
    });
    if (!share) {
        throw new errorHandler_1.AppError('协作者不存在', 404);
    }
    res.json({ success: true, message: '权限更新成功' });
});
/**
 * 取消工作流分享
 */
exports.unshareWorkflow = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { targetUserId } = req.body;
    const userId = req.user.id;
    if (!targetUserId) {
        throw new errorHandler_1.AppError('请指定协作者', 400);
    }
    // 验证工作流存在且属于当前用户
    const workflow = await index_1.prisma.workflow.findFirst({
        where: { id, userId },
    });
    if (!workflow) {
        throw new errorHandler_1.AppError('工作流不存在或无权操作', 404);
    }
    // 删除分享
    await index_1.prisma.workflowShare.deleteMany({
        where: {
            workflowId: id,
            targetUserId,
        },
    });
    res.json({ success: true, message: '已取消分享' });
});
/**
 * 搜索用户（用于添加协作者）
 */
exports.searchUsersForWorkflow = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const { q } = req.query;
    const query = (typeof q === 'string' ? q.trim() : '');
    // 搜索用户（排除自己），空查询时返回最近活跃用户
    const whereCondition = {
        id: { not: userId },
        isActive: true,
    };
    if (query.length > 0) {
        whereCondition.OR = [
            { nickname: { contains: query, mode: 'insensitive' } },
            { username: { contains: query, mode: 'insensitive' } },
        ];
    }
    const users = await index_1.prisma.user.findMany({
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
//# sourceMappingURL=workflow.controller.js.map