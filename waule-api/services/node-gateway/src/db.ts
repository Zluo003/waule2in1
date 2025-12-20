import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '/app/data/gateway.db';

let db: Database.Database;

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function initDatabase() {
  const database = getDatabase();
  
  // 供应商 API Keys 表（统一管理所有供应商的Key）
  database.exec(`
    CREATE TABLE IF NOT EXISTS provider_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      api_key TEXT NOT NULL,
      name TEXT,
      is_active INTEGER DEFAULT 1,
      request_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      last_used_at TEXT,
      last_error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, api_key)
    )
  `);

  // 平台OSS配置表
  database.exec(`
    CREATE TABLE IF NOT EXISTS platform_oss (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      provider TEXT DEFAULT 'aliyun',
      region TEXT,
      bucket TEXT,
      access_key_id TEXT,
      access_key_secret TEXT,
      custom_domain TEXT,
      is_active INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 初始化OSS配置行
  database.exec(`INSERT OR IGNORE INTO platform_oss (id) VALUES (1)`);

  // Discord账号表（Midjourney专用）
  database.exec(`
    CREATE TABLE IF NOT EXISTS discord_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      user_token TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      request_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      last_used_at TEXT,
      last_error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_token)
    )
  `);

  // 系统配置表
  database.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // 中转API配置表
  database.exec(`
    CREATE TABLE IF NOT EXISTS proxy_api_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      provider TEXT DEFAULT 'future-api',
      base_url TEXT DEFAULT 'https://future-api.vodeshop.com',
      api_key TEXT,
      is_active INTEGER DEFAULT 0,
      model_2k TEXT DEFAULT 'gemini-2.5-flash-image',
      model_4k TEXT DEFAULT 'gemini-2.5-flash-image',
      channel TEXT DEFAULT 'native',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 初始化中转API配置行
  database.exec(`INSERT OR IGNORE INTO proxy_api_config (id) VALUES (1)`);

  // Sora中转API配置表（future-sora-api）
  database.exec(`
    CREATE TABLE IF NOT EXISTS sora_proxy_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      provider TEXT DEFAULT 'future-sora-api',
      base_url TEXT DEFAULT 'https://future-api.vodeshop.com',
      api_key TEXT,
      is_active INTEGER DEFAULT 0,
      channel TEXT DEFAULT 'sora2api',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 初始化Sora中转API配置行
  database.exec(`INSERT OR IGNORE INTO sora_proxy_config (id) VALUES (1)`);

  // Midjourney 任务表
  database.exec(`
    CREATE TABLE IF NOT EXISTS mj_tasks (
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  console.log('📦 [DB] 数据库初始化完成:', DB_PATH);
}

// ========== 供应商列表 ==========
export const PROVIDERS = [
  { id: 'google', name: 'Google', description: 'Gemini 系列模型' },
  { id: 'doubao', name: '豆包 Doubao', description: '字节跳动 SeedDream/SeeDance' },
  { id: 'wanx', name: '通义万相', description: '阿里云图像生成' },
  { id: 'vidu', name: 'Vidu', description: '生数科技视频生成' },
  { id: 'minimax', name: 'MiniMax', description: '海螺视频/语音' },
  { id: 'cosyvoice', name: 'CosyVoice', description: '阿里云语音合成' },
  { id: 'openai', name: 'OpenAI', description: 'Sora 系列' },
];

// ========== Provider Keys 操作 ==========

export interface ProviderKey {
  id: number;
  provider: string;
  api_key: string;
  name: string | null;
  is_active: number;
  request_count: number;
  error_count: number;
  last_used_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export function getAllProviderKeys(): ProviderKey[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM provider_keys ORDER BY provider, id DESC').all() as ProviderKey[];
}

export function getProviderKeys(provider: string): ProviderKey[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM provider_keys WHERE provider = ? ORDER BY id DESC').all(provider) as ProviderKey[];
}

export function getActiveProviderKeys(provider: string): ProviderKey[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM provider_keys WHERE provider = ? AND is_active = 1 ORDER BY request_count ASC').all(provider) as ProviderKey[];
}

export function addProviderKey(provider: string, apiKey: string, name?: string): ProviderKey | null {
  const db = getDatabase();
  try {
    const stmt = db.prepare('INSERT INTO provider_keys (provider, api_key, name) VALUES (?, ?, ?)');
    const result = stmt.run(provider, apiKey, name || null);
    return db.prepare('SELECT * FROM provider_keys WHERE id = ?').get(result.lastInsertRowid) as ProviderKey;
  } catch (e: any) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return null;
    }
    throw e;
  }
}

export function updateProviderKey(id: number, updates: Partial<ProviderKey>): boolean {
  const db = getDatabase();
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.is_active !== undefined) { fields.push('is_active = ?'); values.push(updates.is_active); }
  if (updates.api_key !== undefined) { fields.push('api_key = ?'); values.push(updates.api_key); }
  
  if (fields.length === 0) return false;
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  const stmt = db.prepare(`UPDATE provider_keys SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

export function deleteProviderKey(id: number): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM provider_keys WHERE id = ?').run(id);
  return result.changes > 0;
}

export function recordProviderKeyUsage(id: number, success: boolean, error?: string) {
  const db = getDatabase();
  if (success) {
    db.prepare(`
      UPDATE provider_keys 
      SET request_count = request_count + 1, 
          last_used_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
  } else {
    db.prepare(`
      UPDATE provider_keys 
      SET request_count = request_count + 1,
          error_count = error_count + 1, 
          last_used_at = CURRENT_TIMESTAMP,
          last_error = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(error || 'Unknown error', id);
  }
}

// 获取下一个可用的 API Key (轮询)
const lastUsedKeyIndex: Record<string, number> = {};
export function getNextProviderKey(provider: string): ProviderKey | null {
  const keys = getActiveProviderKeys(provider);
  if (keys.length === 0) return null;
  
  if (!lastUsedKeyIndex[provider]) lastUsedKeyIndex[provider] = 0;
  const key = keys[lastUsedKeyIndex[provider] % keys.length];
  lastUsedKeyIndex[provider]++;
  return key;
}

// 获取统计信息
export function getProviderStats(): Record<string, { total: number; active: number; requests: number; errors: number }> {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT provider, 
           COUNT(*) as total,
           SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
           SUM(request_count) as requests,
           SUM(error_count) as errors
    FROM provider_keys
    GROUP BY provider
  `).all() as any[];
  
  const stats: Record<string, any> = {};
  for (const row of rows) {
    stats[row.provider] = {
      total: row.total,
      active: row.active,
      requests: row.requests || 0,
      errors: row.errors || 0,
    };
  }
  return stats;
}

// ========== 平台 OSS 配置 ==========

export interface PlatformOSS {
  provider: string;
  region: string | null;
  bucket: string | null;
  access_key_id: string | null;
  access_key_secret: string | null;
  custom_domain: string | null;
  is_active: number;
  updated_at: string;
}

export function getPlatformOSS(): PlatformOSS | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM platform_oss WHERE id = 1').get() as PlatformOSS | null;
}

export function updatePlatformOSS(config: Partial<PlatformOSS>): boolean {
  const db = getDatabase();
  const fields: string[] = [];
  const values: any[] = [];
  
  if (config.provider !== undefined) { fields.push('provider = ?'); values.push(config.provider); }
  if (config.region !== undefined) { fields.push('region = ?'); values.push(config.region); }
  if (config.bucket !== undefined) { fields.push('bucket = ?'); values.push(config.bucket); }
  if (config.access_key_id !== undefined) { fields.push('access_key_id = ?'); values.push(config.access_key_id); }
  if (config.access_key_secret !== undefined) { fields.push('access_key_secret = ?'); values.push(config.access_key_secret); }
  if (config.custom_domain !== undefined) { fields.push('custom_domain = ?'); values.push(config.custom_domain); }
  if (config.is_active !== undefined) { fields.push('is_active = ?'); values.push(config.is_active); }
  
  if (fields.length === 0) return false;
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  
  const stmt = db.prepare(`UPDATE platform_oss SET ${fields.join(', ')} WHERE id = 1`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

// ========== 系统配置 ==========

export function getConfig(key: string): string | null {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value || null;
}

export function setConfig(key: string, value: string) {
  const db = getDatabase();
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value);
}

// ========== 兼容旧API（Gemini Keys）==========
// 这些函数保持向后兼容，内部使用provider_keys表

export interface GeminiKey extends ProviderKey {}

export function getAllGeminiKeys(): GeminiKey[] {
  return getProviderKeys('google');
}

export function getActiveGeminiKeys(): GeminiKey[] {
  return getActiveProviderKeys('google');
}

export function addGeminiKey(apiKey: string, name?: string): GeminiKey | null {
  return addProviderKey('google', apiKey, name);
}

export function updateGeminiKey(id: number, updates: Partial<GeminiKey>): boolean {
  return updateProviderKey(id, updates);
}

export function deleteGeminiKey(id: number): boolean {
  return deleteProviderKey(id);
}

export function recordGeminiKeyUsage(id: number, success: boolean, error?: string) {
  recordProviderKeyUsage(id, success, error);
}

export function getNextGeminiKey(): GeminiKey | null {
  return getNextProviderKey('google');
}

export function getGeminiConfig(key: string): string | null {
  return getConfig(`gemini_${key}`);
}

export function setGeminiConfig(key: string, value: string) {
  setConfig(`gemini_${key}`, value);
}

// ========== Discord 账号管理（Midjourney） ==========

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
  updated_at: string;
}

export function getAllDiscordAccounts(): DiscordAccount[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM discord_accounts ORDER BY id DESC').all() as DiscordAccount[];
}

export function getActiveDiscordAccounts(): DiscordAccount[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM discord_accounts WHERE is_active = 1 ORDER BY request_count ASC').all() as DiscordAccount[];
}

export function getDiscordAccount(id: number): DiscordAccount | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM discord_accounts WHERE id = ?').get(id) as DiscordAccount | null;
}

export function addDiscordAccount(userToken: string, guildId: string, channelId: string, name?: string): DiscordAccount | null {
  const db = getDatabase();
  try {
    const stmt = db.prepare(`
      INSERT INTO discord_accounts (user_token, guild_id, channel_id, name)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(userToken, guildId, channelId, name || null);
    return getDiscordAccount(result.lastInsertRowid as number);
  } catch (e) {
    console.error('添加Discord账号失败:', e);
    return null;
  }
}

export function updateDiscordAccount(id: number, updates: Partial<DiscordAccount>): boolean {
  const db = getDatabase();
  const allowedFields = ['name', 'user_token', 'guild_id', 'channel_id', 'is_active'];
  const fields = Object.keys(updates).filter(k => allowedFields.includes(k));
  if (!fields.length) return false;
  
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => (updates as any)[f]);
  
  try {
    db.prepare(`UPDATE discord_accounts SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...values, id);
    return true;
  } catch (e) {
    console.error('更新Discord账号失败:', e);
    return false;
  }
}

export function deleteDiscordAccount(id: number): boolean {
  const db = getDatabase();
  try {
    db.prepare('DELETE FROM discord_accounts WHERE id = ?').run(id);
    return true;
  } catch (e) {
    console.error('删除Discord账号失败:', e);
    return false;
  }
}

export function recordDiscordAccountUsage(id: number, success: boolean, error?: string) {
  const db = getDatabase();
  if (success) {
    db.prepare(`
      UPDATE discord_accounts 
      SET request_count = request_count + 1, last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(id);
  } else {
    db.prepare(`
      UPDATE discord_accounts 
      SET error_count = error_count + 1, last_error = ?, last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(error || 'Unknown error', id);
  }
}

// 轮询获取下一个可用的Discord账号
export function getNextDiscordAccount(): DiscordAccount | null {
  const activeAccounts = getActiveDiscordAccounts();
  if (!activeAccounts.length) return null;
  // 返回请求数最少的账号（简单轮询）
  return activeAccounts[0];
}

export function getDiscordAccountStats(): { total: number; active: number; total_requests: number; total_errors: number } {
  const db = getDatabase();
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
      SUM(request_count) as total_requests,
      SUM(error_count) as total_errors
    FROM discord_accounts
  `).get() as any;
  return {
    total: stats.total || 0,
    active: stats.active || 0,
    total_requests: stats.total_requests || 0,
    total_errors: stats.total_errors || 0,
  };
}

// ========== Midjourney 任务管理 ==========

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
  buttons: string | null; // JSON string
  fail_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface MjButton {
  customId: string;
  label: string;
  emoji?: string;
}

export function createMjTask(taskId: string, userId?: string, accountId?: number, prompt?: string): MjTask | null {
  const db = getDatabase();
  try {
    db.prepare(`
      INSERT INTO mj_tasks (task_id, user_id, account_id, prompt, status)
      VALUES (?, ?, ?, ?, 'SUBMITTED')
    `).run(taskId, userId || null, accountId || null, prompt || null);
    return getMjTask(taskId);
  } catch (e) {
    console.error('创建MJ任务失败:', e);
    return null;
  }
}

export function getMjTask(taskId: string): MjTask | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM mj_tasks WHERE task_id = ?').get(taskId) as MjTask | null;
}

export function updateMjTask(taskId: string, updates: Partial<MjTask>): boolean {
  const db = getDatabase();
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.message_id !== undefined) { fields.push('message_id = ?'); values.push(updates.message_id); }
  if (updates.message_hash !== undefined) { fields.push('message_hash = ?'); values.push(updates.message_hash); }
  if (updates.image_url !== undefined) { fields.push('image_url = ?'); values.push(updates.image_url); }
  if (updates.oss_url !== undefined) { fields.push('oss_url = ?'); values.push(updates.oss_url); }
  if (updates.progress !== undefined) { fields.push('progress = ?'); values.push(updates.progress); }
  if (updates.buttons !== undefined) { fields.push('buttons = ?'); values.push(updates.buttons); }
  if (updates.fail_reason !== undefined) { fields.push('fail_reason = ?'); values.push(updates.fail_reason); }
  
  if (fields.length === 0) return false;
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(taskId);
  
  try {
    db.prepare(`UPDATE mj_tasks SET ${fields.join(', ')} WHERE task_id = ?`).run(...values);
    return true;
  } catch (e) {
    console.error('更新MJ任务失败:', e);
    return false;
  }
}

export function deleteMjTask(taskId: string): boolean {
  const db = getDatabase();
  try {
    db.prepare('DELETE FROM mj_tasks WHERE task_id = ?').run(taskId);
    return true;
  } catch (e) {
    return false;
  }
}

export function getPendingMjTasks(): MjTask[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM mj_tasks 
    WHERE status IN ('SUBMITTED', 'IN_PROGRESS')
    ORDER BY created_at ASC
  `).all() as MjTask[];
}

export function getMjTaskByMessageId(messageId: string): MjTask | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM mj_tasks WHERE message_id = ?').get(messageId) as MjTask | null;
}

// 检查用户是否有活跃任务
export function hasActiveMjTask(userId: string): boolean {
  const db = getDatabase();
  const task = db.prepare(`
    SELECT 1 FROM mj_tasks 
    WHERE user_id = ? AND status IN ('SUBMITTED', 'IN_PROGRESS')
    LIMIT 1
  `).get(userId);
  return !!task;
}

// 清理过期任务（1小时前的已完成任务）
export function cleanupOldMjTasks(): number {
  const db = getDatabase();
  const result = db.prepare(`
    DELETE FROM mj_tasks 
    WHERE status IN ('SUCCESS', 'FAILURE') 
    AND created_at < datetime('now', '-1 hour')
  `).run();
  return result.changes;
}

// ========== 中转API配置管理 ==========

export interface ProxyApiConfig {
  id: number;
  provider: string;
  base_url: string;
  api_key: string | null;
  is_active: number;
  model_2k: string;
  model_4k: string;
  channel: 'native' | 'proxy';  // native=原生Google API, proxy=中转API
  created_at: string;
  updated_at: string;
}

export function getProxyApiConfig(): ProxyApiConfig | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM proxy_api_config WHERE id = 1').get() as ProxyApiConfig | null;
}

export function updateProxyApiConfig(config: Partial<ProxyApiConfig>): boolean {
  const db = getDatabase();
  const fields: string[] = [];
  const values: any[] = [];
  
  if (config.provider !== undefined) { fields.push('provider = ?'); values.push(config.provider); }
  if (config.base_url !== undefined) { fields.push('base_url = ?'); values.push(config.base_url); }
  if (config.api_key !== undefined) { fields.push('api_key = ?'); values.push(config.api_key); }
  if (config.is_active !== undefined) { fields.push('is_active = ?'); values.push(config.is_active); }
  if (config.model_2k !== undefined) { fields.push('model_2k = ?'); values.push(config.model_2k); }
  if (config.model_4k !== undefined) { fields.push('model_4k = ?'); values.push(config.model_4k); }
  if (config.channel !== undefined) { fields.push('channel = ?'); values.push(config.channel); }
  
  if (fields.length === 0) return false;
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  
  const stmt = db.prepare(`UPDATE proxy_api_config SET ${fields.join(', ')} WHERE id = 1`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

// ========== Sora中转API配置管理 ==========

export interface SoraProxyConfig {
  id: number;
  provider: string;
  base_url: string;
  api_key: string | null;
  is_active: number;
  channel: 'sora2api' | 'future-sora-api';  // sora2api=直连sora2api, future-sora-api=中转API
  created_at: string;
  updated_at: string;
}

export function getSoraProxyConfig(): SoraProxyConfig | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM sora_proxy_config WHERE id = 1').get() as SoraProxyConfig | null;
}

export function updateSoraProxyConfig(config: Partial<SoraProxyConfig>): boolean {
  const db = getDatabase();
  const fields: string[] = [];
  const values: any[] = [];
  
  if (config.provider !== undefined) { fields.push('provider = ?'); values.push(config.provider); }
  if (config.base_url !== undefined) { fields.push('base_url = ?'); values.push(config.base_url); }
  if (config.api_key !== undefined) { fields.push('api_key = ?'); values.push(config.api_key); }
  if (config.is_active !== undefined) { fields.push('is_active = ?'); values.push(config.is_active); }
  if (config.channel !== undefined) { fields.push('channel = ?'); values.push(config.channel); }
  
  if (fields.length === 0) return false;
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  
  const stmt = db.prepare(`UPDATE sora_proxy_config SET ${fields.join(', ')} WHERE id = 1`);
  const result = stmt.run(...values);
  return result.changes > 0;
}
