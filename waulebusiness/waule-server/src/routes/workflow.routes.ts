import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as workflowController from '../controllers/workflow.controller';

const router = Router();

router.use(authenticateToken);

// 搜索用户（放在 /:id 路由之前）
router.get('/users/search', workflowController.searchUsersForWorkflow);

/**
 * @swagger
 * /workflows:
 *   get:
 *     summary: 获取所有工作流
 *     tags: [Workflows]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', workflowController.getAllWorkflows);

/**
 * @swagger
 * /workflows/{id}:
 *   get:
 *     summary: 获取工作流详情
 *     tags: [Workflows]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', workflowController.getWorkflowById);

/**
 * @swagger
 * /workflows/project/{projectId}:
 *   get:
 *     summary: 获取或创建项目的工作流
 *     tags: [Workflows]
 *     security:
 *       - bearerAuth: []
 */
router.get('/project/:projectId', workflowController.getOrCreateProjectWorkflow);

/**
 * @swagger
 * /workflows/project/{projectId}:
 *   post:
 *     summary: 保存项目工作流
 *     tags: [Workflows]
 *     security:
 *       - bearerAuth: []
 */
router.post('/project/:projectId', workflowController.saveWorkflow);

/**
 * @swagger
 * /workflows/project/{projectId}/episode/{episodeId}:
 *   get:
 *     summary: 获取或创建剧集的工作流
 *     tags: [Workflows]
 *     security:
 *       - bearerAuth: []
 */
router.get('/project/:projectId/episode/:episodeId', workflowController.getOrCreateEpisodeWorkflow);

/**
 * @swagger
 * /workflows/project/{projectId}/episode/{episodeId}:
 *   post:
 *     summary: 保存剧集工作流
 *     tags: [Workflows]
 *     security:
 *       - bearerAuth: []
 */
router.post('/project/:projectId/episode/:episodeId', workflowController.saveEpisodeWorkflow);

// Shot-level workflows
router.get('/project/:projectId/episode/:episodeId/shot', workflowController.getOrCreateShotWorkflow);
router.post('/project/:projectId/episode/:episodeId/shot', workflowController.saveShotWorkflow);

/**
 * @swagger
 * /workflows/{id}:
 *   put:
 *     summary: 更新工作流（支持协作者）
 *     tags: [Workflows]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', workflowController.updateWorkflowById);

/**
 * @swagger
 * /workflows/{id}:
 *   delete:
 *     summary: 删除工作流
 *     tags: [Workflows]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', workflowController.deleteWorkflow);

// 工作流协作者管理
router.get('/:id/collaborators', workflowController.getWorkflowCollaborators);
router.post('/:id/share', workflowController.shareWorkflow);
router.put('/:id/share/permission', workflowController.updateWorkflowSharePermission);
router.post('/:id/unshare', workflowController.unshareWorkflow);

export default router;
