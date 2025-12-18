import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenantAuthStore } from '../../store/tenantAuthStore';
import TenantUsersTab from './TenantUsersTab';
import TenantCreditsTab from './TenantCreditsTab';
import TenantDevicesTab from './TenantDevicesTab';
import TenantAssetsTab from './TenantAssetsTab';
import TenantReportsTab from './TenantReportsTab';
import { toast } from 'sonner';

type TabType = 'users' | 'credits' | 'devices' | 'assets' | 'reports';

const tabs: { id: TabType; label: string; icon: string }[] = [
  { id: 'users', label: '用户管理', icon: 'group' },
  { id: 'credits', label: '积分管理', icon: 'payments' },
  { id: 'devices', label: '设备管理', icon: 'devices' },
  { id: 'assets', label: '资产管理', icon: 'perm_media' },
  { id: 'reports', label: '数据报表', icon: 'bar_chart' },
];

const TenantAdminPage = () => {
  const navigate = useNavigate();
  const { user, clearAuth } = useTenantAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('users');

  const handleLogout = () => {
    clearAuth();
    navigate('/admin-login');
  };

  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen bg-[#030014] flex items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-6xl text-gray-400 mb-4">lock</span>
          <h2 className="text-xl font-bold text-white mb-2">无权限访问</h2>
          <p className="text-gray-500">此页面仅限租户管理员访问</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030014]">
      {/* 页面头部 */}
      <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 via-neutral-800 to-neutral-800 rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-white">admin_panel_settings</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">
                    管理控制台
                  </h1>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-400">
                      {user.tenant.name}
                    </p>
                    {user.tenant.apiKey && (
                      <>
                        <span className="text-gray-600">·</span>
                        <button
                          onClick={() => {
                            const apiKey = user.tenant.apiKey!;
                            // 兼容 HTTP 环境的复制方法
                            if (navigator.clipboard && window.isSecureContext) {
                              navigator.clipboard.writeText(apiKey).then(() => {
                                toast.success('API Key 已复制到剪贴板');
                              }).catch(() => {
                                fallbackCopy(apiKey);
                              });
                            } else {
                              fallbackCopy(apiKey);
                            }
                            function fallbackCopy(text: string) {
                              const textarea = document.createElement('textarea');
                              textarea.value = text;
                              textarea.style.position = 'fixed';
                              textarea.style.opacity = '0';
                              document.body.appendChild(textarea);
                              textarea.select();
                              try {
                                document.execCommand('copy');
                                toast.success('API Key 已复制到剪贴板');
                              } catch {
                                toast.error('复制失败，请手动复制');
                              }
                              document.body.removeChild(textarea);
                            }
                          }}
                          className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                          title="点击复制 API Key"
                        >
                          <span className="font-mono bg-white/5 px-1.5 py-0.5 rounded">
                            {user.tenant.apiKey.slice(0, 12)}...
                          </span>
                          <span className="material-symbols-outlined text-sm">content_copy</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {/* 积分显示 */}
                <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-xl px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-500">toll</span>
                    <div>
                      <p className="text-xs text-gray-400">剩余积分</p>
                      <p className="text-lg font-bold text-amber-500">
                        {user.tenant.credits.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
                {/* 用户信息和退出 */}
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-medium text-white">{user.nickname || user.username}</p>
                    <p className="text-xs text-gray-400">管理员</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    title="退出登录"
                  >
                    <span className="material-symbols-outlined">logout</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Tab 导航 */}
            <div className="flex gap-1 mt-4 bg-white/5 rounded-xl p-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-white/10 text-neutral-600 shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-xl">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tab 内容 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'users' && <TenantUsersTab />}
        {activeTab === 'credits' && <TenantCreditsTab />}
        {activeTab === 'devices' && <TenantDevicesTab />}
        {activeTab === 'assets' && <TenantAssetsTab />}
        {activeTab === 'reports' && <TenantReportsTab />}
      </div>
    </div>
  );
};

export default TenantAdminPage;

