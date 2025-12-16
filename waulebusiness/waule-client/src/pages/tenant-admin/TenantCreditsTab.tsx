import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { apiClient } from '../../lib/api';
import { useTenantAuthStore } from '../../store/tenantAuthStore';

interface CreditLog {
  id: string;
  amount: number;
  balance: number;
  type: string;
  description: string | null;
  createdAt: string;
}

interface UsageStats {
  byOperation: {
    operation: string;
    _sum: { creditsCharged: number | null };
    _count: number;
  }[];
  totals: {
    totalCredits: number;
    totalRecords: number;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const typeLabels: Record<string, { label: string; color: string }> = {
  RECHARGE: { label: '充值', color: 'text-green-500 bg-green-500/10' },
  CONSUME: { label: '消费', color: 'text-red-500 bg-red-500/10' },
  REFUND: { label: '退款', color: 'text-blue-500 bg-blue-500/10' },
};

const operationLabels: Record<string, string> = {
  IMAGE_GENERATION: '图像生成',
  VIDEO_GENERATION: '视频生成',
  AUDIO_GENERATION: '音频生成',
  TEXT_GENERATION: '文本生成',
};

const TenantCreditsTab = () => {
  const { user, updateTenantCredits } = useTenantAuthStore();
  const [credits, setCredits] = useState(user?.tenant.credits || 0);
  const [logs, setLogs] = useState<CreditLog[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  // 获取积分余额
  const fetchCredits = useCallback(async () => {
    try {
      const res = await apiClient.get('/tenant-auth/admin/credits');
      setCredits(res.data.credits);
      updateTenantCredits(res.data.credits);
    } catch (error) {
      console.error('获取积分失败', error);
    }
  }, [updateTenantCredits]);

  // 获取积分流水
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/tenant-auth/admin/credit-logs', {
        params: {
          page: pagination.page,
          limit: pagination.limit,
        },
      });
      setLogs(res.data);
      setPagination(res.pagination);
    } catch (error: any) {
      toast.error('获取流水记录失败');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit]);

  // 获取使用统计
  const fetchUsageStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await apiClient.get('/tenant-auth/admin/usage');
      setUsageStats(res.data);
    } catch (error) {
      console.error('获取统计失败', error);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredits();
    fetchUsageStats();
  }, [fetchCredits, fetchUsageStats]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 剩余积分 */}
        <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl">toll</span>
            </div>
            <div>
              <p className="text-sm text-white/80">剩余积分</p>
              <p className="text-3xl font-bold">{credits.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* 累计消耗 */}
        <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl text-red-500">trending_down</span>
            </div>
            <div>
              <p className="text-sm text-gray-500">累计消耗</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {statsLoading ? '-' : (usageStats?.totals.totalCredits || 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* 使用次数 */}
        <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl text-purple-500">bolt</span>
            </div>
            <div>
              <p className="text-sm text-gray-500">使用次数</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {statsLoading ? '-' : (usageStats?.totals.totalRecords || 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 消耗分布 */}
      {usageStats && usageStats.byOperation.length > 0 && (
        <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-white/10 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">消耗分布</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {usageStats.byOperation.map((item) => (
              <div
                key={item.operation}
                className="bg-gray-50 dark:bg-white/5 rounded-xl p-4"
              >
                <p className="text-sm text-gray-500 mb-1">
                  {operationLabels[item.operation] || item.operation}
                </p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {(item._sum.creditsCharged || 0).toLocaleString()}
                </p>
                <p className="text-xs text-gray-400">{item._count} 次</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 积分流水 */}
      <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-white/10 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-white/10">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">积分流水</h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-3 border-purple-500/20 border-t-purple-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-6xl text-gray-300 dark:text-gray-600 mb-4">
              receipt_long
            </span>
            <p className="text-gray-500">暂无流水记录</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/5">
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">
                    时间
                  </th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">
                    类型
                  </th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">
                    变动
                  </th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">
                    余额
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">
                    说明
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const typeInfo = typeLabels[log.type] || {
                    label: log.type,
                    color: 'text-gray-500 bg-gray-500/10',
                  };
                  return (
                    <tr
                      key={log.id}
                      className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
                        {new Date(log.createdAt).toLocaleString('zh-CN')}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${typeInfo.color}`}
                        >
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span
                          className={`font-medium ${
                            log.amount > 0 ? 'text-green-500' : 'text-red-500'
                          }`}
                        >
                          {log.amount > 0 ? '+' : ''}
                          {log.amount.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right text-sm text-gray-600 dark:text-gray-400">
                        {log.balance.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
                        {log.description || '-'}
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-white/10">
            <p className="text-sm text-gray-500">
              第 {pagination.page} / {pagination.totalPages} 页
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page <= 1}
                className="px-3 py-1.5 bg-gray-100 dark:bg-white/10 rounded-lg text-sm disabled:opacity-50"
              >
                上一页
              </button>
              <button
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page >= pagination.totalPages}
                className="px-3 py-1.5 bg-gray-100 dark:bg-white/10 rounded-lg text-sm disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TenantCreditsTab;




