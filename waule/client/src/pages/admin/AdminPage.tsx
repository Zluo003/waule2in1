import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { apiClient } from '../../lib/api';
import ModelConfigPage from './ModelConfigPage';
import AgentsPage from './AgentsPage';
import UsersPage from './UsersPage';
import TaskManagementPage from './TaskManagementPage';
import BillingManagementPage from './BillingManagementPage';
import PaymentConfigPage from './PaymentConfigPage';
import PackageManagementPage from './PackageManagementPage';
import RedeemCodePage from './RedeemCodePage';
import UserLevelConfigPage from './UserLevelConfigPage';
import ServerMonitorPage from './ServerMonitorPage';
import NodePromptsPage from './NodePromptsPage';

// 简易柱状图组件
const MiniBarChart = ({ data, height = 60, unit = '' }: { data: { label: string; value: number }[]; height?: number; unit?: string }) => {
  // 如果数据为空或所有数据都是0，显示提示
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-gray-400" style={{ height }}>
        <span className="material-symbols-outlined text-2xl mb-1">bar_chart</span>
        <span className="text-xs">暂无数据</span>
      </div>
    );
  }
  
  const max = Math.max(...data.map(d => d.value), 1);
  const total = data.reduce((sum, d) => sum + d.value, 0);
  
  // 如果所有数据都是0，显示提示
  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-gray-400" style={{ height }}>
        <span className="material-symbols-outlined text-2xl mb-1">bar_chart</span>
        <span className="text-xs">暂无数据</span>
      </div>
    );
  }
  
  const barHeight = height - 20; // 减去标签高度
  
  return (
    <div className="flex flex-col" style={{ height }}>
      {/* 柱状图区域 */}
      <div className="flex items-end gap-1 flex-1" style={{ height: barHeight }}>
        {data.map((item, i) => {
          const percentage = (item.value / max) * 100;
          return (
            <div 
              key={i} 
              className="flex-1 h-full flex items-end"
            >
              <div
                className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t transition-all duration-300"
                style={{ 
                  height: `${percentage}%`,
                  minHeight: item.value > 0 ? '3px' : '0px'
                }}
                title={`${item.label}: ${item.value}${unit}`}
              />
            </div>
          );
        })}
      </div>
      {/* 标签区域 */}
      <div className="flex gap-1 mt-1">
        {data.map((item, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-[10px] text-gray-400">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// 增长率徽章
const GrowthBadge = ({ rate }: { rate: string | number }) => {
  const numRate = typeof rate === 'string' ? parseFloat(rate) : rate;
  const isPositive = numRate > 0;
  const isZero = numRate === 0;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${
      isZero ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' :
      isPositive ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 
      'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
    }`}>
      {isPositive ? '+' : ''}{numRate}%
    </span>
  );
};

// 角色徽章
const RoleBadge = ({ role }: { role: string }) => {
  const colors: Record<string, string> = {
    ADMIN: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    SVIP: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-900/30 dark:text-neutral-400',
    VIP: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    USER: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${colors[role] || colors.USER}`}>
      {role}
    </span>
  );
};

const AdminDashboard = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const response = await apiClient.admin.getStats();
      const data = response.data?.data || response.data;
      setStats(data);
      setLastUpdate(new Date());
      setError(null);
    } catch (err: any) {
      console.error('Failed to load stats:', err);
      setError(err.response?.data?.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    // 每30秒自动刷新
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [loadStats]);

  if (loading && !stats) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
          <p className="text-gray-500 dark:text-gray-400">加载运营数据中...</p>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="p-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
          <span className="material-symbols-outlined text-4xl text-red-500 mb-2">error</span>
          <p className="text-red-700 dark:text-red-400">{error}</p>
          <button onClick={loadStats} className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">运营仪表板</h1>
          {lastUpdate && (
            <p className="text-xs text-gray-400 mt-1">最后更新: {lastUpdate.toLocaleTimeString('zh-CN')}</p>
          )}
        </div>
        <button
          onClick={loadStats}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          <span className="material-symbols-outlined text-lg">refresh</span>
          刷新
        </button>
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">总用户数</p>
          <p className="text-2xl font-bold">{stats?.users?.total?.toLocaleString() || 0}</p>
          <p className="text-xs opacity-60">活跃: {stats?.users?.active || 0}</p>
        </div>
        <div className="bg-gradient-to-br from-neutral-700 to-neutral-600 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">付费用户</p>
          <p className="text-2xl font-bold">{stats?.users?.paidTotal || 0}</p>
          <p className="text-xs opacity-60">VIP: {stats?.users?.vip || 0} | SVIP: {stats?.users?.svip || 0}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">今日新增</p>
          <p className="text-2xl font-bold">{stats?.users?.todayNew || 0}</p>
          <p className="text-xs opacity-60 flex items-center gap-1">
            较昨日 <GrowthBadge rate={stats?.users?.growthRate || 0} />
          </p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">今日收入</p>
          <p className="text-2xl font-bold">¥{(stats?.revenue?.today || 0).toFixed(2)}</p>
          <p className="text-xs opacity-60">本月: ¥{(stats?.revenue?.month || 0).toFixed(0)}</p>
        </div>
        <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">实时在线</p>
          <p className="text-2xl font-bold">{stats?.online?.current || 0}</p>
          <p className="text-xs opacity-60">今日峰值: {stats?.online?.peakToday || 0}</p>
        </div>
        <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">今日AI调用</p>
          <p className="text-2xl font-bold">{stats?.usage?.todayRecords?.toLocaleString() || 0}</p>
          <p className="text-xs opacity-60">消耗: {stats?.usage?.todayCredits || 0} 积分</p>
        </div>
      </div>

      {/* 第二行指标 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-neutral-500 text-lg">folder</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">活跃项目</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats?.projects?.active || 0}</p>
          <p className="text-xs text-gray-400">总计: {stats?.projects?.total || 0}</p>
        </div>
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-green-500 text-lg">photo_library</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">资产总数</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats?.assets?.total?.toLocaleString() || 0}</p>
          <p className="text-xs text-gray-400">今日新增: {stats?.assets?.todayNew || 0}</p>
        </div>
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-amber-500 text-lg">auto_awesome</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">AI总调用</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats?.usage?.totalRecords?.toLocaleString() || 0}</p>
          <p className="text-xs text-gray-400">历史累计</p>
        </div>
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-blue-500 text-lg">person_add</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">今日新付费</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats?.users?.todayNewPaid || 0}</p>
          <p className="text-xs text-gray-400">新增VIP/SVIP用户</p>
        </div>
      </div>

      {/* 趋势图表 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* 24小时活跃度 */}
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-500">show_chart</span>
            24小时活跃度
          </h3>
          <MiniBarChart 
            data={stats?.trends?.hourlyActivity?.map((h: any) => ({ 
              label: `${h.hour}`, 
              value: h.count 
            })) || []} 
            height={80}
          />
        </div>

        {/* 7天用户增长 */}
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-green-500">trending_up</span>
            7天用户增长
          </h3>
          <MiniBarChart 
            data={stats?.trends?.dailyUserGrowth?.map((d: any) => ({ 
              label: d.date.slice(5), 
              value: d.count 
            })) || []} 
            height={80}
          />
        </div>

        {/* 7天收入趋势 */}
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-500">payments</span>
            7天收入趋势
          </h3>
          <MiniBarChart 
            data={stats?.trends?.dailyRevenue?.map((d: any) => ({ 
              label: d.date.slice(5), 
              value: d.amount 
            })) || []} 
            height={80}
            unit="元"
          />
        </div>
      </div>

      {/* 列表区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 最近注册用户 */}
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-500">group</span>
            最近注册用户
          </h3>
          <div className="space-y-2">
            {stats?.recent?.users?.map((user: any) => (
              <div key={user.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-border-dark last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neutral-400 to-neutral-500 flex items-center justify-center text-white text-sm font-medium">
                    {(user.nickname || user.phone || '?')[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {user.nickname || user.phone?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') || '未知'}
                    </p>
                    <p className="text-xs text-gray-400">{new Date(user.createdAt).toLocaleString('zh-CN')}</p>
                  </div>
                </div>
                <RoleBadge role={user.role} />
              </div>
            ))}
            {(!stats?.recent?.users || stats.recent.users.length === 0) && (
              <p className="text-center text-gray-400 py-4">暂无数据</p>
            )}
          </div>
        </div>

        {/* 最近订单 */}
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-500">receipt_long</span>
            最近成功订单
          </h3>
          <div className="space-y-2">
            {stats?.recent?.orders?.map((order: any) => (
              <div key={order.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-border-dark last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {order.user?.nickname || order.user?.phone?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') || '未知用户'}
                  </p>
                  <p className="text-xs text-gray-400">{order.paidAt ? new Date(order.paidAt).toLocaleString('zh-CN') : '-'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-green-600 dark:text-green-400">¥{(order.amount / 100).toFixed(2)}</p>
                  <p className="text-xs text-gray-400">+{order.credits} 积分</p>
                </div>
              </div>
            ))}
            {(!stats?.recent?.orders || stats.recent.orders.length === 0) && (
              <p className="text-center text-gray-400 py-4">暂无订单</p>
            )}
          </div>
        </div>
      </div>

      {/* AI 使用分布 */}
      {stats?.usage?.byOperation && stats.usage.byOperation.length > 0 && (
        <div className="mt-6 bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-neutral-500">analytics</span>
            7天AI使用分布
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {stats.usage.byOperation.slice(0, 12).map((op: any, i: number) => (
              <div key={i} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={op.operation}>{op.operation}</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{op._count}</p>
                <p className="text-xs text-gray-400">{op._sum?.creditsCharged || 0} 积分</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const AdminPage = () => {
  const location = useLocation();

  const navigation = [
    { name: '仪表板', path: '/frame25', icon: 'dashboard', exact: true },
    { name: '服务器监控', path: '/frame25/server-monitor', icon: 'monitoring' },
    { name: '任务管理', path: '/frame25/tasks', icon: 'task_alt' },
    { name: '用户管理', path: '/frame25/users', icon: 'group' },
    { name: '等级权限', path: '/frame25/user-levels', icon: 'shield_person' },
    { name: '模型配置', path: '/frame25/model-config', icon: 'smart_toy' },
    { name: '智能体配置', path: '/frame25/agents', icon: 'psychology' },
    { name: '计费管理', path: '/frame25/billing', icon: 'receipt_long' },
    { name: '支付配置', path: '/frame25/payment-config', icon: 'account_balance_wallet' },
    { name: '套餐管理', path: '/frame25/packages', icon: 'redeem' },
    { name: '兑换码管理', path: '/frame25/redeem-codes', icon: 'confirmation_number' },
    { name: '节点提示词', path: '/frame25/node-prompts', icon: 'edit_note' },
  ];

  const isActive = (path: string, exact: boolean = false) => {
    if (exact) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-full">
      {/* 侧边栏导航 */}
      <aside className="w-64 bg-white dark:bg-card-dark border-r border-slate-200 dark:border-border-dark p-4">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">管理后台</h2>
          <p className="text-sm text-slate-600 dark:text-gray-400">系统管理与配置</p>
        </div>

        <nav className="space-y-1">
          {navigation.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive(item.path, item.exact)
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-xl">{item.icon}</span>
              <span className="text-sm font-medium">{item.name}</span>
            </Link>
          ))}
        </nav>
      </aside>

      {/* 主内容区域 */}
      <div className="flex-1 overflow-auto">
        <Routes>
          <Route index element={<AdminDashboard />} />
          <Route path="server-monitor" element={<ServerMonitorPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="tasks" element={<TaskManagementPage />} />
          <Route path="user-levels" element={<UserLevelConfigPage />} />
          <Route path="model-config" element={<ModelConfigPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="billing" element={<BillingManagementPage />} />
          <Route path="payment-config" element={<PaymentConfigPage />} />
          <Route path="packages" element={<PackageManagementPage />} />
          <Route path="redeem-codes" element={<RedeemCodePage />} />
          <Route path="node-prompts" element={<NodePromptsPage />} />
        </Routes>
      </div>
    </div>
  );
};

export default AdminPage;
