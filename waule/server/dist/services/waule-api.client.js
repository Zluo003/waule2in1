"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WauleApiClient = void 0;
exports.isWauleApiUrl = isWauleApiUrl;
exports.resolveWauleApiConfig = resolveWauleApiConfig;
exports.getWauleApiClient = getWauleApiClient;
exports.getGlobalWauleApiClient = getGlobalWauleApiClient;
const axios_1 = __importDefault(require("axios"));
function normalizeBaseUrl(url) {
    return url.replace(/\/+$/, '');
}
/**
 * 判断是否是 waule-api 地址
 * 规则：apiUrl 非空且不包含已知的直连服务商地址
 * 如果是直连地址（如 Google、Doubao、Aliyun 等），返回 false
 * 否则认为是 waule-api 网关地址
 */
function isWauleApiUrl(url) {
    if (!url)
        return false;
    // 已知的直连服务商地址（不走 waule-api）
    const directProviderPatterns = [
        'googleapis.com',
        'volces.com', // Doubao
        'dashscope.aliyuncs.com', // Aliyun
        'api.vidu.cn', // Vidu
        'sora.chatgpt.com', // Sora 直连
        'api.openai.com',
        'api.anthropic.com',
    ];
    // 如果包含直连服务商地址，不走 waule-api
    for (const pattern of directProviderPatterns) {
        if (url.includes(pattern))
            return false;
    }
    // 其他地址都认为是 waule-api（如 localhost、自定义域名等）
    return true;
}
function getConfigFromModel(model) {
    // 优先从 model.apiUrl 读取（admin 页面配置的接口地址）
    if (model && typeof model.apiUrl === 'string' && model.apiUrl && isWauleApiUrl(model.apiUrl)) {
        // 提取 base URL（去掉路径部分）
        try {
            const url = new URL(model.apiUrl);
            return { baseUrl: `${url.protocol}//${url.host}` };
        }
        catch {
            // 如果解析失败，直接使用
            return { baseUrl: model.apiUrl };
        }
    }
    // 兼容旧的 config.wauleApi 配置
    const cfg = (model && typeof model.config === 'object' && model.config) ? model.config : {};
    const wauleApi = cfg.wauleApi;
    if (!wauleApi || typeof wauleApi !== 'object')
        return {};
    const baseUrl = typeof wauleApi.url === 'string' ? wauleApi.url : undefined;
    const apiSecret = typeof wauleApi.secret === 'string' ? wauleApi.secret : undefined;
    return {
        ...(baseUrl ? { baseUrl } : {}),
        ...(apiSecret ? { apiSecret } : {}),
    };
}
function resolveWauleApiConfig(model) {
    const fromModel = getConfigFromModel(model);
    const baseUrl = fromModel.baseUrl || process.env.WAULEAPI_URL;
    if (!baseUrl)
        return null;
    const apiSecret = fromModel.apiSecret || process.env.WAULEAPI_SECRET || undefined;
    return {
        baseUrl: normalizeBaseUrl(baseUrl),
        apiSecret,
    };
}
class WauleApiClient {
    constructor(cfg) {
        this.cfg = { ...cfg, baseUrl: normalizeBaseUrl(cfg.baseUrl) };
    }
    createClient(withAuth) {
        return axios_1.default.create({
            baseURL: this.cfg.baseUrl,
            timeout: 600000,
            headers: {
                'Content-Type': 'application/json',
                ...(withAuth && this.cfg.apiSecret ? { Authorization: `Bearer ${this.cfg.apiSecret}` } : {}),
            },
        });
    }
    async generateImage(params) {
        const client = this.createClient(true);
        const resp = await client.post('/v1/images/generations', params);
        return resp.data;
    }
    async generateVideo(params) {
        const client = this.createClient(true);
        const resp = await client.post('/v1/videos/generations', params);
        return resp.data;
    }
    async chatCompletions(params) {
        const client = this.createClient(true);
        const resp = await client.post('/v1/chat/completions', params);
        return resp.data;
    }
    /**
     * Sora 专用：waule-api 的 /v1/sora/chat/completions
     * waule-api 服务端已配置 SORA_API_KEY，无需客户端传递
     */
    async soraChatCompletions(params) {
        const client = this.createClient(true);
        const resp = await client.post('/v1/sora/chat/completions', params);
        return resp.data;
    }
    /**
     * Sora API：创建角色
     * POST /v1/sora/characters (ai-gateway)
     */
    async futureSoraCreateCharacter(params) {
        const client = this.createClient(true);
        const resp = await client.post('/v1/sora/characters', params);
        return resp.data;
    }
    /**
     * Future Sora API：创建视频
     * POST /future-sora/v1/videos
     */
    async futureSoraCreateVideo(params) {
        const client = this.createClient(true);
        const resp = await client.post('/future-sora/v1/videos', params);
        return resp.data;
    }
    /**
     * Future Sora API：查询视频
     * GET /future-sora/v1/videos/:taskId
     */
    async futureSoraGetVideo(taskId) {
        const client = this.createClient(true);
        const resp = await client.get(`/future-sora/v1/videos/${taskId}`);
        return resp.data;
    }
    // ============================================
    // Midjourney 接口
    // ============================================
    /**
     * Midjourney Imagine（文生图）
     */
    async midjourneyImagine(params) {
        const client = this.createClient(true);
        const resp = await client.post('/v1/midjourney/imagine', params);
        return resp.data;
    }
    /**
     * Midjourney Action（按钮操作：Upscale/Variation 等）
     */
    async midjourneyAction(params) {
        const client = this.createClient(true);
        const resp = await client.post('/v1/midjourney/action', params);
        return resp.data;
    }
    /**
     * Midjourney 查询任务状态
     */
    async midjourneyGetTask(taskId) {
        const client = this.createClient(true);
        const resp = await client.get(`/v1/midjourney/task/${taskId}`);
        return resp.data;
    }
    /**
     * Midjourney 等待任务完成（长轮询）
     */
    async midjourneyWaitTask(taskId, timeout) {
        const client = this.createClient(true);
        const resp = await client.post(`/v1/midjourney/task/${taskId}/wait`, { timeout });
        return resp.data;
    }
    /**
     * Midjourney 上传参考图
     */
    async midjourneyUploadReference(params) {
        const client = this.createClient(true);
        const resp = await client.post('/v1/midjourney/upload-reference', params);
        return resp.data;
    }
    /**
     * 广告成片（Vidu ad-one-click）
     * POST /v1/videos/commercial
     */
    async commercialVideo(params) {
        const client = this.createClient(true);
        const resp = await client.post('/v1/videos/commercial', params);
        return resp.data;
    }
}
exports.WauleApiClient = WauleApiClient;
function getWauleApiClient(model) {
    const cfg = resolveWauleApiConfig(model);
    if (!cfg)
        return null;
    return new WauleApiClient(cfg);
}
/**
 * 获取 waule-api 客户端（不依赖 model，仅读取环境变量）
 */
function getGlobalWauleApiClient() {
    const baseUrl = process.env.WAULEAPI_URL;
    if (!baseUrl)
        return null;
    const apiSecret = process.env.WAULEAPI_SECRET || undefined;
    return new WauleApiClient({ baseUrl, apiSecret });
}
//# sourceMappingURL=waule-api.client.js.map