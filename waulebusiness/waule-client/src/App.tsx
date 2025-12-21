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
 * 获取或生成设备指纹
 * 优先使用已存储的指纹，确保稳定性（解决 Firefox 隐私保护导致指纹变化的问题）
 */
function getOrCreateDeviceFingerprint(): string {
  const STORAGE_KEY = 'waule_device_fingerprint';
  
  // 1. 优先使用已存储的指纹
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored.startsWith('web_')) {
      return stored;
    }
  } catch {
    // localStorage 不可用
  }
  
  // 2. 生成新指纹（使用更稳定的特征，避免 Firefox 隐私保护影响）
  const features = [
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 0,
    navigator.language || 'unknown',
    // 不使用 navigator.userAgent 和 navigator.platform（Firefox 可能修改）
  ].join('|');

  let hash = 0;
  for (let i = 0; i < features.length; i++) {
    const char = features.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  // 添加随机后缀确保唯一性（仅首次生成时）
  const fingerprint = `web_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
  
  // 3. 持久化存储
  try {
    localStorage.setItem(STORAGE_KEY, fingerprint);
  } catch {
    // 存储失败，下次会重新生成
  }
  
  return fingerprint;
}

function App() {
  const { isAuthenticated, token, activation, clearAuth, updateUser, setActivation, clearActivation, user } = useTenantAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [checkingActivation, setCheckingActivation] = useState(true);

  // 获取或生成设备指纹（持久化存储，解决 Firefox 指纹不稳定问题）
  const deviceFingerprint = useMemo(() => getOrCreateDeviceFingerprint(), []);

  // 检查激活状态（始终从服务器验证）
  useEffect(() => {
    const checkActivation = async () => {
      // 先尝试恢复租户存储配置
      await tryAutoRestoreConfig();
      
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
        // 网络错误时，清除激活状态让用户重新配置
        if (activation) {
          clearActivation();
        }
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
          {/* 共享工作流页面（协作者访问） */}
          <Route path="/workflow/:workflowId" element={<WorkflowEditorPage />} />
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
