/**
 * Sora 中转 API 配置管理路由
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import { getSoraProxyConfig, updateSoraProxyConfig } from '../../database';

const router = Router();

// 获取配置
router.get('/', (req: Request, res: Response) => {
  const config = getSoraProxyConfig();
  // 隐藏 API Key
  if (config && config.api_key) {
    config.api_key = config.api_key.slice(0, 8) + '****' + config.api_key.slice(-4);
  }
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
    if (config && config.api_key) {
      config.api_key = config.api_key.slice(0, 8) + '****' + config.api_key.slice(-4);
    }
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
    const response = await axios.get(`${config.base_url}/v1/videos/test-connection`, {
      headers: {
        'Authorization': `Bearer ${config.api_key}`,
      },
      timeout: 10000,
      validateStatus: () => true,
    });

    // 404 也算连接成功（API 可达）
    if (response.status === 200 || response.status === 404 || response.status === 401) {
      res.json({ success: true, message: 'Connection successful', status: response.status });
    } else {
      res.status(400).json({ success: false, error: `API returned ${response.status}` });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
