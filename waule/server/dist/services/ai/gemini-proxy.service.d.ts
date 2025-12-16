interface GeminiImageGenerateOptions {
    prompt: string;
    modelId?: string;
    aspectRatio?: string;
    imageSize?: string;
    referenceImages?: string[];
    apiKey?: string;
    apiUrl?: string;
}
interface GeminiTextGenerateOptions {
    prompt: string;
    systemPrompt?: string;
    modelId?: string;
    temperature?: number;
    maxTokens?: number;
    documentFiles?: Array<{
        filePath: string;
        mimeType: string;
    }>;
    imageUrls?: string[];
    videoUrls?: string[];
    inlineImages?: Array<{
        mimeType: string;
        data: string;
    }>;
    apiKey?: string;
    apiUrl?: string;
}
/**
 * 生成图片（通过日本服务器，带重试机制）
 */
export declare const generateImage: (options: GeminiImageGenerateOptions) => Promise<string>;
/**
 * 生成文本（通过日本服务器，带重试机制）
 */
export declare const generateText: (options: GeminiTextGenerateOptions) => Promise<string>;
declare const _default: {
    generateImage: (options: GeminiImageGenerateOptions) => Promise<string>;
    generateText: (options: GeminiTextGenerateOptions) => Promise<string>;
};
export default _default;
//# sourceMappingURL=gemini-proxy.service.d.ts.map