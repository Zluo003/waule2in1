import { Router, Request, Response } from 'express';
import { 
  getAllGeminiKeys, 
  addGeminiKey, 
  updateGeminiKey, 
  deleteGeminiKey,
  GeminiKey 
} from '../db';

const router = Router();

function log(msg: string, data?: any) {
  const time = new Date().toISOString();
  console.log(`[${time}] [GeminiKeys] ${msg}`, data || '');
}

// 隐藏 API Key 的中间部分
function maskApiKey(key: string): string {
  if (key.length <= 12) return key;
  return key.substring(0, 6) + '...' + key.substring(key.length - 6);
}

// 获取所有 Keys
router.get('/', (req: Request, res: Response) => {
  try {
    const keys = getAllGeminiKeys();
    // 返回时隐藏完整 key
    const maskedKeys = keys.map(k => ({
      ...k,
      api_key_masked: maskApiKey(k.api_key),
      api_key: undefined, // 不返回完整 key
    }));
    res.json({ success: true, keys: maskedKeys });
  } catch (error: any) {
    log(`获取 Keys 失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取统计信息
router.get('/stats', (req: Request, res: Response) => {
  try {
    const keys = getAllGeminiKeys();
    const stats = {
      total: keys.length,
      active: keys.filter(k => k.is_active).length,
      inactive: keys.filter(k => !k.is_active).length,
      total_requests: keys.reduce((sum, k) => sum + k.request_count, 0),
      total_errors: keys.reduce((sum, k) => sum + k.error_count, 0),
    };
    res.json({ success: true, stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 添加 Key
router.post('/', (req: Request, res: Response) => {
  try {
    const { api_key, name } = req.body;
    
    if (!api_key || typeof api_key !== 'string') {
      return res.status(400).json({ success: false, error: 'API Key is required' });
    }

    const trimmedKey = api_key.trim();
    if (!trimmedKey.startsWith('AIza')) {
      return res.status(400).json({ success: false, error: 'Invalid API Key format' });
    }

    const newKey = addGeminiKey(trimmedKey, name);
    if (!newKey) {
      return res.status(409).json({ success: false, error: 'API Key already exists' });
    }

    log(`添加 Key: ${maskApiKey(trimmedKey)}`);
    res.json({ 
      success: true, 
      key: { 
        ...newKey, 
        api_key_masked: maskApiKey(newKey.api_key),
        api_key: undefined 
      } 
    });
  } catch (error: any) {
    log(`添加 Key 失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量添加 Keys
router.post('/batch', (req: Request, res: Response) => {
  try {
    const { keys } = req.body;
    
    if (!Array.isArray(keys)) {
      return res.status(400).json({ success: false, error: 'Keys must be an array' });
    }

    let added = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const item of keys) {
      const apiKey = typeof item === 'string' ? item : item.api_key;
      const name = typeof item === 'object' ? item.name : undefined;
      
      if (!apiKey || !apiKey.trim().startsWith('AIza')) {
        skipped++;
        continue;
      }

      const result = addGeminiKey(apiKey.trim(), name);
      if (result) {
        added++;
      } else {
        skipped++;
      }
    }

    log(`批量添加: 成功 ${added}, 跳过 ${skipped}`);
    res.json({ success: true, added, skipped });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新 Key
router.put('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { name, is_active, api_key } = req.body;

    const updates: Partial<GeminiKey> = {};
    if (name !== undefined) updates.name = name;
    if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;
    if (api_key !== undefined) updates.api_key = api_key;

    const success = updateGeminiKey(id, updates);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Key not found' });
    }

    log(`更新 Key ID: ${id}`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 启用/禁用 Key
router.post('/:id/toggle', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const keys = getAllGeminiKeys();
    const key = keys.find(k => k.id === id);
    
    if (!key) {
      return res.status(404).json({ success: false, error: 'Key not found' });
    }

    const newStatus = key.is_active ? 0 : 1;
    updateGeminiKey(id, { is_active: newStatus });

    log(`切换 Key 状态 ID: ${id}, 新状态: ${newStatus ? '启用' : '禁用'}`);
    res.json({ success: true, is_active: newStatus === 1 });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除 Key
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const success = deleteGeminiKey(id);
    
    if (!success) {
      return res.status(404).json({ success: false, error: 'Key not found' });
    }

    log(`删除 Key ID: ${id}`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 测试 Key
router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const keys = getAllGeminiKeys();
    const key = keys.find(k => k.id === id);
    
    if (!key) {
      return res.status(404).json({ success: false, error: 'Key not found' });
    }

    // 简单测试：列出模型
    const axios = require('axios');
    const response = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key.api_key}`,
      { timeout: 10000 }
    );

    const models = response.data?.models?.length || 0;
    log(`测试 Key ID: ${id}, 可用模型: ${models}`);
    
    res.json({ success: true, message: `Key valid, ${models} models available` });
  } catch (error: any) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    log(`测试 Key 失败 ID: ${req.params.id}, 错误: ${errorMsg}`);
    res.status(400).json({ success: false, error: errorMsg });
  }
});

export { router as geminiKeysRouter };
