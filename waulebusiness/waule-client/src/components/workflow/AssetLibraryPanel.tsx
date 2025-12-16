import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { apiClient } from '../../lib/api';

const API_URL = import.meta.env.VITE_API_URL || '';

interface AssetLibrary {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  category?: 'ROLE' | 'SCENE' | 'PROP' | 'AUDIO' | 'OTHER';
  _count: {
    assets: number;
  };
  // 共享资产库的额外信息
  isOwner?: boolean;
  isShared?: boolean;
  owner?: { id: string; nickname?: string; avatar?: string };
}

interface Asset {
  id: string;
  name: string;
  originalName: string;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'TEXT';
  mimeType: string;
  size: number;
  url: string;
  thumbnail?: string;
}

interface RoleGroup {
  id: string;
  name: string;
  coverUrl: string;
  images: { id: string; url: string; name: string }[];
}

interface AssetLibraryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onAssetSelect?: (asset: Asset | RoleGroup) => void;
}

const AssetLibraryPanel = ({ isOpen, onClose, onAssetSelect }: AssetLibraryPanelProps) => {
  const [libraries, setLibraries] = useState<AssetLibrary[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>('');
  const [libraryAssets, setLibraryAssets] = useState<Asset[]>([]);
  const [roleGroups, setRoleGroups] = useState<RoleGroup[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'ROLE' | 'SCENE' | 'PROP' | 'AUDIO' | 'OTHER'>('ALL');

  // 加载资产库列表
  useEffect(() => {
    if (isOpen) {
      loadLibraries();
    }
  }, [isOpen]);

  // 当选择的资产库改变时，加载该资产库的资产
  useEffect(() => {
    if (selectedLibraryId) {
      loadLibraryAssets(selectedLibraryId);
    }
  }, [selectedLibraryId]);

  // 类别变化时联动选中库
  useEffect(() => {
    if (!isOpen) return;
    const filtered = selectedCategory === 'ALL'
      ? libraries
      : libraries.filter((l) => (l.category || 'OTHER') === selectedCategory);
    setSelectedLibraryId(filtered.length > 0 ? filtered[0].id : '');
  }, [selectedCategory, libraries, isOpen]);

  const loadLibraries = async () => {
    try {
      // 包含共享给当前用户的资产库，协作者可以在工作流中调用
      const response = await apiClient.assetLibraries.getAll({ includeShared: 'true' });
      const libs: AssetLibrary[] = response.data || [];
      setLibraries(libs);
      
      // 自动选择第一个资产库
      if (libs.length > 0 && !selectedLibraryId) {
        const filtered = selectedCategory === 'ALL' 
          ? libs 
          : libs.filter((l: AssetLibrary) => (l.category || 'OTHER') === selectedCategory);
        setSelectedLibraryId((filtered[0] || libs[0]).id);
      }
    } catch (error) {
      console.error('Failed to load libraries:', error);
      toast.error('加载资产库失败');
    }
  };

  useEffect(() => {
    const handler = (e: any) => {
      const libId = e?.detail?.libraryId || selectedLibraryId;
      loadLibraries();
      if (libId) {
        loadLibraryAssets(libId);
      }
    };
    window.addEventListener('asset-library-updated', handler as any);
    return () => window.removeEventListener('asset-library-updated', handler as any);
  }, [selectedLibraryId]);

  const resolveUrl = (u: string) => {
    const abs = /^https?:\/\//.test(u) ? u : `${API_URL}${u}`;
    return abs.replace('.oss-oss-', '.oss-');
  };

  const loadLibraryAssets = async (libraryId: string) => {
    setLoadingAssets(true);
    try {
      const currentLib = libraries.find((l) => l.id === libraryId);
      const isRoleLib = currentLib && (currentLib.category || 'OTHER') === 'ROLE';
      if (isRoleLib) {
        const res = await apiClient.assetLibraries.roles.list(libraryId);
        const roles = (res.data || []) as any[];
        const groups: RoleGroup[] = [];
        for (const role of roles) {
          const m = role.metadata || {};
          // 直接使用 metadata 中的 URL，而不是通过 assetId 获取
          const imgs: { id: string; url: string; name: string }[] = [];
          if (m.images?.frontUrl) imgs.push({ id: 'front', url: resolveUrl(m.images.frontUrl), name: `${role.name}-正面` });
          if (m.images?.sideUrl) imgs.push({ id: 'side', url: resolveUrl(m.images.sideUrl), name: `${role.name}-侧面` });
          if (m.images?.backUrl) imgs.push({ id: 'back', url: resolveUrl(m.images.backUrl), name: `${role.name}-背面` });
          if (m.images?.faceUrl) imgs.push({ id: 'face', url: resolveUrl(m.images.faceUrl), name: `${role.name}-面部` });
          const coverUrl = role.thumbnail ? resolveUrl(role.thumbnail) : (imgs[0]?.url || '');
          groups.push({ id: role.id, name: role.name, coverUrl, images: imgs });
        }
        setRoleGroups(groups);
        setLibraryAssets([]);
      } else {
        const response = await apiClient.assetLibraries.getAssets(libraryId);
        const assets = response.data || [];
        setLibraryAssets(assets);
        setRoleGroups([]);
      }
    } catch (error) {
      console.error('Failed to load library assets:', error);
      toast.error('加载资产失败');
    } finally {
      setLoadingAssets(false);
    }
  };

  const handleLibraryChange = (libraryId: string) => {
    setSelectedLibraryId(libraryId);
  };

  const handleAssetClick = (asset: Asset) => {
    if (onAssetSelect) {
      onAssetSelect(asset);
      setTimeout(() => {
        loadLibraries();
        if (selectedLibraryId) {
          loadLibraryAssets(selectedLibraryId);
        }
      }, 0);
      // 不需要在这里显示 toast，因为在 WorkflowEditorPage 中已经会显示
    } else {
      toast.info('请在工作流页面中使用此功能');
    }
  };

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const panel = (
    <div className="fixed inset-0 z-[9999]">
      <style>
        {`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}
      </style>
      <div
        className="bg-black/40 backdrop-blur-sm"
        style={{ position: 'fixed', inset: 0 }}
        onClick={onClose}
      />
      
      <div
        className="bg-card-light dark:bg-card-dark shadow-2xl flex flex-col relative overflow-hidden"
        style={{ position: 'fixed', top: 0, right: 0, height: '100vh', width: 500 }}
      >
        {/* Gradient border on left */}
        <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-purple-500/30 via-pink-500/50 to-cyan-500/30"></div>
        {/* 面板头部 */}
        <div className="flex items-center justify-between p-6">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontSize: '20px', fontVariationSettings: '"FILL" 0, "wght" 200, "GRAD" 0, "opsz" 20' }}>photo_library</span>
            <h3 className="text-xl font-bold text-text-light-primary dark:text-text-dark-primary">资产库</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-text-light-secondary dark:text-text-dark-secondary hover:bg-card-light-hover dark:hover:bg-card-dark-hover transition-colors"
          >
            <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>close</span>
          </button>
        </div>

        {/* 面板内容 */}
        <div className="flex-1 flex flex-col overflow-hidden px-4">
          {libraries.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <span className="material-symbols-outlined text-7xl text-gray-400 mb-4">photo_library</span>
              <p className="text-lg text-text-light-secondary dark:text-text-dark-secondary mb-2">暂无资产库</p>
              <p className="text-sm text-text-light-tertiary dark:text-text-dark-tertiary">请先创建资产库</p>
            </div>
          ) : (
            <>
              <div className="space-y-3 shrink-0">
                <div className="grid grid-cols-[72px,1fr] gap-2 items-center">
                  <label className="text-xs font-medium text-text-light-secondary dark:text-text-dark-secondary whitespace-nowrap">资产类型</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {['IMAGE', 'VIDEO', 'AUDIO'].map((type) => (
                      <button
                        key={type}
                        onClick={() => setSelectedType(type)}
                        className={`h-8 w-full px-3 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1 border ${
                          selectedType === type
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600 dark:to-pink-600 text-white border-transparent shadow-md'
                            : 'bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-white border-slate-200 dark:border-white/10 hover:border-purple-400 dark:hover:border-purple-400/50'
                        }`}
                      >
                        {type === 'IMAGE' ? '图片' : type === 'VIDEO' ? '视频' : '音频'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-[72px,1fr] gap-2 items-center">
                  <label className="text-xs font-medium text-text-light-secondary dark:text-text-dark-secondary whitespace-nowrap">库类别</label>
                  <div className="grid grid-cols-5 gap-1">
                    {(['ROLE','SCENE','PROP','AUDIO','OTHER'] as const).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`h-7 rounded-md text-xs font-medium transition-all flex items-center justify-center border ${
                          selectedCategory === cat
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600 dark:to-pink-600 text-white border-transparent shadow-md'
                            : 'bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-white border-slate-200 dark:border-white/10 hover:border-purple-400 dark:hover:border-purple-400/50'
                        }`}
                      >
                        {cat === 'ROLE' ? '角色' : cat === 'SCENE' ? '场景' : cat === 'PROP' ? '道具' : cat === 'AUDIO' ? '音频' : '其他'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-[72px,1fr] gap-2 items-center">
                  <label className="text-xs font-medium text-text-light-secondary dark:text-text-dark-secondary whitespace-nowrap">资产库</label>
                  {(() => {
                    const filteredLibs = selectedCategory === 'ALL' ? libraries : libraries.filter((l) => (l.category || 'OTHER') === selectedCategory);
                    return (
                      <select
                        value={selectedLibraryId}
                        onChange={(e) => handleLibraryChange(e.target.value)}
                        className="flex-1 h-8 px-3 text-xs bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      >
                        {filteredLibs.map((lib) => (
                          <option key={lib.id} value={lib.id}>
                            {lib.isShared ? `[共享] ${lib.name}` : lib.name} ({lib._count.assets}){lib.isShared && lib.owner?.nickname ? ` - ${lib.owner.nickname}` : ''}
                          </option>
                        ))}
                      </select>
                    );
                  })()}
                </div>
              </div>

              {/* 资产列表 - 3列网格布局 */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 pr-4 no-scrollbar">
                {loadingAssets ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="flex flex-col items-center gap-3">
                      <span className="material-symbols-outlined text-5xl text-tiffany-500 animate-spin">progress_activity</span>
                      <p className="text-text-light-secondary dark:text-text-dark-secondary">加载中...</p>
                    </div>
                  </div>
                ) : (() => {
                  const lib = libraries.find((l) => l.id === selectedLibraryId);
                  const isRoleLib = lib && (lib.category || 'OTHER') === 'ROLE';
                  if (isRoleLib) {
                    if (roleGroups.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-20">
                          <span className="material-symbols-outlined text-7xl text-gray-400 mb-4">folder_open</span>
                          <p className="text-lg text-text-light-secondary dark:text-text-dark-secondary">该角色库暂无角色</p>
                        </div>
                      );
                    }
                    return (
                      <div className="flex flex-wrap gap-2 w-full max-w-[468px] mx-auto">
                        {roleGroups.map((rg) => (
                          <div
                            key={rg.id}
                            onClick={() => onAssetSelect && onAssetSelect(rg)}
                            style={{ width: 'calc((100% - 16px) / 3)' }}
                            className="aspect-square min-w-0 bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-tiffany-400 transition-all duration-200 group relative shadow-md"
                          >
                            {rg.coverUrl ? (
                              <img src={rg.coverUrl} alt={rg.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className="material-symbols-outlined text-4xl text-text-light-secondary dark:text-text-dark-secondary">person</span>
                              </div>
                            )}
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <p className="text-xs font-medium text-white truncate">{rg.name}</p>
                              <p className="text-xs text-white/70">{rg.images.length} 张参考图</p>
                            </div>
                            <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-black/70 backdrop-blur-sm rounded">
                              <span className="material-symbols-outlined text-white text-sm">groups</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  const filtered = libraryAssets.filter(asset => selectedType === 'ALL' || asset.type === selectedType);
                  if (filtered.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-20">
                        <span className="material-symbols-outlined text-7xl text-gray-400 mb-4">folder_open</span>
                        <p className="text-lg text-text-light-secondary dark:text-text-dark-secondary">没有匹配的资产</p>
                      </div>
                    );
                  }
                  return (
                    <div className="flex flex-wrap gap-2 w-full max-w-[468px] mx-auto">
                      {filtered.map((asset) => (
                        <div
                          key={asset.id}
                          onClick={() => handleAssetClick(asset)}
                          style={{ width: 'calc((100% - 16px) / 3)' }}
                          className="aspect-square min-w-0 bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-tiffany-400 transition-all duration-200 group relative shadow-md"
                        >
                          {asset.type === 'IMAGE' ? (
                            <img src={resolveUrl(asset.url)} alt={asset.name} className="w-full h-full object-cover" />
                          ) : asset.type === 'VIDEO' ? (
                            <video src={resolveUrl(asset.url)} className="w-full h-full object-cover" />
                          ) : asset.type === 'AUDIO' ? (
                            <div className="w-full h-full flex flex-col items-center justify-center p-3">
                              <span className="material-symbols-outlined text-5xl text-blue-400 mb-2">audio_file</span>
                              <p className="text-xs text-center text-text-light-primary dark:text-text-dark-primary truncate w-full px-1">{asset.name}</p>
                            </div>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-3">
                              <span className="material-symbols-outlined text-5xl text-gray-400 mb-2">description</span>
                              <p className="text-xs text-center text-text-light-primary dark:text-text-dark-primary truncate w-full px-1">{asset.name}</p>
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-xs font-medium text-white truncate">{asset.name}</p>
                            <p className="text-xs text-white/70">{(asset.size / (1024 * 1024)).toFixed(2)} MB</p>
                          </div>
                          <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-black/70 backdrop-blur-sm rounded">
                            <span className="material-symbols-outlined text-white text-sm">
                              {asset.type === 'IMAGE' ? 'image' : asset.type === 'VIDEO' ? 'video_file' : asset.type === 'AUDIO' ? 'audio_file' : 'description'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
};

export default AssetLibraryPanel;
