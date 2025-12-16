interface GenerateVideoOptions {
    prompt: string;
    modelId: string;
    aspectRatio?: string;
    resolution?: string;
    duration?: number;
    referenceImages?: string[];
    apiKey?: string;
    apiUrl?: string;
    generationType?: string;
    callbackUrl?: string;
    genTaskId?: string;
}
export declare function downloadVideoByFileId(baseUrl: string, apiKey: string, fileId: string): Promise<string>;
export declare function downloadVideoToOss(baseUrl: string, apiKey: string, fileId: string): Promise<string>;
export declare function queryVideoTaskStatus(baseUrl: string, apiKey: string, taskId: string): Promise<any>;
export declare function generateVideo(options: GenerateVideoOptions): Promise<string>;
declare const _default: {
    generateVideo: typeof generateVideo;
};
export default _default;
//# sourceMappingURL=minimaxi.service.d.ts.map