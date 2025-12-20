import { MidjourneyTaskStatus } from '../config/midjourney.config';
interface ImagineRequest {
    prompt: string;
    userId?: string;
    base64Array?: string[];
    notifyHook?: string;
    nodeId?: string;
}
interface TaskResponse {
    code: number;
    description: string;
    result?: string;
    properties?: Record<string, unknown>;
}
interface TaskResult {
    id: string;
    action: string;
    status: MidjourneyTaskStatus;
    prompt?: string;
    promptEn?: string;
    description?: string;
    submitTime?: number;
    startTime?: number;
    finishTime?: number;
    progress?: string;
    imageUrl?: string;
    failReason?: string;
    properties?: {
        messageId?: string;
        messageHash?: string;
        finalPrompt?: string;
        [key: string]: any;
    };
    buttons?: Array<{
        customId: string;
        emoji: string;
        label: string;
        type: number;
        style: number;
    }>;
}
interface ActionRequest {
    taskId: string;
    customId: string;
    userId?: string;
    notifyHook?: string;
    messageId?: string;
    messageHash?: string;
    nodeId?: string;
}
/**
 * Midjourney服务（仅 waule-api 模式）
 */
declare class MidjourneyService {
    private wauleApiClient;
    constructor();
    /**
     * 提交 Imagine 任务（文生图）
     */
    imagine(params: ImagineRequest): Promise<TaskResponse>;
    /**
     * 查询任务状态
     */
    fetch(taskId: string): Promise<TaskResult>;
    /**
     * 轮询任务直到完成
     */
    pollTask(taskId: string): Promise<TaskResult>;
    /**
     * 执行动作（Upscale、Variation 等）
     */
    action(params: ActionRequest): Promise<TaskResponse>;
    /**
     * Blend（图片混合）- 暂不支持
     */
    blend(_base64Array: string[], _notifyHook?: string): Promise<TaskResponse>;
    /**
     * Describe（图生文）- 暂不支持
     */
    describe(_base64: string, _notifyHook?: string): Promise<TaskResponse>;
    /**
     * 上传参考图
     */
    uploadReferenceImage(_imageBuffer: Buffer, _imageName: string): Promise<string>;
}
export declare function getMidjourneyService(): MidjourneyService;
declare const _default: {
    getMidjourneyService: typeof getMidjourneyService;
};
export default _default;
//# sourceMappingURL=midjourney.service.d.ts.map