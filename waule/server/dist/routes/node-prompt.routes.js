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
const nodePromptController = __importStar(require("../controllers/node-prompt.controller"));
const router = (0, express_1.Router)();
// ==================== 管理员路由 ====================
// 获取所有节点提示词模板
router.get('/admin/node-prompts', auth_1.authenticateToken, (0, auth_1.authorizeRoles)('ADMIN'), nodePromptController.getAllNodePrompts);
// 初始化高清放大节点模板
router.post('/admin/node-prompts/init/hd-upscale', auth_1.authenticateToken, (0, auth_1.authorizeRoles)('ADMIN'), nodePromptController.initHDUpscaleTemplate);
// 初始化智能溶图节点模板
router.post('/admin/node-prompts/init/image-fusion', auth_1.authenticateToken, (0, auth_1.authorizeRoles)('ADMIN'), nodePromptController.initImageFusionTemplate);
// 初始化智能分镜节点模板
router.post('/admin/node-prompts/init/smart-storyboard', auth_1.authenticateToken, (0, auth_1.authorizeRoles)('ADMIN'), nodePromptController.initSmartStoryboardTemplate);
// 根据ID获取提示词模板
router.get('/admin/node-prompts/:id', auth_1.authenticateToken, (0, auth_1.authorizeRoles)('ADMIN'), nodePromptController.getNodePromptById);
// 创建节点提示词模板
router.post('/admin/node-prompts', auth_1.authenticateToken, (0, auth_1.authorizeRoles)('ADMIN'), nodePromptController.createNodePrompt);
// 更新节点提示词模板
router.put('/admin/node-prompts/:id', auth_1.authenticateToken, (0, auth_1.authorizeRoles)('ADMIN'), nodePromptController.updateNodePrompt);
// 删除节点提示词模板
router.delete('/admin/node-prompts/:id', auth_1.authenticateToken, (0, auth_1.authorizeRoles)('ADMIN'), nodePromptController.deleteNodePrompt);
// 切换启用状态
router.patch('/admin/node-prompts/:id/toggle', auth_1.authenticateToken, (0, auth_1.authorizeRoles)('ADMIN'), nodePromptController.toggleNodePromptActive);
// ==================== 租户/客户端路由 ====================
// 根据节点类型获取提示词（供前端使用）
router.get('/node-prompts/type/:nodeType', auth_1.authenticateToken, nodePromptController.getNodePromptByType);
exports.default = router;
//# sourceMappingURL=node-prompt.routes.js.map