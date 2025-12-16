"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const episode_controller_1 = require("../controllers/episode.controller");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// 仅对剧集相关路径进行认证，避免影响 /api 其他路径
// 剧集路由
router.get('/projects/:projectId/episodes', auth_1.authenticateToken, episode_controller_1.getEpisodes);
router.get('/projects/:projectId/episodes/:episodeId', auth_1.authenticateToken, episode_controller_1.getEpisode);
router.post('/projects/:projectId/episodes', auth_1.authenticateToken, episode_controller_1.createEpisode);
router.put('/projects/:projectId/episodes/:episodeId', auth_1.authenticateToken, episode_controller_1.updateEpisode);
router.delete('/projects/:projectId/episodes/:episodeId', auth_1.authenticateToken, episode_controller_1.deleteEpisode);
// 剧集权限管理（继承项目协作者，可单独设置编辑权限）
router.get('/projects/:projectId/episodes/:episodeId/collaborators', auth_1.authenticateToken, episode_controller_1.getEpisodeCollaborators);
router.put('/projects/:projectId/episodes/:episodeId/permission', auth_1.authenticateToken, episode_controller_1.updateEpisodePermission);
exports.default = router;
//# sourceMappingURL=episode.routes.js.map