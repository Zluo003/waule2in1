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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTextFromDocument = extractTextFromDocument;
exports.readFileAsBase64 = readFileAsBase64;
exports.getFileMimeType = getFileMimeType;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mammoth = __importStar(require("mammoth"));
/**
 * 从文档文件中提取文本内容
 */
async function extractTextFromDocument(filePath) {
    const fullPath = path_1.default.join(process.cwd(), filePath);
    if (!fs_1.default.existsSync(fullPath)) {
        throw new Error(`文件不存在: ${fullPath}`);
    }
    const ext = path_1.default.extname(fullPath).toLowerCase();
    try {
        switch (ext) {
            case '.txt':
                return fs_1.default.readFileSync(fullPath, 'utf-8');
            case '.pdf':
                return await extractTextFromPDF(fullPath);
            case '.docx':
                return await extractTextFromDocx(fullPath);
            default:
                throw new Error(`不支持的文档格式: ${ext}`);
        }
    }
    catch (error) {
        console.error('文档内容提取失败:', error);
        throw new Error(`文档内容提取失败: ${error.message}`);
    }
}
/**
 * 从PDF提取文本
 */
async function extractTextFromPDF(filePath) {
    const dataBuffer = fs_1.default.readFileSync(filePath);
    const pdf = require('pdf-parse');
    const data = await pdf(dataBuffer);
    return data.text;
}
/**
 * 从DOCX提取文本
 */
async function extractTextFromDocx(filePath) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
}
/**
 * 读取文件为base64（用于传递给AI）
 */
function readFileAsBase64(filePath) {
    const fullPath = path_1.default.join(process.cwd(), filePath);
    if (!fs_1.default.existsSync(fullPath)) {
        throw new Error(`文件不存在: ${fullPath}`);
    }
    const fileBuffer = fs_1.default.readFileSync(fullPath);
    return fileBuffer.toString('base64');
}
/**
 * 获取文件的MIME类型
 */
function getFileMimeType(filePath) {
    const ext = path_1.default.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.txt': 'text/plain',
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.doc': 'application/msword',
    };
    return mimeTypes[ext] || 'application/octet-stream';
}
//# sourceMappingURL=document.service.js.map