"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const agent_controller_1 = require("../controllers/agent.controller");
const auth_1 = require("../middleware/auth");
const admin_1 = require("../middleware/admin");
const router = (0, express_1.Router)();
const agentController = new agent_controller_1.AgentController();
// 读取操作允许所有认证用户访问
router.get('/', auth_1.authenticateToken, agentController.getAll.bind(agentController));
// 获取可用的文本生成模型（允许所有认证用户访问，用于工作流智能体节点）
router.get('/models', auth_1.authenticateToken, agentController.getAvailableModels.bind(agentController));
// /:id 路由必须在具体路径之后
router.get('/:id', auth_1.authenticateToken, agentController.getById.bind(agentController));
// 管理操作需要管理员权限
router.use(auth_1.authenticateToken, admin_1.isAdmin);
// 写操作（创建、更新、删除）
router.post('/', agentController.create.bind(agentController));
router.put('/:id', agentController.update.bind(agentController));
router.delete('/:id', agentController.delete.bind(agentController));
exports.default = router;
//# sourceMappingURL=agent.routes.js.map