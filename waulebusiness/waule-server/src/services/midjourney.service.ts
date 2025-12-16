/**
 * Midjourney 服务 - 通过 WauleAPI 网关调用
 * 
 * 改造说明：
 * - 所有 Discord 逆向逻辑移至 waule-api
 * - 本服务只负责调用 wauleApiClient
 * - 删除 proxy/discord 双模式、Redis 队列等复杂逻辑
 */

import { wauleApiClient } from './wauleapi-client';
import { MIDJOURNEY_TASK_STATUS, MidjourneyTaskStatus } from '../config/midjourney.config';

// ==================== 接口定义 ====================

interface ImagineRequest {
  prompt: string;
  userId?: string;
  base64Array?: string[];  // 垫图（暂不支持，保留接口）
  notifyHook?: string;     // 回调（暂不支持，保留接口）
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

// ==================== 服务实现 ====================

class MidjourneyService {
  constructor() {
    console.log('🎨 [Midjourney] 服务初始化 (WauleAPI 模式)');
  }

  /**
   * 提交 Imagine 任务（文生图）
   */
  async imagine(params: ImagineRequest): Promise<TaskResponse> {
    console.log('📤 [Midjourney] Imagine 请求:', params.prompt.substring(0, 50) + '...');
    
    try {
      const result = await wauleApiClient.mjImagine({
        prompt: params.prompt,
        userId: params.userId,
      });

      if (result.success && result.taskId) {
        return {
          code: 1,
          description: '任务已提交',
          result: result.taskId,
          properties: { prompt: params.prompt },
        };
      } else {
        return {
          code: -1,
          description: result.message || '任务提交失败',
        };
      }
    } catch (error: any) {
      console.error('❌ [Midjourney] Imagine 失败:', error.message);
      return {
        code: -1,
        description: error.response?.data?.error?.message || error.message,
      };
    }
  }

  /**
   * 查询任务状态
   */
  async fetch(taskId: string): Promise<TaskResult> {
    console.log('🔍 [Midjourney] 查询任务:', taskId);
    
    try {
      const result = await wauleApiClient.mjGetTask(taskId);

      // 根据按钮判断 action 类型
      let action = 'IMAGINE';
      if (result.buttons && result.buttons.length > 0) {
        const hasGridButtons = result.buttons.some(b => 
          /^U[1-4]$/i.test(b.label) || /^V[1-4]$/i.test(b.label)
        );
        const hasSingleImageButtons = result.buttons.some(b =>
          b.label.includes('Vary') || b.label.includes('Upscale')
        );
        if (!hasGridButtons && hasSingleImageButtons) {
          action = 'UPSCALE';
        }
      }

      return {
        id: result.taskId,
        action,
        status: result.status as MidjourneyTaskStatus,
        progress: result.progress,
        imageUrl: result.imageUrl,
        failReason: result.failReason,
        properties: {
          messageId: result.messageId,
          messageHash: result.messageHash,
        },
        buttons: result.buttons?.map(b => ({
          customId: b.customId,
          emoji: b.emoji || '',
          label: b.label,
          type: 2,
          style: 2,
        })),
      };
    } catch (error: any) {
      console.error('❌ [Midjourney] 查询任务失败:', error.message);
      return {
        id: taskId,
        action: 'UNKNOWN',
        status: 'NOT_FOUND',
      };
    }
  }

  /**
   * 轮询任务直到完成
   */
  async pollTask(taskId: string): Promise<TaskResult> {
    console.log('⏳ [Midjourney] 开始轮询任务:', taskId);
    
    const maxAttempts = 150;
    const pollInterval = 2000;
    
    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.fetch(taskId);
      
      console.log(`🔍 [Midjourney] 轮询 ${i + 1}/${maxAttempts}, 状态: ${result.status}, 进度: ${result.progress || 'N/A'}`);
      
      if (result.status === MIDJOURNEY_TASK_STATUS.SUCCESS) {
        console.log('✅ [Midjourney] 任务完成！');
        return result;
      }
      
      if (result.status === MIDJOURNEY_TASK_STATUS.FAILURE) {
        throw new Error(`任务失败: ${result.failReason || '未知错误'}`);
      }
      
      if (result.status === MIDJOURNEY_TASK_STATUS.NOT_FOUND) {
        throw new Error('任务不存在');
      }
      
      await this.sleep(pollInterval);
    }
    
    throw new Error('任务超时');
  }

  /**
   * 执行动作（Upscale、Variation 等）
   */
  async action(params: ActionRequest): Promise<TaskResponse> {
    console.log('🎬 [Midjourney] Action 请求:', {
      taskId: params.taskId,
      customId: params.customId,
      messageId: params.messageId,
    });

    // 如果没有 messageId，需要先查询获取
    let messageId = params.messageId;
    if (!messageId) {
      const task = await this.fetch(params.taskId);
      messageId = task.properties?.messageId;
      if (!messageId) {
        return {
          code: -1,
          description: '找不到消息ID，无法执行操作',
        };
      }
    }

    try {
      const result = await wauleApiClient.mjAction({
        messageId,
        customId: params.customId,
        userId: params.userId,
      });

      if (result.success && result.taskId) {
        return {
          code: 1,
          description: '操作已提交',
          result: result.taskId,
        };
      } else {
        return {
          code: -1,
          description: result.message || '操作提交失败',
        };
      }
    } catch (error: any) {
      console.error('❌ [Midjourney] Action 失败:', error.message);
      return {
        code: -1,
        description: error.response?.data?.error?.message || error.message,
      };
    }
  }

  /**
   * Blend（图片混合）- 暂不支持
   */
  async blend(base64Array: string[], notifyHook?: string): Promise<TaskResponse> {
    console.warn('⚠️ [Midjourney] Blend 功能暂不支持');
    return {
      code: -1,
      description: 'Blend 功能暂不支持，请使用 Imagine',
    };
  }

  /**
   * Describe（图生文）- 暂不支持
   */
  async describe(base64: string, notifyHook?: string): Promise<TaskResponse> {
    console.warn('⚠️ [Midjourney] Describe 功能暂不支持');
    return {
      code: -1,
      description: 'Describe 功能暂不支持',
    };
  }

  /**
   * 获取任务列表 - 暂不支持
   */
  async listTasks(ids: string[]): Promise<TaskResult[]> {
    console.warn('⚠️ [Midjourney] listTasks 功能暂不支持');
    return [];
  }

  /**
   * 上传参考图到 Discord - 暂不支持
   */
  async uploadReferenceImage(imageBuffer: Buffer, filename: string): Promise<string> {
    console.warn('⚠️ [Midjourney] uploadReferenceImage 功能暂不支持');
    throw new Error('上传参考图功能暂不支持');
  }

  /**
   * 检查是否为队列模式（已废弃，始终返回 false）
   */
  isQueueMode(): boolean {
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new MidjourneyService();
