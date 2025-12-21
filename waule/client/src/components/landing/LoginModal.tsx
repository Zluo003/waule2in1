import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LoginModal = ({ isOpen, onClose }: LoginModalProps) => {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [formData, setFormData] = useState({
    phone: '',
    code: '',
    referralCode: '',
  });

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
      const response = await apiClient.auth.loginWithPhone({
        phone: formData.phone,
        code: formData.code,
        referralCode: formData.referralCode || undefined,
      });
      setAuth(response.user, response.token);
      toast.success('登录成功！');
      onClose();
      navigate('/quick');
    } catch (error: any) {
      toast.error(error.response?.data?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  // ESC 关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          {/* 背景遮罩 */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
          
          {/* 弹窗内容 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[420px] bg-[#0a0a0a]/95 backdrop-blur-2xl rounded-3xl border border-white/10 p-8 shadow-2xl"
          >
            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>

            {/* Logo */}
            <div className="text-center mb-8">
              <img src="/logo-dark.png" alt="Waule" className="h-12 mx-auto mb-4" />
              <p className="text-gray-400 text-sm">手机验证码快捷登录</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* 手机号输入 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
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
                    className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neutral-500/50 focus:border-neutral-500/50 transition-all"
                    placeholder="请输入手机号码"
                  />
                </div>
              </div>

              {/* 验证码输入 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
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
                      className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neutral-500/50 focus:border-neutral-500/50 transition-all"
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

              {/* 推荐码输入（可选） */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  推荐码 <span className="text-gray-500 font-normal">(选填)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-500 text-xl">
                    card_giftcard
                  </span>
                  <input
                    type="text"
                    maxLength={20}
                    value={formData.referralCode}
                    onChange={(e) => setFormData({ ...formData, referralCode: e.target.value.toUpperCase() })}
                    className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neutral-500/50 focus:border-neutral-500/50 transition-all"
                    placeholder="有推荐码？填写可获得额外积分"
                  />
                </div>
              </div>

              {/* 登录按钮 */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30"
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
            <p className="mt-6 text-center text-sm text-gray-500">
              未注册手机号验证后将自动创建账号
            </p>

            {/* 协议 */}
            <p className="text-center text-xs text-gray-600 mt-4">
              登录即表示您同意我们的
              <a href="/terms" target="_blank" className="text-gray-400 hover:text-white"> 服务条款 </a>
              和
              <a href="/privacy" target="_blank" className="text-gray-400 hover:text-white"> 隐私政策</a>
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LoginModal;
