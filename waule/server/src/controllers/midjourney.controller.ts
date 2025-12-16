import { Request, Response } from 'express';
import midjourneyService from '../services/midjourney.service';
import axios from 'axios';
import { prisma } from '../index';
import { userLevelService } from '../services/user-level.service';
import { billingService } from '../services/billing.service';

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

    // 提交任务到 Midjourney Proxy
    console.log('🔄 [Midjourney Controller] 调用 midjourneyService.imagine...');
    const response = await midjourneyService.imagine({
      prompt,
      userId, // 🔑 传递用户ID
      base64Array,
      nodeId, // 🔑 传递节点ID
    });
    
    console.log('📥 [Midjourney Controller] 收到响应:', response);

    if (response.code !== 1) {
      console.error('❌ [Midjourney Controller] 响应code不是1:', response);
      
      // 特殊处理敏感词错误
      if (response.code === 24) {
        const bannedWord = response.properties?.bannedWord;
        return res.status(400).json({ 
          error: 'Banned word detected',
          description: `提示词包含敏感词: "${bannedWord}"，请修改后重试`,
          bannedWord: bannedWord,
          code: 24
        });
      }
      
      return res.status(500).json({ 
        error: 'Failed to submit task', 
        description: response.description,
        code: response.code
      });
    }

    const taskId = response.result;

    // 保存任务到数据库（可选，用于追踪）
    // 这里简化处理，实际应该创建一个 MidjourneyTask 表
    console.log('✅ [Midjourney Controller] 任务已提交:', taskId);

    res.json({
      success: true,
      taskId,
      description: response.description,
      finalPrompt: response.properties?.finalPrompt,
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

    const result = await midjourneyService.fetch(taskId);

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

    const result = await midjourneyService.pollTask(taskId);

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
      const sourceTask = await midjourneyService.fetch(taskId);
      sourceAction = sourceTask?.action || 'IMAGINE';
      console.log(`[Midjourney] 源任务信息:`, {
        taskId,
        action: sourceTask?.action,
        buttons: sourceTask?.buttons?.map(b => b.label).slice(0, 5),
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
    console.log('   原始taskId:', taskId);

    const response = await midjourneyService.action({ taskId, customId, userId, messageId, messageHash, nodeId });

    console.log('📥 [Midjourney Controller] 收到响应:');
    console.log('   code:', response.code);
    console.log('   description:', response.description);
    console.log('   result (新任务ID):', response.result);
    console.log('   properties:', response.properties);

    // 根据API文档，code: 1=提交成功, 21=已存在, 22=排队中, other=错误
    if (response.code === 1 || response.code === 21 || response.code === 22) {
      // 这些都是正常状态，返回新任务ID
      return res.json({
        success: true,
        taskId: response.result,
        description: response.description,
        code: response.code,
        isFreeUsage: permissionResult.isFree,
        creditsCharged,
      });
    }

    // 其他错误码
    return res.status(500).json({ 
      error: 'Failed to submit action', 
      description: response.description,
      code: response.code,
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
 * Blend（图片混合）
 */
export const blend = async (req: Request, res: Response) => {
  try {
    const { base64Array } = req.body;
    const userId = (req as any).user?.id;

    if (!base64Array || !Array.isArray(base64Array) || base64Array.length < 2) {
      return res.status(400).json({ error: 'At least 2 images required for blend' });
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

    console.log('🎨 [Midjourney Controller] 提交 Blend 任务');

    const response = await midjourneyService.blend(base64Array);

    if (response.code !== 1) {
      return res.status(500).json({ 
        error: 'Failed to submit blend task', 
        description: response.description 
      });
    }

    res.json({
      success: true,
      taskId: response.result,
      description: response.description,
    });
  } catch (error: any) {
    console.error('❌ [Midjourney Controller] Blend 失败:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Describe（图生文）
 */
export const describe = async (req: Request, res: Response) => {
  try {
    const { base64 } = req.body;

    if (!base64) {
      return res.status(400).json({ error: 'Base64 image is required' });
    }

    console.log('📝 [Midjourney Controller] 提交 Describe 任务');

    const response = await midjourneyService.describe(base64);

    if (response.code !== 1) {
      return res.status(500).json({ 
        error: 'Failed to submit describe task', 
        description: response.description 
      });
    }

    res.json({
      success: true,
      taskId: response.result,
      description: response.description,
    });
  } catch (error: any) {
    console.error('❌ [Midjourney Controller] Describe 失败:', error);
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

    console.log('🖼️ [Midjourney Controller] 上传参考图到 Discord');

    let imageBuffer: Buffer;
    let imageName: string;

    // 处理 imageUrl
    if (imageUrl) {
      console.log('📥 [Midjourney Controller] 从 URL 下载图片:', imageUrl);
      
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30秒超时
      });
      
      imageBuffer = Buffer.from(response.data);
      
      // 从 URL 提取文件名
      const urlParts = imageUrl.split('/');
      imageName = urlParts[urlParts.length - 1].split('?')[0] || 'reference.jpg';
      
      console.log(`✅ [Midjourney Controller] 图片下载完成: ${imageBuffer.length} bytes`);
    }
    // 处理 base64
    else if (base64) {
      console.log('🔄 [Midjourney Controller] 转换 base64 为 Buffer');
      
      // 移除 data:image/xxx;base64, 前缀（如果存在）
      const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64Data, 'base64');
      
      imageName = filename || 'reference.jpg';
      
      console.log(`✅ [Midjourney Controller] Base64 转换完成: ${imageBuffer.length} bytes`);
    } else {
      return res.status(400).json({ error: 'Invalid image data' });
    }

    // 调用 Discord 服务上传图片
    const discordUrl = await midjourneyService.uploadReferenceImage(imageBuffer, imageName);

    console.log('✅ [Midjourney Controller] 参考图上传成功:', discordUrl);

    res.json({
      success: true,
      discordUrl,
    });
  } catch (error: any) {
    console.error('❌ [Midjourney Controller] 参考图上传失败:', error);
    res.status(500).json({ error: error.message });
  }
};
