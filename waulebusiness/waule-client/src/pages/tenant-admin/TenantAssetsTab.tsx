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
  isDeleted?: boolean;
  source?: 'library' | 'workflow' | 'asset' | 'task';
  libraryName?: string;
  projectName?: string;
  deletedAt?: string;
  deletedFrom?: 'library' | 'project';
  originalName?: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type ViewMode = 'all' | 'recycle';
type AssetType = 'all' | 'image' | 'video' | 'audio';

const assetTypeLabels: Record<string, { label: string; icon: string; color: string }> = {
  image: { label: '图片', icon: 'image', color: 'text-blue-500 bg-blue-500/10' },
  video: { label: '视频', icon: 'movie', color: 'text-neutral-800 bg-neutral-800/10' },
  audio: { label: '音频', icon: 'music_note', color: 'text-neutral-800 bg-neutral-800/10' },
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
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [assetType, setAssetType] = useState<AssetType>('all');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 获取当前配置的本地服务器地址
  const { config: storageConfig } = useTenantStorageStore();

  // 转换资产URL：处理本地存储路径，使用当前配置的服务器地址
  const getAssetUrl = useCallback((url: string | undefined): string => {
    if (!url) return '';
    
    // 检查是否是租户本地服务器 URL（包含 /files/ 路径）
    const localServerPattern = /^https?:\/\/[\d.]+:\d+\/files\/(.+)$/;
    const match = url.match(localServerPattern);
    
    if (match && storageConfig.localServerUrl) {
      // 使用当前配置的服务器地址重构 URL
      const relativePath = match[1];
      return `${storageConfig.localServerUrl}/files/${relativePath}`;
    }
    
    return url;
  }, [storageConfig.localServerUrl]);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint =
        viewMode === 'recycle' ? '/tenant-auth/admin/recycle-bin' : '/tenant-auth/admin/assets';
      const res = await apiClient.get(endpoint, {
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
      toast.error(error.response?.data?.message || '获取资产列表失败');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, viewMode, assetType, searchQuery]);

  // 搜索防抖
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
        {/* 第一行：视图切换 + 搜索 */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        {/* 视图切换 */}
        <div className="flex gap-2 bg-gray-100 dark:bg-white/5 rounded-xl p-1">
          <button
            onClick={() => {
              setViewMode('all');
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'all'
                ? 'bg-white dark:bg-white/10 text-neutral-700 dark:text-neutral-600 shadow-sm'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            <span className="material-symbols-outlined text-lg align-middle mr-1">folder</span>
            全部资产
          </button>
          <button
            onClick={() => {
              setViewMode('recycle');
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'recycle'
                ? 'bg-white dark:bg-white/10 text-neutral-700 dark:text-neutral-600 shadow-sm'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            <span className="material-symbols-outlined text-lg align-middle mr-1">delete</span>
            回收站
          </button>
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
              className="w-full sm:w-64 pl-10 pr-4 py-2 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-neutral-800"
            />
          </div>
        </div>

        {/* 第二行：类型筛选 */}
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
                  ? 'bg-neutral-800 text-white'
                  : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/15'
              }`}
            >
              {type === 'all' ? '全部' : assetTypeLabels[type]?.label || type}
            </button>
          ))}
        </div>
      </div>

      {/* 资产列表 */}
      <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-white/10 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-3 border-neutral-800/20 border-t-neutral-800" />
          </div>
        ) : assets.length === 0 ? (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-6xl text-gray-300 dark:text-gray-600 mb-4">
              {viewMode === 'recycle' ? 'delete_forever' : 'perm_media'}
            </span>
            <p className="text-gray-500">
              {viewMode === 'recycle' 
                ? '回收站为空' 
                : searchQuery 
                  ? '未找到匹配的资产' 
                  : '暂无资产'}
            </p>
            <p className="text-sm text-gray-400 mt-2">
              {viewMode === 'recycle' 
                ? '删除的资产库或项目中的资产会显示在这里'
                : searchQuery 
                  ? '尝试使用其他用户名或昵称搜索'
                  : '用户上传或AI生成的资产会显示在这里'}
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
                    className="group cursor-pointer bg-gray-50 dark:bg-white/5 rounded-xl overflow-hidden hover:ring-2 hover:ring-neutral-800/50 transition-all"
                  >
                    {/* 预览 */}
                    <div className="aspect-square relative bg-gray-100 dark:bg-white/10">
                      {asset.type === 'image' && (asset.thumbnailUrl || asset.url) ? (
                        <img
                          src={getAssetUrl(asset.thumbnailUrl || asset.url)}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
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
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none group-hover/video:opacity-0 transition-opacity">
                            <span className="material-symbols-outlined text-4xl text-white drop-shadow-lg">play_circle</span>
                          </div>
                        </div>
                      ) : asset.type === 'audio' ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-neutral-800/20 to-neutral-800/20">
                          <span className="material-symbols-outlined text-4xl text-neutral-800">music_note</span>
                          <span className="text-xs text-gray-500">点击播放</span>
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span
                            className={`material-symbols-outlined text-4xl ${typeInfo.color.split(' ')[0]}`}
                          >
                            {typeInfo.icon}
                          </span>
                        </div>
                      )}
                      {/* 类型标签 */}
                      <span
                        className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo.color}`}
                      >
                        {typeInfo.label}
                      </span>
                      {/* 来源标记 */}
                      {viewMode === 'recycle' ? (
                        <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                          asset.deletedFrom === 'library' 
                            ? 'bg-red-500/10 text-red-500' 
                            : 'bg-amber-500/10 text-amber-500'
                        }`}>
                          {asset.deletedFrom === 'library' 
                            ? `资产库: ${asset.originalName || '已删除'}` 
                            : `项目: ${asset.originalName || '已删除'}`}
                        </span>
                      ) : (
                        <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                          asset.source === 'library' 
                            ? 'bg-green-500/10 text-green-500' 
                            : 'bg-orange-500/10 text-orange-500'
                        }`}>
                          {asset.source === 'library' ? '资产库' : '工作流'}
                        </span>
                      )}
                    </div>
                    {/* 信息 */}
                    <div className="p-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {asset.name}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-gray-400">{asset.username || '-'}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-gray-400">{formatFileSize(asset.size)}</p>
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
                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                            title="下载"
                          >
                            <span className="material-symbols-outlined text-sm text-gray-500 hover:text-neutral-800">download</span>
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
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-white/10">
                <p className="text-sm text-gray-500">
                  第 {pagination.page} / {pagination.totalPages} 页，共 {pagination.total} 个
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                    disabled={pagination.page <= 1}
                    className="px-3 py-1.5 bg-gray-100 dark:bg-white/10 rounded-lg text-sm disabled:opacity-50"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                    disabled={pagination.page >= pagination.totalPages}
                    className="px-3 py-1.5 bg-gray-100 dark:bg-white/10 rounded-lg text-sm disabled:opacity-50"
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
            className="bg-white dark:bg-card-dark rounded-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-100 dark:border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                {selectedAsset.name}
              </h3>
              <button
                onClick={() => setSelectedAsset(null)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-4">
              {/* 预览区域 */}
              <div className="bg-gray-100 dark:bg-white/5 rounded-xl overflow-hidden mb-4">
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
                    onError={(e) => {
                      console.error('视频加载失败:', selectedAsset.url);
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement!.innerHTML = `
                        <div class="p-8 text-center">
                          <p class="text-gray-500 mb-4">视频预览失败</p>
                          <a href="${getAssetUrl(selectedAsset.url)}" target="_blank" rel="noopener noreferrer" 
                             class="inline-flex items-center gap-2 px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700">
                            <span class="material-symbols-outlined text-sm">open_in_new</span>
                            在新窗口打开
                          </a>
                        </div>
                      `;
                    }}
                  />
                ) : selectedAsset.type === 'audio' ? (
                  <div className="p-8 flex flex-col items-center justify-center gap-4">
                    <span className="material-symbols-outlined text-6xl text-neutral-800">music_note</span>
                    <audio 
                      src={getAssetUrl(selectedAsset.url)} 
                      controls 
                      autoPlay
                      className="w-full max-w-md" 
                      onError={(e) => {
                        console.error('音频加载失败:', selectedAsset.url);
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement!.innerHTML += `
                          <p class="text-gray-500 mb-4">音频预览失败</p>
                          <a href="${getAssetUrl(selectedAsset.url)}" target="_blank" rel="noopener noreferrer" 
                             class="inline-flex items-center gap-2 px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700">
                            <span class="material-symbols-outlined text-sm">open_in_new</span>
                            在新窗口打开
                          </a>
                        `;
                      }}
                    />
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-500">无法预览此类型文件</div>
                )}
              </div>
              {/* 详细信息 */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">类型</p>
                  <p className="text-gray-900 dark:text-white">{selectedAsset.type}</p>
                </div>
                <div>
                  <p className="text-gray-500">{viewMode === 'recycle' ? '删除来源' : '来源'}</p>
                  <p className="text-gray-900 dark:text-white">
                    {viewMode === 'recycle' ? (
                      <span className={selectedAsset.deletedFrom === 'library' ? 'text-red-500' : 'text-amber-500'}>
                        {selectedAsset.deletedFrom === 'library' 
                          ? `资产库: ${selectedAsset.originalName || '已删除'}` 
                          : `项目: ${selectedAsset.originalName || '已删除'}`}
                      </span>
                    ) : selectedAsset.source === 'library' ? (
                      <span className="text-green-500">资产库{selectedAsset.libraryName ? ` (${selectedAsset.libraryName})` : ''}</span>
                    ) : (
                      <span className="text-orange-500">工作流{selectedAsset.projectName ? ` (${selectedAsset.projectName})` : ''}</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">大小</p>
                  <p className="text-gray-900 dark:text-white">
                    {formatFileSize(selectedAsset.size)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">上传用户</p>
                  <p className="text-gray-900 dark:text-white">{selectedAsset.username || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500">创建时间</p>
                  <p className="text-gray-900 dark:text-white">
                    {new Date(selectedAsset.createdAt).toLocaleString('zh-CN')}
                  </p>
                </div>
                {viewMode === 'recycle' && selectedAsset.deletedAt && (
                  <div>
                    <p className="text-gray-500">删除时间</p>
                    <p className="text-red-500">
                      {new Date(selectedAsset.deletedAt).toLocaleString('zh-CN')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantAssetsTab;




