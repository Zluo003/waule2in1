"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMidjourneyService = getMidjourneyService;
const midjourney_config_1 = require("../config/midjourney.config");
const waule_api_client_1 = require("./waule-api.client");
const storage_service_1 = require("./storage.service");
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Midjourney服务（仅 waule-api 模式）
 */
class MidjourneyService {
    constructor() {
        this.wauleApiClient = null;
        this.wauleApiClient = (0, waule_api_client_1.getGlobalWauleApiClient)();
        if (this.wauleApiClient) {
            console.log('🎨 [Midjourney] 使用 waule-api 网关模式');
        }
        else {
            console.warn('⚠️ [Midjourney] WAULEAPI_URL 未配置，Midjourney 功能不可用');
        }
    }
    /**
     * 处理Discord CDN图片URL，下载到本地服务器
     */
    async processImageUrl(imageUrl) {
        if (!imageUrl)
            return imageUrl;
        // 检测是否是Discord CDN链接
        const isDiscordCdn = /cdn\.discordapp\.com|media\.discordapp\.net/i.test(imageUrl);
        if (!isDiscordCdn) {
            return imageUrl; // 不是Discord CDN，直接返回
        }
        try {
            logger_1.default.info(`[Midjourney] 检测到Discord CDN链接，开始下载到本地: ${imageUrl.substring(0, 80)}...`);
            // 使用storageService的ensureStoredUrl方法处理URL
            // 这个方法会根据存储模式自动选择保存到本地或OSS
            const localUrl = await storage_service_1.storageService.ensureStoredUrl(imageUrl);
            logger_1.default.info(`[Midjourney] 图片已转存: ${localUrl?.substring(0, 80)}...`);
            return localUrl;
        }
        catch (error) {
            logger_1.default.error(`[Midjourney] 图片转存失败: ${error.message}`);
            // 转存失败，返回原始URL
            return imageUrl;
        }
    }
    /**
     * 提交 Imagine 任务（文生图）
     */
    async imagine(params) {
        if (!this.wauleApiClient) {
            throw new Error('Midjourney 服务未配置，请设置 WAULEAPI_URL 环境变量');
        }
        try {
            const result = await this.wauleApiClient.midjourneyImagine({
                prompt: params.prompt,
                userId: params.userId,
            });
            return {
                code: result.success ? 1 : -1,
                description: result.message || (result.success ? '任务已提交' : '任务提交失败'),
                result: result.taskId,
                properties: {
                    prompt: params.prompt,
                },
            };
        }
        catch (error) {
            console.error('❌ [Midjourney] Imagine 提交失败:', error.message);
            return {
                code: -1,
                description: error.message,
            };
        }
    }
    /**
     * 查询任务状态
     */
    async fetch(taskId) {
        if (!this.wauleApiClient) {
            throw new Error('Midjourney 服务未配置');
        }
        try {
            const result = await this.wauleApiClient.midjourneyGetTask(taskId);
            console.log(`🔍 [Midjourney] 查询任务 ${taskId}, 状态: ${result.status}`);
            let status = midjourney_config_1.MIDJOURNEY_TASK_STATUS.SUBMITTED;
            if (result.status === 'SUCCESS' || result.status === 'COMPLETED') {
                status = midjourney_config_1.MIDJOURNEY_TASK_STATUS.SUCCESS;
            }
            else if (result.status === 'FAILED' || result.status === 'FAILURE') {
                status = midjourney_config_1.MIDJOURNEY_TASK_STATUS.FAILURE;
            }
            else if (result.status === 'IN_PROGRESS') {
                status = midjourney_config_1.MIDJOURNEY_TASK_STATUS.IN_PROGRESS;
            }
            else if (result.status === 'SUBMITTED') {
                status = midjourney_config_1.MIDJOURNEY_TASK_STATUS.SUBMITTED;
            }
            // 处理Discord CDN图片URL
            const processedImageUrl = await this.processImageUrl(result.imageUrl);
            return {
                id: result.taskId || taskId,
                action: 'IMAGINE',
                status,
                progress: result.progress !== undefined ? String(result.progress) : undefined,
                imageUrl: processedImageUrl,
                failReason: result.failReason,
                properties: {
                    messageId: result.messageId,
                    messageHash: result.messageHash,
                },
                buttons: result.buttons?.map(b => ({
                    customId: b.customId,
                    emoji: b.emoji || '',
                    label: b.label || '',
                    type: 2,
                    style: 2,
                })),
            };
        }
        catch (error) {
            console.error('❌ [Midjourney] 查询任务失败:', error.message);
            throw error;
        }
    }
    /**
     * 轮询任务直到完成
     */
    async pollTask(taskId) {
        if (!this.wauleApiClient) {
            throw new Error('Midjourney 服务未配置');
        }
        try {
            const result = await this.wauleApiClient.midjourneyWaitTask(taskId, 300000);
            console.log(`🔍 [Midjourney] 任务 ${taskId}, 状态: ${result.status}`);
            if (result.status === 'SUCCESS' || result.status === 'COMPLETED') {
                console.log('✅ [Midjourney] 任务完成！');
                // 处理Discord CDN图片URL
                const processedImageUrl = await this.processImageUrl(result.imageUrl);
                return {
                    id: result.taskId,
                    action: 'IMAGINE',
                    status: midjourney_config_1.MIDJOURNEY_TASK_STATUS.SUCCESS,
                    imageUrl: processedImageUrl,
                    properties: {
                        messageId: result.messageId,
                        messageHash: result.messageHash,
                    },
                    buttons: result.buttons?.map(b => ({
                        customId: b.customId,
                        emoji: b.emoji || '',
                        label: b.label || '',
                        type: 2,
                        style: 2,
                    })),
                };
            }
            if (result.status === 'FAILED' || result.status === 'FAILURE') {
                throw new Error(`任务失败: ${result.failReason || '未知错误'}`);
            }
            throw new Error('任务超时或状态未知');
        }
        catch (error) {
            console.error('❌ [Midjourney] 轮询任务失败:', error.message);
            throw error;
        }
    }
    /**
     * 执行动作（Upscale、Variation 等）
     */
    async action(params) {
        if (!this.wauleApiClient) {
            throw new Error('Midjourney 服务未配置');
        }
        try {
            const result = await this.wauleApiClient.midjourneyAction({
                messageId: params.messageId || params.taskId,
                customId: params.customId,
                userId: params.userId,
            });
            return {
                code: result.success ? 1 : -1,
                description: result.message || (result.success ? '操作已提交' : '操作提交失败'),
                result: result.taskId,
            };
        }
        catch (error) {
            console.error('❌ [Midjourney] Action 提交失败:', error.message);
            return {
                code: -1,
                description: error.message,
            };
        }
    }
    /**
     * Blend（图片混合）- 暂不支持
     */
    async blend(_base64Array, _notifyHook) {
        throw new Error('Blend 功能暂不支持，请使用 waule-api 服务');
    }
    /**
     * Describe（图生文）- 暂不支持
     */
    async describe(_base64, _notifyHook) {
        throw new Error('Describe 功能暂不支持，请使用 waule-api 服务');
    }
    /**
     * 上传参考图
     */
    async uploadReferenceImage(_imageBuffer, _imageName) {
        throw new Error('上传参考图功能暂不支持，请使用 waule-api 服务');
    }
}
// 懒加载模式：确保 dotenv.config() 已执行后再初始化
let _instance = null;
function getMidjourneyService() {
    if (!_instance) {
        _instance = new MidjourneyService();
    }
    return _instance;
}
exports.default = { getMidjourneyService };
//# sourceMappingURL=midjourney.service.js.map