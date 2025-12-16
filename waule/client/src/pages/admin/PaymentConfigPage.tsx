import { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api';
import { toast } from 'sonner';

interface PaymentConfig {
  id: string;
  provider: 'ALIPAY' | 'WECHAT' | 'MANUAL';
  name: string;
  appId: string;
  privateKey: string;
  publicKey: string;
  config: any;
  isActive: boolean;
  isSandbox: boolean;
  createdAt: string;
  updatedAt: string;
}

const providerLabels: Record<string, string> = {
  ALIPAY: '支付宝',
  WECHAT: '微信支付',
  MANUAL: '人工充值',
};

const providerIcons: Record<string, string> = {
  ALIPAY: 'account_balance_wallet',
  WECHAT: 'chat',
  MANUAL: 'person',
};

const PaymentConfigPage = () => {
  const [configs, setConfigs] = useState<PaymentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingConfig, setEditingConfig] = useState<Partial<PaymentConfig> | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null); // 正在测试的配置ID

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const response = await apiClient.payment.admin.getConfigs();
      setConfigs(response.data || []);
    } catch (error: any) {
      toast.error(error.response?.data?.message || '加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (config: PaymentConfig) => {
    try {
      // 获取完整配置（包含密钥）
      const response = await apiClient.payment.admin.getConfig(config.id);
      setEditingConfig(response.data);
    } catch (error: any) {
      toast.error('获取配置详情失败');
    }
  };

  const handleTest = async (config: PaymentConfig) => {
    if (config.provider === 'MANUAL') {
      toast.info('人工充值无需测试连通性');
      return;
    }
    
    try {
      setTesting(config.id);
      const response = await apiClient.payment.admin.testConfig(config.id);
      if (response.success) {
        toast.success(response.message || '连接测试成功');
      } else {
        toast.error(response.message || '连接测试失败');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || '测试失败');
    } finally {
      setTesting(null);
    }
  };

  const handleCreate = (provider: string) => {
    setEditingConfig({
      provider: provider as any,
      name: providerLabels[provider] || provider,
      appId: '',
      privateKey: '',
      publicKey: '',
      config: {},
      isActive: true,
      isSandbox: false,
    });
  };

  const handleSave = async () => {
    if (!editingConfig) return;

    if (!editingConfig.appId) {
      toast.error('请填写 AppID');
      return;
    }

    try {
      setSaving(true);
      await apiClient.payment.admin.saveConfig({
        provider: editingConfig.provider!,
        name: editingConfig.name!,
        appId: editingConfig.appId!,
        privateKey: editingConfig.privateKey,
        publicKey: editingConfig.publicKey,
        config: editingConfig.config,
        isActive: editingConfig.isActive,
        isSandbox: editingConfig.isSandbox,
      });
      toast.success('保存成功');
      setEditingConfig(null);
      loadConfigs();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此配置吗？')) return;

    try {
      await apiClient.payment.admin.deleteConfig(id);
      toast.success('删除成功');
      loadConfigs();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '删除失败');
    }
  };

  // 检查哪些渠道还没有配置
  const configuredProviders = configs.map((c) => c.provider);
  const availableProviders = ['ALIPAY', 'WECHAT'].filter(
    (p) => !configuredProviders.includes(p as any)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          支付配置
        </h1>
        <p className="text-slate-600 dark:text-gray-400">
          配置支付宝、微信支付等支付渠道
        </p>
      </div>

      {/* 已配置的渠道 */}
      <div className="space-y-4 mb-8">
        {configs.map((config) => (
          <div
            key={config.id}
            className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    config.provider === 'ALIPAY'
                      ? 'bg-blue-100 dark:bg-blue-900/30'
                      : 'bg-green-100 dark:bg-green-900/30'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-2xl ${
                      config.provider === 'ALIPAY'
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-green-600 dark:text-green-400'
                    }`}
                  >
                    {providerIcons[config.provider]}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    {config.name}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-gray-400">
                    AppID: {config.appId}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {config.isSandbox && (
                  <span className="px-2 py-1 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">
                    沙箱
                  </span>
                )}
                <span
                  className={`px-2 py-1 text-xs rounded ${
                    config.isActive
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                >
                  {config.isActive ? '已启用' : '已禁用'}
                </span>
                {config.provider !== 'MANUAL' && (
                  <button
                    onClick={() => handleTest(config)}
                    disabled={testing === config.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {testing === config.id ? (
                      <>
                        <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                        测试中...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-base">network_check</span>
                        测试连通
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={() => handleEdit(config)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined text-slate-500">edit</span>
                </button>
                <button
                  onClick={() => handleDelete(config.id)}
                  className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined text-red-500">delete</span>
                </button>
              </div>
            </div>
          </div>
        ))}

        {configs.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            暂无支付配置，请添加
          </div>
        )}
      </div>

      {/* 添加新渠道 */}
      {availableProviders.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            添加支付渠道
          </h2>
          <div className="flex gap-4">
            {availableProviders.map((provider) => (
              <button
                key={provider}
                onClick={() => handleCreate(provider)}
                className="flex items-center gap-3 px-4 py-3 border-2 border-dashed border-slate-300 dark:border-border-dark rounded-xl hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
              >
                <span className="material-symbols-outlined text-slate-400">
                  {providerIcons[provider]}
                </span>
                <span className="text-slate-600 dark:text-gray-400">
                  {providerLabels[provider]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 编辑弹窗 */}
      {editingConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-card-dark rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <div className="p-6 border-b border-slate-200 dark:border-border-dark">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {editingConfig.id ? '编辑' : '添加'}{providerLabels[editingConfig.provider!]}配置
              </h2>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                  配置名称
                </label>
                <input
                  type="text"
                  value={editingConfig.name || ''}
                  onChange={(e) =>
                    setEditingConfig({ ...editingConfig, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                  AppID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editingConfig.appId || ''}
                  onChange={(e) =>
                    setEditingConfig({ ...editingConfig, appId: e.target.value })
                  }
                  placeholder="应用ID"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                  应用私钥
                </label>
                <textarea
                  value={editingConfig.privateKey || ''}
                  onChange={(e) =>
                    setEditingConfig({ ...editingConfig, privateKey: e.target.value })
                  }
                  placeholder="RSA私钥内容"
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  可以是 PKCS#1 或 PKCS#8 格式，不需要包含 BEGIN/END 行
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                  {editingConfig.provider === 'ALIPAY' ? '支付宝公钥' : '平台公钥'}
                </label>
                <textarea
                  value={editingConfig.publicKey || ''}
                  onChange={(e) =>
                    setEditingConfig({ ...editingConfig, publicKey: e.target.value })
                  }
                  placeholder="平台公钥内容"
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-sm"
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingConfig.isActive ?? true}
                    onChange={(e) =>
                      setEditingConfig({ ...editingConfig, isActive: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700 dark:text-gray-300">启用</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingConfig.isSandbox ?? false}
                    onChange={(e) =>
                      setEditingConfig({ ...editingConfig, isSandbox: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700 dark:text-gray-300">沙箱环境</span>
                </label>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 dark:border-border-dark flex justify-end gap-3">
              <button
                onClick={() => setEditingConfig(null)}
                className="px-4 py-2 text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentConfigPage;
