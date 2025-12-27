import { TaskType } from '@prisma/client';
interface CreateTaskParams {
    userId: string;
    type: TaskType;
    modelId: string;
    model: any;
    prompt: string;
    ratio?: string;
    imageSize?: string;
    referenceImages?: string[];
    roleIds?: string[];
    subjects?: Array<{
        name: string;
        images: string[];
    }>;
    generationType?: string;
    sourceNodeId?: string;
    maxImages?: number;
    metadata?: any;
}
/**
 * 任务处理服务
 * 负责创建、查询和处理异步生成任务
 */
declare class TaskService {
    /**
     * 创建新任务
     */
    createTask(params: CreateTaskParams): Promise<{
        isFreeUsage: boolean;
        freeUsageRemaining: number;
        creditsCharged: number;
        type: import(".prisma/client").$Enums.TaskType;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        storageExpiresAt: Date | null;
        status: import(".prisma/client").$Enums.TaskStatus;
        modelId: string;
        prompt: string;
        referenceImages: import("@prisma/client/runtime/library").JsonValue | null;
        ratio: string | null;
        generationType: string | null;
        progress: number;
        resultUrl: string | null;
        errorMessage: string | null;
        previewNodeData: import("@prisma/client/runtime/library").JsonValue | null;
        sourceNodeId: string | null;
        previewNodeCreated: boolean;
        completedAt: Date | null;
        externalTaskId: string | null;
    }>;
    /**
     * 查询任务状态
     */
    getTask(taskId: string): Promise<{
        type: import(".prisma/client").$Enums.TaskType;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        storageExpiresAt: Date | null;
        status: import(".prisma/client").$Enums.TaskStatus;
        modelId: string;
        prompt: string;
        referenceImages: import("@prisma/client/runtime/library").JsonValue | null;
        ratio: string | null;
        generationType: string | null;
        progress: number;
        resultUrl: string | null;
        errorMessage: string | null;
        previewNodeData: import("@prisma/client/runtime/library").JsonValue | null;
        sourceNodeId: string | null;
        previewNodeCreated: boolean;
        completedAt: Date | null;
        externalTaskId: string | null;
    }>;
    /**
     * 查询用户的所有任务
     * 🚀 优化：排除 referenceImages 字段（最大 13MB）
     */
    getUserTasks(userId: string, limit?: number): Promise<{
        type: import(".prisma/client").$Enums.TaskType;
        id: string;
        createdAt: Date;
        status: import(".prisma/client").$Enums.TaskStatus;
        prompt: string;
        progress: number;
        resultUrl: string | null;
        errorMessage: string | null;
        completedAt: Date | null;
    }[]>;
    /**
     * 处理任务（异步执行生成）
     */
    private processTask;
    /**
     * 处理分镜脚本任务：调用文本模型，解析JSON，保存到Episode.scriptJson
     * 5分钟超时
     */
    private processStoryboardTask;
    /**
     * 处理图片生成任务
     */
    private processImageTask;
    /**
     * 处理图片编辑任务（使用 Gemini 两阶段处理）
     */
    private processImageEditingTask;
    /**
     * 处理视频生成任务
     */
    private processVideoTask;
    /**
     * 启动模拟进度更新（用于不返回进度的 API，如 Sora）
     * @param taskId 任务 ID
     * @param start 起始进度（%）
     * @param end 结束进度（%）
     * @param intervalMs 更新间隔（毫秒）
     * @returns 定时器引用
     */
    private startMockProgress;
    /**
     * 标记任务失败并退还积分（如果有扣费）
     */
    private markTaskAsFailed;
    /**
     * 异步转存视频到存储（后台执行，不阻塞任务完成）
     * @param taskId 任务ID
     * @param originalUrl 原始视频URL
     */
    private asyncTransferToOss;
    /**
     * 清理僵尸任务（超过指定时间未完成的 PENDING/PROCESSING 任务）
     * @param thresholdMinutes 超时阈值（分钟），默认 30 分钟
     */
    cleanupZombieTasks(thresholdMinutes?: number): Promise<number>;
    /**
     * 启动僵尸任务定时清理（仅在主进程执行）
     * @param intervalMinutes 清理间隔（分钟），默认 5 分钟
     * @param thresholdMinutes 超时阈值（分钟），默认 30 分钟
     */
    startZombieCleanupScheduler(intervalMinutes?: number, thresholdMinutes?: number): void;
}
declare const _default: TaskService;
export default _default;
//# sourceMappingURL=task.service.d.ts.map