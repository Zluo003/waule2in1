/**
 * SQLite 数据库服务
 * 用于存储配置信息、管理员密码和客户端配置
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// 获取应用数据目录
function getAppDataPath(): string {
  // 优先使用环境变量
  if (process.env.APP_DATA_PATH) {
    return process.env.APP_DATA_PATH;
  }
  
  // 检查是否在 Electron 打包环境中运行
  const isPackaged = __dirname.includes('app.asar');
  
  if (isPackaged) {
    // 打包后使用 exe 所在目录的 data 文件夹
    // app.asar 路径类似: .../resources/app.asar/dist/services
    // 需要回到 resources 的上级目录（即 exe 所在目录）
    const exeDir = path.join(__dirname, '..', '..', '..', '..');
    return path.join(exeDir, 'data');
  }
  
  // 开发环境：使用项目目录下的 data 文件夹
  return path.join(__dirname, '..', '..', 'data');
}

// 数据库文件路径
const DB_PATH = path.join(getAppDataPath(), 'config.db');
console.log('[Database] 数据库路径:', DB_PATH);
console.log('[Database] APP_DATA_PATH:', process.env.APP_DATA_PATH);

// 确保数据目录存在
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 创建数据库连接（使用同步模式确保数据立即写入）
const db: InstanceType<typeof Database> = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = FULL');

// 初始化表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 客户端配置表（用于持久化客户端的连接配置）
db.exec(`
  CREATE TABLE IF NOT EXISTS client_configs (
    client_id TEXT PRIMARY KEY,
    device_name TEXT,
    local_server_url TEXT,
    storage_mode TEXT DEFAULT 'LOCAL',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

/**
 * 配置接口
 */
export interface AppConfig {
  // 服务端口
  port: number;
  // 本地存储路径
  storagePath: string;
  // 平台服务端地址
  platformServerUrl: string;
  // 租户 API Key
  tenantApiKey: string;
  // 是否已完成初始配置
  isConfigured: boolean;
}

// 默认配置（使用数据目录下的 storage）
const defaultConfig: AppConfig = {
  port: 3002,
  storagePath: path.join(getAppDataPath(), 'storage'),
  platformServerUrl: '',
  tenantApiKey: '',
  isConfigured: false,
};

/**
 * 获取配置值
 */
export function getConfigValue(key: string): string | null {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value || null;
}

/**
 * 设置配置值
 */
export function setConfigValue(key: string, value: string): void {
  db.prepare(`
    INSERT INTO config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
  `).run(key, value, value);
}

/**
 * 获取所有配置
 */
export function getAllConfig(): AppConfig {
  const config = { ...defaultConfig };
  
  const port = getConfigValue('port');
  if (port) config.port = parseInt(port, 10);
  
  const storagePath = getConfigValue('storagePath');
  if (storagePath) config.storagePath = storagePath;
  
  const platformServerUrl = getConfigValue('platformServerUrl');
  if (platformServerUrl) config.platformServerUrl = platformServerUrl;
  
  const tenantApiKey = getConfigValue('tenantApiKey');
  if (tenantApiKey) config.tenantApiKey = tenantApiKey;
  
  const isConfigured = getConfigValue('isConfigured');
  config.isConfigured = isConfigured === 'true';
  
  return config;
}

/**
 * 保存配置
 */
export function saveConfig(config: Partial<AppConfig>): void {
  if (config.port !== undefined) {
    setConfigValue('port', config.port.toString());
  }
  if (config.storagePath !== undefined) {
    setConfigValue('storagePath', config.storagePath);
  }
  if (config.platformServerUrl !== undefined) {
    setConfigValue('platformServerUrl', config.platformServerUrl);
  }
  if (config.tenantApiKey !== undefined) {
    setConfigValue('tenantApiKey', config.tenantApiKey);
  }
  if (config.isConfigured !== undefined) {
    setConfigValue('isConfigured', config.isConfigured.toString());
  }
}

/**
 * 检查是否已完成初始配置
 */
export function isAppConfigured(): boolean {
  const config = getAllConfig();
  return config.isConfigured && !!config.platformServerUrl && !!config.tenantApiKey;
}

/**
 * 获取当前配置（运行时使用）
 */
export function getAppConfig(): AppConfig {
  return getAllConfig();
}

// ==================== 管理员密码相关 ====================

/**
 * 哈希密码
 */
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * 检查是否已设置管理员密码
 */
export function hasAdminPassword(): boolean {
  const pwd = getConfigValue('adminPassword');
  return !!pwd;
}

/**
 * 设置管理员密码（仅首次设置）
 */
export function setAdminPassword(password: string): boolean {
  if (hasAdminPassword()) {
    return false; // 已设置过密码，不能重复设置
  }
  setConfigValue('adminPassword', hashPassword(password));
  return true;
}

/**
 * 验证管理员密码
 */
export function verifyAdminPassword(password: string): boolean {
  const storedHash = getConfigValue('adminPassword');
  if (!storedHash) return false;
  return storedHash === hashPassword(password);
}

/**
 * 修改管理员密码
 */
export function changeAdminPassword(oldPassword: string, newPassword: string): boolean {
  if (!verifyAdminPassword(oldPassword)) {
    return false;
  }
  setConfigValue('adminPassword', hashPassword(newPassword));
  return true;
}

/**
 * 生成会话令牌
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 保存会话令牌
 */
export function saveSessionToken(token: string): void {
  // 会话有效期24小时
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  setConfigValue('sessionToken', token);
  setConfigValue('sessionExpiresAt', expiresAt.toString());
}

/**
 * 验证会话令牌
 */
export function verifySessionToken(token: string): boolean {
  const storedToken = getConfigValue('sessionToken');
  const expiresAt = getConfigValue('sessionExpiresAt');
  
  if (!storedToken || !expiresAt) return false;
  if (storedToken !== token) return false;
  if (Date.now() > parseInt(expiresAt, 10)) return false;
  
  return true;
}

/**
 * 清除会话令牌
 */
export function clearSessionToken(): void {
  setConfigValue('sessionToken', '');
  setConfigValue('sessionExpiresAt', '');
}

// ==================== 客户端配置相关 ====================

export interface ClientConfig {
  clientId: string;
  deviceName?: string;
  localServerUrl: string;
  storageMode: 'OSS' | 'LOCAL';
  createdAt: string;
  updatedAt: string;
}

/**
 * 保存客户端配置
 */
export function saveClientConfig(config: {
  clientId: string;
  deviceName?: string;
  localServerUrl: string;
  storageMode?: 'OSS' | 'LOCAL';
}): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO client_configs (client_id, device_name, local_server_url, storage_mode, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(client_id) DO UPDATE SET
      device_name = ?,
      local_server_url = ?,
      storage_mode = ?,
      updated_at = ?
  `).run(
    config.clientId,
    config.deviceName || null,
    config.localServerUrl,
    config.storageMode || 'LOCAL',
    now,
    now,
    config.deviceName || null,
    config.localServerUrl,
    config.storageMode || 'LOCAL',
    now
  );
}

/**
 * 获取客户端配置
 */
export function getClientConfig(clientId: string): ClientConfig | null {
  const row = db.prepare(`
    SELECT client_id, device_name, local_server_url, storage_mode, created_at, updated_at
    FROM client_configs WHERE client_id = ?
  `).get(clientId) as any;
  
  if (!row) return null;
  
  return {
    clientId: row.client_id,
    deviceName: row.device_name,
    localServerUrl: row.local_server_url,
    storageMode: row.storage_mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 删除客户端配置
 */
export function deleteClientConfig(clientId: string): void {
  db.prepare('DELETE FROM client_configs WHERE client_id = ?').run(clientId);
}

/**
 * 获取所有客户端配置
 */
export function getAllClientConfigs(): ClientConfig[] {
  const rows = db.prepare(`
    SELECT client_id, device_name, local_server_url, storage_mode, created_at, updated_at
    FROM client_configs ORDER BY updated_at DESC
  `).all() as any[];
  
  return rows.map(row => ({
    clientId: row.client_id,
    deviceName: row.device_name,
    localServerUrl: row.local_server_url,
    storageMode: row.storage_mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export { db };

