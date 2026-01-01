import { Request, Response } from 'express';
import { getGlobalWauleApiClient } from '../services/waule-api.client';
import { userLevelService } from '../services/user-level.service';
import { billingService } from '../services/billing.service';

// 获取 ai-gateway 客户端
function getApiClient() {
  const client = getGlobalWauleApiClient();
  if (!client) {
    throw new Error('WAULEAPI_URL 未配置，无法连接 ai-gateway');
  }
  return client;
}

/**
 * 提交 Imagine 任务
 */
export const imagine = async (req: Request, res: Response) => {
  try {
    const { prompt, base64Array, nodeId, mode } = req.body;
    const userId = (req as any).user?.id;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // 统一使用 'midjourney' moduleType
    const mjMode = mode || 'relax';
    const modeName = mjMode === 'fast' ? 'Fast' : 'Relax';

    // 权限检查
    const permissionResult = await userLevelService.checkPermission({
      userId,
      moduleType: 'midjourney',
    });

    if (!permissionResult.allowed) {
      console.log(`[Midjourney] 用户 ${userId} 无权使用: ${permissionResult.reason}`);
      return res.status(403).json({
        success: false,
        error: permissionResult.reason || '您没有权限使用 Midjourney',
        code: 'PERMISSION_DENIED',
      });
    }

    // 扣费逻辑：如果不是免费使用，需要扣费
    let creditsCharged = 0;
    if (!permissionResult.isFree) {
      try {
        const usageRecord = await billingService.chargeUser({
          userId,
          moduleType: 'midjourney',
          operationType: 'imagine',  // 小写，匹配数据库
          mode: mjMode,              // 'relax' 或 'fast'，小写
          operation: `Midjourney Imagine (${modeName})`,
          quantity: 1,
        });
        creditsCharged = usageRecord?.creditsCharged || 0;
        console.log(`[Midjourney] 用户 ${userId} Imagine (${mjMode}) 扣费成功: ${creditsCharged} 积分`);
      } catch (error: any) {
        console.error(`[Midjourney] 扣费失败:`, error.message);
        return res.status(402).json({
          success: false,
          error: '积分不足，请充值后再试',
          code: 'INSUFFICIENT_CREDITS',
        });
      }
    } else {
      console.log(`[Midjourney] 用户 ${userId} 使用免费额度 (${mjMode})`);
    }

    console.log('📤 [Midjourney Controller] 提交 Imagine 任务:', { prompt, nodeId, userId, isFree: permissionResult.isFree });

    // 调用 ai-gateway 的 Midjourney API
    const apiClient = getApiClient();
    const response = await apiClient.midjourneyImagine({ prompt, userId });

    console.log('📥 [Midjourney Controller] 收到响应:', response);

    if (!response.success) {
      return res.status(500).json({
        error: 'Failed to submit task',
        description: response.message,
      });
    }

    const taskId = response.taskId;

    // 保存任务到数据库（可选，用于追踪）
    // 这里简化处理，实际应该创建一个 MidjourneyTask 表
    console.log('✅ [Midjourney Controller] 任务已提交:', taskId);

    res.json({
      success: true,
      taskId,
      isFreeUsage: permissionResult.isFree,
      creditsCharged,
    });
  } catch (error: any) {
    console.error('❌ [Midjourney Controller] Imagine 失败:', error.message);
    
    // 检查是否是任务限制错误
    if (error.message?.includes('只允许同时执行一个')) {
      return res.status(429).json({ 
        success: false,
        error: error.message,
        code: 'TASK_LIMIT_EXCEEDED',
      });
    }
    
    res.status(500).json({ error: error.message });
  }
};

/**
 * 查询任务状态
 */
export const fetchTask = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    console.log('🔍 [Midjourney Controller] 查询任务:', taskId);

    const apiClient = getApiClient();
    const result = await apiClient.midjourneyGetTask(taskId);

    res.json({
      success: true,
      task: result,
    });
  } catch (error: any) {
    console.error('❌ [Midjourney Controller] 查询任务失败:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * 轮询任务直到完成
 */
export const pollTask = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    console.log('⏳ [Midjourney Controller] 开始轮询任务:', taskId);

    const apiClient = getApiClient();
    const result = await apiClient.midjourneyWaitTask(taskId, 300000);

    console.log('✅ [Midjourney Controller] 任务完成:', taskId);

    res.json({
      success: true,
      task: result,
    });
  } catch (error: any) {
    console.error('❌ [Midjourney Controller] 轮询任务失败:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * 执行动作（Upscale、Variation 等）
 */
export const action = async (req: Request, res: Response) => {
  try {
    const { taskId, customId, messageId, messageHash, nodeId, mode } = req.body;
    const userId = (req as any).user?.id;
    
    // 继承主节点的模式，默认为 Relax
    const mjMode = mode || 'relax';
    const modeName = mjMode === 'fast' ? 'Fast' : 'Relax';

    if (!taskId || !customId) {
      return res.status(400).json({ error: 'TaskId and customId are required' });
    }

    // 权限检查
    const permissionResult = await userLevelService.checkPermission({
      userId,
      moduleType: 'midjourney',
    });

    if (!permissionResult.allowed) {
      return res.status(403).json({
        success: false,
        error: permissionResult.reason || '您没有权限使用 Midjourney',
        code: 'PERMISSION_DENIED',
      });
    }

    // 判断操作类型
    let operationType = 'Variation';
    let isUpscaleOrVariation = false;
    let isLikeButton = false;
    
    if (customId.includes('upsample') || customId.includes('Upscale')) {
      operationType = 'Upscale';
      isUpscaleOrVariation = true;
    } else if (customId.includes('variation') || customId.includes('Vary')) {
      operationType = 'Variation';
      isUpscaleOrVariation = true;
    } else if (customId.includes('reroll')) {
      operationType = 'Reroll';
    } else if (customId.includes('MJ::BOOKMARK') || customId.includes('like')) {
      isLikeButton = true;
    }

    // 获取原任务信息，判断是四宫格还是单张图
    let sourceAction = 'IMAGINE';
    try {
      const apiClient = getApiClient();
      const sourceTask = await apiClient.midjourneyGetTask(taskId);
      // ai-gateway 返回的 status 可能是 SUCCESS/IN_PROGRESS 等
      // 根据 buttons 判断是否是四宫格
      const hasUpscaleButtons = sourceTask.buttons?.some(b =>
        b.customId?.includes('upsample') || b.label?.includes('U')
      );
      if (!hasUpscaleButtons) {
        sourceAction = 'UPSCALE'; // 单张图
      }
      console.log(`[Midjourney] 源任务信息:`, {
        taskId,
        status: sourceTask.status,
        hasUpscaleButtons,
      });
    } catch (e: any) {
      console.warn(`[Midjourney] 无法获取源任务信息，默认为四宫格:`, e.message);
    }

    // 扣费逻辑：
    // 1. 四宫格（IMAGINE）的 U1-U4、V1-V4 不扣费
    // 2. 单张图（UPSCALE/VARIATION）的所有按钮需要扣费（点赞除外）
    const isFromGrid = sourceAction === 'IMAGINE';
    const shouldCharge = !isLikeButton && !isFromGrid;
    
    console.log(`[Midjourney] 扣费判断:`, {
      operationType,
      sourceAction,
      isFromGrid,
      isLikeButton,
      shouldCharge,
    });

    let creditsCharged = 0;
    // 操作类型映射为小写，匹配数据库
    const operationTypeLower = operationType.toLowerCase();
    // Upscale 无法传递模式参数，固定按 Relax 模式计费
    const billingMode = operationType === 'Upscale' ? 'relax' : mjMode;
    
    if (shouldCharge && !permissionResult.isFree) {
      try {
        const usageRecord = await billingService.chargeUser({
          userId,
          moduleType: 'midjourney',
          operationType: operationTypeLower,  // 小写，匹配数据库
          mode: billingMode,                   // Upscale 固定 relax，其他继承主节点
          operation: `Midjourney ${operationType} (${billingMode})`,
          quantity: 1,
        });
        creditsCharged = usageRecord?.creditsCharged || 0;
        console.log(`[Midjourney] 用户 ${userId} ${operationType} (${billingMode}) 扣费成功: ${creditsCharged} 积分`);
      } catch (error: any) {
        console.error(`[Midjourney] ${operationType} 扣费失败:`, error.message);
        return res.status(402).json({
          success: false,
          error: '积分不足，请充值后再试',
          code: 'INSUFFICIENT_CREDITS',
        });
      }
    } else if (shouldCharge && permissionResult.isFree) {
      console.log(`[Midjourney] 用户 ${userId} 使用免费额度执行 ${operationType} (${billingMode})`);
    } else {
      console.log(`[Midjourney] ${operationType} 操作无需扣费 (源: ${sourceAction}, 点赞: ${isLikeButton})`);
    }

    console.log('🎬 [Midjourney Controller] 执行动作:', { taskId, customId, operationType, messageId, messageHash, nodeId, userId });

    // 先查询原任务获取 messageId
    const apiClient = getApiClient();
    let actualMessageId = messageId;
    if (!actualMessageId) {
      const sourceTask = await apiClient.midjourneyGetTask(taskId);
      actualMessageId = sourceTask.messageId;
    }

    if (!actualMessageId) {
      return res.status(400).json({
        error: 'Cannot find messageId for this task',
      });
    }

    const response = await apiClient.midjourneyAction({
      messageId: actualMessageId,
      customId,
      userId,
    });

    console.log('📥 [Midjourney Controller] 收到响应:', response);

    if (response.success) {
      return res.json({
        success: true,
        taskId: response.taskId,
        isFreeUsage: permissionResult.isFree,
        creditsCharged,
      });
    }

    return res.status(500).json({
      error: 'Failed to submit action',
      description: response.message,
    });
  } catch (error: any) {
    console.error('❌ [Midjourney Controller] Action 失败:', error.message);
    
    // 检查是否是任务限制错误
    if (error.message?.includes('只允许同时执行一个')) {
      return res.status(429).json({ 
        success: false,
        error: error.message,
        code: 'TASK_LIMIT_EXCEEDED',
      });
    }
    
    res.status(500).json({ error: error.message });
  }
};

/**
 * 上传参考图到 Discord（用于 V7 Omni-Reference）
 */
export const uploadReferenceImage = async (req: Request, res: Response) => {
  try {
    const { imageUrl, base64, filename } = req.body;

    if (!imageUrl && !base64) {
      return res.status(400).json({ error: 'imageUrl or base64 is required' });
    }

    console.log('🖼️ [Midjourney Controller] 上传参考图');

    // 调用 ai-gateway 上传参考图
    const apiClient = getApiClient();
    const result = await apiClient.midjourneyUploadReference({ imageUrl, base64, filename });

    console.log('✅ [Midjourney Controller] 参考图上传成功:', result.discordUrl);

    res.json({
      success: true,
      discordUrl: result.discordUrl,
    });
  } catch (error: any) {
    console.error('❌ [Midjourney Controller] 参考图上传失败:', error);
    res.status(500).json({ error: error.message });
  }
};
