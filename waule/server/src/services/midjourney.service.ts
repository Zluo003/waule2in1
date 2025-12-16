import { MIDJOURNEY_TASK_STATUS, MidjourneyTaskStatus } from '../config/midjourney.config';
import { getGlobalWauleApiClient, WauleApiClient } from './waule-api.client';

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
class MidjourneyService {
  private wauleApiClient: WauleApiClient | null = null;

  constructor() {
    this.wauleApiClient = getGlobalWauleApiClient();
    if (this.wauleApiClient) {
      console.log('🎨 [Midjourney] 使用 waule-api 网关模式');
    } else {
      console.warn('⚠️ [Midjourney] WAULEAPI_URL 未配置，Midjourney 功能不可用');
    }
  }

  /**
   * 提交 Imagine 任务（文生图）
   */
  async imagine(params: ImagineRequest): Promise<TaskResponse> {
    if (!this.wauleApiClient) {
      throw new Error('Midjourney 服务未配置，请设置 WAULEAPI_URL 环境变量');
    }

    try {
      const result = await this.wauleApiClient.midjourneyImagine({
        prompt: params.prompt,
        userId: params.userId,
      });

      return {
        code: result.success ? 1 : -1,
        description: result.message || (result.success ? '任务已提交' : '任务提交失败'),
        result: result.taskId,
        properties: {
          prompt: params.prompt,
        },
      };
    } catch (error: any) {
      console.error('❌ [Midjourney] Imagine 提交失败:', error.message);
      return {
        code: -1,
        description: error.message,
      };
    }
  }

  /**
   * 查询任务状态
   */
  async fetch(taskId: string): Promise<TaskResult> {
    if (!this.wauleApiClient) {
      throw new Error('Midjourney 服务未配置');
    }

    try {
      const result = await this.wauleApiClient.midjourneyGetTask(taskId);

      console.log(`🔍 [Midjourney] 查询任务 ${taskId}, 状态: ${result.status}`);

      let status: MidjourneyTaskStatus = MIDJOURNEY_TASK_STATUS.SUBMITTED;
      if (result.status === 'SUCCESS' || result.status === 'COMPLETED') {
        status = MIDJOURNEY_TASK_STATUS.SUCCESS;
      } else if (result.status === 'FAILED' || result.status === 'FAILURE') {
        status = MIDJOURNEY_TASK_STATUS.FAILURE;
      } else if (result.status === 'IN_PROGRESS') {
        status = MIDJOURNEY_TASK_STATUS.IN_PROGRESS;
      } else if (result.status === 'SUBMITTED') {
        status = MIDJOURNEY_TASK_STATUS.SUBMITTED;
      }

      return {
        id: result.taskId || taskId,
        action: 'IMAGINE',
        status,
        progress: result.progress !== undefined ? String(result.progress) : undefined,
        imageUrl: result.imageUrl,
        failReason: result.failReason,
        properties: {
          messageId: result.messageId,
          messageHash: result.messageHash,
        },
        buttons: result.buttons?.map(b => ({
          customId: b.customId,
          emoji: b.emoji || '',
          label: b.label || '',
          type: 2,
          style: 2,
        })),
      };
    } catch (error: any) {
      console.error('❌ [Midjourney] 查询任务失败:', error.message);
      throw error;
    }
  }

  /**
   * 轮询任务直到完成
   */
  async pollTask(taskId: string): Promise<TaskResult> {
    if (!this.wauleApiClient) {
      throw new Error('Midjourney 服务未配置');
    }

    try {
      const result = await this.wauleApiClient.midjourneyWaitTask(taskId, 300000);

      console.log(`🔍 [Midjourney] 任务 ${taskId}, 状态: ${result.status}`);

      if (result.status === 'SUCCESS' || result.status === 'COMPLETED') {
        console.log('✅ [Midjourney] 任务完成！');
        return {
          id: result.taskId,
          action: 'IMAGINE',
          status: MIDJOURNEY_TASK_STATUS.SUCCESS,
          imageUrl: result.imageUrl,
          properties: {
            messageId: result.messageId,
            messageHash: result.messageHash,
          },
          buttons: result.buttons?.map(b => ({
            customId: b.customId,
            emoji: b.emoji || '',
            label: b.label || '',
            type: 2,
            style: 2,
          })),
        };
      }

      if (result.status === 'FAILED' || result.status === 'FAILURE') {
        throw new Error(`任务失败: ${result.failReason || '未知错误'}`);
      }

      throw new Error('任务超时或状态未知');
    } catch (error: any) {
      console.error('❌ [Midjourney] 轮询任务失败:', error.message);
      throw error;
    }
  }

  /**
   * 执行动作（Upscale、Variation 等）
   */
  async action(params: ActionRequest): Promise<TaskResponse> {
    if (!this.wauleApiClient) {
      throw new Error('Midjourney 服务未配置');
    }

    try {
      const result = await this.wauleApiClient.midjourneyAction({
        messageId: params.messageId || params.taskId,
        customId: params.customId,
        userId: params.userId,
      });

      return {
        code: result.success ? 1 : -1,
        description: result.message || (result.success ? '操作已提交' : '操作提交失败'),
        result: result.taskId,
      };
    } catch (error: any) {
      console.error('❌ [Midjourney] Action 提交失败:', error.message);
      return {
        code: -1,
        description: error.message,
      };
    }
  }

  /**
   * Blend（图片混合）- 暂不支持
   */
  async blend(_base64Array: string[], _notifyHook?: string): Promise<TaskResponse> {
    throw new Error('Blend 功能暂不支持，请使用 waule-api 服务');
  }

  /**
   * Describe（图生文）- 暂不支持
   */
  async describe(_base64: string, _notifyHook?: string): Promise<TaskResponse> {
    throw new Error('Describe 功能暂不支持，请使用 waule-api 服务');
  }

  /**
   * 上传参考图
   */
  async uploadReferenceImage(_imageBuffer: Buffer, _imageName: string): Promise<string> {
    throw new Error('上传参考图功能暂不支持，请使用 waule-api 服务');
  }
}

// 懒加载模式：确保 dotenv.config() 已执行后再初始化
let _instance: MidjourneyService | null = null;

export function getMidjourneyService(): MidjourneyService {
  if (!_instance) {
    _instance = new MidjourneyService();
  }
  return _instance;
}

export default { getMidjourneyService };
