import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api';
import { toast } from 'sonner';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Image,
  Video,
  DollarSign,
  Filter,
  TrendingUp,
  Activity,
} from 'lucide-react';

interface Task {
  id: string;
  tenantId: string;
  tenantUserId: string;
  type: 'IMAGE' | 'VIDEO';
  modelId: string | null;
  prompt: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILURE';
  error: string | null;
  creditsCost: number;
  sourceNodeId: string | null;
  previewNodeCreated: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  tenant: {
    id: string;
    name: string;
  } | null;
  tenantUser: {
    nickname: string | null;
    username: string;
  } | null;
  model: {
    id: string;
    name: string;
    provider: string;
    type: string;
  } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface TaskStats {
  overview: {
    total: number;
    pending: number;
    processing: number;
    success: number;
    failure: number;
    zombie: number;
    successRate: string;
  };
  today: {
    total: number;
    success: number;
    failure: number;
    successRate: string;
  };
  byModel: Array<{
    modelId: string;
    modelName: string;
    provider: string;
    total: number;
    success: number;
    failure: number;
    successRate: string;
  }>;
  byType: Array<{
    type: string;
    total: number;
    success: number;
    failure: number;
    successRate: string;
  }>;
  credits: {
    totalCharged7d: number;
  };
}

const TaskManagementPage = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  // 筛选条件
  const [filters, setFilters] = useState({
    tenantName: '',
    status: '',
    type: '',
    isZombie: false,
    dateFrom: '',
    dateTo: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  // 加载统计数据
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await apiClient.admin.tasks.getStats();
      if (res.success) {
        setStats(res.data);
      }
    } catch (error: any) {
      console.error('Failed to load task stats:', error);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // 加载任务列表
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (filters.tenantName) params.tenantName = filters.tenantName;
      if (filters.status) params.status = filters.status;
      if (filters.type) params.type = filters.type;
      if (filters.isZombie) params.isZombie = 'true';
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;

      const res = await apiClient.admin.tasks.getList(params);
      if (res.success) {
        setTasks(res.data);
        setPagination(res.pagination);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || '获取任务列表失败');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const getStatusBadge = (status: string, progress: number) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">
            <Clock className="w-3 h-3" />
            等待中
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            处理中 {progress}%
          </span>
        );
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
            <CheckCircle className="w-3 h-3" />
            成功
          </span>
        );
      case 'FAILURE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
            <XCircle className="w-3 h-3" />
            失败
          </span>
        );
      default:
        return <span className="text-gray-400">{status}</span>;
    }
  };

  const getTypeBadge = (modelType: string | undefined) => {
    if (modelType === 'IMAGE_GENERATION') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
          <Image className="w-3 h-3" />
          图片
        </span>
      );
    }
    if (modelType === 'VIDEO_GENERATION' || modelType === 'VIDEO_EDITING') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-400">
          <Video className="w-3 h-3" />
          视频
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">
        其他
      </span>
    );
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isZombieTask = (task: Task) => {
    if (task.status !== 'PENDING' && task.status !== 'PROCESSING') return false;
    const updatedAt = new Date(task.updatedAt).getTime();
    const now = Date.now();
    return now - updatedAt > 30 * 60 * 1000; // 30 分钟
  };

  const truncatePrompt = (prompt: string, maxLen: number = 50) => {
    if (!prompt) return '-';
    return prompt.length > maxLen ? prompt.slice(0, maxLen) + '...' : prompt;
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-bold text-text-light-primary dark:text-text-dark-primary">
          任务管理
        </h1>
        <button
          onClick={() => {
            fetchStats();
            fetchTasks();
          }}
          className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      {/* 统计卡片 */}
      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-24 bg-white/50 dark:bg-white/5 rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 opacity-80" />
              <span className="text-xs opacity-80">总任务数</span>
            </div>
            <p className="text-2xl font-bold">{stats.overview.total.toLocaleString()}</p>
            <p className="text-xs opacity-60">今日: {stats.today.total}</p>
          </div>
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 opacity-80" />
              <span className="text-xs opacity-80">成功率</span>
            </div>
            <p className="text-2xl font-bold">{stats.overview.successRate}%</p>
            <p className="text-xs opacity-60">今日: {stats.today.successRate}%</p>
          </div>
          <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl p-4 text-white">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 opacity-80" />
              <span className="text-xs opacity-80">僵尸任务</span>
            </div>
            <p className="text-2xl font-bold">{stats.overview.zombie}</p>
            <p className="text-xs opacity-60">超过30分钟未完成</p>
          </div>
          <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl p-4 text-white">
            <div className="flex items-center gap-2 mb-1">
              <Loader2 className="w-4 h-4 opacity-80" />
              <span className="text-xs opacity-80">处理中</span>
            </div>
            <p className="text-2xl font-bold">{stats.overview.processing}</p>
            <p className="text-xs opacity-60">等待中: {stats.overview.pending}</p>
          </div>
          <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 text-white">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="w-4 h-4 opacity-80" />
              <span className="text-xs opacity-80">失败任务</span>
            </div>
            <p className="text-2xl font-bold">{stats.overview.failure}</p>
            <p className="text-xs opacity-60">今日: {stats.today.failure}</p>
          </div>
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 opacity-80" />
              <span className="text-xs opacity-80">7日消耗积分</span>
            </div>
            <p className="text-2xl font-bold">{stats.credits.totalCharged7d.toLocaleString()}</p>
            <p className="text-xs opacity-60">任务扣费总计</p>
          </div>
        </div>
      ) : null}

      {/* 模型成功率 */}
      {stats && stats.byModel.length > 0 && (
        <div className="bg-white/80 dark:bg-black/60 backdrop-blur-xl border-2 border-slate-200 dark:border-white/10 rounded-2xl p-4 mb-6">
          <h3 className="text-sm font-semibold text-text-light-secondary dark:text-text-dark-secondary mb-3">
            模型成功率（7天）
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {stats.byModel.slice(0, 12).map((model) => (
              <div
                key={model.modelId}
                className="bg-slate-50 dark:bg-white/5 rounded-lg p-3"
              >
                <p
                  className="text-xs text-gray-500 dark:text-gray-400 truncate mb-1"
                  title={model.modelName}
                >
                  {model.modelName}
                </p>
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-bold text-text-light-primary dark:text-text-dark-primary">
                    {model.successRate}%
                  </span>
                  <span className="text-xs text-gray-400">{model.total}次</span>
                </div>
                <div className="mt-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      parseFloat(model.successRate) >= 90
                        ? 'bg-green-500'
                        : parseFloat(model.successRate) >= 70
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${model.successRate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 搜索和筛选 */}
      <div className="bg-white/80 dark:bg-black/60 backdrop-blur-xl border-2 border-slate-200 dark:border-white/10 rounded-2xl p-4 mb-6">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索租户名称..."
              value={filters.tenantName}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, tenantName: e.target.value }))
              }
              className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-text-light-primary dark:text-text-dark-primary placeholder-gray-400 focus:outline-none focus:border-purple-500"
            />
          </div>
          <select
            value={filters.status}
            onChange={(e) => {
              setFilters((prev) => ({ ...prev, status: e.target.value }));
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className="px-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-text-light-primary dark:text-text-dark-primary focus:outline-none focus:border-purple-500"
          >
            <option value="">全部状态</option>
            <option value="PENDING">等待中</option>
            <option value="PROCESSING">处理中</option>
            <option value="SUCCESS">成功</option>
            <option value="FAILURE">失败</option>
          </select>
          <select
            value={filters.type}
            onChange={(e) => {
              setFilters((prev) => ({ ...prev, type: e.target.value }));
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className="px-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-text-light-primary dark:text-text-dark-primary focus:outline-none focus:border-purple-500"
          >
            <option value="">全部类型</option>
            <option value="IMAGE">图片</option>
            <option value="VIDEO">视频</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setFilters((prev) => ({ ...prev, isZombie: !prev.isZombie }));
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
              filters.isZombie
                ? 'bg-amber-500 text-white'
                : 'bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-text-light-primary dark:text-text-dark-primary'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            僵尸任务
          </button>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-text-light-primary dark:text-text-dark-primary flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            更多筛选
          </button>
          <button
            type="submit"
            className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:shadow-lg transition-all"
          >
            搜索
          </button>
        </form>

        {/* 更多筛选 */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/10 flex flex-wrap gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">开始日期</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
                }
                className="px-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-text-light-primary dark:text-text-dark-primary focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">结束日期</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
                }
                className="px-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-text-light-primary dark:text-text-dark-primary focus:outline-none focus:border-purple-500"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setFilters({
                  tenantName: '',
                  status: '',
                  type: '',
                  isZombie: false,
                  dateFrom: '',
                  dateTo: '',
                });
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="self-end px-4 py-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              清除筛选
            </button>
          </div>
        )}
      </div>

      {/* 任务列表 */}
      <div className="bg-white/80 dark:bg-black/60 backdrop-blur-xl border-2 border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-20 text-gray-400">暂无任务数据</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary">
                    租户
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary">
                    类型
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary">
                    模型
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary">
                    状态
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary">
                    提示词
                  </th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary">
                    扣费
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary">
                    创建时间
                  </th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const zombie = isZombieTask(task);
                  return (
                    <tr
                      key={task.id}
                      className={`border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors ${
                        zombie ? 'bg-amber-50 dark:bg-amber-900/10' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {zombie && (
                            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                          )}
                          <div>
                            <div className="font-medium text-text-light-primary dark:text-text-dark-primary">
                              {task.tenant?.name || '未知租户'}
                            </div>
                            <div className="text-xs text-gray-400">
                              {task.tenantUser?.nickname || task.tenantUser?.username || task.tenantUserId.slice(0, 8)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">{getTypeBadge(task.model?.type)}</td>
                      <td className="px-4 py-3">
                        <div
                          className="text-sm text-text-light-primary dark:text-text-dark-primary truncate max-w-[120px]"
                          title={task.model?.name || task.modelId || ''}
                        >
                          {task.model?.name || '未知模型'}
                        </div>
                        <div className="text-xs text-gray-400">
                          {task.model?.provider || ''}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(task.status, 0)}
                        {task.error && (
                          <div
                            className="text-xs text-red-400 mt-1 truncate max-w-[150px]"
                            title={task.error}
                          >
                            {task.error}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[200px]"
                          title={task.prompt}
                        >
                          {truncatePrompt(task.prompt)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {task.creditsCost > 0 ? (
                          <span className="font-medium text-amber-500">
                            {task.creditsCost}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {formatDate(task.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-white/10">
            <div className="text-sm text-gray-400">
              第 {pagination.page} / {pagination.totalPages} 页，共{' '}
              {pagination.total} 条
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                }
                disabled={pagination.page <= 1}
                className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 text-text-light-primary dark:text-text-dark-primary disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() =>
                  setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                }
                disabled={pagination.page >= pagination.totalPages}
                className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 text-text-light-primary dark:text-text-dark-primary disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskManagementPage;
