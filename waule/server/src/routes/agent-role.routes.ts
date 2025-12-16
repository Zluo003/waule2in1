import { Router } from 'express';
import { AgentRoleController } from '../controllers/agent-role.controller';
import { authenticateToken } from '../middleware/auth';
import { isAdmin } from '../middleware/admin';

const router = Router();
const controller = new AgentRoleController();

// 普通用户可访问的接口（只需登录）
router.get('/by-agent/:agentId', authenticateToken, controller.listByAgent.bind(controller));
router.post('/:id/execute', authenticateToken, controller.executeRole.bind(controller));

// 管理员接口
router.use(authenticateToken, isAdmin);
router.get('/', controller.list.bind(controller));
router.get('/:id', controller.getById.bind(controller));
router.post('/', controller.create.bind(controller));
router.put('/:id', controller.update.bind(controller));
router.delete('/:id', controller.delete.bind(controller));

export default router;