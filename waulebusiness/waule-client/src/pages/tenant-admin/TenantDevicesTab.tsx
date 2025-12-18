import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { apiClient } from '../../lib/api';

// 复制到剪贴板
const copyToClipboard = async (text: string, successMsg: string = '已复制到剪贴板') => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      toast.success(successMsg);
    } else {
      // 回退方案
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast.success(successMsg);
    }
  } catch (err) {
    toast.error('复制失败，请手动复制');
  }
};

interface ClientActivation {
  id: string;
  activationCode: string;
  deviceFingerprint: string | null;
  deviceName: string | null;
  isActivated: boolean;
  activatedAt: string | null;
  createdAt: string;
}

interface ActivationStats {
  total: number;
  activated: number;
  available: number;
  maxClients: number;
}

const TenantDevicesTab = () => {
  const [activations, setActivations] = useState<ClientActivation[]>([]);
  const [stats, setStats] = useState<ActivationStats>({ total: 0, activated: 0, available: 0, maxClients: 5 });
  const [loading, setLoading] = useState(true);

  const fetchActivations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/tenant-auth/admin/activations');
      setActivations(res.data.activations);
      setStats(res.data.stats);
    } catch (error: any) {
      toast.error(error.response?.data?.message || '获取设备列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivations();
  }, [fetchActivations]);

  const handleUnbind = async (activation: ClientActivation) => {
    if (!confirm(`确定要解绑设备「${activation.deviceName || '未知设备'}」吗？`)) return;
    try {
      await apiClient.post(`/tenant-auth/admin/activations/${activation.id}/unbind`);
      toast.success('设备已解绑');
      fetchActivations();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '解绑失败');
    }
  };

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl text-green-500">check_circle</span>
            </div>
            <div>
              <p className="text-sm text-gray-500">已激活设备</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.activated}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gray-500/10 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl text-gray-500">pending</span>
            </div>
            <div>
              <p className="text-sm text-gray-500">未使用激活码</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.available}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-neutral-800/10 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl text-neutral-800">devices</span>
            </div>
            <div>
              <p className="text-sm text-gray-500">客户端配额</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.total} / {stats.maxClients}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 未使用的激活码 */}
      {activations.filter(a => !a.isActivated).length > 0 && (
        <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-white/10 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-white/10">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">未使用的激活码</h3>
            <p className="text-sm text-gray-500 mt-1">将激活码发送给用户，用户在客户端输入即可激活</p>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-white/10">
            {activations.filter(a => !a.isActivated).map((activation) => (
              <div key={activation.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-gray-400/20 to-gray-500/20 rounded-xl flex items-center justify-center">
                    <span className="material-symbols-outlined text-gray-500">key</span>
                  </div>
                  <div>
                    <p className="font-mono text-lg font-medium text-gray-900 dark:text-white">
                      {activation.activationCode}
                    </p>
                    <p className="text-xs text-gray-400">
                      创建时间: {new Date(activation.createdAt).toLocaleString('zh-CN')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => copyToClipboard(activation.activationCode, '激活码已复制')}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-neutral-700 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">content_copy</span>
                  复制
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 设备列表 */}
      <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-white/10 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-white/10">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">已激活设备</h3>
          <p className="text-sm text-gray-500 mt-1">管理已激活的客户端设备，可以解绑设备以释放激活码</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-3 border-neutral-800/20 border-t-neutral-800" />
          </div>
        ) : activations.filter(a => a.isActivated).length === 0 ? (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-6xl text-gray-300 dark:text-gray-600 mb-4">
              devices_off
            </span>
            <p className="text-gray-500">暂无已激活设备</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-white/10">
            {activations.filter(a => a.isActivated).map((activation) => (
              <div key={activation.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-neutral-800/20 to-neutral-800/20 rounded-xl flex items-center justify-center">
                    <span className="material-symbols-outlined text-neutral-800">computer</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {activation.deviceName || '未知设备'}
                    </p>
                    <p className="text-sm text-gray-500">
                      激活码: <code className="font-mono">{activation.activationCode}</code>
                    </p>
                    <p className="text-xs text-gray-400">
                      激活时间: {activation.activatedAt ? new Date(activation.activatedAt).toLocaleString('zh-CN') : '-'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleUnbind(activation)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">link_off</span>
                  解绑
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 提示信息 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <div className="flex gap-3">
          <span className="material-symbols-outlined text-blue-500">info</span>
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium mb-1">关于设备管理</p>
            <ul className="text-blue-600 dark:text-blue-400 space-y-1">
              <li>• 解绑设备后，该设备将无法继续使用，需要重新激活</li>
              <li>• 解绑后，对应的激活码可以分配给其他设备使用</li>
              <li>• 如需增加客户端数量，请联系平台管理员</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TenantDevicesTab;




