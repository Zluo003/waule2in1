/**
 * 支付路由
 */

import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import * as paymentController from '../controllers/payment.controller';

const router = Router();

// ============== 公开接口（支付回调） ==============

// 支付宝异步通知
router.post('/callback/alipay', paymentController.alipayCallback);

// 微信支付异步通知（预留）
router.post('/callback/wechat', paymentController.wechatCallback);

// ============== 用户接口（需登录） ==============

// 获取可用套餐列表
router.get('/packages', paymentController.getActivePackages);

// 以下接口需要登录
router.use(authenticateToken);

// 创建充值订单
router.post('/orders', paymentController.createOrder);

// 查询订单状态
router.get('/orders/:orderNo/status', paymentController.getOrderStatus);

// 获取用户订单列表
router.get('/orders', paymentController.getUserOrders);

// 获取用户积分流水
router.get('/transactions', paymentController.getUserTransactions);

// ============== 管理员接口 ==============

router.use(authorizeRoles('ADMIN'));

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

export default router;
