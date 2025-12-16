type WauleApiConfig = {
    baseUrl: string;
    apiSecret?: string;
};
export declare function resolveWauleApiConfig(model?: any): WauleApiConfig | null;
export declare class WauleApiClient {
    private cfg;
    constructor(cfg: WauleApiConfig);
    private createClient;
    generateImage(params: {
        model: string;
        prompt: string;
        size?: string;
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
     * Sora 专用：waule-api 的 /v1/sora/chat/completions 不使用网关 API_SECRET，而是透传 Authorization 给 sora2api
     */
    soraChatCompletions(params: any, soraApiKey: string): Promise<any>;
}
export declare function getWauleApiClient(model?: any): WauleApiClient | null;
export {};
//# sourceMappingURL=waule-api.client.d.ts.map