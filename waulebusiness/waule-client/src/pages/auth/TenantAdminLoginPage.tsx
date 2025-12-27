import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { apiClient } from '../../lib/api';
import { useTenantAuthStore } from '../../store/tenantAuthStore';

interface TenantAdminLoginPageProps {
  tenantId: string;
  tenantName: string;
}

const TenantAdminLoginPage = ({ tenantId, tenantName }: TenantAdminLoginPageProps) => {
  const navigate = useNavigate();
  const { setAuth, isAuthenticated, user } = useTenantAuthStore();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);

  // 如果已登录且是管理员，跳转到管理后台
  useEffect(() => {
    if (isAuthenticated && user?.isAdmin) {
      navigate('/admin');
    }
  }, [isAuthenticated, user, navigate]);

  // 登录
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.username || !formData.password) {
      toast.error('请填写完整信息');
      return;
    }

    setLoading(true);

    try {
      const response = await apiClient.post('/tenant-auth/login', formData, {
        headers: { 'X-Tenant-ID': tenantId },
      });
      if (response.success) {
        // 检查是否是管理员
        if (!response.data.user.isAdmin) {
          toast.error('该账号不是管理员，请使用管理员账号登录');
          setLoading(false);
          return;
        }
        setAuth(response.data.user, response.data.token, tenantId);
        toast.success('登录成功！');
        setTimeout(() => {
          navigate('/admin');
        }, 100);
      } else {
        toast.error(response.message || '登录失败');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center relative overflow-hidden bg-[#0a0a0a]">
      {/* 简约背景 */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a] via-[#111111] to-[#0a0a0a]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-white/[0.02] rounded-full blur-[100px]" />
      </div>

      {/* 登录卡片 */}
      <div className="relative z-10 w-full max-w-md mx-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <img
            src="/logo-dark.png"
            alt="Waule AI"
            className="h-16 w-auto mb-4"
          />
          <h1 className="text-2xl font-semibold text-white tracking-tight">Waule AI Enterprise</h1>
          <p className="text-gray-500 text-sm mt-1">管理后台</p>
        </div>

        {/* 卡片 */}
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8">
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-white/[0.05] border border-white/[0.08] rounded-xl flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-gray-400 text-2xl">shield_person</span>
            </div>
            <h2 className="text-xl font-semibold text-white mb-1">管理员登录</h2>
            <p className="text-gray-500 text-sm flex items-center justify-center gap-1.5">
              <span className="material-symbols-outlined text-gray-500 text-sm">business</span>
              {tenantName}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 用户名 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-400">管理员账号</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-500 text-xl">
                  badge
                </span>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="请输入管理员账号"
                  className="w-full pl-12 pr-4 py-3.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-white/20 focus:bg-white/[0.05] transition-all"
                />
              </div>
            </div>

            {/* 密码 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-400">密码</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-500 text-xl">
                  lock
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="请输入密码"
                  className="w-full pl-12 pr-12 py-3.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-white/20 focus:bg-white/[0.05] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-400 transition-colors"
                >
                  <span className="material-symbols-outlined text-xl">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {/* 登录按钮 */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-white text-black font-semibold rounded-xl hover:bg-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
                  登录中...
                </>
              ) : (
                <>
                  登录管理后台
                  <span className="material-symbols-outlined text-xl">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          {/* 返回用户登录 */}
          <div className="mt-6 pt-6 border-t border-white/[0.06]">
            <Link
              to="/login"
              className="flex items-center justify-center gap-2 w-full py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all"
            >
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              <span className="text-sm font-medium">返回用户登录</span>
            </Link>
            <p className="text-xs text-gray-600 text-center mt-3">
              忘记密码？请联系平台管理员重置
            </p>
          </div>
        </div>

        {/* 底部版权 */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-600">
            © {new Date().getFullYear()} Waule AI Enterprise. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TenantAdminLoginPage;
