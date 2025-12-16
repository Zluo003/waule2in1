"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sora_character_controller_1 = require("../controllers/sora-character.controller");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const controller = new sora_character_controller_1.SoraCharacterController();
// 所有路由都需要认证
router.use(auth_1.authenticateToken);
// 搜索用户（用于添加协作者）
router.get('/users/search', controller.searchUsers.bind(controller));
// 搜索角色（用于@提及自动完成）
router.get('/search', controller.search.bind(controller));
// 协作者管理
router.get('/collaborators', controller.getCollaborators.bind(controller));
router.post('/share', controller.addCollaborator.bind(controller));
router.post('/unshare', controller.removeCollaborator.bind(controller));
// 获取共享信息
router.get('/share-info', controller.getShareInfo.bind(controller));
// 获取当前用户的所有角色
router.get('/', controller.list.bind(controller));
// 获取单个角色
router.get('/:id', controller.getById.bind(controller));
// 通过自定义名称获取角色
router.get('/by-name/:customName', controller.getByCustomName.bind(controller));
// 创建角色
router.post('/', controller.create.bind(controller));
// 更新角色
router.put('/:id', controller.update.bind(controller));
// 删除角色（软删除）
router.delete('/:id', controller.delete.bind(controller));
exports.default = router;
//# sourceMappingURL=sora-character.routes.js.map