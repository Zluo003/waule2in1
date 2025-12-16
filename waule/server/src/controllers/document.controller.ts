import { Request, Response } from 'express';
import { extractTextFromDocument, readFileAsBase64, getFileMimeType } from '../services/document.service';
import { AppError } from '../middleware/errorHandler';

/**
 * 提取文档文本内容
 */
export const extractDocumentText = async (req: Request, res: Response) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      throw new AppError('文件路径是必需的', 400);
    }

    const text = await extractTextFromDocument(filePath);
    
    res.json({
      success: true,
      data: {
        text,
        length: text.length,
      },
    });
  } catch (error: any) {
    console.error('Extract document text error:', error);
    throw new AppError(`提取文档内容失败: ${error.message}`, 500);
  }
};

/**
 * 获取文档的base64编码（用于AI调用）
 */
export const getDocumentBase64 = async (req: Request, res: Response) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      throw new AppError('文件路径是必需的', 400);
    }

    const base64 = readFileAsBase64(filePath);
    const mimeType = getFileMimeType(filePath);
    
    res.json({
      success: true,
      data: {
        base64,
        mimeType,
      },
    });
  } catch (error: any) {
    console.error('Get document base64 error:', error);
    throw new AppError(`获取文档base64失败: ${error.message}`, 500);
  }
};

