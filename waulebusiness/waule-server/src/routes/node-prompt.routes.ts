import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import * as nodePromptController from '../controllers/node-prompt.controller';

const router = Router();

// ==================== 管理员路由 ====================
// 需要认证和 ADMIN 角色

/**
 * @swagger
 * /admin/node-prompts:
 *   get:
 *     summary: 获取所有节点提示词模板
 *     tags: [Admin - Node Prompts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *         description: 是否包含已禁用的模板
 *     responses:
 *       200:
 *         description: 成功获取节点提示词模板列表
 */
router.get(
  '/admin/node-prompts',
  authenticateToken,
  authorizeRoles('ADMIN'),
  nodePromptController.getAllNodePrompts
);

/**
 * @swagger
 * /admin/node-prompts/defaults/storyboard-master:
 *   get:
 *     summary: 获取智能分镜节点的默认提示词模板
 *     tags: [Admin - Node Prompts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取默认模板
 */
router.get(
  '/admin/node-prompts/defaults/storyboard-master',
  authenticateToken,
  authorizeRoles('ADMIN'),
  nodePromptController.getStoryboardMasterDefaults
);

/**
 * @swagger
 * /admin/node-prompts/init/storyboard-master:
 *   post:
 *     summary: 初始化智能分镜节点的默认提示词模板
 *     tags: [Admin - Node Prompts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: 初始化成功
 */
router.post(
  '/admin/node-prompts/init/storyboard-master',
  authenticateToken,
  authorizeRoles('ADMIN'),
  nodePromptController.initStoryboardMasterTemplate
);

/**
 * @swagger
 * /admin/node-prompts/{id}:
 *   get:
 *     summary: 根据ID获取节点提示词模板
 *     tags: [Admin - Node Prompts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功获取节点提示词模板
 */
router.get(
  '/admin/node-prompts/:id',
  authenticateToken,
  authorizeRoles('ADMIN'),
  nodePromptController.getNodePromptById
);

/**
 * @swagger
 * /admin/node-prompts:
 *   post:
 *     summary: 创建节点提示词模板
 *     tags: [Admin - Node Prompts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nodeType
 *               - name
 *               - userPromptTemplate
 *             properties:
 *               nodeType:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               systemPrompt:
 *                 type: string
 *               userPromptTemplate:
 *                 type: string
 *               enhancePromptTemplate:
 *                 type: string
 *               variables:
 *                 type: array
 *               isActive:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: 创建成功
 */
router.post(
  '/admin/node-prompts',
  authenticateToken,
  authorizeRoles('ADMIN'),
  nodePromptController.createNodePrompt
);

/**
 * @swagger
 * /admin/node-prompts/{id}:
 *   put:
 *     summary: 更新节点提示词模板
 *     tags: [Admin - Node Prompts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 更新成功
 */
router.put(
  '/admin/node-prompts/:id',
  authenticateToken,
  authorizeRoles('ADMIN'),
  nodePromptController.updateNodePrompt
);

/**
 * @swagger
 * /admin/node-prompts/{id}:
 *   delete:
 *     summary: 删除节点提示词模板
 *     tags: [Admin - Node Prompts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 删除成功
 */
router.delete(
  '/admin/node-prompts/:id',
  authenticateToken,
  authorizeRoles('ADMIN'),
  nodePromptController.deleteNodePrompt
);

/**
 * @swagger
 * /admin/node-prompts/{id}/toggle:
 *   patch:
 *     summary: 切换节点提示词模板启用状态
 *     tags: [Admin - Node Prompts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 切换成功
 */
router.patch(
  '/admin/node-prompts/:id/toggle',
  authenticateToken,
  authorizeRoles('ADMIN'),
  nodePromptController.toggleNodePromptActive
);

// ==================== 租户/客户端路由 ====================
// 根据节点类型获取提示词（供前端使用）

/**
 * @swagger
 * /node-prompts/type/{nodeType}:
 *   get:
 *     summary: 根据节点类型获取提示词模板（租户/客户端使用）
 *     tags: [Node Prompts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nodeType
 *         required: true
 *         schema:
 *           type: string
 *         description: 节点类型，如 storyboardMaster
 *     responses:
 *       200:
 *         description: 成功获取节点提示词模板
 */
router.get(
  '/node-prompts/type/:nodeType',
  authenticateToken,
  nodePromptController.getNodePromptByType
);

export default router;
