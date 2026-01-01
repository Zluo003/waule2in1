/**
 * 性能监控服务
 * 收集 CPU、内存、请求统计等指标
 */
import os from 'os';
import { execSync } from 'child_process';
import cluster from 'cluster';

interface RequestStats {
  total: number;
  success: number;
  error: number;
  avgResponseTime: number;
  responseTimes: number[];
}

interface MonitorData {
  // 系统信息
  system: {
    platform: string;
    arch: string;
    hostname: string;
    uptime: number;
    nodeVersion: string;
  };
  // CPU 信息
  cpu: {
    model: string;
    cores: number;
    usage: number;
  };
  // 内存信息
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
    processUsed: number;
  };
  // 磁盘信息
  disk: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  // 集群信息
  cluster: {
    enabled: boolean;
    workers: number;
    maxWorkers: number;
    isWorker: boolean;
  };
  // 请求统计
  requests: {
    total: number;
    success: number;
    error: number;
    avgResponseTime: number;
    requestsPerMinute: number;
  };
  // 进程信息
  process: {
    pid: number;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
  };
}

class MonitorService {
  private requestStats: RequestStats = {
    total: 0,
    success: 0,
    error: 0,
    avgResponseTime: 0,
    responseTimes: [],
  };

  private lastCpuInfo = os.cpus();
  private lastCpuTime = Date.now();
  private startTime = Date.now();
  private requestsLastMinute: number[] = [];

  /**
   * 记录请求
   */
  recordRequest(responseTime: number, isSuccess: boolean): void {
    this.requestStats.total++;
    if (isSuccess) {
      this.requestStats.success++;
    } else {
      this.requestStats.error++;
    }

    // 保留最近 1000 个响应时间用于计算平均值
    this.requestStats.responseTimes.push(responseTime);
    if (this.requestStats.responseTimes.length > 1000) {
      this.requestStats.responseTimes.shift();
    }

    // 计算平均响应时间
    const sum = this.requestStats.responseTimes.reduce((a, b) => a + b, 0);
    this.requestStats.avgResponseTime = Math.round(sum / this.requestStats.responseTimes.length);

    // 记录每分钟请求数
    const now = Date.now();
    this.requestsLastMinute.push(now);
    // 只保留最近一分钟的记录
    this.requestsLastMinute = this.requestsLastMinute.filter(t => now - t < 60000);
  }

  /**
   * 计算 CPU 使用率
   */
  private getCpuUsage(): number {
    const cpus = os.cpus();
    const now = Date.now();

    let totalIdle = 0;
    let totalTick = 0;

    for (let i = 0; i < cpus.length; i++) {
      const cpu = cpus[i];
      const lastCpu = this.lastCpuInfo[i];

      const idle = cpu.times.idle - lastCpu.times.idle;
      const total = (cpu.times.user - lastCpu.times.user) +
                    (cpu.times.nice - lastCpu.times.nice) +
                    (cpu.times.sys - lastCpu.times.sys) +
                    (cpu.times.idle - lastCpu.times.idle) +
                    (cpu.times.irq - lastCpu.times.irq);

      totalIdle += idle;
      totalTick += total;
    }

    this.lastCpuInfo = cpus;
    this.lastCpuTime = now;

    if (totalTick === 0) return 0;
    return Math.round((1 - totalIdle / totalTick) * 100);
  }

  /**
   * 获取磁盘信息（Windows）- 根据存储路径获取对应磁盘
   */
  getDiskInfo(storagePath?: string): { total: number; used: number; free: number; usagePercent: number } {
    try {
      // 从存储路径提取盘符，默认 C 盘
      let drive = 'C';
      if (storagePath) {
        // 支持 D:\tmp 和 D:/tmp 两种格式
        const match = storagePath.match(/^([A-Za-z])[:\/\\]/);
        if (match) {
          drive = match[1].toUpperCase();
        }
      }

      // 使用 PowerShell 获取磁盘信息（兼容 Windows 11）
      const cmd = `powershell -NoProfile -Command "Get-PSDrive -Name ${drive} | Select-Object Used,Free | ConvertTo-Json"`;
      const output = execSync(cmd, { encoding: 'utf8', timeout: 5000 });
      const data = JSON.parse(output.trim());
      const used = data.Used || 0;
      const free = data.Free || 0;
      const total = used + free;
      return {
        total,
        used,
        free,
        usagePercent: total > 0 ? Math.round((used / total) * 100) : 0,
      };
    } catch (err: any) {
      console.error('[Monitor] 获取磁盘信息失败:', err.message);
    }
    return { total: 0, used: 0, free: 0, usagePercent: 0 };
  }

  /**
   * 获取监控数据
   */
  getMonitorData(storagePath?: string): MonitorData {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpus = os.cpus();
    const maxWorkers = Math.min(Math.max(Math.floor(cpus.length / 4), 1), 4); // CPU 核心数的 1/4，最多 4 个

    return {
      system: {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        uptime: os.uptime(),
        nodeVersion: process.version,
      },
      cpu: {
        model: cpus[0]?.model || 'Unknown',
        cores: cpus.length,
        usage: this.getCpuUsage(),
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usagePercent: Math.round((usedMem / totalMem) * 100),
        processUsed: process.memoryUsage().heapUsed,
      },
      disk: this.getDiskInfo(storagePath),
      cluster: {
        enabled: cluster.isWorker || Object.keys(cluster.workers || {}).length > 0,
        workers: Object.keys(cluster.workers || {}).length,
        maxWorkers,
        isWorker: cluster.isWorker,
      },
      requests: {
        total: this.requestStats.total,
        success: this.requestStats.success,
        error: this.requestStats.error,
        avgResponseTime: this.requestStats.avgResponseTime,
        requestsPerMinute: this.requestsLastMinute.length,
      },
      process: {
        pid: process.pid,
        uptime: Math.round((Date.now() - this.startTime) / 1000),
        memoryUsage: process.memoryUsage(),
      },
    };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.requestStats = {
      total: 0,
      success: 0,
      error: 0,
      avgResponseTime: 0,
      responseTimes: [],
    };
    this.requestsLastMinute = [];
  }
}

export const monitorService = new MonitorService();
