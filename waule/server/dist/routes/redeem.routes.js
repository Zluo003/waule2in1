"use strict";
/**
 * 兑换码路由
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
const redeemController = __importStar(require("../controllers/redeem.controller"));
const router = (0, express_1.Router)();
// ============== 用户接口（需登录） ==============
router.use(auth_1.authenticateToken);
// 兑换码兑换
router.post('/redeem', redeemController.redeemCode);
// ============== 管理员接口 ==============
router.use((0, auth_1.authorizeRoles)('ADMIN'));
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
exports.default = router;
//# sourceMappingURL=redeem.routes.js.map