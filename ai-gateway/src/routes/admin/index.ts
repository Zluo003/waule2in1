import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { adminAuth, sessionStore } from '../../middleware/auth';
import { getAdminCredentials, setConfig, getAllConfigs } from '../../config';
import {
  getApiKeys, addApiKey, updateApiKey, deleteApiKey, getStats, getRequestLogs,
  getChannels, getChannelById, addChannel, updateChannel, deleteChannel,
  getModelChannels, addModelChannel, updateModelChannel, deleteModelChannel,
  getChannelKeys, addChannelKey, updateChannelKey, deleteChannelKey,
  getDiscordAccounts, addDiscordAccount, updateDiscordAccount, deleteDiscordAccount,
  getMjTasksByStatus
} from '../../database';
import { resetOssClient } from '../../services/storage';
import { midjourneyService } from '../../services/midjourney';

const router = Router();

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const credentials = getAdminCredentials();

  if (username === credentials.username && password === credentials.password) {
    const sessionToken = uuidv4();
    sessionStore.set(sessionToken, {
      username,
      expires: Date.now() + 24 * 60 * 60 * 1000 // 24小时
    });
    res.cookie('session', sessionToken, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000, sameSite: 'lax' });
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: '用户名或密码错误' });
  }
});

// 登出
router.post('/logout', (req, res) => {
  const sessionToken = req.cookies?.session;
  if (sessionToken) {
    sessionStore.delete(sessionToken);
  }
  res.clearCookie('session');
  res.json({ success: true });
});

// 检查认证状态
router.get('/auth/check', (req, res) => {
  const sessionToken = req.cookies?.session;
  if (sessionToken && sessionStore.has(sessionToken)) {
    const session = sessionStore.get(sessionToken);
    if (session && session.expires > Date.now()) {
      return res.json({ authenticated: true, username: session.username });
    }
  }
  res.json({ authenticated: false });
});

// 以下接口需要认证
router.use(adminAuth);

// 获取统计数据
router.get('/stats', (req, res) => {
  const stats = getStats();
  res.json(stats);
});

// API密钥管理
router.get('/keys', (req, res) => {
  const provider = req.query.provider as string | undefined;
  const keys = getApiKeys(provider);
  // 隐藏完整密钥
  const maskedKeys = keys.map(k => ({
    ...k,
    api_key: k.api_key.slice(0, 8) + '****' + k.api_key.slice(-4)
  }));
  res.json({ data: maskedKeys });
});

router.post('/keys', (req, res) => {
  const { provider, name, api_key } = req.body;
  if (!provider || !name || !api_key) {
    return res.status(400).json({ error: 'provider, name, and api_key are required' });
  }
  const id = addApiKey(provider, name, api_key);
  res.json({ success: true, id });
});

router.put('/keys/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { name, api_key, is_active, storage_type } = req.body;
  updateApiKey(id, { name, api_key, is_active, storage_type });
  res.json({ success: true });
});

router.delete('/keys/:id', (req, res) => {
  const id = parseInt(req.params.id);
  deleteApiKey(id);
  res.json({ success: true });
});

// 系统配置
router.get('/config', (req, res) => {
  const configs = getAllConfigs();
  // 隐藏敏感信息，过滤掉不需要的配置
  const safeConfigs = { ...configs };
  if (safeConfigs.admin_password) safeConfigs.admin_password = '******';
  if (safeConfigs.oss_access_key_secret) safeConfigs.oss_access_key_secret = '******';
  // 移除旧的 storage_type 配置（现在在每个供应商的 API Key 上单独设置）
  delete safeConfigs.storage_type;
  res.json(safeConfigs);
});

router.post('/config', (req, res) => {
  const updates = req.body;
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === 'string') {
      setConfig(key, value);
    }
  }
  // 如果更新了OSS配置，重置客户端
  if (updates.oss_bucket || updates.oss_region || updates.oss_access_key_id || updates.oss_access_key_secret) {
    resetOssClient();
  }
  res.json({ success: true });
});

// 修改密码
router.post('/password', (req, res) => {
  const { old_password, new_password } = req.body;
  const credentials = getAdminCredentials();

  if (old_password !== credentials.password) {
    return res.status(400).json({ error: '原密码错误' });
  }

  setConfig('admin_password', new_password);
  res.json({ success: true });
});

// 请求日志
router.get('/logs', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;
  const provider = req.query.provider as string | undefined;
  const result = getRequestLogs(limit, offset, provider);
  res.json(result);
});

// 渠道管理
router.get('/channels', (req, res) => {
  const provider = req.query.provider as string | undefined;
  const channels = getChannels(provider);
  res.json({ data: channels });
});

router.get('/channels/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const channel = getChannelById(id);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  res.json(channel);
});

router.post('/channels', (req, res) => {
  const { name, provider, channel_type, base_url } = req.body;
  if (!name || !provider || !channel_type) {
    return res.status(400).json({ error: 'name, provider, and channel_type are required' });
  }
  const id = addChannel({ name, provider, channel_type, base_url });
  res.json({ success: true, id });
});

router.put('/channels/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { name, channel_type, base_url, storage_type, is_active } = req.body;
  updateChannel(id, { name, channel_type, base_url, storage_type, is_active });
  res.json({ success: true });
});

router.delete('/channels/:id', (req, res) => {
  const id = parseInt(req.params.id);
  deleteChannel(id);
  res.json({ success: true });
});

// 渠道密钥管理
router.get('/channels/:channelId/keys', (req, res) => {
  const channelId = parseInt(req.params.channelId);
  const keys = getChannelKeys(channelId);
  const maskedKeys = keys.map(k => ({
    ...k,
    api_key: k.api_key.slice(0, 8) + '****' + k.api_key.slice(-4)
  }));
  res.json({ data: maskedKeys });
});

router.post('/channels/:channelId/keys', (req, res) => {
  const channelId = parseInt(req.params.channelId);
  const { name, api_key } = req.body;
  if (!name || !api_key) {
    return res.status(400).json({ error: 'name and api_key are required' });
  }
  const id = addChannelKey({ channel_id: channelId, name, api_key });
  res.json({ success: true, id });
});

router.put('/channel-keys/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { name, api_key, is_active } = req.body;
  updateChannelKey(id, { name, api_key, is_active });
  res.json({ success: true });
});

router.delete('/channel-keys/:id', (req, res) => {
  const id = parseInt(req.params.id);
  deleteChannelKey(id);
  res.json({ success: true });
});

// 模型渠道映射管理
router.get('/model-channels', (req, res) => {
  const model = req.query.model as string | undefined;
  const mappings = getModelChannels(model);
  // 附加渠道信息
  const result = mappings.map(m => {
    const channel = getChannelById(m.channel_id);
    return { ...m, channel: channel ? { id: channel.id, name: channel.name, channel_type: channel.channel_type } : null };
  });
  res.json({ data: result });
});

router.post('/model-channels', (req, res) => {
  const { model_name, channel_id, target_models } = req.body;
  if (!model_name || !channel_id) {
    return res.status(400).json({ error: 'model_name and channel_id are required' });
  }
  const id = addModelChannel({ model_name, channel_id, target_models });
  res.json({ success: true, id });
});

router.put('/model-channels/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { channel_id, target_models, is_active } = req.body;
  updateModelChannel(id, { channel_id, target_models, is_active });
  res.json({ success: true });
});

router.delete('/model-channels/:id', (req, res) => {
  const id = parseInt(req.params.id);
  deleteModelChannel(id);
  res.json({ success: true });
});

// ==================== Midjourney / Discord 账号管理 ====================

// Discord 账号列表
router.get('/discord-accounts', (req, res) => {
  const accounts = getDiscordAccounts();
  const masked = accounts.map(a => ({
    ...a,
    user_token: a.user_token.slice(0, 10) + '****'
  }));
  res.json({ data: masked });
});

// 添加 Discord 账号
router.post('/discord-accounts', (req, res) => {
  const { name, user_token, guild_id, channel_id } = req.body;
  if (!user_token || !guild_id || !channel_id) {
    return res.status(400).json({ error: 'user_token, guild_id, channel_id are required' });
  }
  const id = addDiscordAccount({ name, user_token, guild_id, channel_id });
  res.json({ success: true, id });
});

// 更新 Discord 账号
router.put('/discord-accounts/:id', (req, res) => {
  const id = parseInt(req.params.id);
  updateDiscordAccount(id, req.body);
  res.json({ success: true });
});

// 删除 Discord 账号
router.delete('/discord-accounts/:id', (req, res) => {
  const id = parseInt(req.params.id);
  deleteDiscordAccount(id);
  res.json({ success: true });
});

// Midjourney 服务状态
router.get('/midjourney/status', (_req, res) => {
  const status = midjourneyService.getStatus();
  res.json({ ready: midjourneyService.ready, connections: status });
});

// 重新加载 Midjourney 连接
router.post('/midjourney/reload', async (_req, res) => {
  try {
    await midjourneyService.reload();
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Midjourney 任务列表
router.get('/midjourney/tasks', (req, res) => {
  const status = (req.query.status as string) || 'SUCCESS';
  const limit = parseInt(req.query.limit as string) || 20;
  const tasks = getMjTasksByStatus(status).slice(0, limit);
  res.json({ data: tasks });
});

export default router;
