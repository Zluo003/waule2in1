import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { apiClient } from '../../lib/api';
import { useTenantStorageStore } from '../../store/tenantStorageStore';

interface Asset {
  id: string;
  name: string;
  type: string;
  url: string;
  thumbnailUrl?: string;
  size?: number;
  userId: string;
  username?: string;
  createdAt: string;
  source?: string;
  projectName?: string;
  model?: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type AssetType = 'all' | 'image' | 'video' | 'audio';

const assetTypeLabels: Record<string, { label: string; icon: string; color: string }> = {
  image: { label: '图片', icon: 'image', color: 'text-blue-500 bg-blue-500/10' },
  video: { label: '视频', icon: 'movie', color: 'text-purple-500 bg-purple-500/10' },
  audio: { label: '音频', icon: 'music_note', color: 'text-green-500 bg-green-500/10' },
};

const TenantAssetsTab = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [assetType, setAssetType] = useState<AssetType>('all');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { config: storageConfig } = useTenantStorageStore();

  const getAssetUrl = useCallback((url: string | undefined): string => {
    if (!url) return '';
    const localServerPattern = /^https?:\/\/[\d.]+:\d+\/files\/(.+)$/;
    const match = url.match(localServerPattern);
    if (match && storageConfig.localServerUrl) {
      const relativePath = match[1];
      return `${storageConfig.localServerUrl}/files/${relativePath}`;
    }
    return url;
  }, [storageConfig.localServerUrl]);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/tenant-auth/admin/assets', {
        params: {
          page: pagination.page,
          limit: pagination.limit,
          type: assetType !== 'all' ? assetType : undefined,
          search: searchQuery || undefined,
        },
      });
      setAssets(res.data);
      setPagination(res.pagination);
    } catch (error: any) {
      toast.error(error.response?.data?.message || '获取AI生成内容失败');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, assetType, searchQuery]);

  const handleSearchChange = (value: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setSearchQuery(value);
      setPagination(prev => ({ ...prev, page: 1 }));
    }, 300);
  };

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-6">
      {/* 筛选栏 */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          {/* 标题说明 */}
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-purple-500">auto_awesome</span>
            <span className="text-white font-medium">AI 生成内容管理</span>
            <span className="text-xs text-gray-500">（仅展示AI生成的内容，用户删除不影响此列表）</span>
          </div>

          {/* 用户搜索 */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
              search
            </span>
            <input
              type="text"
              placeholder="搜索用户昵称或用户名..."
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full sm:w-64 pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* 类型筛选 */}
        <div className="flex gap-2">
          {(['all', 'image', 'video', 'audio'] as AssetType[]).map((type) => (
            <button
              key={type}
              onClick={() => {
                setAssetType(type);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                assetType === type
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {type === 'all' ? '全部' : assetTypeLabels[type]?.label || type}
            </button>
          ))}
        </div>
      </div>

      {/* 资产列表 */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-3 border-purple-500/20 border-t-purple-500" />
          </div>
        ) : assets.length === 0 ? (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-6xl text-gray-600 mb-4">auto_awesome</span>
            <p className="text-gray-500">
              {searchQuery ? '未找到匹配的AI生成内容' : '暂无AI生成内容'}
            </p>
            <p className="text-sm text-gray-400 mt-2">
              {searchQuery ? '尝试使用其他用户名或昵称搜索' : '用户使用AI生成的图片、视频、音频会显示在这里'}
            </p>
          </div>
        ) : (
          <>
            {/* 网格视图 */}
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {assets.map((asset) => {
                const typeInfo = assetTypeLabels[asset.type] || {
                  label: asset.type,
                  icon: 'description',
                  color: 'text-gray-500 bg-gray-500/10',
                };
                return (
                  <div
                    key={asset.id}
                    onClick={() => setSelectedAsset(asset)}
                    className="group cursor-pointer bg-white/5 rounded-xl overflow-hidden hover:ring-2 hover:ring-purple-500/50 transition-all"
                  >
                    {/* 预览 */}
                    <div className="aspect-square relative bg-white/10">
                      {asset.type === 'image' && (asset.thumbnailUrl || asset.url) ? (
                        <img
                          src={getAssetUrl(asset.thumbnailUrl || asset.url)}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : asset.type === 'video' && asset.url ? (
                        <div className="w-full h-full relative group/video">
                          <video
                            src={getAssetUrl(asset.url)}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                            onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                            onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none group-hover/video:opacity-0 transition-opacity">
                            <span className="material-symbols-outlined text-4xl text-white drop-shadow-lg">play_circle</span>
                          </div>
                        </div>
                      ) : asset.type === 'audio' ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-green-500/10 to-green-500/5">
                          <span className="material-symbols-outlined text-4xl text-green-500">music_note</span>
                          <span className="text-xs text-gray-500">点击播放</span>
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className={`material-symbols-outlined text-4xl ${typeInfo.color.split(' ')[0]}`}>
                            {typeInfo.icon}
                          </span>
                        </div>
                      )}
                      {/* 类型标签 */}
                      <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                      {/* 模型标签 */}
                      {asset.model && (
                        <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400">
                          {asset.model}
                        </span>
                      )}
                    </div>
                    {/* 信息 */}
                    <div className="p-3">
                      <p className="text-sm font-medium text-white truncate">{asset.name}</p>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-gray-400">{asset.username || '-'}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-gray-500">{asset.projectName || ''}</p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const url = getAssetUrl(asset.url);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = asset.name || 'download';
                              link.target = '_blank';
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }}
                            className="p-1 rounded hover:bg-white/10 transition-colors"
                            title="下载"
                          >
                            <span className="material-symbols-outlined text-sm text-gray-500 hover:text-white">download</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 分页 */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
                <p className="text-sm text-gray-500">
                  第 {pagination.page} / {pagination.totalPages} 页，共 {pagination.total} 个
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                    disabled={pagination.page <= 1}
                    className="px-3 py-1.5 bg-white/10 text-white rounded-lg text-sm disabled:opacity-50 hover:bg-white/20"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                    disabled={pagination.page >= pagination.totalPages}
                    className="px-3 py-1.5 bg-white/10 text-white rounded-lg text-sm disabled:opacity-50 hover:bg-white/20"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 资产预览模态框 */}
      {selectedAsset && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[10000] no-drag"
          onClick={() => setSelectedAsset(null)}
        >
          <div
            className="bg-[#1a1a2e] rounded-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white truncate">{selectedAsset.name}</h3>
              <button
                onClick={() => setSelectedAsset(null)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-4">
              {/* 预览区域 */}
              <div className="bg-white/5 rounded-xl overflow-hidden mb-4">
                {selectedAsset.type === 'image' ? (
                  <img
                    src={getAssetUrl(selectedAsset.url)}
                    alt={selectedAsset.name}
                    className="w-full max-h-[50vh] object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement!.innerHTML = '<div class="p-8 text-center text-gray-500">图片加载失败</div>';
                    }}
                  />
                ) : selectedAsset.type === 'video' ? (
                  <video
                    src={getAssetUrl(selectedAsset.url)}
                    controls
                    autoPlay
                    playsInline
                    className="w-full max-h-[50vh] bg-black"
                  />
                ) : selectedAsset.type === 'audio' ? (
                  <div className="p-8 flex flex-col items-center justify-center gap-4">
                    <span className="material-symbols-outlined text-6xl text-green-500">music_note</span>
                    <audio src={getAssetUrl(selectedAsset.url)} controls autoPlay className="w-full max-w-md" />
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-500">无法预览此类型文件</div>
                )}
              </div>
              {/* 详细信息 */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">类型</p>
                  <p className="text-white">{assetTypeLabels[selectedAsset.type]?.label || selectedAsset.type}</p>
                </div>
                <div>
                  <p className="text-gray-500">AI模型</p>
                  <p className="text-purple-400">{selectedAsset.model || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500">项目</p>
                  <p className="text-white">{selectedAsset.projectName || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500">生成用户</p>
                  <p className="text-white">{selectedAsset.username || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500">生成时间</p>
                  <p className="text-white">{new Date(selectedAsset.createdAt).toLocaleString('zh-CN')}</p>
                </div>
                <div>
                  <p className="text-gray-500">大小</p>
                  <p className="text-white">{formatFileSize(selectedAsset.size)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantAssetsTab;




