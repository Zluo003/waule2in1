import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api';

interface ServerMetrics {
  timestamp: string;
  system: {
    hostname: string;
    platform: string;
    arch: string;
    uptime: number;
    loadAvg: {
      '1m': string;
      '5m': string;
      '15m': string;
    };
  };
  cpu: {
    count: number;
    model: string;
    usage: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  swap: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  process: {
    pid: number;
    uptime: number;
    memory: {
      heapTotal: number;
      heapUsed: number;
      rss: number;
      external: number;
    };
  };
  pm2: Array<{
    name: string;
    pid: number;
    status: string;
    cpu: number;
    memory: number;
    uptime: number;
    restarts: number;
  }>;
  connections: {
    socket: number;
    validSessions: number;
    onlineNow: number;
    activeUsers: {
      last1hour: number;
      last24hours: number;
    };
  };
  database: {
    connections?: {
      total: number;
      active: number;
      idle: number;
    };
    size?: number;
    activeQueries?: number;
    slowQueries?: number;
    error?: string;
  };
  traffic: {
    last24h: number;
  };
}

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const formatUptime = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  return parts.join(' ') || '< 1分钟';
};

const ProgressBar = ({ value, color = 'blue', showLabel = true }: { value: number; color?: string; showLabel?: boolean }) => {
  const getColorClass = () => {
    if (value >= 90) return 'bg-red-500';
    if (value >= 70) return 'bg-yellow-500';
    return color === 'blue' ? 'bg-blue-500' : `bg-${color}-500`;
  };

  return (
    <div className="w-full">
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
        <div
          className={`h-2.5 rounded-full transition-all duration-500 ${getColorClass()}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      {showLabel && (
        <p className={`text-xs mt-1 ${value >= 90 ? 'text-red-500' : value >= 70 ? 'text-yellow-500' : 'text-gray-500 dark:text-gray-400'}`}>
          {value.toFixed(1)}%
        </p>
      )}
    </div>
  );
};

const MetricCard = ({ title, icon, children, className = '' }: { title: string; icon: string; children: React.ReactNode; className?: string }) => (
  <div className={`bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-5 ${className}`}>
    <div className="flex items-center gap-2 mb-4">
      <span className="material-symbols-outlined text-blue-500">{icon}</span>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-300">{title}</h3>
    </div>
    {children}
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'online':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'stopping':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'stopped':
      case 'errored':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor()}`}>
      {status}
    </span>
  );
};

const ServerMonitorPage = () => {
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const response = await apiClient.admin.getServerMetrics();
      const data = response.data?.data || response.data;
      if (data && data.system) {
        setMetrics(data);
        setLastUpdate(new Date());
        setError(null);
      } else {
        setError('返回数据格式错误');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || '获取监控数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchMetrics]);

  if (loading && !metrics) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
          <p className="text-gray-500 dark:text-gray-400">加载监控数据中...</p>
        </div>
      </div>
    );
  }

  if (error || (!loading && !metrics)) {
    return (
      <div className="p-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
          <span className="material-symbols-outlined text-4xl text-red-500 mb-2">error</span>
          <p className="text-red-700 dark:text-red-400">{error || '无法加载监控数据'}</p>
          <button
            onClick={() => { setLoading(true); fetchMetrics(); }}
            className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="p-8">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">服务器监控</h1>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">
            主机: {metrics.system.hostname} | {metrics.system.platform} {metrics.system.arch}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="px-3 py-1.5 text-sm bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-lg"
          >
            <option value={3000}>3秒</option>
            <option value={5000}>5秒</option>
            <option value={10000}>10秒</option>
            <option value={30000}>30秒</option>
          </select>
          
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              autoRefresh
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            <span className="material-symbols-outlined text-lg">
              {autoRefresh ? 'sync' : 'sync_disabled'}
            </span>
            {autoRefresh ? '自动刷新' : '已暂停'}
          </button>

          <button
            onClick={fetchMetrics}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <span className="material-symbols-outlined text-lg">refresh</span>
            刷新
          </button>
        </div>
      </div>

      {lastUpdate && (
        <p className="text-xs text-gray-400 mb-4">
          最后更新: {lastUpdate.toLocaleTimeString('zh-CN')}
        </p>
      )}

      {/* 核心指标概览 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">CPU 使用率</p>
          <p className="text-2xl font-bold">{metrics.cpu.usage}%</p>
          <p className="text-xs opacity-60">{metrics.cpu.count} 核心</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">内存使用率</p>
          <p className="text-2xl font-bold">{metrics.memory.usage}%</p>
          <p className="text-xs opacity-60">{formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">Swap 使用率</p>
          <p className="text-2xl font-bold">{metrics.swap.usage}%</p>
          <p className="text-xs opacity-60">{formatBytes(metrics.swap.used)} / {formatBytes(metrics.swap.total)}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">磁盘使用率</p>
          <p className="text-2xl font-bold">{metrics.disk.usage}%</p>
          <p className="text-xs opacity-60">{formatBytes(metrics.disk.used)} / {formatBytes(metrics.disk.total)}</p>
        </div>
        <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">实时在线</p>
          <p className="text-2xl font-bold">{metrics.connections.onlineNow || 0}</p>
          <p className="text-xs opacity-60">WebSocket: {metrics.connections.socket} | 会话: {metrics.connections.validSessions}</p>
        </div>
        <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">24h 请求</p>
          <p className="text-2xl font-bold">{metrics.traffic.last24h.toLocaleString()}</p>
          <p className="text-xs opacity-60">API 调用</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CPU 详情 */}
        <MetricCard title="CPU" icon="memory">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">型号</span>
              <span className="text-sm font-medium text-slate-900 dark:text-white truncate max-w-[200px]">
                {metrics.cpu.model}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">核心数</span>
              <span className="text-sm font-medium text-slate-900 dark:text-white">{metrics.cpu.count}</span>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-gray-600 dark:text-gray-400">使用率</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">{metrics.cpu.usage}%</span>
              </div>
              <ProgressBar value={metrics.cpu.usage} showLabel={false} />
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-border-dark">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">系统负载</p>
              <div className="flex gap-4">
                <div>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">{metrics.system.loadAvg['1m']}</p>
                  <p className="text-xs text-gray-400">1分钟</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">{metrics.system.loadAvg['5m']}</p>
                  <p className="text-xs text-gray-400">5分钟</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">{metrics.system.loadAvg['15m']}</p>
                  <p className="text-xs text-gray-400">15分钟</p>
                </div>
              </div>
            </div>
          </div>
        </MetricCard>

        {/* 内存详情 */}
        <MetricCard title="内存" icon="memory_alt">
          <div className="space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-gray-600 dark:text-gray-400">物理内存</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)}
                </span>
              </div>
              <ProgressBar value={metrics.memory.usage} color="purple" showLabel={false} />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-gray-600 dark:text-gray-400">Swap</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  {formatBytes(metrics.swap.used)} / {formatBytes(metrics.swap.total)}
                </span>
              </div>
              <ProgressBar value={metrics.swap.usage} color="amber" showLabel={false} />
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-border-dark grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-400">可用内存</p>
                <p className="text-sm font-semibold text-green-600 dark:text-green-400">{formatBytes(metrics.memory.free)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Swap 可用</p>
                <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">{formatBytes(metrics.swap.free)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">系统运行</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatUptime(metrics.system.uptime)}</p>
              </div>
            </div>
          </div>
        </MetricCard>

        {/* 数据库状态 */}
        <MetricCard title="数据库 (PostgreSQL)" icon="database">
          {metrics.database.error ? (
            <p className="text-red-500 text-sm">{metrics.database.error}</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-400">总连接数</p>
                  <p className="text-xl font-semibold text-slate-900 dark:text-white">
                    {metrics.database.connections?.total || 0}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">活跃连接</p>
                  <p className="text-xl font-semibold text-green-600 dark:text-green-400">
                    {metrics.database.connections?.active || 0}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">空闲连接</p>
                  <p className="text-xl font-semibold text-gray-600 dark:text-gray-400">
                    {metrics.database.connections?.idle || 0}
                  </p>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-border-dark grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-400">数据库大小</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {formatBytes(metrics.database.size || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">活跃查询</p>
                  <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                    {metrics.database.activeQueries || 0}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">慢查询</p>
                  <p className={`text-sm font-semibold ${(metrics.database.slowQueries || 0) > 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {metrics.database.slowQueries || 0}
                  </p>
                </div>
              </div>
            </div>
          )}
        </MetricCard>

        {/* Node.js 进程 */}
        <MetricCard title="Node.js 进程" icon="code">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400">进程 PID</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-white">{metrics.process.pid}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">进程运行时间</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-white">{formatUptime(metrics.process.uptime)}</p>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-border-dark">
              <p className="text-xs text-gray-400 mb-2">内存使用</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Heap Used</p>
                  <p className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                    {formatBytes(metrics.process.memory.heapUsed)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Heap Total</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {formatBytes(metrics.process.memory.heapTotal)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">RSS</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {formatBytes(metrics.process.memory.rss)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">External</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {formatBytes(metrics.process.memory.external)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </MetricCard>
      </div>

      {/* PM2 进程列表 */}
      {metrics.pm2.length > 0 && (
        <div className="mt-6">
          <MetricCard title="PM2 进程管理" icon="hub">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-slate-200 dark:border-border-dark">
                    <th className="pb-2 font-medium">进程名</th>
                    <th className="pb-2 font-medium">PID</th>
                    <th className="pb-2 font-medium">状态</th>
                    <th className="pb-2 font-medium">CPU</th>
                    <th className="pb-2 font-medium">内存</th>
                    <th className="pb-2 font-medium">运行时间</th>
                    <th className="pb-2 font-medium">重启次数</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.pm2.map((proc, index) => (
                    <tr key={index} className="border-b border-slate-100 dark:border-border-dark last:border-0">
                      <td className="py-2.5 font-medium text-slate-900 dark:text-white">{proc.name}</td>
                      <td className="py-2.5 text-gray-600 dark:text-gray-400">{proc.pid}</td>
                      <td className="py-2.5"><StatusBadge status={proc.status} /></td>
                      <td className="py-2.5">
                        <span className={proc.cpu > 80 ? 'text-red-500' : proc.cpu > 50 ? 'text-yellow-500' : 'text-green-500'}>
                          {proc.cpu}%
                        </span>
                      </td>
                      <td className="py-2.5 text-gray-600 dark:text-gray-400">{formatBytes(proc.memory)}</td>
                      <td className="py-2.5 text-gray-600 dark:text-gray-400">{formatUptime(proc.uptime / 1000)}</td>
                      <td className="py-2.5">
                        <span className={proc.restarts > 5 ? 'text-red-500' : 'text-gray-600 dark:text-gray-400'}>
                          {proc.restarts}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MetricCard>
        </div>
      )}

      {/* 磁盘信息 */}
      <div className="mt-6">
        <MetricCard title="磁盘存储" icon="hard_drive">
          <div className="space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-gray-600 dark:text-gray-400">根分区 (/)</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  {formatBytes(metrics.disk.used)} / {formatBytes(metrics.disk.total)}
                </span>
              </div>
              <ProgressBar value={metrics.disk.usage} color="green" />
            </div>
            <div className="pt-2 grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-400">已使用</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatBytes(metrics.disk.used)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">可用空间</p>
                <p className="text-sm font-semibold text-green-600 dark:text-green-400">{formatBytes(metrics.disk.free)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">总容量</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatBytes(metrics.disk.total)}</p>
              </div>
            </div>
          </div>
        </MetricCard>
      </div>
    </div>
  );
};

export default ServerMonitorPage;







