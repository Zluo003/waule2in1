/**
 * 设备 ID 生成工具
 * 收集硬件信息（CPU、主板、MAC地址）生成唯一设备指纹
 */
import { execSync } from 'child_process';
import crypto from 'crypto';
import os from 'os';

interface HardwareInfo {
  cpuId: string;
  motherboard: string;
  macAddress: string;
  hostname: string;
}

/**
 * 执行命令并返回结果（静默失败）
 */
function execCommand(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    return '';
  }
}

/**
 * 获取 CPU ID
 */
function getCpuId(): string {
  const platform = os.platform();
  
  if (platform === 'win32') {
    // Windows: 使用 WMIC 获取 CPU ProcessorId
    return execCommand('wmic cpu get ProcessorId /value').replace('ProcessorId=', '').trim();
  } else if (platform === 'linux') {
    // Linux: 从 /proc/cpuinfo 获取
    const cpuInfo = execCommand('cat /proc/cpuinfo | grep -i "Serial\\|model name" | head -2');
    return cpuInfo || execCommand('cat /sys/class/dmi/id/product_uuid 2>/dev/null');
  } else if (platform === 'darwin') {
    // macOS: 使用 system_profiler
    return execCommand('system_profiler SPHardwareDataType | grep "Serial Number"');
  }
  
  return '';
}

/**
 * 获取主板信息
 */
function getMotherboardInfo(): string {
  const platform = os.platform();
  
  if (platform === 'win32') {
    return execCommand('wmic baseboard get SerialNumber /value').replace('SerialNumber=', '').trim();
  } else if (platform === 'linux') {
    return execCommand('cat /sys/class/dmi/id/board_serial 2>/dev/null') ||
           execCommand('cat /sys/class/dmi/id/product_serial 2>/dev/null');
  } else if (platform === 'darwin') {
    return execCommand('ioreg -l | grep IOPlatformSerialNumber | head -1');
  }
  
  return '';
}


/**
 * 获取 MAC 地址
 */
function getMacAddress(): string {
  const interfaces = os.networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      // 跳过内部接口和无 MAC 的接口
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        return iface.mac;
      }
    }
  }
  
  return '';
}

/**
 * 收集所有硬件信息
 */
export function collectHardwareInfo(): HardwareInfo {
  return {
    cpuId: getCpuId(),
    motherboard: getMotherboardInfo(),
    macAddress: getMacAddress(),
    hostname: os.hostname(),
  };
}

/**
 * 生成设备指纹（硬件信息的哈希）
 */
export function generateDeviceId(): string {
  const info = collectHardwareInfo();
  
  // 拼接所有硬件信息
  const rawData = [
    info.cpuId,
    info.motherboard,
    info.macAddress,
    info.hostname,
  ].filter(Boolean).join('|');
  
  // 如果没有收集到任何硬件信息，使用回退方案
  if (!rawData) {
    console.warn('[DeviceId] 无法获取硬件信息，使用回退方案');
    return crypto
      .createHash('sha256')
      .update(`fallback-${os.hostname()}-${os.platform()}-${os.arch()}`)
      .digest('hex')
      .substring(0, 32);
  }
  
  // 生成 SHA256 哈希
  const hash = crypto
    .createHash('sha256')
    .update(rawData)
    .digest('hex')
    .substring(0, 32);
  
  console.log('[DeviceId] 设备指纹已生成:', hash.substring(0, 8) + '...');
  
  return hash;
}

/**
 * 获取设备 ID（带缓存）
 */
let cachedDeviceId: string | null = null;

export function getDeviceId(): string {
  if (!cachedDeviceId) {
    cachedDeviceId = generateDeviceId();
  }
  return cachedDeviceId;
}
