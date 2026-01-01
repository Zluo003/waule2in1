type WauleApiConfig = {
    baseUrl: string;
    apiSecret?: string;
};
/**
 * 判断是否是 waule-api 地址
 * 规则：apiUrl 非空且不包含已知的直连服务商地址
 * 如果是直连地址（如 Google、Doubao、Aliyun 等），返回 false
 * 否则认为是 waule-api 网关地址
 */
export declare function isWauleApiUrl(url: string): boolean;
export declare function resolveWauleApiConfig(model?: any): WauleApiConfig | null;
export declare class WauleApiClient {
    private cfg;
    constructor(cfg: WauleApiConfig);
    private createClient;
    generateImage(params: {
        model: string;
        prompt: string;
        size?: string;
        image_size?: string;
        n?: number;
        reference_images?: string[];
        use_intl?: boolean;
        max_images?: number;
    }): Promise<{
        created: number;
        data: Array<{
            url: string;
            revised_prompt?: string;
        }>;
    }>;
    generateVideo(params: {
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
        subjects?: Array<{
            id: string;
            images: string[];
            voice_id?: string;
        }>;
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
    }): Promise<{
        created: number;
        data: Array<{
            url: string;
            duration?: number;
        }>;
    }>;
    chatCompletions(params: {
        model: string;
        messages: Array<{
            role: string;
            content: any;
        }>;
        temperature?: number;
        max_tokens?: number;
    }): Promise<any>;
    /**
     * Sora 专用：waule-api 的 /v1/sora/chat/completions
     * waule-api 服务端已配置 SORA_API_KEY，无需客户端传递
     */
    soraChatCompletions(params: any): Promise<any>;
    /**
     * Sora API：创建角色
     * POST /v1/sora/characters (ai-gateway)
     */
    futureSoraCreateCharacter(params: {
        url: string;
        timestamps?: string;
    }): Promise<any>;
    /**
     * Future Sora API：创建视频
     * POST /future-sora/v1/videos
     */
    futureSoraCreateVideo(params: {
        model: string;
        prompt: string;
        seconds?: number;
        orientation?: string;
        imageUrl?: string;
    }): Promise<any>;
    /**
     * Future Sora API：查询视频
     * GET /future-sora/v1/videos/:taskId
     */
    futureSoraGetVideo(taskId: string): Promise<any>;
    /**
     * Midjourney Imagine（文生图）
     */
    midjourneyImagine(params: {
        prompt: string;
        userId?: string;
    }): Promise<{
        success: boolean;
        taskId: string;
        message?: string;
    }>;
    /**
     * Midjourney Action（按钮操作：Upscale/Variation 等）
     */
    midjourneyAction(params: {
        messageId: string;
        customId: string;
        userId?: string;
    }): Promise<{
        success: boolean;
        taskId: string;
        message?: string;
    }>;
    /**
     * Midjourney 查询任务状态
     */
    midjourneyGetTask(taskId: string): Promise<{
        taskId: string;
        status: string;
        progress?: number;
        imageUrl?: string;
        messageId?: string;
        messageHash?: string;
        buttons?: Array<{
            customId: string;
            emoji?: string;
            label?: string;
        }>;
        failReason?: string;
    }>;
    /**
     * Midjourney 等待任务完成（长轮询）
     */
    midjourneyWaitTask(taskId: string, timeout?: number): Promise<{
        taskId: string;
        status: string;
        progress?: number;
        imageUrl?: string;
        messageId?: string;
        messageHash?: string;
        buttons?: Array<{
            customId: string;
            emoji?: string;
            label?: string;
        }>;
        failReason?: string;
    }>;
    /**
     * Midjourney 上传参考图
     */
    midjourneyUploadReference(params: {
        imageUrl?: string;
        base64?: string;
        filename?: string;
    }): Promise<{
        discordUrl: string;
    }>;
    /**
     * 广告成片（Vidu ad-one-click）
     * POST /v1/videos/commercial
     */
    commercialVideo(params: {
        images: string[];
        prompt: string;
        duration?: number;
        ratio?: '16:9' | '9:16' | '1:1';
        language?: 'zh' | 'en';
    }): Promise<{
        created: number;
        data: Array<{
            url: string;
        }>;
    }>;
}
export declare function getWauleApiClient(model?: any): WauleApiClient | null;
/**
 * 获取 waule-api 客户端（不依赖 model，仅读取环境变量）
 */
export declare function getGlobalWauleApiClient(): WauleApiClient | null;
export {};
//# sourceMappingURL=waule-api.client.d.ts.map