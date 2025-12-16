/**
 * 内部 OSS 上传接口
 * 供 sora-api 等内部服务调用
 */
import { Router, Request, Response } from 'express';
import { downloadAndUploadToOss } from '../oss';

const router = Router();

/**
 * POST /internal/oss/upload-from-url
 * 从 URL 下载文件并上传到 OSS
 * Body: { url: string, type?: 'image' | 'video' }
 */
router.post('/upload-from-url', async (req: Request, res: Response) => {
  try {
    const { url, type } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'url is required' });
    }
    
    console.log(`[Internal OSS] 收到上传请求: ${url.substring(0, 80)}... type=${type || 'auto'}`);
    
    // 根据 type 参数决定默认扩展名
    const defaultExt = type === 'image' ? '.png' : '.mp4';
    const ossUrl = await downloadAndUploadToOss(url, undefined, defaultExt);
    
    console.log(`[Internal OSS] 上传成功: ${ossUrl}`);
    
    res.json({ 
      success: true, 
      url: ossUrl 
    });
  } catch (error: any) {
    console.error(`[Internal OSS] 上传失败:`, error.message);
    res.status(500).json({ 
      error: error.message || 'Upload failed' 
    });
  }
});

export default router;
