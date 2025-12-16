import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy, useEffect, useState, useMemo } from 'react';
import { useTenantAuthStore } from './store/tenantAuthStore';
import { apiClient } from './lib/api';
import { tryAutoRestoreConfig } from './store/tenantStorageStore';
import ElectronTitleBar from './components/ElectronTitleBar';

const MainLayout = lazy(() => import('./components/layouts/MainLayout'));
const TenantLoginPage = lazy(() => import('./pages/auth/TenantLoginPage'));
const TenantAdminLoginPage = lazy(() => import('./pages/auth/TenantAdminLoginPage'));
const ActivationPage = lazy(() => import('./pages/auth/ActivationPage'));
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
const RecycleBinPage = lazy(() => import('./pages/RecycleBinPage'));
// 租户管理员页面
const TenantAdminPage = lazy(() => import('./pages/tenant-admin/TenantAdminPage'));

/**
 * 生成设备指纹
 * 基于浏览器特征生成稳定的指纹（不含时间戳，每次生成结果相同）
 */
function generateDeviceFingerprint(): string {
  // 基于浏览器特征生成稳定的指纹
  const features = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 0,
    navigator.platform || '',
  ].join('|');

  // 简单哈希（确保每次结果一致）
  let hash = 0;
  for (let i = 0; i < features.length; i++) {
    const char = features.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  // 不含时间戳，纯粹基于浏览器特征
  return `web_${Math.abs(hash).toString(36)}`;
}

function App() {
  const { isAuthenticated, token, activation, clearAuth, updateUser, setActivation, clearActivation, user } = useTenantAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [checkingActivation, setCheckingActivation] = useState(true);

  // 生成设备指纹
  const deviceFingerprint = useMemo(() => generateDeviceFingerprint(), []);

  // 检查激活状态（始终从服务器验证）
  useEffect(() => {
    const checkActivation = async () => {
      try {
        const response = await apiClient.post('/client/check-activation', {
          deviceFingerprint,
        });

        if (response.success && response.data?.isActivated) {
          // 设备已激活
          setActivation({
            tenantId: response.data.tenantId,
            tenantName: response.data.tenantName,
            deviceFingerprint,
          });
        } else {
          // 设备未激活，清除旧的激活状态
          if (activation) {
            clearActivation();
          }
        }
      } catch (error) {
        console.log('检查激活状态失败', error);
        // 网络错误时，如果有缓存的激活信息，暂时保留
      } finally {
        setCheckingActivation(false);
      }
    };

    checkActivation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceFingerprint]);

  // 验证 token 有效性
  useEffect(() => {
    const validateAuth = async () => {
      // 如果没有 token 或没有激活，直接跳过验证
      if (!token || !activation) {
        setIsLoading(false);
        return;
      }

      try {
        // 验证 token 并获取最新用户信息（在请求头携带租户ID）
        const response = await apiClient.get('/tenant-auth/me', {
          headers: { 'X-Tenant-ID': activation.tenantId },
        });
        if (response.success && response.data?.user) {
          updateUser(response.data.user);
        }
      } catch (error) {
        // token 无效，清除认证状态
        console.log('Token 验证失败，清除登录状态');
        clearAuth();
      } finally {
        setIsLoading(false);
      }
    };

    // 等待激活检查完成后再验证 token
    if (!checkingActivation) {
      validateAuth();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkingActivation]);

  // 激活成功回调
  const handleActivated = (newTenantId: string, tenantName: string) => {
    setActivation({
      tenantId: newTenantId,
      tenantName,
      deviceFingerprint,
    });
  };

  // 应用启动时尝试恢复租户存储配置
  useEffect(() => {
    if (!checkingActivation && activation) {
      tryAutoRestoreConfig().then((restored) => {
        if (restored) {
          console.log('[App] 租户存储配置已恢复');
        }
      }).catch((err) => {
        console.warn('[App] 恢复存储配置失败:', err);
      });
    }
  }, [checkingActivation, activation]);

  // 检测是否在 Electron 环境
  const [isElectronEnv, setIsElectronEnv] = useState(false);
  
  useEffect(() => {
    if (window.electronAPI?.isElectron) {
      setIsElectronEnv(true);
    }
  }, []);

  // 加载中
  if (checkingActivation || isLoading) {
    return (
      <div className="h-screen flex flex-col bg-[#030014]">
        <ElectronTitleBar />
        <div className={`flex-1 flex items-center justify-center ${isElectronEnv ? 'pt-8' : ''}`}>
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
            <span className="text-sm text-gray-400">
              {checkingActivation ? '检查激活状态...' : '验证登录状态...'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // 未激活 → 显示激活页面
  if (!activation) {
    return (
      <div className="h-screen flex flex-col bg-[#030014]">
        <ElectronTitleBar />
        <div className={`flex-1 overflow-auto ${isElectronEnv ? 'pt-8' : ''}`}>
          <Suspense fallback={<div className="h-full bg-[#030014]" />}>
            <ActivationPage 
              deviceFingerprint={deviceFingerprint} 
              onActivated={handleActivated} 
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // 已激活，显示正常应用
  return (
    <div className="h-screen flex flex-col bg-[#030014]">
      <ElectronTitleBar />
      <div className={`flex-1 overflow-hidden ${isElectronEnv ? 'pt-8' : ''}`}>
        <Suspense fallback={<div className="p-6 text-center text-gray-400">加载中...</div>}>
      <Routes>
        {/* Public routes */}
        <Route 
          path="/login" 
          element={
            <TenantLoginPage 
              tenantId={activation.tenantId} 
              tenantName={activation.tenantName} 
            />
          } 
        />
        <Route 
          path="/admin-login" 
          element={
            <TenantAdminLoginPage 
              tenantId={activation.tenantId} 
              tenantName={activation.tenantName} 
            />
          } 
        />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />

        {/* 管理后台（需要管理员登录） */}
        <Route
          path="/admin"
          element={
            isAuthenticated && user?.isAdmin ? <TenantAdminPage /> : <Navigate to="/admin-login" replace />
          }
        />

        {/* 工作流页面（管理员和普通用户都可访问） */}
        <Route
          path="/workflow/:workflowId"
          element={
            isAuthenticated ? <WorkflowEditorPage /> : <Navigate to="/login" replace />
          }
        />

        {/* Protected routes - 普通用户（非管理员） */}
        <Route
          element={
            isAuthenticated && !user?.isAdmin ? <MainLayout /> : <Navigate to={user?.isAdmin ? "/admin" : "/login"} replace />
          }
        >
          <Route path="/" element={<Navigate to="/quick" replace />} />
          <Route path="/quick" element={<ProjectsPage />} />
          <Route path="/drama" element={<ProjectsPage />} />

          <Route path="/projects/:projectId/episodes" element={<EpisodesPage />} />
          <Route path="/projects/:projectId/episodes/:episodeId" element={<EpisodeDetailPage />} />
          <Route path="/projects/:projectId/episodes/:episodeId/workflow" element={<WorkflowEditorPage />} />
          <Route path="/projects/:id/workflow" element={<WorkflowEditorPage />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/assets/sora-characters" element={<SoraCharactersPage />} />
          <Route path="/assets/:id" element={<AssetLibraryDetailPage />} />
          <Route path="/recycle-bin" element={<RecycleBinPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* 404 - 根据用户类型重定向 */}
        <Route path="*" element={
          <Navigate to={isAuthenticated ? (user?.isAdmin ? "/admin" : "/quick") : "/login"} replace />
        } />
      </Routes>
        </Suspense>
      </div>
    </div>
  );
}

export default App;
