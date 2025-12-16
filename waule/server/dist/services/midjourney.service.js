"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const socks_proxy_agent_1 = require("socks-proxy-agent");
const oss_1 = require("../utils/oss");
const midjourney_config_1 = require("../config/midjourney.config");
const discord_reverse_service_1 = require("./discord-reverse.service");
const ioredis_1 = __importDefault(require("ioredis"));
// Redis 队列名称
const MJ_TASK_QUEUE = 'mj:task:queue';
const MJ_RESULT_PREFIX = 'mj:result:';
// 懒加载 Redis 客户端（避免初始化顺序问题）
let _redis = null;
const getRedis = () => {
    if (!_redis) {
        _redis = new ioredis_1.default(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
    }
    return _redis;
};
// Midjourney 图片本地存储目录
const MJ_UPLOAD_DIR = path_1.default.join(process.cwd(), 'uploads', 'midjourney');
// 确保目录存在
if (!fs_1.default.existsSync(MJ_UPLOAD_DIR)) {
    fs_1.default.mkdirSync(MJ_UPLOAD_DIR, { recursive: true });
}
/**
 * Midjourney服务
 * 支持两种模式：
 * 1. proxy模式：通过Midjourney Proxy服务
 * 2. discord模式：直接通过Discord API逆向
 */
class MidjourneyService {
    constructor() {
        this.proxyClient = null;
        this.discordService = null;
        this.discordInitPromise = null;
        this.mode = midjourney_config_1.midjourneyConfig.mode;
        this.enableDiscord = midjourney_config_1.midjourneyConfig.enableDiscord;
        console.log(`🎨 [Midjourney] 使用模式: ${this.mode}, Discord启用: ${this.enableDiscord}`);
        if (this.mode === 'proxy') {
            this.initProxyClient();
        }
        else if (this.mode === 'discord') {
            if (this.enableDiscord) {
                // 只有启用 Discord 的实例才初始化连接
                this.discordInitPromise = this.initDiscordService().catch((error) => {
                    console.error('❌ [Midjourney] Discord服务初始化失败:', error);
                    throw error;
                });
                // 启动队列消费者
                this.startQueueConsumer();
            }
            else {
                console.log('📤 [Midjourney] Discord 已禁用，任务将通过 Redis 队列转发');
            }
        }
    }
    /**
     * 检查是否为队列模式（Discord 禁用时使用队列转发）
     */
    isQueueMode() {
        return this.mode === 'discord' && !this.enableDiscord;
    }
    /**
     * 下载远程图片到服务器本地，返回本地 URL
     */
    async downloadToLocal(url) {
        try {
            console.log('📥 [Midjourney] 开始下载图片到服务器:', url.substring(0, 80) + '...');
            const startDownload = Date.now();
            const agent = this.getProxyAgent();
            const response = await axios_1.default.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000,
                ...(agent ? { httpsAgent: agent } : {})
            });
            const buffer = Buffer.from(response.data);
            console.log(`📥 [Midjourney] 下载完成，大小: ${(buffer.length / 1024 / 1024).toFixed(2)}MB，耗时: ${Date.now() - startDownload}ms`);
            // 确定文件扩展名
            const ct = response.headers['content-type'] || '';
            let ext = '.jpg';
            if (ct.includes('png'))
                ext = '.png';
            else if (ct.includes('webp'))
                ext = '.webp';
            else if (ct.includes('jpeg') || ct.includes('jpg'))
                ext = '.jpg';
            else {
                try {
                    const u = new URL(url);
                    const p = u.pathname.toLowerCase();
                    if (p.endsWith('.png'))
                        ext = '.png';
                    else if (p.endsWith('.webp'))
                        ext = '.webp';
                    else if (p.endsWith('.jpg') || p.endsWith('.jpeg'))
                        ext = '.jpg';
                }
                catch { }
            }
            // 保存到本地
            const filename = `mj-${Date.now()}-${crypto_1.default.randomBytes(4).toString('hex')}${ext}`;
            const localPath = path_1.default.join(MJ_UPLOAD_DIR, filename);
            fs_1.default.writeFileSync(localPath, buffer);
            const localUrl = `/uploads/midjourney/${filename}`;
            console.log('💾 [Midjourney] 已保存到服务器:', localUrl);
            return { localPath, localUrl, buffer, ext };
        }
        catch (e) {
            console.error('❌ [Midjourney] 下载图片失败:', e.message);
            return null;
        }
    }
    /**
     * 直接从远程 URL 下载图片并上传到 OSS
     * 使用传输加速，约 3 秒完成
     */
    async downloadAndUploadToOSS(url) {
        try {
            const startTime = Date.now();
            // 下载图片（通过代理）
            console.log('📥 [Midjourney] 下载图片:', url.substring(0, 80) + '...');
            const agent = this.getProxyAgent();
            const response = await axios_1.default.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: { 'User-Agent': 'Mozilla/5.0' },
                ...(agent ? { httpsAgent: agent, httpAgent: agent } : {})
            });
            const buffer = Buffer.from(response.data);
            const downloadTime = Date.now() - startTime;
            console.log(`📥 [Midjourney] 下载完成，大小: ${(buffer.length / 1024 / 1024).toFixed(2)}MB，耗时: ${downloadTime}ms`);
            // 获取文件扩展名
            const contentType = response.headers['content-type'] || '';
            let ext = '.png';
            if (contentType.includes('jpeg') || contentType.includes('jpg'))
                ext = '.jpg';
            else if (contentType.includes('webp'))
                ext = '.webp';
            else if (contentType.includes('gif'))
                ext = '.gif';
            // 上传到 OSS
            const uploadStart = Date.now();
            const ossUrl = await (0, oss_1.uploadBuffer)(buffer, ext);
            const uploadTime = Date.now() - uploadStart;
            console.log(`📤 [Midjourney] OSS 上传完成，耗时: ${Math.round(uploadTime / 1000)}秒`);
            return ossUrl;
        }
        catch (e) {
            console.error('❌ [Midjourney] 下载或上传失败:', e.message);
            return null;
        }
    }
    /**
     * 下载远程图片并保存到本地，返回本地 URL（用于 Proxy 模式）
     */
    async saveRemoteImageToLocal(url) {
        if (!url)
            return undefined;
        if (/aliyuncs\.com\//.test(url))
            return url;
        if (url.startsWith('/uploads/'))
            return url;
        const localResult = await this.downloadToLocal(url);
        if (localResult) {
            // 异步上传到 OSS（不阻塞）
            (0, oss_1.uploadBuffer)(localResult.buffer, localResult.ext).then(ossUrl => {
                if (ossUrl) {
                    // 上传成功后删除本地文件
                    try {
                        fs_1.default.unlinkSync(localResult.localPath);
                    }
                    catch { }
                }
            }).catch(() => { });
            return localResult.localUrl;
        }
        return url;
    }
    /**
     * 确保Discord服务已经初始化
     * 支持等待重试，用于服务器刚重启时 Discord 还在连接中的情况
     */
    async ensureDiscordReady(maxWaitMs = 15000) {
        const startTime = Date.now();
        const retryInterval = 500; // 每500ms检查一次
        while (Date.now() - startTime < maxWaitMs) {
            // 如果已有可用的 Discord 服务，直接返回
            if (this.discordService) {
                return;
            }
            // 尝试获取全局 Discord 服务（可能由重连机制创建）
            const globalService = (0, discord_reverse_service_1.getDiscordService)();
            if (globalService) {
                this.discordService = globalService;
                return;
            }
            // 等待初始化 Promise
            if (this.mode === 'discord' && this.discordInitPromise) {
                try {
                    await this.discordInitPromise;
                    return;
                }
                catch (e) {
                    // 初始化失败，尝试再次获取（可能已重连）
                    const retryService = (0, discord_reverse_service_1.getDiscordService)();
                    if (retryService) {
                        this.discordService = retryService;
                        return;
                    }
                }
            }
            // 等待一段时间后重试
            console.log(`⏳ [Midjourney] Discord服务未就绪，等待中... (${Math.round((Date.now() - startTime) / 1000)}s)`);
            await this.sleep(retryInterval);
        }
        // 超时后最后尝试一次
        const finalService = (0, discord_reverse_service_1.getDiscordService)();
        if (finalService) {
            this.discordService = finalService;
            return;
        }
        throw new Error('Discord服务未就绪，请稍后重试');
    }
    /**
     * 构造代理 Agent（HTTPS/HTTP）
     */
    getProxyAgent() {
        const proxyUrl = process.env.SOCKS_PROXY;
        if (proxyUrl) {
            return new socks_proxy_agent_1.SocksProxyAgent(proxyUrl);
        }
        return undefined;
    }
    /**
     * 初始化Proxy客户端
     */
    initProxyClient() {
        const agent = this.getProxyAgent();
        this.proxyClient = axios_1.default.create({
            baseURL: midjourney_config_1.midjourneyConfig.proxyUrl,
            timeout: midjourney_config_1.midjourneyConfig.timeout,
            headers: {
                'Content-Type': 'application/json',
                'mj-api-secret': midjourney_config_1.midjourneyConfig.apiSecret,
            },
            ...(agent ? { httpsAgent: agent } : {}),
        });
        console.log('✅ [Midjourney] Proxy客户端已初始化');
    }
    /**
     * 初始化Discord服务
     */
    async initDiscordService() {
        const { userToken, guildId, channelId } = midjourney_config_1.midjourneyConfig.discord;
        if (!userToken || !guildId || !channelId) {
            console.error('❌ [Midjourney] Discord配置不完整，请检查环境变量:');
            console.error('   - DISCORD_USER_TOKEN');
            console.error('   - DISCORD_GUILD_ID');
            console.error('   - DISCORD_CHANNEL_ID');
            throw new Error('Discord配置不完整');
        }
        this.discordService = (0, discord_reverse_service_1.createDiscordService)({
            userToken,
            guildId,
            channelId,
        });
        // 连接到Discord
        try {
            await this.discordService.connect();
            console.log('✅ [Midjourney] Discord服务已连接');
        }
        catch (error) {
            console.error('❌ [Midjourney] Discord服务连接失败:', error);
            throw error;
        }
    }
    /**
     * 提交 Imagine 任务（文生图）
     */
    async imagine(params) {
        if (this.mode === 'proxy') {
            return this.imagineViaProxy(params);
        }
        else if (this.isQueueMode()) {
            // 队列模式：通过 Redis 队列转发到专用实例
            return this.submitViaQueue('imagine', params);
        }
        else {
            return this.imagineViaDiscord(params);
        }
    }
    /**
     * 通过Proxy提交Imagine任务
     */
    async imagineViaProxy(params) {
        if (!this.proxyClient) {
            throw new Error('Proxy客户端未初始化');
        }
        try {
            const response = await this.proxyClient.post('/submit/imagine', params);
            return response.data;
        }
        catch (error) {
            console.error('❌ [Midjourney Proxy] Imagine 提交失败:', error.message);
            throw new Error(`Imagine 提交失败: ${error.message}`);
        }
    }
    /**
     * 通过Discord提交Imagine任务
     */
    async imagineViaDiscord(params) {
        await this.ensureDiscordReady();
        if (!this.discordService) {
            throw new Error('Discord服务未初始化');
        }
        try {
            const userId = params.userId || 'anonymous';
            const taskId = await this.discordService.imagine(params.prompt, userId, params.nodeId);
            return {
                code: 1,
                description: '任务已提交',
                result: taskId,
                properties: {
                    prompt: params.prompt,
                },
            };
        }
        catch (error) {
            console.error('❌ [Midjourney Discord] Imagine 提交失败:', error.message);
            return {
                code: -1,
                description: error.message,
            };
        }
    }
    /**
     * 获取高分辨率图片URL
     */
    getHighResImageUrl(url) {
        if (!url)
            return undefined;
        try {
            const urlObj = new URL(url);
            const params = new URLSearchParams(urlObj.search);
            if (params.has('width') || params.has('height')) {
                params.delete('width');
                params.delete('height');
                urlObj.search = params.toString();
                return urlObj.toString();
            }
            return url;
        }
        catch {
            return url;
        }
    }
    /**
     * 查询任务状态
     */
    async fetch(taskId) {
        if (this.mode === 'proxy') {
            return this.fetchViaProxy(taskId);
        }
        else if (this.isQueueMode()) {
            // 队列模式：通过 Redis 队列转发到专用实例，从内存读取状态
            return this.submitViaQueue('fetch', { taskId });
        }
        else {
            return this.fetchViaDiscord(taskId);
        }
    }
    /**
     * 通过Proxy查询任务状态
     */
    async fetchViaProxy(taskId) {
        if (!this.proxyClient) {
            throw new Error('Proxy客户端未初始化');
        }
        try {
            const response = await this.proxyClient.get(`/task/${taskId}/fetch`);
            const data = response.data;
            if (data.status === 'SUCCESS' && data.action === 'IMAGINE' && !data.buttons && data.properties?.messageId) {
                console.log('🔧 [Midjourney Proxy] 自动生成操作按钮');
                data.buttons = this.generateButtons(data.properties.messageId, data.properties.messageHash);
            }
            if (data.status === 'SUCCESS' && data.imageUrl) {
                const optimized = data.action === 'UPSCALE' ? (this.getHighResImageUrl(data.imageUrl) || data.imageUrl) : data.imageUrl;
                const ossUrl = await this.saveRemoteImageToLocal(optimized);
                if (ossUrl)
                    data.imageUrl = ossUrl;
            }
            return data;
        }
        catch (error) {
            console.error('❌ [Midjourney Proxy] 任务查询失败:', error.message);
            throw new Error(`任务查询失败: ${error.message}`);
        }
    }
    /**
     * 通过Discord查询任务状态
     */
    async fetchViaDiscord(taskId) {
        await this.ensureDiscordReady();
        if (!this.discordService) {
            throw new Error('Discord服务未初始化');
        }
        const task = await this.discordService.getTask(taskId);
        if (!task) {
            console.log('⚠️ [Midjourney Discord] 任务不存在:', taskId);
            return {
                id: taskId,
                action: 'UNKNOWN',
                status: 'NOT_FOUND',
            };
        }
        console.log('📊 [Midjourney Discord] 查询任务:', taskId, '状态:', task.status);
        // 转换Discord任务状态为标准格式
        const result = this.convertDiscordTaskToTaskResult(task);
        console.log('📤 [Midjourney Discord] 返回状态:', result.status, '按钮数量:', result.buttons?.length || 0);
        // 图片处理：异步转存到 OSS，不阻塞任务状态查询
        // 这样前端可以立即收到 SUCCESS 状态，然后后台慢慢转存
        if (result.status === midjourney_config_1.MIDJOURNEY_TASK_STATUS.SUCCESS && result.imageUrl) {
            // 如果图片已经是 OSS URL，不需要再处理
            if (!result.imageUrl.includes('aliyuncs.com') && !result.imageUrl.includes('waule.com')) {
                const originalUrl = result.imageUrl;
                // 🔑 异步执行 OSS 转存，不阻塞返回
                this.asyncUploadToOSS(taskId, originalUrl).catch(e => {
                    console.error('❌ [Midjourney] 后台 OSS 转存失败:', e.message);
                });
            }
        }
        return result;
    }
    /**
     * 异步上传图片到 OSS（不阻塞主流程）
     */
    async asyncUploadToOSS(taskId, originalUrl) {
        console.log('📤 [Midjourney] 后台开始转存图片到 OSS...');
        try {
            const ossUrl = await this.downloadAndUploadToOSS(originalUrl);
            if (ossUrl) {
                console.log('✅ [Midjourney] 图片已转存到 OSS:', ossUrl);
                // 更新 Redis 中的任务状态
                this.discordService?.updateTaskImageUrl(taskId, ossUrl);
            }
        }
        catch (e) {
            console.error('❌ [Midjourney] OSS 转存失败，保持原始 URL:', e.message);
        }
    }
    /**
     * 转换Discord任务状态为标准TaskResult格式
     */
    convertDiscordTaskToTaskResult(task) {
        // 根据按钮判断当前图片的类型：
        // - 有 U1-U4 按钮 → 当前是四宫格 → action = 'IMAGINE'
        // - 有 Vary (Subtle) / Upscale 按钮 → 当前是单张图 → action = 'UPSCALE'
        let action = 'IMAGINE';
        if (task.buttons && task.buttons.length > 0) {
            const buttonLabels = task.buttons.map(b => b.label);
            console.log('[convertDiscordTaskToTaskResult] 按钮:', buttonLabels.slice(0, 10));
            // 检查是否有 U1-U4 或 V1-V4 按钮（四宫格的标志）
            const hasGridButtons = task.buttons.some(b => /^U[1-4]$/i.test(b.label) || /^V[1-4]$/i.test(b.label));
            // 检查是否有 Vary/Upscale 按钮（单张图的标志）
            const hasSingleImageButtons = task.buttons.some(b => b.label.includes('Vary') || b.label.includes('Upscale'));
            console.log('[convertDiscordTaskToTaskResult] 判断:', { hasGridButtons, hasSingleImageButtons });
            if (hasGridButtons) {
                action = 'IMAGINE'; // 四宫格
            }
            else if (hasSingleImageButtons) {
                action = 'UPSCALE'; // 单张图（从四宫格选择后放大的）
            }
        }
        else {
            console.log('[convertDiscordTaskToTaskResult] 没有按钮，默认 IMAGINE');
        }
        const result = {
            id: task.taskId,
            action: action,
            status: task.status,
            progress: task.progress,
            imageUrl: task.imageUrl,
            failReason: task.failReason,
            properties: {
                messageId: task.messageId,
                messageHash: task.messageHash,
            },
            buttons: task.buttons?.map(b => ({
                customId: b.customId,
                emoji: b.emoji || '',
                label: b.label,
                type: b.type,
                style: b.style,
            })),
        };
        console.log('🔄 [转换] Discord任务 → TaskResult:', {
            taskId: task.taskId,
            action: result.action,
            status: result.status,
            hasImageUrl: !!result.imageUrl,
            buttonCount: result.buttons?.length || 0,
        });
        return result;
    }
    /**
     * 生成按钮数据（基于Discord消息ID和hash）
     */
    generateButtons(messageId, messageHash) {
        const buttons = [];
        for (let i = 1; i <= 4; i++) {
            buttons.push({
                customId: `MJ::JOB::upsample::${i}::${messageHash}`,
                emoji: '',
                label: `U${i}`,
                type: 2,
                style: 2,
            });
        }
        for (let i = 1; i <= 4; i++) {
            buttons.push({
                customId: `MJ::JOB::variation::${i}::${messageHash}`,
                emoji: '',
                label: `V${i}`,
                type: 2,
                style: 2,
            });
        }
        buttons.push({
            customId: `MJ::JOB::reroll::0::${messageHash}::SOLO`,
            emoji: '🔄',
            label: '重绘',
            type: 2,
            style: 2,
        });
        return buttons;
    }
    /**
     * 轮询任务直到完成
     */
    async pollTask(taskId) {
        let attempts = 0;
        while (attempts < midjourney_config_1.midjourneyConfig.maxPollAttempts) {
            const result = await this.fetch(taskId);
            console.log(`🔍 [Midjourney] 轮询任务 ${taskId}, 状态: ${result.status}, 进度: ${result.progress || 'N/A'}`);
            if (result.status === midjourney_config_1.MIDJOURNEY_TASK_STATUS.SUCCESS) {
                // 完成后统一做本地化
                if (result.imageUrl) {
                    const optimized = result.action === 'UPSCALE' ? (this.getHighResImageUrl(result.imageUrl) || result.imageUrl) : result.imageUrl;
                    const ossUrl = await this.saveRemoteImageToLocal(optimized);
                    if (ossUrl)
                        result.imageUrl = ossUrl;
                }
                console.log('✅ [Midjourney] 任务完成！');
                return result;
            }
            if (result.status === midjourney_config_1.MIDJOURNEY_TASK_STATUS.FAILURE) {
                throw new Error(`任务失败: ${result.failReason || '未知错误'}`);
            }
            if (result.status === midjourney_config_1.MIDJOURNEY_TASK_STATUS.NOT_FOUND) {
                throw new Error('任务不存在');
            }
            await this.sleep(midjourney_config_1.midjourneyConfig.pollInterval);
            attempts++;
        }
        throw new Error('任务超时');
    }
    /**
     * 执行动作（Upscale、Variation 等）
     */
    async action(params) {
        if (this.mode === 'proxy') {
            return this.actionViaProxy(params);
        }
        else if (this.isQueueMode()) {
            // 队列模式：通过 Redis 队列转发到专用实例
            return this.submitViaQueue('action', params);
        }
        else {
            return this.actionViaDiscord(params);
        }
    }
    /**
     * 通过Proxy执行动作
     */
    async actionViaProxy(params) {
        if (!this.proxyClient) {
            throw new Error('Proxy客户端未初始化');
        }
        try {
            console.log('🎬 [Midjourney Proxy] 提交动作:', params);
            const parts = params.customId.split('::');
            const actionType = parts[2];
            const indexStr = parts[3];
            let action;
            if (actionType === 'upsample') {
                action = 'UPSCALE';
            }
            else if (actionType === 'variation') {
                action = 'VARIATION';
            }
            else if (actionType === 'reroll') {
                action = 'REROLL';
            }
            else {
                throw new Error(`未知的动作类型: ${actionType}`);
            }
            const requestBody = {
                action,
                taskId: params.taskId,
            };
            if (action === 'UPSCALE' || action === 'VARIATION') {
                const index = parseInt(indexStr);
                if (isNaN(index) || index < 1 || index > 4) {
                    throw new Error(`无效的index值: ${indexStr}，应为1-4`);
                }
                requestBody.index = index;
            }
            else if (action === 'REROLL' && indexStr) {
                const index = parseInt(indexStr);
                if (!isNaN(index)) {
                    requestBody.index = index;
                }
            }
            if (params.messageHash) {
                requestBody.state = params.messageHash;
            }
            if (params.notifyHook) {
                requestBody.notifyHook = params.notifyHook;
            }
            const response = await this.proxyClient.post('/submit/change', requestBody);
            return response.data;
        }
        catch (error) {
            console.error('❌ [Midjourney Proxy] Action 提交失败:', error.message);
            throw new Error(`Action 提交失败: ${error.message}`);
        }
    }
    /**
     * 通过Discord执行动作
     */
    async actionViaDiscord(params) {
        await this.ensureDiscordReady();
        if (!this.discordService) {
            throw new Error('Discord服务未初始化');
        }
        try {
            console.log('🎬 [Midjourney Discord] 执行动作');
            console.log('   原始任务ID:', params.taskId);
            console.log('   CustomId:', params.customId);
            console.log('   MessageId:', params.messageId);
            // 对于Discord模式，我们需要使用messageId而不是taskId
            if (!params.messageId) {
                // 尝试从taskId获取messageId（仅当前端没有提供时）
                const task = await this.discordService.getTask(params.taskId);
                if (!task || !task.messageId) {
                    throw new Error('找不到消息ID，无法执行操作。如果服务器重启过，请确保前端传递了messageId。');
                }
                params.messageId = task.messageId;
            }
            else {
                console.log('✅ [Midjourney Discord] 前端已提供MessageId，服务器重启后仍可使用');
            }
            const userId = params.userId || 'anonymous';
            const newTaskId = await this.discordService.action(params.messageId, params.customId, userId, params.nodeId);
            return {
                code: 1,
                description: '操作已提交',
                result: newTaskId,
            };
        }
        catch (error) {
            console.error('❌ [Midjourney Discord] Action 提交失败:', error.message);
            return {
                code: -1,
                description: error.message,
            };
        }
    }
    /**
     * Blend（图片混合）
     */
    async blend(base64Array, notifyHook) {
        if (this.mode === 'discord') {
            throw new Error('Discord模式暂不支持Blend功能');
        }
        if (!this.proxyClient) {
            throw new Error('Proxy客户端未初始化');
        }
        try {
            const response = await this.proxyClient.post('/submit/blend', {
                base64Array,
                notifyHook,
            });
            return response.data;
        }
        catch (error) {
            console.error('❌ [Midjourney] Blend 提交失败:', error.message);
            throw new Error(`Blend 提交失败: ${error.message}`);
        }
    }
    /**
     * Describe（图生文）
     */
    async describe(base64, notifyHook) {
        if (this.mode === 'discord') {
            throw new Error('Discord模式暂不支持Describe功能');
        }
        if (!this.proxyClient) {
            throw new Error('Proxy客户端未初始化');
        }
        try {
            const response = await this.proxyClient.post('/submit/describe', {
                base64,
                notifyHook,
            });
            return response.data;
        }
        catch (error) {
            console.error('❌ [Midjourney] Describe 提交失败:', error.message);
            throw new Error(`Describe 提交失败: ${error.message}`);
        }
    }
    /**
     * 获取任务列表
     */
    async listTasks(ids) {
        if (this.mode === 'discord') {
            throw new Error('Discord模式暂不支持listTasks功能');
        }
        if (!this.proxyClient) {
            throw new Error('Proxy客户端未初始化');
        }
        try {
            const response = await this.proxyClient.post('/task/list-by-condition', { ids });
            return response.data;
        }
        catch (error) {
            console.error('❌ [Midjourney] 任务列表查询失败:', error.message);
            throw new Error(`任务列表查询失败: ${error.message}`);
        }
    }
    /**
     * 上传参考图到 Discord（用于 V7 Omni-Reference）
     * @param imageBuffer 图片 Buffer
     * @param filename 文件名
     * @returns Discord CDN URL
     */
    async uploadReferenceImage(imageBuffer, filename) {
        if (this.mode !== 'discord') {
            throw new Error('上传参考图功能仅在 Discord 模式下可用');
        }
        const discordService = (0, discord_reverse_service_1.getDiscordService)();
        if (!discordService) {
            throw new Error('Discord 服务未初始化');
        }
        console.log('🖼️ [Midjourney Service] 上传参考图到 Discord');
        const discordUrl = await discordService.uploadImageToDiscord(imageBuffer, filename);
        console.log('✅ [Midjourney Service] 参考图上传成功:', discordUrl);
        return discordUrl;
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * 启动 Redis 队列消费者（仅在 enableDiscord=true 的实例上运行）
     */
    async startQueueConsumer() {
        console.log('🔄 [Midjourney] 启动队列消费者...');
        const consumeLoop = async () => {
            while (true) {
                try {
                    // 阻塞式获取任务，超时 5 秒
                    const result = await getRedis().blpop(MJ_TASK_QUEUE, 5);
                    if (!result)
                        continue;
                    const [, taskJson] = result;
                    const task = JSON.parse(taskJson);
                    console.log('📥 [Midjourney Queue] 收到任务:', task.type, task.requestId);
                    try {
                        let response;
                        if (task.type === 'imagine') {
                            response = await this.imagineViaDiscord(task.params);
                        }
                        else if (task.type === 'action') {
                            response = await this.actionViaDiscord(task.params);
                        }
                        else if (task.type === 'fetch') {
                            // 直接从内存查询任务状态
                            response = await this.fetchViaDiscord(task.params.taskId);
                        }
                        else {
                            response = { code: -1, description: `未知任务类型: ${task.type}` };
                        }
                        // 将结果存入 Redis，等待原实例获取
                        await getRedis().set(`${MJ_RESULT_PREFIX}${task.requestId}`, JSON.stringify(response), 'EX', 300 // 5 分钟过期
                        );
                        console.log('✅ [Midjourney Queue] 任务完成:', task.requestId);
                    }
                    catch (error) {
                        console.error('❌ [Midjourney Queue] 任务执行失败:', error.message);
                        await getRedis().set(`${MJ_RESULT_PREFIX}${task.requestId}`, JSON.stringify({ code: -1, description: error.message }), 'EX', 300);
                    }
                }
                catch (error) {
                    console.error('❌ [Midjourney Queue] 消费循环错误:', error.message);
                    await this.sleep(1000);
                }
            }
        };
        // 在后台运行消费循环
        consumeLoop().catch(err => {
            console.error('❌ [Midjourney Queue] 消费者崩溃:', err);
        });
    }
    /**
     * 通过队列提交任务（当 enableDiscord=false 时使用）
     */
    async submitViaQueue(type, params) {
        const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        // 将任务推入队列
        await getRedis().rpush(MJ_TASK_QUEUE, JSON.stringify({
            type,
            params,
            requestId,
            timestamp: Date.now(),
        }));
        console.log('📤 [Midjourney Queue] 任务已入队:', type, requestId);
        // 等待结果（最多等待 5 分钟）
        const maxWait = 300000;
        const pollInterval = 500;
        const startTime = Date.now();
        while (Date.now() - startTime < maxWait) {
            const resultJson = await getRedis().get(`${MJ_RESULT_PREFIX}${requestId}`);
            if (resultJson) {
                await getRedis().del(`${MJ_RESULT_PREFIX}${requestId}`);
                return JSON.parse(resultJson);
            }
            await this.sleep(pollInterval);
        }
        throw new Error('队列任务超时');
    }
}
exports.default = new MidjourneyService();
//# sourceMappingURL=midjourney.service.js.map