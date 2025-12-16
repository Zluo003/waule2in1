import { Request, Response } from 'express';
import taskService from '../services/task.service';
import { prisma } from '../index';
import logger from '../utils/logger';


/**
 * 创建图片生成任务
 */
export const createImageTask = async (req: Request, res: Response) => {
  try {
    const { modelId, prompt, ratio, imageSize, referenceImages, sourceNodeId, metadata } = req.body;
    const userId = (req as any).user?.id;

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
    const model = await prisma.aIModel.findUnique({
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

    logger.info(`[TaskController] 创建图片生成任务: ${prompt.substring(0, 50)}...`, { 
      referenceImagesCount: referenceImages?.length || 0,
      imageSize,
      ratio,
      metadata,
    });

    // 创建任务（权限检查和扣费在 taskService 中处理）
    const task = await taskService.createTask({
      userId,
      type: 'IMAGE',
      modelId,
      model,
      prompt,
      ratio: ratio || '1:1',
      imageSize: imageSize || undefined,
      referenceImages: referenceImages || [],
      sourceNodeId: sourceNodeId || undefined,
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
  } catch (error: any) {
    // 检查是否是权限相关错误
    const errorMsg = error.message || '';
    const isPermissionError = errorMsg.includes('无权') || 
                              errorMsg.includes('没有权限') ||
                              errorMsg.includes('并发') ||
                              errorMsg.includes('次数') ||
                              errorMsg.includes('积分不足') ||
                              errorMsg.includes('等级');
    
    if (isPermissionError) {
      logger.warn(`[TaskController] 权限限制: ${errorMsg}`);
      return res.status(403).json({ 
        success: false,
        error: errorMsg,
        code: 'PERMISSION_DENIED'
      });
    }

    logger.error('[TaskController] 创建图片任务失败:', error.message, error.stack);
    res.status(500).json({ error: errorMsg || '服务器内部错误' });
  }
};

/**
 * 创建视频生成任务
 */
export const createVideoTask = async (req: Request, res: Response) => {
  try {
    const { modelId, prompt, ratio, referenceImages, roleIds, subjects, generationType, sourceNodeId, metadata } = req.body;
    // duration 和 resolution 可能在顶层或 metadata 中
    const duration = req.body.duration || req.body.metadata?.duration;
    const resolution = req.body.resolution || req.body.metadata?.resolution;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: '未授权' });
    }

    if (!modelId) {
      return res.status(400).json({ error: '缺少模型ID' });
    }

    const normalizeGen = (t?: string): string => {
      const s = (t || '').toLowerCase().replace(/[_\-\s]+/g, ' ');
      if (!s) return '';
      if (s.includes('文生') || s.includes('text to video') || s.includes('t2v') || s.includes('text2video')) return '文生视频';
      if (s.includes('首尾') || s.includes('first last') || s.includes('two frame') || s.includes('frame pair') || s.includes('first-last')) return '首尾帧';
      if (s.includes('首帧') || s.includes('first frame') || s.includes('start frame') || s.includes('initial frame') || s.includes('keyframe')) return '首帧';
      if (s.includes('尾帧') || s.includes('last frame') || s.includes('end frame') || s.includes('final frame')) return '尾帧';
      if (s.includes('主体参考') || s.includes('subject reference')) return '参考图';
      if (s.includes('参考') || s.includes('reference image') || s.includes('image reference') || s.includes('ref image')) return '参考图';
      return t || '';
    };

    const genLabel = normalizeGen(generationType) || '文生视频';
    const promptRequired = genLabel === '文生视频' || genLabel === '参考图';
    if (promptRequired && !prompt) {
      return res.status(400).json({ error: '提示词是必需的' });
    }

    // 获取模型配置
    const model = await prisma.aIModel.findUnique({
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

    logger.info(`[TaskController] 创建视频生成任务:`, {
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
    const task = await taskService.createTask({
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
  } catch (error: any) {
    // 检查是否是权限相关错误
    const isPermissionError = error.message?.includes('无权') || 
                              error.message?.includes('没有权限') ||
                              error.message?.includes('并发') ||
                              error.message?.includes('次数') ||
                              error.message?.includes('积分不足');
    
    if (isPermissionError) {
      logger.warn(`[TaskController] 权限限制: ${error.message}`);
      return res.status(403).json({ 
        success: false,
        error: error.message,
        code: 'PERMISSION_DENIED'
      });
    }

    logger.error('[TaskController] 创建视频任务失败:', error);
    res.status(500).json({ error: error.message || '服务器内部错误' });
  }
};

/**
 * 创建视频编辑任务（wan2.2-animate-mix 等专用）
 */
export const createVideoEditTask = async (req: Request, res: Response) => {
  try {
    const { modelId, prompt, referenceImages, sourceNodeId, metadata, generationType, mode } = req.body;
    // duration 可能在顶层或 metadata 中
    const duration = req.body.duration || req.body.metadata?.duration;
    const userId = (req as any).user?.id;

    if (!userId) return res.status(401).json({ error: '未授权' });
    if (!modelId) return res.status(400).json({ error: '缺少模型ID' });

    const model = await prisma.aIModel.findUnique({ where: { id: modelId } });
    if (!model) return res.status(404).json({ error: '模型不存在' });
    if (!model.isActive) return res.status(400).json({ error: '模型未启用' });
    if (model.type !== 'VIDEO_EDITING') return res.status(400).json({ error: '该模型不支持视频编辑' });

    logger.info(`[TaskController] 创建视频编辑任务:`, {
      modelId,
      generationType: generationType || '视频换人',
      duration,
      mode,
    });

    // 创建任务（权限检查和扣费在 taskService 中处理）
    const task = await taskService.createTask({
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
    } as any);

    res.json({ 
      success: true, 
      taskId: task.id, 
      status: task.status,
      isFreeUsage: task.isFreeUsage,
      freeUsageRemaining: task.freeUsageRemaining,
      creditsCharged: task.creditsCharged,
    });
  } catch (error: any) {
    // 检查是否是权限相关错误
    const isPermissionError = error.message?.includes('无权') || 
                              error.message?.includes('没有权限') ||
                              error.message?.includes('并发') ||
                              error.message?.includes('次数') ||
                              error.message?.includes('积分不足');
    
    if (isPermissionError) {
      logger.warn(`[TaskController] 权限限制: ${error.message}`);
      return res.status(403).json({ 
        success: false,
        error: error.message,
        code: 'PERMISSION_DENIED'
      });
    }

    logger.error('[TaskController] 创建视频编辑任务失败:', error);
    res.status(500).json({ error: error.message || '服务器内部错误' });
  }
};

/**
 * 查询任务状态
 */
export const getTaskStatus = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: '未授权' });
    }

    const task = await taskService.getTask(taskId);

    // 验证任务权限：所有者或工作流协作者
    if (task.userId !== userId) {
      // 检查是否是工作流协作者（通过查找用户有权限的工作流）
      // 🚀 优化：不加载 data 字段（最大 14MB），改用直接查询 nodes 表
      const sharedWorkflowIds = await prisma.workflowShare.findMany({
        where: { targetUserId: userId },
        select: { workflowId: true }
      });
      const workflowIdList = sharedWorkflowIds.map(s => s.workflowId);
      
      // 检查 sourceNodeId 是否属于用户有权访问的工作流
      let hasAccess = false;
      if (task.sourceNodeId && workflowIdList.length > 0) {
        // 直接查询数据库检查 sourceNodeId 是否在共享的工作流中
        const nodeExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
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
        logger.warn(`[TaskController] 检测到僵尸任务: ${taskId}, 已卡住 ${Math.floor(minutesStuck)} 分钟`);
        
        // 将僵尸任务标记为失败
        await prisma.generationTask.update({
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
            resultUrl: task.resultUrl,
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
        resultUrl: task.resultUrl,
        previewNodeData: task.previewNodeData, // 预览节点数据（包含URL和ratio）
        errorMessage: task.errorMessage,
        metadata: task.metadata, // 包含角色创建结果等额外信息
        createdAt: task.createdAt,
        completedAt: task.completedAt,
      },
    });
  } catch (error: any) {
    logger.error('[TaskController] 查询任务失败:', { taskId: req.params.taskId, error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message || '查询任务失败' });
  }
};

/**
 * 获取用户的任务列表
 */
export const getUserTasks = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: '未授权' });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const tasks = await taskService.getUserTasks(userId, limit);

    res.json({
      success: true,
      tasks: tasks.map(task => ({
        id: task.id,
        type: task.type,
        status: task.status,
        progress: task.progress,
        prompt: task.prompt.substring(0, 100),
        resultUrl: task.resultUrl,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
      })),
    });
  } catch (error: any) {
    logger.error('[TaskController] 获取任务列表失败:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * 获取进行中的任务（用于页面刷新后恢复轮询）
 */
export const getActiveTask = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { sourceNodeId } = req.query;

    if (!userId) {
      return res.status(401).json({ error: '未授权' });
    }

    if (!sourceNodeId) {
      return res.status(400).json({ error: '缺少源节点ID' });
    }

    // 查询该节点上进行中的任务
    const task = await prisma.generationTask.findFirst({
      where: {
        userId,
        sourceNodeId: sourceNodeId as string,
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
  } catch (error: any) {
    logger.error('[TaskController] 获取进行中任务失败:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * 获取待创建的预览节点（用于页面刷新后恢复）
 */
export const getPendingPreviewNodes = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { sourceNodeId } = req.query;

    if (!userId) {
      return res.status(401).json({ error: '未授权' });
    }

    if (!sourceNodeId) {
      return res.status(400).json({ error: '缺少源节点ID' });
    }

    // 🚀 优化：只选择需要的字段，排除 referenceImages（13MB）
    const tasks = await prisma.generationTask.findMany({
      where: {
        userId,
        sourceNodeId: sourceNodeId as string,
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
  } catch (error: any) {
    logger.error('[TaskController] 获取待创建预览节点失败:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * 创建分镜脚本任务（TEXT → JSON → 保存到 Episode.scriptJson）
 */
export const createStoryboardTask = async (req: Request, res: Response) => {
  try {
    const { projectId, episodeId, roleId, prompt, systemPrompt, temperature, attachments } = req.body;
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: '未授权' });
    if (!projectId || !episodeId || !roleId) return res.status(400).json({ error: '缺少必要参数' });

    const role = await prisma.agentRole.findUnique({
      where: { id: roleId },
      include: { aiModel: true },
    });
    if (!role || !role.aiModel) return res.status(404).json({ error: '角色或模型不存在' });
    if (!role.aiModel.isActive || role.aiModel.type !== 'TEXT_GENERATION') return res.status(400).json({ error: '模型未启用或不支持文本生成' });

    const mergedSystem = [role.systemPrompt || '', systemPrompt || ''].filter(Boolean).join('\n\n');

    const task = await taskService.createTask({
      userId,
      type: 'STORYBOARD' as any,
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
  } catch (error: any) {
    // 检查是否是权限相关错误
    const isPermissionError = error.message?.includes('无权') || 
                              error.message?.includes('没有权限') ||
                              error.message?.includes('并发') ||
                              error.message?.includes('次数') ||
                              error.message?.includes('积分不足');
    
    if (isPermissionError) {
      logger.warn(`[TaskController] 权限限制: ${error.message}`);
      return res.status(403).json({ 
        success: false,
        error: error.message,
        code: 'PERMISSION_DENIED'
      });
    }

    logger.error('[TaskController] 创建分镜脚本任务失败:', error);
    res.status(500).json({ error: error.message || '服务器内部错误' });
  }
};

/**
 * 标记预览节点已创建
 */
export const markPreviewNodeCreated = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: '未授权' });
    }

    const task = await taskService.getTask(taskId);

    // 验证任务属于当前用户
    if (task.userId !== userId) {
      return res.status(403).json({ error: '无权访问此任务' });
    }

    await prisma.generationTask.update({
      where: { id: taskId },
      data: { previewNodeCreated: true },
    });

    res.json({ success: true });
  } catch (error: any) {
    logger.error('[TaskController] 标记预览节点失败:', error);
    res.status(500).json({ error: error.message });
  }
};

