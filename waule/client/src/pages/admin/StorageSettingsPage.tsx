import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { apiClient } from '../../lib/api';

const StorageSettingsPage = () => {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [mode, setMode] = useState<'oss' | 'local'>('oss');
  const [originalMode, setOriginalMode] = useState<'oss' | 'local'>('oss');
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">存储设置</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          配置文件存储方式：阿里云 OSS 或本地服务器存储
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-6">
        {/* 存储模式选择 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            存储模式
          </label>
          <div className="space-y-3">
            <label className="flex items-start p-4 border-2 rounded-lg cursor-pointer transition-colors hover:border-blue-500 dark:border-gray-700 dark:hover:border-blue-500"
              style={{ borderColor: mode === 'oss' ? '#3b82f6' : undefined }}>
              <input
                type="radio"
                name="storage-mode"
                value="oss"
                checked={mode === 'oss'}
                onChange={(e) => setMode(e.target.value as 'oss')}
                className="mt-1"
              />
              <div className="ml-3 flex-1">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-600">cloud</span>
                  <span className="font-medium text-gray-900 dark:text-white">阿里云 OSS</span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  使用阿里云对象存储服务，支持 CDN 加速，适合生产环境
                </p>
              </div>
            </label>

            <label className="flex items-start p-4 border-2 rounded-lg cursor-pointer transition-colors hover:border-blue-500 dark:border-gray-700 dark:hover:border-blue-500"
              style={{ borderColor: mode === 'local' ? '#3b82f6' : undefined }}>
              <input
                type="radio"
                name="storage-mode"
                value="local"
                checked={mode === 'local'}
                onChange={(e) => setMode(e.target.value as 'local')}
                className="mt-1"
              />
              <div className="ml-3 flex-1">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-green-600">storage</span>
                  <span className="font-medium text-gray-900 dark:text-white">本地服务器存储</span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  文件存储在服务器本地磁盘，适合开发测试环境
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* 本地存储配置 */}
        {mode === 'local' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              本地存储基础 URL
            </label>
            <input
              type="text"
              value={localBaseUrl}
              onChange={(e) => setLocalBaseUrl(e.target.value)}
              placeholder="例如: https://api.waule.ai"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              文件将存储在服务器的 public/images 目录，通过此 URL 访问
            </p>
          </div>
        )}

        {/* 提示信息 */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex gap-3">
            <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">info</span>
            <div className="flex-1 text-sm text-blue-800 dark:text-blue-300">
              <p className="font-medium mb-2">切换说明：</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>新上传的文件将使用选定的存储方式</li>
                <li>已有文件的链接仍然可以正常访问</li>
                <li>系统会自动处理不同存储源的文件</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={handleSave}
            disabled={loading || (mode === originalMode && localBaseUrl === originalLocalBaseUrl)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '保存中...' : '保存配置'}
          </button>
          <button
            onClick={() => {
              setMode(originalMode);
              setLocalBaseUrl(originalLocalBaseUrl);
            }}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            重置
          </button>
        </div>
      </div>
    </div>
  );
};

export default StorageSettingsPage;
