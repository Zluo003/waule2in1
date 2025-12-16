import { Router } from 'express';
import { getPlatformOSS, updatePlatformOSS } from '../db';
import OSS from 'ali-oss';

const router = Router();

// 获取平台OSS配置（脱敏）
router.get('/', (req, res) => {
  try {
    const config = getPlatformOSS();
    if (config) {
      res.json({
        success: true,
        config: {
          provider: config.provider,
          region: config.region,
          bucket: config.bucket,
          access_key_id: config.access_key_id ? config.access_key_id.slice(0, 6) + '***' : null,
          custom_domain: config.custom_domain,
          is_active: config.is_active,
          updated_at: config.updated_at,
        },
      });
    } else {
      res.json({ success: true, config: null });
    }
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 更新平台OSS配置
router.put('/', async (req, res) => {
  const { region, bucket, access_key_id, access_key_secret, custom_domain, is_active } = req.body;
  
  try {
    // 如果提供了完整配置，先验证
    if (region && bucket && access_key_id && access_key_secret) {
      const client = new OSS({
        region,
        accessKeyId: access_key_id,
        accessKeySecret: access_key_secret,
        bucket,
      });
      
      try {
        await (client as any).list({ 'max-keys': 1 });
      } catch (e: any) {
        return res.status(400).json({ success: false, error: `OSS 验证失败: ${e.message}` });
      }
    }
    
    const updates: any = {};
    if (region !== undefined) updates.region = region;
    if (bucket !== undefined) updates.bucket = bucket;
    if (access_key_id !== undefined) updates.access_key_id = access_key_id;
    if (access_key_secret !== undefined) updates.access_key_secret = access_key_secret;
    if (custom_domain !== undefined) updates.custom_domain = custom_domain;
    if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;
    
    const updated = updatePlatformOSS(updates);
    res.json({ success: updated, message: updated ? 'OSS 配置已更新' : '无变更' });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 测试OSS连接
router.post('/test', async (req, res) => {
  const { region, bucket, access_key_id, access_key_secret } = req.body;
  
  if (!region || !bucket || !access_key_id || !access_key_secret) {
    return res.status(400).json({ success: false, error: '缺少必要参数' });
  }
  
  try {
    const client = new OSS({
      region,
      accessKeyId: access_key_id,
      accessKeySecret: access_key_secret,
      bucket,
    });
    
    await (client as any).list({ 'max-keys': 1 });
    res.json({ success: true, message: 'OSS 连接成功' });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

export default router;
