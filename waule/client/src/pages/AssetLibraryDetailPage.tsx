import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { apiClient } from '../lib/api';

// 自定义下拉菜单组件
interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

const CustomSelect: React.FC<CustomSelectProps> = ({ value, onChange, options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // 检测dark mode
    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    checkDarkMode();
    
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="absolute right-0 top-0 bottom-0 px-4 bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 rounded-r-full text-xs cursor-pointer flex items-center gap-1 min-w-[100px] justify-center"
        style={{ outline: 'none !important', boxShadow: 'none !important', border: 'none', color: isDark ? 'white' : 'black' } as any}
      >
        <span className="whitespace-nowrap" style={{ color: isDark ? 'white' : 'black' }}>{selectedOption?.label}</span>
        <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: '"FILL" 0, "wght" 200', color: isDark ? 'white' : 'black' }}>
          {isOpen ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-32 rounded-lg shadow-lg border border-slate-200 dark:border-white/10 py-1 z-50" style={{ backgroundColor: isDark ? '#0f0f10' : '#f3f5f5' }}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-xs transition-colors ${
                value === option.value
                  ? 'bg-slate-200 dark:bg-white/10 text-slate-900 dark:text-white font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const API_URL = import.meta.env.VITE_API_URL || '';

interface Asset {
  id: string;
  name: string;
  originalName: string;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
  mimeType: string;
  size: number;
  url: string;
  thumbnail?: string;
  createdAt: string;
}

interface AssetLibrary {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  category?: 'ROLE' | 'SCENE' | 'PROP' | 'AUDIO' | 'OTHER';
  _count: {
    assets: number;
  };
  // 分享相关
  isOwner?: boolean;
  isShared?: boolean;
  shareInfo?: {
    canDownload: boolean;
    sharedAt: string;
    owner?: { id: string; nickname: string | null; avatar: string | null };
  };
}

const AssetLibraryDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [library, setLibrary] = useState<AssetLibrary | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'IMAGE' | 'VIDEO' | 'AUDIO'>('ALL');
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [roleForm, setRoleForm] = useState({
    name: '',
    faceAssetId: '',
    frontAssetId: '',
    sideAssetId: '',
    backAssetId: '',
    voiceAssetId: '',
    documentAssetId: '',
  });
  const [roleMainFile, setRoleMainFile] = useState<File | null>(null);
  const [roleOpt1File, setRoleOpt1File] = useState<File | null>(null);
  const [roleOpt2File, setRoleOpt2File] = useState<File | null>(null);
  // 移除配音和文档
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [editName, setEditName] = useState('');
  const [rolePreviewImages, setRolePreviewImages] = useState<Asset[]>([]);
  const [rolePreviewLoading, setRolePreviewLoading] = useState(false);
  const [showEditRole, setShowEditRole] = useState<any | null>(null);
  const [editRoleImages, setEditRoleImages] = useState<Asset[]>([]);
  // const [editRoleLoading, setEditRoleLoading] = useState(false);
  const [editRoleForm, setEditRoleForm] = useState({ name: '' });
  const [editMainFile, setEditMainFile] = useState<File | null>(null);
  const [editOpt1File, setEditOpt1File] = useState<File | null>(null);
  const [editOpt2File, setEditOpt2File] = useState<File | null>(null);
  const [editIds, setEditIds] = useState<{ front?: string | null; side?: string | null; back?: string | null }>({});
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 根据资产库类别获取文件接受类型
  const getAcceptTypes = () => {
    switch (library?.category) {
      case 'AUDIO':
        return 'audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/x-m4a,.mp3,.wav,.ogg,.m4a';
      case 'SCENE':
      case 'PROP':
        return 'image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp';
      case 'OTHER':
      default:
        return 'image/*,video/*,audio/*,.pdf,.txt,.doc,.docx';
    }
  };

  // 根据资产库类别和文件类型获取最大文件大小(MB)
  const getMaxFileSize = (file: File) => {
    const isVideo = file.type.startsWith('video/');
    const isDocument = file.type.includes('pdf') || file.type.includes('text') || file.type.includes('document') || file.name.endsWith('.doc') || file.name.endsWith('.docx') || file.name.endsWith('.txt');
    
    if (library?.category === 'OTHER') {
      if (isVideo) return 20; // 视频20MB
      if (isDocument) return 10; // 文档10MB
    }
    return 10; // 默认10MB
  };

  // 验证文件
  const validateFile = (file: File): string | null => {
    const maxSizeMB = getMaxFileSize(file);
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    
    if (file.size > maxSizeBytes) {
      return `文件大小超过限制（最大${maxSizeMB}MB）`;
    }

    const category = library?.category;
    const fileType = file.type;
    const fileName = file.name.toLowerCase();
    
    if (category === 'AUDIO') {
      if (!fileType.startsWith('audio/') && !fileName.match(/\.(mp3|wav|ogg|m4a)$/)) {
        return '音频库只支持上传音频文件（MP3、WAV、OGG、M4A）';
      }
    } else if (category === 'SCENE' || category === 'PROP') {
      if (!fileType.startsWith('image/') && !fileName.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
        return `${category === 'SCENE' ? '场景库' : '道具库'}只支持上传图片文件（JPG、PNG、GIF、WEBP）`;
      }
    }
    // OTHER类别允许所有类型
    
    return null;
  };

  // 处理文件上传
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !id) return;
    
    setIsUploading(true);
    let successCount = 0;
    let failCount = 0;
    
    try {
      for (const file of Array.from(files)) {
        const error = validateFile(file);
        if (error) {
          toast.error(`${file.name}: ${error}`);
          failCount++;
          continue;
        }
        
        try {
          await apiClient.assetLibraries.uploadAsset(id, file);
          successCount++;
        } catch (err: any) {
          toast.error(`上传失败: ${file.name}`);
          failCount++;
        }
      }
      
      if (successCount > 0) {
        toast.success(`成功上传 ${successCount} 个文件`);
        loadAssets();
      }
      if (failCount > 0 && successCount === 0) {
        toast.error(`上传失败 ${failCount} 个文件`);
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  useEffect(() => {
    if (id) {
      loadLibrary();
    }
  }, [id]);

  useEffect(() => {
    if (library && id) {
      loadAssets();
    }
  }, [library?.id, library?.category]);

  // 监听资产库更新事件（当从工作流添加资产时刷新）
  useEffect(() => {
    const handleAssetLibraryUpdated = (event: CustomEvent<{ libraryId: string }>) => {
      if (event.detail?.libraryId === id) {
        console.log('[AssetLibraryDetailPage] 资产库更新事件，刷新列表');
        loadAssets();
        loadLibrary(); // 也刷新资产库信息（更新资产计数）
      }
    };
    
    window.addEventListener('asset-library-updated', handleAssetLibraryUpdated as any);
    return () => window.removeEventListener('asset-library-updated', handleAssetLibraryUpdated as any);
  }, [id, library?.category]);

  // 键盘ESC关闭预览
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewAsset) {
        setPreviewAsset(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewAsset]);

  const resolveAssetUrl = (u: string) => {
    if (!u) return '';
    const abs = /^https?:\/\//.test(u) ? u : `${API_URL}${u}`;
    return abs.replace('.oss-oss-', '.oss-');
  };

  useEffect(() => {
    const loadRolePreviewImages = async () => {
      try {
        setRolePreviewLoading(true);
        setRolePreviewImages([]);
        const m: any = (previewAsset as any)?.metadata;
        if (!m || m.kind !== 'ROLE') { setRolePreviewLoading(false); return; }
        const ids = [m.images?.faceAssetId, m.images?.frontAssetId, m.images?.sideAssetId, m.images?.backAssetId]
          .filter(Boolean) as string[];
        if (ids.length === 0) { setRolePreviewLoading(false); return; }
        const results = await Promise.all(ids.map((aid) => apiClient.assets.getById(aid).catch(() => null)));
        const assets = results
          .map((r: any) => r?.data)
          .filter(Boolean) as Asset[];
        setRolePreviewImages(assets);
      } finally {
        setRolePreviewLoading(false);
      }
    };

    if (previewAsset && library?.category === 'ROLE') {
      loadRolePreviewImages();
    } else {
      setRolePreviewImages([]);
      setRolePreviewLoading(false);
    }
  }, [previewAsset, library?.category]);

  useEffect(() => {
    const loadEditRoleImages = async () => {
      try {
        // setEditRoleLoading(true);
        setEditRoleImages([]);
        if (!showEditRole) { return; }
        const m: any = showEditRole.metadata;
        const ids = [m?.images?.frontAssetId, m?.images?.sideAssetId, m?.images?.backAssetId].filter(Boolean) as string[];
        setEditIds({ front: m?.images?.frontAssetId || null, side: m?.images?.sideAssetId || null, back: m?.images?.backAssetId || null });
        const results = await Promise.all(ids.map((aid) => apiClient.assets.getById(aid).catch(() => null)));
        const assets = results.map((r: any) => r?.data).filter(Boolean) as Asset[];
        setEditRoleImages(assets);
      } finally {
      }
    };
    if (showEditRole) {
      setEditRoleForm({ name: showEditRole.name || '' });
      setEditMainFile(null);
      setEditOpt1File(null);
      setEditOpt2File(null);
      loadEditRoleImages();
    }
  }, [showEditRole]);

  const loadLibrary = async () => {
    try {
      const response = await apiClient.assetLibraries.getById(id!);
      setLibrary(response.data);
    } catch (error: any) {
      toast.error('加载资产库失败');
      navigate('/assets');
    }
  };

  const loadAssets = async () => {
    try {
      setLoading(true);
      if (library?.category === 'ROLE') {
        const res = await apiClient.assetLibraries.roles.list(id!);
        setRoles(res.data || []);
        setAssets([]);
      } else {
        const response = await apiClient.assetLibraries.getAssets(id!);
        setAssets(response.data);
        setRoles([]);
      }
    } catch (error: any) {
      toast.error('加载资产列表失败');
      setAssets([]);
      setRoles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (assetId: string) => {
    if (!confirm('确定要删除这个资产吗？')) {
      return;
    }

    try {
      await apiClient.assets.delete(assetId);
      try {
        const evt = new CustomEvent('asset-library-updated', { detail: { libraryId: id } });
        window.dispatchEvent(evt);
      } catch { }
      toast.success('资产删除成功');
      loadLibrary();
      loadAssets();
    } catch (error: any) {
      toast.error('删除失败');
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm('确定要删除这个角色吗？')) {
      return;
    }

    try {
      await apiClient.assetLibraries.roles.delete(id!, roleId);
      try {
        const evt = new CustomEvent('asset-library-updated', { detail: { libraryId: id } });
        window.dispatchEvent(evt);
      } catch { }
      toast.success('角色删除成功');
      loadAssets();
    } catch (error: any) {
      toast.error('删除失败');
    }
  };

  const handleEditAsset = (asset: Asset) => {
    setEditingAsset(asset);
    setEditName(asset.name);
  };

  const handleUpdateAsset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingAsset) return;

    if (!editName.trim()) {
      toast.error('请输入资产名称');
      return;
    }

    try {
      await apiClient.assets.update(editingAsset.id, { name: editName.trim() });
      toast.success('资产更新成功！');
      setEditingAsset(null);
      setEditName('');
      loadAssets();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '更新失败');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  // 下载资产
  const handleDownloadAsset = async (asset: Asset) => {
    try {
      // 获取文件扩展名
      const getFileExtension = (filename: string) => {
        const match = filename.match(/\.[^.]+$/);
        return match ? match[0] : '';
      };
      
      // 使用资产名称，如果没有扩展名则从原始文件名或URL获取
      let downloadName = asset.name;
      if (!downloadName.includes('.')) {
        const ext = getFileExtension(asset.originalName || asset.url);
        downloadName = downloadName + ext;
      }
      
      toast.info('正在准备下载...');
      
      // 通过后端API下载，这样可以设置正确的文件名并避免CORS问题
      const response = await apiClient.get(`/assets/download/${asset.id}`, {
        responseType: 'blob',
        params: { filename: downloadName }
      });
      
      // axios返回的response直接是Blob对象
      const blob = response instanceof Blob ? response : response?.data;
      
      if (!blob || !(blob instanceof Blob)) {
        toast.error('下载失败：无效的响应数据');
        return;
      }
      
      if (blob.size === 0 || blob.size < 100) {
        toast.error(`下载失败：文件大小异常`);
        return;
      }
      
      const blobUrl = window.URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // 释放 blob URL
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 100);

      toast.success(`已下载：${downloadName}`);
    } catch (error) {
      console.error('下载资产失败:', error);
      toast.error('下载失败，请稍后重试');
    }
  };

  const getAssetIcon = (type: string): string => {
    switch (type) {
      case 'IMAGE': return 'image';
      case 'VIDEO': return 'video_file';
      case 'AUDIO': return 'audio_file';
      default: return 'description';
    }
  };

  // 视频悬浮播放处理
  const handleCardHover = (cardElement: HTMLDivElement, isHovering: boolean) => {
    const videoElement = cardElement.querySelector('video') as HTMLVideoElement | null;
    if (!videoElement) return;
    
    if (isHovering) {
      videoElement.currentTime = 0;
      videoElement.play().catch(() => {
        // 播放失败时静默处理
      });
    } else {
      videoElement.pause();
      videoElement.currentTime = 0;
    }
  };

  // 过滤资产
  const filteredAssets = assets.filter((asset) => {
    // 类型过滤
    if (filterType !== 'ALL' && asset.type !== filterType) {
      return false;
    }
    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return asset.name.toLowerCase().includes(query);
    }
    return true;
  });

  // 统计各类型数量
  // 保留计数用于未来扩展（当前不使用筛选按钮）

  if (!library) {
    return (
      <div className="p-8 text-center">
        <div className="text-text-light-secondary dark:text-text-dark-secondary">加载中...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* 顶部区域 - 返回+标题、搜索（含筛选）、按钮 */}
      <div className="flex items-center justify-between gap-8 mb-12">
        {/* 返回按钮 + 标题 */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/assets')}
            className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-all"
          >
            <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>arrow_back</span>
          </button>
          <h1 className="text-xl font-bold text-text-light-primary dark:text-text-dark-primary whitespace-nowrap">
            {library.name}
          </h1>
        </div>

        {/* 搜索栏 - 胶囊状，内部包含筛选下拉框 */}
        <div className="flex-1 flex justify-center">
          <div className="relative w-full max-w-md flex items-center">
            <span className="material-symbols-outlined absolute left-4 text-text-light-tertiary dark:text-text-dark-tertiary">
              search
            </span>
            <input
              type="text"
              placeholder="搜索资产..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 pr-28 py-2.5 w-full bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-full text-text-light-primary dark:text-text-dark-primary placeholder:text-text-light-tertiary dark:placeholder:text-text-dark-tertiary outline-none transition-all"
              style={{ outline: 'none', boxShadow: 'none' }}
            />
            {/* 自定义下拉菜单 - 在搜索栏内部右侧 */}
            <CustomSelect
              value={filterType}
              onChange={(value) => setFilterType(value as any)}
              options={[
                { value: 'ALL', label: '全部' },
                { value: 'IMAGE', label: '图片' },
                { value: 'VIDEO', label: '视频' },
                { value: 'AUDIO', label: '音频' },
              ]}
            />
          </div>
        </div>

        {/* 创建角色按钮 - 仅角色库所有者可见 */}
        {(library.isOwner !== false) && library.category === 'ROLE' && (
          <button
            onClick={() => {
              setRoleForm({ name: '', faceAssetId: '', frontAssetId: '', sideAssetId: '', backAssetId: '', voiceAssetId: '', documentAssetId: '' });
              setRoleMainFile(null);
              setRoleOpt1File(null);
              setRoleOpt2File(null);
              setShowCreateRole(true);
            }}
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 hover:shadow-lg text-white font-medium rounded-lg transition-all flex items-center gap-2 active:scale-95 whitespace-nowrap"
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>person_add</span>
            创建角色
          </button>
        )}
        {/* 上传按钮 - 非角色库所有者可见 */}
        {(library.isOwner !== false) && library.category !== 'ROLE' && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={getAcceptTypes()}
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
            <div className="group relative">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-white/10 text-black dark:text-white border border-slate-400 dark:border-white/30 hover:bg-gradient-to-r hover:from-purple-500 hover:to-pink-500 hover:text-white hover:border-transparent hover:scale-105 transition-all flex items-center justify-center disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: '"FILL" 0, "wght" 500' }}>
                  {isUploading ? 'progress_activity' : 'upload'}
                </span>
              </button>
              <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 text-xs text-white bg-slate-800 dark:bg-slate-700 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                {isUploading ? '上传中...' : '上传素材'}
              </span>
            </div>
          </>
        )}
        {/* 协作者标识 */}
        {library.isShared && (
          <div className="px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-500 text-lg">group</span>
            <span className="text-sm text-blue-600 dark:text-blue-400">
              来自 {library.shareInfo?.owner?.nickname || '未知用户'} 的共享
            </span>
          </div>
        )}
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="text-center py-12 text-text-light-secondary dark:text-text-dark-secondary">
          加载中...
        </div>
      ) : library.category === 'ROLE' ? (
        roles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="h-24 w-24 rounded-full bg-purple-500/10 flex items-center justify-center mb-6 shadow-purple-400/30">
              <span className="material-symbols-outlined text-purple-400 text-5xl">person</span>
            </div>
            <h2 className="text-2xl font-bold text-text-light-primary dark:text-text-dark-primary mb-2">还没有角色</h2>
            <p className="text-text-light-secondary dark:text-text-dark-secondary mb-6">创建你的第一个角色</p>
            <button
              onClick={() => {
                setRoleForm({ name: '', faceAssetId: '', frontAssetId: '', sideAssetId: '', backAssetId: '', voiceAssetId: '', documentAssetId: '' });
                setRoleMainFile(null);
                setRoleOpt1File(null);
                setRoleOpt2File(null);
                setShowCreateRole(true);
              }}
              className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 hover:shadow-lg text-white font-medium rounded-lg transition-all active:scale-95"
            >
              创建角色
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {roles.map((role: any) => {
              const cover = role.thumbnail || '';
              return (
                <div
                  key={role.id}
                  onClick={() => setPreviewAsset(role)}
                  className="bg-white/80 dark:bg-black/60 backdrop-blur-xl border-2 border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden hover:border-purple-400 dark:hover:border-purple-400/50 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group cursor-pointer relative"
                >
                  <div className="aspect-[4/3] bg-slate-100 dark:bg-white/5 relative overflow-hidden">
                    {cover ? (
                      <img src={resolveAssetUrl(cover)} alt={role.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-4xl text-tiffany-300 dark:text-white/30">person</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/0 to-black/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="absolute top-2 left-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewAsset(role);
                        }}
                        className="w-7 h-7 flex items-center justify-center bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 hover:shadow-lg text-white rounded-full transition-all shadow-md active:scale-95"
                        title="预览"
                      >
                        <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>visibility</span>
                      </button>
                      {(library?.isOwner !== false) && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowEditRole(role);
                            }}
                            className="w-7 h-7 flex items-center justify-center bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 hover:shadow-lg text-white rounded-full transition-all shadow-md active:scale-95"
                            title="编辑"
                          >
                            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>edit</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRole(role.id);
                            }}
                            className="w-7 h-7 flex items-center justify-center bg-red-500 hover:bg-red-600 hover:shadow-lg text-white rounded-full transition-all shadow-md active:scale-95"
                            title="删除"
                          >
                            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>delete</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="p-2">
                    <h3 className="text-xs font-bold text-text-light-primary dark:text-text-dark-primary truncate">{role.name}</h3>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredAssets.map((asset) => (
            <div
              key={asset.id}
              onClick={() => setPreviewAsset(asset)}
              onMouseEnter={(e) => handleCardHover(e.currentTarget, true)}
              onMouseLeave={(e) => handleCardHover(e.currentTarget, false)}
              className="bg-white/80 dark:bg-black/60 backdrop-blur-xl border-2 border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden hover:border-purple-400 dark:hover:border-purple-400/50 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group cursor-pointer"
            >
              {/* 预览 */}
              <div className="aspect-[4/3] bg-slate-100 dark:bg-white/5 relative overflow-hidden">
                {asset.type === 'IMAGE' ? (
                  <img
                    src={resolveAssetUrl(asset.url)}
                    alt={asset.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    onError={(e) => {
                      console.error('Image load error:', asset.url);
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : asset.type === 'VIDEO' ? (
                  <video
                    src={resolveAssetUrl(asset.url)}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    preload="metadata"
                    muted
                    loop
                    onError={() => {
                      console.error('Video load error:', asset.url);
                    }}
                  />
                ) : asset.type === 'AUDIO' ? (
                  <div className="w-full h-full flex flex-col items-center justify-center p-4">
                    <span className="material-symbols-outlined text-4xl text-tiffany-300 dark:text-white/30 mb-3">
                      audio_file
                    </span>
                    <audio
                      src={resolveAssetUrl(asset.url)}
                      controls
                      className="w-full max-w-[90%]"
                      onError={() => {
                        console.error('Audio load error:', asset.url);
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-4xl text-tiffany-300 dark:text-white/30">
                      {getAssetIcon(asset.type)}
                    </span>
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="absolute top-2 left-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* 编辑按钮 - 仅所有者可见 */}
                  {(library?.isOwner !== false) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditAsset(asset);
                      }}
                      className="w-7 h-7 flex items-center justify-center bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 hover:shadow-lg text-white rounded-full transition-all shadow-md active:scale-95"
                      title="编辑"
                    >
                      <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>edit</span>
                    </button>
                  )}
                  {/* 下载按钮 - 所有者或有下载权限的协作者可见 */}
                  {(library?.isOwner !== false || library?.shareInfo?.canDownload) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadAsset(asset);
                      }}
                      className="w-7 h-7 flex items-center justify-center bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 hover:shadow-lg text-white rounded-full transition-all shadow-md active:scale-95"
                      title="下载"
                    >
                      <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>download</span>
                    </button>
                  )}
                  {/* 删除按钮 - 仅所有者可见 */}
                  {(library?.isOwner !== false) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(asset.id);
                      }}
                      className="w-7 h-7 flex items-center justify-center bg-red-500 hover:bg-red-600 hover:shadow-lg text-white rounded-full transition-all shadow-md active:scale-95"
                      title="删除"
                    >
                      <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>delete</span>
                    </button>
                  )}
                </div>

                {/* 文件大小 */}
                <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm text-white text-xs rounded">
                  {formatFileSize(asset.size)}
                </div>
              </div>

              {/* 资产信息 */}
              <div className="p-2">
                <h3 className="text-xs font-bold text-text-light-primary dark:text-text-dark-primary truncate">
                  {asset.name}
                </h3>

              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateRole && library?.category === 'ROLE' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white/80 dark:bg-black/60 backdrop-blur-xl border-2 border-slate-200 dark:border-white/10 rounded-2xl px-6 py-5 w-full max-w-xl md:max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">创建角色</h3>
              <button onClick={() => setShowCreateRole(false)} className="p-2 nodrag hover:bg-slate-200 dark:hover:bg-white/10 rounded">
                <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">close</span>
              </button>
            </div>
            <div className="mb-2">
              <div className="text-sm text-slate-600 dark:text-slate-300">① 上传图片 → ② 填写名称</div>
              <div className="mt-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 py-2 rounded">请上传1-3张角色图片（支持 JPG/PNG），图片比例建议为3:4竖向</div>
            </div>
            <div className="grid grid-cols-[1fr,1px,200px] grid-rows-[auto,auto] gap-6 items-start mb-4">
              <div className="row-span-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center overflow-hidden relative" style={{ height: '424px' }}>
                {roleMainFile ? (
                  <div className="relative w-full h-full">
                    <img src={URL.createObjectURL(roleMainFile)} className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setRoleMainFile(null)} className="absolute top-2 right-2 p-2 bg-black/40 text-white rounded hover:bg-black/60">
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>
                ) : (
                  <label className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-500 text-4xl cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => setRoleMainFile(e.target.files?.[0] || null)} />
                    +
                  </label>
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/0 to-black/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
              </div>
              <div className="w-px h-full bg-slate-200 dark:bg-white/10" />
              <div className="flex flex-col gap-6">
                <div className="rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center overflow-hidden" style={{ height: '200px' }}>
                  {roleOpt1File ? (
                    <div className="relative w-full h-full">
                      <img src={URL.createObjectURL(roleOpt1File)} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setRoleOpt1File(null)} className="absolute top-2 right-2 p-1.5 bg-black/40 text-white rounded hover:bg-black/60">
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  ) : (
                    <label className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-500 text-2xl cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => setRoleOpt1File(e.target.files?.[0] || null)} />
                      +
                      <span className="block text-xs mt-1">(可选)</span>
                    </label>
                  )}
                </div>
                <div className="rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center overflow-hidden" style={{ height: '200px' }}>
                  {roleOpt2File ? (
                    <div className="relative w-full h-full">
                      <img src={URL.createObjectURL(roleOpt2File)} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setRoleOpt2File(null)} className="absolute top-2 right-2 p-1.5 bg-black/40 text-white rounded hover:bg-black/60">
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  ) : (
                    <label className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-500 text-2xl cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => setRoleOpt2File(e.target.files?.[0] || null)} />
                      +
                      <span className="block text-xs mt-1">(可选)</span>
                    </label>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="text-sm text-slate-600 dark:text-slate-300">角色名称</label>
                <input value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark text-text-light-primary dark:text-text-dark-primary" maxLength={30} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowCreateRole(false)} className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-white border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 transition-all">取消</button>
              <button
                onClick={async () => {
                  try {
                    if (!roleForm.name.trim()) { toast.error('请输入角色名称'); return; }
                    if (!roleMainFile && !roleOpt1File && !roleOpt2File) { toast.error('请至少上传一张图片'); return; }
                    const uploads: any = {};
                    const uploadOne = async (file: File | null, name: string) => {
                      if (!file) return null;
                      const res = await apiClient.assetLibraries.uploadAsset(id!, file, name);
                      return res.data.id;
                    };
                    uploads.frontAssetId = await uploadOne(roleMainFile, `${roleForm.name}-主图`);
                    uploads.sideAssetId = await uploadOne(roleOpt1File, `${roleForm.name}-参考1`);
                    uploads.backAssetId = await uploadOne(roleOpt2File, `${roleForm.name}-参考2`);
                    // 移除配音与文档上传
                    const payload: any = { name: roleForm.name.trim() };
                    Object.entries(uploads).forEach(([k, v]) => { if (v) payload[k] = v as string; });
                    await apiClient.assetLibraries.roles.create(id!, payload);
                    toast.success('角色创建成功');
                    setShowCreateRole(false);
                    loadAssets();
                  } catch (err: any) {
                    toast.error(err.response?.data?.message || '创建角色失败');
                  }
                }}
                className="px-6 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 hover:shadow-lg text-white transition-all active:scale-95"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}


      {/* 预览：角色使用弹框显示组图，其它资产保持原逻辑 */}
      {previewAsset && library.category === 'ROLE' && (previewAsset as any).metadata?.kind === 'ROLE' ? (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6"
          onClick={() => setPreviewAsset(null)}
        >
          <div className="bg-white/80 dark:bg-black/60 backdrop-blur-xl border-2 border-slate-200 dark:border-white/10 rounded-2xl p-6 w-full max-w-3xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">{(previewAsset as any).name}</h3>
              <button onClick={() => setPreviewAsset(null)} className="p-2 nodrag hover:bg-slate-200 dark:hover:bg-white/10 rounded">
                <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">close</span>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {rolePreviewLoading && (
                <div className="col-span-3 text-center text-slate-600 dark:text-slate-400">加载中...</div>
              )}
              {!rolePreviewLoading && rolePreviewImages.length === 0 && (
                <div className="col-span-3 text-center text-slate-600 dark:text-slate-400">无可预览图片</div>
              )}
              {rolePreviewImages.map((img, idx) => (
                <div key={idx} className="aspect-square bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden flex items-center justify-center">
                  <img src={resolveAssetUrl(img.url)} alt={img.name} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : previewAsset && (
        <div
          className="fixed inset-0 bg-white/70 dark:bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewAsset(null)}
        >
          <div
            className="relative max-w-[95vw] h-[65vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <button
              onClick={() => setPreviewAsset(null)}
              className="absolute -top-14 right-0 w-12 h-12 flex items-center justify-center bg-slate-200/80 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-800 dark:text-white rounded-full transition-colors z-10"
              title="关闭 (ESC)"
            >
              <span className="material-symbols-outlined text-2xl">close</span>
            </button>

            {/* 资产名称和大小 */}
            <div className="absolute -top-14 left-0 text-slate-800 dark:text-white flex items-center gap-3">
              <h3 className="font-bold text-xl">{previewAsset.name}</h3>
              <span className="text-sm text-slate-600 dark:text-white/60">{formatFileSize(previewAsset.size)}</span>
            </div>

            {/* 资产内容 - 无边框 */}
            {previewAsset.type === 'IMAGE' ? (
              <img
                src={resolveAssetUrl(previewAsset.url)}
                alt={previewAsset.name}
                className="max-w-full h-full object-contain"
                onError={() => {
                  console.error('Image preview error:', previewAsset.url);
                }}
              />
            ) : previewAsset.type === 'VIDEO' ? (
              <video
                src={resolveAssetUrl(previewAsset.url)}
                controls
                autoPlay
                className="max-w-full h-full object-contain"
                onError={() => {
                  console.error('Video preview error:', previewAsset.url);
                }}
              />
            ) : previewAsset.type === 'AUDIO' ? (
              <div className="bg-gradient-to-br from-tiffany-500/20 to-coral-500/20 backdrop-blur-md rounded-2xl p-16 flex flex-col items-center justify-center min-w-[500px]">
                <span className="material-symbols-outlined text-9xl text-white mb-8">
                  audio_file
                </span>
                <h3 className="text-2xl font-bold text-white mb-6 text-center max-w-md">
                  {previewAsset.name}
                </h3>
                <audio
                  src={resolveAssetUrl(previewAsset.url)}
                  controls
                  autoPlay
                  className="w-full max-w-lg"
                  onError={() => {
                    console.error('Audio preview error:', previewAsset.url);
                  }}
                />
              </div>
            ) : (
              <div className="bg-white/5 backdrop-blur-md rounded-2xl p-16 flex flex-col items-center justify-center min-w-[400px]">
                <span className="material-symbols-outlined text-9xl text-white/50 mb-6">
                  description
                </span>
                <p className="text-white/70 text-lg">
                  无法预览此文件类型
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {showEditRole && library?.category === 'ROLE' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white/80 dark:bg-black/60 backdrop-blur-xl border-2 border-slate-200 dark:border-white/10 rounded-2xl px-6 py-5 w-full max-w-xl md:max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">编辑角色</h3>
              <button onClick={() => setShowEditRole(null)} className="p-2 nodrag hover:bg-slate-200 dark:hover:bg-white/10 rounded">
                <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">close</span>
              </button>
            </div>
            <div className="grid grid-cols-[1fr,1px,200px] grid-rows-[auto,auto] gap-6 items-start mb-4">
              <div className="row-span-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center overflow-hidden relative" style={{ height: '424px' }}>
                {editMainFile ? (
                  <div className="relative w-full h-full">
                    <img src={URL.createObjectURL(editMainFile)} className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setEditMainFile(null)} className="absolute top-2 right-2 p-2 bg-black/40 text-white rounded hover:bg-black/60">
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>
                ) : editIds.front ? (
                  <div className="relative w-full h-full">
                    <img src={resolveAssetUrl(editRoleImages[0]?.url || '')} className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setEditIds({ ...editIds, front: null })} className="absolute top-2 right-2 p-2 bg-black/40 text-white rounded hover:bg-black/60">
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>
                ) : (
                  <label className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-500 text-4xl cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => setEditMainFile(e.target.files?.[0] || null)} />
                    +
                  </label>
                )}
              </div>
              <div className="w-px h-full bg-slate-200 dark:bg-white/10" />
              <div className="flex flex-col gap-6">
                <div className="rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center overflow-hidden relative" style={{ height: '200px' }}>
                  {editOpt1File ? (
                    <div className="relative w-full h-full">
                      <img src={URL.createObjectURL(editOpt1File)} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setEditOpt1File(null)} className="absolute top-2 right-2 p-1.5 bg-black/40 text-white rounded hover:bg-black/60">
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  ) : editIds.side ? (
                    <div className="relative w-full h-full">
                      <img src={resolveAssetUrl(editRoleImages[1]?.url || '')} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setEditIds({ ...editIds, side: null })} className="absolute top-2 right-2 p-1.5 bg-black/40 text-white rounded hover:bg-black/60">
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  ) : (
                    <label className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-500 text-2xl cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => setEditOpt1File(e.target.files?.[0] || null)} />
                      +
                      <span className="block text-xs mt-1">(可选)</span>
                    </label>
                  )}
                </div>
                <div className="rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center overflow-hidden relative" style={{ height: '200px' }}>
                  {editOpt2File ? (
                    <div className="relative w-full h-full">
                      <img src={URL.createObjectURL(editOpt2File)} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setEditOpt2File(null)} className="absolute top-2 right-2 p-1.5 bg-black/40 text-white rounded hover:bg-black/60">
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  ) : editIds.back ? (
                    <div className="relative w-full h-full">
                      <img src={resolveAssetUrl(editRoleImages[2]?.url || '')} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setEditIds({ ...editIds, back: null })} className="absolute top-2 right-2 p-1.5 bg-black/40 text-white rounded hover:bg-black/60">
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  ) : (
                    <label className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-500 text-2xl cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => setEditOpt2File(e.target.files?.[0] || null)} />
                      +
                      <span className="block text-xs mt-1">(可选)</span>
                    </label>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="text-sm text-slate-600 dark:text-slate-300">角色名称</label>
                <input value={editRoleForm.name} onChange={(e) => setEditRoleForm({ ...editRoleForm, name: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark text-text-light-primary dark:text-text-dark-primary" maxLength={30} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowEditRole(null)} className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-white border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 transition-all">取消</button>
              <button
                onClick={async () => {
                  try {
                    if (!editRoleForm.name.trim()) { toast.error('请输入角色名称'); return; }
                    const uploads: any = {};
                    const uploadOne = async (file: File | null, name: string) => {
                      if (!file) return null;
                      const res = await apiClient.assetLibraries.uploadAsset(id!, file, name);
                      return res.data.id;
                    };
                    uploads.frontAssetId = editMainFile ? await uploadOne(editMainFile, `${editRoleForm.name}-主图`) : editIds.front;
                    uploads.sideAssetId = editOpt1File ? await uploadOne(editOpt1File, `${editRoleForm.name}-参考1`) : editIds.side;
                    uploads.backAssetId = editOpt2File ? await uploadOne(editOpt2File, `${editRoleForm.name}-参考2`) : editIds.back;
                    const payload: any = { name: editRoleForm.name.trim() };
                    Object.entries(uploads).forEach(([k, v]) => { payload[k] = v === undefined ? undefined : v; });
                    await apiClient.assetLibraries.roles.update(id!, showEditRole.id, payload);
                    toast.success('角色更新成功');
                    setShowEditRole(null);
                    loadAssets();
                  } catch (err: any) {
                    toast.error(err.response?.data?.message || '更新角色失败');
                  }
                }}
                className="px-6 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 hover:shadow-lg text-white transition-all active:scale-95"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑资产模态框 */}
      {editingAsset && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-2xl p-6 max-w-2xl w-full shadow-soft-lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-text-light-primary dark:text-text-dark-primary">
                编辑资产
              </h2>
              <button
                onClick={() => {
                  setEditingAsset(null);
                  setEditName('');
                }}
                type="button"
                className="p-2 hover:bg-background-light-secondary dark:hover:bg-card-dark-hover rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-text-light-secondary dark:text-text-dark-secondary">close</span>
              </button>
            </div>

            <form onSubmit={handleUpdateAsset} className="space-y-6">
              {/* 资产预览 */}
              <div className="flex items-center gap-4 p-4 bg-background-light dark:bg-background-dark rounded-lg border border-border-light dark:border-border-dark">
                <div className="w-24 h-24 rounded-lg overflow-hidden bg-gradient-to-br from-tiffany-100 to-tiffany-200 dark:from-tiffany-500/20 dark:to-coral-500/20 flex items-center justify-center flex-shrink-0">
                  {editingAsset.type === 'IMAGE' ? (
                    <img
                      src={editingAsset.url.startsWith('http') ? editingAsset.url : `${API_URL}${editingAsset.url}`}
                      alt={editingAsset.name}
                      className="w-full h-full object-cover"
                    />
                  ) : editingAsset.type === 'VIDEO' ? (
                    <video
                      src={editingAsset.url.startsWith('http') ? editingAsset.url : `${API_URL}${editingAsset.url}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="material-symbols-outlined text-3xl text-tiffany-300 dark:text-white/30">
                      {getAssetIcon(editingAsset.type)}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-light-primary dark:text-text-dark-primary mb-1">
                    原始文件名: {editingAsset.originalName}
                  </p>
                  <p className="text-xs text-text-light-secondary dark:text-text-dark-secondary">
                    大小: {formatFileSize(editingAsset.size)} · 类型: {editingAsset.type}
                  </p>
                </div>
              </div>

              {/* 编辑名称 */}
              <div>
                <label className="block text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary mb-2">
                  显示名称 *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-3 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg text-text-light-primary dark:text-text-dark-primary focus:outline-none focus:ring-2 focus:ring-tiffany-500 transition-all"
                  placeholder="输入资产显示名称"
                  maxLength={200}
                />
                <p className="mt-2 text-xs text-text-light-tertiary dark:text-text-dark-tertiary">
                  修改显示名称不会影响文件本身，只会改变资产库中的显示
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingAsset(null);
                    setEditName('');
                  }}
                  className="flex-1 px-4 py-3 bg-background-light-secondary dark:bg-card-dark-hover text-text-light-primary dark:text-text-dark-primary rounded-lg hover:bg-background-light dark:hover:bg-card-dark transition-all border border-border-light dark:border-border-dark font-medium"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-tiffany-600 dark:bg-tiffany-500 text-white rounded-lg hover:bg-tiffany-700 dark:hover:bg-tiffany-600 transition-all shadow-tiffany font-medium"
                >
                  保存更改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetLibraryDetailPage;
