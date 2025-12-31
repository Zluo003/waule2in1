/**
 * Midjourney API 路由
 */

import { Router, Request, Response } from 'express';
import { midjourneyService } from '../services/midjourney';
import { getMjTask, getMjTasksByStatus } from '../database';
import { log } from '../utils/logger';

const router = Router();

// 发送 imagine 命令
router.post('/imagine', async (req: Request, res: Response) => {
  try {
    const { prompt, userId, user_id } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'prompt is required' });
    }

    if (!midjourneyService.ready) {
      return res.status(503).json({ success: false, error: 'Midjourney service not ready' });
    }

    const taskId = await midjourneyService.imagine(prompt, userId || user_id);
    log('midjourney', `Imagine task created: ${taskId}`);

    res.json({
      success: true,
      taskId,
      message: 'Task submitted'
    });
  } catch (e: any) {
    log('midjourney', `Imagine error: ${e.message}`);
    res.status(500).json({ success: false, error: e.message });
  }
});

// 执行按钮操作 (U1-U4, V1-V4 等)
router.post('/action', async (req: Request, res: Response) => {
  try {
    const { messageId, message_id, customId, custom_id, userId, user_id } = req.body;
    const actualMessageId = messageId || message_id;
    const actualCustomId = customId || custom_id;

    if (!actualMessageId || !actualCustomId) {
      return res.status(400).json({ success: false, error: 'messageId and customId are required' });
    }

    if (!midjourneyService.ready) {
      return res.status(503).json({ success: false, error: 'Midjourney service not ready' });
    }

    const taskId = await midjourneyService.action(actualMessageId, actualCustomId, userId || user_id);
    log('midjourney', `Action task created: ${taskId}`);

    res.json({
      success: true,
      taskId,
      message: 'Action submitted'
    });
  } catch (e: any) {
    log('midjourney', `Action error: ${e.message}`);
    res.status(500).json({ success: false, error: e.message });
  }
});

// 查询任务状态
router.get('/task/:taskId', (req: Request, res: Response) => {
  const { taskId } = req.params;
  const task = getMjTask(taskId);

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  // 解析 buttons JSON
  let buttons = [];
  if (task.buttons) {
    try {
      buttons = JSON.parse(task.buttons);
    } catch {}
  }

  res.json({
    taskId: task.task_id,
    status: task.status,
    progress: task.progress,
    imageUrl: task.oss_url || task.image_url,
    messageId: task.message_id,
    messageHash: task.message_hash,
    buttons,
    failReason: task.fail_reason,
    createdAt: task.created_at,
    updatedAt: task.updated_at
  });
});

// 查询服务状态
router.get('/status', (_req: Request, res: Response) => {
  const status = midjourneyService.getStatus();
  res.json({
    code: 0,
    ready: midjourneyService.ready,
    connections: status
  });
});

// 重新加载连接
router.post('/reload', async (_req: Request, res: Response) => {
  try {
    await midjourneyService.reload();
    res.json({ code: 0, message: 'Reloaded' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 查询任务列表
router.get('/tasks', (req: Request, res: Response) => {
  const { status } = req.query;
  const tasks = status ? getMjTasksByStatus(status as string) : getMjTasksByStatus('SUCCESS');
  res.json({
    code: 0,
    data: tasks.slice(0, 100).map(t => ({
      task_id: t.task_id,
      status: t.status,
      progress: t.progress,
      image_url: t.oss_url || t.image_url,
      prompt: t.prompt,
      created_at: t.created_at
    }))
  });
});

export default router;
