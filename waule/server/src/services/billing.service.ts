import { BillingType } from '@prisma/client';
import { prisma, redis } from '../index';
import { userLevelService } from './user-level.service';
import { logger } from '../utils/logger';

interface CalculateCreditsParams {
  aiModelId?: string;
  nodeType?: string;
  moduleType?: string;
  quantity?: number;
  duration?: number;
  resolution?: string;
  mode?: string;
  operationType?: string;
  characterCount?: number;
}

interface ChargeUserParams extends CalculateCreditsParams {
  userId: string;
  operation: string;
}

interface ChargeWithPermissionResult {
  success: boolean;
  usageRecord?: any;
  creditsCharged: number;
  isFreeUsage: boolean;
  error?: string;
}

export class BillingService {
  /**
   * 计算应扣除的积分
   */
  async calculateCredits(params: CalculateCreditsParams): Promise<number> {
    let rule = null;
    try {
      rule = await this.getBillingRule(params);
    } catch (error: any) {
      logger.debug('[BillingService] 获取计费规则失败（可能表不存在）:', error.message);
    }
    
    if (!rule) {
      logger.debug('[BillingService] No billing rule found for params:', JSON.stringify(params));
      // 默认计费逻辑：如果没有配置规则，根据类型使用默认值
      // 视频生成：每秒 10 积分
      if (params.duration && params.duration > 0) {
        const defaultCredits = params.duration * 10;
        logger.debug(`[BillingService] 使用默认视频计费: ${params.duration}秒 x 10积分 = ${defaultCredits}积分`);
        return defaultCredits;
      }
      // 图片生成：每张 20 积分
      if (params.quantity && params.quantity > 0) {
        const defaultCredits = params.quantity * 20;
        logger.debug(`[BillingService] 使用默认图片计费: ${params.quantity}张 x 20积分 = ${defaultCredits}积分`);
        return defaultCredits;
      }
      logger.debug('[BillingService] 无法计算积分：没有duration或quantity参数');
      return 0;
    }

    logger.debug('[BillingService] 找到计费规则:', {
      id: rule.id,
      name: rule.name,
      billingType: rule.billingType,
      baseCredits: rule.baseCredits,
      moduleType: rule.moduleType,
    });

    if (!rule.isActive) {
      logger.debug('[BillingService] Billing rule is inactive:', rule.id);
      return 0;
    }

    let credits = 0;

    switch (rule.billingType) {
      case BillingType.PER_REQUEST:
        credits = this.calculatePerRequest(rule, params);
        break;

      case BillingType.PER_IMAGE:
        credits = this.calculatePerImage(rule, params);
        break;

      case BillingType.PER_DURATION:
        credits = this.calculatePerDuration(rule, params);
        break;

      case BillingType.DURATION_RESOLUTION:
        credits = await this.calculateDurationResolution(rule, params);
        break;

      case BillingType.PER_CHARACTER:
        credits = await this.calculatePerCharacter(rule, params);
        break;

      case BillingType.DURATION_MODE:
        credits = await this.calculateDurationMode(rule, params);
        break;

      case BillingType.OPERATION_MODE:
        credits = await this.calculateOperationMode(rule, params);
        break;

      default:
        logger.debug('[BillingService] Unsupported billing type:', rule.billingType);
        // 如果没有匹配的计费类型，使用 baseCredits
        credits = rule.baseCredits || 0;
    }

    logger.debug('[BillingService] 计算结果:', { billingType: rule.billingType, credits });
    return Math.max(0, Math.round(credits));
  }

  /**
   * 🚀 优化：计算积分并返回规则（避免重复查询）
   */
  private async calculateCreditsWithRule(params: CalculateCreditsParams): Promise<{ credits: number; rule: any | null }> {
    let rule = null;
    try {
      rule = await this.getBillingRule(params);
    } catch (error: any) {
      logger.debug('[BillingService] 获取计费规则失败（可能表不存在）:', error.message);
    }
    
    if (!rule) {
      // 默认计费逻辑
      if (params.duration && params.duration > 0) {
        return { credits: params.duration * 10, rule: null };
      }
      if (params.quantity && params.quantity > 0) {
        return { credits: params.quantity * 20, rule: null };
      }
      return { credits: 0, rule: null };
    }

    if (!rule.isActive) {
      return { credits: 0, rule };
    }

    let credits = 0;
    switch (rule.billingType) {
      case BillingType.PER_REQUEST:
        credits = this.calculatePerRequest(rule, params);
        break;
      case BillingType.PER_IMAGE:
        credits = this.calculatePerImage(rule, params);
        break;
      case BillingType.PER_DURATION:
        credits = this.calculatePerDuration(rule, params);
        break;
      case BillingType.DURATION_RESOLUTION:
        credits = await this.calculateDurationResolution(rule, params);
        break;
      case BillingType.PER_CHARACTER:
        credits = await this.calculatePerCharacter(rule, params);
        break;
      case BillingType.DURATION_MODE:
        credits = await this.calculateDurationMode(rule, params);
        break;
      case BillingType.OPERATION_MODE:
        credits = await this.calculateOperationMode(rule, params);
        break;
      default:
        credits = rule.baseCredits || 0;
    }

    return { credits: Math.max(0, Math.round(credits)), rule };
  }

  /**
   * 执行扣费并记录
   */
  async chargeUser(params: ChargeUserParams) {
    logger.debug('[BillingService] chargeUser 收到参数:', JSON.stringify(params));
    // 🚀 优化：一次查询同时获取积分和规则
    const { credits, rule } = await this.calculateCreditsWithRule(params);
    logger.debug('[BillingService] 计算积分结果:', credits);

    if (credits === 0) {
      logger.debug('[BillingService] 积分为0，不扣费。参数:', JSON.stringify(params));
      return null;
    }

    // 检查用户积分
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { credits: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.credits < credits) {
      throw new Error(`Insufficient credits. Required: ${credits}, Available: ${user.credits}`);
    }

    // 先扣除用户积分（不使用事务，确保扣费成功）
    let newBalance = 0;
    try {
      const updatedUser = await prisma.user.update({
        where: { id: params.userId },
        data: { credits: { decrement: credits } },
        select: { credits: true },
      });
      newBalance = updatedUser.credits;
      // 🚀 清除用户资料缓存（积分已变化）
      try { await redis.del(`user:profile:${params.userId}`); } catch {}
      logger.debug(`[BillingService] 已扣除 ${credits} 积分，用户: ${params.userId}`);
    } catch (error: any) {
      console.error('[BillingService] 扣除积分失败:', error.message);
      throw error;
    }

    // 尝试创建使用记录（可选，表可能不存在）
    let usageRecord: any = { id: 'no-record', creditsCharged: credits };
    try {
      // 🚀 优化：复用上面已查询的 rule，不再重复查询
      usageRecord = await prisma.usageRecord.create({
        data: {
          userId: params.userId,
          modelId: params.aiModelId,
          billingRuleId: rule?.id,
          nodeType: params.nodeType,
          moduleType: params.moduleType,
          operation: params.operation,
          quantity: params.quantity,
          duration: params.duration,
          resolution: params.resolution,
          mode: params.mode,
          operationType: params.operationType,
          creditsCharged: credits,
          cost: 0,
          metadata: params as any,
        },
      });
    } catch (e: any) {
      logger.debug('[BillingService] 创建使用记录失败（可能表不存在）:', e.message);
      // 继续，返回模拟记录
    }

    // 创建积分流水记录（消费）
    try {
      await prisma.creditTransaction.create({
        data: {
          userId: params.userId,
          type: 'CONSUME',
          amount: -credits,
          balance: newBalance,
          usageRecordId: usageRecord.id !== 'no-record' ? usageRecord.id : null,
          description: this.generateConsumeDescription(params),
        },
      });
    } catch (e: any) {
      logger.debug('[BillingService] 创建积分流水失败:', e.message);
    }

    return usageRecord;
  }

  /**
   * 预估费用（不实际扣费）
   */
  async estimateCredits(params: CalculateCreditsParams): Promise<number> {
    return this.calculateCredits(params);
  }

  /**
   * 退还积分（任务失败时）
   */
  async refundCredits(usageRecordId: string, reason: string = '任务失败') {
    const usageRecord = await prisma.usageRecord.findUnique({
      where: { id: usageRecordId },
    });

    if (!usageRecord) {
      throw new Error('Usage record not found');
    }

    const creditsToRefund = usageRecord.creditsCharged;
    
    if (creditsToRefund === 0) {
      logger.debug('No credits to refund');
      return null;
    }

    // 使用事务退还积分
    const result = await prisma.$transaction(async (tx) => {
      // 退还用户积分
      const updatedUser = await tx.user.update({
        where: { id: usageRecord.userId },
        data: { credits: { increment: creditsToRefund } },
        select: { credits: true },
      });

      // 更新使用记录
      const updatedRecord = await tx.usageRecord.update({
        where: { id: usageRecordId },
        data: {
          metadata: {
            ...(usageRecord.metadata as any || {}),
            refunded: true,
            refundReason: reason,
            refundedAt: new Date().toISOString(),
          },
        },
      });

      // 创建积分流水记录（退款）
      await tx.creditTransaction.create({
        data: {
          userId: usageRecord.userId,
          type: 'REFUND',
          amount: creditsToRefund,
          balance: updatedUser.credits,
          usageRecordId: usageRecordId,
          description: `${reason} 退还 ${creditsToRefund} 积分`,
        },
      });

      return updatedRecord;
    });

    // 🚀 清除用户资料缓存（积分已变化）
    try { await redis.del(`user:profile:${usageRecord.userId}`); } catch {}

    logger.debug(`Refunded ${creditsToRefund} credits to user ${usageRecord.userId}, reason: ${reason}`);
    return result;
  }

  /**
   * 带权限检查的扣费（推荐使用）
   * 整合了权限检查、免费使用、使用次数记录等功能
   */
  async chargeUserWithPermission(params: ChargeUserParams): Promise<ChargeWithPermissionResult> {
    const { userId, aiModelId, nodeType, moduleType } = params;

    // 1. 检查权限
    const permissionResult = await userLevelService.checkPermission({
      userId,
      aiModelId,
      nodeType,
      moduleType,
    });

    if (!permissionResult.allowed) {
      return {
        success: false,
        creditsCharged: 0,
        isFreeUsage: false,
        error: permissionResult.reason || '无权限使用此功能',
      };
    }

    // 2. 检查并发限制
    const concurrencyResult = await userLevelService.checkConcurrencyLimit(userId);
    if (!concurrencyResult.allowed) {
      return {
        success: false,
        creditsCharged: 0,
        isFreeUsage: false,
        error: concurrencyResult.reason || '已达到最大并发数',
      };
    }

    // 3. 判断是否免费使用
    const isFreeUsage = permissionResult.isFree === true;
    let creditsToCharge = 0;

    if (!isFreeUsage) {
      // 计算积分
      creditsToCharge = await this.calculateCredits(params);

      if (creditsToCharge > 0) {
        // 检查用户积分是否足够
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { credits: true },
        });

        if (!user) {
          return {
            success: false,
            creditsCharged: 0,
            isFreeUsage: false,
            error: '用户不存在',
          };
        }

        if (user.credits < creditsToCharge) {
          return {
            success: false,
            creditsCharged: 0,
            isFreeUsage: false,
            error: `积分不足，需要 ${creditsToCharge} 积分，当前余额 ${user.credits} 积分`,
          };
        }
      }
    }

    // 4. 执行扣费和记录
    const rule = await this.getBillingRule(params);

    const result = await prisma.$transaction(async (tx) => {
      // 扣除积分（如果不是免费使用且有积分需要扣除）
      if (!isFreeUsage && creditsToCharge > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { credits: { decrement: creditsToCharge } },
        });
      }

      // 创建使用记录
      const usageRecord = await tx.usageRecord.create({
        data: {
          userId,
          modelId: aiModelId,
          billingRuleId: rule?.id,
          nodeType,
          moduleType,
          operation: params.operation,
          quantity: params.quantity,
          duration: params.duration,
          resolution: params.resolution,
          mode: params.mode,
          operationType: params.operationType,
          creditsCharged: isFreeUsage ? 0 : creditsToCharge,
          cost: 0,
          metadata: {
            ...params,
            isFreeUsage,
            originalCredits: creditsToCharge,
          } as any,
        },
      });

      return usageRecord;
    });

    // 5. 记录使用次数
    await userLevelService.recordUsage({
      userId,
      aiModelId,
      nodeType,
      moduleType,
      isFreeUsage,
    });

    // 🚀 清除用户资料缓存（积分已变化）
    if (!isFreeUsage && creditsToCharge > 0) {
      try { await redis.del(`user:profile:${userId}`); } catch {}
    }

    logger.debug(`Charged ${isFreeUsage ? 0 : creditsToCharge} credits from user ${userId} (free: ${isFreeUsage})`);

    return {
      success: true,
      usageRecord: result,
      creditsCharged: isFreeUsage ? 0 : creditsToCharge,
      isFreeUsage,
    };
  }

  /**
   * 仅检查权限（不扣费）
   * 用于任务创建前的预检查
   */
  async checkPermissionOnly(params: {
    userId: string;
    aiModelId?: string;
    nodeType?: string;
    moduleType?: string;
  }): Promise<{ allowed: boolean; reason?: string; isFree?: boolean }> {
    // 检查权限
    const permissionResult = await userLevelService.checkPermission(params);
    if (!permissionResult.allowed) {
      return {
        allowed: false,
        reason: permissionResult.reason,
      };
    }

    // 检查并发限制
    const concurrencyResult = await userLevelService.checkConcurrencyLimit(params.userId);
    if (!concurrencyResult.allowed) {
      return {
        allowed: false,
        reason: concurrencyResult.reason,
      };
    }

    return {
      allowed: true,
      isFree: permissionResult.isFree,
    };
  }

  /**
   * 🚀 获取计费规则（带 Redis 缓存）
   */
  private async getBillingRule(params: CalculateCreditsParams) {
    const where: any = { isActive: true };
    let cacheKey = '';

    if (params.aiModelId) {
      where.aiModelId = params.aiModelId;
      cacheKey = `billing:rule:model:${params.aiModelId}`;
    } else if (params.nodeType) {
      where.nodeType = params.nodeType;
      cacheKey = `billing:rule:node:${params.nodeType}`;
    } else if (params.moduleType) {
      where.moduleType = params.moduleType;
      cacheKey = `billing:rule:module:${params.moduleType}`;
    } else {
      return null;
    }

    // 🚀 尝试从缓存获取
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Redis 不可用，继续查询数据库
    }

    const rule = await prisma.billingRule.findFirst({
      where,
      include: {
        prices: {
          where: { isActive: true },
        },
      },
    });

    // 🚀 缓存结果 10 分钟
    if (rule) {
      try {
        await redis.set(cacheKey, JSON.stringify(rule), 'EX', 600);
      } catch {
        // Redis 写入失败，忽略
      }
    }

    return rule;
  }

  /**
   * 按次计费（文本模型）
   */
  private calculatePerRequest(rule: any, params: CalculateCreditsParams): number {
    return rule.baseCredits;
  }

  /**
   * 按图片数量计费
   */
  private calculatePerImage(rule: any, params: CalculateCreditsParams): number {
    const quantity = params.quantity || 1;

    // 1. 检查是否配置了分辨率价格
    if (params.resolution && rule.prices && rule.prices.length > 0) {
       const resPrices = rule.prices.filter((p: any) => p.dimension === 'resolution');
       
       if (resPrices.length > 0) {
         // A. 优先尝试精确字符串匹配 (忽略大小写)
         const exactMatch = resPrices.find((p: any) => p.value.toLowerCase() === params.resolution!.toLowerCase());
         if (exactMatch) {
           logger.debug(`Image resolution exact match: ${exactMatch.value}, Unit Price: ${exactMatch.creditsPerUnit}`);
           return exactMatch.creditsPerUnit * quantity;
         }

         // B. 解析像素总数函数 (作为兜底)
         const getPixels = (res: string) => {
            // 常见别名映射
            const alias: Record<string, number> = {
              '2k': 2048 * 2048,
              '4k': 3840 * 2160,
              '8k': 7680 * 4320,
              'hd': 1280 * 720,
              'fhd': 1920 * 1080,
              'uhd': 3840 * 2160
            };
            const lower = res.toLowerCase();
            if (alias[lower]) return alias[lower];

            // 支持 "1024x1024" 或 "1024*1024" 格式
            const match = res.match(/(\d+)[x*](\d+)/i);
            if (match) {
              return parseInt(match[1]) * parseInt(match[2]);
            }
            // 如果是单个数字（如 "1024"），假设是正方形
            const single = parseInt(res);
            return isNaN(single) ? 0 : single * single;
         };
         
         const targetPixels = getPixels(params.resolution);
         
         if (targetPixels > 0) {
            // 最近邻匹配 (按像素总数)
            const sorted = resPrices.map((p: any) => ({
               ...p,
               pixels: getPixels(p.value),
               diff: Math.abs(getPixels(p.value) - targetPixels)
            })).sort((a: any, b: any) => a.diff - b.diff);
            
            const bestMatch = sorted[0];
            logger.debug(`Image resolution ${params.resolution} (${targetPixels}px) matched to ${bestMatch.value} (${bestMatch.pixels}px), Unit Price: ${bestMatch.creditsPerUnit}`);
            return bestMatch.creditsPerUnit * quantity;
         }
       }
    }

    // 2. 回退到基础价格 (按张一口价)
    return rule.baseCredits * quantity;
  }

  /**
   * 按时长计费（广告成片）
   */
  private calculatePerDuration(rule: any, params: CalculateCreditsParams): number {
    if (!params.duration) return 0;

    const config = rule.config as any;
    const roundUp = config?.roundUp ?? false;
    const duration = roundUp ? Math.ceil(params.duration) : params.duration;

    return rule.baseCredits * duration;
  }

  /**
   * 按时长+分辨率计费（视频生成、智能超清）
   */
  private async calculateDurationResolution(rule: any, params: CalculateCreditsParams): Promise<number> {
    if (!params.duration || !params.resolution) return 0;

    // 1. 提取分辨率数值
    const extractResolution = (res: string): number => {
      const match = res.match(/(\d+)/);
      return match ? parseInt(match[1]) : 0;
    };
    const targetRes = extractResolution(params.resolution);

    // 2. 获取所有配置的分辨率（去重）
    // 配置项可能是 "720p" 或 "720p_5"
    const allPrices = rule.prices.filter((p: any) => p.dimension === 'resolution');
    if (allPrices.length === 0) {
       logger.debug(`No resolution prices configured for this rule`);
       return 0;
    }

    const uniqueResolutions = Array.from(new Set<string>(allPrices.map((p: any) => p.value.split('_')[0])));

    // 3. 智能匹配分辨率 (最近邻)
    const resolutionsWithDistance = uniqueResolutions.map(res => ({
      res,
      numValue: extractResolution(res),
      distance: Math.abs(extractResolution(res) - targetRes)
    })).sort((a, b) => a.distance - b.distance);
    
    const matchedRes = resolutionsWithDistance[0].res;

    // 4. 检查是否为阶梯计费 (查找是否存在 matchedRes_duration 格式的配置)
    const durationPrices = allPrices.filter((p: any) => p.value.startsWith(`${matchedRes}_`));
    
    if (durationPrices.length > 0) {
      // === 阶梯计费逻辑 ===
      
      // 提取时长并排序
      const durationOptions = durationPrices.map((p: any) => {
        const parts = p.value.split('_');
        return {
          price: p,
          duration: parseInt(parts[1]) || 0
        };
      }).sort((a: any, b: any) => a.duration - b.duration);

      // 找到最接近且 >= 目标时长的档位 (向上匹配)
      // 例如请求 6s，配置有 5s, 10s。应该匹配 10s。
      let matchedOption = durationOptions.find((opt: any) => opt.duration >= params.duration!);
      
      // 如果没有更大的，使用最大的 (兜底)
      if (!matchedOption) {
        matchedOption = durationOptions[durationOptions.length - 1];
      }

      logger.debug(`Resolution ${params.resolution} matched to ${matchedRes}, Duration ${params.duration} matched to ${matchedOption.duration}s (Tiered), Cost: ${matchedOption.price.creditsPerUnit}`);
      return matchedOption.price.creditsPerUnit;
      
    } else {
      // === 线性计费逻辑 (回退到每秒单价) ===
      
      const priceConfig = allPrices.find((p: any) => p.value === matchedRes);
      if (!priceConfig) {
         logger.debug(`Price config not found for resolution ${matchedRes}`);
         return 0;
      }

      const config = rule.config as any;
      const roundUp = config?.roundUp ?? true;
      const duration = roundUp ? Math.ceil(params.duration) : params.duration;
      
      logger.debug(`Resolution ${params.resolution} matched to ${matchedRes} (Linear), Unit Price: ${priceConfig.creditsPerUnit}`);
      return duration * priceConfig.creditsPerUnit;
    }
  }

  /**
   * 按字符数计费（音频合成）
   */
  private async calculatePerCharacter(rule: any, params: CalculateCreditsParams): Promise<number> {
    if (!params.characterCount) return 0;

    const charPrice = rule.prices[0];
    if (!charPrice) return 0;

    const unitSize = charPrice.unitSize || 100;
    const units = Math.ceil(params.characterCount / unitSize);

    return units * charPrice.creditsPerUnit;
  }

  /**
   * 按时长+模式计费（视频编辑、Wan Animate）
   */
  private async calculateDurationMode(rule: any, params: CalculateCreditsParams): Promise<number> {
    if (!params.mode) return 0;

    const config = rule.config as any;
    const pricingUnit = config?.pricingUnit || 'per_second'; // 'per_second' | 'per_request'

    // 查找模式对应的价格
    let modePrice = rule.prices.find(
      (p: any) => p.dimension === 'mode' && p.value === params.mode
    );

    // 如果没有精确匹配，使用默认模式或第一个模式
    if (!modePrice) {
      const modePrices = rule.prices.filter((p: any) => p.dimension === 'mode');
      
      if (modePrices.length === 0) {
        logger.debug(`No mode prices configured for this rule`);
        return 0;
      }

      // 优先使用 'std' 或 'standard' 模式，否则使用第一个配置的模式
      modePrice = modePrices.find((p: any) => p.value === 'std' || p.value === 'standard') || modePrices[0];
      
      logger.debug(`Mode ${params.mode} not found, using default: ${modePrice.value}`);
    }

    if (pricingUnit === 'per_request') {
      const quantity = params.quantity || 1;
      return quantity * modePrice.creditsPerUnit;
    } else {
      // 默认为按时长计费
      if (!params.duration) return 0;
      const roundUp = config?.roundUp ?? true;
      const duration = roundUp ? Math.ceil(params.duration) : params.duration;
      return duration * modePrice.creditsPerUnit;
    }
  }

  /**
   * 按操作类型+模式计费（Midjourney）
   */
  private async calculateOperationMode(rule: any, params: CalculateCreditsParams): Promise<number> {
    // 使用传入的操作类型和模式，或使用默认值（Imagine + Relax）用于估算显示
    const operationType = params.operationType || 'Imagine';
    const mode = params.mode || 'Relax';

    logger.debug('[calculateOperationMode] 输入参数:', { operationType, mode });
    logger.debug('[calculateOperationMode] 规则价格:', JSON.stringify(rule.prices.map((p: any) => ({ dimension: p.dimension, value: p.value, creditsPerUnit: p.creditsPerUnit }))));

    // 查找操作类型的价格
    const operationPrice = rule.prices.find(
      (p: any) => p.dimension === 'operationType' && p.value === operationType
    );

    if (!operationPrice) {
      // 如果找不到指定的操作类型，尝试获取任意一个操作类型价格
      const anyOperationPrice = rule.prices.find(
        (p: any) => p.dimension === 'operationType'
      );
      if (!anyOperationPrice) {
        logger.debug(`No operationType price found for rule: ${rule.name}`);
        return rule.baseCredits || 0;
      }
      return anyOperationPrice.creditsPerUnit;
    }

    // 查找模式的倍率
    const modePrice = rule.prices.find(
      (p: any) => p.dimension === 'mode' && p.value === mode
    );

    if (!modePrice) {
      // 如果找不到模式，只返回操作类型价格
      return operationPrice.creditsPerUnit;
    }

    // 操作类型基础价格 × 模式倍率
    return operationPrice.creditsPerUnit * modePrice.creditsPerUnit;
  }

  /**
   * 生成消费描述
   */
  private generateConsumeDescription(params: ChargeUserParams): string {
    const parts: string[] = [];
    
    // 根据操作类型生成描述
    if (params.operation) {
      const operationMap: Record<string, string> = {
        'IMAGE_GENERATION': '图片生成',
        'VIDEO_GENERATION': '视频生成',
        'TEXT_GENERATION': '文本生成',
        'AUDIO_GENERATION': '音频生成',
        'VIDEO_EDITING': '视频编辑',
        'IMAGE_EDITING': '图片编辑',
        'COMMERCIAL_VIDEO': '广告成片',
      };
      parts.push(operationMap[params.operation] || params.operation);
    }

    // 添加模型/节点信息
    if (params.nodeType) {
      const nodeTypeMap: Record<string, string> = {
        'aiImage': 'AI图片',
        'aiVideo': 'AI视频',
        'agent': 'AI文本',
        'tts': '语音合成',
        'sora_video': 'Sora视频',
        'sora_character': 'Sora角色',
        'midjourney': 'Midjourney',
        'image_editing': '图片编辑',
      };
      const nodeName = nodeTypeMap[params.nodeType] || params.nodeType;
      if (!parts.includes(nodeName)) {
        parts.push(nodeName);
      }
    }

    // 添加模块信息
    if (params.moduleType) {
      const moduleMap: Record<string, string> = {
        'commercial-video': '广告成片',
        'video-retalk': '视频换脸',
        'video-upscale': '视频超清',
      };
      const moduleName = moduleMap[params.moduleType] || params.moduleType;
      if (!parts.includes(moduleName)) {
        parts.push(moduleName);
      }
    }

    // 添加时长/数量信息
    if (params.duration) {
      parts.push(`${params.duration}秒`);
    }
    if (params.quantity && params.quantity > 1) {
      parts.push(`${params.quantity}张`);
    }

    return parts.length > 0 ? parts.join(' ') : '积分消费';
  }
}

export const billingService = new BillingService();
