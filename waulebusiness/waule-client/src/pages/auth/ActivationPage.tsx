import { useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '../../lib/api';
import { useTenantStorageStore } from '../../store/tenantStorageStore';

interface ActivationPageProps {
  deviceFingerprint: string;
  onActivated: (tenantId: string, tenantName: string) => void;
}

const ActivationPage = ({ deviceFingerprint, onActivated }: ActivationPageProps) => {
  const [serverUrl, setServerUrl] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'failed'>('idle');

  const { setLocalServerUrl, setConnected } = useTenantStorageStore();

  // 测试服务端连接
  const testConnection = async () => {
    if (!serverUrl) {
      toast.error('请输入服务端地址');
      return false;
    }

    const normalizedUrl = serverUrl.replace(/\/+$/, '');
    setTestingConnection(true);
    setConnectionStatus('idle');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${normalizedUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        setConnectionStatus('success');
        toast.success('连接成功！');
        return true;
      } else {
        setConnectionStatus('failed');
        toast.error('服务端响应异常');
        return false;
      }
    } catch (error) {
      setConnectionStatus('failed');
      toast.error('无法连接到服务端，请检查地址');
      return false;
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!serverUrl) {
      toast.error('请输入服务端地址');
      return;
    }

    if (!activationCode) {
      toast.error('请输入激活码');
      return;
    }

    const normalizedUrl = serverUrl.replace(/\/+$/, '');
    setLoading(true);

    try {
      // 先测试连接
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const healthResponse = await fetch(`${normalizedUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!healthResponse.ok) {
        toast.error('无法连接到服务端');
        setLoading(false);
        return;
      }

      // 保存服务端地址
      setLocalServerUrl(normalizedUrl);
      setConnected(true);

      // 发送激活请求（通过 tenant-server）
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
      toast.error(error.response?.data?.message || '激活失败，请检查网络连接');
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
    <div className="h-full flex relative overflow-hidden bg-[#0a0a0a]">
      {/* 简约背景 */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a] via-[#111111] to-[#0a0a0a]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-white/[0.02] rounded-full blur-[100px]" />
      </div>

      <div className="flex-1 flex items-center justify-center p-4 relative z-10 overflow-auto">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex flex-col items-center mb-10">
            <img
              src="/logo-dark.png"
              alt="Waule AI"
              className="h-16 w-auto mb-4"
            />
            <h1 className="text-2xl font-semibold text-white tracking-tight">Waule AI Enterprise</h1>
          </div>

          {/* 激活卡片 */}
          <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8">
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-white/[0.05] border border-white/[0.08] rounded-xl flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-gray-400 text-2xl">key</span>
              </div>
              <h2 className="text-xl font-semibold text-white mb-1">激活客户端</h2>
              <p className="text-gray-500 text-sm">请输入管理员提供的激活码</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* 服务端地址 */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">企业服务端</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value.trim())}
                    placeholder="http://192.168.1.100:3002"
                    className="flex-1 px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-white/20 focus:bg-white/[0.05] transition-all"
                  />
                  <button
                    type="button"
                    onClick={testConnection}
                    disabled={testingConnection || !serverUrl}
                    className={`px-4 py-3 rounded-xl font-medium transition-all ${
                      connectionStatus === 'success'
                        ? 'bg-white/10 text-green-400 border border-green-500/30'
                        : connectionStatus === 'failed'
                        ? 'bg-white/10 text-red-400 border border-red-500/30'
                        : 'bg-white/[0.05] text-gray-400 border border-white/[0.08] hover:bg-white/[0.08]'
                    } disabled:opacity-50`}
                  >
                    {testingConnection ? '...' : connectionStatus === 'success' ? '✓' : '测试'}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-gray-600">请输入管理员提供的企业服务端地址</p>
              </div>

              {/* 激活码 */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">激活码</label>
                <input
                  type="text"
                  value={activationCode}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  placeholder="WAULE-XXXX-XXXX-XXXX"
                  className="w-full px-4 py-3.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white text-center font-mono tracking-wider placeholder-gray-600 focus:outline-none focus:border-white/20 focus:bg-white/[0.05] transition-all"
                  maxLength={20}
                />
              </div>

              {/* 设备名称 */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  设备名称 <span className="text-gray-600">(可选)</span>
                </label>
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="如：张三的办公电脑"
                  className="w-full px-4 py-3.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-white/20 focus:bg-white/[0.05] transition-all"
                />
              </div>

              {/* 激活按钮 */}
              <button
                type="submit"
                disabled={loading || !activationCode || !serverUrl}
                className="w-full py-3.5 bg-white text-black font-semibold rounded-xl hover:bg-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '激活中...' : '激活'}
              </button>
            </form>

            {/* 帮助信息 */}
            <div className="mt-6 p-4 bg-white/[0.02] border border-white/[0.04] rounded-xl">
              <h4 className="text-sm font-medium text-gray-400 mb-2">如何获取激活码？</h4>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• 请联系您的企业管理员获取激活码</li>
                <li>• 每个激活码只能在一台设备上使用</li>
                <li>• 如需更换设备，请联系管理员解绑</li>
              </ul>
            </div>

            {/* 调试信息 */}
            <div className="mt-4 p-3 bg-white/[0.02] rounded-lg border border-white/[0.04]">
              <p className="text-xs text-gray-600 font-mono break-all">
                设备指纹: {deviceFingerprint || '(空)'}
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
    </div>
  );
};

export default ActivationPage;
