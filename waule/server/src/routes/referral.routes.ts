import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import * as referralController from '../controllers/referral.controller';

const router = Router();

// ============== 用户端 API ==============

// 获取推荐信息
router.get('/info', authenticateToken, referralController.getReferralInfo);

// 获取我推荐的用户列表
router.get('/list', authenticateToken, referralController.getReferrals);

// 获取返利记录
router.get('/commissions', authenticateToken, referralController.getCommissions);

// 申请提现
router.post('/withdraw', authenticateToken, referralController.requestWithdrawal);

// 获取提现记录
router.get('/withdrawals', authenticateToken, referralController.getWithdrawals);

// 绑定推荐码（注册后补填）
router.post('/bind', authenticateToken, referralController.bindReferralCode);

// ============== 管理后台 API ==============

// 获取推荐配置
router.get('/admin/config', authenticateToken, authorizeRoles('ADMIN'), referralController.getConfig);

// 更新推荐配置
router.put('/admin/config', authenticateToken, authorizeRoles('ADMIN'), referralController.updateConfig);

// 获取推荐统计
router.get('/admin/stats', authenticateToken, authorizeRoles('ADMIN'), referralController.getStats);

// 获取提现申请列表
router.get('/admin/withdrawals', authenticateToken, authorizeRoles('ADMIN'), referralController.getWithdrawalRequests);

// 处理提现申请
router.put('/admin/withdrawals/:id', authenticateToken, authorizeRoles('ADMIN'), referralController.processWithdrawal);

export default router;
