import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { apiClient, api } from '../lib/api';
// 使用带认证的获取方式，不直接拼接 API_URL

interface Episode {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  episodeNumber: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  thumbnail?: string;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  type: 'DRAMA' | 'QUICK';
  thumbnail?: string;
  isOwner?: boolean;
  isShared?: boolean;
}

interface Collaborator {
  id: string;
  userId: string; // 用户 ID，用于 API 调用
  nickname: string | null;
  avatar: string | null;
  permission: 'READ' | 'EDIT';
  sharedAt?: string;
}

interface EpisodeFormData {
  name: string;
  description: string;
  episodeNumber: number;
}

interface EpisodeModalProps {
  isEdit?: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  formData: EpisodeFormData;
  setFormData: React.Dispatch<React.SetStateAction<EpisodeFormData>>;
  episodes: Episode[];
  editingEpisodeId?: string | null;
  thumbnail: string | null;
  setThumbnail: React.Dispatch<React.SetStateAction<string | null>>;
  thumbnailFile: File | null;
  setThumbnailFile: React.Dispatch<React.SetStateAction<File | null>>;
}

// 剧集模态框组件
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const EpisodeModal: React.FC<EpisodeModalProps> = ({ isEdit = false, onSubmit, onClose, formData, setFormData, episodes, editingEpisodeId, thumbnail, setThumbnail, setThumbnailFile }) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploadingThumbnail, setIsUploadingThumbnail] = React.useState(false);
  
  console.log('👉 EpisodeModal received onSubmit:', typeof onSubmit);
  
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
        setThumbnailFile(null); // 不需要保存文件了
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
    setThumbnailFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  // 生成可用的集数选项（1-100）
  const maxEpisodes = 100;
  const usedEpisodeNumbers = new Set(
    episodes
      .filter(ep => ep.id !== editingEpisodeId) // 排除正在编辑的剧集
      .map(ep => ep.episodeNumber)
  );
  
  const availableEpisodeNumbers = Array.from({ length: maxEpisodes }, (_, i) => i + 1)
    .filter(num => !usedEpisodeNumbers.has(num));
  
  // 如果没有可用的集数，显示提示
  const hasAvailableNumbers = availableEpisodeNumbers.length > 0;
  
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/90 dark:bg-black/70 backdrop-blur-xl border-2 border-slate-200 dark:border-white/10 rounded-2xl p-6 max-w-lg w-full shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">
            {isEdit ? '编辑剧集' : '新建剧集'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>close</span>
          </button>
        </div>

        <form onSubmit={(e) => {
          console.log('✅ Form onSubmit triggered!');
          onSubmit(e);
        }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
              剧集封面
            </label>
            <input 
              ref={fileInputRef} 
              type="file" 
              accept="image/*" 
              onChange={handleFileChange} 
              className="hidden" 
            />
            {isUploadingThumbnail ? (
              <div className="w-full h-36 border-2 border-dashed border-neutral-600 dark:border-neutral-600/50 rounded-lg flex flex-col items-center justify-center gap-2 bg-slate-100 dark:bg-white/5">
                <span className="material-symbols-outlined text-2xl text-neutral-800 animate-spin">progress_activity</span>
                <span className="text-xs text-slate-600 dark:text-slate-400">正在上传...</span>
              </div>
            ) : thumbnail ? (
              <div className="relative group">
                <img 
                  src={thumbnail} 
                  alt="封面预览" 
                  className="w-full h-36 object-cover rounded-lg border-2 border-slate-200 dark:border-white/10" 
                />
                <button type="button" onClick={removeThumbnail} className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-full transition-all opacity-0 group-hover:opacity-100 shadow-md">
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>close</span>
                </button>
              </div>
            ) : (
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()} 
                className="w-full h-36 border-2 border-dashed border-slate-300 dark:border-white/20 rounded-lg hover:border-neutral-600 dark:hover:border-neutral-600/50 transition-colors flex flex-col items-center justify-center gap-2 bg-slate-100 dark:bg-white/5"
              >
                <span className="material-symbols-outlined text-2xl text-slate-400 dark:text-white/50" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>add_photo_alternate</span>
                <span className="text-xs text-slate-600 dark:text-slate-400">点击上传封面图片</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-500">支持 JPG、PNG，最大 10MB</span>
              </button>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
              第几集 *
            </label>
            {!hasAvailableNumbers ? (
              <div className="w-full px-4 py-2 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg text-text-light-secondary dark:text-text-dark-secondary">
                已达到最大剧集数（{maxEpisodes}集）
              </div>
            ) : (
              <select
                required
                value={formData.episodeNumber}
                onChange={(e) => setFormData(prev => ({ ...prev, episodeNumber: parseInt(e.target.value) }))}
                className="w-full px-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white outline-none transition-all"
                style={{ outline: 'none', boxShadow: 'none' }}
              >
                {availableEpisodeNumbers.map(num => (
                  <option key={num} value={num}>
                    第 {num} 集
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
              剧集描述
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none resize-none transition-all"
              style={{ outline: 'none', boxShadow: 'none' }}
              rows={3}
              placeholder="简要描述剧集内容..."
              maxLength={500}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 transition-all border border-slate-200 dark:border-white/10"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!hasAvailableNumbers}
              className="flex-1 px-4 py-2 bg-neutral-800 dark:bg-white hover:shadow-lg text-white dark:text-black rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium active:scale-95"
            >
              {isEdit ? '保存更改' : '创建剧集'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const EpisodesPage = () => {
  console.log('🔥🔥🔥 EpisodesPage LOADED - VERSION 2.0 🔥🔥🔥');
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<Episode | null>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  
  const [formData, setFormData] = useState<EpisodeFormData>({
    name: '',
    description: '',
    episodeNumber: 1,
  });

  // 权限管理状态
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loadingCollaborators, setLoadingCollaborators] = useState(false);
  
  // 获取下一个可用的集数
  const getNextAvailableEpisodeNumber = () => {
    const usedNumbers = new Set(episodes.map(ep => ep.episodeNumber));
    for (let i = 1; i <= 100; i++) {
      if (!usedNumbers.has(i)) {
        return i;
      }
    }
    return 1;
  };

  useEffect(() => {
    if (projectId) {
      loadProject();
      loadEpisodes();
    }
  }, [projectId]);

  const loadProject = async () => {
    try {
      const response = await apiClient.projects.getById(projectId!);
      setProject(response.data);
    } catch (error: any) {
      toast.error('加载项目失败');
      console.error(error);
    }
  };

  const loadEpisodes = async () => {
    try {
      setLoading(true);
      const response = await apiClient.episodes.list(projectId!);
      // API 返回格式: { success: true, data: episodes }
      setEpisodes(response.data?.data || response.data || []);
    } catch (error: any) {
      toast.error('加载剧集列表失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    console.log('🚀🚀🚀 HANDLE_CREATE EXECUTED!!! 🚀🚀🚀');
    e.preventDefault();
    
    console.log('[handleCreate] Starting... thumbnail:', thumbnail);
    
    // 检查集数是否已存在
    const episodeExists = episodes.some(ep => ep.episodeNumber === formData.episodeNumber);
    if (episodeExists) {
      toast.error(`第 ${formData.episodeNumber} 集已存在，请选择其他集数`);
      return;
    }
    
    try {
      // 封面已在模态框中上传，直接使用 thumbnail URL
      // 自动生成剧集名称，并转换为后端期望的字段名
      const episodeData = {
        title: `第${formData.episodeNumber}集`,
        description: formData.description,
        order: formData.episodeNumber,
        thumbnail: thumbnail || undefined,
      };
      console.log('[handleCreate] Creating episode with data:', episodeData);
      const createRes = await apiClient.episodes.create(projectId!, episodeData);
      console.log('[handleCreate] Create response:', createRes);
      toast.success('剧集创建成功！');
      setShowCreateModal(false);
      setFormData({ name: '', description: '', episodeNumber: 1 });
      setThumbnail(null);
      setThumbnailFile(null);
      loadEpisodes();
    } catch (error: any) {
      console.error('[handleCreate] Error:', error);
      toast.error(error.response?.data?.message || '创建失败');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEpisode) return;
    
    // 检查集数是否已被其他剧集占用
    const episodeExists = episodes.some(
      ep => ep.id !== editingEpisode.id && ep.episodeNumber === formData.episodeNumber
    );
    if (episodeExists) {
      toast.error(`第 ${formData.episodeNumber} 集已存在，请选择其他集数`);
      return;
    }
    
    try {
      // 封面已在模态框中上传，直接使用 thumbnail URL
      // 自动生成剧集名称，并转换为后端期望的字段名
      const episodeData = {
        title: `第${formData.episodeNumber}集`,
        description: formData.description,
        order: formData.episodeNumber,
        thumbnail: thumbnail || undefined,
      };
      await apiClient.episodes.update(projectId!, editingEpisode.id, episodeData);
      toast.success('剧集更新成功！');
      setShowEditModal(false);
      setEditingEpisode(null);
      setFormData({ name: '', description: '', episodeNumber: 1 });
      setThumbnail(null);
      setThumbnailFile(null);
      loadEpisodes();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '更新失败');
    }
  };

  const handleDelete = async (episodeId: string) => {
    if (!confirm('确定要删除此剧集吗？此操作不可恢复。')) return;
    try {
      await apiClient.episodes.delete(projectId!, episodeId);
      toast.success('剧集已删除');
      loadEpisodes();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '删除失败');
    }
  };

  const openEditModal = (episode: Episode) => {
    setEditingEpisode(episode);
    setFormData({
      name: '', // 不再使用，会自动生成
      description: episode.description || '',
      episodeNumber: episode.episodeNumber,
    });
    setThumbnail(episode.thumbnail || null);
    setThumbnailFile(null);
    setShowEditModal(true);
  };

  // 打开权限管理弹框（剧集协作者继承自项目）
  const openPermissionModal = async (episode: Episode) => {
    setSelectedEpisode(episode);
    setShowPermissionModal(true);
    setLoadingCollaborators(true);
    try {
      // 剧集的协作者继承自项目，所以调用项目的协作者 API
      const response = await apiClient.projects.getCollaborators(projectId!);
      setCollaborators(response.data || []);
    } catch (error: any) {
      toast.error('加载协作者失败');
      console.error(error);
    } finally {
      setLoadingCollaborators(false);
    }
  };

  // 更新协作者权限（剧集协作者继承自项目，所以更新项目协作者权限）
  const handleUpdatePermission = async (userId: string, permission: 'READ' | 'EDIT') => {
    if (!selectedEpisode) return;
    try {
      await apiClient.projects.updatePermission(projectId!, userId, permission);
      setCollaborators(prev => prev.map(c => c.userId === userId ? { ...c, permission } : c));
      toast.success('权限已更新');
    } catch (error: any) {
      toast.error(error.response?.data?.message || '更新失败');
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRAFT: '草稿',
      IN_PROGRESS: '进行中',
      RENDERING: '渲染中',
      COMPLETED: '已完成',
      ARCHIVED: '已归档',
    };
    return labels[status] || status;
  };

  return (
    <div className="pr-8 pb-8">
      {/* 返回按钮 + 项目标题 - 固定在左上角 */}
      <div className="fixed top-4 left-[136px] z-40 flex items-center gap-4 h-[72px]">
        <button
          onClick={() => navigate('/drama')}
          className="group w-10 h-10 flex items-center justify-center bg-white dark:bg-[#18181b] border border-neutral-200 dark:border-neutral-700 hover:bg-black dark:hover:bg-white hover:border-transparent rounded-lg transition-all"
        >
          <span className="material-symbols-outlined text-neutral-600 dark:text-neutral-400 group-hover:text-white dark:group-hover:text-black" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>arrow_back</span>
        </button>
        <span className="text-2xl font-semibold text-neutral-900 dark:text-white font-display">{project?.name || '剧集列表'}</span>
      </div>

      {/* 新建剧集按钮 - 左侧工具栏下方悬浮 */}
      <div className="fixed left-[24px] bottom-8 z-50">
        <div className="group relative">
          <button
            onClick={() => {
              setFormData({
                name: '',
                episodeNumber: getNextAvailableEpisodeNumber(),
                description: '',
              });
              setShowCreateModal(true);
            }}
            className="w-10 h-10 rounded-xl bg-white dark:bg-[#18181b] text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 hover:bg-black dark:hover:bg-white hover:border-transparent transition-all flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
          >
            <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: '"FILL" 0, "wght" 500' }}>add</span>
          </button>
          <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 text-xs text-white bg-slate-800 dark:bg-slate-700 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">新建剧集</span>
        </div>
      </div>

      {/* 剧集列表 - 顶部留出header空间 */}
      <div className="pt-36">
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-tiffany-500 border-t-transparent"></div>
        </div>
      ) : episodes.length === 0 ? (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-tiffany-100 to-accent-100 dark:from-tiffany-500/10 dark:to-accent-500/10 rounded-3xl mb-6">
            <span className="material-symbols-outlined text-5xl text-tiffany-500">movie</span>
          </div>
          <h2 className="text-xl font-semibold text-text-light-primary dark:text-text-dark-primary mb-2">
            还没有剧集
          </h2>
          <p className="text-text-light-secondary dark:text-text-dark-secondary mb-6">
            点击上方"新建剧集"按钮创建第一集
          </p>
          <button
            onClick={() => {
              setFormData({
                name: '',
                episodeNumber: getNextAvailableEpisodeNumber(),
                description: '',
              });
              setShowCreateModal(true);
            }}
            className="px-6 py-3 bg-neutral-800 dark:bg-white hover:shadow-lg text-white dark:text-black rounded-lg transition-all inline-flex items-center gap-2 font-medium active:scale-95"
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>add</span>
            新建剧集
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {episodes.map((episode) => (
            <div
              key={episode.id}
              onClick={() => navigate(`/projects/${projectId}/episodes/${episode.id}`)}
              className="relative border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden hover:border-neutral-400 dark:hover:border-neutral-600 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group cursor-pointer aspect-[4/3]"
            >
              {/* 缩略图 - 充满整个卡片 */}
              <div className="absolute inset-0">
                <EpisodeCover thumbnail={episode.thumbnail || ''} name={episode.name} episodeNumber={episode.episodeNumber} />
              </div>
              
              {/* 操作按钮组 - 仅所有者可见 */}
              {project?.isOwner !== false && (
                <div className="absolute top-2 left-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditModal(episode);
                    }}
                    className="w-7 h-7 flex items-center justify-center bg-black/60 dark:bg-white/80 hover:bg-black dark:hover:bg-white text-white dark:text-black rounded-full transition-all backdrop-blur-sm shadow-md active:scale-95"
                    title="编辑剧集"
                  >
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>edit</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openPermissionModal(episode);
                    }}
                    className="w-7 h-7 flex items-center justify-center bg-black/60 dark:bg-white/80 hover:bg-black dark:hover:bg-white text-white dark:text-black rounded-full transition-all backdrop-blur-sm shadow-md active:scale-95"
                    title="权限管理"
                  >
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>group</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(episode.id);
                    }}
                    className="w-7 h-7 flex items-center justify-center bg-black/60 dark:bg-white/80 hover:bg-black dark:hover:bg-white text-white dark:text-black rounded-full transition-all backdrop-blur-sm shadow-md active:scale-95"
                    title="删除剧集"
                  >
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>delete</span>
                  </button>
                </div>
              )}
              
              {/* 状态标签 */}
              {episode.status !== 'DRAFT' && (
                <div className="absolute top-2 right-2 px-2 py-1 rounded-lg text-xs font-medium text-white bg-black/50 dark:bg-white/20 backdrop-blur-sm z-10">
                  {getStatusLabel(episode.status)}
                </div>
              )}

              {/* 剧集信息 - 悬浮于图片上方，半透明磨砂效果 */}
              <div className="absolute bottom-3 left-3 right-3 p-3 bg-white/50 dark:bg-black/50 backdrop-blur-md rounded-xl z-10">
                <h3 className="font-semibold text-sm text-neutral-900 dark:text-white truncate">
                  {episode.name}
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                  {episode.description || '暂无描述'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 创建剧集模态框 */}
      {showCreateModal && (
        <EpisodeModal
          isEdit={false}
          onSubmit={handleCreate}
          formData={formData}
          setFormData={setFormData}
          episodes={episodes}
          editingEpisodeId={null}
          thumbnail={thumbnail}
          setThumbnail={setThumbnail}
          thumbnailFile={thumbnailFile}
          setThumbnailFile={setThumbnailFile}
          onClose={() => {
            setShowCreateModal(false);
            setFormData({ name: '', description: '', episodeNumber: 1 });
            setThumbnail(null);
            setThumbnailFile(null);
          }}
        />
      )}

      {/* 编辑剧集模态框 */}
      {showEditModal && editingEpisode && (
        <EpisodeModal
          isEdit={true}
          onSubmit={handleEdit}
          formData={formData}
          setFormData={setFormData}
          episodes={episodes}
          editingEpisodeId={editingEpisode.id}
          thumbnail={thumbnail}
          setThumbnail={setThumbnail}
          thumbnailFile={thumbnailFile}
          setThumbnailFile={setThumbnailFile}
          onClose={() => {
            setShowEditModal(false);
            setEditingEpisode(null);
            setFormData({ name: '', description: '', episodeNumber: 1 });
            setThumbnail(null);
            setThumbnailFile(null);
          }}
        />
      )}

      {/* 权限管理模态框 */}
      {showPermissionModal && selectedEpisode && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md mx-4 overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-200 dark:border-white/10">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                  权限管理 - 第{selectedEpisode.episodeNumber}集
                </h2>
                <button
                  onClick={() => {
                    setShowPermissionModal(false);
                    setSelectedEpisode(null);
                    setCollaborators([]);
                  }}
                  className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg"
                >
                  <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">close</span>
                </button>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                为协作者设置该剧集的编辑权限
              </p>
            </div>
            
            <div className="p-6 max-h-[400px] overflow-y-auto">
              {loadingCollaborators ? (
                <div className="flex items-center justify-center py-8">
                  <span className="material-symbols-outlined text-2xl text-neutral-800 animate-spin">progress_activity</span>
                </div>
              ) : collaborators.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                  <span className="material-symbols-outlined text-4xl mb-2 block">group_off</span>
                  <p>暂无协作者</p>
                  <p className="text-sm mt-1">请先在项目设置中添加协作者</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {collaborators.map((collab) => (
                    <div 
                      key={collab.id} 
                      className="flex items-center justify-between p-3 bg-slate-50 dark:bg-white/5 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        {collab.avatar ? (
                          <img src={collab.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-neutral-800 dark:bg-white flex items-center justify-center">
                            <span className="material-symbols-outlined text-white text-lg">person</span>
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-slate-800 dark:text-white">
                            {collab.nickname || '未命名用户'}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {collab.permission === 'EDIT' ? '可编辑分镜脚本' : '仅可查看'}
                          </div>
                        </div>
                      </div>
                      <select
                        value={collab.permission}
                        onChange={(e) => handleUpdatePermission(collab.userId, e.target.value as 'READ' | 'EDIT')}
                        className="px-3 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-800"
                      >
                        <option value="READ">只读</option>
                        <option value="EDIT">编辑</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
              <button
                onClick={() => {
                  setShowPermissionModal(false);
                  setSelectedEpisode(null);
                  setCollaborators([]);
                }}
                className="w-full py-2.5 bg-neutral-800 dark:bg-white text-white dark:text-black rounded-xl font-medium hover:shadow-lg transition-all"
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

const EpisodeCover: React.FC<{ thumbnail: string; name: string; episodeNumber: number }> = ({ thumbnail, name, episodeNumber }) => {
  const [candidates, setCandidates] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  
  useEffect(() => {
    setFailed(false);
    setIdx(0);
    if (!thumbnail) { setCandidates([]); return; }
    // 已经是绝对 URL
    if (thumbnail.startsWith('http') || thumbnail.startsWith('data:')) {
      setCandidates([thumbnail]); return;
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
  }, [thumbnail]);

  const current = candidates[idx] || null;
  
  // 显示 fallback：无 thumbnail、加载失败、或无有效候选
  if (!thumbnail || failed || !current) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-neutral-100 dark:bg-[#27272a]">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-neutral-400 dark:text-neutral-500 mb-2 block">movie</span>
          <div className="text-lg font-semibold text-neutral-500 dark:text-neutral-400">第 {episodeNumber} 集</div>
        </div>
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

export default EpisodesPage;
