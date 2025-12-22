/**
 * Gemini 3 Pro Image Preview 中转API配置管理路由
 * 
 * GET  /api/gemini3-proxy-config      - 获取配置
 * PUT  /api/gemini3-proxy-config      - 更新配置
 * POST /api/gemini3-proxy-config/channel - 切换通道
 * POST /api/gemini3-proxy-config/test    - 测试API连接
 */

import { Router } from 'express';
import { getGemini3ProxyConfig, updateGemini3ProxyConfig, Gemini3ProxyConfig } from '../db';

const router = Router();

// 预设的中转API提供商列表
const PROXY_PROVIDERS = [
  {
    id: 'my-api-key-cc',
    name: 'My API Key CC',
    baseUrl: 'https://my.api-key.cc',
    model: 'gemini-3-pro-image-preview',
    description: 'Gemini 3 Pro Image Preview 中转服务',
  },
  {
    id: 'future-api',
    name: 'Future API',
    baseUrl: 'https://future-api.vodeshop.com',
    model: 'gemini-2.5-flash-image',
    description: '备用中转服务',
  },
  {
    id: 'custom',
    name: '自定义',
    baseUrl: '',
    model: '',
    description: '使用自定义API端点',
  },
];

// 获取提供商列表
router.get('/providers', (req, res) => {
  res.json({ success: true, providers: PROXY_PROVIDERS });
});

// 获取中转API配置
router.get('/', (req, res) => {
  try {
    const config = getGemini3ProxyConfig();
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
    
    res.json({ success: true, config: maskedConfig, providers: PROXY_PROVIDERS });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 更新中转API配置
router.put('/', (req, res) => {
  const { provider, base_url, api_key, model, is_active, channel } = req.body;
  
  try {
    const updates: Partial<Gemini3ProxyConfig> = {};
    
    if (provider !== undefined) {
      updates.provider = provider;
      // 如果选择了预设提供商，自动填充baseUrl和model
      const preset = PROXY_PROVIDERS.find(p => p.id === provider);
      if (preset && preset.id !== 'custom') {
        if (!base_url) updates.base_url = preset.baseUrl;
        if (!model) updates.model = preset.model;
      }
    }
    if (base_url !== undefined) updates.base_url = base_url;
    if (api_key !== undefined) updates.api_key = api_key;
    if (model !== undefined) updates.model = model;
    if (is_active !== undefined) updates.is_active = is_active;
    if (channel !== undefined) updates.channel = channel;
    
    const success = updateGemini3ProxyConfig(updates);
    
    if (success) {
      const config = getGemini3ProxyConfig();
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
    const success = updateGemini3ProxyConfig({ channel: channel as 'native' | 'proxy' });
    
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
    const config = getGemini3ProxyConfig();
    if (!config) {
      return res.status(404).json({ success: false, error: '配置不存在' });
    }
    
    const newActive = config.is_active ? 0 : 1;
    const success = updateGemini3ProxyConfig({ is_active: newActive });
    
    if (success) {
      res.json({ 
        success: true, 
        message: newActive ? 'Gemini 3 Pro 中转API已启用' : 'Gemini 3 Pro 中转API已禁用',
        is_active: newActive
      });
    } else {
      res.status(400).json({ success: false, error: '切换失败' });
    }
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 测试API连接
router.post('/test', async (req, res) => {
  try {
    const config = getGemini3ProxyConfig();
    if (!config || !config.api_key) {
      return res.status(400).json({ success: false, error: '请先配置API Key' });
    }
    
    const axios = require('axios');
    const baseUrl = config.base_url || 'https://my.api-key.cc';
    const model = config.model || 'gemini-3-pro-image-preview';
    
    console.log(`[Gemini3ProxyConfig] 测试API连接: ${baseUrl}`);
    
    // 发送简单的测试请求
    const startTime = Date.now();
    const response = await axios.post(
      `${baseUrl}/v1/chat/completions`,
      {
        model: model,
        messages: [{ role: 'user', content: '测试连接' }],
        max_tokens: 10,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.api_key}`
        },
        timeout: 30000
      }
    );
    
    const duration = Date.now() - startTime;
    
    res.json({ 
      success: true, 
      message: `API连接成功，响应时间: ${duration}ms`,
      duration,
      model: model,
      baseUrl: baseUrl,
    });
    
  } catch (e: any) {
    const errorMsg = e.response?.data?.error?.message || e.response?.data?.message || e.message;
    console.error(`[Gemini3ProxyConfig] 测试失败:`, errorMsg);
    res.status(400).json({ 
      success: false, 
      error: `API连接失败: ${errorMsg}` 
    });
  }
});

export default router;
