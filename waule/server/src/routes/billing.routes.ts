import { Router } from 'express';
import { billingController } from '../controllers/billing.controller';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// 所有路由都需要认证
router.use(authenticateToken);

// 费用预估 - 允许所有认证用户访问
router.post('/estimate', billingController.estimateCredits.bind(billingController));

// 获取模型列表（用于选择器）- 允许所有认证用户访问
router.get('/models', billingController.getModels.bind(billingController));

// 计费规则 CRUD - 需要管理员权限
router.get('/rules', authorizeRoles('ADMIN'), billingController.getRules.bind(billingController));
router.get('/rules/:id', authorizeRoles('ADMIN'), billingController.getRule.bind(billingController));
router.post('/rules', authorizeRoles('ADMIN'), billingController.createRule.bind(billingController));
router.put('/rules/:id', authorizeRoles('ADMIN'), billingController.updateRule.bind(billingController));
router.delete('/rules/:id', authorizeRoles('ADMIN'), billingController.deleteRule.bind(billingController));
router.post('/rules/:id/toggle', authorizeRoles('ADMIN'), billingController.toggleRule.bind(billingController));

export default router;
