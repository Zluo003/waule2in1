/**
 * Sora中转API配置管理路由
 */

import { Router, Request, Response } from 'express';
import { getSoraProxyConfig, updateSoraProxyConfig, SoraProxyConfig } from '../db';

const router = Router();

// 获取配置
router.get('/', (req: Request, res: Response) => {
  const config = getSoraProxyConfig();
  res.json({ success: true, data: config });
});

// 更新配置
router.put('/', (req: Request, res: Response) => {
  const { provider, base_url, api_key, is_active, channel } = req.body;
  
  const success = updateSoraProxyConfig({
    provider,
    base_url,
    api_key,
    is_active,
    channel,
  });
  
  if (success) {
    const config = getSoraProxyConfig();
    res.json({ success: true, data: config });
  } else {
    res.status(400).json({ success: false, error: 'Update failed' });
  }
});

// 测试连接
router.post('/test', async (req: Request, res: Response) => {
  const config = getSoraProxyConfig();
  
  if (!config || !config.api_key) {
    return res.status(400).json({ success: false, error: 'API key not configured' });
  }
  
  try {
    const response = await fetch(`${config.base_url}/v1/video/query?id=test`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.api_key}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok || response.status === 404) {
      // 404 is expected for a non-existent task, but it means the API is reachable
      res.json({ success: true, message: 'Connection successful' });
    } else {
      const text = await response.text();
      res.status(400).json({ success: false, error: `API returned ${response.status}: ${text}` });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
