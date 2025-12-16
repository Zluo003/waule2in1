/**
 * 🚀 AI 任务队列与并发控制
 * 控制同时执行的 AI 任务数量，避免资源耗尽
 */
declare class TaskQueue {
    private maxConcurrent;
    private maxQueueSize;
    private taskTimeout;
    private queue;
    private running;
    private userTaskCount;
    private stats;
    constructor(options?: {
        maxConcurrent?: number;
        maxQueueSize?: number;
        taskTimeout?: number;
    });
    /**
     * 提交任务到队列
     */
    submit<T>(taskId: string, userId: string, type: 'IMAGE' | 'VIDEO' | 'TEXT', execute: () => Promise<T>, priority?: number): Promise<T>;
    /**
     * 按优先级插入队列
     */
    private insertByPriority;
    /**
     * 处理下一个任务
     */
    private processNext;
    /**
     * 处理超时
     */
    private handleTimeout;
    /**
     * 取消任务（从队列中移除）
     */
    cancel(taskId: string): boolean;
    /**
     * 获取队列状态
     */
    getStatus(): {
        queueLength: number;
        runningCount: number;
        maxConcurrent: number;
        stats: {
            totalProcessed: number;
            totalFailed: number;
            totalTimeout: number;
        };
    };
    /**
     * 获取用户的任务数量
     */
    getUserTaskCount(userId: string): number;
}
export declare const imageTaskQueue: TaskQueue;
export declare const videoTaskQueue: TaskQueue;
export declare const textTaskQueue: TaskQueue;
export default TaskQueue;
//# sourceMappingURL=taskQueue.d.ts.map