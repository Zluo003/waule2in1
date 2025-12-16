import { EventEmitter } from 'events';
import { type TaskStatus } from './midjourney-task-store';
export type { TaskStatus };
interface DiscordConfig {
    userToken: string;
    guildId: string;
    channelId: string;
}
declare class DiscordReverseService extends EventEmitter {
    private config;
    private httpClient;
    private ws;
    private heartbeatInterval;
    private lockRenewInterval;
    private sessionId;
    private sequence;
    private isReady;
    private shouldReconnect;
    private holdsLock;
    private lockValue;
    private cmdSubClient;
    private cmdPubClient;
    constructor(config: DiscordConfig);
    /**
     * 🚀 集群模式：尝试获取分布式锁
     * 只有获得锁的进程才能连接 Discord WebSocket
     */
    private tryAcquireLock;
    /**
     * 🚀 锁续期（防止锁过期导致其他进程抢占）
     */
    private startLockRenewal;
    /**
     * 🚀 释放分布式锁
     */
    private releaseLock;
    /**
     * 🚀 初始化命令订阅（非主进程用于接收命令结果）
     */
    private initCommandSubscription;
    /**
     * 🚀 初始化命令处理（主进程用于处理来自其他进程的命令）
     */
    private initCommandHandler;
    /**
     * 初始化并连接到Discord Gateway
     * 🚀 集群模式：只有获得锁的进程才会真正连接
     */
    connect(): Promise<void>;
    /**
     * 处理Gateway消息
     */
    private handleMessage;
    /**
     * 处理Hello事件
     */
    private handleHello;
    /**
     * 开始心跳
     */
    private startHeartbeat;
    /**
     * 发送Identify
     */
    private identify;
    /**
     * 处理Dispatch事件
     */
    private handleDispatch;
    /**
     * 处理消息创建事件
     * 🚀 集群模式：使用 Redis 存储任务状态
     */
    private handleMessageCreate;
    /**
     * 处理消息更新事件
     * 🚀 集群模式：使用 Redis 存储任务状态
     */
    private handleMessageUpdate;
    /**
     * 解析Discord消息组件中的按钮
     */
    private parseButtons;
    /**
     * 检查用户是否有活跃任务
     * 🚀 集群模式：使用 Redis 存储
     */
    hasActiveTask(userId: string): Promise<boolean>;
    /**
     * 获取用户的活跃任务
     * 🚀 集群模式：使用 Redis 存储
     */
    getActiveTask(userId: string): Promise<TaskStatus | null>;
    /**
     * 发送Imagine命令
     * 🚀 集群模式：如果不是主进程，通过 Redis 转发到主进程
     */
    imagine(prompt: string, userId: string, nodeId?: string, nonce?: string): Promise<string>;
    /**
     * 🔄 带重试的 HTTP 请求发送
     * 处理 ECONNRESET、ETIMEDOUT 等临时性网络错误
     */
    private sendWithRetry;
    /**
     * 🚀 实际执行 Imagine 命令（仅主进程调用）
     * 🔒 使用原子锁防止多实例并发提交
     */
    private _doImagine;
    /**
     * 执行按钮操作（Upscale、Variation、Reroll）
     * 🚀 集群模式：如果不是主进程，通过 Redis 转发到主进程
     */
    action(messageId: string, customId: string, userId: string, nodeId?: string): Promise<string>;
    /**
     * 🚀 实际执行 Action 命令（仅主进程调用）
     * 🔒 使用原子锁防止多实例并发提交
     */
    private _doAction;
    /**
     * 🚀 转发命令到主进程（通过 Redis Pub/Sub）
     */
    private _forwardCommand;
    /**
     * 更新任务的图片URL（用于OSS上传完成后更新）
     * 🚀 集群模式：使用 Redis 存储
     */
    updateTaskImageUrl(taskId: string, imageUrl: string): Promise<void>;
    /**
     * 更新数据库中工作流节点的图片URL
     */
    private updateWorkflowNodeImageUrl;
    /**
     * 获取任务状态
     * 🚀 集群模式：使用 Redis 存储
     */
    getTask(taskId: string): Promise<TaskStatus | null>;
    /**
     * 清理已完成的任务
     * 🚀 集群模式：Redis TTL 自动清理，此方法保留兼容性
     */
    cleanupCompletedTask(taskId: string): Promise<void>;
    /**
     * 等待任务完成
     * 🚀 集群模式：使用 Redis 存储
     */
    waitForTask(taskId: string, timeoutMs?: number): Promise<TaskStatus>;
    /**
     * 上传图片到 Discord 获取 CDN URL
     * @param imageBuffer 图片 Buffer
     * @param filename 文件名
     * @returns Discord CDN URL
     */
    uploadImageToDiscord(imageBuffer: Buffer, filename: string): Promise<string>;
    /**
     * 根据文件名获取 Content-Type
     */
    private getContentType;
    /**
     * 断开连接
     * 🚀 集群模式：释放锁和关闭订阅
     */
    disconnect(): Promise<void>;
}
export declare function createDiscordService(config: DiscordConfig): DiscordReverseService;
export declare function getDiscordService(): DiscordReverseService | null;
export { DiscordReverseService };
export type { DiscordConfig };
//# sourceMappingURL=discord-reverse.service.d.ts.map