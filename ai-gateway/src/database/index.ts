import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'gateway.db');

let db: Database.Database | null = null;

// 初始化默认渠道和模型配置
function initDefaultChannels() {
  if (!db) return;

  // 检查是否已有渠道数据
  const count = db.prepare('SELECT COUNT(*) as count FROM channels').pluck().get() as number;
  if (count > 0) {
    return; // 已有数据，跳过初始化
  }

  // 默认渠道配置（每个 provider 一个官方渠道）
  const defaultChannels = [
    { name: 'Doubao 官方', provider: 'doubao', channel_type: 'official' },
    { name: 'Vidu 官方', provider: 'vidu', channel_type: 'official' },
    { name: '通义万相 官方', provider: 'wanx', channel_type: 'official' },
    { name: 'MiniMax 官方', provider: 'minimax', channel_type: 'official' },
    { name: 'Sora 官方', provider: 'sora', channel_type: 'official' },
    { name: 'Veo 官方', provider: 'veo', channel_type: 'official' },
    { name: 'Gemini 官方', provider: 'gemini', channel_type: 'official' },
    { name: 'Midjourney 官方', provider: 'midjourney', channel_type: 'official' },
  ];

  // 模型到 provider 的映射（基于代码中实际使用的默认模型）
  const defaultModels = [
    // Doubao - 图片: doubao-seedream-4-5-251128, 视频: doubao-seedance-1-0-pro-250528
    { model_name: 'doubao-seedream-4-5-251128', provider: 'doubao' },
    { model_name: 'doubao-seedance-1-0-pro-250528', provider: 'doubao' },
    // Vidu - 视频: vidu-q2
    { model_name: 'vidu-q2', provider: 'vidu' },
    // 通义万相 - 图片: wanx-v1, 视频: wanx-video-synthesis, videoretalk, video-style-transform, 语音: cosyvoice-v1
    { model_name: 'wanx-v1', provider: 'wanx' },
    { model_name: 'wanx-video-synthesis', provider: 'wanx' },
    { model_name: 'videoretalk', provider: 'wanx' },
    { model_name: 'video-style-transform', provider: 'wanx' },
    { model_name: 'cosyvoice-v1', provider: 'wanx' },
    // MiniMax - 图片: image-01, 视频: video-01, 语音: speech-01
    { model_name: 'image-01', provider: 'minimax' },
    { model_name: 'video-01', provider: 'minimax' },
    { model_name: 'speech-01', provider: 'minimax' },
    // Sora - 视频: sora-2
    { model_name: 'sora-2', provider: 'sora' },
    // Veo - 视频: veo3.1
    { model_name: 'veo3.1', provider: 'veo' },
    // Gemini - 图片: gemini-3-pro-image-preview, 对话: gemini-3-pro-preview, gemini-3-flash-preview
    { model_name: 'gemini-3-pro-preview', provider: 'gemini' },
    { model_name: 'gemini-3-flash-preview', provider: 'gemini' },
    { model_name: 'gemini-3-pro-image-preview', provider: 'gemini' },
  ];

  // 插入渠道并记录 ID
  const channelIds: Record<string, number> = {};
  const insertChannel = db.prepare('INSERT INTO channels (name, provider, channel_type) VALUES (?, ?, ?)');
  for (const ch of defaultChannels) {
    const result = insertChannel.run(ch.name, ch.provider, ch.channel_type);
    channelIds[ch.provider] = Number(result.lastInsertRowid);
  }

  // 插入模型渠道映射
  const insertModelChannel = db.prepare('INSERT INTO model_channels (model_name, channel_id) VALUES (?, ?)');
  for (const m of defaultModels) {
    const channelId = channelIds[m.provider];
    if (channelId) {
      insertModelChannel.run(m.model_name, channelId);
    }
  }

  console.log('[DB] 已初始化默认渠道和模型配置');
}

// 初始化表结构
function initTables() {
  if (!db) return;

  db.prepare(`CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, name TEXT NOT NULL, api_key TEXT NOT NULL, is_active INTEGER DEFAULT 1, use_count INTEGER DEFAULT 0, success_count INTEGER DEFAULT 0, fail_count INTEGER DEFAULT 0, last_used_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, storage_type TEXT DEFAULT 'forward')`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS request_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, endpoint TEXT NOT NULL, model TEXT, status TEXT NOT NULL, duration INTEGER, error_message TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();

  // 渠道表 - 支持官方和多个中转
  db.prepare(`CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    channel_type TEXT NOT NULL DEFAULT 'official',
    base_url TEXT,
    storage_type TEXT DEFAULT 'forward',
    is_active INTEGER DEFAULT 1,
    use_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();

  // 渠道密钥表 - 支持一个渠道多个key轮询
  db.prepare(`CREATE TABLE IF NOT EXISTS channel_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    api_key TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    use_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    consecutive_fails INTEGER DEFAULT 0,
    last_used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES channels(id)
  )`).run();

  // 模型渠道映射表 - 每个模型只能配置一个渠道
  db.prepare(`CREATE TABLE IF NOT EXISTS model_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_name TEXT NOT NULL UNIQUE,
    channel_id INTEGER NOT NULL,
    target_models TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES channels(id)
  )`).run();

  // 迁移：为旧数据添加 target_models 字段
  try {
    db.prepare(`ALTER TABLE model_channels ADD COLUMN target_models TEXT`).run();
  } catch (e) {
    // 字段已存在，忽略
  }

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON api_keys(provider)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_request_logs_provider ON request_logs(provider)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_channels_provider ON channels(provider)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_channel_keys_channel ON channel_keys(channel_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_model_channels_model ON model_channels(model_name)`).run();

  // 迁移：为 channels 表添加 storage_type 字段
  try {
    db.prepare(`ALTER TABLE channels ADD COLUMN storage_type TEXT DEFAULT 'forward'`).run();
  } catch (e) {
    // 字段已存在，忽略
  }

  // 迁移：为 channel_keys 表添加 consecutive_fails 字段
  try {
    db.prepare(`ALTER TABLE channel_keys ADD COLUMN consecutive_fails INTEGER DEFAULT 0`).run();
  } catch (e) {
    // 字段已存在，忽略
  }

  // Midjourney Discord 账号表
  db.prepare(`CREATE TABLE IF NOT EXISTS discord_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    user_token TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    request_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    last_used_at DATETIME,
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_token)
  )`).run();

  // Midjourney 任务表
  db.prepare(`CREATE TABLE IF NOT EXISTS mj_tasks (
    task_id TEXT PRIMARY KEY,
    user_id TEXT,
    account_id INTEGER,
    prompt TEXT,
    status TEXT DEFAULT 'SUBMITTED',
    message_id TEXT,
    message_hash TEXT,
    image_url TEXT,
    oss_url TEXT,
    progress TEXT,
    buttons TEXT,
    fail_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_mj_tasks_status ON mj_tasks(status)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_mj_tasks_user ON mj_tasks(user_id)`).run();

  // Sora 中转 API 配置表
  db.prepare(`CREATE TABLE IF NOT EXISTS sora_proxy_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT DEFAULT 'future-api',
    base_url TEXT DEFAULT 'https://future-api.vodeshop.com',
    api_key TEXT,
    is_active INTEGER DEFAULT 0,
    channel TEXT DEFAULT 'future-sora-api',
    request_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    last_used_at DATETIME,
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();

  // 初始化 Sora 配置（如果不存在）
  const soraConfig = db.prepare('SELECT id FROM sora_proxy_config LIMIT 1').get();
  if (!soraConfig) {
    db.prepare('INSERT INTO sora_proxy_config (provider, base_url) VALUES (?, ?)').run('future-api', 'https://future-api.vodeshop.com');
  }

  // 初始化默认渠道和模型配置（如果不存在）
  initDefaultChannels();

  const defaultConfigs: Record<string, string> = {
    'admin_username': process.env.ADMIN_USERNAME || 'admin',
    'admin_password': process.env.ADMIN_PASSWORD || 'admin',
    'api_secret': process.env.API_SECRET || 'ai-gateway-secret',
    'oss_bucket': '', 'oss_region': '', 'oss_access_key_id': '', 'oss_access_key_secret': '', 'oss_endpoint': '', 'oss_cdn_url': '',
    'mj_command_id': process.env.MJ_COMMAND_ID || '',
    'mj_version_id': process.env.MJ_VERSION_ID || '',
  };

  const insertConfig = db.prepare('INSERT OR IGNORE INTO system_config (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaultConfigs)) {
    insertConfig.run(key, value);
  }
}

// 初始化数据库（必须在应用启动时调用）
// 初始化数据库（必须在应用启动时调用）
export async function initDatabase(): Promise<void> {
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  initTables();
  // saveDatabase is no longer needed as better-sqlite3 writes to disk immediately
}

function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

// 配置操作
// 配置操作
export function getConfig(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM system_config WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setConfig(key: string, value: string): void {
  getDb().prepare("INSERT INTO system_config (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')").run(key, value, value);
}

export function getAllConfigs(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM system_config').all() as { key: string; value: string }[];
  if (rows.length === 0) return {};
  return Object.fromEntries(rows.map(row => [row.key, row.value]));
}

// API密钥操作
export interface ApiKey {
  id: number; provider: string; name: string; api_key: string; is_active: number;
  use_count: number; success_count: number; fail_count: number; last_used_at: string | null; created_at: string;
  storage_type: 'oss' | 'local' | 'forward'; // 存储方式：oss/本地/转发
}

function rowToApiKey(row: any): ApiKey {
  return row as ApiKey;
}

export function getApiKeys(provider?: string): ApiKey[] {
  const d = getDb();
  const rows = provider
    ? d.prepare('SELECT * FROM api_keys WHERE provider = ? ORDER BY id').all(provider)
    : d.prepare('SELECT * FROM api_keys ORDER BY provider, id').all();
  return rows as ApiKey[];
}

export function getActiveApiKey(provider: string): ApiKey | null {
  const row = getDb().prepare('SELECT * FROM api_keys WHERE provider = ? AND is_active = 1 ORDER BY use_count ASC LIMIT 1').get(provider);
  return (row as ApiKey) || null;
}

export function addApiKey(provider: string, name: string, apiKey: string): number {
  const result = getDb().prepare('INSERT INTO api_keys (provider, name, api_key) VALUES (?, ?, ?)').run(provider, name, apiKey);
  return Number(result.lastInsertRowid);
}

export function updateApiKey(id: number, data: Partial<Pick<ApiKey, 'name' | 'api_key' | 'is_active' | 'storage_type'>>): void {
  const updates: string[] = [];
  const values: (string | number)[] = [];
  if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
  if (data.api_key !== undefined) { updates.push('api_key = ?'); values.push(data.api_key); }
  if (data.is_active !== undefined) { updates.push('is_active = ?'); values.push(data.is_active); }
  if (data.storage_type !== undefined) { updates.push('storage_type = ?'); values.push(data.storage_type); }
  if (updates.length === 0) return;
  values.push(id);
  getDb().prepare(`UPDATE api_keys SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteApiKey(id: number): void {
  getDb().prepare('DELETE FROM api_keys WHERE id = ?').run(id);
}

export function recordKeyUsage(id: number, success: boolean): void {
  const field = success ? 'success_count' : 'fail_count';
  getDb().prepare(`UPDATE api_keys SET use_count = use_count + 1, ${field} = ${field} + 1, last_used_at = datetime('now') WHERE id = ?`).run(id);
}

// 日志操作
export function addRequestLog(provider: string, endpoint: string, model: string | null, status: string, duration: number, errorMessage?: string): void {
  getDb().prepare('INSERT INTO request_logs (provider, endpoint, model, status, duration, error_message) VALUES (?, ?, ?, ?, ?, ?)').run(
    provider, endpoint, model, status, duration, errorMessage || null);
}

export function getRequestLogs(limit = 100, offset = 0, provider?: string): { logs: any[]; total: number } {
  const d = getDb();
  let count, logs;
  if (provider) {
    count = d.prepare('SELECT COUNT(*) as count FROM request_logs WHERE provider = ?').get(provider) as { count: number };
    logs = d.prepare('SELECT * FROM request_logs WHERE provider = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(provider, limit, offset);
  } else {
    count = d.prepare('SELECT COUNT(*) as count FROM request_logs').get() as { count: number };
    logs = d.prepare('SELECT * FROM request_logs ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  }
  return { logs, total: count ? count.count : 0 };
}

// 统计
export function getStats() {
  const d = getDb();
  const today = new Date().toISOString().split('T')[0];
  const todayRequests = d.prepare("SELECT COUNT(*) as count FROM request_logs WHERE date(created_at) = ?").get(today) as { count: number };
  const todaySuccess = d.prepare("SELECT COUNT(*) as count FROM request_logs WHERE date(created_at) = ? AND status = 'success'").get(today) as { count: number };
  const avgDuration = d.prepare("SELECT AVG(duration) as avg FROM request_logs WHERE date(created_at) = ? AND status = 'success'").get(today) as { avg: number | null };

  // api_keys 表的活跃/总数
  const activeApiKeys = d.prepare('SELECT COUNT(*) as count FROM api_keys WHERE is_active = 1').get() as { count: number };
  const totalApiKeys = d.prepare('SELECT COUNT(*) as count FROM api_keys').get() as { count: number };
  // channel_keys 表的活跃/总数
  const activeChannelKeys = d.prepare('SELECT COUNT(*) as count FROM channel_keys WHERE is_active = 1').get() as { count: number };
  const totalChannelKeys = d.prepare('SELECT COUNT(*) as count FROM channel_keys').get() as { count: number };
  // discord_accounts 表的活跃/总数 (Midjourney)
  const activeDiscordAccounts = d.prepare('SELECT COUNT(*) as count FROM discord_accounts WHERE is_active = 1').get() as { count: number };
  const totalDiscordAccounts = d.prepare('SELECT COUNT(*) as count FROM discord_accounts').get() as { count: number };

  const tr = todayRequests ? todayRequests.count : 0;
  const ts = todaySuccess ? todaySuccess.count : 0;
  const ad = avgDuration && avgDuration.avg !== null ? avgDuration.avg : 0;

  const akActive = (activeApiKeys ? activeApiKeys.count : 0) +
    (activeChannelKeys ? activeChannelKeys.count : 0) +
    (activeDiscordAccounts ? activeDiscordAccounts.count : 0);
  const akTotal = (totalApiKeys ? totalApiKeys.count : 0) +
    (totalChannelKeys ? totalChannelKeys.count : 0) +
    (totalDiscordAccounts ? totalDiscordAccounts.count : 0);

  // 按 provider 统计
  const providerList = ['doubao', 'vidu', 'wanx', 'minimax', 'sora', 'veo', 'gemini', 'midjourney'];
  const providerStats: Record<string, { calls: number; keys: string; rate: number }> = {};

  for (const provider of providerList) {
    // 今日调用数
    const calls = d.prepare("SELECT COUNT(*) as count FROM request_logs WHERE provider = ? AND date(created_at) = ?").get(provider, today) as { count: number };
    const callCount = calls ? calls.count : 0;

    // 今日成功数
    const success = d.prepare("SELECT COUNT(*) as count FROM request_logs WHERE provider = ? AND date(created_at) = ? AND status = 'success'").get(provider, today) as { count: number };
    const successCount = success ? success.count : 0;

    let providerActiveKeys = 0;
    let providerTotalKeys = 0;

    if (provider === 'midjourney') {
      // Midjourney 使用 Discord 账号
      const activeDA = d.prepare('SELECT COUNT(*) as count FROM discord_accounts WHERE is_active = 1').get() as { count: number };
      const totalDA = d.prepare('SELECT COUNT(*) as count FROM discord_accounts').get() as { count: number };
      providerActiveKeys = activeDA ? activeDA.count : 0;
      providerTotalKeys = totalDA ? totalDA.count : 0;
    } else {
      // API密钥数 (api_keys 表)
      const activeK = d.prepare('SELECT COUNT(*) as count FROM api_keys WHERE provider = ? AND is_active = 1').get(provider) as { count: number };
      const totalK = d.prepare('SELECT COUNT(*) as count FROM api_keys WHERE provider = ?').get(provider) as { count: number };
      const activeKCount = activeK ? activeK.count : 0;
      const totalKCount = totalK ? totalK.count : 0;

      // channel_keys 通过 channels 表关联
      const activeCK = d.prepare('SELECT COUNT(*) as count FROM channel_keys ck JOIN channels c ON ck.channel_id = c.id WHERE c.provider = ? AND ck.is_active = 1').get(provider) as { count: number };
      const totalCK = d.prepare('SELECT COUNT(*) as count FROM channel_keys ck JOIN channels c ON ck.channel_id = c.id WHERE c.provider = ?').get(provider) as { count: number };
      const activeCKCount = activeCK ? activeCK.count : 0;
      const totalCKCount = totalCK ? totalCK.count : 0;

      providerActiveKeys = activeKCount + activeCKCount;
      providerTotalKeys = totalKCount + totalCKCount;
    }

    providerStats[provider] = {
      calls: callCount,
      keys: `${providerActiveKeys}/${providerTotalKeys}`,
      rate: callCount > 0 ? Math.round((successCount / callCount) * 100) : 0
    };
  }

  return {
    todayRequests: tr,
    successRate: tr > 0 ? Math.round((ts / tr) * 100 * 10) / 10 : 0,
    activeKeys: `${akActive}/${akTotal}`,
    avgLatency: ad ? Math.round(ad / 100) / 10 : 0,
    providerStats
  };
}

// 渠道操作
export interface Channel {
  id: number;
  name: string;
  provider: string;
  channel_type: 'official' | 'proxy';
  base_url: string | null;
  storage_type: 'oss' | 'local' | 'forward';
  is_active: number;
  use_count: number;
  success_count: number;
  fail_count: number;
  created_at: string;
}

function rowToChannel(row: any): Channel {
  return row as Channel;
}

export function getChannels(provider?: string): Channel[] {
  const d = getDb();
  const rows = provider
    ? d.prepare('SELECT * FROM channels WHERE provider = ? ORDER BY id').all(provider)
    : d.prepare('SELECT * FROM channels ORDER BY provider, id').all();
  return rows as Channel[];
}

export function getChannelById(id: number): Channel | null {
  const row = getDb().prepare('SELECT * FROM channels WHERE id = ?').get(id);
  return (row as Channel) || null;
}

export function addChannel(data: { name: string; provider: string; channel_type: string; base_url?: string }): number {
  const result = getDb().prepare('INSERT INTO channels (name, provider, channel_type, base_url) VALUES (?, ?, ?, ?)').run(
    data.name, data.provider, data.channel_type, data.base_url || null);
  return Number(result.lastInsertRowid);
}

export function updateChannel(id: number, data: Partial<Pick<Channel, 'name' | 'channel_type' | 'base_url' | 'storage_type' | 'is_active'>>): void {
  const updates: string[] = [];
  const values: (string | number | null)[] = [];
  if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
  if (data.channel_type !== undefined) { updates.push('channel_type = ?'); values.push(data.channel_type); }
  if (data.base_url !== undefined) { updates.push('base_url = ?'); values.push(data.base_url); }
  if (data.storage_type !== undefined) { updates.push('storage_type = ?'); values.push(data.storage_type); }
  if (data.is_active !== undefined) { updates.push('is_active = ?'); values.push(data.is_active); }
  if (updates.length === 0) return;
  values.push(id);
  getDb().prepare(`UPDATE channels SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteChannel(id: number): void {
  getDb().prepare('DELETE FROM channel_keys WHERE channel_id = ?').run(id);
  getDb().prepare('DELETE FROM model_channels WHERE channel_id = ?').run(id);
  getDb().prepare('DELETE FROM channels WHERE id = ?').run(id);
}

export function recordChannelUsage(id: number, success: boolean): void {
  const field = success ? 'success_count' : 'fail_count';
  getDb().prepare(`UPDATE channels SET use_count = use_count + 1, ${field} = ${field} + 1 WHERE id = ?`).run(id);
}

// 渠道密钥操作
export interface ChannelKey {
  id: number;
  channel_id: number;
  name: string;
  api_key: string;
  is_active: number;
  use_count: number;
  success_count: number;
  fail_count: number;
  consecutive_fails: number;
  last_used_at: string | null;
  created_at: string;
}

function rowToChannelKey(row: any): ChannelKey {
  return row as ChannelKey;
}

export function getChannelKeys(channelId: number): ChannelKey[] {
  const rows = getDb().prepare('SELECT * FROM channel_keys WHERE channel_id = ? ORDER BY id').all(channelId);
  return rows as ChannelKey[];
}

export function addChannelKey(data: { channel_id: number; name: string; api_key: string }): number {
  const result = getDb().prepare('INSERT INTO channel_keys (channel_id, name, api_key) VALUES (?, ?, ?)').run(
    data.channel_id, data.name, data.api_key);
  return Number(result.lastInsertRowid);
}

export function updateChannelKey(id: number, data: Partial<Pick<ChannelKey, 'name' | 'api_key' | 'is_active'>>): void {
  const updates: string[] = [];
  const values: (string | number)[] = [];
  if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
  if (data.api_key !== undefined) { updates.push('api_key = ?'); values.push(data.api_key); }
  if (data.is_active !== undefined) { updates.push('is_active = ?'); values.push(data.is_active); }
  if (updates.length === 0) return;
  values.push(id);
  getDb().prepare(`UPDATE channel_keys SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteChannelKey(id: number): void {
  getDb().prepare('DELETE FROM channel_keys WHERE id = ?').run(id);
}

export function recordChannelKeyUsage(id: number, success: boolean): void {
  if (success) {
    // 成功时重置连续失败计数
    getDb().prepare(`UPDATE channel_keys SET use_count = use_count + 1, success_count = success_count + 1, consecutive_fails = 0, last_used_at = datetime('now') WHERE id = ?`).run(id);
  } else {
    // 失败时增加连续失败计数，达到5次自动禁用
    getDb().prepare(`UPDATE channel_keys SET use_count = use_count + 1, fail_count = fail_count + 1, consecutive_fails = consecutive_fails + 1, last_used_at = datetime('now') WHERE id = ?`).run(id);
    getDb().prepare(`UPDATE channel_keys SET is_active = 0 WHERE id = ? AND consecutive_fails >= 5`).run(id);
  }
}

// 获取渠道的一个活跃密钥（轮询，选择使用次数最少的）
export function getActiveKeyForChannel(channelId: number): ChannelKey | null {
  const row = getDb().prepare(
    'SELECT * FROM channel_keys WHERE channel_id = ? AND is_active = 1 ORDER BY use_count ASC LIMIT 1'
  ).get(channelId);
  return (row as ChannelKey) || null;
}

// 模型渠道映射操作
export interface ModelChannel {
  id: number;
  model_name: string;
  channel_id: number;
  target_models: string[] | null; // JSON数组，支持多个目标模型名称
  is_active: number;
  created_at: string;
  // 关联的渠道信息
  channel?: Channel;
}

function rowToModelChannel(row: any): ModelChannel {
  const obj = row as ModelChannel;
  if (typeof obj.target_models === 'string') {
    try {
      obj.target_models = JSON.parse(obj.target_models);
    } catch {
      obj.target_models = null;
    }
  }
  return obj;
}

export function getModelChannels(modelName?: string): ModelChannel[] {
  const d = getDb();
  const rows = modelName
    ? d.prepare('SELECT * FROM model_channels WHERE model_name = ?').all(modelName)
    : d.prepare('SELECT * FROM model_channels ORDER BY model_name').all();
  return rows.map(row => rowToModelChannel(row));
}

export function getActiveChannelForModel(modelName: string): { channel: Channel; key: ChannelKey; targetModels: string[] | null } | null {
  const d = getDb();

  // 调试：先查看 model_channels 表中的数据
  const mcRow = d.prepare('SELECT * FROM model_channels WHERE model_name = ?').get(modelName);
  if (mcRow) {
    console.log(`[DB] model_channels for ${modelName}:`, JSON.stringify(mcRow));
  }

  const row = d.prepare(`
    SELECT c.*, mc.target_models FROM channels c
    JOIN model_channels mc ON c.id = mc.channel_id
    WHERE mc.model_name = ? AND mc.is_active = 1 AND c.is_active = 1
    LIMIT 1
  `).get(modelName) as any;

  if (!row) return null;

  let targetModels: string[] | null = null;
  if (row.target_models) {
    try {
      targetModels = JSON.parse(row.target_models);
    } catch { }
  }

  // 移除 target_models 列来构建 channel 对象
  const { target_models, ...channelData } = row;
  const channel = channelData as Channel;

  console.log(`[DB] getActiveChannelForModel result: channel_id=${channel.id}, name=${channel.name}, type=${channel.channel_type}, base_url=${channel.base_url}`);

  const key = getActiveKeyForChannel(channel.id);
  if (!key) return null;

  return { channel, key, targetModels };
}

export function addModelChannel(data: { model_name: string; channel_id: number; target_models?: string[] }): number {
  const targetModelsJson = data.target_models ? JSON.stringify(data.target_models) : null;
  const d = getDb();

  // 先检查是否已存在
  const existing = d.prepare('SELECT id FROM model_channels WHERE model_name = ?').get(data.model_name) as { id: number } | undefined;

  if (existing) {
    // 更新现有记录
    const existingId = existing.id;
    console.log(`[DB] Updating model_channel: model=${data.model_name}, channel_id=${data.channel_id}, id=${existingId}`);
    d.prepare('UPDATE model_channels SET channel_id = ?, target_models = ? WHERE id = ?').run(
      data.channel_id, targetModelsJson, existingId);
    return existingId;
  } else {
    // 插入新记录
    console.log(`[DB] Inserting model_channel: model=${data.model_name}, channel_id=${data.channel_id}`);
    const result = d.prepare('INSERT INTO model_channels (model_name, channel_id, target_models) VALUES (?, ?, ?)').run(
      data.model_name, data.channel_id, targetModelsJson);
    return Number(result.lastInsertRowid);
  }
}

export function updateModelChannel(id: number, data: Partial<Pick<ModelChannel, 'channel_id' | 'target_models' | 'is_active'>>): void {
  const updates: string[] = [];
  const values: (number | string | null)[] = [];
  if (data.channel_id !== undefined) { updates.push('channel_id = ?'); values.push(data.channel_id); }
  if (data.target_models !== undefined) { updates.push('target_models = ?'); values.push(data.target_models ? JSON.stringify(data.target_models) : null); }
  if (data.is_active !== undefined) { updates.push('is_active = ?'); values.push(data.is_active); }
  if (updates.length === 0) return;
  values.push(id);
  getDb().prepare(`UPDATE model_channels SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteModelChannel(id: number): void {
  getDb().prepare('DELETE FROM model_channels WHERE id = ?').run(id);
}

// ==================== Midjourney 相关操作 ====================

export interface DiscordAccount {
  id: number;
  name: string | null;
  user_token: string;
  guild_id: string;
  channel_id: string;
  is_active: number;
  request_count: number;
  error_count: number;
  last_used_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface MjTask {
  task_id: string;
  user_id: string | null;
  account_id: number | null;
  prompt: string | null;
  status: 'SUBMITTED' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE';
  message_id: string | null;
  message_hash: string | null;
  image_url: string | null;
  oss_url: string | null;
  progress: string | null;
  buttons: string | null;
  fail_reason: string | null;
  created_at: string;
  updated_at: string;
}

function rowToDiscordAccount(columns: string[], values: any[]): DiscordAccount {
  const obj: any = {};
  columns.forEach((col, i) => { obj[col] = values[i]; });
  return obj as DiscordAccount;
}

function rowToMjTask(columns: string[], values: any[]): MjTask {
  const obj: any = {};
  columns.forEach((col, i) => { obj[col] = values[i]; });
  return obj as MjTask;
}

// Discord 账号操作
// Discord 账号操作
export function getDiscordAccounts(activeOnly = false): DiscordAccount[] {
  const d = getDb();
  const rows = activeOnly
    ? d.prepare('SELECT * FROM discord_accounts WHERE is_active = 1 ORDER BY id').all()
    : d.prepare('SELECT * FROM discord_accounts ORDER BY id').all();
  return rows as DiscordAccount[];
}

export function getDiscordAccountById(id: number): DiscordAccount | null {
  const row = getDb().prepare('SELECT * FROM discord_accounts WHERE id = ?').get(id);
  return (row as DiscordAccount) || null;
}

export function addDiscordAccount(data: { name?: string; user_token: string; guild_id: string; channel_id: string }): number {
  const result = getDb().prepare('INSERT INTO discord_accounts (name, user_token, guild_id, channel_id) VALUES (?, ?, ?, ?)').run(
    data.name || null, data.user_token, data.guild_id, data.channel_id);
  return Number(result.lastInsertRowid);
}

export function updateDiscordAccount(id: number, data: Partial<Omit<DiscordAccount, 'id' | 'created_at'>>): void {
  const updates: string[] = [];
  const values: any[] = [];
  if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
  if (data.user_token !== undefined) { updates.push('user_token = ?'); values.push(data.user_token); }
  if (data.guild_id !== undefined) { updates.push('guild_id = ?'); values.push(data.guild_id); }
  if (data.channel_id !== undefined) { updates.push('channel_id = ?'); values.push(data.channel_id); }
  if (data.is_active !== undefined) { updates.push('is_active = ?'); values.push(data.is_active); }
  if (data.request_count !== undefined) { updates.push('request_count = ?'); values.push(data.request_count); }
  if (data.error_count !== undefined) { updates.push('error_count = ?'); values.push(data.error_count); }
  if (data.last_used_at !== undefined) { updates.push('last_used_at = ?'); values.push(data.last_used_at); }
  if (data.last_error !== undefined) { updates.push('last_error = ?'); values.push(data.last_error); }
  if (updates.length === 0) return;
  values.push(id);
  getDb().prepare(`UPDATE discord_accounts SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteDiscordAccount(id: number): void {
  getDb().prepare('DELETE FROM discord_accounts WHERE id = ?').run(id);
}

export function incrementDiscordAccountUsage(id: number, success: boolean): void {
  const field = success ? 'request_count = request_count + 1' : 'error_count = error_count + 1';
  getDb().prepare(`UPDATE discord_accounts SET ${field}, last_used_at = datetime('now') WHERE id = ?`).run(id);
}

// Midjourney 任务操作
export function createMjTask(taskId: string, userId?: string, accountId?: number, prompt?: string): void {
  getDb().prepare('INSERT INTO mj_tasks (task_id, user_id, account_id, prompt) VALUES (?, ?, ?, ?)').run(
    taskId, userId || null, accountId || null, prompt || null);
}

export function getMjTask(taskId: string): MjTask | null {
  const row = getDb().prepare('SELECT * FROM mj_tasks WHERE task_id = ?').get(taskId);
  return (row as MjTask) || null;
}

export function updateMjTask(taskId: string, data: Partial<Omit<MjTask, 'task_id' | 'created_at'>>): void {
  const updates: string[] = ["updated_at = datetime('now')"];
  const values: any[] = [];
  if (data.user_id !== undefined) { updates.push('user_id = ?'); values.push(data.user_id); }
  if (data.account_id !== undefined) { updates.push('account_id = ?'); values.push(data.account_id); }
  if (data.prompt !== undefined) { updates.push('prompt = ?'); values.push(data.prompt); }
  if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status); }
  if (data.message_id !== undefined) { updates.push('message_id = ?'); values.push(data.message_id); }
  if (data.message_hash !== undefined) { updates.push('message_hash = ?'); values.push(data.message_hash); }
  if (data.image_url !== undefined) { updates.push('image_url = ?'); values.push(data.image_url); }
  if (data.oss_url !== undefined) { updates.push('oss_url = ?'); values.push(data.oss_url); }
  if (data.progress !== undefined) { updates.push('progress = ?'); values.push(data.progress); }
  if (data.buttons !== undefined) { updates.push('buttons = ?'); values.push(data.buttons); }
  if (data.fail_reason !== undefined) { updates.push('fail_reason = ?'); values.push(data.fail_reason); }
  values.push(taskId);
  getDb().prepare(`UPDATE mj_tasks SET ${updates.join(', ')} WHERE task_id = ?`).run(...values);
}

export function getMjTasksByStatus(status: string): MjTask[] {
  const rows = getDb().prepare('SELECT * FROM mj_tasks WHERE status = ? ORDER BY created_at DESC').all(status);
  return rows as MjTask[];
}

export function getMjTaskByMessageId(messageId: string): MjTask | null {
  const row = getDb().prepare('SELECT * FROM mj_tasks WHERE message_id = ? LIMIT 1').get(messageId);
  return (row as MjTask) || null;
}

export function getPendingMjTasks(accountId?: number): MjTask[] {
  let sql = "SELECT * FROM mj_tasks WHERE status IN ('SUBMITTED', 'IN_PROGRESS')";
  const params: any[] = [];
  if (accountId !== undefined) {
    sql += " AND account_id = ?";
    params.push(accountId);
  }
  sql += " ORDER BY created_at";
  const rows = getDb().prepare(sql).all(...params);
  return rows as MjTask[];
}

// ==================== Sora 中转 API 配置 ====================

export interface SoraProxyConfig {
  id: number;
  provider: string;
  base_url: string;
  api_key: string | null;
  is_active: number;
  channel: string;
  request_count: number;
  error_count: number;
  last_used_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function rowToSoraProxyConfig(row: any): SoraProxyConfig {
  return row as SoraProxyConfig;
}

export function getSoraProxyConfig(): SoraProxyConfig | null {
  const row = getDb().prepare('SELECT * FROM sora_proxy_config LIMIT 1').get();
  return (row as SoraProxyConfig) || null;
}

export function updateSoraProxyConfig(data: Partial<Pick<SoraProxyConfig, 'provider' | 'base_url' | 'api_key' | 'is_active' | 'channel'>>): boolean {
  const updates: string[] = ["updated_at = datetime('now')"];
  const values: (string | number | null)[] = [];
  if (data.provider !== undefined) { updates.push('provider = ?'); values.push(data.provider); }
  if (data.base_url !== undefined) { updates.push('base_url = ?'); values.push(data.base_url); }
  if (data.api_key !== undefined) { updates.push('api_key = ?'); values.push(data.api_key); }
  if (data.is_active !== undefined) { updates.push('is_active = ?'); values.push(data.is_active); }
  if (data.channel !== undefined) { updates.push('channel = ?'); values.push(data.channel); }
  if (updates.length === 1) return false;
  getDb().prepare(`UPDATE sora_proxy_config SET ${updates.join(', ')} WHERE id = 1`).run(...values);
  return true;
}

export function recordSoraUsage(success: boolean, error?: string): void {
  const field = success ? 'request_count = request_count + 1' : 'error_count = error_count + 1';
  const errorUpdate = error ? `, last_error = '${error.replace(/'/g, "''")}'` : '';
  getDb().prepare(`UPDATE sora_proxy_config SET ${field}, last_used_at = datetime('now')${errorUpdate} WHERE id = 1`).run();
}

// ==================== Session 管理（使用JSON文件，支持多实例共享） ====================

const SESSION_FILE = path.join(DATA_DIR, 'sessions.json');

function loadSessions(): Record<string, { username: string; expires_at: number }> {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
    }
  } catch (e) { }
  return {};
}

function saveSessions(sessions: Record<string, { username: string; expires_at: number }>): void {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2));
}

export function createSession(token: string, username: string, expiresAt: number): void {
  const sessions = loadSessions();
  sessions[token] = { username, expires_at: expiresAt };
  saveSessions(sessions);
}

export function getSession(token: string): { username: string; expires_at: number } | null {
  const sessions = loadSessions();
  return sessions[token] || null;
}

export function deleteSession(token: string): void {
  const sessions = loadSessions();
  delete sessions[token];
  saveSessions(sessions);
}

export function cleanExpiredSessions(): void {
  const sessions = loadSessions();
  const now = Date.now();
  for (const token in sessions) {
    if (sessions[token].expires_at < now) {
      delete sessions[token];
    }
  }
  saveSessions(sessions);
}
