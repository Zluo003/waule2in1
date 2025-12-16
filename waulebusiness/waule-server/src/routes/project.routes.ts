import { Router } from 'express';
import { body } from 'express-validator';
import { authenticateToken } from '../middleware/auth';
import * as projectController from '../controllers/project.controller';

const router = Router();

router.use(authenticateToken);

/**
 * @swagger
 * /projects:
 *   get:
 *     summary: 获取所有项目
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功获取项目列表
 */
router.get('/', projectController.getAllProjects);

// 用户搜索（用于添加协作者）- 必须放在 /:id 路由之前
router.get('/users/search', projectController.searchUsers);

// 获取共享给我的项目 - 必须放在 /:id 路由之前
router.get('/shared', projectController.getSharedProjects);

/**
 * @swagger
 * /projects:
 *   post:
 *     summary: 创建项目
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/',
  [
    body('name')
      .notEmpty()
      .withMessage('项目名称不能为空')
      .isLength({ max: 100 })
      .withMessage('项目名称不能超过100字符'),
    body('description').optional().isLength({ max: 500 }),
    body('type').optional().isIn(['DRAMA', 'QUICK']),
  ],
  projectController.createProject
);

/**
 * @swagger
 * /projects/{id}:
 *   get:
 *     summary: 获取项目详情
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', projectController.getProjectById);

/**
 * @swagger
 * /projects/{id}:
 *   put:
 *     summary: 更新项目
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', projectController.updateProject);

/**
 * @swagger
 * /projects/{id}:
 *   delete:
 *     summary: 删除项目
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', projectController.deleteProject);

/**
 * @swagger
 * /projects/{id}/episodes:
 *   get:
 *     summary: 获取项目的所有集数
 *     tags: [Projects - Episodes]
 *     security:
 *       - bearerAuth: []
 */

// 项目协作者管理（项目级只有只读权限）
router.get('/:id/collaborators', projectController.getProjectCollaborators);
router.post('/:id/share', projectController.addProjectCollaborator);
router.post('/:id/unshare', projectController.removeProjectCollaborator);

export default router;
