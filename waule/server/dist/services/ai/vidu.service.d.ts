export interface ViduSubject {
    id: string;
    images: string[];
    voice_id?: string;
}
interface ViduImageToVideoOptions {
    images?: string[];
    subjects?: ViduSubject[];
    prompt?: string;
    model?: string;
    audio?: boolean;
    voice_id?: string;
    bgm?: boolean;
    is_rec?: boolean;
    duration?: number;
    seed?: number;
    resolution?: string;
    movement_amplitude?: string;
    payload?: string;
    off_peak?: boolean;
    watermark?: boolean;
    wm_position?: number;
    wm_url?: string;
    meta_data?: string;
    callback_url?: string;
    apiKey?: string;
    apiUrl?: string;
}
interface ViduCreation {
    id: string;
    url: string;
    cover_url: string;
    watermarked_url: string;
}
interface ViduTaskResponse {
    id?: string;
    task_id?: string;
    state: string;
    err_code?: string;
    credits?: number;
    payload?: string;
    bgm?: boolean;
    off_peak?: boolean;
    creations?: ViduCreation[];
    model?: string;
    prompt?: string;
    images?: string[];
    duration?: number;
    seed?: number;
    resolution?: string;
    movement_amplitude?: string;
    watermark?: boolean;
    created_at?: string;
    video_url?: string;
    watermarked_url?: string;
    error?: string;
}
/**
 * 图生视频
 */
export declare function imageToVideo(options: ViduImageToVideoOptions): Promise<string>;
/**
 * 查询任务状态（单次查询）
 */
export declare function queryTaskStatus(taskId: string, apiKey: string, apiUrl?: string): Promise<ViduTaskResponse>;
/**
 * 取消错峰任务
 */
export declare function cancelTask(taskId: string, apiKey: string, apiUrl?: string): Promise<void>;
/**
 * 文生视频 (text2video)
 */
export declare function textToVideo(options: {
    prompt: string;
    model?: string;
    style?: string;
    duration?: number;
    seed?: number;
    aspect_ratio?: string;
    resolution?: string;
    movement_amplitude?: string;
    bgm?: boolean;
    payload?: string;
    off_peak?: boolean;
    watermark?: boolean;
    wm_position?: number;
    wm_url?: string;
    meta_data?: string;
    callback_url?: string;
    apiKey?: string;
    apiUrl?: string;
}): Promise<{
    taskId: string;
    status: string;
}>;
/**
 * 智能超清 (upscale-new)
 */
export declare function upscaleVideo(options: {
    video_url?: string;
    video_creation_id?: string;
    upscale_resolution?: '1080p' | '2K' | '4K' | '8K';
    payload?: string;
    callback_url?: string;
    apiKey?: string;
    apiUrl?: string;
}): Promise<{
    taskId: string;
    status: string;
}>;
/**
 * 广告成片 API (根据官方文档)
 * 支持两种模式：
 * 1. 有 apiKey：直接调用 Vidu 官方 API
 * 2. 无 apiKey 但有 apiUrl：使用自定义服务器（waule-api 网关），不需要 Authorization
 */
export declare function createCommercialVideo(options: {
    images: string[];
    prompt: string;
    duration?: number;
    ratio?: '16:9' | '9:16' | '1:1';
    language?: 'zh' | 'en';
    apiKey?: string;
    apiUrl?: string;
}): Promise<{
    taskId: string;
    status: string;
}>;
export {};
//# sourceMappingURL=vidu.service.d.ts.map