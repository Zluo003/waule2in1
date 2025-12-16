import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { apiClient } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Eye, EyeOff, Lock, User, Shield } from 'lucide-react';

const LoginPage = () => {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    totpCode: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [needTotp, setNeedTotp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.username || !formData.password) {
      toast.error('请输入用户名和密码');
      return;
    }

    if (needTotp && !formData.totpCode) {
      toast.error('请输入双因素验证码');
      return;
    }

    setLoading(true);

    try {
      const response = await apiClient.auth.adminLogin({
        username: formData.username,
        password: formData.password,
        totpCode: formData.totpCode || undefined,
      });

      if (response.requireTotp) {
        setNeedTotp(true);
        toast.info('请输入双因素验证码');
        setLoading(false);
        return;
      }

      if (response.success && response.token && response.user) {
        // 验证是否是管理员
        if (response.user.role !== 'ADMIN' && response.user.role !== 'INTERNAL') {
          toast.error('仅管理员可以登录后台');
          setLoading(false);
          return;
        }

        setAuth(response.user, response.token);
        toast.success('登录成功');
        navigate('/');
      } else {
        toast.error(response.message || '登录失败');
      }
    } catch (error: any) {
      const message = error.response?.data?.message || '登录失败，请检查用户名和密码';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 flex items-center justify-center p-4">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo 和标题 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Waule Admin</h1>
          <p className="text-gray-400">管理后台登录</p>
        </div>

        {/* 登录表单 */}
        <form
          onSubmit={handleSubmit}
          className="bg-gray-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-8 space-y-6"
        >
          {/* 用户名 */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">用户名</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="请输入管理员用户名"
                className="w-full pl-11 pr-4 py-3 bg-gray-900/50 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                autoComplete="username"
              />
            </div>
          </div>

          {/* 密码 */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">密码</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="请输入密码"
                className="w-full pl-11 pr-12 py-3 bg-gray-900/50 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* TOTP 验证码（如果需要） */}
          {needTotp && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">双因素验证码</label>
              <input
                type="text"
                value={formData.totpCode}
                onChange={(e) => setFormData({ ...formData, totpCode: e.target.value })}
                placeholder="请输入 6 位验证码"
                maxLength={6}
                className="w-full px-4 py-3 bg-gray-900/50 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors text-center text-2xl tracking-widest"
                autoComplete="one-time-code"
              />
            </div>
          )}

          {/* 登录按钮 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                登录中...
              </span>
            ) : (
              '登录'
            )}
          </button>
        </form>

        {/* 底部信息 */}
        <p className="text-center text-gray-500 text-sm mt-6">
          © {new Date().getFullYear()} Waule. 仅限管理员访问
        </p>
      </div>
    </div>
  );
};

export default LoginPage;







