/**
 * Veo 视频生成API配置管理路由
 */

import { Router, Request, Response } from 'express';
import { getVeoProxyConfig, updateVeoProxyConfig, VeoProxyConfig } from '../db';

const router = Router();

// 获取配置
router.get('/', (req: Request, res: Response) => {
  const config = getVeoProxyConfig();
  // 掩码 API Key
  if (config && config.api_key) {
    const key = config.api_key;
    config.api_key = key.length > 10 ? `${key.slice(0, 6)}...${key.slice(-4)}` : '***';
  }
  res.json({ success: true, data: config });
});

// 更新配置
router.put('/', (req: Request, res: Response) => {
  const { provider, base_url, api_key, is_active } = req.body;

  const success = updateVeoProxyConfig({
    provider,
    base_url,
    api_key,
    is_active,
  });

  if (success) {
    const config = getVeoProxyConfig();
    // 掩码 API Key
    if (config && config.api_key) {
      const key = config.api_key;
      config.api_key = key.length > 10 ? `${key.slice(0, 6)}...${key.slice(-4)}` : '***';
    }
    res.json({ success: true, data: config });
  } else {
    res.status(400).json({ success: false, error: 'Update failed' });
  }
});

// 测试连接
router.post('/test', async (req: Request, res: Response) => {
  const config = getVeoProxyConfig();

  if (!config || !config.api_key) {
    return res.status(400).json({ success: false, error: 'API key not configured' });
  }

  try {
    // 使用查询接口测试连接（查询一个不存在的任务ID）
    const response = await fetch(`${config.base_url}/v1/videos/test-connection`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.api_key}`,
      },
    });

    if (response.ok || response.status === 404 || response.status === 400) {
      // 404/400 is expected for a non-existent task, but it means the API is reachable
      res.json({ success: true, message: 'Connection successful' });
    } else if (response.status === 401) {
      res.status(400).json({ success: false, error: 'API Key 无效' });
    } else {
      const text = await response.text();
      res.status(400).json({ success: false, error: `API returned ${response.status}: ${text}` });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
