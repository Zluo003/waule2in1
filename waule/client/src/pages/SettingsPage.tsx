import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiClient } from '../lib/api';
import { toast } from 'sonner';

interface ReferralInfo {
  referralCode: string;
  referralBalance: number;
  referralTotalEarned: number;
  referralCount: number;
  config: {
    isActive: boolean;
    referrerBonus: number;
    refereeBonus: number;
    commissionRate: number;
    minWithdrawAmount: number;
    withdrawToCreditsRate: number;
  };
}

interface Referral {
  id: string;
  nickname: string | null;
  username: string | null;
  avatar: string | null;
  createdAt: string;
  totalCommission: number;
}

interface Commission {
  id: string;
  type: 'REGISTER_BONUS' | 'RECHARGE_COMMISSION';
  amount: number;
  description: string | null;
  createdAt: string;
  referee: { nickname: string | null; username: string | null };
}

interface Withdrawal {
  id: string;
  amount: number;
  type: 'ALIPAY' | 'CREDITS';
  status: 'PENDING' | 'APPROVED' | 'COMPLETED' | 'REJECTED';
  creditsGranted: number | null;
  createdAt: string;
}

interface Message {
  id: string;
  title: string;
  content: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

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

  // 推荐返利相关状态
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [referralLoading, setReferralLoading] = useState(true);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawForm, setWithdrawForm] = useState({
    type: 'CREDITS' as 'ALIPAY' | 'CREDITS',
    alipayAccount: '',
    alipayName: '',
  });
  const [referralTab, setReferralTab] = useState<'overview' | 'referrals' | 'commissions' | 'withdrawals'>('overview');
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);

  // 消息相关状态
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  // 加载推荐信息
  const loadReferralInfo = useCallback(async () => {
    try {
      const [infoRes, referralsRes, commissionsRes, withdrawalsRes] = await Promise.all([
        apiClient.get('/referral/info'),
        apiClient.get('/referral/list'),
        apiClient.get('/referral/commissions'),
        apiClient.get('/referral/withdrawals'),
      ]);
      if (infoRes.success) setReferralInfo(infoRes.data);
      if (referralsRes.success) setReferrals(referralsRes.data.list || []);
      if (commissionsRes.success) setCommissions(commissionsRes.data.list || []);
      if (withdrawalsRes.success) setWithdrawals(withdrawalsRes.data.list || []);
    } catch (error) {
      console.error('加载推荐信息失败:', error);
    } finally {
      setReferralLoading(false);
    }
  }, []);

  // 加载消息
  const loadMessages = useCallback(async () => {
    try {
      const [msgsRes, countRes] = await Promise.all([
        apiClient.get('/messages'),
        apiClient.get('/messages/unread-count'),
      ]);
      if (msgsRes.success) setMessages(msgsRes.data.list || []);
      if (countRes.success) setUnreadCount(countRes.data.count || 0);
    } catch (error) {
      console.error('加载消息失败:', error);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  // 标记消息为已读
  const handleReadMessage = async (msg: Message) => {
    setSelectedMessage(msg);
    if (!msg.isRead) {
      try {
        await apiClient.put(`/messages/${msg.id}/read`);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isRead: true } : m));
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch (error) {
        console.error('标记已读失败:', error);
      }
    }
  };

  // 删除消息
  const handleDeleteMessage = async (id: string) => {
    try {
      await apiClient.delete(`/messages/${id}`);
      setMessages(prev => prev.filter(m => m.id !== id));
      setSelectedMessage(null);
      toast.success('消息已删除');
    } catch (error) {
      toast.error('删除失败');
    }
  };

  // 清空所有消息
  const handleClearAllMessages = async () => {
    if (!confirm('确定清空所有消息？')) return;
    try {
      await apiClient.delete('/messages');
      setMessages([]);
      setUnreadCount(0);
      toast.success('已清空所有消息');
    } catch (error) {
      toast.error('清空失败');
    }
  };

  // 页面加载时刷新用户信息，确保积分是最新的
  useEffect(() => {
    refreshUser();
    loadReferralInfo();
    loadMessages();
  }, [loadReferralInfo, loadMessages]);

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

  // 复制推荐码
  const copyReferralCode = () => {
    if (referralInfo?.referralCode) {
      navigator.clipboard.writeText(referralInfo.referralCode);
      toast.success('推荐码已复制');
    }
  };

  // 复制推荐链接
  const copyReferralLink = () => {
    if (referralInfo?.referralCode) {
      const link = `${window.location.origin}/login?ref=${referralInfo.referralCode}`;
      navigator.clipboard.writeText(link);
      toast.success('推荐链接已复制');
    }
  };

  // 提现
  const handleWithdraw = async () => {
    if (!referralInfo) return;

    if (referralInfo.referralBalance < referralInfo.config.minWithdrawAmount) {
      toast.error(`余额不足，最低提现金额为 ${(referralInfo.config.minWithdrawAmount / 100).toFixed(0)} 元`);
      return;
    }

    if (withdrawForm.type === 'ALIPAY' && (!withdrawForm.alipayAccount || !withdrawForm.alipayName)) {
      toast.error('请填写支付宝账号和姓名');
      return;
    }

    setWithdrawing(true);
    try {
      const res = await apiClient.post('/referral/withdraw', {
        amount: referralInfo.referralBalance,
        type: withdrawForm.type,
        alipayAccount: withdrawForm.alipayAccount,
        alipayName: withdrawForm.alipayName,
      });
      if (res.success) {
        toast.success(res.message);
        setShowWithdrawModal(false);
        loadReferralInfo();
        refreshUser();
      } else {
        toast.error(res.message);
      }
    } catch (error: any) {
      toast.error(error.message || '提现失败');
    } finally {
      setWithdrawing(false);
    }
  };

  const STATUS_LABELS: Record<string, string> = {
    PENDING: '待处理',
    APPROVED: '已通过',
    COMPLETED: '已完成',
    REJECTED: '已拒绝',
  };

  const STATUS_COLORS: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    APPROVED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="w-full max-w-6xl flex gap-6">
        {/* 左侧：个人资料卡片 */}
        <div className="w-80 flex-shrink-0">
        <div className="bg-white dark:bg-[#18181b] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] overflow-hidden h-full">
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

        {/* 右侧：推荐返利卡片 - 更宽 */}
        <div className="flex-1">
          <div className="bg-white dark:bg-[#18181b] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] overflow-hidden h-full">
            <div className="p-6">
              {referralLoading ? (
                <div className="flex items-center justify-center py-8">
                  <span className="material-symbols-outlined text-2xl text-neutral-400 animate-spin">progress_activity</span>
                </div>
              ) : referralInfo?.config.isActive ? (
                <>
                  {/* 标题和标签页 */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-xl text-orange-500">share</span>
                      <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">推荐返利</h2>
                    </div>
                    <div className="flex gap-1 text-xs">
                      {(['overview', 'referrals', 'commissions', 'withdrawals'] as const).map(tab => (
                        <button
                          key={tab}
                          onClick={() => setReferralTab(tab)}
                          className={`px-3 py-1.5 rounded-lg transition-colors ${
                            referralTab === tab
                              ? 'bg-neutral-800 dark:bg-white text-white dark:text-black'
                              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                          }`}
                        >
                          {tab === 'overview' ? '概览' : tab === 'referrals' ? '邀请明细' : tab === 'commissions' ? '返利明细' : '提现记录'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 概览标签 */}
                  {referralTab === 'overview' && (
                    <div className="grid grid-cols-2 gap-4">
                      {/* 左列：推荐码和统计 */}
                      <div>
                        {/* 推荐码 */}
                        <div className="bg-gradient-to-r from-orange-500 to-pink-500 rounded-xl p-4 text-white mb-4">
                          <div className="text-xs opacity-80 mb-1">我的推荐码</div>
                          <div className="text-2xl font-bold tracking-wider mb-3">{referralInfo?.referralCode}</div>
                          <div className="flex gap-2">
                            <button onClick={copyReferralCode} className="flex-1 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors">
                              复制推荐码
                            </button>
                            <button onClick={copyReferralLink} className="flex-1 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors">
                              复制链接
                            </button>
                          </div>
                        </div>

                        {/* 统计数据 */}
                        <div className="grid grid-cols-3 gap-2 mb-4">
                          <div className="text-center p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
                            <div className="text-xl font-bold text-neutral-900 dark:text-white">{referralInfo?.referralCount || 0}</div>
                            <div className="text-xs text-neutral-500">已邀请</div>
                          </div>
                          <div className="text-center p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
                            <div className="text-xl font-bold text-orange-500">¥{((referralInfo?.referralTotalEarned || 0) / 100).toFixed(0)}</div>
                            <div className="text-xs text-neutral-500">累计返利</div>
                          </div>
                          <div className="text-center p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
                            <div className="text-xl font-bold text-green-500">¥{((referralInfo?.referralBalance || 0) / 100).toFixed(0)}</div>
                            <div className="text-xs text-neutral-500">可提现</div>
                          </div>
                        </div>

                        {/* 提现按钮 */}
                        {referralInfo && referralInfo.referralBalance >= referralInfo.config.minWithdrawAmount ? (
                          <button onClick={() => setShowWithdrawModal(true)} className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors">
                            提现 ¥{(referralInfo.referralBalance / 100).toFixed(2)}
                          </button>
                        ) : (
                          <div className="text-center text-xs text-neutral-400 py-2">
                            满 {((referralInfo?.config.minWithdrawAmount || 20000) / 100).toFixed(0)} 元可提现
                          </div>
                        )}
                      </div>

                      {/* 右列：奖励规则和最近记录 */}
                      <div>
                        {/* 奖励规则 */}
                        <div className="bg-neutral-50 dark:bg-neutral-900 rounded-xl p-4 mb-4">
                          <div className="text-sm font-medium text-neutral-900 dark:text-white mb-3">奖励规则</div>
                          <div className="space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-500 text-[10px] font-bold">1</span>
                              <span>邀请好友注册，您获得 <b className="text-blue-500">{referralInfo?.config.referrerBonus}</b> 积分</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-500 text-[10px] font-bold">2</span>
                              <span>好友注册后获得 <b className="text-green-500">{referralInfo?.config.refereeBonus}</b> 积分</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center text-orange-500 text-[10px] font-bold">3</span>
                              <span>好友充值，您获得 <b className="text-orange-500">{((referralInfo?.config.commissionRate || 0) * 100).toFixed(0)}%</b> 返现</span>
                            </div>
                          </div>
                        </div>

                        {/* 最近返利 */}
                        <div className="bg-neutral-50 dark:bg-neutral-900 rounded-xl p-4">
                          <div className="text-sm font-medium text-neutral-900 dark:text-white mb-3">最近返利</div>
                          {commissions.length === 0 ? (
                            <div className="text-xs text-neutral-400 text-center py-4">暂无返利记录</div>
                          ) : (
                            <div className="space-y-2 max-h-32 overflow-y-auto">
                              {commissions.slice(0, 5).map(c => (
                                <div key={c.id} className="flex items-center justify-between text-xs">
                                  <div className="text-neutral-600 dark:text-neutral-400 truncate flex-1">
                                    {c.referee?.nickname || c.referee?.username || '用户'}
                                  </div>
                                  <div className={c.type === 'REGISTER_BONUS' ? 'text-blue-500' : 'text-orange-500'}>
                                    {c.type === 'REGISTER_BONUS' ? `+${c.amount}积分` : `+¥${(c.amount / 100).toFixed(2)}`}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 邀请明细标签 */}
                  {referralTab === 'referrals' && (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {referrals.length === 0 ? (
                        <div className="text-center py-8 text-neutral-400 text-sm">暂无邀请记录</div>
                      ) : (
                        referrals.map(r => (
                          <div key={r.id} className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-neutral-200 dark:bg-neutral-700 rounded-full flex items-center justify-center">
                                {r.avatar ? <img src={r.avatar} alt="" className="w-full h-full rounded-full object-cover" /> : <span className="material-symbols-outlined text-neutral-400 text-sm">person</span>}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-neutral-900 dark:text-white">{r.nickname || r.username || '未知用户'}</div>
                                <div className="text-xs text-neutral-400">{new Date(r.createdAt).toLocaleDateString()}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium text-orange-500">+¥{(r.totalCommission / 100).toFixed(2)}</div>
                              <div className="text-xs text-neutral-400">累计返利</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* 返利明细标签 */}
                  {referralTab === 'commissions' && (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {commissions.length === 0 ? (
                        <div className="text-center py-8 text-neutral-400 text-sm">暂无返利记录</div>
                      ) : (
                        commissions.map(c => (
                          <div key={c.id} className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
                            <div>
                              <div className="text-sm font-medium text-neutral-900 dark:text-white">
                                {c.type === 'REGISTER_BONUS' ? '邀请注册奖励' : '充值返利'}
                              </div>
                              <div className="text-xs text-neutral-400">
                                {c.referee?.nickname || c.referee?.username || '用户'} · {new Date(c.createdAt).toLocaleString()}
                              </div>
                            </div>
                            <div className={`text-sm font-medium ${c.type === 'REGISTER_BONUS' ? 'text-blue-500' : 'text-orange-500'}`}>
                              {c.type === 'REGISTER_BONUS' ? `+${c.amount} 积分` : `+¥${(c.amount / 100).toFixed(2)}`}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* 提现记录标签 */}
                  {referralTab === 'withdrawals' && (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {withdrawals.length === 0 ? (
                        <div className="text-center py-8 text-neutral-400 text-sm">暂无提现记录</div>
                      ) : (
                        withdrawals.map(w => (
                          <div key={w.id} className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
                            <div>
                              <div className="text-sm font-medium text-neutral-900 dark:text-white">
                                {w.type === 'ALIPAY' ? '提现到支付宝' : '兑换积分'}
                              </div>
                              <div className="text-xs text-neutral-400">{new Date(w.createdAt).toLocaleString()}</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-0.5 text-xs rounded ${STATUS_COLORS[w.status]}`}>{STATUS_LABELS[w.status]}</span>
                              <div className="text-sm font-medium text-orange-500">¥{(w.amount / 100).toFixed(2)}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-neutral-400">
                  <span className="material-symbols-outlined text-4xl mb-2">share_off</span>
                  <p className="text-sm">推荐系统暂未开放</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：消息面板 */}
        <div className="w-80 flex-shrink-0">
          <div className="bg-white dark:bg-[#18181b] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] overflow-hidden h-full">
            <div className="p-6">
              {/* 标题 */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-xl text-blue-500">mail</span>
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">消息</h2>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">{unreadCount}</span>
                  )}
                </div>
                {messages.length > 0 && (
                  <button
                    onClick={handleClearAllMessages}
                    className="text-xs text-neutral-400 hover:text-red-500 transition-colors"
                  >
                    清空
                  </button>
                )}
              </div>

              {/* 消息列表 */}
              {messagesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <span className="material-symbols-outlined text-2xl text-neutral-400 animate-spin">progress_activity</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-neutral-400">
                  <span className="material-symbols-outlined text-4xl mb-2">inbox</span>
                  <p className="text-sm">暂无消息</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {messages.map(msg => (
                    <div
                      key={msg.id}
                      onClick={() => handleReadMessage(msg)}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        msg.isRead
                          ? 'bg-neutral-50 dark:bg-neutral-900'
                          : 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium truncate ${msg.isRead ? 'text-neutral-600 dark:text-neutral-400' : 'text-neutral-900 dark:text-white'}`}>
                            {msg.title}
                          </div>
                          <div className="text-xs text-neutral-400 mt-1">
                            {new Date(msg.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        {!msg.isRead && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5"></span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 消息详情弹窗 */}
      {selectedMessage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[#18181b] rounded-2xl p-6 w-full max-w-md mx-4 border border-neutral-200 dark:border-neutral-800">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white">{selectedMessage.title}</h3>
              <button onClick={() => setSelectedMessage(null)} className="text-neutral-400 hover:text-neutral-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="text-xs text-neutral-400 mb-4">{new Date(selectedMessage.createdAt).toLocaleString()}</div>
            <div className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap mb-6">{selectedMessage.content}</div>
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedMessage(null)}
                className="flex-1 py-2 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
              >
                关闭
              </button>
              <button
                onClick={() => handleDeleteMessage(selectedMessage.id)}
                className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 提现弹窗 */}
      {showWithdrawModal && referralInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[#18181b] rounded-2xl p-6 w-full max-w-sm mx-4 border border-neutral-200 dark:border-neutral-800">
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-4">提现申请</h3>
            
            <div className="mb-4">
              <div className="text-sm text-neutral-500 mb-1">提现金额</div>
              <div className="text-2xl font-bold text-orange-500">¥{(referralInfo.referralBalance / 100).toFixed(2)}</div>
            </div>

            <div className="mb-4">
              <div className="text-sm text-neutral-500 mb-2">提现方式</div>
              <div className="flex gap-2">
                <button
                  className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
                    withdrawForm.type === 'CREDITS'
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-600'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                  }`}
                  onClick={() => setWithdrawForm({ ...withdrawForm, type: 'CREDITS' })}
                >
                  兑换积分
                </button>
                <button
                  className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
                    withdrawForm.type === 'ALIPAY'
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-600'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                  }`}
                  onClick={() => setWithdrawForm({ ...withdrawForm, type: 'ALIPAY' })}
                >
                  支付宝
                </button>
              </div>
            </div>

            {withdrawForm.type === 'CREDITS' && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-blue-600 dark:text-blue-400">
                可兑换 {Math.floor((referralInfo.referralBalance / 100) * referralInfo.config.withdrawToCreditsRate)} 积分，即时到账
              </div>
            )}

            {withdrawForm.type === 'ALIPAY' && (
              <div className="space-y-2 mb-4">
                <input
                  type="text"
                  value={withdrawForm.alipayName}
                  onChange={e => setWithdrawForm({ ...withdrawForm, alipayName: e.target.value })}
                  placeholder="支付宝真实姓名"
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                />
                <input
                  type="text"
                  value={withdrawForm.alipayAccount}
                  onChange={e => setWithdrawForm({ ...withdrawForm, alipayAccount: e.target.value })}
                  placeholder="支付宝账号"
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                />
                <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-xs text-yellow-600">
                  人工审核，1-3个工作日到账
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowWithdrawModal(false)}
                className="flex-1 py-2 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
              >
                取消
              </button>
              <button
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
              >
                {withdrawing ? '处理中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;

