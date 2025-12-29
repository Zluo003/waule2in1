"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageService = void 0;
const settings_service_1 = require("./settings.service");
const oss_1 = require("../utils/oss");
const index_1 = require("../index");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../utils/logger");
const STORAGE_MODE_CACHE_KEY = 'storage:mode';
class StorageService {
    constructor() {
        this.uploadDir = path_1.default.join(process.cwd(), 'uploads');
    }
    /**
     * 获取当前存储模式（带 Redis 缓存）
     */
    async getStorageMode() {
        try {
            // 1. 尝试从 Redis 读取
            const cached = await index_1.redis.get(STORAGE_MODE_CACHE_KEY);
            if (cached) {
                return cached;
            }
            // 2. 从数据库读取
            const mode = await settings_service_1.settingsService.get('storage_mode');
            const result = (mode === 'local' ? 'local' : 'oss');
            // 3. 写入 Redis 缓存
            await index_1.redis.set(STORAGE_MODE_CACHE_KEY, result);
            return result;
        }
        catch (error) {
            logger_1.logger.error('获取存储模式失败，使用默认 OSS 模式', error);
            return 'oss';
        }
    }
    /**
     * 获取本地存储基础 URL
     */
    async getLocalBaseUrl() {
        const baseUrl = await settings_service_1.settingsService.get('storage_base_url');
        return baseUrl || process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
    }
    /**
     * 清除存储模式缓存
     */
    async clearStorageModeCache() {
        await index_1.redis.del(STORAGE_MODE_CACHE_KEY);
    }
    /**
     * 上传 Buffer 到当前存储
     */
    async uploadBuffer(buffer, ext) {
        const mode = await this.getStorageMode();
        if (mode === 'local') {
            return this.uploadBufferToLocal(buffer, ext);
        }
        else {
            const url = await (0, oss_1.uploadBuffer)(buffer, ext);
            return (0, oss_1.toCdnUrl)(url);
        }
    }
    /**
     * 上传文件路径到当前存储
     */
    async uploadPath(filePath) {
        const mode = await this.getStorageMode();
        if (mode === 'local') {
            const ext = path_1.default.extname(filePath);
            const buffer = fs_1.default.readFileSync(filePath);
            return this.uploadBufferToLocal(buffer, ext);
        }
        else {
            const url = await (0, oss_1.uploadPath)(filePath);
            return (0, oss_1.toCdnUrl)(url);
        }
    }
    /**
     * 上传 Buffer 到本地存储
     */
    async uploadBufferToLocal(buffer, ext) {
        // 确保上传目录存在
        if (!fs_1.default.existsSync(this.uploadDir)) {
            fs_1.default.mkdirSync(this.uploadDir, { recursive: true });
        }
        // 生成唯一文件名
        const fileName = `${Date.now()}-${crypto_1.default.randomBytes(6).toString('hex')}${ext}`;
        const filePath = path_1.default.join(this.uploadDir, fileName);
        // 写入文件
        fs_1.default.writeFileSync(filePath, buffer);
        // 返回公网 URL
        const baseUrl = await this.getLocalBaseUrl();
        return `${baseUrl}/uploads/${fileName}`;
    }
    /**
     * 判断 URL 是否为 OSS URL
     */
    isOssUrl(url) {
        return url.includes('.aliyuncs.com/');
    }
    /**
     * 判断 URL 是否为本地 URL
     */
    isLocalUrl(url) {
        return url.includes('/uploads/');
    }
    /**
     * 确保 URL 已转存到当前存储（根据存储模式）
     * 类似 ensureAliyunOssUrl，但会根据存储模式选择存储位置
     */
    async ensureStoredUrl(url) {
        if (!url)
            return url;
        const mode = await this.getStorageMode();
        // 如果是 OSS 模式，使用原有的 ensureAliyunOssUrl 逻辑
        if (mode === 'oss') {
            const ossUrl = await (0, oss_1.ensureAliyunOssUrl)(url);
            return ossUrl ? (0, oss_1.toCdnUrl)(ossUrl) : ossUrl;
        }
        // 本地存储模式
        const trimmed = url.trim().replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, "");
        // 已经是本地 URL，直接返回
        if (this.isLocalUrl(trimmed)) {
            logger_1.logger.info(`[Storage] 已是本地URL，跳过转存: ${trimmed.substring(0, 80)}...`);
            return trimmed;
        }
        // 如果是 OSS URL，也直接返回（本地模式下不需要转存）
        if (this.isOssUrl(trimmed)) {
            logger_1.logger.info(`[Storage] OSS URL在本地模式下直接返回: ${trimmed.substring(0, 80)}...`);
            return trimmed;
        }
        // 纯路径：映射到本地并上传
        if (!trimmed.startsWith('http')) {
            const localRel = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
            const fullPath = path_1.default.join(process.cwd(), localRel);
            return await this.uploadPath(fullPath);
        }
        // HTTP 链接：下载并保存到本地
        try {
            const parsed = new URL(trimmed);
            const baseUrl = await this.getLocalBaseUrl();
            let publicHost = '';
            try {
                if (/^https?:\/\//.test(baseUrl)) {
                    publicHost = new URL(baseUrl).hostname;
                }
            }
            catch { }
            const isInternal = parsed.hostname === 'localhost' ||
                parsed.hostname === '127.0.0.1' ||
                (publicHost && parsed.hostname === publicHost);
            if (!isInternal) {
                // 外部链接：下载并保存到本地
                const ext = path_1.default.extname(parsed.pathname) || '';
                const isVideo = /\.(mp4|mov|mkv|webm|avi)$/i.test(ext);
                logger_1.logger.info(`[Storage] 开始下载外部资源到本地: ${trimmed.substring(0, 80)}... (isVideo=${isVideo})`);
                const startTime = Date.now();
                const response = await axios_1.default.get(trimmed, {
                    responseType: 'arraybuffer',
                    timeout: isVideo ? 180000 : 60000,
                });
                const buffer = Buffer.from(response.data);
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                logger_1.logger.info(`[Storage] 资源下载完成，耗时 ${duration}s`);
                logger_1.logger.info(`[Storage] 开始保存到本地...`);
                const localUrl = await this.uploadBufferToLocal(buffer, ext);
                logger_1.logger.info(`[Storage] 保存成功: ${localUrl}`);
                return localUrl;
            }
            else {
                // 内部链接，直接返回
                return trimmed;
            }
        }
        catch (error) {
            logger_1.logger.error(`[Storage] 处理URL失败: ${trimmed}`, error.message);
            return trimmed; // 失败时返回原始URL
        }
    }
}
exports.storageService = new StorageService();
//# sourceMappingURL=storage.service.js.map