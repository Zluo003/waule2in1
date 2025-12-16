import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

/**
 * 代理音频文件请求，解决 CORS 问题
 */
router.get('/audio', async (req: Request, res: Response) => {
  try {
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: '缺少 URL 参数' });
    }

    // 验证 URL 格式
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: '无效的 URL 格式' });
    }

    // 仅允许代理特定域名（安全考虑）
    const allowedDomains = ['aliyuncs.com', 'aliyun.com'];
    const urlObj = new URL(url);
    const isAllowed = allowedDomains.some(domain => urlObj.hostname.includes(domain));

    if (!isAllowed) {
      return res.status(403).json({ error: '不允许代理此域名' });
    }

    // 使用 axios 获取音频文件
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000, // 30秒超时
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // 设置响应头
    const contentType = response.headers['content-type'] || 'audio/mpeg';
    const contentLength = response.headers['content-length'];

    res.set({
      'Content-Type': contentType,
      'Content-Length': contentLength,
      'Cache-Control': 'public, max-age=31536000', // 缓存1年
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD',
      'Access-Control-Allow-Headers': '*'
    });

    // 返回音频数据
    res.send(Buffer.from(response.data));

  } catch (error: any) {
    console.error('[ProxyRoute] Audio proxy error:', error.message);
    
    if (error.response) {
      // 转发上游错误
      res.status(error.response.status).json({ 
        error: '无法获取音频文件',
        details: error.message 
      });
    } else {
      res.status(500).json({ 
        error: '代理请求失败',
        details: error.message 
      });
    }
  }
});

export default router;
