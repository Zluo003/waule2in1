import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { apiClient } from '../lib/api';

const API_URL = import.meta.env.VITE_API_URL || '';

// URL 解析辅助函数
const resolveAssetUrl = (u: string) => {
  if (!u) return '';
  const abs = /^https?:\/\//.test(u) ? u : `${API_URL}${u}`;
  return abs.replace('.oss-oss-', '.oss-');
};

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
      {/* 按钮 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="absolute right-0 top-0 bottom-0 px-4 bg-neutral-200 dark:bg-neutral-700 rounded-r-full text-xs cursor-pointer flex items-center gap-1 min-w-[100px] justify-center"
        style={{ outline: 'none !important', boxShadow: 'none !important', border: 'none', color: isDark ? 'white' : 'black' } as any}
      >
        <span className="whitespace-nowrap" style={{ color: isDark ? 'white' : 'black' }}>{selectedOption?.label}</span>
        <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: '"FILL" 0, "wght" 200', color: isDark ? 'white' : 'black' }}>
          {isOpen ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {/* 下拉菜单 */}
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

interface Collaborator {
  id: string;
  userId: string;  // 用户ID，用于删除操作
  nickname: string | null;
  avatar: string | null;
  canDownload?: boolean;
  sharedAt?: string;
}

interface AssetLibrary {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  category?: 'ROLE' | 'SCENE' | 'PROP' | 'AUDIO' | 'OTHER';
  createdAt: string;
  updatedAt: string;
  _count: {
    assets: number;
  };
  // 分享相关
  isOwner?: boolean;
  isShared?: boolean;
  hasCollaborators?: boolean;
  owner?: { id: string; nickname: string | null; avatar: string | null };
  shareInfo?: { canDownload: boolean; sharedAt: string };
}

type LibraryFormData = {
  name: string;
  description: string;
  category?: 'ROLE' | 'SCENE' | 'PROP' | 'AUDIO' | 'OTHER';
};

interface LibraryModalProps {
  isEdit?: boolean;
  libraryId?: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  formData: LibraryFormData;
  setFormData: React.Dispatch<React.SetStateAction<LibraryFormData>>;
  thumbnail: string | null;
  setThumbnail: React.Dispatch<React.SetStateAction<string | null>>;
}

// 资产库模态框组件
const LibraryModal: React.FC<LibraryModalProps> = ({
  isEdit = false,
  libraryId,
  onSubmit,
  onClose,
  formData,
  setFormData,
  thumbnail,
  setThumbnail,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploadingThumbnail, setIsUploadingThumbnail] = React.useState(false);
  const [collaborators, setCollaborators] = React.useState<Collaborator[]>([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = React.useState(false);
  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载协作者列表
  React.useEffect(() => {
    if (isEdit && libraryId) {
      loadCollaborators();
    }
  }, [isEdit, libraryId]);

  const loadCollaborators = async () => {
    if (!libraryId) return;
    try {
      const response = await apiClient.assetLibraries.getCollaborators(libraryId);
      setCollaborators(response.data || []);
    } catch (error) {
      console.error('加载协作者失败:', error);
    }
  };

  // 搜索用户 - 输入@后触发搜索
  const handleSearchUsers = async (query: string) => {
    setSearchQuery(query);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // 检查是否以@开头
    if (!query.startsWith('@')) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }
    
    // 获取@后面的搜索词
    const searchTerm = query.slice(1).trim();
    
    // @后没有内容时，显示最近用户（空搜索）
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await apiClient.assetLibraries.searchUsers(searchTerm || '');
        // 过滤掉已经是协作者的用户，限制5个结果
        const existingIds = new Set(collaborators.map(c => c.id));
        const filtered = (response.data || [])
          .filter((u: any) => !existingIds.has(u.id))
          .slice(0, 5);
        setSearchResults(filtered);
        setShowSearchDropdown(true);
      } catch (error) {
        console.error('搜索用户失败:', error);
      } finally {
        setIsSearching(false);
      }
    }, 200);
  };

  // 添加协作者
  const handleAddCollaborator = async (user: any) => {
    if (!libraryId) return;
    try {
      await apiClient.assetLibraries.addCollaborator(libraryId, user.id, true);
      setCollaborators(prev => [...prev, { id: user.id, userId: user.id, nickname: user.nickname, avatar: user.avatar, canDownload: true }]);
      setSearchQuery('');
      setSearchResults([]);
      setShowSearchDropdown(false);
      toast.success(`已添加协作者: ${user.nickname || user.username}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || '添加协作者失败');
    }
  };

  // 移除协作者
  const handleRemoveCollaborator = async (userId: string) => {
    if (!libraryId) return;
    try {
      await apiClient.assetLibraries.removeCollaborator(libraryId, userId);
      setCollaborators(prev => prev.filter(c => c.userId !== userId));
      toast.success('已移除协作者');
    } catch (error: any) {
      toast.error(error.response?.data?.message || '移除协作者失败');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('图片大小不能超过 10MB');
      return;
    }

    // 直接上传到 OSS
    setIsUploadingThumbnail(true);
    try {
      const result = await apiClient.assets.upload(file);
      if (result.success && result.data?.url) {
        setThumbnail(result.data.url);
        toast.success('封面上传成功');
      } else {
        toast.error('上传失败');
      }
    } catch (error: any) {
      console.error('上传封面失败:', error);
      toast.error(error.message || '上传失败');
    } finally {
      setIsUploadingThumbnail(false);
    }
  };

  const removeThumbnail = () => {
    setThumbnail(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-neutral-100 dark:bg-[#0a0a0a] border border-neutral-300 dark:border-neutral-800 rounded-2xl p-6 ${isEdit ? 'w-[800px]' : 'w-[640px]'} max-w-[95vw] shadow-lg max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
            {isEdit ? '编辑资产库' : '创建资产库'}
          </h2>
          <button
            onClick={onClose}
            type="button"
            className="p-1.5 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>close</span>
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              资产库名称 *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 bg-white dark:bg-[#18181b] border border-neutral-300 dark:border-neutral-700 rounded-md text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:border-neutral-500"
              placeholder="例如: 角色素材库"
              maxLength={100}
            />
          </div>

          {/* 封面图片和协作者并排布局（编辑模式） */}
          <div className={isEdit ? 'grid grid-cols-2 gap-4' : ''}>
            {/* 封面图片 */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                封面图片
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              
              {isUploadingThumbnail ? (
                <div className="w-full aspect-[16/9] border-2 border-dashed border-neutral-400 dark:border-neutral-600 rounded-md flex flex-col items-center justify-center gap-2 bg-white dark:bg-[#18181b]">
                  <span className="material-symbols-outlined text-2xl text-neutral-800 animate-spin">progress_activity</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">正在上传...</span>
                </div>
              ) : thumbnail ? (
                <div className="relative group">
                  <img
                    src={thumbnail}
                    alt="封面预览"
                    className="w-full aspect-[16/9] object-cover rounded-md border-2 border-slate-200 dark:border-white/10"
                  />
                  <button
                    type="button"
                    onClick={removeThumbnail}
                    className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-full transition-all opacity-0 group-hover:opacity-100 shadow-md"
                  >
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>close</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-[16/9] border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-md hover:border-neutral-500 dark:hover:border-neutral-500 transition-colors flex flex-col items-center justify-center gap-2 bg-white dark:bg-[#18181b]"
                >
                  <span className="material-symbols-outlined text-2xl text-slate-400 dark:text-white/50" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>
                    add_photo_alternate
                  </span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    点击上传封面
                  </span>
                </button>
              )}
            </div>

            {/* 协作者管理（仅编辑模式） */}
            {isEdit && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  协作者管理
                </label>
                <div className="aspect-[16/9] border border-neutral-300 dark:border-neutral-700 rounded-md bg-white dark:bg-[#18181b] p-2 flex flex-col">
                  {/* 搜索框 */}
                  <div className="relative mb-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchUsers(e.target.value)}
                      onFocus={() => searchQuery && setShowSearchDropdown(true)}
                      placeholder="@用户昵称 添加协作者"
                      className="w-full px-3 py-1.5 bg-white dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded text-sm text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-neutral-800"
                    />
                    {isSearching && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 material-symbols-outlined text-sm animate-spin text-slate-400">progress_activity</span>
                    )}
                    {/* 搜索结果下拉 */}
                    {showSearchDropdown && searchResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-md shadow-lg max-h-32 overflow-y-auto">
                        {searchResults.map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => handleAddCollaborator(user)}
                            className="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-white/10 text-left"
                          >
                            {user.avatar ? (
                              <img src={user.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                            ) : (
                              <span className="material-symbols-outlined text-slate-400 text-lg">account_circle</span>
                            )}
                            <span className="text-sm text-slate-800 dark:text-white">{user.nickname || user.username}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* 协作者列表 - 每行2个 */}
                  <div className="flex-1 overflow-y-auto">
                    {collaborators.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-slate-400">
                        暂无协作者
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-1">
                        {collaborators.map((collab) => (
                          <div key={collab.id} className="flex items-center justify-between px-1.5 py-1 bg-white dark:bg-black/20 rounded">
                            <div className="flex items-center gap-1 min-w-0 flex-1">
                              {collab.avatar ? (
                                <img src={collab.avatar} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
                              ) : (
                                <span className="material-symbols-outlined text-slate-400 text-sm flex-shrink-0">account_circle</span>
                              )}
                              <span className="text-xs text-slate-700 dark:text-slate-300 truncate">{collab.nickname || '未命名'}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveCollaborator(collab.userId)}
                              className="p-0.5 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded flex-shrink-0"
                            >
                              <span className="material-symbols-outlined text-xs">close</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              描述
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-neutral-800 focus:border-neutral-800 resize-none"
              rows={2}
              placeholder="简要描述资产库用途..."
              maxLength={500}
            />
          </div>

          {/* 分类选择 - 仅创建时可选，编辑时不可更改 */}
          {!isEdit && (
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              分类
            </label>
            <div className="flex gap-1.5">
              {(['ROLE','SCENE','PROP','AUDIO','OTHER'] as const).map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFormData((prev: any) => ({ ...prev, category: cat }))}
                  className={`flex-1 px-1 py-1.5 rounded-md border transition-all text-center ${
                    formData.category === cat
                      ? 'border-neutral-800 dark:border-white bg-neutral-800 dark:bg-white text-white dark:text-black'
                      : 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#18181b] hover:border-neutral-500'
                  }`}
                >
                  <span className={`material-symbols-outlined text-sm ${formData.category === cat ? 'text-white dark:text-black' : 'text-slate-800 dark:text-white'}`} style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>
                    {cat === 'ROLE' ? 'person' : cat === 'SCENE' ? 'landscape' : cat === 'PROP' ? 'inventory_2' : cat === 'AUDIO' ? 'music_note' : 'widgets'}
                  </span>
                  <div className={`text-[10px] font-medium mt-0.5 ${formData.category === cat ? 'text-white dark:text-black' : 'text-slate-800 dark:text-white'}`}>
                    {cat === 'ROLE' ? '角色' : cat === 'SCENE' ? '场景' : cat === 'PROP' ? '道具' : cat === 'AUDIO' ? '音频' : '其他'}
                  </div>
                </button>
              ))}
            </div>
          </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 bg-white dark:bg-[#18181b] text-slate-800 dark:text-white rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-all border border-neutral-300 dark:border-neutral-700"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 px-3 py-2 bg-neutral-800 dark:bg-white hover:shadow-lg text-white dark:text-black rounded-md transition-all font-medium active:scale-95"
            >
              {isEdit ? '保存更改' : '创建资产库'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AssetsPage = () => {
  const navigate = useNavigate();
  const [libraries, setLibraries] = useState<AssetLibrary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingLibrary, setEditingLibrary] = useState<AssetLibrary | null>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'ROLE' | 'SCENE' | 'PROP' | 'AUDIO' | 'OTHER'>('ALL');
  const [formData, setFormData] = useState<any>({
    name: '',
    description: '',
    category: 'OTHER',
  });
  const inFlightRef = useRef(false);
  
  // Sora角色库状态
  const [soraCharacterCount, setSoraCharacterCount] = useState(0);
  const [soraLibraryCover, setSoraLibraryCover] = useState<string | null>(() => {
    try {
      return localStorage.getItem('soraLibraryCover');
    } catch {
      return null;
    }
  });
  const [showSoraEditModal, setShowSoraEditModal] = useState(false);
  const [soraCollaborators, setSoraCollaborators] = useState<Collaborator[]>([]);
  const [soraSearchQuery, setSoraSearchQuery] = useState('');
  const [soraSearchResults, setSoraSearchResults] = useState<any[]>([]);
  const [isSoraSearching, setIsSoraSearching] = useState(false);
  const [showSoraSearchDropdown, setShowSoraSearchDropdown] = useState(false);
  const [soraHasCollaborators, setSoraHasCollaborators] = useState(false);
  const soraSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadLibraries();
    loadSoraCharacterCount();
  }, []);

  useEffect(() => {
    loadLibraries(true);
  }, [categoryFilter]);

  // 加载Sora角色数量和共享信息
  // 注意：租户版暂不支持 Sora 角色功能，跳过加载
  const loadSoraCharacterCount = async () => {
    // 租户版跳过 Sora 角色加载
    setSoraCharacterCount(0);
    setSoraHasCollaborators(false);
  };

  // 加载 Sora 角色库协作者
  const loadSoraCollaborators = async () => {
    try {
      const response = await apiClient.soraCharacters.getCollaborators();
      setSoraCollaborators(response.data || []);
    } catch (error) {
      console.error('加载Sora协作者失败:', error);
    }
  };

  // 搜索用户添加 Sora 协作者
  const handleSoraSearchUsers = async (query: string) => {
    setSoraSearchQuery(query);
    if (soraSearchTimeoutRef.current) {
      clearTimeout(soraSearchTimeoutRef.current);
    }
    
    if (!query.startsWith('@')) {
      setSoraSearchResults([]);
      setShowSoraSearchDropdown(false);
      return;
    }
    
    const searchTerm = query.slice(1).trim();
    
    soraSearchTimeoutRef.current = setTimeout(async () => {
      setIsSoraSearching(true);
      try {
        const response = await apiClient.soraCharacters.searchUsers(searchTerm || '');
        const existingIds = new Set(soraCollaborators.map(c => c.id));
        const filtered = (response.data || [])
          .filter((u: any) => !existingIds.has(u.id))
          .slice(0, 5);
        setSoraSearchResults(filtered);
        setShowSoraSearchDropdown(true);
      } catch (error) {
        console.error('搜索用户失败:', error);
      } finally {
        setIsSoraSearching(false);
      }
    }, 200);
  };

  // 添加 Sora 协作者
  const handleAddSoraCollaborator = async (user: any) => {
    try {
      await apiClient.soraCharacters.addCollaborator(user.id);
      setSoraCollaborators(prev => [...prev, { id: user.id, oderId: user.id, nickname: user.nickname, avatar: user.avatar } as any]);
      setSoraSearchQuery('');
      setSoraSearchResults([]);
      setShowSoraSearchDropdown(false);
      setSoraHasCollaborators(true);
      toast.success(`已添加协作者: ${user.nickname || user.username}`);
    } catch (error: any) {
      toast.error(error.response?.data?.error || '添加协作者失败');
    }
  };

  // 移除 Sora 协作者
  const handleRemoveSoraCollaborator = async (userId: string) => {
    try {
      await apiClient.soraCharacters.removeCollaborator(userId);
      const newList = soraCollaborators.filter(c => c.id !== userId);
      setSoraCollaborators(newList);
      setSoraHasCollaborators(newList.length > 0);
      toast.success('已移除协作者');
    } catch (error: any) {
      toast.error(error.response?.data?.error || '移除协作者失败');
    }
  };

  // 打开 Sora 角色库编辑模态框
  const openSoraEditModal = () => {
    loadSoraCollaborators();
    setShowSoraEditModal(true);
  };

  const loadLibraries = async (force: boolean = false) => {
    if (!force && inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const params: any = { includeShared: 'true' };
      if (categoryFilter !== 'ALL') {
        params.category = categoryFilter;
      }
      const response = await apiClient.assetLibraries.getAll(params);
      setLibraries(response?.data || []);
    } catch (error: any) {
      setLibraries([]);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('请输入资产库名称');
      return;
    }

    try {
      if (creating) return;
      setCreating(true);
      const libraryData = {
        ...formData,
        thumbnail: thumbnail || undefined,
      };
      const response = await apiClient.assetLibraries.create(libraryData);
      toast.success('资产库创建成功！');
      setShowCreateModal(false);
      setFormData({ name: '', description: '', category: 'OTHER' });
      setThumbnail(null);
      
      // 创建成功后跳转到资产库详情
      navigate(`/assets/${response.data.id}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingLibrary) return;

    try {
      const libraryData = {
        ...formData,
        thumbnail: thumbnail || undefined,
      };
      const resp = await apiClient.assetLibraries.update(editingLibrary.id, libraryData);
      const updated = (resp?.data && resp.data.data) ? resp.data.data : null;
      setLibraries((prev) => prev.map((l) =>
        l.id === editingLibrary.id
          ? {
              ...l,
              name: libraryData.name ?? l.name,
              description: libraryData.description ?? l.description,
              thumbnail: (updated?.thumbnail ?? libraryData.thumbnail ?? l.thumbnail) || null,
              category: (libraryData as any).category ?? l.category,
              updatedAt: new Date().toISOString(),
            }
          : l
      ));
      toast.success('资产库更新成功！');
      setShowEditModal(false);
      setEditingLibrary(null);
      setFormData({ name: '', description: '', category: 'OTHER' });
      setThumbnail(null);
      await loadLibraries(true);
    } catch (error: any) {
      toast.error(error.response?.data?.message || '更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个资产库吗？资产库中的所有资产都会被删除！')) {
      return;
    }

    try {
      await apiClient.assetLibraries.delete(id);
      toast.success('资产库删除成功');
      loadLibraries();
    } catch (error: any) {
      toast.error('删除失败');
    }
  };

  const openEditModal = (library: AssetLibrary) => {
    setEditingLibrary(library);
    setFormData({
      name: library.name,
      description: library.description || '',
    });
    setThumbnail(library.thumbnail || null);
    setShowEditModal(true);
  };

  // 搜索过滤
  const filteredLibraries = libraries.filter((library) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        library.name.toLowerCase().includes(query) ||
        library.description?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  return (
    <div className="pr-8 pb-8">
      {/* 搜索栏 - 居中 */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 flex items-center h-[72px]">
        <div className="relative w-80 flex items-center">
          <span className="material-symbols-outlined absolute left-4 text-text-light-tertiary dark:text-text-dark-tertiary">
            search
          </span>
          <input
            type="text"
            placeholder="搜索资产库..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 pr-28 py-2.5 w-full bg-white dark:bg-[#18181b] border border-border-light dark:border-border-dark rounded-full text-text-light-primary dark:text-text-dark-primary placeholder:text-text-light-tertiary dark:placeholder:text-text-dark-tertiary outline-none transition-all"
            style={{ outline: 'none', boxShadow: 'none' }}
          />
          {/* 自定义下拉菜单 - 在搜索栏内部右侧 */}
          <CustomSelect
            value={categoryFilter}
            onChange={(value) => setCategoryFilter(value as any)}
            options={[
              { value: 'ALL', label: '全部' },
              { value: 'ROLE', label: '角色库' },
              { value: 'SCENE', label: '场景库' },
              { value: 'PROP', label: '道具库' },
              { value: 'OTHER', label: '其它' },
            ]}
          />
        </div>
      </div>

      {/* 创建按钮 - 左侧工具栏下方悬浮 */}
      <div className="fixed left-[24px] bottom-8 z-50">
        <div className="group relative">
          <button
            onClick={() => setShowCreateModal(true)}
            className="w-10 h-10 rounded-xl bg-white dark:bg-[#18181b] text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 hover:bg-black dark:hover:bg-white hover:border-transparent transition-all flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
          >
            <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: '"FILL" 0, "wght" 500' }}>add</span>
          </button>
          <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 text-xs text-white bg-slate-800 dark:bg-slate-700 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">创建资产库</span>
        </div>
      </div>

      {/* 资产库列表 - 顶部留出header空间 */}
      <div className="pt-36">
      {loading ? (
        <div className="text-center py-12 text-text-light-secondary dark:text-text-dark-secondary">
          加载中...
        </div>
      ) : libraries.length === 0 && categoryFilter !== 'ALL' && categoryFilter !== 'ROLE' ? (
        // 完全没有资产库时的空状态
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-24 w-24 rounded-full bg-tiffany-50 dark:bg-tiffany-500/10 flex items-center justify-center mb-6 shadow-tiffany">
            <span className="material-symbols-outlined text-tiffany-600 dark:text-tiffany-400 text-5xl">photo_library</span>
          </div>
          <h2 className="text-2xl font-bold text-text-light-primary dark:text-text-dark-primary mb-2">还没有资产库</h2>
          <p className="text-text-light-secondary dark:text-text-dark-secondary mb-6">创建你的第一个资产库来管理素材</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 bg-neutral-800 dark:bg-white hover:shadow-lg text-white dark:text-black font-medium rounded-lg transition-all active:scale-95"
          >
            立即创建
          </button>
        </div>
      ) : filteredLibraries.length === 0 && categoryFilter !== 'ALL' && categoryFilter !== 'ROLE' ? (
        // 有资产库但搜索后为空的状态
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-24 w-24 rounded-full bg-gray-50 dark:bg-gray-500/10 flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-gray-400 dark:text-gray-500 text-5xl">search_off</span>
          </div>
          <h2 className="text-2xl font-bold text-text-light-primary dark:text-text-dark-primary mb-2">没有找到资产库</h2>
          <p className="text-text-light-secondary dark:text-text-dark-secondary mb-6">
            尝试使用其他关键词搜索
          </p>
          <button
            onClick={() => setSearchQuery('')}
            className="px-6 py-3 bg-white dark:bg-[#18181b] text-text-light-primary dark:text-text-dark-primary font-medium rounded-lg hover:bg-card-light-hover dark:hover:bg-card-dark-hover transition-all border border-border-light dark:border-border-dark"
          >
            清除搜索
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {/* Sora角色库卡片 - 置顶显示（始终显示） */}
          {(categoryFilter === 'ALL' || categoryFilter === 'ROLE') && (
            <div
              onClick={() => navigate('/assets/sora-characters')}
              className="relative border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden hover:border-neutral-400 dark:hover:border-neutral-600 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group cursor-pointer aspect-[4/3]"
            >
              {/* 缩略图 - 充满整个卡片 */}
              <div className="absolute inset-0">
                <img
                  src={soraLibraryCover || '/sora-library.jpg'}
                  alt="Sora角色库"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = '/sora-library.jpg';
                  }}
                />
              </div>
                
              {/* 编辑按钮 - 左上角悬浮显示 */}
              <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1.5 z-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openSoraEditModal();
                  }}
                  className="w-7 h-7 flex items-center justify-center bg-black/60 dark:bg-white/80 hover:bg-black dark:hover:bg-white text-white dark:text-black rounded-full transition-all backdrop-blur-sm shadow-md active:scale-95 cursor-pointer"
                  title="编辑Sora角色库"
                >
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>edit</span>
                </button>
              </div>

              {/* 已共享标识 */}
              {soraHasCollaborators && (
                <div className="absolute top-2 right-2 px-2 py-1 rounded-lg text-xs font-medium text-white bg-black/50 dark:bg-white/20 backdrop-blur-sm flex items-center gap-1 z-10">
                  <span className="material-symbols-outlined text-xs">share</span>
                  已共享
                </div>
              )}

              {/* 信息区域 - 悬浮于图片上方，半透明磨砂效果 */}
              <div className="absolute bottom-3 left-3 right-3 p-3 bg-white/50 dark:bg-black/50 backdrop-blur-md rounded-xl z-10">
                <h3 className="font-semibold text-sm text-neutral-900 dark:text-white truncate">
                  Sora角色库
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">已创建 {soraCharacterCount} 个Sora专用角色</p>
              </div>
            </div>
          )}
          
          {filteredLibraries.map((library) => (
            <div
              key={library.id}
              onClick={() => navigate(`/assets/${library.id}`)}
              className="relative border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden hover:border-neutral-400 dark:hover:border-neutral-600 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group cursor-pointer aspect-[4/3]"
            >
              {/* 缩略图 - 充满整个卡片 */}
              <div className="absolute inset-0">
                {library.thumbnail ? (
                  <img
                    src={resolveAssetUrl(library.thumbnail)}
                    alt={library.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      console.error('Thumbnail load error:', library.thumbnail);
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-neutral-100 dark:bg-[#27272a]">
                    <span className="material-symbols-outlined text-3xl text-neutral-400 dark:text-neutral-500">
                      {(library.category ?? 'OTHER') === 'ROLE' ? 'person' : (library.category ?? 'OTHER') === 'SCENE' ? 'landscape' : (library.category ?? 'OTHER') === 'PROP' ? 'inventory_2' : (library.category ?? 'OTHER') === 'AUDIO' ? 'music_note' : 'widgets'}
                    </span>
                  </div>
                )}
              </div>
              
              {/* 操作按钮组 - 仅所有者可见 */}
              {(library.isOwner !== false) && (
                <div className="absolute top-2 left-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditModal(library);
                    }}
                    className="w-7 h-7 flex items-center justify-center bg-black/60 dark:bg-white/80 hover:bg-black dark:hover:bg-white text-white dark:text-black rounded-full transition-all backdrop-blur-sm shadow-md active:scale-95"
                    title="编辑资产库"
                  >
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>edit</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(library.id);
                    }}
                    className="w-7 h-7 flex items-center justify-center bg-black/60 dark:bg-white/80 hover:bg-black dark:hover:bg-white text-white dark:text-black rounded-full transition-all backdrop-blur-sm shadow-md active:scale-95"
                    title="删除资产库"
                  >
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>delete</span>
                  </button>
                </div>
              )}

              {/* 共享状态标识 */}
              {library.isShared && (
                <div className="absolute top-2 right-2 px-2 py-1 rounded-lg text-xs font-medium text-white bg-black/50 dark:bg-white/20 backdrop-blur-sm flex items-center gap-1 z-10">
                  <span className="material-symbols-outlined text-xs">group</span>
                  共享
                </div>
              )}

              {/* 分类标识 */}
              <div className="absolute top-2 right-2 px-2 py-1 rounded-lg text-xs font-medium text-white bg-black/50 dark:bg-white/20 backdrop-blur-sm z-10">
                {(library.category ?? 'OTHER') === 'ROLE' ? '角色库' : (library.category ?? 'OTHER') === 'SCENE' ? '场景库' : (library.category ?? 'OTHER') === 'PROP' ? '道具库' : (library.category ?? 'OTHER') === 'AUDIO' ? '音频库' : '分镜资产'}
              </div>

              {/* 资产库信息 - 悬浮于图片上方，半透明磨砂效果 */}
              <div className="absolute bottom-3 left-3 right-3 p-3 bg-white/50 dark:bg-black/50 backdrop-blur-md rounded-xl z-10">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-neutral-900 dark:text-white truncate flex-1">
                    {library.name}
                  </h3>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-2">{library._count?.assets ?? 0}</span>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                  {library.description || '暂无描述'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 创建资产库模态框 */}
      {showCreateModal && (
        <LibraryModal
          isEdit={false}
          onSubmit={handleCreate}
          formData={formData}
          setFormData={setFormData}
          thumbnail={thumbnail}
          setThumbnail={setThumbnail}
          onClose={() => {
            setShowCreateModal(false);
            setFormData({ name: '', description: '', category: 'OTHER' });
            setThumbnail(null);
          }}
        />
      )}

      {/* 编辑资产库模态框 */}
      {showEditModal && editingLibrary && (
        <LibraryModal
          isEdit={true}
          libraryId={editingLibrary.id}
          onSubmit={handleEdit}
          formData={formData}
          setFormData={setFormData}
          thumbnail={thumbnail}
          setThumbnail={setThumbnail}
          onClose={() => {
            setShowEditModal(false);
            setEditingLibrary(null);
            setFormData({ name: '', description: '', category: 'OTHER' });
            setThumbnail(null);
            loadLibraries(true); // 刷新列表以更新协作者状态
          }}
        />
      )}

      {/* Sora角色库编辑模态框 */}
      {showSoraEditModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/90 dark:bg-black/70 backdrop-blur-xl border-2 border-slate-200 dark:border-white/10 rounded-2xl p-6 w-[500px] max-w-[95vw] shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
                编辑Sora角色库
              </h2>
              <button
                onClick={() => {
                  setShowSoraEditModal(false);
                  setSoraSearchQuery('');
                  setSoraSearchResults([]);
                  setShowSoraSearchDropdown(false);
                }}
                className="p-1.5 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              >
                <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>close</span>
              </button>
            </div>

            {/* 封面设置 */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                封面图片
              </label>
              <div className="relative group">
                {soraLibraryCover ? (
                  <div className="relative">
                    <img
                      src={soraLibraryCover.startsWith('data:') || soraLibraryCover.startsWith('http') ? soraLibraryCover : `${API_URL}${soraLibraryCover}`}
                      alt="Sora角色库封面"
                      className="w-full aspect-[16/9] object-cover rounded-md border-2 border-slate-200 dark:border-white/10"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSoraLibraryCover(null);
                        try {
                          localStorage.removeItem('soraLibraryCover');
                        } catch {}
                      }}
                      className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-full transition-all opacity-0 group-hover:opacity-100 shadow-md"
                    >
                      <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>close</span>
                    </button>
                  </div>
                ) : (
                  <label className="w-full aspect-[16/9] border-2 border-dashed border-slate-300 dark:border-white/20 rounded-md hover:border-neutral-600 dark:hover:border-neutral-600/50 transition-colors flex flex-col items-center justify-center gap-2 bg-slate-100 dark:bg-white/5 cursor-pointer">
                    <span className="material-symbols-outlined text-2xl text-slate-400 dark:text-white/50" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>
                      add_photo_alternate
                    </span>
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      点击上传封面
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            setSoraLibraryCover(ev.target?.result as string);
                            try {
                              localStorage.setItem('soraLibraryCover', ev.target?.result as string);
                            } catch {}
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* 协作者管理 */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                协作者管理
              </label>
              <div className="border-2 border-slate-200 dark:border-white/10 rounded-md bg-slate-100 dark:bg-white/5 p-3">
                {/* 搜索框 */}
                <div className="relative mb-3">
                  <input
                    type="text"
                    value={soraSearchQuery}
                    onChange={(e) => handleSoraSearchUsers(e.target.value)}
                    onFocus={() => soraSearchQuery && setShowSoraSearchDropdown(true)}
                    placeholder="@用户昵称 添加协作者"
                    className="w-full px-3 py-2 bg-white dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded text-sm text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-neutral-800"
                  />
                  {isSoraSearching && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 material-symbols-outlined text-sm animate-spin text-slate-400">progress_activity</span>
                  )}
                  {/* 搜索结果下拉 */}
                  {showSoraSearchDropdown && soraSearchResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-md shadow-lg max-h-40 overflow-y-auto">
                      {soraSearchResults.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => handleAddSoraCollaborator(user)}
                          className="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-white/10 text-left"
                        >
                          {user.avatar ? (
                            <img src={user.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                          ) : (
                            <span className="material-symbols-outlined text-slate-400 text-lg">account_circle</span>
                          )}
                          <span className="text-sm text-slate-800 dark:text-white">{user.nickname || user.username}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* 协作者列表 */}
                <div className="min-h-[80px] max-h-[160px] overflow-y-auto">
                  {soraCollaborators.length === 0 ? (
                    <div className="h-20 flex items-center justify-center text-xs text-slate-400">
                      暂无协作者，协作者可以在工作流中使用你的Sora角色
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {soraCollaborators.map((collab) => (
                        <div key={collab.id} className="flex items-center justify-between px-2 py-1.5 bg-white dark:bg-black/20 rounded">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {collab.avatar ? (
                              <img src={collab.avatar} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                            ) : (
                              <span className="material-symbols-outlined text-slate-400 text-base flex-shrink-0">account_circle</span>
                            )}
                            <span className="text-xs text-slate-700 dark:text-slate-300 truncate">{collab.nickname || '未命名'}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveSoraCollaborator(collab.id)}
                            className="p-0.5 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded flex-shrink-0"
                          >
                            <span className="material-symbols-outlined text-sm">close</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                共享后，协作者可以在工作流中@引用你的Sora角色
              </p>
            </div>

            {/* 关闭按钮 */}
            <div className="mt-6">
              <button
                onClick={() => {
                  setShowSoraEditModal(false);
                  setSoraSearchQuery('');
                  setSoraSearchResults([]);
                  setShowSoraSearchDropdown(false);
                  loadSoraCharacterCount(); // 刷新共享状态
                }}
                className="w-full px-4 py-2 bg-neutral-800 dark:bg-white hover:shadow-lg text-white dark:text-black rounded-md transition-all font-medium active:scale-95"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default AssetsPage;
