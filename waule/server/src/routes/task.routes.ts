import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  createImageTask,
  createImageEditTask,
  createVideoTask,
  createVideoEditTask,
  getTaskStatus,
  getUserTasks,
  getActiveTask,
  getPendingPreviewNodes,
  markPreviewNodeCreated,
  createStoryboardTask,
} from '../controllers/task.controller';

const router = Router();

// 所有路由都需要认证
router.use(authenticateToken);

// 创建任务
router.post('/image', createImageTask);
router.post('/image-edit', createImageEditTask);
router.post('/video', createVideoTask);
router.post('/video-edit', createVideoEditTask);
router.post('/storyboard', createStoryboardTask);

// 预览节点管理
router.get('/active', getActiveTask);
router.get('/pending-preview-nodes', getPendingPreviewNodes);
router.post('/:taskId/mark-preview-created', markPreviewNodeCreated);

// 查询任务（放在最后以避免路径冲突）
router.get('/:taskId', getTaskStatus);
router.get('/', getUserTasks);

export default router;

