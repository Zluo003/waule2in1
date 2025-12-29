"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteNodeTask = exports.getNodeTasks = exports.saveNodeTask = exports.markPreviewNodeCreated = exports.createStoryboardTask = exports.getPendingPreviewNodes = exports.getActiveTask = exports.getUserTasks = exports.getTaskStatus = exports.createVideoEditTask = exports.createVideoTask = exports.createImageEditTask = exports.createImageTask = void 0;
const task_service_1 = __importDefault(require("../services/task.service"));
const index_1 = require("../index");
const logger_1 = __importDefault(require("../utils/logger"));
const oss_1 = require("../utils/oss");
// Redis key 前缀
const NODE_TASK_PREFIX = 'node:task:';
/**
 * 创建图片生成任务
 */
const createImageTask = async (req, res) => {
    try {
        const { modelId, prompt, ratio, imageSize, referenceImages, sourceNodeId, metadata, maxImages } = req.body;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: '未授权' });
        }
        if (!modelId) {
            return res.status(400).json({ error: '缺少模型ID' });
        }
        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ error: '提示词是必需的' });
        }
        // 获取模型配置
        const model = await index_1.prisma.aIModel.findUnique({
            where: { id: modelId },
        });
        if (!model) {
            return res.status(404).json({ error: '模型不存在' });
        }
        if (!model.isActive) {
            return res.status(400).json({ error: '模型未启用' });
        }
        if (model.type !== 'IMAGE_GENERATION') {
            return res.status(400).json({ error: '该模型不支持图片生成' });
        }
        logger_1.default.info(`[TaskController] 创建图片生成任务: ${prompt.substring(0, 50)}...`, {
            referenceImagesCount: referenceImages?.length || 0,
            imageSize,
            ratio,
            maxImages,
            metadata,
        });
        // 创建任务（权限检查和扣费在 taskService 中处理）
        const task = await task_service_1.default.createTask({
            userId,
            type: 'IMAGE',
            modelId,
            model,
            prompt,
            ratio: ratio || '1:1',
            imageSize: imageSize || undefined,
            referenceImages: referenceImages || [],
            sourceNodeId: sourceNodeId || undefined,
            maxImages: maxImages || undefined, // 组图生成的图片数量
            metadata: metadata || {},
        });
        res.json({
            success: true,
            taskId: task.id,
            status: task.status,
            isFreeUsage: task.isFreeUsage,
            freeUsageRemaining: task.freeUsageRemaining,
            creditsCharged: task.creditsCharged,
        });
    }
    catch (error) {
        // 检查是否是权限相关错误
        const errorMsg = error.message || '';
        const isPermissionError = errorMsg.includes('无权') ||
            errorMsg.includes('没有权限') ||
            errorMsg.includes('并发') ||
            errorMsg.includes('次数') ||
            errorMsg.includes('积分不足') ||
            errorMsg.includes('等级');
        if (isPermissionError) {
            logger_1.default.warn(`[TaskController] 权限限制: ${errorMsg}`);
            return res.status(403).json({
                success: false,
                error: errorMsg,
                code: 'PERMISSION_DENIED'
            });
        }
        logger_1.default.error('[TaskController] 创建图片任务失败:', error.message, error.stack);
        res.status(500).json({ error: errorMsg || '服务器内部错误' });
    }
};
exports.createImageTask = createImageTask;
/**
 * 创建图片编辑任务
 */
const createImageEditTask = async (req, res) => {
    try {
        const { prompt, mainImage, referenceImages, points, sourceImageDimensions, sourceNodeId } = req.body;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: '未授权' });
        }
        if (!mainImage) {
            return res.status(400).json({ error: '主图是必需的' });
        }
        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ error: '编辑指令是必需的' });
        }
        logger_1.default.info(`[TaskController] 创建图片编辑任务: ${prompt.substring(0, 50)}...`, {
            hasMainImage: !!mainImage,
            referenceImagesCount: referenceImages?.length || 0,
            pointsCount: points?.length || 0,
            sourceImageDimensions,
        });
        // 创建任务（权限检查和扣费在 taskService 中处理）
        const task = await task_service_1.default.createTask({
            userId,
            type: 'IMAGE',
            modelId: 'image-editing', // 特殊标识，用于区分图片编辑任务
            model: {
                id: 'image-editing',
                name: 'Image Editing',
                provider: 'gemini-editing',
                type: 'IMAGE_GENERATION',
                isActive: true,
            },
            prompt,
            ratio: sourceImageDimensions ? `${sourceImageDimensions.width}:${sourceImageDimensions.height}` : '1:1',
            referenceImages: [mainImage, ...(referenceImages || [])],
            sourceNodeId: sourceNodeId || undefined,
            metadata: {
                nodeType: 'image_editing', // 用于计费
                isImageEditing: true,
                points: points || [],
                sourceImageDimensions,
            },
        });
        res.json({
            success: true,
            taskId: task.id,
            status: task.status,
            isFreeUsage: task.isFreeUsage,
            freeUsageRemaining: task.freeUsageRemaining,
            creditsCharged: task.creditsCharged,
        });
    }
    catch (error) {
        // 检查是否是权限相关错误
        const errorMsg = error.message || '';
        const isPermissionError = errorMsg.includes('无权') ||
            errorMsg.includes('没有权限') ||
            errorMsg.includes('并发') ||
            errorMsg.includes('次数') ||
            errorMsg.includes('积分不足') ||
            errorMsg.includes('等级');
        if (isPermissionError) {
            logger_1.default.warn(`[TaskController] 权限限制: ${errorMsg}`);
            return res.status(403).json({
                success: false,
                error: errorMsg,
                code: 'PERMISSION_DENIED'
            });
        }
        logger_1.default.error('[TaskController] 创建图片编辑任务失败:', error.message, error.stack);
        res.status(500).json({ error: errorMsg || '服务器内部错误' });
    }
};
exports.createImageEditTask = createImageEditTask;
/**
 * 创建视频生成任务
 */
const createVideoTask = async (req, res) => {
    try {
        const { modelId, prompt, ratio, referenceImages, roleIds, subjects, generationType, sourceNodeId, metadata } = req.body;
        // duration 和 resolution 可能在顶层或 metadata 中
        const duration = req.body.duration || req.body.metadata?.duration;
        const resolution = req.body.resolution || req.body.metadata?.resolution;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: '未授权' });
        }
        if (!modelId) {
            return res.status(400).json({ error: '缺少模型ID' });
        }
        const normalizeGen = (t) => {
            const s = (t || '').toLowerCase().replace(/[_\-\s]+/g, ' ');
            if (!s)
                return '';
            if (s.includes('文生') || s.includes('text to video') || s.includes('t2v') || s.includes('text2video'))
                return '文生视频';
            if (s.includes('首尾') || s.includes('first last') || s.includes('two frame') || s.includes('frame pair') || s.includes('first-last'))
                return '首尾帧';
            if (s.includes('首帧') || s.includes('first frame') || s.includes('start frame') || s.includes('initial frame') || s.includes('keyframe'))
                return '首帧';
            if (s.includes('尾帧') || s.includes('last frame') || s.includes('end frame') || s.includes('final frame'))
                return '尾帧';
            if (s.includes('主体参考') || s.includes('subject reference'))
                return '参考图';
            if (s.includes('参考') || s.includes('reference image') || s.includes('image reference') || s.includes('ref image'))
                return '参考图';
            return t || '';
        };
        const genLabel = normalizeGen(generationType) || '文生视频';
        const promptRequired = genLabel === '文生视频' || genLabel === '参考图';
        if (promptRequired && !prompt) {
            return res.status(400).json({ error: '提示词是必需的' });
        }
        // 获取模型配置
        const model = await index_1.prisma.aIModel.findUnique({
            where: { id: modelId },
        });
        if (!model) {
            return res.status(404).json({ error: '模型不存在' });
        }
        if (!model.isActive) {
            return res.status(400).json({ error: '模型未启用' });
        }
        if (model.type !== 'VIDEO_GENERATION') {
            return res.status(400).json({ error: '该模型不支持视频生成' });
        }
        logger_1.default.info(`[TaskController] 创建视频生成任务:`, {
            modelId,
            provider: model.provider,
            modelName: model.name,
            generationType: genLabel,
            prompt: (prompt || '').substring(0, 50),
            ratio,
            duration,
            resolution,
            metadata,
            referenceImagesCount: referenceImages?.length || 0,
            roleIdsCount: roleIds?.length || 0,
            subjectsCount: subjects?.length || 0,
        });
        // 创建任务（权限检查和扣费在 taskService 中处理）
        const task = await task_service_1.default.createTask({
            userId,
            type: 'VIDEO',
            modelId,
            model,
            prompt: prompt || '',
            ratio: ratio || '16:9',
            referenceImages: referenceImages || [],
            roleIds: roleIds || [],
            subjects: subjects || [],
            generationType: genLabel,
            sourceNodeId: sourceNodeId || undefined,
            metadata: {
                ...(metadata || {}),
                duration,
                resolution,
            },
        });
        res.json({
            success: true,
            taskId: task.id,
            status: task.status,
            isFreeUsage: task.isFreeUsage,
            freeUsageRemaining: task.freeUsageRemaining,
            creditsCharged: task.creditsCharged,
        });
    }
    catch (error) {
        // 检查是否是权限相关错误
        const isPermissionError = error.message?.includes('无权') ||
            error.message?.includes('没有权限') ||
            error.message?.includes('并发') ||
            error.message?.includes('次数') ||
            error.message?.includes('积分不足');
        if (isPermissionError) {
            logger_1.default.warn(`[TaskController] 权限限制: ${error.message}`);
            return res.status(403).json({
                success: false,
                error: error.message,
                code: 'PERMISSION_DENIED'
            });
        }
        logger_1.default.error('[TaskController] 创建视频任务失败:', error);
        res.status(500).json({ error: error.message || '服务器内部错误' });
    }
};
exports.createVideoTask = createVideoTask;
/**
 * 创建视频编辑任务（wan2.2-animate-mix 等专用）
 */
const createVideoEditTask = async (req, res) => {
    try {
        const { modelId, prompt, referenceImages, sourceNodeId, metadata, generationType, mode } = req.body;
        // duration 可能在顶层或 metadata 中
        const duration = req.body.duration || req.body.metadata?.duration;
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: '未授权' });
        if (!modelId)
            return res.status(400).json({ error: '缺少模型ID' });
        const model = await index_1.prisma.aIModel.findUnique({ where: { id: modelId } });
        if (!model)
            return res.status(404).json({ error: '模型不存在' });
        if (!model.isActive)
            return res.status(400).json({ error: '模型未启用' });
        if (model.type !== 'VIDEO_EDITING')
            return res.status(400).json({ error: '该模型不支持视频编辑' });
        logger_1.default.info(`[TaskController] 创建视频编辑任务:`, {
            modelId,
            generationType: generationType || '视频换人',
            duration,
            mode,
        });
        // 创建任务（权限检查和扣费在 taskService 中处理）
        const task = await task_service_1.default.createTask({
            userId,
            type: 'VIDEO',
            modelId,
            model,
            prompt: prompt || '',
            ratio: '16:9',
            referenceImages: referenceImages || [],
            generationType: generationType || '视频换人',
            sourceNodeId: sourceNodeId || undefined,
            metadata: {
                ...(metadata || {}),
                duration,
                mode,
            },
        });
        res.json({
            success: true,
            taskId: task.id,
            status: task.status,
            isFreeUsage: task.isFreeUsage,
            freeUsageRemaining: task.freeUsageRemaining,
            creditsCharged: task.creditsCharged,
        });
    }
    catch (error) {
        // 检查是否是权限相关错误
        const isPermissionError = error.message?.includes('无权') ||
            error.message?.includes('没有权限') ||
            error.message?.includes('并发') ||
            error.message?.includes('次数') ||
            error.message?.includes('积分不足');
        if (isPermissionError) {
            logger_1.default.warn(`[TaskController] 权限限制: ${error.message}`);
            return res.status(403).json({
                success: false,
                error: error.message,
                code: 'PERMISSION_DENIED'
            });
        }
        logger_1.default.error('[TaskController] 创建视频编辑任务失败:', error);
        res.status(500).json({ error: error.message || '服务器内部错误' });
    }
};
exports.createVideoEditTask = createVideoEditTask;
/**
 * 查询任务状态
 */
const getTaskStatus = async (req, res) => {
    try {
        const { taskId } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: '未授权' });
        }
        const task = await task_service_1.default.getTask(taskId);
        // 验证任务权限：所有者或工作流协作者
        if (task.userId !== userId) {
            // 检查是否是工作流协作者（通过查找用户有权限的工作流）
            // 🚀 优化：不加载 data 字段（最大 14MB），改用直接查询 nodes 表
            const sharedWorkflowIds = await index_1.prisma.workflowShare.findMany({
                where: { targetUserId: userId },
                select: { workflowId: true }
            });
            const workflowIdList = sharedWorkflowIds.map(s => s.workflowId);
            // 检查 sourceNodeId 是否属于用户有权访问的工作流
            let hasAccess = false;
            if (task.sourceNodeId && workflowIdList.length > 0) {
                // 直接查询数据库检查 sourceNodeId 是否在共享的工作流中
                const nodeExists = await index_1.prisma.$queryRaw `
          SELECT EXISTS(
            SELECT 1 FROM workflows 
            WHERE id = ANY(${workflowIdList}::text[])
            AND data->'nodes' @> ${JSON.stringify([{ id: task.sourceNodeId }])}::jsonb
          ) as exists
        `;
                hasAccess = nodeExists[0]?.exists || false;
            }
            if (!hasAccess) {
                return res.status(403).json({ error: '无权访问此任务' });
            }
        }
        // 检测僵尸任务：PROCESSING状态但超过30分钟未更新
        if (task.status === 'PROCESSING') {
            const now = new Date();
            const updatedAt = new Date(task.updatedAt);
            const minutesStuck = (now.getTime() - updatedAt.getTime()) / 1000 / 60;
            if (minutesStuck > 30) {
                logger_1.default.warn(`[TaskController] 检测到僵尸任务: ${taskId}, 已卡住 ${Math.floor(minutesStuck)} 分钟`);
                // 将僵尸任务标记为失败
                await index_1.prisma.generationTask.update({
                    where: { id: taskId },
                    data: {
                        status: 'FAILURE',
                        errorMessage: `任务处理超时 (${Math.floor(minutesStuck)} 分钟无响应)`,
                        completedAt: new Date(),
                    },
                });
                // 返回更新后的状态
                return res.json({
                    success: true,
                    task: {
                        id: task.id,
                        type: task.type,
                        status: 'FAILURE',
                        progress: task.progress,
                        resultUrl: (0, oss_1.toCdnUrl)(task.resultUrl || ''),
                        errorMessage: `任务处理超时 (${Math.floor(minutesStuck)} 分钟无响应)`,
                        createdAt: task.createdAt,
                        completedAt: new Date(),
                    },
                });
            }
        }
        res.json({
            success: true,
            task: {
                id: task.id,
                type: task.type,
                status: task.status,
                progress: task.progress,
                resultUrl: (0, oss_1.toCdnUrl)(task.resultUrl || ''),
                previewNodeData: task.previewNodeData, // 预览节点数据（包含URL和ratio）
                errorMessage: task.errorMessage,
                metadata: task.metadata, // 包含角色创建结果等额外信息
                createdAt: task.createdAt,
                completedAt: task.completedAt,
            },
        });
    }
    catch (error) {
        logger_1.default.error('[TaskController] 查询任务失败:', { taskId: req.params.taskId, error: error.message, stack: error.stack });
        res.status(500).json({ error: error.message || '查询任务失败' });
    }
};
exports.getTaskStatus = getTaskStatus;
/**
 * 获取用户的任务列表
 */
const getUserTasks = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: '未授权' });
        }
        const limit = parseInt(req.query.limit) || 50;
        const tasks = await task_service_1.default.getUserTasks(userId, limit);
        res.json({
            success: true,
            tasks: tasks.map(task => ({
                id: task.id,
                type: task.type,
                status: task.status,
                progress: task.progress,
                prompt: task.prompt.substring(0, 100),
                resultUrl: (0, oss_1.toCdnUrl)(task.resultUrl || ''),
                createdAt: task.createdAt,
                completedAt: task.completedAt,
            })),
        });
    }
    catch (error) {
        logger_1.default.error('[TaskController] 获取任务列表失败:', error);
        res.status(500).json({ error: error.message });
    }
};
exports.getUserTasks = getUserTasks;
/**
 * 获取进行中的任务（用于页面刷新后恢复轮询）
 */
const getActiveTask = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { sourceNodeId } = req.query;
        if (!userId) {
            return res.status(401).json({ error: '未授权' });
        }
        if (!sourceNodeId) {
            return res.status(400).json({ error: '缺少源节点ID' });
        }
        // 查询该节点上进行中的任务
        const task = await index_1.prisma.generationTask.findFirst({
            where: {
                userId,
                sourceNodeId: sourceNodeId,
                status: { in: ['PENDING', 'PROCESSING'] },
            },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                type: true,
                status: true,
                progress: true,
                createdAt: true,
            },
        });
        res.json({
            success: true,
            task: task || null,
        });
    }
    catch (error) {
        logger_1.default.error('[TaskController] 获取进行中任务失败:', error);
        res.status(500).json({ error: error.message });
    }
};
exports.getActiveTask = getActiveTask;
/**
 * 获取待创建的预览节点（用于页面刷新后恢复）
 */
const getPendingPreviewNodes = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { sourceNodeId } = req.query;
        if (!userId) {
            return res.status(401).json({ error: '未授权' });
        }
        if (!sourceNodeId) {
            return res.status(400).json({ error: '缺少源节点ID' });
        }
        // 🚀 优化：只选择需要的字段，排除 referenceImages（13MB）
        const tasks = await index_1.prisma.generationTask.findMany({
            where: {
                userId,
                sourceNodeId: sourceNodeId,
                status: 'SUCCESS',
                previewNodeCreated: false,
            },
            orderBy: { completedAt: 'asc' },
            select: {
                id: true,
                type: true,
                previewNodeData: true,
            },
        });
        res.json({
            success: true,
            tasks,
        });
    }
    catch (error) {
        logger_1.default.error('[TaskController] 获取待创建预览节点失败:', error);
        res.status(500).json({ error: error.message });
    }
};
exports.getPendingPreviewNodes = getPendingPreviewNodes;
/**
 * 创建分镜脚本任务（TEXT → JSON → 保存到 Episode.scriptJson）
 */
const createStoryboardTask = async (req, res) => {
    try {
        const { projectId, episodeId, roleId, prompt, systemPrompt, temperature, attachments } = req.body;
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: '未授权' });
        if (!projectId || !episodeId || !roleId)
            return res.status(400).json({ error: '缺少必要参数' });
        const role = await index_1.prisma.agentRole.findUnique({
            where: { id: roleId },
            include: { aiModel: true },
        });
        if (!role || !role.aiModel)
            return res.status(404).json({ error: '角色或模型不存在' });
        if (!role.aiModel.isActive || role.aiModel.type !== 'TEXT_GENERATION')
            return res.status(400).json({ error: '模型未启用或不支持文本生成' });
        const mergedSystem = [role.systemPrompt || '', systemPrompt || ''].filter(Boolean).join('\n\n');
        const task = await task_service_1.default.createTask({
            userId,
            type: 'STORYBOARD',
            modelId: role.aiModel.id,
            model: role.aiModel,
            prompt: String(prompt || ''),
            metadata: {
                projectId,
                episodeId,
                systemPrompt: mergedSystem,
                temperature: temperature ?? role.temperature ?? 0,
                attachments: attachments || {},
            },
        });
        res.json({ success: true, taskId: task.id, status: task.status });
    }
    catch (error) {
        // 检查是否是权限相关错误
        const isPermissionError = error.message?.includes('无权') ||
            error.message?.includes('没有权限') ||
            error.message?.includes('并发') ||
            error.message?.includes('次数') ||
            error.message?.includes('积分不足');
        if (isPermissionError) {
            logger_1.default.warn(`[TaskController] 权限限制: ${error.message}`);
            return res.status(403).json({
                success: false,
                error: error.message,
                code: 'PERMISSION_DENIED'
            });
        }
        logger_1.default.error('[TaskController] 创建分镜脚本任务失败:', error);
        res.status(500).json({ error: error.message || '服务器内部错误' });
    }
};
exports.createStoryboardTask = createStoryboardTask;
/**
 * 标记预览节点已创建
 */
const markPreviewNodeCreated = async (req, res) => {
    try {
        const { taskId } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: '未授权' });
        }
        const task = await task_service_1.default.getTask(taskId);
        // 验证任务属于当前用户
        if (task.userId !== userId) {
            return res.status(403).json({ error: '无权访问此任务' });
        }
        await index_1.prisma.generationTask.update({
            where: { id: taskId },
            data: { previewNodeCreated: true },
        });
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error('[TaskController] 标记预览节点失败:', error);
        res.status(500).json({ error: error.message });
    }
};
exports.markPreviewNodeCreated = markPreviewNodeCreated;
/**
 * 保存节点任务ID到Redis
 */
const saveNodeTask = async (req, res) => {
    try {
        const { nodeId, taskId } = req.body;
        const userId = req.user?.id;
        if (!userId || !nodeId || !taskId) {
            return res.status(400).json({ error: '缺少必要参数' });
        }
        const key = `${NODE_TASK_PREFIX}${userId}:${nodeId}`;
        // 保存24小时，防止永久占用
        await index_1.redis.set(key, taskId, 'EX', 86400);
        logger_1.default.info(`[TaskController] 已保存节点任务到 Redis: key=${key}, taskId=${taskId}`);
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error('[TaskController] 保存节点任务失败:', error);
        res.status(500).json({ error: error.message });
    }
};
exports.saveNodeTask = saveNodeTask;
/**
 * 获取节点的任务ID（批量）
 */
const getNodeTasks = async (req, res) => {
    try {
        const { nodeIds } = req.body;
        const userId = req.user?.id;
        if (!userId || !nodeIds || !Array.isArray(nodeIds)) {
            return res.status(400).json({ error: '缺少必要参数' });
        }
        const result = {};
        for (const nodeId of nodeIds) {
            const key = `${NODE_TASK_PREFIX}${userId}:${nodeId}`;
            const taskId = await index_1.redis.get(key);
            if (taskId) {
                result[nodeId] = taskId;
            }
        }
        res.json({ success: true, tasks: result });
    }
    catch (error) {
        logger_1.default.error('[TaskController] 获取节点任务失败:', error);
        res.status(500).json({ error: error.message });
    }
};
exports.getNodeTasks = getNodeTasks;
/**
 * 删除节点的任务ID
 */
const deleteNodeTask = async (req, res) => {
    try {
        const { nodeId } = req.params;
        const userId = req.user?.id;
        if (!userId || !nodeId) {
            return res.status(400).json({ error: '缺少必要参数' });
        }
        const key = `${NODE_TASK_PREFIX}${userId}:${nodeId}`;
        await index_1.redis.del(key);
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error('[TaskController] 删除节点任务失败:', error);
        res.status(500).json({ error: error.message });
    }
};
exports.deleteNodeTask = deleteNodeTask;
//# sourceMappingURL=task.controller.js.map