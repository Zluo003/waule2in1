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
    <div className="h-full flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        {/* 个人资料卡片 - 紧凑设计 */}
        <div className="bg-white dark:bg-[#18181b] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] overflow-hidden">
          {/* 内容区域 */}
          <div className="p-6">
            {/* 头像和基本信息 - 横向布局 */}
            <div className="flex items-center gap-4 mb-6">
              {/* 头像 */}
              <div className="relative group flex-shrink-0">
                <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                  {user?.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.nickname || user.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-3xl text-neutral-400 dark:text-neutral-500">
                        account_circle
                      </span>
                    </div>
                  )}
                </div>
                {/* 上传按钮 */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-neutral-800 dark:bg-white text-white dark:text-black flex items-center justify-center shadow-md hover:scale-110 transition-all disabled:opacity-50"
                >
                  {isUploadingAvatar ? (
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-sm">photo_camera</span>
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

              {/* 用户信息 */}
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-semibold text-neutral-900 dark:text-white truncate">
                  {user?.nickname || user?.username || '未命名用户'}
                </h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getRoleBadgeClass(user?.role || 'USER')}`}>
                    {getRoleName(user?.role || 'USER')}
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    {user?.credits || 0} 积分
                  </span>
                </div>
              </div>
            </div>

            {/* 昵称编辑 */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">昵称</label>
                <div className="flex gap-2">
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
                      className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 transition-all"
                      placeholder="输入昵称"
                    />
                    {isCheckingNickname && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <span className="material-symbols-outlined text-neutral-400 text-base animate-spin">progress_activity</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleSaveNickname}
                    disabled={isSavingNickname || isCheckingNickname || !nickname || nickname === user?.nickname || !!nicknameError}
                    className="px-4 py-2 bg-neutral-800 dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingNickname ? '...' : '保存'}
                  </button>
                </div>
                {nicknameError && <p className="mt-1 text-xs text-red-500">{nicknameError}</p>}
                {nicknameSuccess && <p className="mt-1 text-xs text-green-500">{nicknameSuccess}</p>}
              </div>

              {/* 账号信息 */}
              <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800">
                <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">账号信息</label>
                <div className="space-y-2 text-sm">
                  {user?.phone && (
                    <div className="flex justify-between py-1.5">
                      <span className="text-neutral-500 dark:text-neutral-400">手机号</span>
                      <span className="text-neutral-900 dark:text-white">{user.phone}</span>
                    </div>
                  )}
                  {user?.email && (
                    <div className="flex justify-between py-1.5">
                      <span className="text-neutral-500 dark:text-neutral-400">邮箱</span>
                      <span className="text-neutral-900 dark:text-white">{user.email}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1.5">
                    <span className="text-neutral-500 dark:text-neutral-400">用户ID</span>
                    <span className="text-neutral-900 dark:text-white font-mono text-xs">{user?.id?.slice(0, 8)}...</span>
                  </div>
                </div>
              </div>

              {/* 密码修改 - 仅管理员显示 */}
              {user?.loginType === 'ADMIN' && (
                <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800">
                  <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">修改密码</label>
                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(''); }}
                        className="w-full px-3 py-2 pr-10 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                        placeholder="当前密码"
                      />
                      <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                        <span className="material-symbols-outlined text-base">{showCurrentPassword ? 'visibility_off' : 'visibility'}</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => { setNewPassword(e.target.value); setPasswordError(''); }}
                        className="w-full px-3 py-2 pr-10 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                        placeholder="新密码（至少6位）"
                      />
                      <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                        <span className="material-symbols-outlined text-base">{showNewPassword ? 'visibility_off' : 'visibility'}</span>
                      </button>
                    </div>
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(''); }}
                      className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                      placeholder="确认新密码"
                    />
                    {passwordError && <p className="text-xs text-red-500">{passwordError}</p>}
                    {passwordSuccess && <p className="text-xs text-green-500">{passwordSuccess}</p>}
                    <button
                      onClick={handleChangePassword}
                      disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                      className="w-full py-2 bg-neutral-800 dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isChangingPassword ? '修改中...' : '确认修改'}
                    </button>
                  </div>
                </div>
              )}

              {/* 退出登录 */}
              <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  onClick={clearAuth}
                  className="w-full py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                >
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

