import { Router } from 'express';
import {
  PROVIDERS,
  getAllProviderKeys,
  getProviderKeys,
  addProviderKey,
  updateProviderKey,
  deleteProviderKey,
  getProviderStats,
} from '../db';

const router = Router();

// 获取所有供应商列表
router.get('/providers', (req, res) => {
  res.json({ success: true, providers: PROVIDERS });
});

// 获取统计信息
router.get('/stats', (req, res) => {
  try {
    const stats = getProviderStats();
    res.json({ success: true, stats });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 获取所有API Keys（按供应商分组）
router.get('/', (req, res) => {
  try {
    const keys = getAllProviderKeys();
    // 按供应商分组
    const grouped: Record<string, any[]> = {};
    for (const key of keys) {
      if (!grouped[key.provider]) grouped[key.provider] = [];
      grouped[key.provider].push({
        ...key,
        api_key_masked: key.api_key.slice(0, 8) + '...' + key.api_key.slice(-4),
      });
    }
    res.json({ success: true, keys: grouped });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 获取指定供应商的API Keys
router.get('/:provider', (req, res) => {
  try {
    const keys = getProviderKeys(req.params.provider);
    res.json({
      success: true,
      keys: keys.map(k => ({
        ...k,
        api_key_masked: k.api_key.slice(0, 8) + '...' + k.api_key.slice(-4),
      })),
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 添加API Key
router.post('/', (req, res) => {
  const { provider, api_key, name } = req.body;
  
  if (!provider || !api_key) {
    return res.status(400).json({ success: false, error: '缺少 provider 或 api_key' });
  }
  
  // 验证供应商
  if (!PROVIDERS.find(p => p.id === provider)) {
    return res.status(400).json({ success: false, error: '无效的供应商' });
  }
  
  try {
    const key = addProviderKey(provider, api_key, name);
    if (key) {
      res.json({
        success: true,
        key: { ...key, api_key_masked: key.api_key.slice(0, 8) + '...' + key.api_key.slice(-4) },
      });
    } else {
      res.status(409).json({ success: false, error: '该 API Key 已存在' });
    }
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 批量添加API Keys
router.post('/batch', (req, res) => {
  const { provider, keys } = req.body;
  
  if (!provider || !Array.isArray(keys)) {
    return res.status(400).json({ success: false, error: '缺少 provider 或 keys' });
  }
  
  let added = 0, skipped = 0;
  for (const apiKey of keys) {
    const key = addProviderKey(provider, apiKey.trim());
    if (key) added++;
    else skipped++;
  }
  
  res.json({ success: true, added, skipped });
});

// 更新API Key
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { name, is_active } = req.body;
  
  try {
    const updated = updateProviderKey(id, { name, is_active });
    res.json({ success: updated });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 切换启用状态
router.post('/:id/toggle', (req, res) => {
  const id = parseInt(req.params.id);
  const keys = getAllProviderKeys();
  const key = keys.find(k => k.id === id);
  
  if (!key) {
    return res.status(404).json({ success: false, error: 'Key 不存在' });
  }
  
  try {
    const updated = updateProviderKey(id, { is_active: key.is_active ? 0 : 1 });
    res.json({ success: updated, is_active: !key.is_active });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 删除API Key
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  
  try {
    const deleted = deleteProviderKey(id);
    res.json({ success: deleted });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
