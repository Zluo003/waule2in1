/**
 * Midjourney 路由
 * POST /v1/midjourney/imagine - 生成图片
 * POST /v1/midjourney/action - 执行按钮操作
 * GET  /v1/midjourney/task/:taskId - 查询任务状态
 */

import { Router, Request, Response } from 'express';
import { midjourneyService } from '../services/midjourney';
import { getMjTask, MjTask, MjButton } from '../db';

const router = Router();

function log(msg: string, data?: any) {
  console.log(`[${new Date().toISOString()}] [MJ Route] ${msg}`, data || '');
}

// 格式化任务响应
function formatTaskResponse(task: MjTask) {
  let buttons: MjButton[] = [];
  try {
    if (task.buttons) buttons = JSON.parse(task.buttons);
  } catch {}

  return {
    taskId: task.task_id,
    status: task.status,
    progress: task.progress,
    imageUrl: task.oss_url || task.image_url,
    messageId: task.message_id,
    messageHash: task.message_hash,
    buttons,
    failReason: task.fail_reason,
    createdAt: task.created_at,
  };
}

/**
 * POST /v1/midjourney/imagine
 * 发送imagine命令生成图片
 */
router.post('/imagine', async (req: Request, res: Response) => {
  try {
    const { prompt, userId } = req.body;

    if (!prompt) {
      return res.status(400).json({
        error: { message: 'prompt is required', type: 'invalid_request' }
      });
    }

    if (!midjourneyService.ready) {
      return res.status(503).json({
        error: { message: 'Midjourney service not ready', type: 'service_unavailable' }
      });
    }

    log(`Imagine请求: ${prompt.substring(0, 50)}...`);

    const taskId = await midjourneyService.imagine(prompt, userId);

    res.json({
      success: true,
      taskId,
      message: '任务已提交，请轮询查询状态',
    });

  } catch (error: any) {
    log(`Imagine失败: ${error.message}`);
    res.status(500).json({
      error: { message: error.message, type: 'generation_error' }
    });
  }
});

/**
 * POST /v1/midjourney/action
 * 执行按钮操作（Upscale, Variation等）
 */
router.post('/action', async (req: Request, res: Response) => {
  try {
    const { messageId, customId, userId } = req.body;

    if (!messageId || !customId) {
      return res.status(400).json({
        error: { message: 'messageId and customId are required', type: 'invalid_request' }
      });
    }

    if (!midjourneyService.ready) {
      return res.status(503).json({
        error: { message: 'Midjourney service not ready', type: 'service_unavailable' }
      });
    }

    log(`Action请求: messageId=${messageId}, customId=${customId}`);

    const taskId = await midjourneyService.action(messageId, customId, userId);

    res.json({
      success: true,
      taskId,
      message: '操作已提交，请轮询查询状态',
    });

  } catch (error: any) {
    log(`Action失败: ${error.message}`);
    res.status(500).json({
      error: { message: error.message, type: 'action_error' }
    });
  }
});

/**
 * GET /v1/midjourney/task/:taskId
 * 查询任务状态
 */
router.get('/task/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    const task = getMjTask(taskId);
    if (!task) {
      return res.status(404).json({
        error: { message: 'Task not found', type: 'not_found' }
      });
    }

    res.json(formatTaskResponse(task));

  } catch (error: any) {
    log(`查询任务失败: ${error.message}`);
    res.status(500).json({
      error: { message: error.message, type: 'query_error' }
    });
  }
});

/**
 * POST /v1/midjourney/task/:taskId/wait
 * 等待任务完成（长轮询）
 */
router.post('/task/:taskId/wait', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { timeout = 300000 } = req.body;

    const task = await midjourneyService.waitForTask(taskId, Math.min(timeout, 300000));

    res.json(formatTaskResponse(task));

  } catch (error: any) {
    log(`等待任务失败: ${error.message}`);
    res.status(500).json({
      error: { message: error.message, type: 'wait_error' }
    });
  }
});

export default router;
