/**
 * Gemini AI 服务
 */
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
 * 使用 Gemini 2.5 Flash Image 生成图片
 */
export declare const generateImage: (options: GeminiImageGenerateOptions) => Promise<string>;
/**
 * 使用 Gemini 生成文本
 */
export declare const generateText: (options: GeminiTextGenerateOptions) => Promise<string>;
declare const _default: {
    generateImage: (options: GeminiImageGenerateOptions) => Promise<string>;
    generateText: (options: GeminiTextGenerateOptions) => Promise<string>;
};
export default _default;
//# sourceMappingURL=gemini.service.d.ts.map