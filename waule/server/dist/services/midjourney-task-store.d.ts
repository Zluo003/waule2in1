/**
 * Midjourney 任务存储模块
 * 使用 Redis 实现跨进程共享的任务状态存储
 * 支持 PM2 集群模式
 */
import { EventEmitter } from 'events';
export interface TaskStatus {
    taskId: string;
    userId: string;
    nodeId?: string;
    prompt?: string;
    sourceMessageId?: string;
    status: 'SUBMITTED' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE';
    messageId?: string;
    messageHash?: string;
    imageUrl?: string;
    progress?: string;
    buttons?: Array<{
        customId: string;
        emoji?: string;
        label: string;
        type: number;
        style: number;
    }>;
    failReason?: string;
    timestamp: number;
}
export interface TaskUpdateEvent {
    type: 'create' | 'update' | 'delete';
    taskId: string;
    task?: TaskStatus;
}
/**
 * Midjourney 任务存储类
 * 提供跨进程共享的任务状态管理
 */
declare class MidjourneyTaskStore extends EventEmitter {
    private subClient;
    private pubClient;
    private isInitialized;
    private initPromise;
    private readonly TASK_UPDATE_CHANNEL;
    /**
     * 初始化 Pub/Sub 连接
     */
    initialize(): Promise<void>;
    private _doInitialize;
    /**
     * 广播任务更新事件
     */
    private publishTaskUpdate;
    /**
     * 创建任务
     */
    createTask(task: TaskStatus): Promise<void>;
    /**
     * 获取任务
     */
    getTask(taskId: string): Promise<TaskStatus | null>;
    /**
     * 更新任务
     * 🔓 任务完成时自动释放用户锁
     */
    updateTask(taskId: string, updates: Partial<TaskStatus>): Promise<TaskStatus | null>;
    /**
     * 删除任务
     */
    deleteTask(taskId: string): Promise<void>;
    /**
     * 检查用户是否有活跃任务
     */
    hasActiveTask(userId: string): Promise<boolean>;
    /**
     * 🔒 原子性地尝试获取用户锁并创建任务
     * 解决多实例并发场景下的竞态条件问题
     * @returns { success: true, taskId } 成功获取锁并创建任务
     * @returns { success: false, reason } 获取锁失败的原因
     */
    tryAcquireLockAndCreateTask(task: TaskStatus): Promise<{
        success: boolean;
        taskId?: string;
        reason?: string;
    }>;
    /**
     * 🔓 释放用户锁
     * 使用 Lua 脚本确保只释放自己持有的锁
     */
    releaseUserLock(userId: string, lockValue?: string): Promise<void>;
    /**
     * 🔓 任务完成时释放用户锁
     * 在任务成功或失败时调用
     */
    releaseUserLockOnComplete(userId: string): Promise<void>;
    /**
     * 获取用户的活跃任务
     */
    getActiveTask(userId: string): Promise<TaskStatus | null>;
    /**
     * 设置消息ID到任务ID的映射
     */
    setMessageToTaskMapping(messageId: string, taskId: string): Promise<void>;
    /**
     * 通过消息ID获取任务ID
     */
    getTaskIdByMessageId(messageId: string): Promise<string | null>;
    /**
     * 获取所有待处理的任务
     * 注意：这个方法性能较差，仅用于调试
     */
    getPendingTasks(): Promise<TaskStatus[]>;
    /**
     * 通过 prompt 或 sourceMessageId 查找匹配的待处理任务
     */
    findPendingTaskByPromptOrSource(prompt?: string, sourceMessageId?: string): Promise<TaskStatus | null>;
    /**
     * 清理过期任务
     * Redis TTL 会自动清理，此方法用于主动清理
     */
    cleanupExpiredTasks(): Promise<number>;
    /**
     * 关闭连接
     */
    close(): Promise<void>;
}
export declare const mjTaskStore: MidjourneyTaskStore;
export {};
//# sourceMappingURL=midjourney-task-store.d.ts.map