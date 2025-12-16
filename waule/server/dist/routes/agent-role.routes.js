"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const agent_role_controller_1 = require("../controllers/agent-role.controller");
const auth_1 = require("../middleware/auth");
const admin_1 = require("../middleware/admin");
const router = (0, express_1.Router)();
const controller = new agent_role_controller_1.AgentRoleController();
// 普通用户可访问的接口（只需登录）
router.get('/by-agent/:agentId', auth_1.authenticateToken, controller.listByAgent.bind(controller));
router.post('/:id/execute', auth_1.authenticateToken, controller.executeRole.bind(controller));
// 管理员接口
router.use(auth_1.authenticateToken, admin_1.isAdmin);
router.get('/', controller.list.bind(controller));
router.get('/:id', controller.getById.bind(controller));
router.post('/', controller.create.bind(controller));
router.put('/:id', controller.update.bind(controller));
router.delete('/:id', controller.delete.bind(controller));
exports.default = router;
//# sourceMappingURL=agent-role.routes.js.map