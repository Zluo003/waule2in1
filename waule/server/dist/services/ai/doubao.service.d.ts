interface DoubaoImageGenerateOptions {
    prompt: string;
    modelId: string;
    aspectRatio?: string;
    referenceImages?: string[];
    apiKey?: string;
    apiUrl?: string;
    maxImages?: number;
}
/**
 * 豆包 SeedDream 图片生成
 * 返回值：单图生成返回单个 URL，组图生成返回 URL 数组
 */
export declare function generateImage(options: DoubaoImageGenerateOptions): Promise<string | string[]>;
interface DoubaoVideoGenerateOptions {
    prompt: string;
    modelId: string;
    ratio?: string;
    resolution?: string;
    generationType?: string;
    duration?: number;
    referenceImages?: string[];
    apiKey?: string;
    apiUrl?: string;
}
/**
 * 豆包 SeeDance 视频生成
 * 使用 Content Generation Tasks API
 */
export declare function generateVideo(options: DoubaoVideoGenerateOptions): Promise<string>;
/**
 * 豆包文本生成
 */
export declare function generateText(options: {
    prompt: string;
    systemPrompt?: string;
    modelId: string;
    temperature?: number;
    maxTokens?: number;
    imageUrls?: string[];
    videoUrls?: string[];
    apiKey?: string;
    apiUrl?: string;
}): Promise<string>;
export {};
//# sourceMappingURL=doubao.service.d.ts.map