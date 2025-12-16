import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiClient } from '../lib/api';

const SettingsPage = () => {
  const { user, updateUser, refreshUser, clearAuth } = useAuthStore();
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

  // 页面加载时刷新用户信息，确保积分是最新的
  useEffect(() => {
    console.log('设置页面加载，当前积分:', user?.credits);
    refreshUser().then(() => {
      console.log('刷新后积分:', useAuthStore.getState().user?.credits);
    });
  }, []);

  // 获取用户等级显示名称
  const getRoleName = (role: string) => {
    const roleMap: { [key: string]: string } = {
      ADMIN: '管理员',
      USER: '普通用户',
      VIP: 'VIP用户',
      SVIP: 'SVIP用户',
      INTERNAL: '内部用户',
    };
    return roleMap[role] || role;
  };

  // 获取用户等级徽章样式
  const getRoleBadgeClass = (role: string) => {
    const classMap: { [key: string]: string } = {
      ADMIN: 'bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30',
      USER: 'bg-gray-500/10 dark:bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30',
      VIP: 'bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
      SVIP: 'bg-tiffany-500/10 dark:bg-tiffany-500/20 text-tiffany-600 dark:text-tiffany-400 border-tiffany-500/30',
      INTERNAL: 'bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30',
    };
    return classMap[role] || 'bg-gray-500/10 dark:bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30';
  };

  // 检查昵称可用性
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
      const response = await apiClient.user.checkNickname(value);
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
      const response = await apiClient.user.updateProfile({ nickname });
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
      const response = await apiClient.user.changePassword({
        currentPassword,
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
      const response = await apiClient.user.uploadAvatar(file);
      if (response.success) {
        updateUser(response.data);
        alert('头像上传成功');
      } else {
        alert(response.message || '上传失败');
      }
    } catch (error: any) {
      console.error('上传头像失败:', error);
      alert(error.response?.data?.message || '上传失败，请稍后重试');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background-light dark:bg-background-dark">
      <div className="w-full max-w-2xl">
        {/* 个人资料卡片 */}
        <div className="bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-3xl shadow-soft-lg overflow-hidden">
          {/* 头部装饰 - Aurora渐变样式（参考工作流节点） */}
          <div className="h-32 bg-gradient-to-r from-pink-500/20 dark:from-pink-500/20 from-pink-200/50 via-purple-500/20 dark:via-purple-500/20 via-purple-200/50 to-cyan-500/20 dark:to-cyan-500/20 to-cyan-200/50 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/10 dark:via-black/10 to-transparent" />
          </div>

          {/* 内容区域 */}
          <div className="relative px-8 pb-8">
            {/* 头像 */}
            <div className="flex justify-center -mt-16 mb-6">
              <div className="relative group">
                <div className="w-32 h-32 rounded-full border-4 border-card-light dark:border-card-dark bg-background-light-secondary dark:bg-background-dark-secondary overflow-hidden shadow-soft-lg">
                  {user?.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.nickname || user.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-6xl text-text-light-tertiary dark:text-text-dark-tertiary">
                        account_circle
                      </span>
                    </div>
                  )}
                </div>
                {/* 上传按钮 */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 flex items-center justify-center shadow-md hover:shadow-lg transform hover:scale-110 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed border border-transparent dark:border-white/10"
                >
                  {isUploadingAvatar ? (
                    <span className="material-symbols-outlined text-white text-xl animate-spin">
                      progress_activity
                    </span>
                  ) : (
                    <span className="material-symbols-outlined text-white text-xl">
                      photo_camera
                    </span>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </div>
            </div>

            {/* 用户信息 */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-text-light-primary dark:text-text-dark-primary mb-2">
                {user?.nickname || user?.username || '未命名用户'}
              </h1>
              {/* 用户等级和积分 */}
              <div className="flex items-center justify-center gap-4 mt-4">
                {/* 等级徽章 */}
                <div
                  className={`px-4 py-1.5 rounded-full border font-medium text-sm ${getRoleBadgeClass(
                    user?.role || 'USER'
                  )}`}
                >
                  {getRoleName(user?.role || 'USER')}
                </div>
                {/* 积分显示 */}
                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent-500/10 dark:bg-accent-500/20 border border-accent-500/30">
                  <span className="material-symbols-outlined text-accent-600 dark:text-accent-400 text-lg">
                    stars
                  </span>
                  <span className="text-accent-600 dark:text-accent-400 font-semibold">
                    {user?.credits || 0} 积分
                  </span>
                  <button
                    onClick={() => refreshUser()}
                    className="ml-2 p-1 hover:bg-accent-500/20 rounded-full transition-colors"
                    title="刷新积分"
                  >
                    <span className="material-symbols-outlined text-accent-600 dark:text-accent-400 text-sm">
                      refresh
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* 昵称编辑 */}
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary mb-3">
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg">badge</span>
                    自定义昵称
                  </span>
                </label>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => {
                        setNickname(e.target.value);
                        setNicknameError('');
                        setNicknameSuccess('');
                      }}
                      onBlur={() => {
                        if (nickname && nickname !== user?.nickname) {
                          checkNickname(nickname);
                        }
                      }}
                      maxLength={20}
                      className="w-full px-4 py-3 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-xl text-text-light-primary dark:text-text-dark-primary placeholder-text-light-tertiary dark:placeholder-text-dark-tertiary focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      placeholder="输入你的昵称"
                    />
                    {isCheckingNickname && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <span className="material-symbols-outlined text-text-light-tertiary dark:text-text-dark-tertiary text-xl animate-spin">
                          progress_activity
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleSaveNickname}
                    disabled={
                      isSavingNickname ||
                      isCheckingNickname ||
                      !nickname ||
                      nickname === user?.nickname ||
                      !!nicknameError
                    }
                    className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white rounded-xl font-medium shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center gap-2 border border-transparent dark:border-white/10"
                  >
                    {isSavingNickname ? (
                      <>
                        <span className="material-symbols-outlined text-xl animate-spin">
                          progress_activity
                        </span>
                        保存中
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-xl">check</span>
                        保存
                      </>
                    )}
                  </button>
                </div>
                {/* 错误和成功提示 */}
                {nicknameError && (
                  <div className="mt-2 flex items-center gap-2 text-red-400 text-sm">
                    <span className="material-symbols-outlined text-base">error</span>
                    {nicknameError}
                  </div>
                )}
                {nicknameSuccess && (
                  <div className="mt-2 flex items-center gap-2 text-green-400 text-sm">
                    <span className="material-symbols-outlined text-base">
                      check_circle
                    </span>
                    {nicknameSuccess}
                  </div>
                )}
                <div className="mt-2 text-xs text-text-light-tertiary dark:text-text-dark-tertiary">
                  {nickname.length}/20 个字符
                </div>
              </div>

              {/* 账号信息 */}
              <div className="pt-6 border-t border-border-light dark:border-border-dark">
                <h3 className="text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">info</span>
                  账号信息
                </h3>
                <div className="space-y-3">
                  {user?.phone && (
                    <div className="flex items-center justify-between px-4 py-3 bg-background-light-secondary dark:bg-background-dark-secondary rounded-lg">
                      <span className="text-text-light-secondary dark:text-text-dark-secondary text-sm">手机号</span>
                      <span className="text-text-light-primary dark:text-text-dark-primary font-medium">{user.phone}</span>
                    </div>
                  )}
                  {user?.email && (
                    <div className="flex items-center justify-between px-4 py-3 bg-background-light-secondary dark:bg-background-dark-secondary rounded-lg">
                      <span className="text-text-light-secondary dark:text-text-dark-secondary text-sm">邮箱</span>
                      <span className="text-text-light-primary dark:text-text-dark-primary font-medium">{user.email}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between px-4 py-3 bg-background-light-secondary dark:bg-background-dark-secondary rounded-lg">
                    <span className="text-text-light-secondary dark:text-text-dark-secondary text-sm">用户ID</span>
                    <span className="text-text-light-primary dark:text-text-dark-primary font-mono text-xs">{user?.id}</span>
                  </div>
                </div>
              </div>

              {/* 密码修改 - 仅管理员显示 */}
              {user?.loginType === 'ADMIN' && (
                <div className="pt-6 border-t border-border-light dark:border-border-dark">
                  <h3 className="text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg">lock</span>
                    修改密码
                  </h3>
                  <div className="space-y-4">
                    {/* 当前密码 */}
                    <div className="relative">
                      <input
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => {
                          setCurrentPassword(e.target.value);
                          setPasswordError('');
                        }}
                        className="w-full px-4 py-3 pr-12 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-xl text-text-light-primary dark:text-text-dark-primary placeholder-text-light-tertiary dark:placeholder-text-dark-tertiary focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                        placeholder="当前密码"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-light-tertiary dark:text-text-dark-tertiary hover:text-text-light-primary dark:hover:text-text-dark-primary"
                      >
                        <span className="material-symbols-outlined text-xl">
                          {showCurrentPassword ? 'visibility_off' : 'visibility'}
                        </span>
                      </button>
                    </div>
                    {/* 新密码 */}
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => {
                          setNewPassword(e.target.value);
                          setPasswordError('');
                        }}
                        className="w-full px-4 py-3 pr-12 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-xl text-text-light-primary dark:text-text-dark-primary placeholder-text-light-tertiary dark:placeholder-text-dark-tertiary focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                        placeholder="新密码（至少6位）"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-light-tertiary dark:text-text-dark-tertiary hover:text-text-light-primary dark:hover:text-text-dark-primary"
                      >
                        <span className="material-symbols-outlined text-xl">
                          {showNewPassword ? 'visibility_off' : 'visibility'}
                        </span>
                      </button>
                    </div>
                    {/* 确认新密码 */}
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setPasswordError('');
                        }}
                        className="w-full px-4 py-3 pr-12 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-xl text-text-light-primary dark:text-text-dark-primary placeholder-text-light-tertiary dark:placeholder-text-dark-tertiary focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                        placeholder="确认新密码"
                      />
                    </div>
                    {/* 错误和成功提示 */}
                    {passwordError && (
                      <div className="flex items-center gap-2 text-red-400 text-sm">
                        <span className="material-symbols-outlined text-base">error</span>
                        {passwordError}
                      </div>
                    )}
                    {passwordSuccess && (
                      <div className="flex items-center gap-2 text-green-400 text-sm">
                        <span className="material-symbols-outlined text-base">check_circle</span>
                        {passwordSuccess}
                      </div>
                    )}
                    {/* 提交按钮 */}
                    <button
                      onClick={handleChangePassword}
                      disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                      className="w-full px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white rounded-xl font-medium shadow-md hover:shadow-lg transform hover:scale-[1.02] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2 border border-transparent dark:border-white/10"
                    >
                      {isChangingPassword ? (
                        <>
                          <span className="material-symbols-outlined text-xl animate-spin">progress_activity</span>
                          修改中...
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-xl">check</span>
                          确认修改
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* 退出登录 */}
              <div className="pt-6 border-t border-border-light dark:border-border-dark">
                <button
                  onClick={clearAuth}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 font-medium transition-all duration-200"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '20px', fontVariationSettings: '"FILL" 0, "wght" 300' }}>logout</span>
                  退出登录
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;

