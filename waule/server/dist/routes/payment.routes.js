"use strict";
/**
 * 支付路由
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const paymentController = __importStar(require("../controllers/payment.controller"));
const router = (0, express_1.Router)();
// ============== 公开接口（支付回调） ==============
// 支付宝异步通知
router.post('/callback/alipay', paymentController.alipayCallback);
// 微信支付异步通知（预留）
router.post('/callback/wechat', paymentController.wechatCallback);
// ============== 用户接口（需登录） ==============
// 获取可用套餐列表
router.get('/packages', paymentController.getActivePackages);
// 以下接口需要登录
router.use(auth_1.authenticateToken);
// 创建充值订单
router.post('/orders', paymentController.createOrder);
// 查询订单状态
router.get('/orders/:orderNo/status', paymentController.getOrderStatus);
// 获取用户订单列表
router.get('/orders', paymentController.getUserOrders);
// 获取用户积分流水
router.get('/transactions', paymentController.getUserTransactions);
// ============== 管理员接口 ==============
router.use((0, auth_1.authorizeRoles)('ADMIN'));
// 支付配置管理
router.get('/admin/configs', paymentController.getPaymentConfigs);
router.get('/admin/configs/:id', paymentController.getPaymentConfig);
router.post('/admin/configs', paymentController.upsertPaymentConfig);
router.post('/admin/configs/:id/test', paymentController.testPaymentConfig);
router.delete('/admin/configs/:id', paymentController.deletePaymentConfig);
// 套餐管理
router.get('/admin/packages', paymentController.getAllPackages);
router.post('/admin/packages', paymentController.createPackage);
router.put('/admin/packages/:id', paymentController.updatePackage);
router.delete('/admin/packages/:id', paymentController.deletePackage);
// 手动充值
router.post('/admin/recharge', paymentController.adminRecharge);
// 手动确认订单（处理漏单）
router.post('/admin/orders/confirm', paymentController.adminConfirmOrder);
exports.default = router;
//# sourceMappingURL=payment.routes.js.map