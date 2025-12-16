import fs from 'fs';
import path from 'path';
import * as mammoth from 'mammoth';

/**
 * 从文档文件中提取文本内容
 */
export async function extractTextFromDocument(filePath: string): Promise<string> {
  const fullPath = path.join(process.cwd(), filePath);
  
  if (!fs.existsSync(fullPath)) {
    throw new Error(`文件不存在: ${fullPath}`);
  }

  const ext = path.extname(fullPath).toLowerCase();
  
  try {
    switch (ext) {
      case '.txt':
        return fs.readFileSync(fullPath, 'utf-8');
      
      case '.pdf':
        return await extractTextFromPDF(fullPath);
      
      case '.docx':
        return await extractTextFromDocx(fullPath);
      
      default:
        throw new Error(`不支持的文档格式: ${ext}`);
    }
  } catch (error: any) {
    console.error('文档内容提取失败:', error);
    throw new Error(`文档内容提取失败: ${error.message}`);
  }
}

/**
 * 从PDF提取文本
 */
async function extractTextFromPDF(filePath: string): Promise<string> {
  const dataBuffer = fs.readFileSync(filePath);
  const pdf = require('pdf-parse');
  const data = await pdf(dataBuffer);
  return data.text;
}

/**
 * 从DOCX提取文本
 */
async function extractTextFromDocx(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

/**
 * 读取文件为base64（用于传递给AI）
 */
export function readFileAsBase64(filePath: string): string {
  const fullPath = path.join(process.cwd(), filePath);
  
  if (!fs.existsSync(fullPath)) {
    throw new Error(`文件不存在: ${fullPath}`);
  }

  const fileBuffer = fs.readFileSync(fullPath);
  return fileBuffer.toString('base64');
}

/**
 * 获取文件的MIME类型
 */
export function getFileMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  
  const mimeTypes: Record<string, string> = {
    '.txt': 'text/plain',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
}

