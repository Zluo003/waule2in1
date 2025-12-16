/**
 * 中转API配置管理路由
 * 
 * GET  /api/proxy-api-config      - 获取配置
 * PUT  /api/proxy-api-config      - 更新配置
 * POST /api/proxy-api-config/channel - 切换通道
 */

import { Router } from 'express';
import { getProxyApiConfig, updateProxyApiConfig, ProxyApiConfig } from '../db';

const router = Router();

// 获取中转API配置
router.get('/', (req, res) => {
  try {
    const config = getProxyApiConfig();
    if (!config) {
      return res.status(404).json({ success: false, error: '配置不存在' });
    }
    
    // 掩码处理API Key
    const maskedConfig = {
      ...config,
      api_key_masked: config.api_key 
        ? config.api_key.slice(0, 8) + '...' + config.api_key.slice(-4)
        : null
    };
    delete (maskedConfig as any).api_key;
    
    res.json({ success: true, config: maskedConfig });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 更新中转API配置
router.put('/', (req, res) => {
  const { provider, base_url, api_key, is_active, model_2k, model_4k, channel } = req.body;
  
  try {
    const updates: Partial<ProxyApiConfig> = {};
    
    if (provider !== undefined) updates.provider = provider;
    if (base_url !== undefined) updates.base_url = base_url;
    if (api_key !== undefined) updates.api_key = api_key;
    if (is_active !== undefined) updates.is_active = is_active;
    if (model_2k !== undefined) updates.model_2k = model_2k;
    if (model_4k !== undefined) updates.model_4k = model_4k;
    if (channel !== undefined) updates.channel = channel;
    
    const success = updateProxyApiConfig(updates);
    
    if (success) {
      const config = getProxyApiConfig();
      res.json({ 
        success: true, 
        message: '配置已更新',
        config: config ? {
          ...config,
          api_key_masked: config.api_key 
            ? config.api_key.slice(0, 8) + '...' + config.api_key.slice(-4)
            : null,
          api_key: undefined
        } : null
      });
    } else {
      res.status(400).json({ success: false, error: '更新失败' });
    }
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 切换通道 (native/proxy)
router.post('/channel', (req, res) => {
  const { channel } = req.body;
  
  if (!channel || !['native', 'proxy'].includes(channel)) {
    return res.status(400).json({ 
      success: false, 
      error: 'channel 必须是 "native" 或 "proxy"' 
    });
  }
  
  try {
    const success = updateProxyApiConfig({ channel: channel as 'native' | 'proxy' });
    
    if (success) {
      res.json({ 
        success: true, 
        message: `已切换到${channel === 'native' ? '原生Google API' : '中转API'}通道`,
        channel
      });
    } else {
      res.status(400).json({ success: false, error: '切换失败' });
    }
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 切换启用状态
router.post('/toggle', (req, res) => {
  try {
    const config = getProxyApiConfig();
    if (!config) {
      return res.status(404).json({ success: false, error: '配置不存在' });
    }
    
    const newActive = config.is_active ? 0 : 1;
    const success = updateProxyApiConfig({ is_active: newActive });
    
    if (success) {
      res.json({ 
        success: true, 
        message: newActive ? '中转API已启用' : '中转API已禁用',
        is_active: newActive
      });
    } else {
      res.status(400).json({ success: false, error: '切换失败' });
    }
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;

