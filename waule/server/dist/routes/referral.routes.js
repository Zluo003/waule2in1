"use strict";
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
const referralController = __importStar(require("../controllers/referral.controller"));
const router = (0, express_1.Router)();
// ============== 用户端 API ==============
// 获取推荐信息
router.get('/info', auth_1.authenticateToken, referralController.getReferralInfo);
// 获取我推荐的用户列表
router.get('/list', auth_1.authenticateToken, referralController.getReferrals);
// 获取返利记录
router.get('/commissions', auth_1.authenticateToken, referralController.getCommissions);
// 申请提现
router.post('/withdraw', auth_1.authenticateToken, referralController.requestWithdrawal);
// 获取提现记录
router.get('/withdrawals', auth_1.authenticateToken, referralController.getWithdrawals);
// 绑定推荐码（注册后补填）
router.post('/bind', auth_1.authenticateToken, referralController.bindReferralCode);
// ============== 管理后台 API ==============
// 获取推荐配置
router.get('/admin/config', auth_1.authenticateToken, (0, auth_1.authorizeRoles)('ADMIN'), referralController.getConfig);
// 更新推荐配置
router.put('/admin/config', auth_1.authenticateToken, (0, auth_1.authorizeRoles)('ADMIN'), referralController.updateConfig);
// 获取推荐统计
router.get('/admin/stats', auth_1.authenticateToken, (0, auth_1.authorizeRoles)('ADMIN'), referralController.getStats);
// 获取提现申请列表
router.get('/admin/withdrawals', auth_1.authenticateToken, (0, auth_1.authorizeRoles)('ADMIN'), referralController.getWithdrawalRequests);
// 处理提现申请
router.put('/admin/withdrawals/:id', auth_1.authenticateToken, (0, auth_1.authorizeRoles)('ADMIN'), referralController.processWithdrawal);
exports.default = router;
//# sourceMappingURL=referral.routes.js.map