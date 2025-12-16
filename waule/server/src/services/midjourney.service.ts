import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { uploadBuffer } from '../utils/oss';
import { midjourneyConfig, MIDJOURNEY_TASK_STATUS, MidjourneyTaskStatus } from '../config/midjourney.config';
import { createDiscordService, getDiscordService, DiscordReverseService, TaskStatus } from './discord-reverse.service';
import Redis from 'ioredis';
import { getGlobalWauleApiClient, WauleApiClient } from './waule-api.client';

// Redis 队列名称
const MJ_TASK_QUEUE = 'mj:task:queue';
const MJ_RESULT_PREFIX = 'mj:result:';

// 懒加载 Redis 客户端（避免初始化顺序问题）
let _redis: Redis | null = null;
const getRedis = (): Redis => {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
  }
  return _redis;
};

// Midjourney 图片本地存储目录
const MJ_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'midjourney');
// 确保目录存在
if (!fs.existsSync(MJ_UPLOAD_DIR)) {
  fs.mkdirSync(MJ_UPLOAD_DIR, { recursive: true });
}

interface ImagineRequest {
  prompt: string;
  userId?: string;        // 🔑 用户ID，用于多用户隔离（可选）
  base64Array?: string[]; // 垫图（可选）
  notifyHook?: string;    // 回调地址（可选）
  nodeId?: string;        // 🔑 React Flow节点ID，用于精确追踪（可选）
}

interface TaskResponse {
  code: number;
  description: string;
  result?: string; // 任务ID
  properties?: Record<string, unknown>;
}

interface TaskResult {
  id: string;
  action: string;
  status: MidjourneyTaskStatus;
  prompt?: string;
  promptEn?: string;
  description?: string;
  submitTime?: number;
  startTime?: number;
  finishTime?: number;
  progress?: string;
  imageUrl?: string;
  failReason?: string;
  properties?: {
    messageId?: string;
    messageHash?: string;
    finalPrompt?: string;
    [key: string]: any;
  };
  buttons?: Array<{
    customId: string;
    emoji: string;
    label: string;
    type: number;
    style: number;
  }>;
}

interface ActionRequest {
  taskId: string;
  customId: string;
  userId?: string;        // 🔑 用户ID，用于多用户隔离（可选）
  notifyHook?: string;
  messageId?: string;
  messageHash?: string;
  nodeId?: string; // 🔑 React Flow节点ID，用于精确追踪（可选）
}

/**
 * Midjourney服务
 * 支持三种模式：
 * 1. waule-api模式：通过本地 waule-api 网关（优先）
 * 2. proxy模式：通过Midjourney Proxy服务
 * 3. discord模式：直接通过Discord API逆向
 */
class MidjourneyService {
  private proxyClient: AxiosInstance | null = null;
  private discordService: DiscordReverseService | null = null;
  private wauleApiClient: WauleApiClient | null = null;
  private mode: 'proxy' | 'discord';
  private discordInitPromise: Promise<void> | null = null;
  private enableDiscord: boolean;

  constructor() {
    this.mode = midjourneyConfig.mode;
    this.enableDiscord = midjourneyConfig.enableDiscord;
    
    // 优先检查 waule-api 是否可用
    this.wauleApiClient = getGlobalWauleApiClient();
    if (this.wauleApiClient) {
      console.log('🎨 [Midjourney] 优先使用 waule-api 网关模式');
      return; // 使用 waule-api，不需要初始化 proxy 或 discord
    }
    
    console.log(`🎨 [Midjourney] 使用模式: ${this.mode}, Discord启用: ${this.enableDiscord}`);
    
    if (this.mode === 'proxy') {
      this.initProxyClient();
    } else if (this.mode === 'discord') {
      if (this.enableDiscord) {
        // 只有启用 Discord 的实例才初始化连接
        this.discordInitPromise = this.initDiscordService().catch((error) => {
          // 不再抛出错误，只记录警告
          console.warn('⚠️ [Midjourney] Discord服务初始化失败，Midjourney 功能将不可用:', error.message);
        });
        // 启动队列消费者
        this.startQueueConsumer();
      } else {
        console.log('📤 [Midjourney] Discord 已禁用，任务将通过 Redis 队列转发');
      }
    }
  }
  
  /**
   * 检查是否为队列模式（Discord 禁用时使用队列转发）
   */
  isQueueMode(): boolean {
    return this.mode === 'discord' && !this.enableDiscord;
  }

  /**
   * 下载远程图片到服务器本地，返回本地 URL
   */
  private async downloadToLocal(url: string): Promise<{ localPath: string; localUrl: string; buffer: Buffer; ext: string } | null> {
    try {
      console.log('📥 [Midjourney] 开始下载图片到服务器:', url.substring(0, 80) + '...');
      const startDownload = Date.now();
      const agent = this.getProxyAgent();
      const response = await axios.get(url, { 
        responseType: 'arraybuffer', 
        timeout: 30000,
        ...(agent ? { httpsAgent: agent } : {}) 
      });
      const buffer = Buffer.from(response.data);
      console.log(`📥 [Midjourney] 下载完成，大小: ${(buffer.length / 1024 / 1024).toFixed(2)}MB，耗时: ${Date.now() - startDownload}ms`);
      
      // 确定文件扩展名
      const ct = response.headers['content-type'] || '';
      let ext = '.jpg';
      if (ct.includes('png')) ext = '.png';
      else if (ct.includes('webp')) ext = '.webp';
      else if (ct.includes('jpeg') || ct.includes('jpg')) ext = '.jpg';
      else {
        try {
          const u = new URL(url);
          const p = u.pathname.toLowerCase();
          if (p.endsWith('.png')) ext = '.png';
          else if (p.endsWith('.webp')) ext = '.webp';
          else if (p.endsWith('.jpg') || p.endsWith('.jpeg')) ext = '.jpg';
        } catch {}
      }
      
      // 保存到本地
      const filename = `mj-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
      const localPath = path.join(MJ_UPLOAD_DIR, filename);
      fs.writeFileSync(localPath, buffer);
      const localUrl = `/uploads/midjourney/${filename}`;
      console.log('💾 [Midjourney] 已保存到服务器:', localUrl);
      
      return { localPath, localUrl, buffer, ext };
    } catch (e: any) {
      console.error('❌ [Midjourney] 下载图片失败:', e.message);
      return null;
    }
  }

  /**
   * 直接从远程 URL 下载图片并上传到 OSS
   * 使用传输加速，约 3 秒完成
   */
  private async downloadAndUploadToOSS(url: string): Promise<string | null> {
    try {
      const startTime = Date.now();
      
      // 下载图片（通过代理）
      console.log('📥 [Midjourney] 下载图片:', url.substring(0, 80) + '...');
      const agent = this.getProxyAgent();
      const response = await axios.get(url, { 
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
      if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
      else if (contentType.includes('webp')) ext = '.webp';
      else if (contentType.includes('gif')) ext = '.gif';
      
      // 上传到 OSS
      const uploadStart = Date.now();
      const ossUrl = await uploadBuffer(buffer, ext);
      const uploadTime = Date.now() - uploadStart;
      console.log(`📤 [Midjourney] OSS 上传完成，耗时: ${Math.round(uploadTime/1000)}秒`);
      
      return ossUrl;
    } catch (e: any) {
      console.error('❌ [Midjourney] 下载或上传失败:', e.message);
      return null;
    }
  }

  /**
   * 下载远程图片并保存到本地，返回本地 URL（用于 Proxy 模式）
   */
  private async saveRemoteImageToLocal(url?: string): Promise<string | undefined> {
    if (!url) return undefined;
    if (/aliyuncs\.com\//.test(url)) return url;
    if (url.startsWith('/uploads/')) return url;
    
    const localResult = await this.downloadToLocal(url);
    if (localResult) {
      // 异步上传到 OSS（不阻塞）
      uploadBuffer(localResult.buffer, localResult.ext).then(ossUrl => {
        if (ossUrl) {
          // 上传成功后删除本地文件
          try { fs.unlinkSync(localResult.localPath); } catch {}
        }
      }).catch(() => {});
      return localResult.localUrl;
    }
    return url;
  }
  
  /**
   * 确保Discord服务已经初始化
   * 支持等待重试，用于服务器刚重启时 Discord 还在连接中的情况
   */
  private async ensureDiscordReady(maxWaitMs: number = 15000): Promise<void> {
    const startTime = Date.now();
    const retryInterval = 500; // 每500ms检查一次
    
    while (Date.now() - startTime < maxWaitMs) {
      // 如果已有可用的 Discord 服务，直接返回
      if (this.discordService) {
        return;
      }
      
      // 尝试获取全局 Discord 服务（可能由重连机制创建）
      const globalService = getDiscordService();
      if (globalService) {
        this.discordService = globalService;
        return;
      }
      
      // 等待初始化 Promise
      if (this.mode === 'discord' && this.discordInitPromise) {
        try {
          await this.discordInitPromise;
          return;
        } catch (e) {
          // 初始化失败，尝试再次获取（可能已重连）
          const retryService = getDiscordService();
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
    const finalService = getDiscordService();
    if (finalService) {
      this.discordService = finalService;
      return;
    }
    
    throw new Error('Discord服务未就绪，请稍后重试');
  }

  /**
   * 构造代理 Agent（HTTPS/HTTP）
   */
  private getProxyAgent(): SocksProxyAgent | undefined {
    const proxyUrl = process.env.SOCKS_PROXY;
    if (proxyUrl) {
      return new SocksProxyAgent(proxyUrl);
    }
    return undefined;
  }

  /**
   * 初始化Proxy客户端
   */
  private initProxyClient(): void {
    const agent = this.getProxyAgent();
    this.proxyClient = axios.create({
      baseURL: midjourneyConfig.proxyUrl,
      timeout: midjourneyConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
        'mj-api-secret': midjourneyConfig.apiSecret,
      },
      ...(agent ? { httpsAgent: agent } : {}),
    });
    console.log('✅ [Midjourney] Proxy客户端已初始化');
  }

  /**
   * 初始化Discord服务
   */
  private async initDiscordService(): Promise<void> {
    const { userToken, guildId, channelId } = midjourneyConfig.discord;
    
    if (!userToken || !guildId || !channelId) {
      console.error('❌ [Midjourney] Discord配置不完整，请检查环境变量:');
      console.error('   - DISCORD_USER_TOKEN');
      console.error('   - DISCORD_GUILD_ID');
      console.error('   - DISCORD_CHANNEL_ID');
      throw new Error('Discord配置不完整');
    }
    
    this.discordService = createDiscordService({
      userToken,
      guildId,
      channelId,
    });
    
    // 连接到Discord
    try {
      await this.discordService.connect();
      console.log('✅ [Midjourney] Discord服务已连接');
    } catch (error) {
      console.error('❌ [Midjourney] Discord服务连接失败:', error);
      throw error;
    }
  }

  /**
   * 提交 Imagine 任务（文生图）
   */
  async imagine(params: ImagineRequest): Promise<TaskResponse> {
    // 优先使用 waule-api
    if (this.wauleApiClient) {
      return this.imagineViaWauleApi(params);
    }
    
    if (this.mode === 'proxy') {
      return this.imagineViaProxy(params);
    } else if (this.isQueueMode()) {
      // 队列模式：通过 Redis 队列转发到专用实例
      return this.submitViaQueue('imagine', params);
    } else {
      return this.imagineViaDiscord(params);
    }
  }

  /**
   * 通过 waule-api 提交 Imagine 任务
   */
  private async imagineViaWauleApi(params: ImagineRequest): Promise<TaskResponse> {
    if (!this.wauleApiClient) {
      throw new Error('WauleAPI 客户端未初始化');
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
    } catch (error: any) {
      console.error('❌ [Midjourney WauleAPI] Imagine 提交失败:', error.message);
      return {
        code: -1,
        description: error.message,
      };
    }
  }

  /**
   * 通过Proxy提交Imagine任务
   */
  private async imagineViaProxy(params: ImagineRequest): Promise<TaskResponse> {
    if (!this.proxyClient) {
      throw new Error('Proxy客户端未初始化');
    }
    
    try {
      const response = await this.proxyClient.post('/submit/imagine', params);
      return response.data;
    } catch (error: any) {
      console.error('❌ [Midjourney Proxy] Imagine 提交失败:', error.message);
      throw new Error(`Imagine 提交失败: ${error.message}`);
    }
  }

  /**
   * 通过Discord提交Imagine任务
   */
  private async imagineViaDiscord(params: ImagineRequest): Promise<TaskResponse> {
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
    } catch (error: any) {
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
  private getHighResImageUrl(url?: string): string | undefined {
    if (!url) return undefined;
    
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
    } catch {
      return url;
    }
  }

  /**
   * 查询任务状态
   */
  async fetch(taskId: string): Promise<TaskResult> {
    // 优先使用 waule-api
    if (this.wauleApiClient) {
      return this.fetchViaWauleApi(taskId);
    }
    
    if (this.mode === 'proxy') {
      return this.fetchViaProxy(taskId);
    } else if (this.isQueueMode()) {
      // 队列模式：通过 Redis 队列转发到专用实例，从内存读取状态
      return this.submitViaQueue('fetch', { taskId });
    } else {
      return this.fetchViaDiscord(taskId);
    }
  }

  /**
   * 通过 waule-api 查询任务状态
   */
  private async fetchViaWauleApi(taskId: string): Promise<TaskResult> {
    if (!this.wauleApiClient) {
      throw new Error('WauleAPI 客户端未初始化');
    }
    
    try {
      const result = await this.wauleApiClient.midjourneyGetTask(taskId);
      
      console.log(`🔍 [Midjourney WauleAPI] 查询任务 ${taskId}, 状态: ${result.status}`);
      
      // 转换状态
      let status: MidjourneyTaskStatus = MIDJOURNEY_TASK_STATUS.SUBMITTED;
      if (result.status === 'SUCCESS' || result.status === 'COMPLETED') {
        status = MIDJOURNEY_TASK_STATUS.SUCCESS;
      } else if (result.status === 'FAILED' || result.status === 'FAILURE') {
        status = MIDJOURNEY_TASK_STATUS.FAILURE;
      } else if (result.status === 'IN_PROGRESS') {
        status = MIDJOURNEY_TASK_STATUS.IN_PROGRESS;
      } else if (result.status === 'SUBMITTED') {
        status = MIDJOURNEY_TASK_STATUS.SUBMITTED;
      }
      
      return {
        id: result.taskId || taskId,
        action: 'IMAGINE',
        status,
        progress: result.progress !== undefined ? String(result.progress) : undefined,
        imageUrl: result.imageUrl,
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
    } catch (error: any) {
      console.error('❌ [Midjourney WauleAPI] 查询任务失败:', error.message);
      throw error;
    }
  }

  /**
   * 通过Proxy查询任务状态
   */
  private async fetchViaProxy(taskId: string): Promise<TaskResult> {
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
        if (ossUrl) data.imageUrl = ossUrl;
      }
      
      return data;
    } catch (error: any) {
      console.error('❌ [Midjourney Proxy] 任务查询失败:', error.message);
      throw new Error(`任务查询失败: ${error.message}`);
    }
  }

  /**
   * 通过Discord查询任务状态
   */
  private async fetchViaDiscord(taskId: string): Promise<TaskResult> {
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
    if (result.status === MIDJOURNEY_TASK_STATUS.SUCCESS && result.imageUrl) {
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
  private async asyncUploadToOSS(taskId: string, originalUrl: string): Promise<void> {
    console.log('📤 [Midjourney] 后台开始转存图片到 OSS...');
    try {
      const ossUrl = await this.downloadAndUploadToOSS(originalUrl);
      if (ossUrl) {
        console.log('✅ [Midjourney] 图片已转存到 OSS:', ossUrl);
        // 更新 Redis 中的任务状态
        this.discordService?.updateTaskImageUrl(taskId, ossUrl);
      }
    } catch (e: any) {
      console.error('❌ [Midjourney] OSS 转存失败，保持原始 URL:', e.message);
    }
  }

  /**
   * 转换Discord任务状态为标准TaskResult格式
   */
  private convertDiscordTaskToTaskResult(task: TaskStatus): TaskResult {
    // 根据按钮判断当前图片的类型：
    // - 有 U1-U4 按钮 → 当前是四宫格 → action = 'IMAGINE'
    // - 有 Vary (Subtle) / Upscale 按钮 → 当前是单张图 → action = 'UPSCALE'
    let action = 'IMAGINE';
    if (task.buttons && task.buttons.length > 0) {
      const buttonLabels = task.buttons.map(b => b.label);
      console.log('[convertDiscordTaskToTaskResult] 按钮:', buttonLabels.slice(0, 10));
      
      // 检查是否有 U1-U4 或 V1-V4 按钮（四宫格的标志）
      const hasGridButtons = task.buttons.some(b => 
        /^U[1-4]$/i.test(b.label) || /^V[1-4]$/i.test(b.label)
      );
      // 检查是否有 Vary/Upscale 按钮（单张图的标志）
      const hasSingleImageButtons = task.buttons.some(b =>
        b.label.includes('Vary') || b.label.includes('Upscale')
      );
      
      console.log('[convertDiscordTaskToTaskResult] 判断:', { hasGridButtons, hasSingleImageButtons });
      
      if (hasGridButtons) {
        action = 'IMAGINE';  // 四宫格
      } else if (hasSingleImageButtons) {
        action = 'UPSCALE';  // 单张图（从四宫格选择后放大的）
      }
    } else {
      console.log('[convertDiscordTaskToTaskResult] 没有按钮，默认 IMAGINE');
    }
    
    const result: TaskResult = {
      id: task.taskId,
      action: action,
      status: task.status as MidjourneyTaskStatus,
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
  private generateButtons(messageId: string, messageHash: string): Array<{
    customId: string;
    emoji: string;
    label: string;
    type: number;
    style: number;
  }> {
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
  async pollTask(taskId: string): Promise<TaskResult> {
    // 优先使用 waule-api（长轮询模式）
    if (this.wauleApiClient) {
      return this.pollTaskViaWauleApi(taskId);
    }
    
    let attempts = 0;
    
    while (attempts < midjourneyConfig.maxPollAttempts) {
      const result = await this.fetch(taskId);
      
      console.log(`🔍 [Midjourney] 轮询任务 ${taskId}, 状态: ${result.status}, 进度: ${result.progress || 'N/A'}`);
      
      if (result.status === MIDJOURNEY_TASK_STATUS.SUCCESS) {
        // 完成后统一做本地化
        if (result.imageUrl) {
          const optimized = result.action === 'UPSCALE' ? (this.getHighResImageUrl(result.imageUrl) || result.imageUrl) : result.imageUrl;
          const ossUrl = await this.saveRemoteImageToLocal(optimized);
          if (ossUrl) result.imageUrl = ossUrl as string;
        }
        console.log('✅ [Midjourney] 任务完成！');
        return result;
      }
      
      if (result.status === MIDJOURNEY_TASK_STATUS.FAILURE) {
        throw new Error(`任务失败: ${result.failReason || '未知错误'}`);
      }
      
      if (result.status === MIDJOURNEY_TASK_STATUS.NOT_FOUND) {
        throw new Error('任务不存在');
      }
      
      await this.sleep(midjourneyConfig.pollInterval);
      attempts++;
    }
    
    throw new Error('任务超时');
  }

  /**
   * 通过 waule-api 轮询任务（长轮询）
   */
  private async pollTaskViaWauleApi(taskId: string): Promise<TaskResult> {
    if (!this.wauleApiClient) {
      throw new Error('WauleAPI 客户端未初始化');
    }
    
    try {
      // 使用长轮询等待任务完成（最多 5 分钟）
      const result = await this.wauleApiClient.midjourneyWaitTask(taskId, 300000);
      
      console.log(`🔍 [Midjourney WauleAPI] 任务 ${taskId}, 状态: ${result.status}`);
      
      if (result.status === 'SUCCESS' || result.status === 'COMPLETED') {
        console.log('✅ [Midjourney WauleAPI] 任务完成！');
        return {
          id: result.taskId,
          action: 'IMAGINE',
          status: MIDJOURNEY_TASK_STATUS.SUCCESS,
          imageUrl: result.imageUrl,
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
    } catch (error: any) {
      console.error('❌ [Midjourney WauleAPI] 轮询任务失败:', error.message);
      throw error;
    }
  }

  /**
   * 执行动作（Upscale、Variation 等）
   */
  async action(params: ActionRequest): Promise<TaskResponse> {
    // 优先使用 waule-api
    if (this.wauleApiClient) {
      return this.actionViaWauleApi(params);
    }
    
    if (this.mode === 'proxy') {
      return this.actionViaProxy(params);
    } else if (this.isQueueMode()) {
      // 队列模式：通过 Redis 队列转发到专用实例
      return this.submitViaQueue('action', params);
    } else {
      return this.actionViaDiscord(params);
    }
  }

  /**
   * 通过 waule-api 执行动作
   */
  private async actionViaWauleApi(params: ActionRequest): Promise<TaskResponse> {
    if (!this.wauleApiClient) {
      throw new Error('WauleAPI 客户端未初始化');
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
    } catch (error: any) {
      console.error('❌ [Midjourney WauleAPI] Action 提交失败:', error.message);
      return {
        code: -1,
        description: error.message,
      };
    }
  }

  /**
   * 通过Proxy执行动作
   */
  private async actionViaProxy(params: ActionRequest): Promise<TaskResponse> {
    if (!this.proxyClient) {
      throw new Error('Proxy客户端未初始化');
    }
    
    try {
      console.log('🎬 [Midjourney Proxy] 提交动作:', params);
      
      const parts = params.customId.split('::');
      const actionType = parts[2];
      const indexStr = parts[3];
      
      let action: 'UPSCALE' | 'VARIATION' | 'REROLL';
      if (actionType === 'upsample') {
        action = 'UPSCALE';
      } else if (actionType === 'variation') {
        action = 'VARIATION';
      } else if (actionType === 'reroll') {
        action = 'REROLL';
      } else {
        throw new Error(`未知的动作类型: ${actionType}`);
      }
      
      const requestBody: {
        action: string;
        index?: number;
        taskId: string;
        state?: string;
        notifyHook?: string;
      } = {
        action,
        taskId: params.taskId,
      };
      
      if (action === 'UPSCALE' || action === 'VARIATION') {
        const index = parseInt(indexStr);
        if (isNaN(index) || index < 1 || index > 4) {
          throw new Error(`无效的index值: ${indexStr}，应为1-4`);
        }
        requestBody.index = index;
      } else if (action === 'REROLL' && indexStr) {
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
    } catch (error: any) {
      console.error('❌ [Midjourney Proxy] Action 提交失败:', error.message);
      throw new Error(`Action 提交失败: ${error.message}`);
    }
  }

  /**
   * 通过Discord执行动作
   */
  private async actionViaDiscord(params: ActionRequest): Promise<TaskResponse> {
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
      } else {
        console.log('✅ [Midjourney Discord] 前端已提供MessageId，服务器重启后仍可使用');
      }
      
      const userId = params.userId || 'anonymous';
      const newTaskId = await this.discordService.action(params.messageId, params.customId, userId, params.nodeId);
      
      return {
        code: 1,
        description: '操作已提交',
        result: newTaskId,
      };
    } catch (error: any) {
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
  async blend(base64Array: string[], notifyHook?: string): Promise<TaskResponse> {
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
    } catch (error: any) {
      console.error('❌ [Midjourney] Blend 提交失败:', error.message);
      throw new Error(`Blend 提交失败: ${error.message}`);
    }
  }

  /**
   * Describe（图生文）
   */
  async describe(base64: string, notifyHook?: string): Promise<TaskResponse> {
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
    } catch (error: any) {
      console.error('❌ [Midjourney] Describe 提交失败:', error.message);
      throw new Error(`Describe 提交失败: ${error.message}`);
    }
  }

  /**
   * 获取任务列表
   */
  async listTasks(ids: string[]): Promise<TaskResult[]> {
    if (this.mode === 'discord') {
      throw new Error('Discord模式暂不支持listTasks功能');
    }
    
    if (!this.proxyClient) {
      throw new Error('Proxy客户端未初始化');
    }
    
    try {
      const response = await this.proxyClient.post('/task/list-by-condition', { ids });
      return response.data;
    } catch (error: any) {
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
  async uploadReferenceImage(imageBuffer: Buffer, filename: string): Promise<string> {
    if (this.mode !== 'discord') {
      throw new Error('上传参考图功能仅在 Discord 模式下可用');
    }

    const discordService = getDiscordService();
    if (!discordService) {
      throw new Error('Discord 服务未初始化');
    }

    console.log('🖼️ [Midjourney Service] 上传参考图到 Discord');
    const discordUrl = await discordService.uploadImageToDiscord(imageBuffer, filename);
    console.log('✅ [Midjourney Service] 参考图上传成功:', discordUrl);

    return discordUrl;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 启动 Redis 队列消费者（仅在 enableDiscord=true 的实例上运行）
   */
  private async startQueueConsumer(): Promise<void> {
    console.log('🔄 [Midjourney] 启动队列消费者...');
    
    const consumeLoop = async () => {
      while (true) {
        try {
          // 阻塞式获取任务，超时 5 秒
          const result = await getRedis().blpop(MJ_TASK_QUEUE, 5);
          if (!result) continue;
          
          const [, taskJson] = result;
          const task = JSON.parse(taskJson);
          console.log('📥 [Midjourney Queue] 收到任务:', task.type, task.requestId);
          
          try {
            let response: any;
            
            if (task.type === 'imagine') {
              response = await this.imagineViaDiscord(task.params);
            } else if (task.type === 'action') {
              response = await this.actionViaDiscord(task.params);
            } else if (task.type === 'fetch') {
              // 直接从内存查询任务状态
              response = await this.fetchViaDiscord(task.params.taskId);
            } else {
              response = { code: -1, description: `未知任务类型: ${task.type}` };
            }
            
            // 将结果存入 Redis，等待原实例获取
            await getRedis().set(
              `${MJ_RESULT_PREFIX}${task.requestId}`,
              JSON.stringify(response),
              'EX',
              300 // 5 分钟过期
            );
            console.log('✅ [Midjourney Queue] 任务完成:', task.requestId);
          } catch (error: any) {
            console.error('❌ [Midjourney Queue] 任务执行失败:', error.message);
            await getRedis().set(
              `${MJ_RESULT_PREFIX}${task.requestId}`,
              JSON.stringify({ code: -1, description: error.message }),
              'EX',
              300
            );
          }
        } catch (error: any) {
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
  private async submitViaQueue(type: string, params: any): Promise<any> {
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

export default new MidjourneyService();
