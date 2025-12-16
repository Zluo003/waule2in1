/**
 * 兑换码路由
 */

import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import * as redeemController from '../controllers/redeem.controller';

const router = Router();

// ============== 用户接口（需登录） ==============

router.use(authenticateToken);

// 兑换码兑换
router.post('/redeem', redeemController.redeemCode);

// ============== 管理员接口 ==============

router.use(authorizeRoles('ADMIN'));

// 获取兑换码列表
router.get('/codes', redeemController.getRedeemCodes);

// 获取批次列表
router.get('/batches', redeemController.getBatches);

// 批量生成兑换码
router.post('/generate', redeemController.generateRedeemCodes);

// 删除单个兑换码
router.delete('/codes/:id', redeemController.deleteRedeemCode);

// 删除批次（只删除未使用的）
router.delete('/batches/:batchId', redeemController.deleteBatch);

export default router;
