import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { apiClient } from '../../lib/api';
import { useTenantAuthStore } from '../../store/tenantAuthStore';

interface TenantLoginPageProps {
  tenantId: string;
  tenantName: string;
}

// 浮动粒子组件
const FloatingParticles = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(15)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 bg-white/20 rounded-full animate-float"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 5}s`,
            animationDuration: `${8 + Math.random() * 10}s`,
          }}
        />
      ))}
    </div>
  );
};

const TenantLoginPage = ({ tenantId, tenantName }: TenantLoginPageProps) => {
  const navigate = useNavigate();
  const { setAuth, isAuthenticated } = useTenantAuthStore();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 50, y: 50 });
  const containerRef = useRef<HTMLDivElement>(null);

  // 鼠标追踪
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setMousePosition({
          x: ((e.clientX - rect.left) / rect.width) * 100,
          y: ((e.clientY - rect.top) / rect.height) * 100,
        });
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // 如果已登录，跳转到首页
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/quick');
    }
  }, [isAuthenticated, navigate]);

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
        setAuth(response.data.user, response.data.token, tenantId);
        toast.success('登录成功！');
        navigate('/quick');
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
    <div 
      ref={containerRef}
      className="h-full flex items-center justify-center relative overflow-hidden bg-[#030014]"
    >
      {/* 动态渐变背景 */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0c0118] via-[#050510] to-[#030014]" />
        {/* 动态光晕跟随鼠标 */}
        <div 
          className="absolute w-[600px] h-[600px] bg-neutral-700/15 rounded-full blur-[120px] transition-all duration-1000 ease-out"
          style={{
            left: `calc(${mousePosition.x}% - 300px)`,
            top: `calc(${mousePosition.y}% - 300px)`,
          }}
        />
        <div className="absolute top-[-20%] left-[-15%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[100px] animate-pulse-slow" />
        <div className="absolute bottom-[-20%] right-[-15%] w-[35%] h-[35%] bg-fuchsia-600/8 rounded-full blur-[80px] animate-pulse-slow" style={{ animationDelay: '2s' }} />
      </div>

      <FloatingParticles />

      {/* 登录卡片 - 居中 */}
      <div className="relative z-10 w-full max-w-md mx-4">
        {/* Logo */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <div className="relative">
            <div className="w-14 h-14 bg-gradient-to-br from-violet-500 via-neutral-800 to-fuchsia-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-neutral-800/30">
              <span className="material-symbols-outlined text-white text-3xl">auto_awesome</span>
            </div>
            <div className="absolute -inset-1 bg-gradient-to-br from-violet-500 via-neutral-800 to-fuchsia-500 rounded-2xl blur opacity-30 animate-pulse" />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white tracking-tight">Waule <span className="text-neutral-600/80 font-normal text-xl">企业版</span></h1>
          </div>
        </div>

        {/* 卡片 */}
        <div className="relative">
          {/* 卡片光晕 */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-500/20 via-neutral-800/20 to-fuchsia-500/20 rounded-[28px] blur-xl opacity-50" />
          
          <div className="relative bg-[#0a0a15]/80 backdrop-blur-2xl border border-white/[0.08] rounded-[24px] p-8 shadow-2xl">
            {/* 卡片顶部装饰线 */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-1 bg-gradient-to-r from-transparent via-neutral-800 to-transparent rounded-full" />
            
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-neutral-800/20 rounded-xl mb-4">
                <span className="material-symbols-outlined text-neutral-600 text-2xl">waving_hand</span>
              </div>
              <h2 className="text-xl font-bold text-white mb-1">欢迎回来</h2>
              <p className="text-gray-400 text-sm flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined text-neutral-600 text-sm">business</span>
                {tenantName}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* 用户名 */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">用户名</label>
                <div className="relative group">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-500 text-xl transition-colors group-focus-within:text-neutral-600">
                    person
                  </span>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="请输入用户名"
                    className="w-full pl-12 pr-4 py-3.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-neutral-800/50 focus:bg-white/[0.05] focus:ring-2 focus:ring-neutral-800/20 transition-all"
                  />
                </div>
              </div>

              {/* 密码 */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">密码</label>
                <div className="relative group">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-500 text-xl transition-colors group-focus-within:text-neutral-600">
                    lock
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="请输入密码"
                    className="w-full pl-12 pr-12 py-3.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-neutral-800/50 focus:bg-white/[0.05] focus:ring-2 focus:ring-neutral-800/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-neutral-600 transition-colors"
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
                className="relative w-full py-3.5 bg-gradient-to-r from-violet-600 via-neutral-700 to-fuchsia-600 text-white font-semibold rounded-xl overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-xl hover:shadow-neutral-800/25"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <span className="material-symbols-outlined animate-spin">progress_activity</span>
                      登录中...
                    </>
                  ) : (
                    <>
                      登录
                      <span className="material-symbols-outlined text-xl group-hover:translate-x-1 transition-transform">
                        arrow_forward
                      </span>
                    </>
                  )}
                </span>
                {/* 悬停渐变 */}
                <div className="absolute inset-0 bg-gradient-to-r from-violet-500 via-neutral-800 to-fuchsia-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                {/* 光泽效果 */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </div>
              </button>
            </form>

            {/* 管理员入口 */}
            <div className="mt-6 pt-6 border-t border-white/[0.06]">
              <Link
                to="/admin-login"
                className="flex items-center justify-center gap-2 w-full py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-gray-400 hover:text-white hover:bg-white/[0.06] hover:border-neutral-800/30 transition-all group"
              >
                <span className="material-symbols-outlined text-lg group-hover:text-neutral-600 transition-colors">admin_panel_settings</span>
                <span className="text-sm font-medium">管理员入口</span>
              </Link>
              <p className="text-xs text-gray-600 text-center mt-3">
                忘记密码？请联系管理员重置
              </p>
            </div>
          </div>
        </div>

        {/* 底部版权 */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-600">
            © {new Date().getFullYear()} Waule. All rights reserved.
          </p>
        </div>
      </div>

      {/* CSS 动画样式 */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.2; }
          50% { transform: translateY(-20px) rotate(180deg); opacity: 0.4; }
        }
        
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.1; transform: scale(1); }
          50% { opacity: 0.2; transform: scale(1.05); }
        }
        
        .animate-float {
          animation: float linear infinite;
        }
        
        .animate-pulse-slow {
          animation: pulse-slow 6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default TenantLoginPage;
