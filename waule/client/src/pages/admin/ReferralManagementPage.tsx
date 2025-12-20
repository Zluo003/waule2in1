import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../lib/api';
import { toast } from 'sonner';

interface ReferralConfig {
  id: string;
  isActive: boolean;
  referrerBonus: number;
  refereeBonus: number;
  commissionRate: number;
  minWithdrawAmount: number;
  withdrawToCreditsRate: number;
}

interface ReferralStats {
  totalUsers: number;
  usersWithReferrer: number;
  referralRate: string;
  totalCommissions: number;
  pendingWithdrawals: { count: number; amount: number };
  completedWithdrawals: { count: number; amount: number };
}

interface WithdrawalRequest {
  id: string;
  userId: string;
  amount: number;
  type: 'ALIPAY' | 'CREDITS';
  alipayAccount: string | null;
  alipayName: string | null;
  status: 'PENDING' | 'APPROVED' | 'COMPLETED' | 'REJECTED';
  processedAt: string | null;
  rejectReason: string | null;
  creditsGranted: number | null;
  createdAt: string;
  user: {
    id: string;
    nickname: string | null;
    username: string | null;
    phone: string | null;
  };
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: '待处理',
  APPROVED: '已通过',
  COMPLETED: '已完成',
  REJECTED: '已拒绝',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
};

const ReferralManagementPage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'withdrawals'>('config');

  const [config, setConfig] = useState<ReferralConfig | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [withdrawalFilter, setWithdrawalFilter] = useState<string>('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, statsRes] = await Promise.all([
        apiClient.get('/referral/admin/config'),
        apiClient.get('/referral/admin/stats'),
      ]);

      if (configRes.success) setConfig(configRes.data);
      if (statsRes.success) setStats(statsRes.data);

      // 加载提现申请
      const withdrawalsRes = await apiClient.get('/referral/admin/withdrawals', {
        params: { status: withdrawalFilter || undefined },
      });
      if (withdrawalsRes.success) {
        setWithdrawals(withdrawalsRes.data.list || []);
      }
    } catch (error) {
      console.error('Failed to load referral data:', error);
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  }, [withdrawalFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await apiClient.put('/referral/admin/config', {
        isActive: config.isActive,
        referrerBonus: config.referrerBonus,
        refereeBonus: config.refereeBonus,
        commissionRate: config.commissionRate,
        minWithdrawAmount: config.minWithdrawAmount,
        withdrawToCreditsRate: config.withdrawToCreditsRate,
      });
      if (res.success) {
        toast.success('配置保存成功');
        loadData();
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleWithdrawal = async (id: string, action: 'approve' | 'complete' | 'reject', rejectReason?: string) => {
    try {
      const res = await apiClient.put(`/referral/admin/withdrawals/${id}`, { action, rejectReason });
      if (res.success) {
        toast.success(res.message);
        loadData();
      } else {
        toast.error(res.message);
      }
    } catch (error: any) {
      toast.error(error.message || '操作失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">推荐返利管理</h1>
        <p className="text-slate-500 dark:text-gray-400 mt-1">管理推荐系统配置和提现申请</p>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-4">
            <div className="text-sm text-slate-500 dark:text-gray-400">推荐用户</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{stats.usersWithReferrer}</div>
            <div className="text-xs text-slate-400">占比 {stats.referralRate}%</div>
          </div>
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-4">
            <div className="text-sm text-slate-500 dark:text-gray-400">累计返利</div>
            <div className="text-2xl font-bold text-orange-500">¥{(stats.totalCommissions / 100).toFixed(2)}</div>
          </div>
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-4">
            <div className="text-sm text-slate-500 dark:text-gray-400">待处理提现</div>
            <div className="text-2xl font-bold text-yellow-500">{stats.pendingWithdrawals.count}</div>
            <div className="text-xs text-slate-400">¥{(stats.pendingWithdrawals.amount / 100).toFixed(2)}</div>
          </div>
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-4">
            <div className="text-sm text-slate-500 dark:text-gray-400">已完成提现</div>
            <div className="text-2xl font-bold text-green-500">{stats.completedWithdrawals.count}</div>
            <div className="text-xs text-slate-400">¥{(stats.completedWithdrawals.amount / 100).toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* Tab 切换 */}
      <div className="flex border-b border-slate-200 dark:border-border-dark mb-6">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'config'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-gray-400'
          }`}
          onClick={() => setActiveTab('config')}
        >
          系统配置
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'withdrawals'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-gray-400'
          }`}
          onClick={() => setActiveTab('withdrawals')}
        >
          提现管理
          {stats && stats.pendingWithdrawals.count > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
              {stats.pendingWithdrawals.count}
            </span>
          )}
        </button>
      </div>

      {/* 配置 Tab */}
      {activeTab === 'config' && config && (
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 启用开关 */}
            <div className="md:col-span-2">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={config.isActive}
                  onChange={e => setConfig({ ...config, isActive: e.target.checked })}
                  className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-medium text-slate-900 dark:text-white">启用推荐系统</span>
              </label>
            </div>

            {/* 推荐人奖励 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                推荐人奖励积分
              </label>
              <input
                type="number"
                min="0"
                value={config.referrerBonus}
                onChange={e => setConfig({ ...config, referrerBonus: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-border-dark rounded-lg"
              />
              <p className="text-xs text-slate-500 mt-1">成功推荐新用户后，推荐人获得的积分</p>
            </div>

            {/* 被推荐人奖励 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                被推荐人奖励积分
              </label>
              <input
                type="number"
                min="0"
                value={config.refereeBonus}
                onChange={e => setConfig({ ...config, refereeBonus: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-border-dark rounded-lg"
              />
              <p className="text-xs text-slate-500 mt-1">新用户使用推荐码注册后获得的积分</p>
            </div>

            {/* 返利比例 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                充值返利比例 (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={(config.commissionRate * 100).toFixed(1)}
                onChange={e => setConfig({ ...config, commissionRate: parseFloat(e.target.value) / 100 || 0 })}
                className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-border-dark rounded-lg"
              />
              <p className="text-xs text-slate-500 mt-1">被推荐人充值后，推荐人获得的返利比例</p>
            </div>

            {/* 最低提现金额 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                最低提现金额 (元)
              </label>
              <input
                type="number"
                min="1"
                value={config.minWithdrawAmount / 100}
                onChange={e => setConfig({ ...config, minWithdrawAmount: (parseFloat(e.target.value) || 0) * 100 })}
                className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-border-dark rounded-lg"
              />
              <p className="text-xs text-slate-500 mt-1">用户申请提现的最低金额门槛</p>
            </div>

            {/* 积分兑换比例 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                积分兑换比例 (1元=?积分)
              </label>
              <input
                type="number"
                min="1"
                value={config.withdrawToCreditsRate}
                onChange={e => setConfig({ ...config, withdrawToCreditsRate: parseInt(e.target.value) || 100 })}
                className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-border-dark rounded-lg"
              />
              <p className="text-xs text-slate-500 mt-1">用户将返利余额兑换积分的比例</p>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={saveConfig}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存配置'}
            </button>
          </div>
        </div>
      )}

      {/* 提现管理 Tab */}
      {activeTab === 'withdrawals' && (
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl overflow-hidden">
          {/* 筛选 */}
          <div className="p-4 border-b border-slate-200 dark:border-border-dark">
            <select
              value={withdrawalFilter}
              onChange={e => setWithdrawalFilter(e.target.value)}
              className="px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-border-dark rounded-lg"
            >
              <option value="">全部状态</option>
              <option value="PENDING">待处理</option>
              <option value="APPROVED">已通过</option>
              <option value="COMPLETED">已完成</option>
              <option value="REJECTED">已拒绝</option>
            </select>
          </div>

          {/* 列表 */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-slate-800/50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">用户</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">金额</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">类型</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">支付宝</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">状态</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">申请时间</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">操作</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500 dark:text-gray-400">
                      暂无提现申请
                    </td>
                  </tr>
                ) : (
                  withdrawals.map(w => (
                    <tr key={w.id} className="border-b border-slate-100 dark:border-border-dark/50">
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium text-slate-900 dark:text-white">
                          {w.user.nickname || w.user.username || '未知'}
                        </div>
                        <div className="text-xs text-slate-500">{w.user.phone}</div>
                      </td>
                      <td className="px-4 py-4 text-orange-500 font-medium">
                        ¥{(w.amount / 100).toFixed(2)}
                      </td>
                      <td className="px-4 py-4">
                        {w.type === 'ALIPAY' ? '提现到支付宝' : '兑换积分'}
                      </td>
                      <td className="px-4 py-4">
                        {w.type === 'ALIPAY' ? (
                          <div className="text-sm">
                            <div>{w.alipayName}</div>
                            <div className="text-slate-500">{w.alipayAccount}</div>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-1 text-xs rounded-full ${STATUS_COLORS[w.status]}`}>
                          {STATUS_LABELS[w.status]}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-500">
                        {new Date(w.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-4">
                        {w.status === 'PENDING' && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleWithdrawal(w.id, 'approve')}
                              className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                            >
                              通过
                            </button>
                            <button
                              onClick={() => {
                                const reason = prompt('请输入拒绝原因:');
                                if (reason) handleWithdrawal(w.id, 'reject', reason);
                              }}
                              className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                            >
                              拒绝
                            </button>
                          </div>
                        )}
                        {w.status === 'APPROVED' && (
                          <button
                            onClick={() => handleWithdrawal(w.id, 'complete')}
                            className="px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                          >
                            标记完成
                          </button>
                        )}
                        {w.status === 'REJECTED' && w.rejectReason && (
                          <span className="text-xs text-red-500">{w.rejectReason}</span>
                        )}
                        {w.status === 'COMPLETED' && w.creditsGranted && (
                          <span className="text-xs text-green-500">+{w.creditsGranted}积分</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReferralManagementPage;
