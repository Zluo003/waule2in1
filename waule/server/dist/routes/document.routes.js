"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const document_controller_1 = require("../controllers/document.controller");
const errorHandler_1 = require("../middleware/errorHandler");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// 所有路由都需要认证
router.use(auth_1.authenticateToken);
// 提取文档文本
router.post('/extract-text', (0, errorHandler_1.asyncHandler)(document_controller_1.extractDocumentText));
// 获取文档base64
router.post('/base64', (0, errorHandler_1.asyncHandler)(document_controller_1.getDocumentBase64));
exports.default = router;
//# sourceMappingURL=document.routes.js.map