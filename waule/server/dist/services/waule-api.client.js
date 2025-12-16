"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WauleApiClient = void 0;
exports.resolveWauleApiConfig = resolveWauleApiConfig;
exports.getWauleApiClient = getWauleApiClient;
const axios_1 = __importDefault(require("axios"));
function normalizeBaseUrl(url) {
    return url.replace(/\/+$/, '');
}
function getConfigFromModel(model) {
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
     * Sora 专用：waule-api 的 /v1/sora/chat/completions 不使用网关 API_SECRET，而是透传 Authorization 给 sora2api
     */
    async soraChatCompletions(params, soraApiKey) {
        const client = axios_1.default.create({
            baseURL: this.cfg.baseUrl,
            timeout: 600000,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${soraApiKey}`,
            },
        });
        const resp = await client.post('/v1/sora/chat/completions', params);
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
//# sourceMappingURL=waule-api.client.js.map