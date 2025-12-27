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
exports.identifyImagePoints = exports.imageEdit = exports.getImageEditingModels = exports.createCommercial = exports.upscaleVideo = exports.designVoice = exports.diagnoseMinimaxVoice = exports.listVoicePresets = exports.deleteUserVoice = exports.updateUserVoice = exports.addUserVoice = exports.listUserVoices = exports.synthesizeAudio = exports.queryVoiceStatus = exports.createVoiceEnrollment = exports.generateVideo = exports.generateText = exports.generateImage = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const index_1 = require("../index");
const geminiService = __importStar(require("../services/ai/gemini-proxy.service"));
const doubaoService = __importStar(require("../services/ai/doubao.service"));
const wanxService = __importStar(require("../services/ai/wanx.service"));
const soraService = __importStar(require("../services/ai/sora.service"));
const viduService = __importStar(require("../services/ai/vidu.service"));
const minimaxiService = __importStar(require("../services/ai/minimaxi.service"));
const minimaxiImageService = __importStar(require("../services/ai/minimaxi.image.service"));
const midjourney_service_1 = require("../services/midjourney.service");
const aliyunService = __importStar(require("../services/ai/aliyun.service"));
const cosyvoice_service_1 = __importDefault(require("../services/ai/cosyvoice.service"));
const minimaxi_audio_service_1 = __importDefault(require("../services/ai/minimaxi.audio.service"));
const storage_service_1 = require("../services/storage.service");
const file_1 = require("../utils/file");
const user_level_service_1 = require("../services/user-level.service");
const waule_api_client_1 = require("../services/waule-api.client");
// 🚀 获取 AI 模型（带缓存）
async function getAIModel(modelId) {
    const cacheKey = `ai:model:${modelId}`;
    try {
        const cached = await index_1.redis.get(cacheKey);
        if (cached)
            return JSON.parse(cached);
    }
    catch { }
    // 兼容：部分调用方会传 AIModel.id（数据库主键），也有调用方会直接传 AIModel.modelId（供应商模型名）
    let model = await index_1.prisma.aIModel.findUnique({
        where: { id: modelId },
    });
    if (!model) {
        model = await index_1.prisma.aIModel.findFirst({
            where: { modelId },
        });
    }
    if (model) {
        try {
            await index_1.redis.set(cacheKey, JSON.stringify(model), 'EX', 600);
        }
        catch { }
    }
    return model;
}
/**
 * 生成图片
 */
exports.generateImage = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { modelId, prompt, ratio = '1:1', referenceImages } = req.body;
    if (!modelId || !prompt) {
        throw new errorHandler_1.AppError('模型ID和提示词是必需的', 400);
    }
    // 🚀 获取模型配置（使用缓存）
    const model = await getAIModel(modelId);
    if (!model) {
        throw new errorHandler_1.AppError('模型不存在', 404);
    }
    if (!model.isActive) {
        throw new errorHandler_1.AppError('模型未启用', 400);
    }
    if (model.type !== 'IMAGE_GENERATION') {
        throw new errorHandler_1.AppError('该模型不支持图片生成', 400);
    }
    let imageUrl;
    try {
        const wauleApiClient = (0, waule_api_client_1.getWauleApiClient)(model);
        // 如果配置了 waule-api 地址，优先使用网关
        if (wauleApiClient) {
            const modelLower = String(model.modelId || '').toLowerCase();
            const providerLower = String(model.provider || '').toLowerCase();
            if (providerLower === 'sora' || modelLower.includes('sora')) {
                // waule-api 服务端已配置 SORA_API_KEY，无需客户端传递
                const result = await wauleApiClient.soraChatCompletions({
                    model: model.modelId,
                    messages: [{ role: 'user', content: prompt }],
                    image: referenceImages && referenceImages.length > 0 ? referenceImages[0] : undefined,
                });
                const content = result?.choices?.[0]?.message?.content || '';
                const imgMatch = String(content).match(/<img[^>]+src=['"]([^'"]+)['"]/i);
                if (imgMatch && imgMatch[1]) {
                    imageUrl = imgMatch[1];
                }
                else {
                    throw new Error('WauleAPI Sora 响应中没有图片URL');
                }
            }
            else {
                const r = await wauleApiClient.generateImage({
                    model: model.modelId,
                    prompt,
                    size: ratio,
                    reference_images: referenceImages || undefined,
                });
                const first = r?.data?.[0]?.url;
                if (!first)
                    throw new Error('WauleAPI 未返回图片数据');
                imageUrl = first;
            }
        }
        if (!imageUrl) {
            // 根据提供商调用不同的服务
            switch (model.provider.toLowerCase()) {
                case 'google':
                    imageUrl = await geminiService.generateImage({
                        prompt,
                        modelId: model.modelId,
                        aspectRatio: ratio,
                        referenceImages: referenceImages || undefined,
                        apiKey: model.apiKey || undefined,
                        apiUrl: model.apiUrl || undefined,
                    });
                    break;
                case 'openai':
                    // TODO: 实现 OpenAI DALL-E API
                    throw new errorHandler_1.AppError('OpenAI 图片生成暂未实现', 501);
                case 'stability':
                    // TODO: 实现 Stability AI API
                    throw new errorHandler_1.AppError('Stability AI 图片生成暂未实现', 501);
                case 'bytedance':
                    const bytedanceResult = await doubaoService.generateImage({
                        prompt,
                        modelId: model.modelId,
                        aspectRatio: ratio,
                        referenceImages: referenceImages || undefined,
                        apiKey: model.apiKey || undefined,
                        apiUrl: model.apiUrl || undefined,
                        // 注意：此直接API调用不支持组图模式，组图模式应使用任务接口
                    });
                    // 如果返回数组，取第一张图片
                    imageUrl = Array.isArray(bytedanceResult) ? bytedanceResult[0] : bytedanceResult;
                    break;
                case 'minimaxi':
                case 'hailuo':
                case '海螺':
                    imageUrl = await minimaxiImageService.generateImage({
                        prompt,
                        modelId: model.modelId,
                        aspectRatio: ratio,
                        referenceImages: referenceImages || undefined,
                        apiKey: model.apiKey || undefined,
                        apiUrl: model.apiUrl || undefined,
                    });
                    break;
                case 'midjourney':
                    // 使用 Midjourney 生成图片
                    console.log('🎨 [AI Controller] 使用 Midjourney 生成图片');
                    // 构建完整的提示词（添加比例参数）
                    let fullPrompt = prompt;
                    // 检查是否已有 --ar 参数，没有则添加
                    if (ratio && ratio !== '1:1' && !fullPrompt.includes('--ar')) {
                        fullPrompt += ` --ar ${ratio}`;
                    }
                    // 检查是否已有 --v 参数，没有则根据模型ID添加
                    if (!fullPrompt.includes('--v') && !fullPrompt.includes('--version')) {
                        if (model.modelId.includes('v7')) {
                            fullPrompt += ' --v 7.0'; // V7 使用 7.0
                        }
                        else if (model.modelId.includes('v6')) {
                            fullPrompt += ' --v 6.0'; // V6 使用 6.0
                        }
                    }
                    console.log('📝 完整提示词:', fullPrompt);
                    // 提交 imagine 任务
                    const imagineResponse = await (0, midjourney_service_1.getMidjourneyService)().imagine({
                        prompt: fullPrompt,
                        base64Array: referenceImages || undefined,
                    });
                    if (imagineResponse.code !== 1) {
                        throw new errorHandler_1.AppError(`Midjourney 任务提交失败: ${imagineResponse.description}`, 500);
                    }
                    const taskId = imagineResponse.result;
                    console.log('✅ Midjourney 任务已提交:', taskId);
                    // 轮询等待任务完成
                    console.log('⏳ 等待 Midjourney 生成...');
                    const taskResult = await (0, midjourney_service_1.getMidjourneyService)().pollTask(taskId);
                    console.log('📊 [Midjourney] Task Result:', JSON.stringify(taskResult, null, 2));
                    if (!taskResult.imageUrl) {
                        console.error('❌ [Midjourney] 未获取到图片URL');
                        console.error('Task Result:', taskResult);
                        throw new errorHandler_1.AppError('Midjourney 生成失败: 未获取到图片URL', 500);
                    }
                    imageUrl = taskResult.imageUrl;
                    console.log('🎉 Midjourney 生成完成!');
                    console.log('   图片URL:', imageUrl);
                    console.log('   按钮数量:', taskResult.buttons?.length || 0);
                    break;
                case 'sora':
                    imageUrl = await soraService.generateImage({
                        prompt,
                        modelId: model.modelId,
                        aspectRatio: ratio,
                        referenceImages: referenceImages || undefined,
                        apiKey: model.apiKey || undefined,
                        apiUrl: model.apiUrl || undefined,
                    });
                    break;
                case 'aliyun':
                    imageUrl = await aliyunService.generateImage({
                        prompt,
                        modelId: model.modelId,
                        aspectRatio: ratio,
                        referenceImages: referenceImages || undefined,
                        apiKey: model.apiKey || undefined,
                        apiUrl: model.apiUrl || undefined,
                    });
                    break;
                default:
                    throw new errorHandler_1.AppError(`不支持的提供商: ${model.provider}`, 400);
            }
        }
        if (!imageUrl) {
            throw new errorHandler_1.AppError('图片生成失败: 未获取到图片URL', 500);
        }
        // 记录使用
        await index_1.prisma.usageRecord.create({
            data: {
                userId: req.user.id,
                modelId: model.id,
                operation: 'IMAGE_GENERATION',
                cost: model.pricePerUse || 0,
                metadata: {
                    prompt,
                    ratio,
                    provider: model.provider,
                },
            },
        });
        const responseData = {
            success: true,
            data: {
                imageUrl,
                model: model.name,
                ratio,
            },
        };
        console.log('📤 [AI Controller] 返回响应:', JSON.stringify(responseData, null, 2));
        res.json(responseData);
    }
    catch (error) {
        console.error('Image generation error:', error);
        throw new errorHandler_1.AppError(`图片生成失败: ${error.message}`, 500);
    }
});
/**
 * 生成文本
 */
exports.generateText = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { modelId, prompt, systemPrompt, temperature, maxTokens, documentFiles, imageUrls, videoUrls, skipBilling } = req.body;
    const userId = req.user.id;
    if (!modelId || !prompt) {
        throw new errorHandler_1.AppError('模型ID和提示词是必需的', 400);
    }
    // 🚀 获取模型配置（使用缓存）
    const model = await getAIModel(modelId);
    if (!model) {
        throw new errorHandler_1.AppError('模型不存在', 404);
    }
    if (!model.isActive) {
        throw new errorHandler_1.AppError('模型未启用', 400);
    }
    if (model.type !== 'TEXT_GENERATION') {
        throw new errorHandler_1.AppError('该模型不支持文本生成', 400);
    }
    // 扣费逻辑（如果 skipBilling 为 true，则跳过扣费）
    const { billingService } = await Promise.resolve().then(() => __importStar(require('../services/billing.service')));
    let creditsCharged = 0;
    if (!skipBilling) {
        try {
            const usageRecord = await billingService.chargeUser({
                userId,
                aiModelId: modelId,
                operation: '文本生成',
                quantity: 1,
            });
            if (usageRecord) {
                creditsCharged = usageRecord.creditsCharged || 0;
                console.log(`[AI] 文本生成扣费: ${creditsCharged} 积分, 用户: ${userId}`);
            }
        }
        catch (error) {
            if (error.message?.includes('Insufficient')) {
                throw new errorHandler_1.AppError('积分不足，请充值后再试', 402);
            }
            console.warn('[AI] 文本生成扣费失败:', error.message);
        }
    }
    else {
        console.log(`[AI] 文本生成跳过扣费（skipBilling=true）, 用户: ${userId}`);
    }
    let text;
    try {
        const wauleApiClient = (0, waule_api_client_1.getWauleApiClient)(model);
        // 如果配置了 waule-api 地址，优先使用网关
        if (wauleApiClient) {
            const messages = [];
            if (systemPrompt)
                messages.push({ role: 'system', content: systemPrompt });
            const userContent = [{ type: 'text', text: prompt }];
            for (const url of (imageUrls || [])) {
                userContent.push({ type: 'image_url', image_url: { url } });
            }
            for (const url of (videoUrls || [])) {
                userContent.push({ type: 'video_url', video_url: { url } });
            }
            messages.push({ role: 'user', content: userContent });
            const r = await wauleApiClient.chatCompletions({
                model: model.modelId,
                messages,
                temperature,
                max_tokens: maxTokens,
            });
            const content = r?.choices?.[0]?.message?.content;
            if (!content)
                throw new Error('WauleAPI 未返回文本内容');
            text = content;
        }
        if (!text) {
            // 根据提供商调用不同的服务
            switch (model.provider.toLowerCase()) {
                case 'google':
                    text = await geminiService.generateText({
                        prompt,
                        systemPrompt,
                        modelId: model.modelId,
                        temperature,
                        maxTokens,
                        documentFiles,
                        imageUrls,
                        videoUrls,
                        apiKey: model.apiKey || undefined,
                        apiUrl: model.apiUrl || undefined,
                    });
                    break;
                case 'openai':
                    // TODO: 实现 OpenAI API
                    throw new errorHandler_1.AppError('OpenAI 文本生成暂未实现', 501);
                case 'bytedance':
                    text = await doubaoService.generateText({
                        prompt,
                        systemPrompt,
                        modelId: model.modelId,
                        temperature,
                        maxTokens,
                        imageUrls,
                        videoUrls,
                        apiKey: model.apiKey || undefined,
                        apiUrl: model.apiUrl || undefined,
                    });
                    break;
                case 'doubao':
                    text = await doubaoService.generateText({
                        prompt,
                        systemPrompt,
                        modelId: model.modelId,
                        temperature,
                        maxTokens,
                        imageUrls,
                        videoUrls,
                        apiKey: model.apiKey || undefined,
                        apiUrl: model.apiUrl || undefined,
                    });
                    break;
                default:
                    throw new errorHandler_1.AppError(`不支持的提供商: ${model.provider}`, 400);
            }
        }
        if (!text) {
            throw new errorHandler_1.AppError('文本生成失败: 未获取到文本内容', 500);
        }
        res.json({
            success: true,
            data: {
                text,
                model: model.name,
            },
            creditsCharged,
        });
    }
    catch (error) {
        console.error('Text generation error:', error);
        throw new errorHandler_1.AppError(`文本生成失败: ${error.message}`, 500);
    }
});
/**
 * 生成视频
 */
exports.generateVideo = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { modelId, prompt, ratio = '16:9', resolution = '1080p', // 注意：小写p
    generationType = '文生视频', duration = 5, referenceImages } = req.body;
    console.log('🎬 视频生成请求参数:', {
        modelId,
        prompt: prompt?.substring(0, 100),
        ratio,
        resolution,
        generationType,
        duration,
        referenceImagesCount: referenceImages?.length || 0,
        referenceImages: referenceImages?.map((img) => ({
            type: img.startsWith('data:') ? 'base64' : (img.startsWith('http') ? 'url' : 'unknown'),
            preview: img.substring(0, 100) + '...'
        }))
    });
    if (!modelId || !prompt) {
        throw new errorHandler_1.AppError('模型ID和提示词是必需的', 400);
    }
    // 🚀 获取模型配置（使用缓存）
    const model = await getAIModel(modelId);
    if (!model) {
        throw new errorHandler_1.AppError('模型不存在', 404);
    }
    if (!model.isActive) {
        throw new errorHandler_1.AppError('模型未启用', 400);
    }
    if (model.type !== 'VIDEO_GENERATION') {
        throw new errorHandler_1.AppError('该模型不支持视频生成', 400);
    }
    let videoUrl;
    try {
        const wauleApiClient = (0, waule_api_client_1.getWauleApiClient)(model);
        // 如果配置了 waule-api 地址，优先使用网关（不再检查 canUseGateway 列表）
        if (wauleApiClient) {
            const providerLower = String(model.provider || '').toLowerCase();
            const modelLower = String(model.modelId || '').toLowerCase();
            if (providerLower === 'sora' || modelLower.includes('sora')) {
                // waule-api 服务端已配置 SORA_API_KEY，无需客户端传递
                const referenceImage = referenceImages && referenceImages.length > 0 ? referenceImages[0] : undefined;
                const payload = {
                    model: model.modelId,
                    messages: [
                        {
                            role: 'user',
                            content: referenceImage
                                ? [
                                    { type: 'text', text: prompt || '' },
                                    { type: 'image_url', image_url: { url: referenceImage } },
                                ]
                                : prompt,
                        },
                    ],
                    stream: true,
                };
                const r = await wauleApiClient.soraChatCompletions(payload);
                const content = r?.choices?.[0]?.message?.content || '';
                const videoMatch = String(content).match(/<video[^>]+src=['"]([^'"]+)['"]/i);
                if (!videoMatch || !videoMatch[1])
                    throw new Error('WauleAPI Sora 响应中没有视频URL');
                videoUrl = videoMatch[1];
            }
            else {
                const r = await wauleApiClient.generateVideo({
                    model: model.modelId,
                    prompt,
                    duration,
                    aspect_ratio: ratio,
                    resolution,
                    reference_images: referenceImages || undefined,
                    generation_type: generationType,
                });
                const first = r?.data?.[0]?.url;
                if (!first)
                    throw new Error('WauleAPI 未返回视频数据');
                videoUrl = first;
            }
        }
        if (!videoUrl) {
            // 根据提供商调用不同的服务
            const providerLower = model.provider.toLowerCase();
            switch (providerLower) {
                case 'doubao':
                case 'bytedance':
                    videoUrl = await doubaoService.generateVideo({
                        prompt,
                        modelId: model.modelId,
                        ratio,
                        resolution,
                        generationType,
                        duration,
                        referenceImages,
                        apiKey: model.apiKey || undefined,
                        apiUrl: model.apiUrl || undefined,
                    });
                    break;
                case 'minimaxi':
                case 'hailuo':
                case '海螺':
                    {
                        const referenceImageList = referenceImages || [];
                        const videoDuration = typeof duration === 'number' ? duration : 5;
                        const genType = (referenceImageList.length >= 2 ? 'fl2v' : (referenceImageList.length === 1 ? 'i2v' : 't2v'));
                        if (genType === 'fl2v') {
                            const modelCaps = await index_1.prisma.modelCapability.findMany({ where: { aiModelId: model.id, capability: '首尾帧' } });
                            const cfg = typeof model.config === 'object' ? model.config : {};
                            const supportedByBackend = modelCaps.length > 0 ? !!modelCaps[0].supported : (Array.isArray(cfg.supportedGenerationTypes) && cfg.supportedGenerationTypes.includes('首尾帧'));
                            if (!supportedByBackend) {
                                throw new errorHandler_1.AppError(`当前模型不支持首尾帧: ${model.modelId}`, 400);
                            }
                        }
                        const videoUrlRes = await minimaxiService.generateVideo({
                            prompt,
                            modelId: model.modelId,
                            aspectRatio: ratio,
                            resolution,
                            duration: videoDuration,
                            referenceImages: referenceImageList,
                            generationType: genType,
                            apiKey: model.apiKey || undefined,
                            apiUrl: model.apiUrl || undefined,
                        });
                        videoUrl = videoUrlRes;
                    }
                    break;
                case 'aliyun':
                case 'tongyi':
                case 'wanx':
                    // 通义万相视频生成
                    // 提取首帧图片（如果是首帧模式）
                    const firstFrameImage = referenceImages && referenceImages.length > 0 ? referenceImages[0] : undefined;
                    // 通义万相duration是整数（秒），直接使用
                    const wanxDuration = duration; // 5 或 10（秒）
                    // 通义万相resolution格式：'480P'、'720P'、'1080P'
                    // 如果传入的是其他格式，转换为标准格式
                    let wanxResolution = resolution;
                    if (resolution === '1280x720') {
                        wanxResolution = '720P';
                    }
                    else if (resolution === '1920x1080') {
                        wanxResolution = '1080P';
                    }
                    else if (!['480P', '720P', '1080P'].includes(resolution)) {
                        // 默认使用1080P
                        wanxResolution = '1080P';
                    }
                    videoUrl = await wanxService.generateVideoFromFirstFrame({
                        prompt,
                        modelId: model.modelId,
                        firstFrameImage,
                        duration: wanxDuration, // 整数：5 或 10
                        resolution: wanxResolution, // 字符串：'480P'、'720P'、'1080P'
                        apiKey: model.apiKey || undefined,
                        apiUrl: model.apiUrl || undefined,
                    });
                    break;
                case 'sora':
                    // Sora 视频生成（支持文生视频和图生视频）
                    const referenceImage = referenceImages && referenceImages.length > 0 ? referenceImages[0] : undefined;
                    videoUrl = await soraService.generateVideo({
                        prompt,
                        modelId: model.modelId,
                        aspectRatio: ratio,
                        referenceImage,
                        apiKey: model.apiKey || undefined,
                        apiUrl: model.apiUrl || undefined,
                    });
                    break;
                case 'vidu':
                    // Vidu Q2 图生视频（支持单张首帧图或首尾帧）
                    if (!referenceImages || referenceImages.length === 0) {
                        throw new errorHandler_1.AppError('Vidu 需要提供首帧图像', 400);
                    }
                    console.log('🎬 [Vidu] 开始图生视频生成');
                    console.log('   - 模型:', model.modelId);
                    console.log('   - 时长:', duration);
                    console.log('   - 分辨率:', resolution);
                    console.log('   - 图片数量:', referenceImages.length);
                    console.log('   - 生成类型:', referenceImages.length === 2 ? '首尾帧' : '图生视频');
                    videoUrl = await viduService.imageToVideo({
                        images: referenceImages.length === 2 ? [referenceImages[0], referenceImages[1]] : [referenceImages[0]], // 支持首尾帧或单张首帧
                        prompt: prompt || undefined,
                        model: model.modelId,
                        duration,
                        resolution,
                        apiKey: model.apiKey,
                        apiUrl: model.apiUrl || undefined,
                    });
                    console.log('✅ [Vidu] 视频生成成功:', videoUrl);
                    break;
                default:
                    throw new errorHandler_1.AppError(`不支持的提供商: ${model.provider}`, 400);
            }
        }
        if (!videoUrl) {
            throw new errorHandler_1.AppError('视频生成失败: 未获取到视频URL', 500);
        }
        res.json({
            success: true,
            data: {
                url: videoUrl,
            },
        });
    }
    catch (error) {
        console.error('视频生成失败:', error);
        throw new errorHandler_1.AppError(error.message || '视频生成失败', 500);
    }
});
exports.createVoiceEnrollment = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { modelId, targetModel, prefix, url, promptUrl, promptText } = req.body;
    if (!targetModel && !modelId) {
        throw new errorHandler_1.AppError('必须提供 targetModel 或模型ID', 400);
    }
    let model = null;
    if (modelId) {
        model = await index_1.prisma.aIModel.findUnique({ where: { id: modelId } });
        if (!model)
            throw new errorHandler_1.AppError('模型不存在', 404);
        if (!model.isActive)
            throw new errorHandler_1.AppError('模型未启用', 400);
        if (model.type !== 'AUDIO_SYNTHESIS')
            throw new errorHandler_1.AppError('模型类型必须为语音合成', 400);
    }
    const tm = targetModel || model?.modelId || 'cosyvoice-v2';
    const apiKey = model?.apiKey || undefined;
    const apiUrl = model?.apiUrl || undefined;
    const providerLower = (model?.provider || '').toLowerCase();
    if (providerLower === 'minimaxi' || providerLower === 'hailuo' || providerLower === '海螺') {
        if (!url)
            throw new errorHandler_1.AppError('MiniMax 声音克隆需要上传音频文件URL', 400);
        const rawPrefix = String(prefix || 'voice').toLowerCase();
        let base = rawPrefix.replace(/[^a-z0-9-_]/g, '-');
        if (!/^[a-z]/.test(base))
            base = `v-${base}`;
        base = base.replace(/[-_]{2,}/g, '-');
        base = base.replace(/[-_]$/g, '');
        // User provided voiceId is not passed in body? 
        // The previous code generated a random ID. 
        // The new requirement says "Voice ID: Text Input (User defined)".
        // So we should check if `voiceId` is passed in body, or use `prefix` as base.
        // But the function signature in `req.body` destructuring didn't include `voiceId`.
        // Let's check if I can add it.
        // Actually, looking at the previous code: `const { modelId, targetModel, prefix, url, promptUrl, promptText } = req.body;`
        // It seems `voiceId` was not expected.
        // But the new node will send `voiceId`.
        // I should extract `voiceId` from req.body if available.
        const { voiceId: userVoiceId, previewText: userPreviewText } = req.body;
        const customVoiceId = userVoiceId || `${base}-${Date.now()}`.slice(0, 64);
        // 立即返回，后台执行上传与克隆
        // Note: If the user wants to see the preview immediately, maybe we shouldn't return immediately?
        // But file upload might take time.
        // The new node logic says "Display returned preview audio".
        // If we return immediately, we can't return the preview URL.
        // So we should probably await the process if it's MiniMax, or at least await the clone part.
        // However, `createVoiceEnrollment` is designed to be async for CosyVoice usually?
        // Let's change it to await for MiniMax so we can return the sample audio.
        // But wait, `uploadFile` might take time.
        // If we await, the UI might block.
        // But the user expects a result.
        // Let's try to await it.
        try {
            // 1. Upload Clone Audio
            // purpose='voice_clone'
            const fileId = await minimaxi_audio_service_1.default.uploadFile({ filePath: url, purpose: 'voice_clone', apiKey, apiUrl });
            // 2. Upload Prompt Audio (if any)
            let promptFileId;
            if (promptUrl) {
                try {
                    promptFileId = await minimaxi_audio_service_1.default.uploadFile({ filePath: promptUrl, purpose: 'prompt_audio', apiKey, apiUrl });
                }
                catch (e) {
                    console.warn('Prompt audio upload failed, ignoring:', e);
                }
            }
            // 3. Clone
            const promptTextSafe = String(promptText || '').trim();
            // We use a default preview text if not provided, to get a sample audio
            const finalPreviewText = userPreviewText || promptTextSafe || "欢迎使用 MiniMax 语音克隆服务，这是一个合成示例。";
            const result = await minimaxi_audio_service_1.default.voiceClone({
                clone_file_id: fileId,
                voice_id: customVoiceId,
                prompt_audio_file_id: promptFileId,
                apiKey,
                apiUrl,
                prompt_text: promptTextSafe || undefined,
                model: tm,
                text: finalPreviewText // Request a preview generation
            });
            // result.sampleFileId might be a URL now (demo_audio)
            let finalSampleUrl = result.sampleFileId;
            if (finalSampleUrl) {
                try {
                    // User requested local download instead of OSS
                    finalSampleUrl = await (0, file_1.downloadToLocal)(finalSampleUrl, 'audio');
                }
                catch (e) {
                    console.warn('Failed to download sample audio locally, using original URL:', e);
                }
            }
            res.json({ success: true, data: { voiceId: customVoiceId, sampleUrl: finalSampleUrl } });
        }
        catch (e) {
            throw new errorHandler_1.AppError(e.message || 'MiniMax 克隆失败', 500);
        }
    }
    else {
        const { voiceId, requestId } = await cosyvoice_service_1.default.createVoice({ targetModel: tm, prefix, url, apiKey, apiUrl });
        res.json({ success: true, data: { voiceId, requestId } });
    }
});
exports.queryVoiceStatus = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { voiceId, modelId } = req.query;
    if (!voiceId)
        throw new errorHandler_1.AppError('voiceId 必填', 400);
    let model = null;
    if (modelId)
        model = await index_1.prisma.aIModel.findUnique({ where: { id: String(modelId) } });
    const { status, requestId } = await cosyvoice_service_1.default.queryVoice({ voiceId: String(voiceId), apiKey: model?.apiKey || undefined, apiUrl: model?.apiUrl || undefined });
    res.json({ success: true, data: { status, requestId } });
});
exports.synthesizeAudio = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { modelId, voiceId, text, format = 'mp3', sampleRate, volume, rate, pitch, emotion, stream, subtitle_enable, language_boost, pronunciation_dict, timber_weights, voice_modify, output_format, aigc_watermark } = req.body;
    if (!modelId || !voiceId || !text)
        throw new errorHandler_1.AppError('modelId, voiceId, text 必填', 400);
    const model = await index_1.prisma.aIModel.findUnique({ where: { id: modelId } });
    if (!model)
        throw new errorHandler_1.AppError('模型不存在', 404);
    if (!model.isActive)
        throw new errorHandler_1.AppError('模型未启用', 400);
    if (String(model.type) !== 'AUDIO_SYNTHESIS')
        throw new errorHandler_1.AppError('模型类型必须为语音合成', 400);
    const cfg = model.config || {};
    const knownModels = ['cosyvoice-v1', 'cosyvoice-v2', 'cosyvoice-v3', 'cosyvoice-v3-plus'];
    const matchedModel = knownModels.find((m) => String(voiceId).startsWith(m));
    const modelForSynthesis = matchedModel || (model.modelId || 'cosyvoice-v2');
    let audioUrl;
    try {
        const providerLower = (model.provider || '').toLowerCase();
        if (providerLower === 'minimaxi' || providerLower === 'hailuo' || providerLower === '海螺') {
            const voiceSetting = { voice_id: voiceId };
            if (typeof rate === 'number')
                voiceSetting.speed = rate;
            if (typeof volume === 'number')
                voiceSetting.vol = volume;
            if (typeof pitch === 'number')
                voiceSetting.pitch = pitch;
            const normalizeEmotion = (e) => {
                const key = String(e || '').toLowerCase();
                const map = {
                    neutral: 'neutral',
                    happy: 'happy',
                    sad: 'sad',
                    angry: 'angry',
                    fear: 'fear',
                    disgust: 'disgust',
                    surprise: 'surprise',
                    serious: 'serious',
                    friendly: 'friendly',
                };
                return map[key] || key;
            };
            const voiceModifyCombined = { ...(voice_modify || {}) };
            if (typeof emotion === 'string' && emotion) {
                const em = normalizeEmotion(emotion);
                voiceModifyCombined.emotion = em;
                if (!voiceModifyCombined.style)
                    voiceModifyCombined.style = em;
            }
            const audioSetting = { format };
            if (typeof sampleRate === 'number')
                audioSetting.sample_rate = sampleRate;
            if (typeof audioSetting.channel === 'undefined')
                audioSetting.channel = 2;
            {
                const maxAttempts = 8;
                let attempt = 0;
                let lastErr = null;
                while (attempt < maxAttempts) {
                    attempt++;
                    try {
                        audioUrl = await minimaxi_audio_service_1.default.synthesizeSync({ model: model.modelId, text, voice: voiceSetting, audio: audioSetting, apiKey: model.apiKey || undefined, apiUrl: model.apiUrl || undefined, stream, subtitle_enable, language_boost, pronunciation_dict, timber_weights, voice_modify: voiceModifyCombined, output_format, aigc_watermark });
                        lastErr = null;
                        break;
                    }
                    catch (e) {
                        lastErr = e;
                        const code = e?.response?.data?.base_resp?.status_code || e?.status;
                        const msg = String(e?.response?.data?.base_resp?.status_msg || e?.message || '').toLowerCase();
                        if (code === 2054 || /voice id not exist/i.test(msg)) {
                            await new Promise((r) => setTimeout(r, 2500));
                            continue;
                        }
                        throw e;
                    }
                }
                if (lastErr)
                    throw lastErr;
            }
        }
        else {
            audioUrl = await cosyvoice_service_1.default.synthesize({ model: modelForSynthesis, voice: voiceId, text, format, sampleRate, volume, rate, pitch, apiKey: model.apiKey || undefined, apiUrl: model.apiUrl || undefined });
        }
    }
    catch (e) {
        const raw = e?.message || '';
        const status = e?.response?.data?.base_resp?.status_code || e?.status;
        const msg = e?.response?.data?.base_resp?.status_msg || e?.response?.data?.message || e?.message;
        if (/timeout/i.test(String(e?.code || '')) || /ECONNABORTED/.test(String(e?.code || ''))) {
            throw new errorHandler_1.AppError('MiniMax: 网络超时，请稍后重试或检查网络/权限', 504);
        }
        if (typeof status === 'number' && status === 2054) {
            throw new errorHandler_1.AppError('MiniMax: Voice ID 不存在或未就绪，请确认已创建并可用', 400);
        }
        if (/403/.test(raw) && /Access denied/i.test(raw)) {
            throw new errorHandler_1.AppError('访问被拒绝：请确认账号状态正常且该模型/功能已开通，或API Key权限有效。', 403);
        }
        if (/url error/i.test(raw)) {
            throw new errorHandler_1.AppError('音频URL不可达或不符合要求（需公网直链，支持http/https），请检查训练音频链接', 400);
        }
        throw new errorHandler_1.AppError(msg || 'MiniMax 合成失败', typeof status === 'number' ? status : 500);
    }
    // 记录使用
    await index_1.prisma.usageRecord.create({
        data: {
            userId: req.user.id,
            modelId: model.id,
            operation: 'AUDIO_SYNTHESIS',
            cost: model.pricePerUse || 0,
            metadata: { voiceId, format },
        },
    });
    // 更新该用户保存的该 Voice 的最后使用时间（用于一周保留判断）
    try {
        const list = await index_1.prisma.setting.findMany({ where: { key: { startsWith: `user:${req.user.id}:voice:` }, type: 'VOICE_ID' } });
        for (const row of list) {
            try {
                const payload = JSON.parse(row.value || '{}');
                if (String(payload.voiceId) === String(voiceId)) {
                    payload.lastUsed = Date.now();
                    await index_1.prisma.setting.update({ where: { id: row.id }, data: { value: JSON.stringify(payload) } });
                    break;
                }
            }
            catch { }
        }
    }
    catch { }
    try {
        if (audioUrl && /^https?:\/\//.test(audioUrl)) {
            const axios = require('axios');
            const res2 = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 60000, maxRedirects: 3, validateStatus: (s) => s >= 200 && s < 400 });
            const buf = Buffer.from(res2.data || Buffer.alloc(0));
            if (!buf.length || buf.length <= 0) {
                throw new errorHandler_1.AppError('MiniMax 合成返回空音频，请稍后重试或检查 Voice ID 是否就绪', 500);
            }
            const ct = String(res2.headers?.['content-type'] || '');
            const ext = ct.includes('wav') ? '.wav' : '.mp3';
            // 上传到存储
            audioUrl = await storage_service_1.storageService.uploadBuffer(buf, ext);
        }
        else if (audioUrl && !/^https?:\/\//.test(audioUrl)) {
            const pathMod = require('path');
            const fs = require('fs');
            const fullPath = pathMod.join(process.cwd(), audioUrl.startsWith('/') ? audioUrl.slice(1) : audioUrl);
            if (fs.existsSync(fullPath)) {
                const stat = await fs.promises.stat(fullPath);
                if (!stat.size || stat.size <= 0) {
                    throw new errorHandler_1.AppError('本地音频文件为空，合成失败', 500);
                }
            }
        }
    }
    catch (e) {
        if (e instanceof errorHandler_1.AppError)
            throw e;
    }
    res.json({ success: true, data: { url: audioUrl || '' } });
});
exports.listUserVoices = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const list = await index_1.prisma.setting.findMany({
        where: { key: { startsWith: `user:${req.user.id}:voice:` }, type: 'VOICE_ID' },
        orderBy: { createdAt: 'desc' },
    });
    const now = Date.now();
    const expireMs = 7 * 24 * 60 * 60 * 1000;
    const keep = [];
    for (const s of list) {
        let lastUsed = 0;
        try {
            const payload = JSON.parse(s.value || '{}');
            if (payload && typeof payload.lastUsed === 'number')
                lastUsed = payload.lastUsed;
        }
        catch { }
        if (!lastUsed) {
            try {
                lastUsed = s.updatedAt ? new Date(s.updatedAt).getTime() : 0;
            }
            catch { }
            if (!lastUsed) {
                try {
                    lastUsed = s.createdAt ? new Date(s.createdAt).getTime() : 0;
                }
                catch { }
            }
        }
        if (lastUsed && now - lastUsed > expireMs) {
            try {
                await index_1.prisma.setting.delete({ where: { id: s.id } });
            }
            catch { }
        }
        else {
            keep.push(s);
        }
    }
    const data = keep.map((s) => {
        try {
            return { id: s.id, ...(JSON.parse(s.value || '{}')) };
        }
        catch {
            return { id: s.id, voiceId: s.value };
        }
    });
    res.json({ success: true, data });
});
exports.addUserVoice = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { voiceId, prefix, targetModel, provider } = req.body;
    if (!voiceId)
        throw new errorHandler_1.AppError('voiceId 必填', 400);
    const id = `${Date.now()}`;
    const key = `user:${req.user.id}:voice:${id}`;
    const value = JSON.stringify({ voiceId, prefix, targetModel, provider, lastUsed: Date.now() });
    const row = await index_1.prisma.setting.create({ data: { key, value, type: 'VOICE_ID' } });
    res.json({ success: true, data: { id: row.id, voiceId, prefix, targetModel, provider } });
});
exports.updateUserVoice = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { prefix } = req.body;
    const row = await index_1.prisma.setting.findUnique({ where: { id } });
    if (!row)
        throw new errorHandler_1.AppError('记录不存在', 404);
    if (!row.key.startsWith(`user:${req.user.id}:voice:`) || row.type !== 'VOICE_ID')
        throw new errorHandler_1.AppError('无权限', 403);
    let payload = {};
    try {
        payload = JSON.parse(row.value || '{}');
    }
    catch { }
    payload.prefix = prefix || payload.prefix;
    const updated = await index_1.prisma.setting.update({ where: { id }, data: { value: JSON.stringify(payload) } });
    res.json({ success: true, data: { id: updated.id, ...payload } });
});
exports.deleteUserVoice = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const row = await index_1.prisma.setting.findUnique({ where: { id } });
    if (!row)
        throw new errorHandler_1.AppError('记录不存在', 404);
    if (!row.key.startsWith(`user:${req.user.id}:voice:`) || row.type !== 'VOICE_ID')
        throw new errorHandler_1.AppError('无权限', 403);
    try {
        const payload = JSON.parse(row.value || '{}');
        const voiceId = payload.voiceId;
        const provider = String(payload.provider || '').toLowerCase();
        if (voiceId && ['minimaxi', 'hailuo', '海螺'].includes(provider)) {
            await minimaxi_audio_service_1.default.deleteVoice({ voiceId });
        }
    }
    catch { }
    await index_1.prisma.setting.delete({ where: { id } });
    res.json({ success: true });
});
exports.listVoicePresets = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { modelId } = req.query;
    let apiKey;
    let apiUrl;
    if (modelId) {
        const model = await index_1.prisma.aIModel.findUnique({ where: { id: String(modelId) } });
        if (model && ['minimaxi', 'hailuo', '海螺'].includes((model.provider || '').toLowerCase())) {
            apiKey = model.apiKey || undefined;
            apiUrl = model.apiUrl || undefined;
        }
    }
    try {
        const list = await minimaxi_audio_service_1.default.listVoices({ apiKey, apiUrl });
        res.json({ success: true, data: list });
    }
    catch (e) {
        res.json({ success: true, data: [] });
    }
});
exports.diagnoseMinimaxVoice = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { modelId, voiceId } = req.query;
    if (!modelId || !voiceId)
        throw new errorHandler_1.AppError('modelId 与 voiceId 必填', 400);
    const model = await index_1.prisma.aIModel.findUnique({ where: { id: String(modelId) } });
    if (!model)
        throw new errorHandler_1.AppError('模型不存在', 404);
    const providerLower = (model.provider || '').toLowerCase();
    if (!['minimaxi', 'hailuo', '海螺'].includes(providerLower))
        throw new errorHandler_1.AppError('该模型不是 MiniMax 提供商', 400);
    let exists = false;
    let count = 0;
    let groupId = process.env.MINIMAX_GROUP_ID || process.env.MINIMAXI_GROUP_ID || '';
    let recentFiles = [];
    try {
        const list = await minimaxi_audio_service_1.default.listVoices({ apiKey: model.apiKey || undefined, apiUrl: model.apiUrl || undefined });
        count = Array.isArray(list) ? list.length : 0;
        exists = Array.isArray(list) && list.some((v) => String(v.voiceId) === String(voiceId));
    }
    catch { }
    try {
        recentFiles = await minimaxi_audio_service_1.default.listFiles({ apiKey: model.apiKey || undefined, apiUrl: model.apiUrl || undefined, limit: 10 });
    }
    catch { }
    res.json({ success: true, data: { exists, count, groupId, recentFiles } });
});
exports.designVoice = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { modelId, prompt, preview_text, voice_id, aigc_watermark } = req.body;
    if (!modelId || !prompt)
        throw new errorHandler_1.AppError('modelId 与 prompt 必填', 400);
    const model = await index_1.prisma.aIModel.findUnique({ where: { id: String(modelId) } });
    if (!model)
        throw new errorHandler_1.AppError('模型不存在', 404);
    if (!model.isActive)
        throw new errorHandler_1.AppError('模型未启用', 400);
    if ((model.provider || '').toLowerCase() !== 'minimaxi' && (model.provider || '').toLowerCase() !== 'hailuo' && (model.provider || '').toLowerCase() !== '海螺') {
        throw new errorHandler_1.AppError('当前模型不支持音色设计（需 MiniMax 提供商）', 400);
    }
    try {
        const { voiceId, requestId, hex } = await minimaxi_audio_service_1.default.voiceDesign({ prompt, preview_text, voice_id, aigc_watermark, apiKey: model.apiKey || undefined, apiUrl: model.apiUrl || undefined });
        // 保存到用户音色列表（便于后续使用），保留最近10个
        try {
            const key = `user:${req.user.id}:voice:${Date.now()}`;
            const value = JSON.stringify({ voiceId, prefix: voice_id || voiceId, targetModel: model.id, provider: model.provider, lastUsed: Date.now() });
            await index_1.prisma.setting.create({ data: { key, value, type: 'VOICE_ID' } });
        }
        catch { }
        const payload = { voice_id: voiceId, request_id: requestId };
        if (hex && typeof hex === 'string' && hex.length > 0)
            payload.trial_audio = hex;
        res.json({ success: true, data: payload });
    }
    catch (e) {
        const msg = e?.response?.data?.base_resp?.status_msg || e?.response?.data?.message || e?.message || '音色设计失败';
        throw new errorHandler_1.AppError(msg, e?.status || 500);
    }
});
/**
 * 智能超清 (视频放大)
 */
exports.upscaleVideo = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { video_url, video_creation_id, upscale_resolution = '1080p', apiKey, apiUrl } = req.body;
    const userId = req.user?.id;
    if (!userId) {
        throw new errorHandler_1.AppError('未授权', 401);
    }
    if (!video_url && !video_creation_id) {
        throw new errorHandler_1.AppError('必须提供 video_url 或 video_creation_id', 400);
    }
    if (!apiKey) {
        throw new errorHandler_1.AppError('缺少 Vidu API Key', 400);
    }
    try {
        // 创建数据库任务记录
        const task = await index_1.prisma.generationTask.create({
            data: {
                userId,
                type: 'VIDEO',
                modelId: 'vidu-upscale', // 虚拟模型ID
                prompt: `智能超清: ${upscale_resolution}`,
                status: 'PENDING',
                progress: 0,
                metadata: {
                    video_url,
                    video_creation_id,
                    upscale_resolution,
                    apiKey,
                    apiUrl,
                },
            },
        });
        // 异步处理（不等待）
        processUpscaleTask(task.id, {
            video_url,
            video_creation_id,
            upscale_resolution,
            apiKey,
            apiUrl,
        }).catch(error => {
            console.error(`[UpscaleVideo] 任务处理失败: ${task.id}`, error);
        });
        res.json({
            success: true,
            taskId: task.id,
        });
    }
    catch (error) {
        throw new errorHandler_1.AppError(error.message || '创建超清任务失败', error.status || 500);
    }
});
/**
 * 广告成片
 */
exports.createCommercial = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { images, prompt, duration, ratio, language, apiKey, apiUrl } = req.body;
    const userId = req.user?.id;
    console.log('[Commercial] 📥 收到原始请求体:', JSON.stringify(req.body, null, 2));
    console.log('[Commercial] 📥 解构后的参数:', {
        imageCount: images?.length,
        duration,
        ratio,
        language
    });
    if (!userId) {
        throw new errorHandler_1.AppError('未授权', 401);
    }
    // 权限检查
    const permissionResult = await user_level_service_1.userLevelService.checkPermission({
        userId,
        moduleType: 'commercial-video',
    });
    if (!permissionResult.allowed) {
        throw new errorHandler_1.AppError(permissionResult.reason || '您没有权限使用广告成片功能', 403);
    }
    if (!images || !Array.isArray(images) || images.length === 0) {
        throw new errorHandler_1.AppError('必须提供至少一张图片', 400);
    }
    if (images.length > 15) {
        throw new errorHandler_1.AppError('最多支持15张图片', 400);
    }
    // apiKey 为空时，使用自定义服务器地址（不需要 apiKey）
    if (!apiKey && !apiUrl) {
        throw new errorHandler_1.AppError('缺少 Vidu API Key 或自定义服务器地址', 400);
    }
    // 扣费逻辑
    let creditsCharged = 0;
    let usageRecordId;
    if (!permissionResult.isFree) {
        const { billingService } = await Promise.resolve().then(() => __importStar(require('../services/billing.service')));
        const billingParams = {
            userId,
            nodeType: 'ad_composition',
            operation: '广告成片',
            duration: duration || 30,
        };
        console.log('[Commercial] 扣费参数:', billingParams);
        try {
            const usageRecord = await billingService.chargeUser(billingParams);
            if (usageRecord) {
                creditsCharged = usageRecord.creditsCharged || 0;
                usageRecordId = usageRecord.id;
                console.log(`[Commercial] 已扣除积分: ${creditsCharged}`);
            }
        }
        catch (error) {
            console.error('[Commercial] 扣费失败:', error.message);
            throw new errorHandler_1.AppError(error.message?.includes('Insufficient') ? '积分不足，请充值后再试' : (error.message || '扣费失败'), error.message?.includes('Insufficient') ? 402 : 400);
        }
    }
    try {
        // 创建数据库任务记录
        const task = await index_1.prisma.generationTask.create({
            data: {
                userId,
                type: 'VIDEO',
                modelId: 'vidu-commercial', // 虚拟模型ID
                prompt: prompt || '广告成片',
                status: 'PENDING',
                progress: 0,
                metadata: {
                    images,
                    prompt,
                    duration: duration || 30,
                    ratio: ratio || '16:9',
                    language: language || 'zh',
                    apiKey,
                    apiUrl,
                },
            },
        });
        // 异步处理（不等待）
        console.log('[Commercial] 📤 准备调用 processCommercialTask, ratio:', ratio);
        processCommercialTask(task.id, {
            images,
            prompt,
            duration,
            ratio,
            language,
            apiKey,
            apiUrl,
            usageRecordId,
            creditsCharged,
        }).catch(error => {
            console.error(`[Commercial] 任务处理失败: ${task.id}`, error);
        });
        res.json({
            success: true,
            taskId: task.id,
            creditsCharged,
            isFreeUsage: permissionResult.isFree || false,
        });
    }
    catch (error) {
        throw new errorHandler_1.AppError(error.message || '创建广告成片任务失败', error.status || 500);
    }
});
/**
 * 异步处理广告成片任务
 */
async function processCommercialTask(taskId, options) {
    console.log(`[Commercial] 🚀 开始处理广告成片任务: ${taskId}`);
    try {
        // 更新为处理中
        await index_1.prisma.generationTask.update({
            where: { id: taskId },
            data: { status: 'PROCESSING', progress: 10 },
        });
        console.log(`[Commercial] ✅ 任务状态已更新为 PROCESSING: ${taskId}`);
        // 调用 Vidu 广告成片 API（会自动轮询直到完成）
        console.log(`[Commercial] 📡 开始调用 Vidu API...`);
        const result = await viduService.createCommercialVideo(options);
        const videoUrl = result.status;
        console.log(`[Commercial] ✅ Vidu API 返回成功, videoUrl: ${videoUrl?.substring(0, 100)}...`);
        // 更新为成功
        await index_1.prisma.generationTask.update({
            where: { id: taskId },
            data: {
                status: 'SUCCESS',
                progress: 100,
                resultUrl: videoUrl,
                completedAt: new Date(),
            },
        });
        console.log(`[Commercial] ✅ 任务完成: ${taskId}`);
    }
    catch (error) {
        console.error(`[Commercial] ❌ 任务失败: ${taskId}`, error.message);
        // 更新为失败
        await index_1.prisma.generationTask.update({
            where: { id: taskId },
            data: {
                status: 'FAILURE',
                errorMessage: error.message || '广告成片失败',
                completedAt: new Date(),
            },
        });
        // 退还积分
        if (options.usageRecordId && options.usageRecordId !== 'no-record' && options.creditsCharged && options.creditsCharged > 0) {
            try {
                const { billingService } = await Promise.resolve().then(() => __importStar(require('../services/billing.service')));
                await billingService.refundCredits(options.usageRecordId, '广告成片失败退还');
                console.log(`[Commercial] ✅ 已退还积分: ${options.creditsCharged}`);
            }
            catch (refundError) {
                console.error(`[Commercial] ❌ 退还积分失败:`, refundError.message);
            }
        }
        else if (options.creditsCharged && options.creditsCharged > 0) {
            // usageRecordId 无效但已扣费，需要直接退还积分
            try {
                const task = await index_1.prisma.generationTask.findUnique({
                    where: { id: taskId },
                    select: { userId: true }
                });
                if (task) {
                    await index_1.prisma.user.update({
                        where: { id: task.userId },
                        data: { credits: { increment: options.creditsCharged } }
                    });
                    console.log(`[Commercial] ✅ 直接退还积分: ${options.creditsCharged}`);
                }
            }
            catch (refundError) {
                console.error(`[Commercial] ❌ 直接退还积分失败:`, refundError.message);
            }
        }
    }
}
/**
 * 异步处理超清任务
 */
async function processUpscaleTask(taskId, options) {
    try {
        // 更新为处理中
        await index_1.prisma.generationTask.update({
            where: { id: taskId },
            data: { status: 'PROCESSING', progress: 10 },
        });
        // 调用 Vidu 超清 API
        const result = await viduService.upscaleVideo(options);
        const videoUrl = result.status;
        // 更新为成功
        await index_1.prisma.generationTask.update({
            where: { id: taskId },
            data: {
                status: 'SUCCESS',
                progress: 100,
                resultUrl: videoUrl,
                completedAt: new Date(),
            },
        });
    }
    catch (error) {
        // 更新为失败
        await index_1.prisma.generationTask.update({
            where: { id: taskId },
            data: {
                status: 'FAILURE',
                errorMessage: error.message || '智能超清失败',
                completedAt: new Date(),
            },
        });
    }
}
/**
 * 获取支持图片编辑的模型列表
 */
exports.getImageEditingModels = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const models = await index_1.prisma.aIModel.findMany({
        where: {
            type: 'IMAGE_GENERATION',
            isActive: true,
        },
        select: {
            id: true,
            name: true,
            provider: true,
            modelId: true,
            config: true,
        },
    });
    // 过滤出支持图片编辑的模型
    const editingModels = models.filter((m) => {
        const config = m.config;
        return config?.supportsImageEditing === true;
    });
    res.json({
        success: true,
        data: editingModels,
    });
});
// 支持的宽高比
const SUPPORTED_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'];
// 计算最接近的支持宽高比
function calculateAspectRatio(width, height) {
    const ratio = width / height;
    let closestRatio = '1:1';
    let minDiff = Infinity;
    for (const supported of SUPPORTED_RATIOS) {
        const [w, h] = supported.split(':').map(Number);
        const supportedRatio = w / h;
        const diff = Math.abs(ratio - supportedRatio);
        if (diff < minDiff) {
            minDiff = diff;
            closestRatio = supported;
        }
    }
    return closestRatio;
}
/**
 * 图片编辑（固定使用 Gemini 3.0 Pro Image，4K 分辨率）
 */
exports.imageEdit = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { prompt, mainImage, referenceImages, points, sourceImageDimensions } = req.body;
    const userId = req.user.id;
    if (!mainImage) {
        throw new errorHandler_1.AppError('主图是必需的', 400);
    }
    if (!prompt) {
        throw new errorHandler_1.AppError('编辑指令是必需的', 400);
    }
    // 计费逻辑
    const { billingService } = await Promise.resolve().then(() => __importStar(require('../services/billing.service')));
    // 检查权限
    const permissionResult = await user_level_service_1.userLevelService.checkPermission({
        userId,
        nodeType: 'image_editing',
    });
    if (!permissionResult.allowed) {
        throw new errorHandler_1.AppError(permissionResult.reason || '您没有权限使用图片编辑功能', 403);
    }
    // 扣费
    let creditsCharged = 0;
    let usageRecordId;
    if (!permissionResult.isFree) {
        try {
            const usageRecord = await billingService.chargeUser({
                userId,
                nodeType: 'image_editing',
                operation: '图片编辑',
                quantity: 1,
            });
            if (usageRecord) {
                creditsCharged = usageRecord.creditsCharged || 0;
                usageRecordId = usageRecord.id;
                console.log(`💰 [ImageEdit] 已扣费 ${creditsCharged} 积分`);
            }
        }
        catch (error) {
            console.error('[ImageEdit] 扣费失败:', error);
            throw new errorHandler_1.AppError('扣费失败: ' + error.message, 400);
        }
    }
    else {
        console.log('🎁 [ImageEdit] 免费使用');
    }
    // 计算原图的宽高比
    let aspectRatio;
    if (sourceImageDimensions?.width && sourceImageDimensions?.height) {
        aspectRatio = calculateAspectRatio(sourceImageDimensions.width, sourceImageDimensions.height);
        console.log(`📐 [ImageEdit] 原图尺寸: ${sourceImageDimensions.width}x${sourceImageDimensions.height}, 计算比例: ${aspectRatio}`);
    }
    // 构建用户提示词（包含标记点位置信息）
    let userPrompt = prompt;
    if (points && points.length > 0) {
        const pointDescriptions = points.map((p) => {
            const position = getChinesePositionDescription(p.x, p.y);
            const objectName = p.name ? `「${p.name}」` : '';
            return `- 位置${p.id}${objectName}：在图片的${position}`;
        });
        userPrompt += `\n\n标记点位置：\n${pointDescriptions.join('\n')}`;
    }
    // 准备所有参考图（主图 + 额外参考图）
    const allImages = [mainImage, ...(referenceImages || [])];
    let imageUrl;
    try {
        // 第一阶段：使用 Gemini 2.5 Flash 理解图片和用户意图，生成优化提示词
        console.log('🧠 [ImageEdit] 第一阶段：使用 Gemini 2.5 Flash 优化提示词...');
        // 使用简单的提示词，让 Flash 生成优化后的英文提示词
        const promptForFlash = `Look at this image and the user's edit request below. Generate a detailed English prompt for an AI image editing model.

User's request: ${userPrompt}

Requirements:
- Output ONLY the English prompt, no explanations
- Describe what to change and what to keep
- Do NOT add any text, numbers or markers to the image
- Keep the same style, lighting and aspect ratio`;
        const optimizedPrompt = await geminiService.generateText({
            prompt: promptForFlash,
            modelId: 'gemini-2.5-flash',
            imageUrls: [mainImage], // 只传主图
        });
        console.log('✅ [ImageEdit] 优化后的提示词 (完整):');
        console.log(optimizedPrompt);
        // 添加保持原图比例和不添加标记的指令
        const finalPrompt = `${optimizedPrompt}\n\nIMPORTANT: Keep the exact same aspect ratio as the original image. Do NOT add any text, numbers, labels, or markers to the image.`;
        // 第二阶段：使用优化后的提示词 + 图片调用 Gemini 3.0 Pro Image
        console.log('🎨 [ImageEdit] 第二阶段：调用 Gemini 3.0 Pro Image (4K)...');
        imageUrl = await geminiService.generateImage({
            prompt: finalPrompt,
            modelId: 'gemini-3-pro-image-preview',
            aspectRatio: aspectRatio,
            imageSize: '4K', // 固定使用 4K 分辨率
            referenceImages: allImages,
        });
        res.json({
            success: true,
            data: {
                imageUrl,
                model: 'Gemini 3.0 Pro Image',
                creditsCharged,
                isFree: permissionResult.isFree,
            },
        });
    }
    catch (error) {
        console.error('Image editing error:', error);
        // 失败时退款
        if (usageRecordId && creditsCharged > 0) {
            try {
                await billingService.refundCredits(usageRecordId, '图片编辑失败，系统自动退款');
                console.log(`💸 [ImageEdit] 已退款 ${creditsCharged} 积分`);
            }
            catch (refundError) {
                console.error('[ImageEdit] 退款失败:', refundError);
            }
        }
        throw new errorHandler_1.AppError(`图片编辑失败: ${error.message}`, 500);
    }
});
/**
 * 识别图片标记点的物体（使用 Gemini 2.5 Flash，通过代理服务）
 */
exports.identifyImagePoints = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { image, points } = req.body;
    if (!image) {
        throw new errorHandler_1.AppError('图片是必需的', 400);
    }
    if (!points || points.length === 0) {
        throw new errorHandler_1.AppError('标记点是必需的', 400);
    }
    const pointDescriptions = points.map((p) => {
        const xPercent = Math.round(p.x * 100);
        const yPercent = Math.round(p.y * 100);
        return `Point ${p.id}: located at ${xPercent}% from left, ${yPercent}% from top`;
    }).join('\n');
    const prompt = `请查看这张图片，识别每个标记点位置的物体或元素。请用简短的中文命名（2-6个字）。

${pointDescriptions}

请用以下 JSON 格式回复：
{
  "points": [
    {"id": 1, "name": "物体名称"},
    {"id": 2, "name": "物体名称"}
  ]
}

只返回 JSON，不要其他文字。`;
    try {
        // 通过代理服务调用 Gemini 2.5 Flash
        const text = await geminiService.generateText({
            prompt,
            modelId: 'gemini-2.5-flash',
            imageUrls: [image],
        });
        // 解析 JSON
        let jsonStr = text.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        }
        const data = JSON.parse(jsonStr);
        res.json({
            success: true,
            data: data,
        });
    }
    catch (error) {
        console.error('Identify points error:', error);
        // 返回空结果而不是错误，让前端可以继续使用
        res.json({
            success: true,
            data: { points: [] },
        });
    }
});
/**
 * 获取中文位置描述
 */
function getChinesePositionDescription(x, y) {
    let horizontal = '';
    let vertical = '';
    if (x < 0.33)
        horizontal = '左侧';
    else if (x < 0.66)
        horizontal = '中间';
    else
        horizontal = '右侧';
    if (y < 0.33)
        vertical = '上方';
    else if (y < 0.66)
        vertical = '中部';
    else
        vertical = '下方';
    if (horizontal === '中间' && vertical === '中部')
        return '正中央';
    return `${vertical}${horizontal}`;
}
//# sourceMappingURL=ai.controller.js.map