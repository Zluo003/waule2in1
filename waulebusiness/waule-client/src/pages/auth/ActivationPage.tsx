import { useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '../../lib/api';

interface ActivationPageProps {
  deviceFingerprint: string;
  onActivated: (tenantId: string, tenantName: string) => void;
}

const ActivationPage = ({ deviceFingerprint, onActivated }: ActivationPageProps) => {
  const [activationCode, setActivationCode] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!activationCode) {
      toast.error('请输入激活码');
      return;
    }

    setLoading(true);

    try {
      const response = await apiClient.post('/client/activate', {
        activationCode: activationCode.toUpperCase().trim(),
        deviceFingerprint,
        deviceName: deviceName || `设备-${Date.now().toString(36).toUpperCase()}`,
      });

      if (response.success) {
        toast.success('激活成功！');
        onActivated(response.data.tenantId, response.data.tenantName);
      } else {
        toast.error(response.message || '激活失败');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || '激活失败');
    } finally {
      setLoading(false);
    }
  };

  // 格式化激活码输入（自动添加分隔符）
  const handleCodeChange = (value: string) => {
    // 移除非字母数字字符，转大写
    let clean = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    
    // 如果以 WAULE 开头，按格式添加分隔符
    if (clean.startsWith('WAULE')) {
      const parts = [];
      parts.push('WAULE');
      clean = clean.slice(5);
      while (clean.length > 0) {
        parts.push(clean.slice(0, 4));
        clean = clean.slice(4);
      }
      setActivationCode(parts.join('-'));
    } else {
      setActivationCode(value.toUpperCase());
    }
  };

  return (
    <div className="h-full flex relative overflow-hidden bg-[#030014]">
      {/* 渐变背景 */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0c0118] via-[#0a0a1a] to-[#030014]" />
        <div className="absolute top-[-30%] left-[-20%] w-[70%] h-[70%] bg-purple-600/15 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-30%] right-[-20%] w-[60%] h-[60%] bg-indigo-600/10 rounded-full blur-[150px]" />
      </div>

      <div className="flex-1 flex items-center justify-center p-4 relative z-10 overflow-auto">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/25">
              <span className="material-symbols-outlined text-white text-3xl">auto_awesome</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Waule</h1>
              <p className="text-sm text-gray-400">企业版 · Enterprise</p>
            </div>
          </div>

          {/* 激活卡片 */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                <span className="material-symbols-outlined text-purple-400 text-2xl">key</span>
              </div>
              <h2 className="text-xl font-bold text-white mb-1">激活客户端</h2>
              <p className="text-gray-400">请输入管理员提供的激活码</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 激活码 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">激活码</label>
                <input
                  type="text"
                  value={activationCode}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  placeholder="WAULE-XXXX-XXXX-XXXX"
                  className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white text-center font-mono tracking-wider placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  maxLength={20}
                />
              </div>

              {/* 设备名称 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  设备名称 <span className="text-gray-500">(可选)</span>
                </label>
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="如：张三的办公电脑"
                  className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all"
                />
              </div>

              {/* 激活按钮 */}
              <button
                type="submit"
                disabled={loading || !activationCode}
                className="w-full py-3.5 bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '激活中...' : '激活'}
              </button>
            </form>

            {/* 帮助信息 */}
            <div className="mt-4 p-3 bg-white/5 rounded-lg">
              <h4 className="text-sm font-medium text-gray-300 mb-2">如何获取激活码？</h4>
              <ul className="text-xs text-gray-500 space-y-1">
                <li>• 请联系您的企业管理员获取激活码</li>
                <li>• 每个激活码只能在一台设备上使用</li>
                <li>• 如需更换设备，请联系管理员解绑</li>
              </ul>
            </div>

            {/* 调试信息 */}
            <div className="mt-3 p-2 bg-gray-900/50 rounded-lg border border-gray-700">
              <p className="text-xs text-gray-500 font-mono break-all">
                设备指纹: {deviceFingerprint || '(空)'}
              </p>
            </div>
          </div>

          {/* 底部版权 */}
          <div className="mt-4 text-center">
            <p className="text-xs text-gray-600">
              © 2024 Waule Enterprise. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActivationPage;

