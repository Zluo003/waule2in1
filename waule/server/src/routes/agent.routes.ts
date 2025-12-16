import { Router } from 'express';
import { AgentController } from '../controllers/agent.controller';
import { authenticateToken } from '../middleware/auth';
import { isAdmin } from '../middleware/admin';

const router = Router();
const agentController = new AgentController();

// 读取操作允许所有认证用户访问
router.get('/', authenticateToken, agentController.getAll.bind(agentController));

// 获取可用的文本生成模型（允许所有认证用户访问，用于工作流智能体节点）
router.get('/models', authenticateToken, agentController.getAvailableModels.bind(agentController));

// /:id 路由必须在具体路径之后
router.get('/:id', authenticateToken, agentController.getById.bind(agentController));

// 管理操作需要管理员权限
router.use(authenticateToken, isAdmin);

// 写操作（创建、更新、删除）
router.post('/', agentController.create.bind(agentController));
router.put('/:id', agentController.update.bind(agentController));
router.delete('/:id', agentController.delete.bind(agentController));

export default router;

