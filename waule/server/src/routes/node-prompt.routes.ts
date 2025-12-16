import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import * as nodePromptController from '../controllers/node-prompt.controller';

const router = Router();

// ==================== 管理员路由 ====================

// 获取所有节点提示词模板
router.get(
  '/admin/node-prompts',
  authenticateToken,
  authorizeRoles('ADMIN'),
  nodePromptController.getAllNodePrompts
);

// 初始化高清放大节点模板
router.post(
  '/admin/node-prompts/init/hd-upscale',
  authenticateToken,
  authorizeRoles('ADMIN'),
  nodePromptController.initHDUpscaleTemplate
);

// 初始化智能溶图节点模板
router.post(
  '/admin/node-prompts/init/image-fusion',
  authenticateToken,
  authorizeRoles('ADMIN'),
  nodePromptController.initImageFusionTemplate
);

// 初始化智能分镜节点模板
router.post(
  '/admin/node-prompts/init/smart-storyboard',
  authenticateToken,
  authorizeRoles('ADMIN'),
  nodePromptController.initSmartStoryboardTemplate
);

// 根据ID获取提示词模板
router.get(
  '/admin/node-prompts/:id',
  authenticateToken,
  authorizeRoles('ADMIN'),
  nodePromptController.getNodePromptById
);

// 创建节点提示词模板
router.post(
  '/admin/node-prompts',
  authenticateToken,
  authorizeRoles('ADMIN'),
  nodePromptController.createNodePrompt
);

// 更新节点提示词模板
router.put(
  '/admin/node-prompts/:id',
  authenticateToken,
  authorizeRoles('ADMIN'),
  nodePromptController.updateNodePrompt
);

// 删除节点提示词模板
router.delete(
  '/admin/node-prompts/:id',
  authenticateToken,
  authorizeRoles('ADMIN'),
  nodePromptController.deleteNodePrompt
);

// 切换启用状态
router.patch(
  '/admin/node-prompts/:id/toggle',
  authenticateToken,
  authorizeRoles('ADMIN'),
  nodePromptController.toggleNodePromptActive
);

// ==================== 租户/客户端路由 ====================

// 根据节点类型获取提示词（供前端使用）
router.get(
  '/node-prompts/type/:nodeType',
  authenticateToken,
  nodePromptController.getNodePromptByType
);

export default router;
