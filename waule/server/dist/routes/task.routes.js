"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const task_controller_1 = require("../controllers/task.controller");
const router = (0, express_1.Router)();
// 所有路由都需要认证
router.use(auth_1.authenticateToken);
// 创建任务
router.post('/image', task_controller_1.createImageTask);
router.post('/image-edit', task_controller_1.createImageEditTask);
router.post('/video', task_controller_1.createVideoTask);
router.post('/video-edit', task_controller_1.createVideoEditTask);
router.post('/storyboard', task_controller_1.createStoryboardTask);
// 预览节点管理
router.get('/active', task_controller_1.getActiveTask);
router.get('/pending-preview-nodes', task_controller_1.getPendingPreviewNodes);
router.post('/:taskId/mark-preview-created', task_controller_1.markPreviewNodeCreated);
// 查询任务（放在最后以避免路径冲突）
router.get('/:taskId', task_controller_1.getTaskStatus);
router.get('/', task_controller_1.getUserTasks);
exports.default = router;
//# sourceMappingURL=task.routes.js.map