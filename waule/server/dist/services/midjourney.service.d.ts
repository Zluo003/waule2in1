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
 * Midjourney服务
 * 支持两种模式：
 * 1. proxy模式：通过Midjourney Proxy服务
 * 2. discord模式：直接通过Discord API逆向
 */
declare class MidjourneyService {
    private proxyClient;
    private discordService;
    private mode;
    private discordInitPromise;
    private enableDiscord;
    constructor();
    /**
     * 检查是否为队列模式（Discord 禁用时使用队列转发）
     */
    isQueueMode(): boolean;
    /**
     * 下载远程图片到服务器本地，返回本地 URL
     */
    private downloadToLocal;
    /**
     * 直接从远程 URL 下载图片并上传到 OSS
     * 使用传输加速，约 3 秒完成
     */
    private downloadAndUploadToOSS;
    /**
     * 下载远程图片并保存到本地，返回本地 URL（用于 Proxy 模式）
     */
    private saveRemoteImageToLocal;
    /**
     * 确保Discord服务已经初始化
     * 支持等待重试，用于服务器刚重启时 Discord 还在连接中的情况
     */
    private ensureDiscordReady;
    /**
     * 构造代理 Agent（HTTPS/HTTP）
     */
    private getProxyAgent;
    /**
     * 初始化Proxy客户端
     */
    private initProxyClient;
    /**
     * 初始化Discord服务
     */
    private initDiscordService;
    /**
     * 提交 Imagine 任务（文生图）
     */
    imagine(params: ImagineRequest): Promise<TaskResponse>;
    /**
     * 通过Proxy提交Imagine任务
     */
    private imagineViaProxy;
    /**
     * 通过Discord提交Imagine任务
     */
    private imagineViaDiscord;
    /**
     * 获取高分辨率图片URL
     */
    private getHighResImageUrl;
    /**
     * 查询任务状态
     */
    fetch(taskId: string): Promise<TaskResult>;
    /**
     * 通过Proxy查询任务状态
     */
    private fetchViaProxy;
    /**
     * 通过Discord查询任务状态
     */
    private fetchViaDiscord;
    /**
     * 异步上传图片到 OSS（不阻塞主流程）
     */
    private asyncUploadToOSS;
    /**
     * 转换Discord任务状态为标准TaskResult格式
     */
    private convertDiscordTaskToTaskResult;
    /**
     * 生成按钮数据（基于Discord消息ID和hash）
     */
    private generateButtons;
    /**
     * 轮询任务直到完成
     */
    pollTask(taskId: string): Promise<TaskResult>;
    /**
     * 执行动作（Upscale、Variation 等）
     */
    action(params: ActionRequest): Promise<TaskResponse>;
    /**
     * 通过Proxy执行动作
     */
    private actionViaProxy;
    /**
     * 通过Discord执行动作
     */
    private actionViaDiscord;
    /**
     * Blend（图片混合）
     */
    blend(base64Array: string[], notifyHook?: string): Promise<TaskResponse>;
    /**
     * Describe（图生文）
     */
    describe(base64: string, notifyHook?: string): Promise<TaskResponse>;
    /**
     * 获取任务列表
     */
    listTasks(ids: string[]): Promise<TaskResult[]>;
    /**
     * 上传参考图到 Discord（用于 V7 Omni-Reference）
     * @param imageBuffer 图片 Buffer
     * @param filename 文件名
     * @returns Discord CDN URL
     */
    uploadReferenceImage(imageBuffer: Buffer, filename: string): Promise<string>;
    private sleep;
    /**
     * 启动 Redis 队列消费者（仅在 enableDiscord=true 的实例上运行）
     */
    private startQueueConsumer;
    /**
     * 通过队列提交任务（当 enableDiscord=false 时使用）
     */
    private submitViaQueue;
}
declare const _default: MidjourneyService;
export default _default;
//# sourceMappingURL=midjourney.service.d.ts.map