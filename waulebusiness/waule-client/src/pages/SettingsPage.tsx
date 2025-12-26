import { useState, useRef, useEffect } from 'react';
import { useTenantAuthStore } from '../store/tenantAuthStore';
import { useTenantStorageStore } from '../store/tenantStorageStore';
import { apiClient } from '../lib/api';
import { checkLocalServerHealth, getLocalStorageStats } from '../api/tenantLocalServer';

const SettingsPage = () => {
  const { user, updateUser, clearAuth, activation, getEffectiveCredits } = useTenantAuthStore();
  const { config: storageConfig, setLocalServerUrl, setConnected, enableLocalStorage, disableLocalStorage: _disableLocalStorage } = useTenantStorageStore();
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [nicknameError, setNicknameError] = useState('');
  const [nicknameSuccess, setNicknameSuccess] = useState('');
  const [isCheckingNickname, setIsCheckingNickname] = useState(false);
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 密码修改相关状态
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // 本地存储配置状态
  const [localServerInput, setLocalServerInput] = useState(storageConfig.localServerUrl || '');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<'success' | 'failed' | null>(null);
  const [connectionError, setConnectionError] = useState<string>('');
  const [localStorageStats, setLocalStorageStats] = useState<{ totalSizeFormatted: string; totalFiles: number } | null>(null);

  // 页面加载时刷新用户信息，确保积分是最新的
  useEffect(() => {
    console.log('设置页面加载，当前积分:', getEffectiveCredits(), '模式:', user?.tenant?.creditMode);
    // 租户版从 /tenant/me 获取最新用户信息
    apiClient.tenant.get('/me').then((res: any) => {
      if (res.success && res.data) {
        // 合并用户信息和租户信息
        const updatedUser = {
          ...res.data.user,
          tenant: res.data.tenant,
        };
        updateUser(updatedUser);
        console.log('刷新后积分:', res.data.tenant?.creditMode === 'personal' ? res.data.user?.personalCredits : res.data.tenant?.credits, '模式:', res.data.tenant?.creditMode);
      }
    }).catch(() => {});

    // 如果已配置本地存储，检查连接状态和统计信息
    if (storageConfig.mode === 'LOCAL' && storageConfig.localServerUrl) {
      checkLocalServerHealth().then((connected) => {
        setConnected(connected);
        setConnectionTestResult(connected ? 'success' : 'failed');
        if (connected) {
          getLocalStorageStats().then(setLocalStorageStats);
        }
      });
    }
  }, []);

  // 测试本地服务端连接
  const handleTestConnection = async () => {
    if (!localServerInput) {
      setConnectionTestResult('failed');
      setConnectionError('请输入服务端地址');
      return;
    }

    // 验证地址格式
    const urlPattern = /^https?:\/\/[\w.-]+(:\d+)?$/;
    if (!urlPattern.test(localServerInput.replace(/\/+$/, ''))) {
      setConnectionTestResult('failed');
      setConnectionError('地址格式不正确，应为 http://IP:端口 格式');
      return;
    }

    setIsTestingConnection(true);
    setConnectionTestResult(null);
    setConnectionError('');

    try {
      // 临时设置地址以测试连接
      const testUrl = localServerInput.replace(/\/+$/, ''); // 移除末尾斜杠
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时
      
      const response = await fetch(`${testUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        // 验证返回内容是否真的来自租户服务端
        const data = await response.json();
        if (data.service === 'waule-tenant-server' || data.status === 'ok') {
          setConnectionTestResult('success');
          setConnectionError('');
          // 连接成功，自动保存配置
          setLocalServerUrl(testUrl);
          enableLocalStorage(testUrl);
          setConnected(true);
          // 获取存储统计
          const stats = await getLocalStorageStats();
          setLocalStorageStats(stats);
        } else {
          setConnectionTestResult('failed');
          setConnectionError('该地址不是有效的租户服务端');
          setConnected(false);
        }
      } else {
        setConnectionTestResult('failed');
        setConnectionError(`服务端返回错误: ${response.status}`);
        setConnected(false);
      }
    } catch (error: any) {
      console.error('连接测试失败:', error);
      setConnectionTestResult('failed');
      setConnected(false);
      
      // 根据错误类型提供具体提示
      if (error.name === 'AbortError') {
        setConnectionError('连接超时，请检查地址是否正确');
      } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        setConnectionError('无法连接，请检查：1. 地址是否正确 2. 服务端是否运行 3. 是否在同一局域网');
      } else {
        setConnectionError(error.message || '连接失败');
      }
    } finally {
      setIsTestingConnection(false);
    }
  };

  // 检查昵称可用性（租户内唯一）
  const checkNickname = async (value: string) => {
    if (!value || value.trim().length === 0) {
      setNicknameError('昵称不能为空');
      return false;
    }

    if (value.length > 20) {
      setNicknameError('昵称长度不能超过20个字符');
      return false;
    }

    if (value === user?.nickname) {
      setNicknameError('');
      return true;
    }

    setIsCheckingNickname(true);
    try {
      const response = await apiClient.tenant.get('/check-nickname', { params: { nickname: value } });
      if (response.available) {
        setNicknameError('');
        return true;
      } else {
        setNicknameError(response.message || '该昵称已被使用');
        return false;
      }
    } catch (error) {
      console.error('检查昵称失败:', error);
      setNicknameError('检查昵称失败，请稍后重试');
      return false;
    } finally {
      setIsCheckingNickname(false);
    }
  };

  // 保存昵称
  const handleSaveNickname = async () => {
    if (nickname === user?.nickname) {
      return;
    }

    const isValid = await checkNickname(nickname);
    if (!isValid) return;

    setIsSavingNickname(true);
    try {
      const response = await apiClient.tenant.put('/profile', { nickname });
      if (response.success) {
        updateUser(response.data);
        setNicknameSuccess('昵称更新成功');
        setNicknameError('');
        setTimeout(() => setNicknameSuccess(''), 3000);
      } else {
        setNicknameError(response.message || '更新失败');
      }
    } catch (error: any) {
      console.error('更新昵称失败:', error);
      setNicknameError(error.response?.data?.message || '更新失败，请稍后重试');
    } finally {
      setIsSavingNickname(false);
    }
  };

  // 处理密码修改
  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword) {
      setPasswordError('请输入当前密码');
      return;
    }

    if (!newPassword) {
      setPasswordError('请输入新密码');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('新密码长度不能少于6位');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }

    setIsChangingPassword(true);
    try {
      const response = await apiClient.tenant.put('/password', {
        oldPassword: currentPassword,
        newPassword,
      });
      if (response.success) {
        setPasswordSuccess('密码修改成功');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setPasswordSuccess(''), 3000);
      } else {
        setPasswordError(response.message || '修改失败');
      }
    } catch (error: any) {
      console.error('修改密码失败:', error);
      setPasswordError(error.response?.data?.message || '修改失败，请稍后重试');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // 处理头像上传
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert('只支持 JPG、PNG、GIF 和 WebP 格式的图片');
      return;
    }

    // 验证文件大小（5MB）
    if (file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过 5MB');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      // 先上传文件到 OSS
      const uploadRes = await apiClient.assets.upload(file);
      if (uploadRes.success && uploadRes.data?.url) {
        // 然后更新用户头像
        const response = await apiClient.tenant.put('/profile', { avatar: uploadRes.data.url });
        if (response.success) {
          updateUser(response.data);
          alert('头像上传成功');
        } else {
          alert(response.message || '上传失败');
        }
      } else {
        alert('文件上传失败');
      }
    } catch (error: any) {
      console.error('上传头像失败:', error);
      alert(error.response?.data?.message || '上传失败，请稍后重试');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background-light dark:bg-background-dark">
      <div className="w-full max-w-4xl">
        {/* 个人资料卡片 - 横向布局 */}
        <div className="bg-white dark:bg-[#18181b] border border-border-light dark:border-border-dark rounded-2xl shadow-soft-lg overflow-hidden">
          <div className="flex flex-col md:flex-row">
            {/* 左侧：头像和基本信息 */}
            <div className="md:w-64 flex-shrink-0 bg-gradient-to-br from-neutral-800/10 via-neutral-800/10 to-cyan-500/10 dark:from-neutral-800/20 dark:via-neutral-800/20 dark:to-cyan-500/20 p-6 flex flex-col items-center justify-center">
              {/* 头像 */}
              <div className="relative group mb-4">
                <div className="w-24 h-24 rounded-full border-4 border-white/50 dark:border-white/20 bg-background-light-secondary dark:bg-background-dark-secondary overflow-hidden shadow-lg">
                  {user?.avatar ? (
                    <img src={user.avatar} alt={user.nickname || user.username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-5xl text-text-light-tertiary dark:text-text-dark-tertiary">account_circle</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-neutral-800 dark:bg-white flex items-center justify-center shadow-md hover:scale-110 transition-transform disabled:opacity-50"
                >
                  {isUploadingAvatar ? (
                    <span className="material-symbols-outlined text-white text-base animate-spin">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-white text-base">photo_camera</span>
                  )}
                </button>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleAvatarUpload} className="hidden" />
              </div>
              
              {/* 用户名 */}
              <h1 className="text-xl font-bold text-text-light-primary dark:text-text-dark-primary mb-3 text-center">
                {user?.nickname || user?.username || '未命名'}
              </h1>
              
              {/* 积分 */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent-500/10 border border-accent-500/30">
                <span className="material-symbols-outlined text-accent-600 dark:text-accent-400 text-sm">stars</span>
                <span className="text-accent-600 dark:text-accent-400 font-semibold text-sm">
                  {getEffectiveCredits()}
                  {user?.tenant?.creditMode === 'personal' && <span className="text-xs opacity-70 ml-1">(个人)</span>}
                </span>
              </div>
              
              {/* 退出登录 */}
              <button
                onClick={clearAuth}
                className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 text-sm font-medium transition-colors"
              >
                <span className="material-symbols-outlined text-lg">logout</span>
                退出登录
              </button>
              
              {/* 公司名称和版本号 - 底部 */}
              <div className="mt-auto pt-4 text-xs text-text-light-tertiary dark:text-text-dark-tertiary text-center space-y-1">
                <div>{user?.tenant?.name || activation?.tenantName || ''}</div>
                <div 
                  className="opacity-60 cursor-pointer hover:opacity-100 transition-opacity"
                  onClick={() => (window as any).electronAPI?.checkForUpdates?.()}
                  title="点击检查更新"
                >
                  v{__APP_VERSION__}
                </div>
              </div>
            </div>

            {/* 右侧：设置选项 */}
            <div className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[85vh]">
              {/* 昵称编辑 */}
              <div>
                <label className="block text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary mb-2 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">badge</span>
                  自定义昵称
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => { setNickname(e.target.value); setNicknameError(''); setNicknameSuccess(''); }}
                      onBlur={() => { if (nickname && nickname !== user?.nickname) checkNickname(nickname); }}
                      maxLength={20}
                      className="w-full px-3 py-2 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg text-sm text-text-light-primary dark:text-text-dark-primary placeholder-text-light-tertiary dark:placeholder-text-dark-tertiary focus:outline-none focus:ring-2 focus:ring-neutral-800 transition-all"
                      placeholder="输入昵称"
                    />
                    {isCheckingNickname && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 material-symbols-outlined text-lg animate-spin text-text-light-tertiary">progress_activity</span>
                    )}
                  </div>
                  <button
                    onClick={handleSaveNickname}
                    disabled={isSavingNickname || isCheckingNickname || !nickname || nickname === user?.nickname || !!nicknameError}
                    className="px-4 py-2 bg-neutral-800 dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium shadow hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {isSavingNickname ? <span className="material-symbols-outlined text-base animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-base">check</span>}
                    保存
                  </button>
                </div>
                {nicknameError && <div className="mt-1 flex items-center gap-1 text-red-400 text-xs"><span className="material-symbols-outlined text-sm">error</span>{nicknameError}</div>}
                {nicknameSuccess && <div className="mt-1 flex items-center gap-1 text-green-400 text-xs"><span className="material-symbols-outlined text-sm">check_circle</span>{nicknameSuccess}</div>}
                <div className="mt-1 text-xs text-text-light-tertiary dark:text-text-dark-tertiary">{nickname.length}/20</div>
              </div>

              {/* 账号信息 - 横向排列 */}
              <div className="pt-4 border-t border-border-light dark:border-border-dark">
                <h3 className="text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary mb-3 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">info</span>
                  账号信息
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="flex items-center justify-between px-3 py-2 bg-background-light-secondary dark:bg-background-dark-secondary rounded-lg">
                    <span className="text-text-light-secondary dark:text-text-dark-secondary text-xs">用户名</span>
                    <span className="text-text-light-primary dark:text-text-dark-primary text-sm font-medium">{user?.username}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 bg-background-light-secondary dark:bg-background-dark-secondary rounded-lg">
                    <span className="text-text-light-secondary dark:text-text-dark-secondary text-xs">ID</span>
                    <span className="text-text-light-primary dark:text-text-dark-primary font-mono text-xs truncate max-w-[180px]">{user?.id}</span>
                  </div>
                </div>
              </div>

              {/* 密码修改 - 紧凑布局 */}
              <div className="pt-4 border-t border-border-light dark:border-border-dark">
                <h3 className="text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary mb-3 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">lock</span>
                  修改密码
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(''); }}
                      className="w-full px-3 py-2 pr-9 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg text-sm text-text-light-primary dark:text-text-dark-primary placeholder-text-light-tertiary dark:placeholder-text-dark-tertiary focus:outline-none focus:ring-2 focus:ring-neutral-800 transition-all"
                      placeholder="当前密码"
                    />
                    <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-light-tertiary hover:text-text-light-primary">
                      <span className="material-symbols-outlined text-lg">{showCurrentPassword ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); setPasswordError(''); }}
                      className="w-full px-3 py-2 pr-9 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg text-sm text-text-light-primary dark:text-text-dark-primary placeholder-text-light-tertiary dark:placeholder-text-dark-tertiary focus:outline-none focus:ring-2 focus:ring-neutral-800 transition-all"
                      placeholder="新密码（≥6位）"
                    />
                    <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-light-tertiary hover:text-text-light-primary">
                      <span className="material-symbols-outlined text-lg">{showNewPassword ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  </div>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(''); }}
                    className="w-full px-3 py-2 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg text-sm text-text-light-primary dark:text-text-dark-primary placeholder-text-light-tertiary dark:placeholder-text-dark-tertiary focus:outline-none focus:ring-2 focus:ring-neutral-800 transition-all"
                    placeholder="确认新密码"
                  />
                </div>
                {passwordError && <div className="mt-2 flex items-center gap-1 text-red-400 text-xs"><span className="material-symbols-outlined text-sm">error</span>{passwordError}</div>}
                {passwordSuccess && <div className="mt-2 flex items-center gap-1 text-green-400 text-xs"><span className="material-symbols-outlined text-sm">check_circle</span>{passwordSuccess}</div>}
                <button
                  onClick={handleChangePassword}
                  disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                  className="mt-3 w-full md:w-auto px-6 py-2 bg-neutral-800 dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium shadow hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {isChangingPassword ? (
                    <><span className="material-symbols-outlined text-base animate-spin">progress_activity</span>修改中...</>
                  ) : (
                    <><span className="material-symbols-outlined text-base">check</span>确认修改</>
                  )}
                </button>
              </div>

              {/* 租户服务端配置 - 所有用户可见（商业版必须配置） */}
              <div className="pt-4 border-t border-border-light dark:border-border-dark">
                <h3 className="text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary mb-3 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">storage</span>
                  租户服务端配置
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-cyan-500/20 text-cyan-400 rounded">必须配置</span>
                </h3>
                  
                  {/* 说明 */}
                  <div className="mb-3 p-3 bg-background-light-secondary dark:bg-background-dark-secondary rounded-lg">
                    <div className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-cyan-400 text-lg mt-0.5">info</span>
                      <div className="text-xs text-text-light-tertiary dark:text-text-dark-tertiary">
                        <p className="mb-1">商业版所有素材和生成结果都保存在本地服务器。</p>
                        <p>请确保「Waule 租户服务端」已在本地电脑运行。</p>
                      </div>
                    </div>
                  </div>

                  {/* 连接状态 */}
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-xs text-text-light-secondary dark:text-text-dark-secondary">连接状态：</span>
                    {storageConfig.localServerUrl && storageConfig.isConnected ? (
                      <span className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">
                        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                        已连接
                      </span>
                    ) : storageConfig.localServerUrl ? (
                      <span className="flex items-center gap-1 px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs">
                        <span className="material-symbols-outlined text-sm">warning</span>
                        未连接
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs">
                        <span className="material-symbols-outlined text-sm">error</span>
                        未配置
                      </span>
                    )}
                  </div>

                  {/* 服务端地址配置 */}
                  <div className="space-y-2">
                    <label className="block text-xs text-text-light-tertiary dark:text-text-dark-tertiary">
                      服务端局域网地址
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={localServerInput}
                        onChange={(e) => {
                          setLocalServerInput(e.target.value);
                          setConnectionTestResult(null);
                        }}
                        placeholder="http://192.168.1.100:3002"
                        className="flex-1 px-3 py-2 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg text-sm text-text-light-primary dark:text-text-dark-primary placeholder-text-light-tertiary dark:placeholder-text-dark-tertiary focus:outline-none focus:ring-2 focus:ring-neutral-800 transition-all"
                      />
                      <button
                        onClick={handleTestConnection}
                        disabled={isTestingConnection || !localServerInput}
                        className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        {isTestingConnection ? (
                          <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                        ) : (
                          <span className="material-symbols-outlined text-base">wifi_find</span>
                        )}
                        测试并保存
                      </button>
                    </div>

                    {/* 连接测试结果 */}
                    {connectionTestResult === 'success' && (
                      <div className="flex items-center gap-1 text-green-400 text-xs">
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        连接成功，配置已同步到服务端（下次自动恢复）
                        {localStorageStats && (
                          <span className="ml-2 text-text-light-tertiary dark:text-text-dark-tertiary">
                            · 已存储 {localStorageStats.totalFiles} 个文件，共 {localStorageStats.totalSizeFormatted}
                          </span>
                        )}
                      </div>
                    )}
                    {connectionTestResult === 'failed' && (
                      <div className="flex items-center gap-1 text-red-400 text-xs">
                        <span className="material-symbols-outlined text-sm">error</span>
                        {connectionError || '连接失败，请检查地址是否正确'}
                      </div>
                    )}
                  </div>

                  {/* 提示 */}
                  {!storageConfig.localServerUrl && (
                    <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                      <p className="text-xs text-amber-400 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">warning</span>
                        请先配置服务端地址，否则无法上传文件
                      </p>
                    </div>
                  )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;

