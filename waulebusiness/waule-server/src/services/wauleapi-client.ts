/**
 * WauleAPI 客户端
 * 用于与 waule-api 网关通信，调用统一的 v1 接口
 * 
 * 支持多实例部署：
 * - 国内实例：对接豆包、阿里万象等国内模型
 * - 国外实例：对接 Gemini、Sora 等国外模型
 * 
 * 环境变量配置示例：
 * WAULEAPI_URL=http://localhost:9000              # 默认地址
 * WAULEAPI_SECRET=your-api-secret                 # 认证密钥
 * 
 * # 按供应商单独配置（可选，优先级高于默认）
 * WAULEAPI_DOUBAO_URL=https://cn.wauleapi.com:9000
 * WAULEAPI_WANX_URL=https://cn.wauleapi.com:9000
 * WAULEAPI_GEMINI_URL=https://us.wauleapi.com:9000
 * WAULEAPI_SORA_URL=https://us.wauleapi.com:9000
 * WAULEAPI_VIDU_URL=https://us.wauleapi.com:9000
 * WAULEAPI_MINIMAX_URL=https://cn.wauleapi.com:9000
 * WAULEAPI_COSYVOICE_URL=https://cn.wauleapi.com:9000
 */

import axios, { AxiosInstance } from 'axios';

// 供应商列表
type Provider = 'doubao' | 'wanx' | 'gemini' | 'sora' | 'vidu' | 'minimax' | 'cosyvoice' | 'midjourney';

// 服务器配置（来自数据库 WauleApiServer）
export interface ServerConfig {
  url: string;
  authToken?: string | null;
}

class WauleApiClient {
  private defaultUrl: string;
  private apiSecret: string;
  private providerUrls: Map<Provider, string> = new Map();

  constructor() {
    this.defaultUrl = process.env.WAULEAPI_URL || 'http://localhost:9000';
    this.apiSecret = process.env.WAULEAPI_SECRET || '';

    // 加载各供应商的自定义 URL
    const providers: Provider[] = ['doubao', 'wanx', 'gemini', 'sora', 'vidu', 'minimax', 'cosyvoice', 'midjourney'];
    for (const provider of providers) {
      const envKey = `WAULEAPI_${provider.toUpperCase()}_URL`;
      const url = process.env[envKey];
      if (url) {
        this.providerUrls.set(provider, url);
        console.log(`[WauleAPI] ${provider} -> ${url}`);
      }
    }

    console.log(`[WauleAPI] 默认地址: ${this.defaultUrl}, Auth: ${this.apiSecret ? 'Enabled' : 'Disabled'}`);
  }

  /**
   * 获取指定供应商的 API 地址
   */
  private getUrl(provider: Provider): string {
    return this.providerUrls.get(provider) || this.defaultUrl;
  }

  /**
   * 创建请求客户端
   * @param provider 供应商（用于从环境变量获取默认地址）
   * @param serverConfig 可选的服务器配置（优先级最高，来自数据库）
   */
  private createClient(provider: Provider, serverConfig?: ServerConfig): AxiosInstance {
    // 优先级：serverConfig > 环境变量按供应商配置 > 默认地址
    const baseURL = serverConfig?.url || this.getUrl(provider);
    const authToken = serverConfig?.authToken ?? this.apiSecret;
    return axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
      },
      timeout: 1200000, // 20分钟超时
    });
  }

  /**
   * 从模型名推断供应商
   */
  private inferProvider(model: string): Provider {
    const modelLower = model.toLowerCase();
    if (modelLower.includes('doubao') || modelLower.includes('seedream') || modelLower.includes('seedance')) return 'doubao';
    if (modelLower.includes('wanx') || modelLower.includes('tongyi') || modelLower.includes('alibaba') || modelLower.includes('wan2') || modelLower.includes('qwen') || modelLower.includes('video-style') || modelLower.includes('videoretalk')) return 'wanx';
    if (modelLower.includes('gemini')) return 'gemini';
    if (modelLower.includes('sora')) return 'sora';
    if (modelLower.includes('vidu')) return 'vidu';
    if (modelLower.includes('minimax') || modelLower.includes('hailuo')) return 'minimax';
    if (modelLower.includes('cosyvoice')) return 'cosyvoice';
    if (modelLower.includes('midjourney') || modelLower.includes('mj')) return 'midjourney';
    return 'doubao'; // 默认
  }

  /**
   * 图片生成 - 调用 /v1/images/generations
   */
  async generateImage(params: {
    model: string;
    prompt: string;
    size?: string;
    n?: number;
    reference_images?: string[];
    use_intl?: boolean;
    max_images?: number; // SeeDream 4.5 组图数量 (1-15)
  }, serverConfig?: ServerConfig): Promise<{
    created: number;
    data: Array<{ url: string; revised_prompt?: string }>;
  }> {
    const provider = this.inferProvider(params.model);
    const client = this.createClient(provider, serverConfig);
    const actualUrl = serverConfig?.url || this.getUrl(provider);
    console.log(`[WauleAPI] 图片生成: model=${params.model}, provider=${provider}, url=${actualUrl}`);
    const response = await client.post('/v1/images/generations', params);
    return response.data;
  }

  /**
   * 视频生成 - 调用 /v1/videos/generations
   */
  async generateVideo(params: {
    model: string;
    prompt: string;
    image?: string;
    reference_images?: string[]; // 支持多图（首帧+尾帧）
    duration?: number;
    aspect_ratio?: string;
    resolution?: string; // 720p, 1080p
    use_intl?: boolean;
    // 视频换人参数
    replace_image_url?: string;
    replace_video_url?: string;
    mode?: string;
    // 视频风格转绘参数
    style?: number;
    video_fps?: number;
    min_len?: number;
    // 视频换人参数
    audio_url?: string;
    video_extension?: boolean;
    // Vidu 特有参数
    subjects?: Array<{id: string; images: string[]; voice_id?: string}>;
    audio?: boolean;
    voice_id?: string;
    bgm?: boolean;
    movement_amplitude?: string;
    generation_type?: string;
  }, serverConfig?: ServerConfig): Promise<{
    data: Array<{ url: string; duration?: number }>;
  }> {
    const provider = this.inferProvider(params.model);
    const client = this.createClient(provider, serverConfig);
    const actualUrl = serverConfig?.url || this.getUrl(provider);
    console.log(`[WauleAPI] 视频生成: model=${params.model}, provider=${provider}, url=${actualUrl}`);
    const response = await client.post('/v1/videos/generations', params);
    return response.data;
  }

  /**
   * 文本生成 - 调用 /v1/chat/completions
   */
  async chat(params: {
    model: string;
    messages: Array<{ role: string; content: any }>;
    temperature?: number;
    max_tokens?: number;
  }, serverConfig?: ServerConfig): Promise<{
    choices: Array<{ message: { content: string } }>;
  }> {
    const provider = this.inferProvider(params.model);
    const client = this.createClient(provider, serverConfig);
    const actualUrl = serverConfig?.url || this.getUrl(provider);
    console.log(`[WauleAPI] 文本生成: model=${params.model}, provider=${provider}, url=${actualUrl}`);
    const response = await client.post('/v1/chat/completions', params);
    return response.data;
  }

  /**
   * 音频生成 - 调用 /v1/audio/speech
   */
  async generateAudio(params: {
    model: string;
    input: string;
    voice?: string;
  }, serverConfig?: ServerConfig): Promise<{
    data: Array<{ url: string }>;
  }> {
    const provider = this.inferProvider(params.model);
    const client = this.createClient(provider, serverConfig);
    const actualUrl = serverConfig?.url || this.getUrl(provider);
    console.log(`[WauleAPI] 音频生成: model=${params.model}, provider=${provider}, url=${actualUrl}`);
    const response = await client.post('/v1/audio/speech', params);
    return response.data;
  }

  /**
   * 智能超清 - 调用 /v1/videos/upscale
   */
  async upscaleVideo(params: {
    video_url?: string;
    video_creation_id?: string;
    upscale_resolution?: '1080p' | '2K' | '4K' | '8K';
  }, serverConfig?: ServerConfig): Promise<{
    data: Array<{ url: string }>;
  }> {
    const client = this.createClient('vidu', serverConfig);
    const actualUrl = serverConfig?.url || this.getUrl('vidu');
    console.log(`[WauleAPI] 智能超清: resolution=${params.upscale_resolution}, url=${actualUrl}`);
    const response = await client.post('/v1/videos/upscale', params);
    return response.data;
  }

  /**
   * 广告成片 - 调用 /v1/videos/commercial
   */
  async createCommercialVideo(params: {
    images: string[];
    prompt: string;
    duration?: number;
    ratio?: '16:9' | '9:16' | '1:1';
    language?: 'zh' | 'en';
  }, serverConfig?: ServerConfig): Promise<{
    data: Array<{ url: string }>;
  }> {
    const client = this.createClient('vidu', serverConfig);
    const actualUrl = serverConfig?.url || this.getUrl('vidu');
    console.log(`[WauleAPI] 广告成片: images=${params.images?.length}, url=${actualUrl}`);
    const response = await client.post('/v1/videos/commercial', params);
    return response.data;
  }

  // ==================== Midjourney 方法 ====================

  /**
   * Midjourney Imagine - 文生图
   */
  async mjImagine(params: {
    prompt: string;
    userId?: string;
  }, serverConfig?: ServerConfig): Promise<{
    success: boolean;
    taskId: string;
    message?: string;
  }> {
    const client = this.createClient('midjourney', serverConfig);
    console.log(`[WauleAPI] MJ Imagine: prompt=${params.prompt.substring(0, 50)}...`);
    const response = await client.post('/v1/midjourney/imagine', params);
    return response.data;
  }

  /**
   * Midjourney Action - 执行按钮操作 (Upscale, Variation 等)
   */
  async mjAction(params: {
    messageId: string;
    customId: string;
    userId?: string;
  }, serverConfig?: ServerConfig): Promise<{
    success: boolean;
    taskId: string;
    message?: string;
  }> {
    const client = this.createClient('midjourney', serverConfig);
    console.log(`[WauleAPI] MJ Action: messageId=${params.messageId}, customId=${params.customId}`);
    const response = await client.post('/v1/midjourney/action', params);
    return response.data;
  }

  /**
   * Midjourney 查询任务状态
   */
  async mjGetTask(taskId: string, serverConfig?: ServerConfig): Promise<{
    taskId: string;
    status: string;
    progress?: string;
    imageUrl?: string;
    messageId?: string;
    messageHash?: string;
    buttons?: Array<{
      customId: string;
      label: string;
      emoji?: string;
    }>;
    failReason?: string;
  }> {
    const client = this.createClient('midjourney', serverConfig);
    const response = await client.get(`/v1/midjourney/task/${taskId}`);
    return response.data;
  }

  // ==================== Sora 中转 API 方法 ====================

  /**
   * Sora Chat Completions - 调用 /v1/sora/chat/completions
   * 用于视频生成、图生视频、角色创建等
   */
  async soraChatCompletions(params: {
    model: string;
    messages: Array<{ role: string; content: any }>;
    stream?: boolean;
  }, serverConfig?: ServerConfig): Promise<any> {
    const client = this.createClient('sora', serverConfig);
    const actualUrl = serverConfig?.url || this.getUrl('sora');
    console.log(`[WauleAPI] Sora ChatCompletions: model=${params.model}, url=${actualUrl}`);
    const response = await client.post('/v1/sora/chat/completions', params);
    return response.data;
  }

  /**
   * Future Sora API：创建角色
   * POST /future-sora/v1/characters
   */
  async futureSoraCreateCharacter(params: {
    url: string;
    timestamps?: string;
  }, serverConfig?: ServerConfig): Promise<any> {
    const client = this.createClient('sora', serverConfig);
    console.log(`[WauleAPI] Future Sora CreateCharacter: url=${params.url.substring(0, 50)}...`);
    const response = await client.post('/future-sora/v1/characters', params);
    return response.data;
  }

  /**
   * Midjourney 等待任务完成（长轮询）
   */
  async mjWaitTask(taskId: string, timeout: number = 300000, serverConfig?: ServerConfig): Promise<{
    taskId: string;
    status: string;
    imageUrl?: string;
    messageId?: string;
    messageHash?: string;
    buttons?: Array<{
      customId: string;
      label: string;
      emoji?: string;
    }>;
    failReason?: string;
  }> {
    const client = this.createClient('midjourney', serverConfig);
    console.log(`[WauleAPI] MJ WaitTask: taskId=${taskId}, timeout=${timeout}`);
    const response = await client.post(`/v1/midjourney/task/${taskId}/wait`, { timeout });
    return response.data;
  }
}

export const wauleApiClient = new WauleApiClient();

/**
 * 根据模型 ID 获取服务器配置
 * 用于从数据库查询模型关联的 WauleApiServer
 */
export async function getServerConfigByModelId(modelId: string): Promise<ServerConfig | undefined> {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  
  try {
    const model = await prisma.aIModel.findFirst({
      where: { modelId },
      include: { wauleApiServer: true },
    });
    
    if (model?.wauleApiServer) {
      return {
        url: model.wauleApiServer.url,
        authToken: model.wauleApiServer.authToken,
      };
    }
    
    // 如果模型没有指定服务器，尝试获取默认服务器
    const defaultServer = await prisma.wauleApiServer.findFirst({
      where: { isDefault: true, isActive: true },
    });
    
    if (defaultServer) {
      return {
        url: defaultServer.url,
        authToken: defaultServer.authToken,
      };
    }
    
    return undefined;
  } finally {
    await prisma.$disconnect();
  }
}
