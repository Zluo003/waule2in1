interface GenerateImageOptions {
    prompt: string;
    modelId: string;
    aspectRatio?: string;
    referenceImages?: string[];
    apiKey?: string;
    apiUrl?: string;
    n?: number;
}
export declare function generateImage(options: GenerateImageOptions): Promise<string>;
declare const _default: {
    generateImage: typeof generateImage;
};
export default _default;
//# sourceMappingURL=minimaxi.image.service.d.ts.map