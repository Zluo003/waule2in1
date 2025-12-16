import { Router, Request, Response } from 'express';
import {
  getAllDiscordAccounts,
  getDiscordAccount,
  addDiscordAccount,
  updateDiscordAccount,
  deleteDiscordAccount,
  getDiscordAccountStats,
  DiscordAccount,
} from '../db';

const router = Router();

// 获取所有Discord账号
router.get('/', (req: Request, res: Response) => {
  try {
    const accounts = getAllDiscordAccounts();
    // 脱敏处理：隐藏token中间部分
    const maskedAccounts = accounts.map(a => ({
      ...a,
      user_token_masked: a.user_token ? `${a.user_token.slice(0, 20)}...${a.user_token.slice(-10)}` : '',
    }));
    res.json({ success: true, accounts: maskedAccounts });
  } catch (e) {
    res.status(500).json({ success: false, error: '获取账号列表失败' });
  }
});

// 获取统计信息
router.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = getDiscordAccountStats();
    res.json({ success: true, stats });
  } catch (e) {
    res.status(500).json({ success: false, error: '获取统计失败' });
  }
});

// 获取单个账号详情
router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const account = getDiscordAccount(id);
    if (!account) {
      return res.status(404).json({ success: false, error: '账号不存在' });
    }
    res.json({
      success: true,
      account: {
        ...account,
        user_token_masked: account.user_token ? `${account.user_token.slice(0, 20)}...${account.user_token.slice(-10)}` : '',
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: '获取账号详情失败' });
  }
});

// 添加Discord账号
router.post('/', (req: Request, res: Response) => {
  try {
    const { user_token, guild_id, channel_id, name } = req.body;
    
    if (!user_token || !guild_id || !channel_id) {
      return res.status(400).json({ success: false, error: '请填写必填字段：User Token、Guild ID、Channel ID' });
    }
    
    const account = addDiscordAccount(user_token, guild_id, channel_id, name);
    if (!account) {
      return res.status(400).json({ success: false, error: '添加失败，可能Token已存在' });
    }
    
    res.json({
      success: true,
      account: {
        ...account,
        user_token_masked: account.user_token ? `${account.user_token.slice(0, 20)}...${account.user_token.slice(-10)}` : '',
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: '添加账号失败' });
  }
});

// 更新Discord账号
router.put('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { name, user_token, guild_id, channel_id, is_active } = req.body;
    
    const updates: Partial<DiscordAccount> = {};
    if (name !== undefined) updates.name = name;
    if (user_token !== undefined) updates.user_token = user_token;
    if (guild_id !== undefined) updates.guild_id = guild_id;
    if (channel_id !== undefined) updates.channel_id = channel_id;
    if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;
    
    const success = updateDiscordAccount(id, updates);
    if (!success) {
      return res.status(400).json({ success: false, error: '更新失败' });
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: '更新账号失败' });
  }
});

// 切换账号状态
router.post('/:id/toggle', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const account = getDiscordAccount(id);
    if (!account) {
      return res.status(404).json({ success: false, error: '账号不存在' });
    }
    
    const success = updateDiscordAccount(id, { is_active: account.is_active ? 0 : 1 });
    res.json({ success, is_active: !account.is_active });
  } catch (e) {
    res.status(500).json({ success: false, error: '切换状态失败' });
  }
});

// 删除Discord账号
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const success = deleteDiscordAccount(id);
    res.json({ success });
  } catch (e) {
    res.status(500).json({ success: false, error: '删除账号失败' });
  }
});

export default router;
