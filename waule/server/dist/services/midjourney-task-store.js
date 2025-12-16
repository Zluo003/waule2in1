"use strict";
/**
 * Midjourney 任务存储模块
 * 使用 Redis 实现跨进程共享的任务状态存储
 * 支持 PM2 集群模式
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mjTaskStore = void 0;
const index_1 = require("../index");
const events_1 = require("events");
const ioredis_1 = __importDefault(require("ioredis"));
// Redis 键前缀
const TASK_PREFIX = 'mj:task:'; // 任务状态
const MSG_TO_TASK_PREFIX = 'mj:msg2task:'; // 消息ID到任务ID的映射
const USER_ACTIVE_PREFIX = 'mj:user:active:'; // 用户活跃任务
const USER_LOCK_PREFIX = 'mj:user:lock:'; // 用户任务提交锁（原子性保护）
const TASK_TTL = 3600; // 任务 TTL: 1小时
const USER_LOCK_TTL = 30; // 用户锁 TTL: 30秒（防止死锁）
/**
 * Midjourney 任务存储类
 * 提供跨进程共享的任务状态管理
 */
class MidjourneyTaskStore extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this.subClient = null;
        this.pubClient = null;
        this.isInitialized = false;
        this.initPromise = null;
        // Pub/Sub 频道
        this.TASK_UPDATE_CHANNEL = 'mj:task:update';
    }
    /**
     * 初始化 Pub/Sub 连接
     */
    async initialize() {
        if (this.isInitialized)
            return;
        if (this.initPromise)
            return this.initPromise;
        this.initPromise = this._doInitialize();
        return this.initPromise;
    }
    async _doInitialize() {
        try {
            const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
            // 创建订阅客户端
            this.subClient = new ioredis_1.default(redisUrl);
            this.pubClient = new ioredis_1.default(redisUrl);
            // 订阅任务更新频道
            await this.subClient.subscribe(this.TASK_UPDATE_CHANNEL);
            this.subClient.on('message', (channel, message) => {
                if (channel === this.TASK_UPDATE_CHANNEL) {
                    try {
                        const event = JSON.parse(message);
                        this.emit('taskUpdate', event);
                    }
                    catch (e) {
                        console.error('[MJ TaskStore] 解析任务更新消息失败:', e);
                    }
                }
            });
            this.isInitialized = true;
            console.log('✅ [MJ TaskStore] Redis Pub/Sub 已初始化');
        }
        catch (error) {
            console.error('❌ [MJ TaskStore] 初始化失败:', error);
            throw error;
        }
    }
    /**
     * 广播任务更新事件
     */
    async publishTaskUpdate(event) {
        try {
            if (this.pubClient) {
                await this.pubClient.publish(this.TASK_UPDATE_CHANNEL, JSON.stringify(event));
            }
        }
        catch (e) {
            console.error('[MJ TaskStore] 广播任务更新失败:', e);
        }
    }
    /**
     * 创建任务
     */
    async createTask(task) {
        const key = `${TASK_PREFIX}${task.taskId}`;
        try {
            // 存储任务数据
            await index_1.redis.set(key, JSON.stringify(task), 'EX', TASK_TTL);
            // 设置用户活跃任务
            if (task.userId) {
                const userKey = `${USER_ACTIVE_PREFIX}${task.userId}`;
                await index_1.redis.set(userKey, task.taskId, 'EX', TASK_TTL);
            }
            console.log(`✅ [MJ TaskStore] 任务已创建: ${task.taskId}, 用户: ${task.userId}`);
            // 广播任务创建事件
            await this.publishTaskUpdate({ type: 'create', taskId: task.taskId, task });
        }
        catch (e) {
            console.error('[MJ TaskStore] 创建任务失败:', e);
            throw e;
        }
    }
    /**
     * 获取任务
     */
    async getTask(taskId) {
        const key = `${TASK_PREFIX}${taskId}`;
        try {
            const data = await index_1.redis.get(key);
            if (!data) {
                console.log(`⚠️ [MJ TaskStore] 任务不存在: ${taskId}`);
                return null;
            }
            return JSON.parse(data);
        }
        catch (e) {
            console.error('[MJ TaskStore] 获取任务失败:', e);
            return null;
        }
    }
    /**
     * 更新任务
     * 🔓 任务完成时自动释放用户锁
     */
    async updateTask(taskId, updates) {
        const key = `${TASK_PREFIX}${taskId}`;
        try {
            const existingData = await index_1.redis.get(key);
            if (!existingData) {
                console.log(`⚠️ [MJ TaskStore] 更新失败，任务不存在: ${taskId}`);
                return null;
            }
            const task = { ...JSON.parse(existingData), ...updates };
            await index_1.redis.set(key, JSON.stringify(task), 'EX', TASK_TTL);
            // 如果任务完成，清除用户活跃任务并释放用户锁
            if (task.status === 'SUCCESS' || task.status === 'FAILURE') {
                if (task.userId) {
                    const userKey = `${USER_ACTIVE_PREFIX}${task.userId}`;
                    const activeTaskId = await index_1.redis.get(userKey);
                    if (activeTaskId === taskId) {
                        await index_1.redis.del(userKey);
                    }
                    // 🔓 任务完成时释放用户锁，允许用户提交新任务
                    await this.releaseUserLockOnComplete(task.userId);
                }
            }
            console.log(`✅ [MJ TaskStore] 任务已更新: ${taskId}, 状态: ${task.status}`);
            // 广播任务更新事件
            await this.publishTaskUpdate({ type: 'update', taskId, task });
            return task;
        }
        catch (e) {
            console.error('[MJ TaskStore] 更新任务失败:', e);
            return null;
        }
    }
    /**
     * 删除任务
     */
    async deleteTask(taskId) {
        const key = `${TASK_PREFIX}${taskId}`;
        try {
            // 先获取任务以清除用户活跃任务
            const data = await index_1.redis.get(key);
            if (data) {
                const task = JSON.parse(data);
                if (task.userId) {
                    const userKey = `${USER_ACTIVE_PREFIX}${task.userId}`;
                    const activeTaskId = await index_1.redis.get(userKey);
                    if (activeTaskId === taskId) {
                        await index_1.redis.del(userKey);
                    }
                }
            }
            await index_1.redis.del(key);
            console.log(`🗑️ [MJ TaskStore] 任务已删除: ${taskId}`);
            // 广播任务删除事件
            await this.publishTaskUpdate({ type: 'delete', taskId });
        }
        catch (e) {
            console.error('[MJ TaskStore] 删除任务失败:', e);
        }
    }
    /**
     * 检查用户是否有活跃任务
     */
    async hasActiveTask(userId) {
        const userKey = `${USER_ACTIVE_PREFIX}${userId}`;
        try {
            const activeTaskId = await index_1.redis.get(userKey);
            if (!activeTaskId)
                return false;
            // 验证任务是否仍然存在且未完成
            const task = await this.getTask(activeTaskId);
            if (!task) {
                // 任务已不存在，清除标记
                await index_1.redis.del(userKey);
                return false;
            }
            if (task.status === 'SUCCESS' || task.status === 'FAILURE') {
                // 任务已完成，清除标记
                await index_1.redis.del(userKey);
                return false;
            }
            return true;
        }
        catch (e) {
            console.error('[MJ TaskStore] 检查活跃任务失败:', e);
            return false;
        }
    }
    /**
     * 🔒 原子性地尝试获取用户锁并创建任务
     * 解决多实例并发场景下的竞态条件问题
     * @returns { success: true, taskId } 成功获取锁并创建任务
     * @returns { success: false, reason } 获取锁失败的原因
     */
    async tryAcquireLockAndCreateTask(task) {
        const lockKey = `${USER_LOCK_PREFIX}${task.userId}`;
        const lockValue = `${task.taskId}-${Date.now()}`;
        try {
            // 1. 使用 SET NX EX 原子操作获取用户锁
            const lockResult = await index_1.redis.set(lockKey, lockValue, 'EX', USER_LOCK_TTL, 'NX');
            if (lockResult !== 'OK') {
                // 获取锁失败，检查是否是因为有活跃任务
                const hasActive = await this.hasActiveTask(task.userId);
                if (hasActive) {
                    return { success: false, reason: '每位用户只允许同时执行一个Midjourney任务' };
                }
                // 可能是并发请求导致的锁冲突，等待一小段时间后重试
                return { success: false, reason: '请求正在处理中，请稍后重试' };
            }
            // 2. 获取锁成功，再次检查是否有活跃任务（双重检查）
            const hasActiveTask = await this.hasActiveTask(task.userId);
            if (hasActiveTask) {
                // 释放锁
                await this.releaseUserLock(task.userId, lockValue);
                return { success: false, reason: '每位用户只允许同时执行一个Midjourney任务' };
            }
            // 3. 创建任务
            await this.createTask(task);
            console.log(`🔒 [MJ TaskStore] 用户 ${task.userId} 已获取任务锁并创建任务: ${task.taskId}`);
            return { success: true, taskId: task.taskId };
        }
        catch (e) {
            console.error('[MJ TaskStore] 获取锁并创建任务失败:', e);
            // 尝试释放锁（如果已获取）
            await this.releaseUserLock(task.userId, lockValue).catch(() => { });
            return { success: false, reason: `任务创建失败: ${e.message}` };
        }
    }
    /**
     * 🔓 释放用户锁
     * 使用 Lua 脚本确保只释放自己持有的锁
     */
    async releaseUserLock(userId, lockValue) {
        const lockKey = `${USER_LOCK_PREFIX}${userId}`;
        try {
            if (lockValue) {
                // 使用 Lua 脚本原子释放锁（只有值匹配时才删除）
                const script = `
          if redis.call('get', KEYS[1]) == ARGV[1] then
            return redis.call('del', KEYS[1])
          else
            return 0
          end
        `;
                await index_1.redis.eval(script, 1, lockKey, lockValue);
            }
            else {
                // 直接删除锁（用于任务完成时的清理）
                await index_1.redis.del(lockKey);
            }
        }
        catch (e) {
            console.error('[MJ TaskStore] 释放用户锁失败:', e);
        }
    }
    /**
     * 🔓 任务完成时释放用户锁
     * 在任务成功或失败时调用
     */
    async releaseUserLockOnComplete(userId) {
        await this.releaseUserLock(userId);
        console.log(`🔓 [MJ TaskStore] 用户 ${userId} 任务完成，锁已释放`);
    }
    /**
     * 获取用户的活跃任务
     */
    async getActiveTask(userId) {
        const userKey = `${USER_ACTIVE_PREFIX}${userId}`;
        try {
            const activeTaskId = await index_1.redis.get(userKey);
            if (!activeTaskId)
                return null;
            return this.getTask(activeTaskId);
        }
        catch (e) {
            console.error('[MJ TaskStore] 获取活跃任务失败:', e);
            return null;
        }
    }
    /**
     * 设置消息ID到任务ID的映射
     */
    async setMessageToTaskMapping(messageId, taskId) {
        const key = `${MSG_TO_TASK_PREFIX}${messageId}`;
        try {
            await index_1.redis.set(key, taskId, 'EX', TASK_TTL);
        }
        catch (e) {
            console.error('[MJ TaskStore] 设置消息映射失败:', e);
        }
    }
    /**
     * 通过消息ID获取任务ID
     */
    async getTaskIdByMessageId(messageId) {
        const key = `${MSG_TO_TASK_PREFIX}${messageId}`;
        try {
            return await index_1.redis.get(key);
        }
        catch (e) {
            console.error('[MJ TaskStore] 获取消息映射失败:', e);
            return null;
        }
    }
    /**
     * 获取所有待处理的任务
     * 注意：这个方法性能较差，仅用于调试
     */
    async getPendingTasks() {
        try {
            const keys = await index_1.redis.keys(`${TASK_PREFIX}*`);
            const tasks = [];
            for (const key of keys) {
                const data = await index_1.redis.get(key);
                if (data) {
                    const task = JSON.parse(data);
                    if (task.status === 'SUBMITTED' || task.status === 'IN_PROGRESS') {
                        tasks.push(task);
                    }
                }
            }
            return tasks;
        }
        catch (e) {
            console.error('[MJ TaskStore] 获取待处理任务失败:', e);
            return [];
        }
    }
    /**
     * 通过 prompt 或 sourceMessageId 查找匹配的待处理任务
     */
    async findPendingTaskByPromptOrSource(prompt, sourceMessageId) {
        try {
            const pendingTasks = await this.getPendingTasks();
            // 优先通过 sourceMessageId 匹配
            if (sourceMessageId) {
                const matchBySource = pendingTasks.find(t => t.sourceMessageId === sourceMessageId);
                if (matchBySource)
                    return matchBySource;
            }
            // 通过 prompt 匹配
            if (prompt) {
                const matchByPrompt = pendingTasks.find(t => t.prompt && (t.prompt.includes(prompt) || prompt.includes(t.prompt)));
                if (matchByPrompt)
                    return matchByPrompt;
            }
            // 如果只有一个待处理任务，安全匹配
            if (pendingTasks.length === 1) {
                return pendingTasks[0];
            }
            return null;
        }
        catch (e) {
            console.error('[MJ TaskStore] 查找任务失败:', e);
            return null;
        }
    }
    /**
     * 清理过期任务
     * Redis TTL 会自动清理，此方法用于主动清理
     */
    async cleanupExpiredTasks() {
        try {
            const keys = await index_1.redis.keys(`${TASK_PREFIX}*`);
            const now = Date.now();
            const ONE_HOUR = 60 * 60 * 1000;
            let cleanedCount = 0;
            for (const key of keys) {
                const data = await index_1.redis.get(key);
                if (data) {
                    const task = JSON.parse(data);
                    // 清理超过1小时的任务
                    if (now - task.timestamp > ONE_HOUR) {
                        await index_1.redis.del(key);
                        cleanedCount++;
                    }
                }
            }
            if (cleanedCount > 0) {
                console.log(`🧹 [MJ TaskStore] 清理了 ${cleanedCount} 个过期任务`);
            }
            return cleanedCount;
        }
        catch (e) {
            console.error('[MJ TaskStore] 清理过期任务失败:', e);
            return 0;
        }
    }
    /**
     * 关闭连接
     */
    async close() {
        try {
            if (this.subClient) {
                await this.subClient.quit();
                this.subClient = null;
            }
            if (this.pubClient) {
                await this.pubClient.quit();
                this.pubClient = null;
            }
            this.isInitialized = false;
            console.log('👋 [MJ TaskStore] 已关闭');
        }
        catch (e) {
            console.error('[MJ TaskStore] 关闭失败:', e);
        }
    }
}
// 导出单例
exports.mjTaskStore = new MidjourneyTaskStore();
//# sourceMappingURL=midjourney-task-store.js.map