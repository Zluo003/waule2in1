import { Router } from 'express';
import {
  getEpisodes,
  getEpisode,
  createEpisode,
  updateEpisode,
  deleteEpisode,
  getEpisodeCollaborators,
  updateEpisodePermission,
} from '../controllers/episode.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// 仅对剧集相关路径进行认证，避免影响 /api 其他路径

// 剧集路由
router.get('/projects/:projectId/episodes', authenticateToken, getEpisodes);
router.get('/projects/:projectId/episodes/:episodeId', authenticateToken, getEpisode);
router.post('/projects/:projectId/episodes', authenticateToken, createEpisode);
router.put('/projects/:projectId/episodes/:episodeId', authenticateToken, updateEpisode);
router.delete('/projects/:projectId/episodes/:episodeId', authenticateToken, deleteEpisode);

// 剧集权限管理（继承项目协作者，可单独设置编辑权限）
router.get('/projects/:projectId/episodes/:episodeId/collaborators', authenticateToken, getEpisodeCollaborators);
router.put('/projects/:projectId/episodes/:episodeId/permission', authenticateToken, updateEpisodePermission);

export default router;

