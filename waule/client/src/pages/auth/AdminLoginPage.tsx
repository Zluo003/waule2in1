import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Shield, KeyRound } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';

const AdminLoginPage = () => {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [requireTotp, setRequireTotp] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    totpCode: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await apiClient.auth.adminLogin(formData);
      
      // 检查是否需要双因素认证
      if (response.requireTotp) {
        setRequireTotp(true);
        toast.info('请输入 Google Authenticator 验证码');
        setLoading(false);
        return;
      }

      if (response.success && response.token) {
        setAuth(response.user, response.token);
        toast.success('登录成功！');
        navigate('/quick');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-md w-full">
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-8 shadow-2xl">
          {/* Logo & Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-neutral-600 rounded-2xl mb-4 shadow-lg">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">管理员登录</h1>
            <p className="text-gray-300">Waule 系统管理后台</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 用户名输入 */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-2">
                用户名
              </label>
              <input
                type="text"
                required
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                disabled={requireTotp}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50"
                placeholder="请输入管理员用户名"
              />
            </div>

            {/* 密码输入 */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-2">
                密码
              </label>
              <input
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                disabled={requireTotp}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50"
                placeholder="请输入密码"
              />
            </div>

            {/* TOTP 验证码输入 - 仅在需要时显示 */}
            {requireTotp && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="block text-sm font-medium text-gray-200 mb-2">
                  <KeyRound className="w-4 h-4 inline mr-1" />
                  双因素验证码
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={formData.totpCode}
                  onChange={(e) => setFormData({ ...formData, totpCode: e.target.value.replace(/\D/g, '') })}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all text-center text-2xl tracking-[0.5em] font-mono"
                  placeholder="000000"
                  autoFocus
                />
                <p className="mt-2 text-xs text-gray-400 text-center">
                  请打开 Google Authenticator 输入 6 位验证码
                </p>
              </div>
            )}

            {/* 登录按钮 */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-neutral-600 text-white font-medium rounded-xl hover:from-neutral-700 hover:to-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-neutral-500/50"
            >
              {loading ? '验证中...' : requireTotp ? '验证并登录' : '登录'}
            </button>
          </form>

          {/* 返回 */}
          <div className="mt-6 text-center space-y-2">
            {requireTotp && (
              <button
                onClick={() => {
                  setRequireTotp(false);
                  setFormData({ ...formData, totpCode: '' });
                }}
                className="text-sm text-amber-400 hover:text-amber-300 transition-colors block w-full"
              >
                ← 重新输入账号密码
              </button>
            )}
            <button
              onClick={() => navigate('/login')}
              className="text-sm text-gray-300 hover:text-gray-200 transition-colors"
            >
              ← 返回普通登录
            </button>
          </div>
        </div>

        {/* 安全提示 */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-400">
            🔐 此入口已启用双因素认证保护
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginPage;
