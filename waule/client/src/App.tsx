import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy, useEffect, useState } from 'react';
import { useAuthStore } from './store/authStore';
import { apiClient } from './lib/api';
import { connectSocket, disconnectSocket } from './lib/socket';

const MainLayout = lazy(() => import('./components/layouts/MainLayout'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const AdminLoginPage = lazy(() => import('./pages/auth/AdminLoginPage'));
const TermsOfServicePage = lazy(() => import('./pages/legal/TermsOfServicePage'));
const PrivacyPolicyPage = lazy(() => import('./pages/legal/PrivacyPolicyPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const EpisodesPage = lazy(() => import('./pages/EpisodesPage'));
const WorkflowEditorPage = lazy(() => import('./pages/WorkflowEditorPage'));
const EpisodeDetailPage = lazy(() => import('./pages/EpisodeDetailPage'));
const AssetsPage = lazy(() => import('./pages/AssetsPage'));
const AssetLibraryDetailPage = lazy(() => import('./pages/AssetLibraryDetailPage'));
const SoraCharactersPage = lazy(() => import('./pages/SoraCharactersPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AdminPage = lazy(() => import('./pages/admin/AdminPage'));
const RecycleBinPage = lazy(() => import('./pages/RecycleBinPage'));
const RechargePage = lazy(() => import('./pages/RechargePage'));


function App() {
  const { isAuthenticated, user, token, clearAuth, updateUser } = useAuthStore();
  const [isValidating, setIsValidating] = useState(true);

  // 应用启动时验证 token 有效性
  useEffect(() => {
    const validateAuth = async () => {
      // 如果没有 token，直接跳过验证
      if (!token) {
        setIsValidating(false);
        return;
      }

      try {
        // 验证 token 并获取最新用户信息
        const response = await apiClient.get('/auth/me');
        if (response.user) {
          updateUser(response.user);
          // 🔒 登录成功后连接 Socket（用于接收强制退出通知）
          connectSocket();
        }
      } catch (error) {
        // token 无效，清除认证状态
        console.log('Token 验证失败，清除登录状态');
        clearAuth();
        disconnectSocket();
      } finally {
        setIsValidating(false);
      }
    };

    validateAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在应用启动时执行一次

  // 验证中显示加载状态
  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-neutral-500/20 border-t-neutral-500 rounded-full animate-spin" />
          <span className="text-sm text-gray-500 dark:text-gray-400">验证登录状态...</span>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="p-6 text-center text-gray-400">加载中...</div>}>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={isAuthenticated ? <Navigate to="/quick" replace /> : <LandingPage />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/frame25-login" element={<AdminLoginPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />

        {/* Protected routes */}
        <Route
          element={
            isAuthenticated ? <MainLayout /> : <Navigate to="/" replace />
          }
        >
          <Route path="/quick" element={<ProjectsPage />} />
          <Route path="/drama" element={<ProjectsPage />} />

          <Route path="/projects/:projectId/episodes" element={<EpisodesPage />} />
          <Route path="/projects/:projectId/episodes/:episodeId" element={<EpisodeDetailPage />} />
          <Route path="/projects/:projectId/episodes/:episodeId/workflow" element={<WorkflowEditorPage />} />
          <Route path="/projects/:id/workflow" element={<WorkflowEditorPage />} />
          <Route path="/workflow/:workflowId" element={<WorkflowEditorPage />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/assets/sora-characters" element={<SoraCharactersPage />} />
          <Route path="/assets/:id" element={<AssetLibraryDetailPage />} />
          <Route path="/recycle-bin" element={<RecycleBinPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/recharge" element={<RechargePage />} />

          {/* Admin routes - 仅管理员和内部用户可访问 */}
          {(user?.role === 'ADMIN' || user?.role === 'INTERNAL') && (
            <Route path="/frame25/*" element={<AdminPage />} />
          )}
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
