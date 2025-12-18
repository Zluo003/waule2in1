import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { apiClient, api } from '../lib/api';
import { useTenantAuthStore } from '../store/tenantAuthStore';

interface Project {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  type: 'DRAMA' | 'QUICK';
  status: 'DRAFT' | 'IN_PROGRESS' | 'RENDERING' | 'COMPLETED' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  _count: {
    episodes: number;
    workflows: number;
    assets: number;
  };
  // 工作流分享相关（仅QUICK类型）
  workflowId?: string;
  isOwner?: boolean;
  isShared?: boolean;
  hasCollaborators?: boolean;
  shareInfo?: {
    owner?: { id: string; nickname: string | null; avatar: string | null };
    sharedAt?: string;
  };
}

interface Collaborator {
  id: string;
  userId: string;
  nickname: string | null;
  username?: string;
  avatar: string | null;
  permission?: 'READ' | 'EDIT';
  sharedAt?: string;
}

type ProjectFormData = {
  name: string;
  description: string;
  type: 'DRAMA' | 'QUICK';
};

interface ProjectModalProps {
  isEdit?: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  formData: ProjectFormData;
  setFormData: React.Dispatch<React.SetStateAction<ProjectFormData>>;
  thumbnail: string | null;
  setThumbnail: React.Dispatch<React.SetStateAction<string | null>>;
  hideType?: boolean;
  projectId?: string;
  projectType?: 'DRAMA' | 'QUICK';
}

// 将 ProjectModal 移到组件外部，避免重新创建导致输入框失焦
const ProjectModal: React.FC<ProjectModalProps> = ({
  isEdit = false,
  onSubmit,
  onClose,
  formData,
  setFormData,
  thumbnail,
  setThumbnail,
  hideType = false,
  projectId,
  projectType,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploadingThumbnail, setIsUploadingThumbnail] = React.useState(false);

  // 调试：监控 thumbnail 变化
  React.useEffect(() => {
    console.log('[ProjectModal] thumbnail 更新:', thumbnail);
  }, [thumbnail]);
  
  // 协作者管理状态（仅用于QUICK类型的编辑模式）
  const [collaborators, setCollaborators] = React.useState<Collaborator[]>([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = React.useState(false);
  const [workflowId, setWorkflowId] = React.useState<string | null>(null);
  const [selectedPermission, setSelectedPermission] = React.useState<'READ' | 'EDIT'>('READ'); // 默认只读
  const [isPublic, setIsPublic] = React.useState(false); // 是否已公开共享给所有人
  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载工作流ID和协作者列表
  React.useEffect(() => {
    if (isEdit && projectId) {
      loadCollaborators();
    }
  }, [isEdit, projectType, projectId]);

  const loadCollaborators = async () => {
    if (!projectId) return;
    try {
      if (projectType === 'QUICK') {
        // QUICK项目：通过工作流管理协作者
        const workflowRes = await apiClient.workflows.getOrCreateByProject(projectId);
        const wfId = workflowRes.data?.id;
        if (wfId) {
          setWorkflowId(wfId);
          const collabRes = await apiClient.workflows.getCollaborators(wfId);
          setCollaborators(collabRes.data || []);
        }
      } else {
        // DRAMA项目：通过项目管理协作者
        const collabRes = await apiClient.projects.getCollaborators(projectId);
        setCollaborators(collabRes.data || []);
      }
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
    
    if (!query.startsWith('@')) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }
    
    const searchTerm = query.slice(1).trim();
    
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        // 根据项目类型选择不同的搜索API
        const response = projectType === 'QUICK'
          ? await apiClient.workflows.searchUsers(searchTerm || '')
          : await apiClient.projects.searchUsers(searchTerm || '');
        const existingIds = new Set(collaborators.map(c => c.id));
        let filtered: any[] = ((response.data || []) as any[])
          .filter((u: any) => !existingIds.has(u.id))
          .slice(0, 5);
        
        // 租户管理员可以看到"所有人"选项（仅 QUICK 项目，且未公开）
        const tenantUser = useTenantAuthStore.getState().user;
        const isAdminUser = tenantUser?.isAdmin === true;
        if (isAdminUser && projectType === 'QUICK' && !isPublic && (searchTerm === '' || '所有人'.includes(searchTerm))) {
          filtered = [{ id: '*', nickname: '所有人', avatar: null, isEveryone: true }, ...filtered];
        }
        
        setSearchResults(filtered);
        setShowSearchDropdown(true);
      } catch (error) {
        console.error('搜索用户失败:', error);
      } finally {
        setIsSearching(false);
      }
    }, 200);
  };

  // 添加协作者（QUICK项目支持权限选择，DRAMA项目只有只读权限）
  const handleAddCollaborator = async (user: any) => {
    if (!projectId) return;
    try {
      if (projectType === 'QUICK') {
        if (!workflowId) return;
        await apiClient.workflows.addCollaborator(workflowId, user.id, selectedPermission);
        
        // 处理"所有人"公开共享
        if (user.id === '*' || user.isEveryone) {
          setIsPublic(true);
          setSearchQuery('');
          setSearchResults([]);
          setShowSearchDropdown(false);
          toast.success('已公开共享给所有人');
          return;
        }
      } else {
        await apiClient.projects.addCollaborator(projectId, user.id);
      }
      setCollaborators(prev => [...prev, { 
        id: user.id,
        userId: user.id, 
        nickname: user.nickname,
        username: user.username,
        avatar: user.avatar,
        permission: projectType === 'QUICK' ? selectedPermission : 'READ'
      }]);
      setSearchQuery('');
      setSearchResults([]);
      setShowSearchDropdown(false);
      toast.success(`已添加协作者: ${user.nickname || user.username}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || '添加失败');
    }
  };

  // 更新协作者权限（仅QUICK项目）
  const handleUpdatePermission = async (userId: string, permission: 'READ' | 'EDIT') => {
    if (!workflowId || projectType !== 'QUICK') return;
    try {
      await apiClient.workflows.updatePermission(workflowId, userId, permission);
      setCollaborators(prev => prev.map(c => 
        c.userId === userId ? { ...c, permission } : c
      ));
      toast.success('权限已更新');
    } catch (error: any) {
      toast.error(error.response?.data?.message || '更新失败');
    }
  };

  // 移除协作者
  const handleRemoveCollaborator = async (userId: string) => {
    if (!projectId) return;
    try {
      if (projectType === 'QUICK') {
        if (!workflowId) return;
        await apiClient.workflows.removeCollaborator(workflowId, userId);
      } else {
        await apiClient.projects.removeCollaborator(projectId, userId);
      }
      setCollaborators(prev => prev.filter(c => c.userId !== userId));
      toast.success('已移除协作者');
    } catch (error: any) {
      toast.error(error.response?.data?.message || '移除失败');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }

    // 验证文件大小（最大 10MB）
    if (file.size > 10 * 1024 * 1024) {
      toast.error('图片大小不能超过 10MB');
      return;
    }

    // 直接上传到 OSS
    setIsUploadingThumbnail(true);
    try {
      const result = await apiClient.assets.upload(file);
      console.log('[封面上传] 返回结果:', result);
      // 兼容多种返回格式
      const url = result.data?.url || result.url || (result.data as any)?.url;
      if (result.success && url) {
        console.log('[封面上传] 设置 URL:', url);
        setThumbnail(url);
        toast.success('封面上传成功');
      } else {
        console.error('[封面上传] 无法获取 URL:', result);
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
      <div className="bg-white/90 dark:bg-black/70 backdrop-blur-xl border-2 border-slate-200 dark:border-white/10 rounded-2xl p-6 max-w-lg w-full shadow-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
            {isEdit ? '编辑项目' : '创建新项目'}
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
              项目名称 *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none"
              style={{ outline: 'none', boxShadow: 'none' }}
              placeholder="例如: 霸道总裁爱上我"
              maxLength={100}
            />
          </div>

          {/* 封面+描述 和 协作者并排布局（编辑模式） */}
          <div className={isEdit ? 'grid grid-cols-2 gap-4' : ''}>
            {/* 左列：封面 + 项目描述 */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  项目封面
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {isUploadingThumbnail ? (
                  <div className={`w-full ${isEdit ? 'aspect-[16/9]' : 'h-44'} border-2 border-dashed border-purple-400 dark:border-purple-400/50 rounded-md flex flex-col items-center justify-center gap-2 bg-slate-100 dark:bg-white/5`}>
                    <span className="material-symbols-outlined text-2xl text-purple-500 animate-spin">progress_activity</span>
                    <span className="text-xs text-slate-600 dark:text-slate-400">正在上传...</span>
                  </div>
                ) : thumbnail ? (
                  <div className="relative group">
                    <img
                      src={thumbnail}
                      alt="封面预览"
                      className={`w-full ${isEdit ? 'aspect-[16/9]' : 'h-44'} object-cover rounded-md border-2 border-slate-200 dark:border-white/10`}
                      onLoad={() => console.log('[图片] 加载成功')}
                      onError={(e) => console.error('[图片] 加载失败:', e)}
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
                    className={`w-full ${isEdit ? 'aspect-[16/9]' : 'h-44'} border-2 border-dashed border-slate-300 dark:border-white/20 rounded-md hover:border-purple-400 dark:hover:border-purple-400/50 transition-colors flex flex-col items-center justify-center gap-2 bg-slate-100 dark:bg-white/5`}
                  >
                    <span className="material-symbols-outlined text-2xl text-slate-400 dark:text-white/50" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>
                      add_photo_alternate
                    </span>
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      点击上传封面图片
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-500">
                      支持 JPG、PNG，最大 10MB
                    </span>
                  </button>
                )}
              </div>

              {/* 项目描述（编辑模式下在左列） */}
              {isEdit && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                    项目描述
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none resize-none"
                    style={{ outline: 'none', boxShadow: 'none' }}
                    rows={3}
                    placeholder="简要描述项目内容..."
                    maxLength={500}
                  />
                </div>
              )}
            </div>

            {/* 右列：协作者管理（编辑模式） */}
            {isEdit && (
              <div className="flex flex-col">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  协作者管理
                </label>
                <div className="flex-1 border-2 border-slate-200 dark:border-white/10 rounded-md bg-slate-100 dark:bg-white/5 p-2 flex flex-col">
                  {/* 权限选择器（仅QUICK项目） */}
                  {projectType === 'QUICK' && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-slate-500">新协作者权限:</span>
                      <div className="flex rounded overflow-hidden border border-slate-200 dark:border-white/10">
                        <button
                          type="button"
                          onClick={() => setSelectedPermission('READ')}
                          className={`px-2 py-0.5 text-xs ${selectedPermission === 'READ' 
                            ? 'bg-blue-500 text-white' 
                            : 'bg-white dark:bg-black/30 text-slate-600 dark:text-slate-400'}`}
                        >
                          只读
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedPermission('EDIT')}
                          className={`px-2 py-0.5 text-xs ${selectedPermission === 'EDIT' 
                            ? 'bg-green-500 text-white' 
                            : 'bg-white dark:bg-black/30 text-slate-600 dark:text-slate-400'}`}
                        >
                          编辑
                        </button>
                      </div>
                    </div>
                  )}
                  {/* 搜索框 */}
                  <div className="relative mb-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchUsers(e.target.value)}
                      onFocus={() => searchQuery && setShowSearchDropdown(true)}
                      placeholder="@用户昵称 添加协作者"
                      className="w-full px-3 py-1.5 bg-white dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded text-sm text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
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
                            className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-white/10 text-left ${user.isEveryone ? 'bg-purple-50 dark:bg-purple-900/20' : ''}`}
                          >
                            {user.isEveryone ? (
                              <span className="material-symbols-outlined text-purple-500 text-lg">groups</span>
                            ) : user.avatar ? (
                              <img src={user.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                            ) : (
                              <span className="material-symbols-outlined text-slate-400 text-lg">account_circle</span>
                            )}
                            <span className={`text-sm ${user.isEveryone ? 'text-purple-600 dark:text-purple-400 font-medium' : 'text-slate-800 dark:text-white'}`}>
                              {user.nickname || user.username}
                              {user.isEveryone && <span className="text-xs ml-1 text-purple-400">（公开共享）</span>}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* 协作者列表 */}
                  <div className="flex-1 overflow-y-auto">
                    {collaborators.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-slate-400">
                        暂无协作者
                      </div>
                    ) : (
                      <div className="space-y-1">
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
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {/* 权限切换按钮（仅QUICK项目） */}
                              {projectType === 'QUICK' && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdatePermission(
                                    collab.userId, 
                                    collab.permission === 'EDIT' ? 'READ' : 'EDIT'
                                  )}
                                  className={`px-1.5 py-0.5 text-[10px] rounded ${
                                    collab.permission === 'EDIT'
                                      ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400'
                                      : 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                                  } hover:opacity-80`}
                                  title="点击切换权限"
                                >
                                  {collab.permission === 'EDIT' ? '编辑' : '只读'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveCollaborator(collab.userId)}
                                className="p-0.5 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded"
                              >
                                <span className="material-symbols-outlined text-xs">close</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 项目描述（非编辑模式） */}
          {!isEdit && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                项目描述
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none resize-none"
                style={{ outline: 'none', boxShadow: 'none' }}
                rows={3}
                placeholder="简要描述项目内容..."
                maxLength={500}
              />
            </div>
          )}

          {!isEdit && !hideType && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                项目类型
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, type: 'DRAMA' }))}
                  className={`px-3 py-2 rounded-md border transition-all text-left ${formData.type === 'DRAMA'
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-slate-200 dark:border-white/10 hover:border-purple-400'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>movie</span>
                    <span className="font-medium text-slate-800 dark:text-white">剧集创作</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    适合长篇故事，多集连载
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, type: 'QUICK' }))}
                  className={`px-3 py-2 rounded-md border transition-all text-left ${formData.type === 'QUICK'
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-slate-200 dark:border-white/10 hover:border-purple-400'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>bolt</span>
                    <span className="font-medium text-slate-800 dark:text-white">快速创作</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    快速创作单个作品
                  </p>
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-white rounded-md hover:bg-slate-200 dark:hover:bg-white/10 transition-all border border-slate-200 dark:border-white/10"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 px-3 py-2 bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 hover:shadow-lg text-white rounded-md transition-all font-medium active:scale-95"
            >
              {isEdit ? '保存更改' : '创建项目'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ProjectsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const activeTab: 'ALL' | 'QUICK' | 'DRAMA' =
    location.pathname.startsWith('/quick')
      ? 'QUICK'
      : location.pathname.startsWith('/drama')
        ? 'DRAMA'
        : 'ALL';
  const isQuick = location.pathname.startsWith('/quick');
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState<ProjectFormData>({
    name: '',
    description: '',
    type: 'DRAMA',
  });

  useEffect(() => {
    loadProjects();
  }, [activeTab]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const params = activeTab === 'ALL' ? { fields: 'minimal' } : { type: activeTab, fields: 'minimal' };
      const response = await apiClient.projects.getAll(params);
      let projectList: Project[] = (response.data || []).map((p: any) => ({ ...p, isOwner: true }));

      // 如果是快速创作页面或ALL页面，加载工作流信息（用于QUICK项目共享）
      if (activeTab === 'QUICK' || activeTab === 'ALL') {
        try {
          const workflowsRes = await apiClient.workflows.getAll({ includeShared: 'true' });
          const allWorkflows = workflowsRes.data || [];
          
          // 为自己的QUICK项目设置hasCollaborators
          const ownedWorkflows = allWorkflows.filter((w: any) => w.isOwner && w.projectId);
          const projectCollabMap = new Map<string, boolean>();
          ownedWorkflows.forEach((w: any) => {
            if (w.projectId && w.hasCollaborators) {
              projectCollabMap.set(w.projectId, true);
            }
          });
          
          // 更新自己的项目的hasCollaborators状态
          projectList = projectList.map(p => ({
            ...p,
            hasCollaborators: p.type === 'QUICK' ? projectCollabMap.get(p.id) || false : p.hasCollaborators || false,
          }));
          
          // 将共享的工作流转换为项目格式（QUICK项目共享）
          const sharedWorkflows = allWorkflows.filter((w: any) => w.isShared);
          const sharedQuickProjects: Project[] = sharedWorkflows.map((w: any) => ({
            id: w.projectId || `workflow-${w.id}`,
            name: w.project?.name || w.name,
            description: w.description,
            thumbnail: w.project?.thumbnail || null,
            type: 'QUICK' as const,
            status: 'DRAFT' as const,
            createdAt: w.createdAt,
            updatedAt: w.updatedAt,
            _count: { episodes: 0, workflows: 1, assets: 0 },
            workflowId: w.id,
            isOwner: false,
            isShared: true,
            hasCollaborators: false,
            shareInfo: w.shareInfo,
          }));
          
          projectList = [...projectList, ...sharedQuickProjects];
        } catch (e) {
          console.error('加载工作流信息失败:', e);
        }
      }

      // 加载共享给我的DRAMA项目
      if (activeTab === 'DRAMA' || activeTab === 'ALL') {
        try {
          const sharedRes = await apiClient.projects.getShared();
          const sharedDramaProjects: Project[] = (sharedRes.data || [])
            .filter((p: any) => activeTab === 'ALL' || p.type === 'DRAMA')
            .map((p: any) => ({
              ...p,
              isOwner: false,
              isShared: true,
              hasCollaborators: false,
            }));
          projectList = [...projectList, ...sharedDramaProjects];
        } catch (e) {
          console.error('加载共享DRAMA项目失败:', e);
        }
      }

      setProjects(projectList);
    } catch (error: any) {
      if (error.response && error.response.status !== 404) {
        toast.error('加载项目列表失败');
      }
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('请输入项目名称');
      return;
    }

    try {
      const projectData = {
        ...formData,
        type: isQuick ? 'QUICK' : 'DRAMA',
        thumbnail: thumbnail || undefined,
      };
      const response = await apiClient.projects.create(projectData);
      toast.success('项目创建成功！');
      setShowCreateModal(false);
      setFormData({ name: '', description: '', type: 'DRAMA' });
      setThumbnail(null);
      loadProjects();

      // 创建成功后：快速项目进入工作流；影视项目进入子项目（剧集）列表
      if (isQuick) {
        navigate(`/projects/${response.data.id}/workflow`);
      } else {
        navigate(`/projects/${response.data.id}/episodes`);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || '创建失败');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingProject) return;

    try {
      const projectData = {
        ...formData,
        thumbnail: thumbnail || undefined,
      };
      await apiClient.projects.update(editingProject.id, projectData);
      toast.success('项目更新成功！');
      setShowEditModal(false);
      setEditingProject(null);
      setFormData({ name: '', description: '', type: 'DRAMA' });
      setThumbnail(null);
      loadProjects();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个项目吗？所有相关数据都会被删除！')) {
      return;
    }

    try {
      await apiClient.projects.delete(id);
      toast.success('项目删除成功');
      loadProjects();
    } catch (error: any) {
      toast.error('删除失败');
    }
  };

  const openEditModal = (project: Project) => {
    setEditingProject(project);
    setFormData({
      name: project.name,
      description: project.description || '',
      type: project.type,
    });
    setThumbnail(project.thumbnail || null);
    setShowEditModal(true);
  };

  // 过滤和搜索项目
  const filteredProjects = projects.filter((project) => {
    // 标签过滤
    if (activeTab !== 'ALL' && project.type !== activeTab) {
      return false;
    }
    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        project.name.toLowerCase().includes(query) ||
        project.description?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // 已移除顶部筛选标签，统计不再使用

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
            placeholder="搜索项目..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 pr-4 h-12 w-full bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-full text-text-light-primary dark:text-text-dark-primary placeholder:text-text-light-tertiary dark:placeholder:text-text-dark-tertiary outline-none transition-all"
            style={{ outline: 'none', boxShadow: 'none' }}
          />
        </div>
      </div>

      {/* 创建按钮 - 左侧工具栏下方悬浮 */}
      <div className="fixed left-[24px] bottom-8 z-50">
        <div className="group relative">
          <button
            onClick={() => setShowCreateModal(true)}
            className="w-10 h-10 rounded-xl bg-white dark:bg-[#18181b] text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black hover:border-transparent transition-all flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
          >
            <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: '"FILL" 0, "wght" 500' }}>add</span>
          </button>
          <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 text-xs text-white bg-slate-800 dark:bg-slate-700 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">创建新项目</span>
        </div>
      </div>

      {/* 项目列表 - 顶部留出header空间 */}
      <div className="pt-36">
      {loading ? (
        <div className="text-center py-12 text-text-light-secondary dark:text-text-dark-secondary">
          加载中...
        </div>
      ) : projects.length === 0 ? (
        // 完全没有项目时的空状态
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-24 w-24 rounded-full bg-tiffany-50 dark:bg-tiffany-500/10 flex items-center justify-center mb-6 shadow-tiffany">
            <span className="material-symbols-outlined text-tiffany-600 dark:text-tiffany-400 text-5xl">folder_open</span>
          </div>
          <h2 className="text-2xl font-bold text-text-light-primary dark:text-text-dark-primary mb-2">还没有项目</h2>
          <p className="text-text-light-secondary dark:text-text-dark-secondary mb-6">创建你的第一个AI短剧项目</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 hover:shadow-lg text-white font-medium rounded-lg transition-all shadow-md active:scale-95"
          >
            立即创建
          </button>
        </div>
      ) : filteredProjects.length === 0 ? (
        // 有项目但过滤/搜索后为空的状态
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-24 w-24 rounded-full bg-gray-50 dark:bg-gray-500/10 flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-gray-400 dark:text-gray-500 text-5xl">search_off</span>
          </div>
          <h2 className="text-2xl font-bold text-text-light-primary dark:text-text-dark-primary mb-2">没有找到项目</h2>
          <p className="text-text-light-secondary dark:text-text-dark-secondary mb-6">
            {searchQuery ? '尝试使用其他关键词搜索' : '此分类暂无项目'}
          </p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="px-6 py-3 bg-card-light dark:bg-card-dark text-text-light-primary dark:text-text-dark-primary font-medium rounded-lg hover:bg-card-light-hover dark:hover:bg-card-dark-hover transition-all border border-border-light dark:border-border-dark"
            >
              清除搜索
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              onClick={() => {
                // 根据项目类型决定跳转路径
                if (project.type === 'QUICK') {
                  // 快速创作：直接进入工作流（共享的使用workflowId）
                  if (project.isShared && project.workflowId) {
                    navigate(`/workflow/${project.workflowId}`);
                  } else {
                    navigate(`/projects/${project.id}/workflow`);
                  }
                } else {
                  // 剧集创作：进入剧集列表
                  navigate(`/projects/${project.id}/episodes`);
                }
              }}
              className="relative border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden hover:border-neutral-400 dark:hover:border-neutral-600 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group cursor-pointer aspect-[4/3]"
            >
              {/* 缩略图 - 充满整个卡片 */}
              <div className="absolute inset-0">
                <ProjectCover thumbnail={project.thumbnail} name={project.name} />
              </div>

              {/* 操作按钮组 - 仅所有者可见 */}
              {(project.isOwner !== false) && (
                <div className="absolute top-2 left-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditModal(project);
                    }}
                    className="w-7 h-7 flex items-center justify-center bg-black/60 dark:bg-white/80 hover:bg-black dark:hover:bg-white text-white dark:text-black rounded-full transition-all backdrop-blur-sm shadow-md active:scale-95"
                    title="编辑项目"
                  >
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>edit</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(project.id);
                    }}
                    className="w-7 h-7 flex items-center justify-center bg-black/60 dark:bg-white/80 hover:bg-black dark:hover:bg-white text-white dark:text-black rounded-full transition-all backdrop-blur-sm shadow-md active:scale-95"
                    title="删除项目"
                  >
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>delete</span>
                  </button>
                </div>
              )}

              {/* 共享状态标识 */}
              {project.isShared && (
                <div className="absolute top-2 right-2 px-2 py-1 rounded-lg text-xs font-medium text-white bg-black/50 dark:bg-white/20 backdrop-blur-sm flex items-center gap-1 z-10">
                  <span className="material-symbols-outlined text-xs">group</span>
                  共享
                </div>
              )}
              {project.hasCollaborators && !project.isShared && (
                <div className="absolute top-2 right-2 px-2 py-1 rounded-lg text-xs font-medium text-white bg-black/50 dark:bg-white/20 backdrop-blur-sm flex items-center gap-1 z-10">
                  <span className="material-symbols-outlined text-xs">share</span>
                  已共享
                </div>
              )}

              {/* 项目信息 - 悬浮于图片上方，半透明磨砂效果 */}
              <div className="absolute bottom-3 left-3 right-3 p-3 bg-white/50 dark:bg-black/50 backdrop-blur-md rounded-xl z-10">
                <h3 className="font-semibold text-sm text-neutral-900 dark:text-white truncate">
                  {project.name}
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                  {project.description || '暂无描述'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 创建项目模态框 */}
      {showCreateModal && (
        <ProjectModal
          isEdit={false}
          onSubmit={handleCreate}
          formData={formData}
          setFormData={setFormData}
          thumbnail={thumbnail}
          setThumbnail={setThumbnail}
          hideType={true}
          onClose={() => {
            setShowCreateModal(false);
            setFormData({ name: '', description: '', type: 'DRAMA' });
            setThumbnail(null);
          }}
        />
      )}

      {/* 编辑项目模态框 */}
      {showEditModal && editingProject && (
        <ProjectModal
          isEdit={true}
          onSubmit={handleEdit}
          formData={formData}
          setFormData={setFormData}
          thumbnail={thumbnail}
          setThumbnail={setThumbnail}
          projectId={editingProject.id}
          projectType={editingProject.type}
          onClose={() => {
            setShowEditModal(false);
            setEditingProject(null);
            setFormData({ name: '', description: '', type: 'DRAMA' });
            setThumbnail(null);
            loadProjects(); // 刷新列表以更新协作者状态
          }}
        />
      )}
      </div>
    </div>
  );
};

// 项目封面组件 - 处理各种 URL 格式
const ProjectCover: React.FC<{ thumbnail?: string | null; name: string }> = ({ thumbnail, name }) => {
  const [candidates, setCandidates] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!thumbnail) { setCandidates([]); setIdx(0); return; }
    // 已经是绝对 URL
    if (thumbnail.startsWith('http') || thumbnail.startsWith('data:')) {
      setCandidates([thumbnail]); setIdx(0); return;
    }
    // 相对路径需要拼接 base URL
    const path = thumbnail.startsWith('/') ? thumbnail : `/${thumbnail}`;
    const rawBase = import.meta.env.VITE_API_URL as string | undefined;
    const envBase = rawBase ? rawBase.replace(/\/$/, '').replace(/\/api$/, '') : '';
    const axiosBase = api.defaults.baseURL && api.defaults.baseURL.startsWith('http')
      ? api.defaults.baseURL.replace(/\/$/, '').replace(/\/api$/, '')
      : '';
    const originBase = window.location.origin.replace(/\/$/, '');
    const list: string[] = [];
    if (originBase) list.push(`${originBase}${path}`);
    if (envBase) list.push(`${envBase}${path}`);
    if (axiosBase) list.push(`${axiosBase}${path}`);
    setCandidates(list);
    setIdx(0);
  }, [thumbnail]);

  const current = candidates[idx] || null;
  
  if (!thumbnail || failed || !current) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-neutral-100 dark:bg-[#27272a]">
        <span className="material-symbols-outlined text-3xl text-neutral-400 dark:text-neutral-500">movie</span>
      </div>
    );
  }

  return (
    <img
      src={current}
      alt={name}
      className="w-full h-full object-cover"
      onError={() => {
        if (idx + 1 < candidates.length) {
          setIdx(idx + 1);
        } else {
          setFailed(true);
        }
      }}
    />
  );
};

export default ProjectsPage;
