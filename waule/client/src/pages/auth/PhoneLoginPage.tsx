import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';

const PhoneLoginPage = () => {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [formData, setFormData] = useState({
    phone: '',
    code: '',
  });
  const [activeFeature, setActiveFeature] = useState(0);

  // 功能特性轮播
  const features = [
    { icon: 'movie', title: 'AI 视频生成', desc: '支持 Sora、Vidu 等顶级模型，文字描述即可生成电影级画面，让创意瞬间变为现实' },
    { icon: 'image', title: 'AI 图像创作', desc: '集成 Midjourney、Nano Banana Pro 等主流引擎，风格百变，从概念草图到精美海报一步到位' },
    { icon: 'account_tree', title: '可视化工作流', desc: '节点式拖拽编排，图像、视频、音频无缝串联，复杂创作也能轻松掌控' },
    { icon: 'group', title: '实时协作', desc: '多人同时在线编辑，创意即时同步，团队协作效率提升 10 倍' },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % features.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // 发送验证码
  const handleSendCode = async () => {
    if (!formData.phone) {
      toast.error('请输入手机号码');
      return;
    }

    if (!/^1[3-9]\d{9}$/.test(formData.phone)) {
      toast.error('请输入有效的手机号码');
      return;
    }

    setSendingCode(true);

    try {
      await apiClient.auth.sendCode({ phone: formData.phone });
      toast.success('验证码已发送');
      
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error: any) {
      toast.error(error.response?.data?.message || '发送验证码失败');
    } finally {
      setSendingCode(false);
    }
  };

  // 登录
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.phone || !formData.code) {
      toast.error('请填写完整信息');
      return;
    }

    setLoading(true);

    try {
      const response = await apiClient.auth.loginWithPhone(formData);
      setAuth(response.user, response.token);
      toast.success('登录成功！');
      navigate('/quick');
    } catch (error: any) {
      toast.error(error.response?.data?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-[#030014]">
      {/* 渐变背景 */}
      <div className="absolute inset-0">
        {/* 主渐变 */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0c0118] via-[#0a0a1a] to-[#030014]" />
        
        {/* 柔和光晕 */}
        <div className="absolute top-[-30%] left-[-20%] w-[70%] h-[70%] bg-purple-600/15 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[60%] bg-pink-600/10 rounded-full blur-[130px]" />
        <div className="absolute top-[30%] right-[10%] w-[40%] h-[40%] bg-cyan-500/8 rounded-full blur-[120px]" />
        
        {/* 星点效果 */}
        <div className="absolute inset-0">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: `${1 + Math.random() * 1.5}px`,
                height: `${1 + Math.random() * 1.5}px`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                backgroundColor: `rgba(255, 255, 255, ${0.1 + Math.random() * 0.3})`,
                animation: `twinkle ${3 + Math.random() * 4}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 5}s`
              }}
            />
          ))}
        </div>
      </div>

      {/* 左侧品牌展示区 */}
      <div className="hidden lg:flex flex-1 flex-col justify-center px-12 xl:px-20 relative z-10">
        {/* Logo */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-purple-500/30">
              <span className="text-white text-2xl font-bold">W</span>
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white tracking-tight">Waule</h1>
              <p className="text-purple-300 text-sm">waule.com</p>
            </div>
          </div>
        </div>

        {/* 主标语 */}
        <div className="mb-12 space-y-6">
          <h2 className="text-7xl xl:text-8xl font-bold text-white">哇噢！</h2>
          <h3 className="text-3xl xl:text-4xl font-bold">
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
              不可思议的 AI 创作平台
            </span>
          </h3>
          <p className="text-gray-400 text-lg leading-relaxed">
            释放你的想象力，用 AI 的力量创造令人惊叹的视频和图像。AI 创作，从未如此简单便捷。
          </p>
        </div>

        {/* 功能特性展示 */}
        <div className="space-y-4">
          {features.map((feature, index) => (
            <div
              key={index}
              className={`flex items-center gap-4 p-4 rounded-2xl transition-all duration-500 ${
                activeFeature === index
                  ? 'bg-white/10 border border-white/20 scale-105'
                  : 'opacity-50 hover:opacity-70'
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-500 ${
                activeFeature === index
                  ? 'bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/30'
                  : 'bg-white/5'
              }`}>
                <span className="material-symbols-outlined text-white text-xl">
                  {feature.icon}
                </span>
              </div>
              <div>
                <h3 className="text-white font-semibold">{feature.title}</h3>
                <p className="text-gray-400 text-sm">{feature.desc}</p>
              </div>
              {activeFeature === index && (
                <div className="ml-auto">
                  <div className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 animate-pulse" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 支持的AI模型 */}
        <div className="mt-12">
          <p className="text-gray-500 text-sm mb-3">支持的 AI 模型</p>
          <div className="flex flex-wrap gap-2">
            {['Sora', 'Vidu', 'Midjourney', 'MiniMax', 'Gemini', 'Nano Banana', '豆包', '万相'].map(name => (
              <span key={name} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-gray-400 text-sm">{name}</span>
            ))}
          </div>
        </div>
      </div>

      {/* 右侧登录区 */}
      <div className="w-full lg:w-[480px] xl:w-[520px] flex items-center justify-center p-6 lg:p-12 relative z-10">
        <div className="w-full max-w-[400px]">
          {/* 登录卡片 */}
          <div className="bg-white/[0.03] backdrop-blur-2xl rounded-3xl border border-white/10 p-10 shadow-2xl">
            {/* 移动端 Logo */}
            <div className="lg:hidden text-center mb-8">
              <div className="inline-flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-400 flex items-center justify-center">
                  <span className="text-white text-lg font-bold">W</span>
                </div>
                <span className="text-2xl font-bold text-white">Waule</span>
              </div>
              <p className="text-gray-400 text-sm">哇噢，不可思议的AI创作平台</p>
            </div>

            {/* 标题 */}
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-white mb-2">开始创作</h2>
              <p className="text-gray-400">手机验证码快捷登录</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 手机号输入 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  手机号码
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-500 text-xl">
                    phone_iphone
                  </span>
                  <input
                    type="tel"
                    required
                    maxLength={11}
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all"
                    placeholder="请输入手机号码"
                  />
                </div>
              </div>

              {/* 验证码输入 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  验证码
                </label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-500 text-xl">
                      pin
                    </span>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all"
                      placeholder="6位验证码"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={sendingCode || countdown > 0}
                    className="shrink-0 px-5 py-3.5 bg-white/10 hover:bg-white/15 border border-white/10 text-white font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
                  >
                    {countdown > 0 ? `${countdown}s` : sendingCode ? '...' : '获取验证码'}
                  </button>
                </div>
              </div>

              {/* 登录按钮 */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 bg-size-200 bg-pos-0 hover:bg-pos-100 text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-500 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
                      登录中...
                    </span>
                  ) : '登录 / 注册'}
                </button>
              </div>
            </form>

            {/* 提示信息 */}
            <p className="mt-8 text-center text-sm text-gray-500">
              未注册手机号验证后将自动创建账号
            </p>
          </div>

          {/* 底部说明 */}
          <p className="text-center text-xs text-gray-600 mt-6">
            登录即表示您同意我们的
            <button onClick={() => navigate('/terms')} className="text-gray-400 hover:text-white"> 服务条款 </button>
            和
            <button onClick={() => navigate('/privacy')} className="text-gray-400 hover:text-white"> 隐私政策</button>
          </p>
        </div>
      </div>

      {/* 页面底部备案信息 - 固定在底部居中 */}
      <div className="absolute bottom-4 left-0 right-0 z-10">
        <div className="text-center text-xs text-gray-600 space-y-1">
          <p>© 2025 Waule.com - AI创作平台</p>
          <a 
            href="https://beian.miit.gov.cn/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1 text-gray-500 hover:text-gray-400 transition-colors"
          >
            <img src="/beian.png" alt="备案图标" className="w-4 h-4" />
            <span>蜀ICP备2025174040号</span>
          </a>
        </div>
      </div>

      {/* 动画样式 */}
      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.1; }
          50% { opacity: 0.6; }
        }
        
        .bg-size-200 {
          background-size: 200% 100%;
        }
        .bg-pos-0 {
          background-position: 0% 0%;
        }
        .bg-pos-100 {
          background-position: 100% 0%;
        }
      `}</style>
    </div>
  );
};

export default PhoneLoginPage;
