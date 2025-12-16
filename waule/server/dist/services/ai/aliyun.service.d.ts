interface QwenImageEditOptions {
    prompt: string;
    modelId: string;
    aspectRatio?: string;
    referenceImages?: string[];
    apiKey?: string;
    apiUrl?: string;
}
export declare function generateImage(options: QwenImageEditOptions): Promise<string>;
declare const _default: {
    generateImage: typeof generateImage;
};
export default _default;
//# sourceMappingURL=aliyun.service.d.ts.map