import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'gateway.db');

let db: SqlJsDatabase | null = null;

// 保存数据库到文件
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// 初始化表结构
function initTables() {
  if (!db) return;

  db.run(`CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, name TEXT NOT NULL, api_key TEXT NOT NULL, is_active INTEGER DEFAULT 1, use_count INTEGER DEFAULT 0, success_count INTEGER DEFAULT 0, fail_count INTEGER DEFAULT 0, last_used_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, storage_type TEXT DEFAULT 'forward')`);
  db.run(`CREATE TABLE IF NOT EXISTS request_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, endpoint TEXT NOT NULL, model TEXT, status TEXT NOT NULL, duration INTEGER, error_message TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  // 渠道表 - 支持官方和多个中转
  db.run(`CREATE TABLE IF NOT EXISTS channels (
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
  )`);

  // 渠道密钥表 - 支持一个渠道多个key轮询
  db.run(`CREATE TABLE IF NOT EXISTS channel_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    api_key TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    use_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    last_used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES channels(id)
  )`);

  // 模型渠道映射表 - 每个模型只能配置一个渠道
  db.run(`CREATE TABLE IF NOT EXISTS model_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_name TEXT NOT NULL UNIQUE,
    channel_id INTEGER NOT NULL,
    target_models TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES channels(id)
  )`);

  // 迁移：为旧数据添加 target_models 字段
  try {
    db.run(`ALTER TABLE model_channels ADD COLUMN target_models TEXT`);
  } catch (e) {
    // 字段已存在，忽略
  }

  db.run(`CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON api_keys(provider)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_request_logs_provider ON request_logs(provider)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_channels_provider ON channels(provider)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_channel_keys_channel ON channel_keys(channel_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_model_channels_model ON model_channels(model_name)`);

  // 迁移：为 channels 表添加 storage_type 字段
  try {
    db.run(`ALTER TABLE channels ADD COLUMN storage_type TEXT DEFAULT 'forward'`);
  } catch (e) {
    // 字段已存在，忽略
  }

  // Midjourney Discord 账号表
  db.run(`CREATE TABLE IF NOT EXISTS discord_accounts (
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
  )`);

  // Midjourney 任务表
  db.run(`CREATE TABLE IF NOT EXISTS mj_tasks (
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
  )`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_mj_tasks_status ON mj_tasks(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_mj_tasks_user ON mj_tasks(user_id)`);

  const defaultConfigs: Record<string, string> = {
    'admin_username': process.env.ADMIN_USERNAME || 'admin',
    'admin_password': process.env.ADMIN_PASSWORD || 'admin',
    'api_secret': process.env.API_SECRET || 'ai-gateway-secret',
    'oss_bucket': '', 'oss_region': '', 'oss_access_key_id': '', 'oss_access_key_secret': '', 'oss_endpoint': '', 'oss_cdn_url': '',
    'mj_command_id': process.env.MJ_COMMAND_ID || '',
    'mj_version_id': process.env.MJ_VERSION_ID || '',
  };

  for (const [key, value] of Object.entries(defaultConfigs)) {
    db.run('INSERT OR IGNORE INTO system_config (key, value) VALUES (?, ?)', [key, value]);
  }
}

// 初始化数据库（必须在应用启动时调用）
export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  initTables();
  saveDatabase();
}

function getDb(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

// 配置操作
export function getConfig(key: string): string | null {
  const result = getDb().exec('SELECT value FROM system_config WHERE key = ?', [key]);
  return result.length > 0 && result[0].values.length > 0 ? String(result[0].values[0][0]) : null;
}

export function setConfig(key: string, value: string): void {
  getDb().run('INSERT INTO system_config (key, value, updated_at) VALUES (?, ?, datetime("now")) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime("now")', [key, value, value]);
  saveDatabase();
}

export function getAllConfigs(): Record<string, string> {
  const result = getDb().exec('SELECT key, value FROM system_config');
  if (result.length === 0) return {};
  return Object.fromEntries(result[0].values.map(row => [String(row[0]), String(row[1])]));
}

// API密钥操作
export interface ApiKey {
  id: number; provider: string; name: string; api_key: string; is_active: number;
  use_count: number; success_count: number; fail_count: number; last_used_at: string | null; created_at: string;
  storage_type: 'oss' | 'local' | 'forward'; // 存储方式：oss/本地/转发
}

function rowToApiKey(columns: string[], values: any[]): ApiKey {
  const obj: any = {};
  columns.forEach((col, i) => obj[col] = values[i]);
  return obj as ApiKey;
}

export function getApiKeys(provider?: string): ApiKey[] {
  const d = getDb();
  const result = provider
    ? d.exec('SELECT * FROM api_keys WHERE provider = ? ORDER BY id', [provider])
    : d.exec('SELECT * FROM api_keys ORDER BY provider, id');
  if (result.length === 0) return [];
  return result[0].values.map(row => rowToApiKey(result[0].columns, row as any[]));
}

export function getActiveApiKey(provider: string): ApiKey | null {
  const result = getDb().exec('SELECT * FROM api_keys WHERE provider = ? AND is_active = 1 ORDER BY use_count ASC LIMIT 1', [provider]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToApiKey(result[0].columns, result[0].values[0] as any[]);
}

export function addApiKey(provider: string, name: string, apiKey: string): number {
  getDb().run('INSERT INTO api_keys (provider, name, api_key) VALUES (?, ?, ?)', [provider, name, apiKey]);
  saveDatabase();
  const result = getDb().exec('SELECT last_insert_rowid()');
  return Number(result[0].values[0][0]);
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
  getDb().run(`UPDATE api_keys SET ${updates.join(', ')} WHERE id = ?`, values);
  saveDatabase();
}

export function deleteApiKey(id: number): void {
  getDb().run('DELETE FROM api_keys WHERE id = ?', [id]);
  saveDatabase();
}

export function recordKeyUsage(id: number, success: boolean): void {
  const field = success ? 'success_count' : 'fail_count';
  getDb().run(`UPDATE api_keys SET use_count = use_count + 1, ${field} = ${field} + 1, last_used_at = datetime('now') WHERE id = ?`, [id]);
  saveDatabase();
}

// 日志操作
export function addRequestLog(provider: string, endpoint: string, model: string | null, status: string, duration: number, errorMessage?: string): void {
  getDb().run('INSERT INTO request_logs (provider, endpoint, model, status, duration, error_message) VALUES (?, ?, ?, ?, ?, ?)',
    [provider, endpoint, model, status, duration, errorMessage || null]);
  saveDatabase();
}

export function getRequestLogs(limit = 100, offset = 0, provider?: string): { logs: any[]; total: number } {
  const d = getDb();
  let countResult, queryResult;
  if (provider) {
    countResult = d.exec('SELECT COUNT(*) FROM request_logs WHERE provider = ?', [provider]);
    queryResult = d.exec('SELECT * FROM request_logs WHERE provider = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', [provider, limit, offset]);
  } else {
    countResult = d.exec('SELECT COUNT(*) FROM request_logs');
    queryResult = d.exec('SELECT * FROM request_logs ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]);
  }
  const total = countResult.length > 0 ? Number(countResult[0].values[0][0]) : 0;
  const logs = queryResult.length > 0
    ? queryResult[0].values.map(row => {
        const obj: any = {};
        queryResult[0].columns.forEach((col, i) => obj[col] = row[i]);
        return obj;
      })
    : [];
  return { logs, total };
}

// 统计
export function getStats() {
  const d = getDb();
  const today = new Date().toISOString().split('T')[0];
  const todayRequests = d.exec("SELECT COUNT(*) FROM request_logs WHERE date(created_at) = ?", [today]);
  const todaySuccess = d.exec("SELECT COUNT(*) FROM request_logs WHERE date(created_at) = ? AND status = 'success'", [today]);
  const activeKeys = d.exec('SELECT COUNT(*) FROM api_keys WHERE is_active = 1');
  const avgDuration = d.exec("SELECT AVG(duration) FROM request_logs WHERE date(created_at) = ? AND status = 'success'", [today]);

  const tr = todayRequests.length > 0 ? Number(todayRequests[0].values[0][0]) : 0;
  const ts = todaySuccess.length > 0 ? Number(todaySuccess[0].values[0][0]) : 0;
  const ak = activeKeys.length > 0 ? Number(activeKeys[0].values[0][0]) : 0;
  const ad = avgDuration.length > 0 && avgDuration[0].values[0][0] !== null ? Number(avgDuration[0].values[0][0]) : 0;

  return {
    todayRequests: tr,
    successRate: tr > 0 ? Math.round((ts / tr) * 100 * 10) / 10 : 0,
    activeKeys: ak,
    avgLatency: ad ? Math.round(ad / 100) / 10 : 0,
    providerStats: []
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

function rowToChannel(columns: string[], values: any[]): Channel {
  const obj: any = {};
  columns.forEach((col, i) => obj[col] = values[i]);
  return obj as Channel;
}

export function getChannels(provider?: string): Channel[] {
  const d = getDb();
  const result = provider
    ? d.exec('SELECT * FROM channels WHERE provider = ? ORDER BY id', [provider])
    : d.exec('SELECT * FROM channels ORDER BY provider, id');
  if (result.length === 0) return [];
  return result[0].values.map(row => rowToChannel(result[0].columns, row as any[]));
}

export function getChannelById(id: number): Channel | null {
  const result = getDb().exec('SELECT * FROM channels WHERE id = ?', [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToChannel(result[0].columns, result[0].values[0] as any[]);
}

export function addChannel(data: { name: string; provider: string; channel_type: string; base_url?: string }): number {
  getDb().run('INSERT INTO channels (name, provider, channel_type, base_url) VALUES (?, ?, ?, ?)',
    [data.name, data.provider, data.channel_type, data.base_url || null]);
  saveDatabase();
  const result = getDb().exec('SELECT last_insert_rowid()');
  return Number(result[0].values[0][0]);
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
  getDb().run(`UPDATE channels SET ${updates.join(', ')} WHERE id = ?`, values);
  saveDatabase();
}

export function deleteChannel(id: number): void {
  getDb().run('DELETE FROM channel_keys WHERE channel_id = ?', [id]);
  getDb().run('DELETE FROM model_channels WHERE channel_id = ?', [id]);
  getDb().run('DELETE FROM channels WHERE id = ?', [id]);
  saveDatabase();
}

export function recordChannelUsage(id: number, success: boolean): void {
  const field = success ? 'success_count' : 'fail_count';
  getDb().run(`UPDATE channels SET use_count = use_count + 1, ${field} = ${field} + 1 WHERE id = ?`, [id]);
  saveDatabase();
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
  last_used_at: string | null;
  created_at: string;
}

function rowToChannelKey(columns: string[], values: any[]): ChannelKey {
  const obj: any = {};
  columns.forEach((col, i) => obj[col] = values[i]);
  return obj as ChannelKey;
}

export function getChannelKeys(channelId: number): ChannelKey[] {
  const result = getDb().exec('SELECT * FROM channel_keys WHERE channel_id = ? ORDER BY id', [channelId]);
  if (result.length === 0) return [];
  return result[0].values.map(row => rowToChannelKey(result[0].columns, row as any[]));
}

export function addChannelKey(data: { channel_id: number; name: string; api_key: string }): number {
  getDb().run('INSERT INTO channel_keys (channel_id, name, api_key) VALUES (?, ?, ?)',
    [data.channel_id, data.name, data.api_key]);
  saveDatabase();
  const result = getDb().exec('SELECT last_insert_rowid()');
  return Number(result[0].values[0][0]);
}

export function updateChannelKey(id: number, data: Partial<Pick<ChannelKey, 'name' | 'api_key' | 'is_active'>>): void {
  const updates: string[] = [];
  const values: (string | number)[] = [];
  if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
  if (data.api_key !== undefined) { updates.push('api_key = ?'); values.push(data.api_key); }
  if (data.is_active !== undefined) { updates.push('is_active = ?'); values.push(data.is_active); }
  if (updates.length === 0) return;
  values.push(id);
  getDb().run(`UPDATE channel_keys SET ${updates.join(', ')} WHERE id = ?`, values);
  saveDatabase();
}

export function deleteChannelKey(id: number): void {
  getDb().run('DELETE FROM channel_keys WHERE id = ?', [id]);
  saveDatabase();
}

export function recordChannelKeyUsage(id: number, success: boolean): void {
  const field = success ? 'success_count' : 'fail_count';
  getDb().run(`UPDATE channel_keys SET use_count = use_count + 1, ${field} = ${field} + 1, last_used_at = datetime('now') WHERE id = ?`, [id]);
  saveDatabase();
}

// 获取渠道的一个活跃密钥（轮询，选择使用次数最少的）
export function getActiveKeyForChannel(channelId: number): ChannelKey | null {
  const result = getDb().exec(
    'SELECT * FROM channel_keys WHERE channel_id = ? AND is_active = 1 ORDER BY use_count ASC LIMIT 1',
    [channelId]
  );
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToChannelKey(result[0].columns, result[0].values[0] as any[]);
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

function rowToModelChannel(columns: string[], values: any[]): ModelChannel {
  const obj: any = {};
  columns.forEach((col, i) => {
    if (col === 'target_models' && values[i]) {
      try {
        obj[col] = JSON.parse(values[i]);
      } catch {
        obj[col] = null;
      }
    } else {
      obj[col] = values[i];
    }
  });
  return obj as ModelChannel;
}

export function getModelChannels(modelName?: string): ModelChannel[] {
  const d = getDb();
  const result = modelName
    ? d.exec('SELECT * FROM model_channels WHERE model_name = ?', [modelName])
    : d.exec('SELECT * FROM model_channels ORDER BY model_name');
  if (result.length === 0) return [];
  return result[0].values.map((row: any[]) => rowToModelChannel(result[0].columns, row));
}

export function getActiveChannelForModel(modelName: string): { channel: Channel; key: ChannelKey; targetModels: string[] | null } | null {
  const d = getDb();

  // 调试：先查看 model_channels 表中的数据
  const mcResult = d.exec('SELECT * FROM model_channels WHERE model_name = ?', [modelName]);
  if (mcResult.length > 0 && mcResult[0].values.length > 0) {
    console.log(`[DB] model_channels for ${modelName}:`, JSON.stringify(mcResult[0].values[0]));
  }

  const result = d.exec(`
    SELECT c.*, mc.target_models FROM channels c
    JOIN model_channels mc ON c.id = mc.channel_id
    WHERE mc.model_name = ? AND mc.is_active = 1 AND c.is_active = 1
    LIMIT 1
  `, [modelName]);
  if (result.length === 0 || result[0].values.length === 0) return null;

  const row = result[0].values[0] as any[];
  const columns = result[0].columns;
  const targetModelsIndex = columns.indexOf('target_models');
  let targetModels: string[] | null = null;
  if (targetModelsIndex >= 0 && row[targetModelsIndex]) {
    try {
      targetModels = JSON.parse(row[targetModelsIndex] as string);
    } catch {}
  }

  // 移除 target_models 列来构建 channel 对象
  const channelColumns = columns.filter(c => c !== 'target_models');
  const channelValues = row.filter((_, i) => columns[i] !== 'target_models');
  const channel = rowToChannel(channelColumns, channelValues);

  console.log(`[DB] getActiveChannelForModel result: channel_id=${channel.id}, name=${channel.name}, type=${channel.channel_type}, base_url=${channel.base_url}`);

  const key = getActiveKeyForChannel(channel.id);
  if (!key) return null;

  return { channel, key, targetModels };
}

export function addModelChannel(data: { model_name: string; channel_id: number; target_models?: string[] }): number {
  const targetModelsJson = data.target_models ? JSON.stringify(data.target_models) : null;
  const d = getDb();

  // 先检查是否已存在
  const existing = d.exec('SELECT id FROM model_channels WHERE model_name = ?', [data.model_name]);

  if (existing.length > 0 && existing[0].values.length > 0) {
    // 更新现有记录
    const existingId = Number(existing[0].values[0][0]);
    console.log(`[DB] Updating model_channel: model=${data.model_name}, channel_id=${data.channel_id}, id=${existingId}`);
    d.run('UPDATE model_channels SET channel_id = ?, target_models = ? WHERE id = ?',
      [data.channel_id, targetModelsJson, existingId]);
    saveDatabase();
    return existingId;
  } else {
    // 插入新记录
    console.log(`[DB] Inserting model_channel: model=${data.model_name}, channel_id=${data.channel_id}`);
    d.run('INSERT INTO model_channels (model_name, channel_id, target_models) VALUES (?, ?, ?)',
      [data.model_name, data.channel_id, targetModelsJson]);
    saveDatabase();
    const result = d.exec('SELECT last_insert_rowid()');
    return Number(result[0].values[0][0]);
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
  getDb().run(`UPDATE model_channels SET ${updates.join(', ')} WHERE id = ?`, values);
  saveDatabase();
}

export function deleteModelChannel(id: number): void {
  getDb().run('DELETE FROM model_channels WHERE id = ?', [id]);
  saveDatabase();
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
export function getDiscordAccounts(activeOnly = false): DiscordAccount[] {
  const d = getDb();
  const sql = activeOnly
    ? 'SELECT * FROM discord_accounts WHERE is_active = 1 ORDER BY id'
    : 'SELECT * FROM discord_accounts ORDER BY id';
  const result = d.exec(sql);
  if (result.length === 0) return [];
  return result[0].values.map((row: any[]) => rowToDiscordAccount(result[0].columns, row));
}

export function getDiscordAccountById(id: number): DiscordAccount | null {
  const result = getDb().exec('SELECT * FROM discord_accounts WHERE id = ?', [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToDiscordAccount(result[0].columns, result[0].values[0] as any[]);
}

export function addDiscordAccount(data: { name?: string; user_token: string; guild_id: string; channel_id: string }): number {
  getDb().run('INSERT INTO discord_accounts (name, user_token, guild_id, channel_id) VALUES (?, ?, ?, ?)',
    [data.name || null, data.user_token, data.guild_id, data.channel_id]);
  saveDatabase();
  const result = getDb().exec('SELECT last_insert_rowid()');
  return Number(result[0].values[0][0]);
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
  getDb().run(`UPDATE discord_accounts SET ${updates.join(', ')} WHERE id = ?`, values);
  saveDatabase();
}

export function deleteDiscordAccount(id: number): void {
  getDb().run('DELETE FROM discord_accounts WHERE id = ?', [id]);
  saveDatabase();
}

export function incrementDiscordAccountUsage(id: number, success: boolean): void {
  const field = success ? 'request_count = request_count + 1' : 'error_count = error_count + 1';
  getDb().run(`UPDATE discord_accounts SET ${field}, last_used_at = datetime('now') WHERE id = ?`, [id]);
  saveDatabase();
}

// Midjourney 任务操作
export function createMjTask(taskId: string, userId?: string, accountId?: number, prompt?: string): void {
  getDb().run('INSERT INTO mj_tasks (task_id, user_id, account_id, prompt) VALUES (?, ?, ?, ?)',
    [taskId, userId || null, accountId || null, prompt || null]);
  saveDatabase();
}

export function getMjTask(taskId: string): MjTask | null {
  const result = getDb().exec('SELECT * FROM mj_tasks WHERE task_id = ?', [taskId]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToMjTask(result[0].columns, result[0].values[0] as any[]);
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
  getDb().run(`UPDATE mj_tasks SET ${updates.join(', ')} WHERE task_id = ?`, values);
  saveDatabase();
}

export function getMjTasksByStatus(status: string): MjTask[] {
  const result = getDb().exec('SELECT * FROM mj_tasks WHERE status = ? ORDER BY created_at DESC', [status]);
  if (result.length === 0) return [];
  return result[0].values.map((row: any[]) => rowToMjTask(result[0].columns, row));
}

export function getMjTaskByMessageId(messageId: string): MjTask | null {
  const result = getDb().exec('SELECT * FROM mj_tasks WHERE message_id = ? LIMIT 1', [messageId]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToMjTask(result[0].columns, result[0].values[0]);
}

export function getPendingMjTasks(accountId?: number): MjTask[] {
  let sql = "SELECT * FROM mj_tasks WHERE status IN ('SUBMITTED', 'IN_PROGRESS')";
  const params: any[] = [];
  if (accountId !== undefined) {
    sql += " AND account_id = ?";
    params.push(accountId);
  }
  sql += " ORDER BY created_at";
  const result = getDb().exec(sql, params);
  if (result.length === 0) return [];
  return result[0].values.map((row: any[]) => rowToMjTask(result[0].columns, row));
}
