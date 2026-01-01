import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { toast } from 'sonner';
import { apiClient } from '../lib/api';
import {
  LayoutDashboard,
  Monitor,
  Building2,
  ListTodo,
  Users,
  Bot,
  Cpu,
  Receipt,
  Shield,
  LogOut,
  Menu,
  X,
  FileText,
  Settings,
  CloudCog,
} from 'lucide-react';
import { useState } from 'react';

const navigation = [
  { name: '仪表板', path: '', icon: LayoutDashboard, exact: true },
  { name: '服务器监控', path: 'server-monitor', icon: Monitor },
  { name: '租户管理', path: 'tenants', icon: Building2 },
  { name: '用户管理', path: 'users', icon: Users },
  { name: '任务管理', path: 'tasks', icon: ListTodo },
  { name: '模型配置', path: 'model-config', icon: Cpu },
  { name: '智能体配置', path: 'agents', icon: Bot },
  { name: '计费管理', path: 'billing', icon: Receipt },
  { name: '节点提示词', path: 'node-prompts', icon: FileText },
  { name: '存储设置', path: 'storage', icon: CloudCog },
  { name: '系统设置', path: 'settings', icon: Settings },
];

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, clearAuth } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await apiClient.auth.logout();
    } catch {
      // 忽略错误
    }
    clearAuth();
    toast.success('已退出登录');
    navigate('/login');
  };

  const isActive = (path: string, exact: boolean = false) => {
    const currentPath = location.pathname.replace('/admin', '').replace(/^\//, '');
    if (exact) {
      return currentPath === path;
    }
    return currentPath.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-background-dark flex">
      {/* 移动端菜单按钮 */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-gray-800 rounded-lg text-white"
      >
        {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* 侧边栏遮罩 */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-card-dark border-r border-white/10 transform transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Waule Admin</h1>
                <p className="text-xs text-gray-400">管理后台</p>
              </div>
            </div>
          </div>

          {/* 导航菜单 */}
          <nav className="flex-1 p-4 overflow-y-auto">
            <ul className="space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path, item.exact);
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                        active
                          ? 'bg-purple-500/20 text-purple-400'
                          : 'text-gray-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-sm font-medium">{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* 用户信息和退出 */}
          <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-medium">
                {(user?.nickname || user?.username || 'A')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user?.nickname || user?.username || '管理员'}
                </p>
                <p className="text-xs text-gray-400">{user?.role}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm">退出登录</span>
            </button>
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;



