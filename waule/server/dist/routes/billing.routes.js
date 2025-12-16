"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const billing_controller_1 = require("../controllers/billing.controller");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// 所有路由都需要认证
router.use(auth_1.authenticateToken);
// 费用预估 - 允许所有认证用户访问
router.post('/estimate', billing_controller_1.billingController.estimateCredits.bind(billing_controller_1.billingController));
// 获取模型列表（用于选择器）- 允许所有认证用户访问
router.get('/models', billing_controller_1.billingController.getModels.bind(billing_controller_1.billingController));
// 计费规则 CRUD - 需要管理员权限
router.get('/rules', (0, auth_1.authorizeRoles)('ADMIN'), billing_controller_1.billingController.getRules.bind(billing_controller_1.billingController));
router.get('/rules/:id', (0, auth_1.authorizeRoles)('ADMIN'), billing_controller_1.billingController.getRule.bind(billing_controller_1.billingController));
router.post('/rules', (0, auth_1.authorizeRoles)('ADMIN'), billing_controller_1.billingController.createRule.bind(billing_controller_1.billingController));
router.put('/rules/:id', (0, auth_1.authorizeRoles)('ADMIN'), billing_controller_1.billingController.updateRule.bind(billing_controller_1.billingController));
router.delete('/rules/:id', (0, auth_1.authorizeRoles)('ADMIN'), billing_controller_1.billingController.deleteRule.bind(billing_controller_1.billingController));
router.post('/rules/:id/toggle', (0, auth_1.authorizeRoles)('ADMIN'), billing_controller_1.billingController.toggleRule.bind(billing_controller_1.billingController));
exports.default = router;
//# sourceMappingURL=billing.routes.js.map