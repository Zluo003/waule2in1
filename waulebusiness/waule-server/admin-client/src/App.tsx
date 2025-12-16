import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy, useEffect, useState } from 'react';
import { useAuthStore } from './store/authStore';
import { apiClient } from './lib/api';

// 懒加载页面
const LoginPage = lazy(() => import('./pages/LoginPage'));
const AdminLayout = lazy(() => import('./layouts/AdminLayout'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ServerMonitorPage = lazy(() => import('./pages/ServerMonitorPage'));
const TenantsPage = lazy(() => import('./pages/TenantsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const TaskManagementPage = lazy(() => import('./pages/TaskManagementPage'));
const ModelConfigPage = lazy(() => import('./pages/ModelConfigPage'));
const AgentsPage = lazy(() => import('./pages/AgentsPage'));
const BillingManagementPage = lazy(() => import('./pages/BillingManagementPage'));
const NodePromptsPage = lazy(() => import('./pages/NodePromptsPage'));

function App() {
  const { isAuthenticated, user, token, clearAuth, updateUser } = useAuthStore();
  const [isValidating, setIsValidating] = useState(true);

  // 验证 token 有效性
  useEffect(() => {
    const validateAuth = async () => {
      if (!token) {
        setIsValidating(false);
        return;
      }

      try {
        const response = await apiClient.auth.me();
        if (response.user) {
          // 验证是否是管理员
          if (response.user.role !== 'ADMIN' && response.user.role !== 'INTERNAL') {
            clearAuth();
          } else {
            updateUser(response.user);
          }
        }
      } catch {
        clearAuth();
      } finally {
        setIsValidating(false);
      }
    };

    validateAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 验证中显示加载状态
  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-dark">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
          <span className="text-sm text-gray-400">验证登录状态...</span>
        </div>
      </div>
    );
  }

  // 检查是否是管理员
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'INTERNAL';

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background-dark">
          <div className="w-10 h-10 border-3 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
        </div>
      }
    >
      <Routes>
        {/* 登录页 */}
        <Route path="/login" element={<LoginPage />} />

        {/* 受保护的管理页面 */}
        <Route
          element={
            isAuthenticated && isAdmin ? <AdminLayout /> : <Navigate to="/login" replace />
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="server-monitor" element={<ServerMonitorPage />} />
          <Route path="tenants" element={<TenantsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="tasks" element={<TaskManagementPage />} />
          <Route path="model-config" element={<ModelConfigPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="billing" element={<BillingManagementPage />} />
          <Route path="node-prompts" element={<NodePromptsPage />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;



