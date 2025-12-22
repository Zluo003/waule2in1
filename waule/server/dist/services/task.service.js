"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const oss_1 = require("../utils/oss");
const storage_expiration_1 = require("../utils/storage-expiration");
const role_helpers_1 = require("../utils/role-helpers");
const doubaoService = __importStar(require("./ai/doubao.service"));
const minimaxiService = __importStar(require("./ai/minimaxi.service"));
const gemini_proxy_service_1 = __importDefault(require("./ai/gemini-proxy.service"));
const soraService = __importStar(require("./ai/sora.service"));
const viduService = __importStar(require("./ai/vidu.service"));
const aliyunService = __importStar(require("./ai/aliyun.service"));
const wanxService = __importStar(require("./ai/wanx.service"));
const waule_api_client_1 = require("./waule-api.client");
const logger_1 = __importDefault(require("../utils/logger"));
const index_1 = require("../index");
const user_level_service_1 = require("./user-level.service");
/**
 * 任务处理服务
 * 负责创建、查询和处理异步生成任务
 */
class TaskService {
    /**
     * 创建新任务
     */
    async createTask(params) {
        logger_1.default.info(`[TaskService] 开始创建任务, userId=${params.userId}, modelId=${params.model?.id}, modelName=${params.model?.name}`);
        // 1. 检查用户权限
        const permissionResult = await user_level_service_1.userLevelService.checkPermission({
            userId: params.userId,
            aiModelId: params.model.id,
        });
        if (!permissionResult.allowed) {
            const modelName = params.model.name || '该模型';
            logger_1.default.warn(`[TaskService] 用户 ${params.userId} 无权使用模型 ${modelName}: ${permissionResult.reason}`);
            throw new Error(permissionResult.reason || `您没有权限使用 ${modelName}`);
        }
        // 2. 检查并发限制
        const concurrencyResult = await user_level_service_1.userLevelService.checkConcurrencyLimit(params.userId);
        if (!concurrencyResult.allowed) {
            logger_1.default.warn(`[TaskService] 用户 ${params.userId} 达到并发限制: ${concurrencyResult.reason}`);
            throw new Error(concurrencyResult.reason || '已达到最大并发任务数');
        }
        // 3. 如果不是免费使用，需要扣费
        let creditsCharged = 0;
        let usageRecordId;
        logger_1.default.info(`[TaskService] 权限检查结果: isFree=${permissionResult.isFree}, metadata.duration=${params.metadata?.duration}`);
        if (!permissionResult.isFree) {
            const { billingService } = await Promise.resolve().then(() => __importStar(require('./billing.service')));
            // 标准化 mode 格式（wanMode 'wan-std'/'wan-pro' -> 'standard'/'pro'）
            let mode = params.metadata?.mode;
            if (!mode && params.metadata?.wanMode) {
                mode = params.metadata.wanMode === 'wan-pro' ? 'pro' : 'standard';
            }
            // 如果 metadata 中有 nodeType，优先使用节点计费规则
            const nodeType = params.metadata?.nodeType;
            const billingParams = {
                userId: params.userId,
                operation: params.type === 'IMAGE' ? '图片生成' : '视频生成',
                quantity: 1,
                resolution: params.imageSize || params.metadata?.resolution,
                duration: params.metadata?.duration,
                mode,
            };
            // 优先使用 nodeType 计费，否则使用 aiModelId 计费
            if (nodeType) {
                billingParams.nodeType = nodeType;
                logger_1.default.info(`[TaskService] 使用节点计费: nodeType=${nodeType}`);
            }
            else {
                billingParams.aiModelId = params.model.id;
            }
            logger_1.default.info(`[TaskService] 扣费参数:`, billingParams);
            try {
                const usageRecord = await billingService.chargeUser(billingParams);
                if (usageRecord) {
                    creditsCharged = usageRecord.creditsCharged || 0;
                    usageRecordId = usageRecord.id;
                    logger_1.default.info(`[TaskService] 已扣除积分: ${creditsCharged}, usageRecordId: ${usageRecordId}`);
                }
            }
            catch (error) {
                // 扣费失败（如积分不足）
                logger_1.default.error(`[TaskService] 扣费失败: ${error.message}`);
                throw new Error(error.message?.includes('Insufficient') ? '积分不足，请充值后再试' : (error.message || '扣费失败'));
            }
        }
        // 4. 创建任务
        // 计算存储过期时间（基于当前用户等级）
        const storageExpiresAt = await (0, storage_expiration_1.calculateStorageExpiresAt)(params.userId);
        const task = await index_1.prisma.generationTask.create({
            data: {
                userId: params.userId,
                type: params.type,
                modelId: params.modelId,
                prompt: params.prompt,
                ratio: params.ratio,
                referenceImages: params.referenceImages || [],
                generationType: params.generationType,
                status: 'PENDING',
                progress: 0,
                sourceNodeId: params.sourceNodeId,
                previewNodeCreated: false,
                storageExpiresAt, // OSS存储过期时间
                metadata: {
                    modelName: params.model.name,
                    provider: params.model.provider,
                    imageSize: params.imageSize, // 保存分辨率参数
                    maxImages: params.maxImages, // 保存组图数量参数
                    subjects: params.subjects || [], // 保存 subjects
                    isFreeUsage: permissionResult.isFree || false, // 记录是否免费使用
                    creditsCharged, // 记录扣除的积分
                    usageRecordId, // 记录扣费记录ID，用于失败退款
                    ...(params.metadata || {}),
                },
            },
        });
        // 5. 记录使用次数
        await user_level_service_1.userLevelService.recordUsage({
            userId: params.userId,
            aiModelId: params.model.id,
            isFreeUsage: permissionResult.isFree,
        });
        // 5. 获取剩余免费次数（如果是免费使用）
        let freeUsageRemaining = 0;
        if (permissionResult.isFree) {
            const userRole = await user_level_service_1.userLevelService.getEffectiveUserRole(params.userId);
            const permission = await user_level_service_1.userLevelService.getModelPermission({
                aiModelId: params.model.id,
                userRole,
            });
            if (permission?.freeDailyLimit) {
                const freeCheck = await user_level_service_1.userLevelService.checkFreeUsageLimit({
                    userId: params.userId,
                    aiModelId: params.model.id,
                    freeDailyLimit: permission.freeDailyLimit,
                });
                freeUsageRemaining = freeCheck.freeUsageRemaining;
            }
        }
        logger_1.default.info(`[TaskService] 任务已创建: ${task.id}, 类型: ${task.type}, 源节点: ${params.sourceNodeId || '无'}, 免费: ${permissionResult.isFree || false}, 扣费: ${creditsCharged}, 剩余免费次数: ${freeUsageRemaining}`);
        // 异步处理任务（不等待）
        this.processTask(task.id, params.model).catch(error => {
            logger_1.default.error(`[TaskService] 任务处理失败: ${task.id}`, error);
        });
        // 返回任务及免费使用信息
        return {
            ...task,
            isFreeUsage: permissionResult.isFree || false,
            freeUsageRemaining,
            creditsCharged,
        };
    }
    /**
     * 查询任务状态
     */
    async getTask(taskId) {
        const task = await index_1.prisma.generationTask.findUnique({
            where: { id: taskId },
        });
        if (!task) {
            throw new Error('任务不存在');
        }
        return task;
    }
    /**
     * 查询用户的所有任务
     * 🚀 优化：排除 referenceImages 字段（最大 13MB）
     */
    async getUserTasks(userId, limit = 50) {
        return index_1.prisma.generationTask.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                id: true,
                type: true,
                status: true,
                progress: true,
                prompt: true,
                resultUrl: true,
                errorMessage: true,
                createdAt: true,
                completedAt: true,
                // 注意：不选择 referenceImages（最大 13MB）、metadata 等大字段
            },
        });
    }
    /**
     * 处理任务（异步执行生成）
     */
    async processTask(taskId, model) {
        try {
            const task = await index_1.prisma.generationTask.findUnique({
                where: { id: taskId },
            });
            if (!task) {
                logger_1.default.error(`[TaskService] 任务不存在: ${taskId}`);
                return;
            }
            // 更新为处理中
            await index_1.prisma.generationTask.update({
                where: { id: taskId },
                data: {
                    status: 'PROCESSING',
                    progress: 10,
                },
            });
            logger_1.default.info(`[TaskService] 开始处理任务: ${taskId}`);
            let resultUrl;
            let multipleResults; // 用于存储多图生成的所有URL
            if (task.type === 'IMAGE') {
                const imageResult = await this.processImageTask(task, model);
                // 检查返回结果是否是数组（多图）
                if (Array.isArray(imageResult) && imageResult.length > 1) {
                    multipleResults = imageResult;
                    resultUrl = imageResult[0];
                    logger_1.default.info(`[TaskService] 多图生成完成，共 ${imageResult.length} 张图片`);
                }
                else {
                    resultUrl = Array.isArray(imageResult) ? imageResult[0] : imageResult;
                }
            }
            else if (task.type === 'VIDEO') {
                resultUrl = await this.processVideoTask(task, model);
            }
            else if (task.type === 'STORYBOARD') {
                await this.processStoryboardTask(task, model);
                resultUrl = '';
            }
            else {
                throw new Error(`未知的任务类型: ${task.type}`);
            }
            if (typeof resultUrl === 'string' && /^task:/.test(resultUrl)) {
                await index_1.prisma.generationTask.update({ where: { id: taskId }, data: { status: 'PROCESSING', progress: 30 } });
                return;
            }
            logger_1.default.info(`[TaskService] 开始转存结果到OSS: ${resultUrl?.substring(0, 80)}...`);
            const ossStartTime = Date.now();
            const publicUrl = resultUrl ? await (0, oss_1.ensureAliyunOssUrl)(resultUrl) : '';
            logger_1.default.info(`[TaskService] OSS转存完成，耗时 ${((Date.now() - ossStartTime) / 1000).toFixed(1)}s: ${publicUrl?.substring(0, 80)}...`);
            // 如果是多图，也需要处理所有图片URL
            let publicImageUrls;
            if (multipleResults && multipleResults.length > 1) {
                logger_1.default.info(`[TaskService] 处理多图OSS URL转换，共 ${multipleResults.length} 张图片`);
                publicImageUrls = [];
                for (const imgUrl of multipleResults) {
                    const publicImgUrl = await (0, oss_1.ensureAliyunOssUrl)(imgUrl);
                    if (publicImgUrl) {
                        publicImageUrls.push(publicImgUrl);
                    }
                }
                logger_1.default.info(`[TaskService] 多图OSS URL转换完成:`, publicImageUrls);
            }
            const previewNodeData = resultUrl ? {
                type: task.type === 'IMAGE' ? 'imagePreview' : 'videoPreview',
                url: publicUrl,
                ratio: task.ratio || (task.type === 'IMAGE' ? '1:1' : '16:9'),
                timestamp: Date.now(),
            } : undefined;
            logger_1.default.info(`[TaskService] 生成预览节点数据:`, {
                taskId,
                type: task.type,
                taskRatio: task.ratio,
                finalRatio: previewNodeData ? previewNodeData.ratio : undefined,
                previewNodeData,
                multipleResultsCount: publicImageUrls?.length || 1,
            });
            // 更新为成功，保存所有图片URL到metadata
            const updateData = {
                status: 'SUCCESS',
                progress: 100,
                resultUrl: publicUrl || undefined,
                previewNodeData: previewNodeData || undefined,
                completedAt: new Date(),
            };
            // 如果是多图生成，将所有图片URL保存到metadata
            if (publicImageUrls && publicImageUrls.length > 1) {
                const existingMetadata = task.metadata || {};
                updateData.metadata = {
                    ...existingMetadata,
                    allImageUrls: publicImageUrls,
                    imageCount: publicImageUrls.length,
                };
            }
            await index_1.prisma.generationTask.update({
                where: { id: taskId },
                data: updateData,
            });
            logger_1.default.info(`[TaskService] 任务完成: ${taskId}, 结果: ${resultUrl}, 图片数量: ${multipleResults?.length || 1}`);
        }
        catch (error) {
            logger_1.default.error(`[TaskService] 任务失败: ${taskId}`, error);
            await this.markTaskAsFailed(taskId, error.message || '生成失败');
        }
    }
    /**
     * 处理分镜脚本任务：调用文本模型，解析JSON，保存到Episode.scriptJson
     * 5分钟超时
     */
    async processStoryboardTask(task, model) {
        const provider = (model.provider || '').toLowerCase();
        const meta = task.metadata || {};
        const episodeId = meta.episodeId;
        const systemPrompt = meta.systemPrompt || '';
        const temperature = Number(meta.temperature ?? 0);
        const attachments = meta.attachments || {};
        // 进度更新
        await index_1.prisma.generationTask.update({ where: { id: task.id }, data: { progress: 20 } });
        const mergedSystem = systemPrompt;
        const prompt = String(task.prompt || '');
        const controllerCall = async () => {
            if (provider === 'google') {
                const text = await gemini_proxy_service_1.default.generateText({
                    prompt,
                    systemPrompt: mergedSystem,
                    modelId: model.modelId,
                    temperature,
                    maxTokens: 32000,
                    documentFiles: attachments.documentFiles,
                    imageUrls: attachments.imageUrls,
                    videoUrls: attachments.videoUrls,
                    apiKey: model.apiKey,
                    apiUrl: model.apiUrl,
                });
                return text;
            }
            else if (provider === 'bytedance' || provider === 'doubao') {
                const text = await doubaoService.generateText({
                    prompt,
                    systemPrompt: mergedSystem,
                    modelId: model.modelId,
                    temperature,
                    maxTokens: 4000,
                    imageUrls: attachments.imageUrls,
                    videoUrls: attachments.videoUrls,
                    apiKey: model.apiKey,
                    apiUrl: model.apiUrl,
                });
                return text;
            }
            throw new Error(`不支持的文本生成提供商: ${provider}`);
        };
        const timeoutMs = 5 * 60 * 1000;
        const text = await Promise.race([
            controllerCall(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('脚本生成超时')), timeoutMs)),
        ]);
        // 解析为JSON
        let json;
        try {
            json = JSON.parse(text);
        }
        catch {
            const m = /\{[\s\S]*\}/.exec(text || '');
            if (m)
                json = JSON.parse(m[0]);
        }
        if (!json || !Array.isArray(json.acts)) {
            throw new Error('返回数据不符合分镜脚本结构');
        }
        // 保存到Episode.scriptJson（一次性行为）
        await index_1.prisma.episode.update({
            where: { id: episodeId },
            data: { scriptJson: { acts: json.acts } },
        });
        await index_1.prisma.generationTask.update({ where: { id: task.id }, data: { progress: 100 } });
    }
    /**
     * 处理图片生成任务
     */
    async processImageTask(task, model) {
        const provider = model.provider.toLowerCase();
        const referenceImages = task.referenceImages || [];
        const imageSize = task.metadata?.imageSize; // 从元数据中读取分辨率
        const maxImages = task.metadata?.maxImages; // 从元数据中读取组图数量
        logger_1.default.info(`[TaskService] 生成图片, 提供商: ${provider}, 模型: ${model.modelId}, 分辨率: ${imageSize || '默认'}, 组图数量: ${maxImages || 1}`);
        // 更新进度
        await index_1.prisma.generationTask.update({
            where: { id: task.id },
            data: { progress: 30 },
        });
        // 图片编辑任务（使用 Gemini 两阶段处理）
        if (provider === 'gemini-editing' || task.metadata?.isImageEditing) {
            return await this.processImageEditingTask(task);
        }
        if (provider === 'google') {
            // 对于 Gemini 3 Pro Image 模型，优先使用 waule-api 网关（网关有正确的通道切换逻辑）
            const isGemini3ProImage = model.modelId?.toLowerCase().includes('gemini-3-pro-image');
            // 使用全局 waule-api 客户端（从环境变量读取配置，确保认证正确）
            const wauleApiClient = isGemini3ProImage ? (0, waule_api_client_1.getGlobalWauleApiClient)() : null;
            if (isGemini3ProImage && wauleApiClient) {
                logger_1.default.info(`[TaskService] Gemini 3 Pro Image 使用 waule-api 网关生成, URL: ${process.env.WAULEAPI_URL}`);
                const result = await wauleApiClient.generateImage({
                    model: model.modelId,
                    prompt: task.prompt,
                    size: task.ratio || '1:1',
                    image_size: imageSize, // 2K/4K
                    reference_images: referenceImages.length > 0 ? referenceImages : undefined,
                });
                if (result?.data?.[0]?.url) {
                    return result.data[0].url;
                }
                throw new Error('waule-api 返回的图片URL为空');
            }
            // 其他 Gemini 模型使用原有逻辑
            const imageUrl = await gemini_proxy_service_1.default.generateImage({
                prompt: task.prompt,
                modelId: model.modelId,
                aspectRatio: task.ratio || '1:1',
                imageSize: imageSize, // 传递分辨率参数（2K/4K）
                referenceImages,
                apiKey: model.apiKey,
                apiUrl: model.apiUrl,
            });
            return imageUrl;
        }
        else if (provider === 'bytedance') {
            const imageUrl = await doubaoService.generateImage({
                prompt: task.prompt,
                modelId: model.modelId,
                aspectRatio: task.ratio || '1:1',
                referenceImages,
                apiKey: model.apiKey,
                apiUrl: model.apiUrl,
                maxImages: maxImages || undefined, // 传递组图数量参数
            });
            return imageUrl;
        }
        else if (provider === 'minimaxi' || provider === 'hailuo' || provider === '海螺') {
            const { generateImage } = await Promise.resolve().then(() => __importStar(require('./ai/minimaxi.image.service')));
            const imageUrl = await generateImage({
                prompt: task.prompt,
                modelId: model.modelId,
                aspectRatio: task.ratio || '1:1',
                referenceImages,
                apiKey: model.apiKey,
                apiUrl: model.apiUrl,
            });
            return imageUrl;
        }
        else if (provider === 'sora') {
            const imageUrl = await soraService.generateImage({
                prompt: task.prompt,
                modelId: model.modelId,
                aspectRatio: task.ratio || '1:1',
                referenceImages,
                apiKey: model.apiKey,
                apiUrl: model.apiUrl,
            });
            return imageUrl;
        }
        else if (provider === 'aliyun') {
            const imageUrl = await aliyunService.generateImage({
                prompt: task.prompt,
                modelId: model.modelId,
                aspectRatio: task.ratio || '1:1',
                referenceImages,
                apiKey: model.apiKey,
                apiUrl: model.apiUrl,
            });
            return imageUrl;
        }
        else {
            throw new Error(`不支持的图片生成提供商: ${provider}`);
        }
    }
    /**
     * 处理图片编辑任务（使用 Gemini 两阶段处理）
     */
    async processImageEditingTask(task) {
        const referenceImages = task.referenceImages || [];
        const metadata = task.metadata || {};
        const points = metadata.points || [];
        const sourceImageDimensions = metadata.sourceImageDimensions;
        logger_1.default.info(`[TaskService] 图片编辑任务, 参考图数量: ${referenceImages.length}, 标记点数量: ${points.length}`);
        // 更新进度
        await index_1.prisma.generationTask.update({
            where: { id: task.id },
            data: { progress: 20 },
        });
        // 主图是第一张参考图
        const mainImage = referenceImages[0];
        const additionalRefs = referenceImages.slice(1);
        if (!mainImage) {
            throw new Error('主图是必需的');
        }
        // 计算原图的宽高比（映射到 Gemini 支持的最近比例）
        let aspectRatio;
        if (sourceImageDimensions?.width && sourceImageDimensions?.height) {
            const { width, height } = sourceImageDimensions;
            const originalRatio = width / height;
            // Gemini 支持的宽高比
            const supportedRatios = [
                { ratio: '1:1', value: 1 },
                { ratio: '2:3', value: 2 / 3 },
                { ratio: '3:2', value: 3 / 2 },
                { ratio: '3:4', value: 3 / 4 },
                { ratio: '4:3', value: 4 / 3 },
                { ratio: '4:5', value: 4 / 5 },
                { ratio: '5:4', value: 5 / 4 },
                { ratio: '9:16', value: 9 / 16 },
                { ratio: '16:9', value: 16 / 9 },
                { ratio: '21:9', value: 21 / 9 },
            ];
            // 找到最接近的支持比例
            let closestRatio = supportedRatios[0];
            let minDiff = Math.abs(originalRatio - closestRatio.value);
            for (const supported of supportedRatios) {
                const diff = Math.abs(originalRatio - supported.value);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestRatio = supported;
                }
            }
            aspectRatio = closestRatio.ratio;
            logger_1.default.info(`[TaskService] 图片编辑: 原图尺寸 ${width}x${height}, 原始比例 ${originalRatio.toFixed(2)}, 映射到 ${aspectRatio}`);
        }
        // 构建用户提示词（包含标记点位置信息）
        let userPrompt = task.prompt;
        if (points && points.length > 0) {
            const getChinesePositionDescription = (x, y) => {
                const horizontal = x < 0.33 ? '左侧' : x > 0.66 ? '右侧' : '中间';
                const vertical = y < 0.33 ? '上方' : y > 0.66 ? '下方' : '中间';
                return `${vertical}${horizontal}`;
            };
            const pointDescriptions = points.map((p) => {
                const position = getChinesePositionDescription(p.x, p.y);
                const objectName = p.name ? `「${p.name}」` : '';
                return `- 位置${p.id}${objectName}：在图片的${position}`;
            });
            userPrompt += `\n\n标记点位置：\n${pointDescriptions.join('\n')}`;
        }
        // 准备所有参考图（主图 + 额外参考图）
        const allImages = [mainImage, ...additionalRefs];
        // 更新进度
        await index_1.prisma.generationTask.update({
            where: { id: task.id },
            data: { progress: 40 },
        });
        // 第一阶段：使用 Gemini 2.5 Flash 理解图片和用户意图，生成优化提示词
        logger_1.default.info('[TaskService] 图片编辑: 第一阶段 - 使用 Gemini 2.5 Flash 优化提示词...');
        const promptForFlash = `Look at this image and the user's edit request below. Generate a detailed English prompt for an AI image editing model.

User's request: ${userPrompt}

Requirements:
- Output ONLY the English prompt, no explanations
- Describe what to change and what to keep
- Do NOT add any text, numbers or markers to the image
- Keep the same style, lighting and aspect ratio`;
        const optimizedPrompt = await gemini_proxy_service_1.default.generateText({
            prompt: promptForFlash,
            modelId: 'gemini-2.5-flash',
            imageUrls: [mainImage],
        });
        logger_1.default.info('[TaskService] 图片编辑: 优化后的提示词:', optimizedPrompt.substring(0, 200));
        // 更新进度
        await index_1.prisma.generationTask.update({
            where: { id: task.id },
            data: { progress: 60 },
        });
        // 添加保持原图比例和不添加标记的指令
        const finalPrompt = `${optimizedPrompt}\n\nIMPORTANT: Keep the exact same aspect ratio as the original image. Do NOT add any text, numbers, labels, or markers to the image.`;
        // 第二阶段：使用优化后的提示词 + 图片调用 Gemini 3.0 Pro Image
        logger_1.default.info('[TaskService] 图片编辑: 第二阶段 - 调用 Gemini 3.0 Pro Image (4K)...');
        const imageUrl = await gemini_proxy_service_1.default.generateImage({
            prompt: finalPrompt,
            modelId: 'gemini-3-pro-image-preview',
            aspectRatio: aspectRatio,
            imageSize: '4K',
            referenceImages: allImages,
        });
        logger_1.default.info('[TaskService] 图片编辑完成:', imageUrl.substring(0, 80));
        return imageUrl;
    }
    /**
     * 处理视频生成任务
     */
    async processVideoTask(task, model) {
        const provider = model.provider.toLowerCase();
        const referenceImages = task.referenceImages || [];
        logger_1.default.info(`[TaskService] 生成视频, 提供商: ${provider}, 模型: ${model.modelId}`);
        // 更新进度
        await index_1.prisma.generationTask.update({
            where: { id: task.id },
            data: { progress: 20 },
        });
        if (provider === 'minimaxi' || provider === 'hailuo' || provider === '海螺') {
            const genType = task.generationType || (referenceImages.length >= 2 ? 'fl2v' : (referenceImages.length === 1 ? 'i2v' : 't2v'));
            if (genType === 'fl2v') {
                const caps = await index_1.prisma.modelCapability.findMany({ where: { aiModelId: model.id, capability: { in: ['首尾帧', 'fl2v', 'First-and-Last-Frame', 'first_last_frame', '首尾'] } } });
                const supported = caps.length > 0 ? !!caps[0].supported : (Array.isArray(model.config?.supportedGenerationTypes) && model.config.supportedGenerationTypes.includes('首尾帧'));
                if (!supported)
                    throw new Error(`当前模型不支持首尾帧: ${model.modelId}`);
            }
            const videoUrl = await minimaxiService.generateVideo({
                prompt: task.prompt,
                modelId: model.modelId,
                aspectRatio: task.ratio || '16:9',
                duration: (() => {
                    const dm = task.metadata && task.metadata.duration;
                    const dv = typeof dm === 'number' ? dm : undefined;
                    const isFast = /Fast/i.test(model.modelId);
                    if (isFast)
                        return dv && (dv === 6 || dv === 10) ? dv : 6;
                    return typeof dm === 'number' ? dm : 5;
                })(),
                resolution: (() => {
                    const rm = task.metadata && task.metadata.resolution;
                    const rv = typeof rm === 'string' ? rm : undefined;
                    const isFast = /Fast/i.test(model.modelId);
                    if (isFast) {
                        if (rv === '1080P')
                            return '1080P';
                        return '768P';
                    }
                    return rv || '1080P';
                })(),
                referenceImages,
                generationType: genType,
                apiKey: model.apiKey,
                apiUrl: model.apiUrl,
                callbackUrl: process.env.MINIMAX_CALLBACK_PUBLIC_URL || undefined,
                genTaskId: task.id, // 传递任务ID，用于检测任务是否已被删除
            });
            if (videoUrl && /^task:/.test(videoUrl)) {
                const extId = videoUrl.substring(5);
                await index_1.prisma.generationTask.update({ where: { id: task.id }, data: { externalTaskId: extId, metadata: { ...(task.metadata || {}), minimaxiTaskId: extId } } });
            }
            return videoUrl;
        }
        else if (provider === 'bytedance') {
            const meta = task.metadata || {};
            const duration = typeof meta.duration === 'number' ? meta.duration : 5;
            const resolution = typeof meta.resolution === 'string' ? meta.resolution : '1080P';
            const videoUrl = await doubaoService.generateVideo({
                prompt: task.prompt,
                modelId: model.modelId,
                ratio: task.ratio || '16:9',
                duration,
                resolution,
                referenceImages,
                generationType: task.generationType || 'text2video',
                apiKey: model.apiKey,
                apiUrl: model.apiUrl,
            });
            return videoUrl;
        }
        else if (provider === 'sora') {
            const meta = task.metadata || {};
            const duration = typeof meta.duration === 'number' ? meta.duration : 10;
            const isCharacterCreation = meta.isCharacterCreation === true || task.generationType === '角色创建';
            // 检查输入类型：图片或视频
            let referenceImage;
            let referenceVideo;
            if (referenceImages && referenceImages.length > 0) {
                const firstRef = referenceImages[0];
                // 检查是否为视频（base64 data URL 或文件扩展名）
                if (firstRef.startsWith('data:video/') ||
                    /\.(mp4|webm|mov|avi)$/i.test(firstRef) ||
                    meta.referenceType === 'video') {
                    referenceVideo = firstRef;
                    logger_1.default.info(`[TaskService] Sora: 检测到视频输入`);
                }
                else {
                    referenceImage = firstRef;
                    logger_1.default.info(`[TaskService] Sora: 检测到图片输入`);
                }
            }
            // 如果 metadata 中明确指定了 videoUrl，使用它
            if (meta.videoUrl) {
                referenceVideo = meta.videoUrl;
                logger_1.default.info(`[TaskService] Sora: 使用 metadata 中的 videoUrl`);
            }
            // 启动模拟进度更新（Sora API 不返回中间进度）
            const progressInterval = this.startMockProgress(task.id, 25, 95, 8000);
            try {
                // 角色创建模式
                if (isCharacterCreation && referenceVideo) {
                    logger_1.default.info(`[TaskService] Sora: 角色创建模式`);
                    const characterResult = await soraService.createCharacter({
                        videoUrl: referenceVideo,
                        modelId: model.modelId,
                        apiKey: model.apiKey,
                        apiUrl: model.apiUrl,
                    });
                    clearInterval(progressInterval);
                    // 更新任务结果，包含角色信息
                    await index_1.prisma.generationTask.update({
                        where: { id: task.id },
                        data: {
                            metadata: {
                                ...meta,
                                characterName: characterResult.characterName,
                                avatarUrl: characterResult.avatarUrl,
                            },
                        },
                    });
                    return characterResult.avatarUrl || '';
                }
                // 普通视频生成模式
                const videoUrl = await soraService.generateVideo({
                    prompt: task.prompt,
                    modelId: model.modelId,
                    aspectRatio: task.ratio || '16:9',
                    referenceImage,
                    referenceVideo,
                    duration,
                    apiKey: model.apiKey,
                    apiUrl: model.apiUrl,
                });
                // 清除模拟进度
                clearInterval(progressInterval);
                return videoUrl;
            }
            catch (error) {
                // 发生错误时也要清除进度更新
                clearInterval(progressInterval);
                throw error;
            }
        }
        else if (provider === 'aliyun') {
            // 通义万相：视频换人（wan2.2-animate-mix）或普通视频
            const modelId = model.modelId;
            if ((task.generationType || '') === '对口型') {
                const meta = task.metadata || {};
                const videoUrl = meta.videoUrl;
                const audioUrl = meta.audioUrl;
                const refImageUrl = (referenceImages && referenceImages.length > 0) ? referenceImages[0] : undefined;
                if (!videoUrl || !audioUrl) {
                    throw new Error('对口型需要连接1个视频与1个音频；图片可选');
                }
                const toAli = async (u) => u ? await (0, oss_1.ensureAliyunOssUrl)(u) : undefined;
                const publicVideoUrl = await toAli(videoUrl);
                const publicAudioUrl = await toAli(audioUrl);
                const publicRefImageUrl = await toAli(refImageUrl);
                const retalkUrl = await wanxService.generateVideoRetalk({
                    videoUrl: publicVideoUrl,
                    audioUrl: publicAudioUrl,
                    refImageUrl: publicRefImageUrl,
                    apiKey: model.apiKey,
                    apiUrl: model.apiUrl,
                    videoExtension: meta.videoExtension === true,
                });
                return retalkUrl;
            }
            else if ((task.generationType || '') === '风格转换') {
                const meta = task.metadata || {};
                const videoUrl = meta.videoUrl;
                const styleId = typeof meta.styleId === 'number' ? meta.styleId : undefined;
                const videoFps = typeof meta.videoFps === 'number' ? meta.videoFps : undefined;
                if (!videoUrl) {
                    throw new Error('风格转换需要连接1个视频');
                }
                const publicVideoUrl = await (0, oss_1.ensureAliyunOssUrl)(videoUrl);
                const stylizedUrl = await wanxService.generateVideoStylize({
                    videoUrl: publicVideoUrl,
                    style: styleId,
                    videoFps,
                    minLen: undefined,
                    apiKey: model.apiKey,
                    apiUrl: model.apiUrl,
                });
                return stylizedUrl;
            }
            else if (modelId === 'wan2.2-animate-mix' || modelId === 'wan2.2-animate-move') {
                // 期望从 referenceImages 中获取 image_url + 从上传节点的第一个视频获取 video_url
                const imageUrl = referenceImages && referenceImages.length > 0 ? referenceImages[0] : undefined;
                // 通过连接上的上传节点找视频
                let videoUrl = undefined;
                // 简化：仅使用任务的metadata（若前端想要支持自动拾取视频，可在提交任务时把视频URL写入 metadata.videoUrl）
                const meta = task.metadata || {};
                if (meta.videoUrl) {
                    videoUrl = meta.videoUrl;
                }
                const url1 = imageUrl;
                const url2 = videoUrl;
                if (!url1 || !url2) {
                    throw new Error('该能力需要人物图片与参考视频；请连接上传节点提供一张图片与一个视频');
                }
                // 确保为阿里云可拉取的公网链接（OSS）
                const publicImageUrl = await (0, oss_1.ensureAliyunOssUrl)(url1);
                const publicVideoUrl = await (0, oss_1.ensureAliyunOssUrl)(url2);
                const videoResUrl = await wanxService.generateVideoFromFirstFrame({
                    prompt: task.prompt || '',
                    modelId,
                    replaceImageUrl: publicImageUrl,
                    replaceVideoUrl: publicVideoUrl,
                    apiKey: model.apiKey,
                    apiUrl: model.apiUrl,
                    mode: meta.wanMode === 'wan-pro' ? 'wan-pro' : 'wan-std',
                });
                return videoResUrl;
            }
            else {
                const videoUrl = await wanxService.generateVideoFromFirstFrame({
                    prompt: task.prompt,
                    modelId,
                    firstFrameImage: referenceImages && referenceImages.length > 0 ? await (0, oss_1.ensureAliyunOssUrl)(referenceImages[0]) : undefined,
                    duration: 5,
                    resolution: '1080P',
                    apiKey: model.apiKey,
                    apiUrl: model.apiUrl,
                });
                return videoUrl;
            }
        }
        else if (provider === 'vidu') {
            // Vidu Q2 图生视频
            logger_1.default.info(`[TaskService] 🎬 开始处理 Vidu 视频生成任务`);
            const meta = task.metadata || {};
            const duration = typeof meta.duration === 'number' ? meta.duration : 5;
            // 分辨率：确保小写格式（540p、720p、1080p）
            let resolution = typeof meta.resolution === 'string' ? meta.resolution : '720p';
            resolution = resolution.toLowerCase(); // 标准化为小写
            // 音频参数：只有明确为 true 时才启用
            const audio = meta.audio === true;
            const voice_id = typeof meta.voice_id === 'string' ? meta.voice_id : undefined;
            const bgm = meta.bgm === true;
            // 运动幅度：auto、small、medium、large
            const movement_amplitude = ['auto', 'small', 'medium', 'large'].includes(meta.movementAmplitude)
                ? meta.movementAmplitude
                : 'auto';
            // 检查是否使用角色组（subjects）
            let subjects;
            const roleIds = meta.roleIds || [];
            // 调试：看看 task 里有什么
            logger_1.default.info(`[TaskService] DEBUG - task 字段:`, Object.keys(task));
            logger_1.default.info(`[TaskService] DEBUG - task.subjects:`, task.subjects);
            // 合并 subjects：角色 + 图片
            subjects = [];
            // 从 roleIds 获取角色
            if (roleIds && roleIds.length > 0) {
                const roleSubjects = await (0, role_helpers_1.getSubjectsFromRoleIds)(roleIds, task.userId);
                subjects.push(...roleSubjects);
                logger_1.default.info(`[TaskService] ✅ 获取角色: ${roleSubjects.length}个`);
            }
            // 添加前端传的图片（从 metadata 中读取）
            const frontendSubjects = task.metadata?.subjects;
            if (frontendSubjects && frontendSubjects.length > 0) {
                subjects.push(...frontendSubjects.map((s) => ({
                    id: s.name,
                    images: s.images,
                    voice_id: '',
                })));
                logger_1.default.info(`[TaskService] ✅ 添加图片: ${frontendSubjects.length}个`);
            }
            logger_1.default.info(`[TaskService] 🎯 最终 subjects: ${subjects.length}个`);
            subjects.forEach((s, i) => logger_1.default.info(`  ${i + 1}. ${s.id}: ${s.images.length}张`));
            const generationType = task.generationType || '';
            const isTextToVideo = generationType === '文生视频';
            logger_1.default.info(`[TaskService] Vidu 参数:`, {
                model: model.modelId,
                duration,
                resolution,
                audio,
                voice_id: voice_id || '默认',
                bgm,
                movement_amplitude,
                prompt: task.prompt?.substring(0, 50),
                hasApiKey: !!model.apiKey,
                apiUrl: model.apiUrl,
                generationType,
                isTextToVideo,
                useSubjects: !!subjects,
                subjectsCount: subjects?.length || 0,
                imagesCount: referenceImages?.length || 0,
            });
            let videoUrl;
            if (isTextToVideo) {
                // 文生视频：调用 text2video API
                logger_1.default.info('[TaskService] 📝 使用文生视频模式');
                const result = await viduService.textToVideo({
                    prompt: task.prompt || '',
                    model: model.modelId,
                    duration,
                    resolution,
                    bgm,
                    movement_amplitude,
                    aspect_ratio: task.ratio || '16:9',
                    apiKey: model.apiKey,
                    apiUrl: model.apiUrl || undefined,
                });
                videoUrl = result.status; // textToVideo 返回 { taskId, status }，status 是视频 URL
            }
            else {
                // 图生视频：调用 imageToVideo API（支持 subjects 和 images）
                logger_1.default.info('[TaskService] 🎨 使用图生视频模式');
                videoUrl = await viduService.imageToVideo({
                    images: referenceImages?.length ? referenceImages : undefined,
                    subjects: subjects,
                    prompt: task.prompt || undefined,
                    model: model.modelId,
                    duration,
                    resolution,
                    audio,
                    voice_id,
                    bgm,
                    movement_amplitude,
                    apiKey: model.apiKey,
                    apiUrl: model.apiUrl || undefined,
                });
            }
            logger_1.default.info(`[TaskService] ✅ Vidu 视频生成完成:`, videoUrl);
            return videoUrl;
        }
        else {
            throw new Error(`不支持的视频生成提供商: ${provider}`);
        }
    }
    /**
     * 启动模拟进度更新（用于不返回进度的 API，如 Sora）
     * @param taskId 任务 ID
     * @param start 起始进度（%）
     * @param end 结束进度（%）
     * @param intervalMs 更新间隔（毫秒）
     * @returns 定时器引用
     */
    startMockProgress(taskId, start, end, intervalMs) {
        let current = start;
        const step = 5; // 每次增加 5%
        logger_1.default.info(`[TaskService] 启动模拟进度: ${start}% -> ${end}%, 间隔: ${intervalMs}ms`);
        return setInterval(async () => {
            current = Math.min(current + step, end);
            try {
                await index_1.prisma.generationTask.update({
                    where: { id: taskId },
                    data: { progress: current },
                });
                logger_1.default.debug(`[TaskService] 模拟进度更新: ${taskId} -> ${current}%`);
            }
            catch (error) {
                logger_1.default.error(`[TaskService] 模拟进度更新失败:`, error);
            }
        }, intervalMs);
    }
    /**
     * 标记任务失败并退还积分（如果有扣费）
     */
    async markTaskAsFailed(taskId, errorMessage) {
        const task = await index_1.prisma.generationTask.findUnique({
            where: { id: taskId },
        });
        if (!task) {
            logger_1.default.error(`[TaskService] 任务不存在: ${taskId}`);
            return;
        }
        // 更新任务状态为失败
        await index_1.prisma.generationTask.update({
            where: { id: taskId },
            data: {
                status: 'FAILURE',
                errorMessage,
                completedAt: new Date(),
            },
        });
        // 检查是否有扣费记录，如果有则退还积分
        const metadata = task.metadata;
        const usageRecordId = metadata?.usageRecordId;
        const creditsCharged = metadata?.creditsCharged || 0;
        if (usageRecordId && creditsCharged > 0) {
            try {
                const { billingService } = await Promise.resolve().then(() => __importStar(require('./billing.service')));
                await billingService.refundCredits(usageRecordId, `任务失败: ${errorMessage}`);
                // 同步更新任务的 metadata 标记已退款
                await index_1.prisma.generationTask.update({
                    where: { id: taskId },
                    data: {
                        metadata: {
                            ...metadata,
                            refunded: true,
                            refundedAt: new Date().toISOString(),
                        },
                    },
                });
                logger_1.default.info(`[TaskService] 已退还 ${creditsCharged} 积分，任务: ${taskId}`);
            }
            catch (error) {
                logger_1.default.error(`[TaskService] 退还积分失败:`, error);
            }
        }
    }
    /**
     * 异步转存视频到OSS（后台执行，不阻塞任务完成）
     * @param taskId 任务ID
     * @param originalUrl 原始视频URL
     */
    async asyncTransferToOss(taskId, originalUrl) {
        logger_1.default.info(`[TaskService] 开始异步转存到OSS: ${taskId}`);
        const startTime = Date.now();
        try {
            const ossUrl = await (0, oss_1.ensureAliyunOssUrl)(originalUrl);
            const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
            if (ossUrl && ossUrl !== originalUrl && /oss.*aliyuncs\.com/i.test(ossUrl)) {
                // 先获取当前任务的metadata
                const currentTask = await index_1.prisma.generationTask.findUnique({ where: { id: taskId } });
                const existingMetadata = currentTask?.metadata || {};
                // 转存成功，更新任务URL
                await index_1.prisma.generationTask.update({
                    where: { id: taskId },
                    data: {
                        resultUrl: ossUrl,
                        previewNodeData: {
                            type: 'videoPreview',
                            url: ossUrl,
                            ratio: currentTask?.ratio || '16:9',
                            timestamp: Date.now(),
                        },
                        metadata: {
                            ...existingMetadata,
                            ossTransferPending: false,
                            ossUrl: ossUrl,
                            ossTransferDuration: durationSec,
                        },
                    },
                });
                logger_1.default.info(`[TaskService] ✅ 异步OSS转存成功: ${taskId}, 耗时 ${durationSec}s`);
            }
            else {
                logger_1.default.warn(`[TaskService] ⚠️ 异步OSS转存返回原URL或失败: ${taskId}`);
            }
        }
        catch (error) {
            logger_1.default.error(`[TaskService] ❌ 异步OSS转存异常: ${taskId}`, error.message);
        }
    }
    /**
     * 清理僵尸任务（超过指定时间未完成的 PENDING/PROCESSING 任务）
     * @param thresholdMinutes 超时阈值（分钟），默认 30 分钟
     */
    async cleanupZombieTasks(thresholdMinutes = 30) {
        const threshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);
        // 查找僵尸任务
        const zombieTasks = await index_1.prisma.generationTask.findMany({
            where: {
                status: { in: ['PENDING', 'PROCESSING'] },
                updatedAt: { lt: threshold },
            },
            select: {
                id: true,
                userId: true,
                metadata: true,
                status: true,
                progress: true,
                createdAt: true,
            },
        });
        if (zombieTasks.length === 0) {
            return 0;
        }
        logger_1.default.info(`[TaskService] 发现 ${zombieTasks.length} 个僵尸任务，开始清理...`);
        let cleaned = 0;
        for (const task of zombieTasks) {
            try {
                const metadata = task.metadata;
                const creditsCharged = metadata?.creditsCharged || 0;
                const usageRecordId = metadata?.usageRecordId;
                // 更新任务状态为失败
                await index_1.prisma.generationTask.update({
                    where: { id: task.id },
                    data: {
                        status: 'FAILURE',
                        errorMessage: `任务超时（超过 ${thresholdMinutes} 分钟未完成），已自动取消`,
                        completedAt: new Date(),
                        metadata: {
                            ...metadata,
                            zombieCleanup: true,
                            cleanedAt: new Date().toISOString(),
                        },
                    },
                });
                // 退还积分
                if (usageRecordId && creditsCharged > 0) {
                    try {
                        const { billingService } = await Promise.resolve().then(() => __importStar(require('./billing.service')));
                        await billingService.refundCredits(usageRecordId, '任务超时自动取消');
                        // 更新任务的退款标记
                        await index_1.prisma.generationTask.update({
                            where: { id: task.id },
                            data: {
                                metadata: {
                                    ...metadata,
                                    zombieCleanup: true,
                                    cleanedAt: new Date().toISOString(),
                                    refunded: true,
                                    refundedAt: new Date().toISOString(),
                                },
                            },
                        });
                        logger_1.default.info(`[TaskService] 僵尸任务已清理并退款: ${task.id}, 退还 ${creditsCharged} 积分`);
                    }
                    catch (refundError) {
                        logger_1.default.error(`[TaskService] 僵尸任务退款失败: ${task.id}`, refundError);
                    }
                }
                else {
                    logger_1.default.info(`[TaskService] 僵尸任务已清理: ${task.id}`);
                }
                cleaned++;
            }
            catch (error) {
                logger_1.default.error(`[TaskService] 清理僵尸任务失败: ${task.id}`, error);
            }
        }
        logger_1.default.info(`[TaskService] 僵尸任务清理完成，共清理 ${cleaned} 个任务`);
        return cleaned;
    }
    /**
     * 启动僵尸任务定时清理（仅在主进程执行）
     * @param intervalMinutes 清理间隔（分钟），默认 5 分钟
     * @param thresholdMinutes 超时阈值（分钟），默认 30 分钟
     */
    startZombieCleanupScheduler(intervalMinutes = 5, thresholdMinutes = 30) {
        // 检查是否是主进程（PM2 集群模式下只让一个进程执行）
        const instanceId = process.env.NODE_APP_INSTANCE || '0';
        if (instanceId !== '0') {
            logger_1.default.info(`[TaskService] 僵尸任务清理：非主进程(${instanceId})，跳过`);
            return;
        }
        logger_1.default.info(`[TaskService] 启动僵尸任务定时清理，间隔: ${intervalMinutes}分钟，超时阈值: ${thresholdMinutes}分钟`);
        // 启动后延迟 1 分钟执行第一次清理
        setTimeout(() => {
            this.cleanupZombieTasks(thresholdMinutes).catch(err => {
                logger_1.default.error('[TaskService] 僵尸任务清理失败:', err);
            });
        }, 60 * 1000);
        // 设置定时器
        setInterval(() => {
            this.cleanupZombieTasks(thresholdMinutes).catch(err => {
                logger_1.default.error('[TaskService] 僵尸任务清理失败:', err);
            });
        }, intervalMinutes * 60 * 1000);
    }
}
exports.default = new TaskService();
//# sourceMappingURL=task.service.js.map