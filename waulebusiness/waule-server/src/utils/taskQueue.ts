/**
 * 🚀 AI 任务队列与并发控制
 * 控制同时执行的 AI 任务数量，避免资源耗尽
 */

interface QueuedTask {
  id: string;
  userId: string;
  type: 'IMAGE' | 'VIDEO' | 'TEXT';
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  createdAt: number;
  priority: number; // 优先级：VIP > 普通用户
}

class TaskQueue {
  // 配置
  private maxConcurrent: number;
  private maxQueueSize: number;
  private taskTimeout: number;
  
  // 状态
  private queue: QueuedTask[] = [];
  private running: Map<string, QueuedTask> = new Map();
  private userTaskCount: Map<string, number> = new Map();
  
  // 统计
  private stats = {
    totalProcessed: 0,
    totalFailed: 0,
    totalTimeout: 0,
  };

  constructor(options: {
    maxConcurrent?: number;
    maxQueueSize?: number;
    taskTimeout?: number;
  } = {}) {
    // 默认配置：根据服务器资源调整
    this.maxConcurrent = options.maxConcurrent || 10;  // 最大并发 10 个任务
    this.maxQueueSize = options.maxQueueSize || 100;   // 队列最大 100 个待处理
    this.taskTimeout = options.taskTimeout || 5 * 60 * 1000; // 5 分钟超时
  }

  /**
   * 提交任务到队列
   */
  async submit<T>(
    taskId: string,
    userId: string,
    type: 'IMAGE' | 'VIDEO' | 'TEXT',
    execute: () => Promise<T>,
    priority: number = 0
  ): Promise<T> {
    // 检查队列是否已满
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error('任务队列已满，请稍后再试');
    }

    // 检查用户是否有太多任务在队列中
    const userCount = this.userTaskCount.get(userId) || 0;
    const maxUserTasks = priority > 0 ? 10 : 5; // VIP 用户可以有更多任务
    if (userCount >= maxUserTasks) {
      throw new Error(`您已有 ${userCount} 个任务在队列中，请等待完成后再提交`);
    }

    return new Promise((resolve, reject) => {
      const task: QueuedTask = {
        id: taskId,
        userId,
        type,
        execute,
        resolve,
        reject,
        createdAt: Date.now(),
        priority,
      };

      // 更新用户任务计数
      this.userTaskCount.set(userId, userCount + 1);

      // 按优先级插入队列
      this.insertByPriority(task);

      // 尝试处理任务
      this.processNext();
    });
  }

  /**
   * 按优先级插入队列
   */
  private insertByPriority(task: QueuedTask) {
    // 找到第一个优先级低于当前任务的位置
    const index = this.queue.findIndex(t => t.priority < task.priority);
    if (index === -1) {
      this.queue.push(task);
    } else {
      this.queue.splice(index, 0, task);
    }
  }

  /**
   * 处理下一个任务
   */
  private async processNext() {
    // 检查是否达到并发上限
    if (this.running.size >= this.maxConcurrent) {
      return;
    }

    // 取出下一个任务
    const task = this.queue.shift();
    if (!task) {
      return;
    }

    // 标记为运行中
    this.running.set(task.id, task);

    // 设置超时
    const timeoutId = setTimeout(() => {
      this.handleTimeout(task);
    }, this.taskTimeout);

    try {
      // 执行任务
      const result = await task.execute();
      clearTimeout(timeoutId);
      
      // 完成
      this.stats.totalProcessed++;
      task.resolve(result);
    } catch (error: any) {
      clearTimeout(timeoutId);
      this.stats.totalFailed++;
      task.reject(error);
    } finally {
      // 清理
      this.running.delete(task.id);
      const userCount = this.userTaskCount.get(task.userId) || 1;
      if (userCount <= 1) {
        this.userTaskCount.delete(task.userId);
      } else {
        this.userTaskCount.set(task.userId, userCount - 1);
      }

      // 处理下一个
      this.processNext();
    }
  }

  /**
   * 处理超时
   */
  private handleTimeout(task: QueuedTask) {
    this.stats.totalTimeout++;
    this.running.delete(task.id);
    
    const userCount = this.userTaskCount.get(task.userId) || 1;
    if (userCount <= 1) {
      this.userTaskCount.delete(task.userId);
    } else {
      this.userTaskCount.set(task.userId, userCount - 1);
    }

    task.reject(new Error('任务执行超时'));
    this.processNext();
  }

  /**
   * 取消任务（从队列中移除）
   */
  cancel(taskId: string): boolean {
    const index = this.queue.findIndex(t => t.id === taskId);
    if (index !== -1) {
      const task = this.queue[index];
      this.queue.splice(index, 1);
      
      const userCount = this.userTaskCount.get(task.userId) || 1;
      if (userCount <= 1) {
        this.userTaskCount.delete(task.userId);
      } else {
        this.userTaskCount.set(task.userId, userCount - 1);
      }

      task.reject(new Error('任务已取消'));
      return true;
    }
    return false;
  }

  /**
   * 获取队列状态
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      runningCount: this.running.size,
      maxConcurrent: this.maxConcurrent,
      stats: { ...this.stats },
    };
  }

  /**
   * 获取用户的任务数量
   */
  getUserTaskCount(userId: string): number {
    return this.userTaskCount.get(userId) || 0;
  }
}

// 创建不同类型任务的队列实例
export const imageTaskQueue = new TaskQueue({
  maxConcurrent: 15,  // 图片生成并发较高
  maxQueueSize: 200,
  taskTimeout: 10 * 60 * 1000, // 10 分钟
});

export const videoTaskQueue = new TaskQueue({
  maxConcurrent: 8,   // 视频生成资源消耗大
  maxQueueSize: 50,
  taskTimeout: 10 * 60 * 1000, // 10 分钟
});

export const textTaskQueue = new TaskQueue({
  maxConcurrent: 20,  // 文本生成可以更高并发
  maxQueueSize: 300,
  taskTimeout: 10 * 60 * 1000, // 10 分钟
});

// 导出默认实例
export default TaskQueue;
