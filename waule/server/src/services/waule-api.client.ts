import axios, { AxiosInstance } from 'axios';

type WauleApiConfig = {
  baseUrl: string;
  apiSecret?: string;
};

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * 判断是否是 waule-api 地址
 * 规则：apiUrl 非空且不包含已知的直连服务商地址
 * 如果是直连地址（如 Google、Doubao、Aliyun 等），返回 false
 * 否则认为是 waule-api 网关地址
 */
export function isWauleApiUrl(url: string): boolean {
  if (!url) return false;
  
  // 已知的直连服务商地址（不走 waule-api）
  const directProviderPatterns = [
    'googleapis.com',
    'volces.com',       // Doubao
    'dashscope.aliyuncs.com',  // Aliyun
    'api.vidu.cn',      // Vidu
    'sora.chatgpt.com', // Sora 直连
    'api.openai.com',
    'api.anthropic.com',
  ];
  
  // 如果包含直连服务商地址，不走 waule-api
  for (const pattern of directProviderPatterns) {
    if (url.includes(pattern)) return false;
  }
  
  // 其他地址都认为是 waule-api（如 localhost、自定义域名等）
  return true;
}

function getConfigFromModel(model: any): Partial<WauleApiConfig> {
  // 优先从 model.apiUrl 读取（admin 页面配置的接口地址）
  if (model && typeof model.apiUrl === 'string' && model.apiUrl && isWauleApiUrl(model.apiUrl)) {
    // 提取 base URL（去掉路径部分）
    try {
      const url = new URL(model.apiUrl);
      return { baseUrl: `${url.protocol}//${url.host}` };
    } catch {
      // 如果解析失败，直接使用
      return { baseUrl: model.apiUrl };
    }
  }

  // 兼容旧的 config.wauleApi 配置
  const cfg = (model && typeof model.config === 'object' && model.config) ? model.config : {};
  const wauleApi = (cfg as any).wauleApi;
  if (!wauleApi || typeof wauleApi !== 'object') return {};

  const baseUrl = typeof (wauleApi as any).url === 'string' ? (wauleApi as any).url : undefined;
  const apiSecret = typeof (wauleApi as any).secret === 'string' ? (wauleApi as any).secret : undefined;

  return {
    ...(baseUrl ? { baseUrl } : {}),
    ...(apiSecret ? { apiSecret } : {}),
  };
}

export function resolveWauleApiConfig(model?: any): WauleApiConfig | null {
  const fromModel = getConfigFromModel(model);
  const baseUrl = fromModel.baseUrl || process.env.WAULEAPI_URL;
  if (!baseUrl) return null;

  const apiSecret = fromModel.apiSecret || process.env.WAULEAPI_SECRET || undefined;

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    apiSecret,
  };
}

export class WauleApiClient {
  private cfg: WauleApiConfig;

  constructor(cfg: WauleApiConfig) {
    this.cfg = { ...cfg, baseUrl: normalizeBaseUrl(cfg.baseUrl) };
  }

  private createClient(withAuth: boolean): AxiosInstance {
    return axios.create({
      baseURL: this.cfg.baseUrl,
      timeout: 600000,
      headers: {
        'Content-Type': 'application/json',
        ...(withAuth && this.cfg.apiSecret ? { Authorization: `Bearer ${this.cfg.apiSecret}` } : {}),
      },
    });
  }

  async generateImage(params: {
    model: string;
    prompt: string;
    size?: string;
    image_size?: string; // 图片分辨率（2K/4K，仅用于 Gemini 3 Pro Image）
    n?: number;
    reference_images?: string[];
    use_intl?: boolean;
    max_images?: number;
  }): Promise<{ created: number; data: Array<{ url: string; revised_prompt?: string }> }> {
    const client = this.createClient(true);
    const resp = await client.post('/v1/images/generations', params);
    return resp.data;
  }

  async generateVideo(params: {
    model: string;
    prompt?: string;
    duration?: number;
    aspect_ratio?: string;
    resolution?: string;
    reference_images?: string[];
    image?: string;
    use_intl?: boolean;
    replace_image_url?: string;
    replace_video_url?: string;
    mode?: string;
    subjects?: Array<{ id: string; images: string[]; voice_id?: string }>;
    audio?: boolean;
    voice_id?: string;
    bgm?: boolean;
    movement_amplitude?: string;
    generation_type?: string;
    audio_url?: string;
    video_extension?: boolean;
    style?: number;
    video_fps?: number;
    min_len?: number;
  }): Promise<{ created: number; data: Array<{ url: string; duration?: number }> }> {
    const client = this.createClient(true);
    const resp = await client.post('/v1/videos/generations', params);
    return resp.data;
  }

  async chatCompletions(params: {
    model: string;
    messages: Array<{ role: string; content: any }>;
    temperature?: number;
    max_tokens?: number;
  }): Promise<any> {
    const client = this.createClient(true);
    const resp = await client.post('/v1/chat/completions', params);
    return resp.data;
  }

  /**
   * Sora 专用：waule-api 的 /v1/sora/chat/completions
   * waule-api 服务端已配置 SORA_API_KEY，无需客户端传递
   */
  async soraChatCompletions(params: any): Promise<any> {
    const client = this.createClient(true);
    const resp = await client.post('/v1/sora/chat/completions', params);
    return resp.data;
  }

  /**
   * Future Sora API：创建角色
   * POST /future-sora/v1/characters
   */
  async futureSoraCreateCharacter(params: {
    url: string;
    timestamps?: string;
  }): Promise<any> {
    const client = this.createClient(true);
    const resp = await client.post('/future-sora/v1/characters', params);
    return resp.data;
  }

  /**
   * Future Sora API：创建视频
   * POST /future-sora/v1/videos
   */
  async futureSoraCreateVideo(params: {
    model: string;
    prompt: string;
    seconds?: number;
    orientation?: string;
    imageUrl?: string; // 参考图片URL
  }): Promise<any> {
    const client = this.createClient(true);
    const resp = await client.post('/future-sora/v1/videos', params);
    return resp.data;
  }

  /**
   * Future Sora API：查询视频
   * GET /future-sora/v1/videos/:taskId
   */
  async futureSoraGetVideo(taskId: string): Promise<any> {
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
  async midjourneyImagine(params: {
    prompt: string;
    userId?: string;
  }): Promise<{ success: boolean; taskId: string; message?: string }> {
    const client = this.createClient(true);
    const resp = await client.post('/v1/midjourney/imagine', params);
    return resp.data;
  }

  /**
   * Midjourney Action（按钮操作：Upscale/Variation 等）
   */
  async midjourneyAction(params: {
    messageId: string;
    customId: string;
    userId?: string;
  }): Promise<{ success: boolean; taskId: string; message?: string }> {
    const client = this.createClient(true);
    const resp = await client.post('/v1/midjourney/action', params);
    return resp.data;
  }

  /**
   * Midjourney 查询任务状态
   */
  async midjourneyGetTask(taskId: string): Promise<{
    taskId: string;
    status: string;
    progress?: number;
    imageUrl?: string;
    messageId?: string;
    messageHash?: string;
    buttons?: Array<{ customId: string; emoji?: string; label?: string }>;
    failReason?: string;
  }> {
    const client = this.createClient(true);
    const resp = await client.get(`/v1/midjourney/task/${taskId}`);
    return resp.data;
  }

  /**
   * Midjourney 等待任务完成（长轮询）
   */
  async midjourneyWaitTask(taskId: string, timeout?: number): Promise<{
    taskId: string;
    status: string;
    progress?: number;
    imageUrl?: string;
    messageId?: string;
    messageHash?: string;
    buttons?: Array<{ customId: string; emoji?: string; label?: string }>;
    failReason?: string;
  }> {
    const client = this.createClient(true);
    const resp = await client.post(`/v1/midjourney/task/${taskId}/wait`, { timeout });
    return resp.data;
  }
}

export function getWauleApiClient(model?: any): WauleApiClient | null {
  const cfg = resolveWauleApiConfig(model);
  if (!cfg) return null;
  return new WauleApiClient(cfg);
}

/**
 * 获取 waule-api 客户端（不依赖 model，仅读取环境变量）
 */
export function getGlobalWauleApiClient(): WauleApiClient | null {
  const baseUrl = process.env.WAULEAPI_URL;
  if (!baseUrl) return null;
  const apiSecret = process.env.WAULEAPI_SECRET || undefined;
  return new WauleApiClient({ baseUrl, apiSecret });
}
