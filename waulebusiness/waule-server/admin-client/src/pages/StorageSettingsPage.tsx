import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Cloud, HardDrive, Link, Info } from 'lucide-react';
import { apiClient } from '../lib/api';

type StorageMode = 'oss' | 'local' | 'original';
type ColorType = 'blue' | 'green' | 'purple';

export default function StorageSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [mode, setMode] = useState<StorageMode>('original');
  const [originalMode, setOriginalMode] = useState<StorageMode>('original');
  const [localBaseUrl, setLocalBaseUrl] = useState('');
  const [originalLocalBaseUrl, setOriginalLocalBaseUrl] = useState('');

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setFetching(true);
    try {
      const res = await apiClient.get('/admin/settings/storage');
      const { mode: fetchedMode, localBaseUrl: fetchedUrl } = res.data;
      setMode(fetchedMode);
      setOriginalMode(fetchedMode);
      setLocalBaseUrl(fetchedUrl || '');
      setOriginalLocalBaseUrl(fetchedUrl || '');
    } catch (error: any) {
      toast.error(error.response?.data?.message || '获取配置失败');
    } finally {
      setFetching(false);
    }
  };

  const handleSave = async () => {
    if (mode === 'local' && !localBaseUrl.trim()) {
      toast.error('请输入本地存储的基础 URL');
      return;
    }

    setLoading(true);
    try {
      await apiClient.put('/admin/settings/storage', {
        mode,
        localBaseUrl: localBaseUrl.trim(),
      });
      setOriginalMode(mode);
      setOriginalLocalBaseUrl(localBaseUrl.trim());
      toast.success('存储配置已更新');
    } catch (error: any) {
      toast.error(error.response?.data?.message || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="w-10 h-10 border-3 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
      </div>
    );
  }

  const hasChanges = mode !== originalMode || localBaseUrl !== originalLocalBaseUrl;

  const modeOptions: { id: StorageMode; icon: typeof Cloud; title: string; description: string; color: ColorType }[] = [
    {
      id: 'oss',
      icon: Cloud,
      title: '上传到 OSS',
      description: '将上游返回的文件上传到阿里云 OSS，然后返回新的 OSS 链接给下游。适合需要长期存储和 CDN 加速的场景。',
      color: 'blue',
    },
    {
      id: 'local',
      icon: HardDrive,
      title: '保存到本地服务器',
      description: '将上游返回的文件下载保存到本地服务器，然后返回本地服务器的链接给下游。适合内网部署或需要完全控制文件的场景。',
      color: 'green',
    },
    {
      id: 'original',
      icon: Link,
      title: '直接转发 URL',
      description: '直接将上游返回的原始 URL 转发给下游，不做任何存储处理。节约带宽和存储成本，但链接可能有时效性。',
      color: 'purple',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">存储设置</h1>
        <p className="text-gray-400 mt-1">配置上游返回链接的处理方式</p>
      </div>

      {/* 存储模式选择 */}
      <div className="bg-card-dark rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">存储模式</h2>
        <div className="space-y-3">
          {modeOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = mode === option.id;
            const colorClasses = {
              blue: 'text-blue-400 bg-blue-500/20',
              green: 'text-green-400 bg-green-500/20',
              purple: 'text-purple-400 bg-purple-500/20',
            };

            return (
              <label
                key={option.id}
                className={`flex items-start p-4 border-2 rounded-xl cursor-pointer transition-all ${
                  isSelected
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="storage-mode"
                  value={option.id}
                  checked={isSelected}
                  onChange={(e) => setMode(e.target.value as StorageMode)}
                  className="mt-1 accent-purple-500"
                />
                <div className="ml-3 flex-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClasses[option.color]}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="font-medium text-white">{option.title}</span>
                  </div>
                  <p className="text-sm text-gray-400 mt-2">{option.description}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* 本地存储配置 */}
      {mode === 'local' && (
        <div className="bg-card-dark rounded-xl border border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">本地存储配置</h2>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              本地服务器基础 URL
            </label>
            <input
              type="text"
              value={localBaseUrl}
              onChange={(e) => setLocalBaseUrl(e.target.value)}
              placeholder="例如: https://api.example.com"
              className="w-full px-4 py-3 bg-background-dark border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            <p className="text-xs text-gray-500 mt-2">
              文件将存储在服务器的 public/images 目录，通过此 URL 访问
            </p>
          </div>
        </div>
      )}

      {/* 提示信息 */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-300">
            <p className="font-medium mb-2">注意事项：</p>
            <ul className="space-y-1 list-disc list-inside text-amber-400">
              <li>切换存储模式后，新生成的内容将使用新的存储方式</li>
              <li>已有内容的链接不受影响，仍可正常访问</li>
              <li>OSS 模式需要服务端配置好阿里云 OSS 凭证</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={loading || !hasChanges}
          className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        >
          {loading ? '保存中...' : '保存配置'}
        </button>
        <button
          onClick={() => {
            setMode(originalMode);
            setLocalBaseUrl(originalLocalBaseUrl);
          }}
          disabled={loading || !hasChanges}
          className="px-6 py-2.5 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          重置
        </button>
      </div>
    </div>
  );
}
