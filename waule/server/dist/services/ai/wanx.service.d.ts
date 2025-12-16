interface WanxVideoGenerateOptions {
    prompt: string;
    modelId: string;
    firstFrameImage?: string;
    duration?: number;
    resolution?: string;
    apiKey?: string;
    apiUrl?: string;
    replaceImageUrl?: string;
    replaceVideoUrl?: string;
    mode?: 'wan-std' | 'wan-pro';
}
/**
 * 通义万相 - 首帧生视频
 * API文档: https://bailian.console.aliyun.com/?tab=api#/api/?type=model&url=2867393
 */
export declare function generateVideoFromFirstFrame(options: WanxVideoGenerateOptions): Promise<string>;
/**
 * 通义万相 - 文生视频（无首帧）
 */
export declare function generateVideoFromText(options: WanxVideoGenerateOptions): Promise<string>;
interface VideoRetalkOptions {
    videoUrl: string;
    audioUrl: string;
    refImageUrl?: string;
    apiKey?: string;
    apiUrl?: string;
    videoExtension?: boolean;
}
export declare function generateVideoRetalk(options: VideoRetalkOptions): Promise<string>;
interface VideoStylizeOptions {
    videoUrl: string;
    style?: number;
    videoFps?: number;
    minLen?: number;
    apiKey?: string;
    apiUrl?: string;
}
export declare function generateVideoStylize(options: VideoStylizeOptions): Promise<string>;
export {};
//# sourceMappingURL=wanx.service.d.ts.map