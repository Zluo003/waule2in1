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
exports.processWithdrawal = exports.getWithdrawalRequests = exports.getStats = exports.updateConfig = exports.getConfig = exports.bindReferralCode = exports.getWithdrawals = exports.requestWithdrawal = exports.getCommissions = exports.getReferrals = exports.getReferralInfo = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const referralService = __importStar(require("../services/referral.service"));
/**
 * 获取用户推荐信息
 */
exports.getReferralInfo = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ success: false, message: '未授权' });
    }
    const info = await referralService.getUserReferralInfo(userId);
    res.json({ success: true, data: info });
});
/**
 * 获取我推荐的用户列表
 */
exports.getReferrals = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ success: false, message: '未授权' });
    }
    const { page, pageSize } = req.query;
    const result = await referralService.getUserReferrals(userId, {
        page: page ? parseInt(page) : 1,
        pageSize: pageSize ? parseInt(pageSize) : 20,
    });
    res.json({ success: true, data: result });
});
/**
 * 获取返利记录
 */
exports.getCommissions = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ success: false, message: '未授权' });
    }
    const { page, pageSize, type } = req.query;
    const result = await referralService.getCommissionRecords(userId, {
        page: page ? parseInt(page) : 1,
        pageSize: pageSize ? parseInt(pageSize) : 20,
        type: type,
    });
    res.json({ success: true, data: result });
});
/**
 * 申请提现
 */
exports.requestWithdrawal = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ success: false, message: '未授权' });
    }
    const { amount, type, alipayAccount, alipayName } = req.body;
    if (!amount || !type) {
        return res.status(400).json({ success: false, message: '请填写提现金额和类型' });
    }
    if (!['ALIPAY', 'CREDITS'].includes(type)) {
        return res.status(400).json({ success: false, message: '无效的提现类型' });
    }
    const result = await referralService.requestWithdrawal({
        userId,
        amount: parseInt(amount),
        type: type,
        alipayAccount,
        alipayName,
    });
    if (!result.success) {
        return res.status(400).json(result);
    }
    res.json(result);
});
/**
 * 获取提现记录
 */
exports.getWithdrawals = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ success: false, message: '未授权' });
    }
    const { page, pageSize } = req.query;
    const result = await referralService.getWithdrawalRecords(userId, {
        page: page ? parseInt(page) : 1,
        pageSize: pageSize ? parseInt(pageSize) : 20,
    });
    res.json({ success: true, data: result });
});
/**
 * 绑定推荐码（注册后补填）
 */
exports.bindReferralCode = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ success: false, message: '未授权' });
    }
    const { referralCode } = req.body;
    if (!referralCode) {
        return res.status(400).json({ success: false, message: '请填写推荐码' });
    }
    const result = await referralService.bindReferralAndGrantBonus({
        refereeId: userId,
        referralCode,
    });
    if (!result.success) {
        return res.status(400).json(result);
    }
    res.json(result);
});
// ============== 管理后台 ==============
/**
 * 获取推荐配置（管理后台）
 */
exports.getConfig = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const config = await referralService.getReferralConfig();
    res.json({ success: true, data: config });
});
/**
 * 更新推荐配置（管理后台）
 */
exports.updateConfig = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { isActive, referrerBonus, refereeBonus, commissionRate, minWithdrawAmount, withdrawToCreditsRate } = req.body;
    const config = await referralService.updateReferralConfig({
        isActive,
        referrerBonus,
        refereeBonus,
        commissionRate,
        minWithdrawAmount,
        withdrawToCreditsRate,
    });
    res.json({ success: true, message: '配置更新成功', data: config });
});
/**
 * 获取推荐统计（管理后台）
 */
exports.getStats = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const stats = await referralService.getReferralStats();
    res.json({ success: true, data: stats });
});
/**
 * 获取提现申请列表（管理后台）
 */
exports.getWithdrawalRequests = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { page, pageSize, status } = req.query;
    const result = await referralService.getWithdrawalRequests({
        page: page ? parseInt(page) : 1,
        pageSize: pageSize ? parseInt(pageSize) : 20,
        status: status,
    });
    res.json({ success: true, data: result });
});
/**
 * 处理提现申请（管理后台）
 */
exports.processWithdrawal = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { action, rejectReason } = req.body;
    const adminId = req.user?.id;
    if (!adminId) {
        return res.status(401).json({ success: false, message: '未授权' });
    }
    if (!['approve', 'complete', 'reject'].includes(action)) {
        return res.status(400).json({ success: false, message: '无效操作' });
    }
    const result = await referralService.processWithdrawal({
        id,
        action,
        adminId,
        rejectReason,
    });
    if (!result.success) {
        return res.status(400).json(result);
    }
    res.json(result);
});
//# sourceMappingURL=referral.controller.js.map