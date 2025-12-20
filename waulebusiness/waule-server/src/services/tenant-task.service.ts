/**
 * 租户任务服务
 * 复用平台版的 AI 服务，使用租户积分
 * AI 生成的素材保存到租户目录：tenantId/userId/年/月/文件名
 */
import { prisma } from '../index';
import logger from '../utils/logger';
import { ensureAliyunOssUrl, TenantUploadInfo } from '../utils/oss';
import * as doubaoService from './ai/doubao.service';
import * as minimaxiService from './ai/minimaxi.service';
import geminiService from './ai/gemini-proxy.service';
import * as soraService from './ai/sora.service';
import * as aliyunService from './ai/aliyun.service';
import * as viduService from './ai/vidu.service';

interface CreateTenantTaskParams {
  tenantId: string;
  tenantUserId: string;
  type: 'IMAGE' | 'VIDEO';
  modelId: string;
  prompt: string;
  ratio?: string;
  imageSize?: string;
  referenceImages?: string[];
  roleIds?: string[];
  subjects?: Array<{ name: string; images: string[] }>;
  generationType?: string;
  sourceNodeId?: string;
  metadata?: any;
}

class TenantTaskService {
  /**
   * 创建租户任务
   */
  async createTask(params: CreateTenantTaskParams) {
    logger.info(`[TenantTaskService] 创建任务: tenantId=${params.tenantId}, type=${params.type}, modelId=${params.modelId}`);

    // 获取模型配置
    const model = await prisma.aIModel.findUnique({
      where: { id: params.modelId },
    });

    if (!model) {
      throw new Error('模型不存在');
    }

    if (!model.isActive) {
      throw new Error('模型未启用');
    }

    // 检查模型类型
    const allowedTypes = params.type === 'IMAGE' 
      ? ['IMAGE_GENERATION'] 
      : ['VIDEO_GENERATION', 'VIDEO_EDITING']; // 视频任务允许视频生成和视频编辑模型
    if (!allowedTypes.includes(model.type)) {
      throw new Error(`该模型不支持${params.type === 'IMAGE' ? '图片' : '视频'}生成`);
    }

    // 计算积分消耗 - 优先使用 BillingRule 计费规则
    const { billingService } = await import('./billing.service');
    let creditCost = 0;
    try {
      // 使用计费规则计算积分
      // 注意：imageSize 是图片分辨率参数（如 2K/4K），metadata.resolution 是视频分辨率（如 720p/1080p）
      creditCost = await billingService.calculateCredits({
        aiModelId: params.modelId,
        nodeType: params.metadata?.nodeType,
        quantity: 1,
        duration: params.metadata?.duration,
        resolution: params.imageSize || params.metadata?.resolution,
        mode: params.metadata?.mode,
      });
      logger.info(`[TenantTaskService] 使用计费规则计算积分: ${creditCost}`);
    } catch (error: any) {
      logger.warn(`[TenantTaskService] 计费规则计算失败: ${error.message}`);
    }
    
    // 如果计费规则返回0或计算失败，回退到模型默认价格
    if (creditCost === 0) {
      creditCost = model.pricePerUse?.toNumber() || (params.type === 'IMAGE' ? 10 : 50);
      logger.info(`[TenantTaskService] 使用模型默认价格: ${creditCost}`);
    }

    // 检查租户积分
    const tenant = await prisma.tenant.findUnique({
      where: { id: params.tenantId },
    });

    if (!tenant) {
      throw new Error('租户不存在');
    }

    if (tenant.credits < creditCost) {
      throw new Error('租户积分不足');
    }

    // 扣除租户积分
    await prisma.tenant.update({
      where: { id: params.tenantId },
      data: { credits: { decrement: creditCost } },
    });

    // 记录使用记录
    await prisma.tenantUsageRecord.create({
      data: {
        tenantId: params.tenantId,
        userId: params.tenantUserId,
        modelId: params.modelId,
        operation: params.type === 'IMAGE' ? 'IMAGE_GENERATION' : 'VIDEO_GENERATION',
        creditsCharged: creditCost,
        metadata: { 
          description: `${params.type === 'IMAGE' ? '图片' : '视频'}生成 - ${model.name}`,
          imageSize: params.imageSize,
          resolution: params.imageSize || params.metadata?.resolution,
          duration: params.metadata?.duration,
        },
      },
    });

    // 创建任务
    const task = await prisma.tenantTask.create({
      data: {
        tenantId: params.tenantId,
        tenantUserId: params.tenantUserId,
        type: params.type,
        modelId: params.modelId,
        status: 'PENDING',
        sourceNodeId: params.sourceNodeId, // ✅ 保存节点ID用于任务恢复
        input: {
          prompt: params.prompt,
          ratio: params.ratio,
          imageSize: params.imageSize,
          referenceImages: params.referenceImages || [],
          generationType: params.generationType,
          subjects: params.subjects || [],
          ...(params.metadata || {}),
        },
        creditsCost: creditCost,
      },
    });

    logger.info(`[TenantTaskService] 任务已创建: ${task.id}, 积分消耗: ${creditCost}`);

    // 异步处理任务（不等待）
    this.processTask(task.id, model, params).catch(error => {
      logger.error(`[TenantTaskService] 任务处理失败: ${task.id}`, error);
    });

    return {
      id: task.id,
      status: task.status,
      creditsCharged: creditCost,
    };
  }

  /**
   * 获取任务状态
   */
  async getTask(taskId: string, tenantId: string) {
    const task = await prisma.tenantTask.findFirst({
      where: { id: taskId, tenantId },
    });

    if (!task) {
      throw new Error('任务不存在');
    }

    return task;
  }

  /**
   * 处理任务
   * AI 生成的素材保存到租户目录：tenantId/userId/年/月/文件名
   */
  private async processTask(taskId: string, model: any, params: CreateTenantTaskParams) {
    try {
      // 更新为处理中
      await prisma.tenantTask.update({
        where: { id: taskId },
        data: { status: 'PROCESSING' },
      });

      logger.info(`[TenantTaskService] 开始处理任务: ${taskId}`);

      let resultUrl: string;
      let multipleResults: string[] | undefined;
      let characterInfo: { characterName: string; avatarUrl: string } | undefined;

      if (params.type === 'IMAGE') {
        const imageResult = await this.processImageTask(params, model);
        if (Array.isArray(imageResult) && imageResult.length > 1) {
          multipleResults = imageResult;
          resultUrl = imageResult[0];
        } else {
          resultUrl = Array.isArray(imageResult) ? imageResult[0] : imageResult;
        }
      } else if (params.type === 'VIDEO') {
        // 检查是否为 Sora 角色创建
        const isCharacterCreation = params.metadata?.isCharacterCreation === true || params.generationType === '角色创建';
        const provider = (model.provider || '').toLowerCase().trim();
        
        if (isCharacterCreation && provider === 'sora') {
          characterInfo = await this.processCharacterCreation(params, model);
          resultUrl = characterInfo.avatarUrl;
        } else {
          resultUrl = await this.processVideoTask(params, model);
        }
      } else {
        throw new Error(`未知的任务类型: ${params.type}`);
      }

      // 商业版优化：跳过 OSS 内部转存，直接使用临时 URL
      // 前端下载到本地后会调用 API 删除临时文件
      // 即使未启用本地存储，临时文件也会在 OSS 生命周期策略后自动过期
      let publicUrl = resultUrl || '';
      let allImageUrls: string[] | undefined;

      logger.info(`[TenantTaskService] 使用临时URL: ${resultUrl?.substring(0, 80)}...`);
      
      // 多图直接使用原始 URL
      if (multipleResults && multipleResults.length > 1) {
        allImageUrls = multipleResults;
      }

      // 更新任务为成功
      await prisma.tenantTask.update({
        where: { id: taskId },
        data: {
          status: 'SUCCESS',
          output: {
            resultUrl: publicUrl,
            allImageUrls: allImageUrls,
            type: params.type === 'IMAGE' ? 'imagePreview' : 'videoPreview',
            ratio: params.ratio || (params.type === 'IMAGE' ? '1:1' : '16:9'),
            // 角色创建信息
            ...(characterInfo ? {
              characterName: characterInfo.characterName,
              avatarUrl: publicUrl,
            } : {}),
          },
          completedAt: new Date(),
        },
      });

      logger.info(`[TenantTaskService] 任务完成: ${taskId}`);
    } catch (error: any) {
      logger.error(`[TenantTaskService] 任务失败: ${taskId}`, error);

      // 更新任务为失败
      await prisma.tenantTask.update({
        where: { id: taskId },
        data: {
          status: 'FAILURE',
          error: error.message || '生成失败',
          completedAt: new Date(),
        },
      });

      // 退还积分
      try {
        const task = await prisma.tenantTask.findUnique({ where: { id: taskId } });
        if (task && task.creditsCost > 0) {
          await prisma.tenant.update({
            where: { id: task.tenantId },
            data: { credits: { increment: task.creditsCost } },
          });
          logger.info(`[TenantTaskService] 已退还积分: ${task.creditsCost}`);
        }
      } catch (refundError) {
        logger.error(`[TenantTaskService] 退还积分失败:`, refundError);
      }
    }
  }

  /**
   * 处理图片生成任务
   */
  private async processImageTask(params: CreateTenantTaskParams, model: any): Promise<string | string[]> {
    const provider = (model.provider || '').toLowerCase().trim();
    const referenceImages = params.referenceImages || [];
    const imageSize = params.imageSize;

    logger.info(`[TenantTaskService] 生成图片, 提供商: ${provider}, 模型: ${model.modelId}`);

    if (provider === 'google') {
      return await geminiService.generateImage({
        prompt: params.prompt,
        modelId: model.modelId,
        aspectRatio: params.ratio || '1:1',
        imageSize,
        referenceImages,
        apiKey: model.apiKey,
        apiUrl: model.apiUrl,
      });
    } else if (provider === 'bytedance') {
      const maxImages = params.metadata?.maxImages;
      return await doubaoService.generateImage({
        prompt: params.prompt,
        modelId: model.modelId,
        aspectRatio: params.ratio || '1:1',
        referenceImages,
        maxImages,
      });
    } else if (provider === 'minimaxi' || provider === 'hailuo' || provider === '海螺') {
      const { generateImage } = await import('./ai/minimaxi.image.service');
      return await generateImage({
        prompt: params.prompt,
        modelId: model.modelId,
        aspectRatio: params.ratio || '1:1',
        referenceImages,
      });
    } else if (provider === 'sora') {
      return await soraService.generateImage({
        prompt: params.prompt,
        modelId: model.modelId,
        aspectRatio: params.ratio || '1:1',
        referenceImages,
        apiKey: model.apiKey,
        apiUrl: model.apiUrl,
      });
    } else if (provider === 'aliyun') {
      return await aliyunService.generateImage({
        prompt: params.prompt,
        modelId: model.modelId,
        aspectRatio: params.ratio || '1:1',
        referenceImages,
      });
    } else {
      throw new Error(`不支持的图片生成提供商: ${provider}`);
    }
  }

  /**
   * 处理 Sora 角色创建任务
   */
  private async processCharacterCreation(params: CreateTenantTaskParams, model: any): Promise<{ characterName: string; avatarUrl: string }> {
    const referenceImages = params.referenceImages || [];
    
    // 获取视频 URL（角色创建需要视频作为参考）
    let referenceVideo: string | undefined;
    if (referenceImages.length > 0) {
      const firstRef = referenceImages[0];
      // 检查是否为视频
      if (firstRef.startsWith('data:video/') || 
          /\.(mp4|webm|mov|avi)$/i.test(firstRef) ||
          params.metadata?.referenceType === 'video') {
        referenceVideo = firstRef;
      }
    }
    
    // 也检查 metadata 中的 videoUrl
    if (!referenceVideo && params.metadata?.videoUrl) {
      referenceVideo = params.metadata.videoUrl;
    }
    
    if (!referenceVideo) {
      throw new Error('角色创建需要视频输入');
    }
    
    // 将本地/内网URL转换为OSS公网URL（future-sora-api需要公网可访问的URL）
    const publicVideoUrl = await ensureAliyunOssUrl(referenceVideo);
    if (!publicVideoUrl) {
      throw new Error('无法将视频转换为公网URL');
    }
    
    logger.info(`[TenantTaskService] Sora 角色创建, 视频: ${publicVideoUrl.substring(0, 80)}...`);
    
    const characterResult = await soraService.createCharacter({
      videoUrl: publicVideoUrl,
      modelId: model.modelId,
    });
    
    logger.info(`[TenantTaskService] Sora 角色创建成功: ${characterResult.characterName}`);
    
    return characterResult;
  }

  /**
   * 处理视频生成任务
   */
  private async processVideoTask(params: CreateTenantTaskParams, model: any): Promise<string> {
    const provider = (model.provider || '').toLowerCase().trim();
    const referenceImages = params.referenceImages || [];
    const generationType = params.generationType || '文生视频';
    const duration = params.metadata?.duration || 5;
    const resolution = params.metadata?.resolution || '720p';

    logger.info(`[TenantTaskService] 生成视频, 提供商: ${provider}, 模型: ${model.modelId}, 类型: ${generationType}`);

    if (provider === 'minimaxi' || provider === 'hailuo' || provider === '海螺') {
      // 根据输入确定生成类型
      const genType = generationType === '首尾帧' ? 'fl2v' : 
                      (referenceImages.length >= 2 ? 'fl2v' : 
                       (referenceImages.length === 1 ? 'i2v' : 't2v'));
      
      return await minimaxiService.generateVideo({
        prompt: params.prompt,
        modelId: model.modelId,
        aspectRatio: params.ratio || '16:9',
        duration,
        resolution,
        referenceImages,
        generationType: genType,
      });
    } else if (provider === 'bytedance') {
      return await doubaoService.generateVideo({
        prompt: params.prompt,
        modelId: model.modelId,
        ratio: params.ratio || '16:9',
        resolution,
        duration,
        referenceImages,
        generationType: generationType === '文生视频' ? 'text2video' : generationType,
      });
    } else if (provider === 'sora') {
      // Sora 图生视频 - 需要将本地URL转换为OSS公网URL
      let referenceImage: string | undefined;
      if (referenceImages.length > 0) {
        referenceImage = await ensureAliyunOssUrl(referenceImages[0]);
        logger.info(`[TenantTaskService] Sora 图生视频, 参考图: ${referenceImage?.substring(0, 80)}...`);
      }
      return await soraService.generateVideo({
        prompt: params.prompt,
        modelId: model.modelId,
        aspectRatio: params.ratio || '16:9',
        referenceImage,
        duration,
      });
    } else if (provider === 'vidu') {
      // Vidu 视频生成
      if (referenceImages.length > 0) {
        // 图生视频
        return await viduService.imageToVideo({
          images: referenceImages,
          prompt: params.prompt,
          model: model.modelId,
          duration,
          resolution,
        });
      } else {
        // 文生视频
        const result = await viduService.textToVideo({
          prompt: params.prompt,
          model: model.modelId,
          duration,
          resolution,
          aspect_ratio: params.ratio || '16:9',
        });
        return result.status; // status 字段包含视频 URL
      }
    } else if (provider === 'aliyun' || provider === 'wanx') {
      // 阿里云通义万相视频生成/编辑
      const wanxService = await import('./ai/wanx.service');
      const modelId = model.modelId;
      const meta: any = params.metadata || {};
      
      if (modelId === 'videoretalk') {
        // 视频对口型
        const videoUrl = referenceImages[0];
        const audioUrl = meta.audioUrl;
        if (!videoUrl || !audioUrl) {
          throw new Error('视频对口型需要视频和音频');
        }
        const publicVideoUrl = await ensureAliyunOssUrl(videoUrl);
        return await wanxService.generateVideoRetalk({
          videoUrl: publicVideoUrl!,
          audioUrl,
          refImageUrl: referenceImages[1] ? await ensureAliyunOssUrl(referenceImages[1]) : undefined,
        });
      } else if (modelId === 'video-style-transform') {
        // 视频风格转绘
        const videoUrl = referenceImages[0];
        if (!videoUrl) {
          throw new Error('视频风格转绘需要视频');
        }
        const publicVideoUrl = await ensureAliyunOssUrl(videoUrl);
        return await wanxService.generateVideoStylize({
          videoUrl: publicVideoUrl!,
          style: meta.style,
        });
      } else if (modelId === 'wan2.2-animate-mix' || modelId === 'wan2.2-animate-move') {
        // 视频换人：需要人物图片 + 参考视频
        const imageUrl = referenceImages[0];
        const videoUrl = meta.videoUrl;
        if (!imageUrl || !videoUrl) {
          throw new Error('视频换人需要人物图片和参考视频');
        }
        const publicImageUrl = await ensureAliyunOssUrl(imageUrl);
        const publicVideoUrl = await ensureAliyunOssUrl(videoUrl);
        return await wanxService.generateVideoFromFirstFrame({
          prompt: params.prompt || '',
          modelId,
          replaceImageUrl: publicImageUrl,
          replaceVideoUrl: publicVideoUrl,
          mode: meta.wanMode === 'wan-pro' ? 'wan-pro' : 'wan-std',
        });
      } else {
        // 普通视频生成（首帧生视频）
        const firstFrame = referenceImages[0] ? await ensureAliyunOssUrl(referenceImages[0]) : undefined;
        return await wanxService.generateVideoFromFirstFrame({
          prompt: params.prompt,
          modelId,
          firstFrameImage: firstFrame,
          duration,
          resolution,
        });
      }
    } else {
      throw new Error(`租户版暂不支持的视频生成提供商: ${provider}，请联系管理员`);
    }
  }
}

export const tenantTaskService = new TenantTaskService();

