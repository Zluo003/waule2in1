"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDocumentBase64 = exports.extractDocumentText = void 0;
const document_service_1 = require("../services/document.service");
const errorHandler_1 = require("../middleware/errorHandler");
/**
 * 提取文档文本内容
 */
const extractDocumentText = async (req, res) => {
    try {
        const { filePath } = req.body;
        if (!filePath) {
            throw new errorHandler_1.AppError('文件路径是必需的', 400);
        }
        const text = await (0, document_service_1.extractTextFromDocument)(filePath);
        res.json({
            success: true,
            data: {
                text,
                length: text.length,
            },
        });
    }
    catch (error) {
        console.error('Extract document text error:', error);
        throw new errorHandler_1.AppError(`提取文档内容失败: ${error.message}`, 500);
    }
};
exports.extractDocumentText = extractDocumentText;
/**
 * 获取文档的base64编码（用于AI调用）
 */
const getDocumentBase64 = async (req, res) => {
    try {
        const { filePath } = req.body;
        if (!filePath) {
            throw new errorHandler_1.AppError('文件路径是必需的', 400);
        }
        const base64 = (0, document_service_1.readFileAsBase64)(filePath);
        const mimeType = (0, document_service_1.getFileMimeType)(filePath);
        res.json({
            success: true,
            data: {
                base64,
                mimeType,
            },
        });
    }
    catch (error) {
        console.error('Get document base64 error:', error);
        throw new errorHandler_1.AppError(`获取文档base64失败: ${error.message}`, 500);
    }
};
exports.getDocumentBase64 = getDocumentBase64;
//# sourceMappingURL=document.controller.js.map