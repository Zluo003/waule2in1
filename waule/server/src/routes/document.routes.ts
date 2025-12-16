import { Router } from 'express';
import { extractDocumentText, getDocumentBase64 } from '../controllers/document.controller';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// 所有路由都需要认证
router.use(authenticateToken);

// 提取文档文本
router.post('/extract-text', asyncHandler(extractDocumentText));

// 获取文档base64
router.post('/base64', asyncHandler(getDocumentBase64));

export default router;

