/**
 * 配置模块
 * 从数据库服务读取配置
 */
import path from 'path';
import fs from 'fs';
import { getAppConfig, AppConfig } from '../services/database.service';

// 重新导出类型
export type { AppConfig as TenantServerConfig };

/**
 * 获取当前配置
 */
export function loadConfig(): AppConfig {
  return getAppConfig();
}

/**
 * 保存配置
 */
export { saveConfig } from '../services/database.service';

/**
 * 获取配置（兼容旧代码）
 */
export const config = new Proxy({} as AppConfig, {
  get(target, prop) {
    const currentConfig = getAppConfig();
    return (currentConfig as any)[prop];
  }
});

/**
 * 获取本机 IP 地址
 */
export function getLocalIP(): string {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  
  return '127.0.0.1';
}

/**
 * 获取日期路径（年/月）
 */
export function getDatePath(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}/${month}`;
}

/**
 * 确保目录存在
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
