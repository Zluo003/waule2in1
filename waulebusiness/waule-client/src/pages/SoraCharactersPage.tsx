import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { apiClient } from '../lib/api';

const API_URL = import.meta.env.VITE_API_URL || '';

interface SoraCharacter {
  id: string;
  customName: string;
  characterName: string;
  avatarUrl?: string;
  createdAt: string;
}

const SoraCharactersPage: React.FC = () => {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<SoraCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCharacter, setEditingCharacter] = useState<SoraCharacter | null>(null);
  const [editCharacterName, setEditCharacterName] = useState('');
  const [editingImageCharacter, setEditingImageCharacter] = useState<SoraCharacter | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    loadCharacters();
  }, []);

  const loadCharacters = async () => {
    try {
      setLoading(true);
      const response = await apiClient.soraCharacters.list({ limit: 1000 });
      setCharacters(response.characters || []);
    } catch (error) {
      console.error('加载角色失败:', error);
      toast.error('加载角色失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCharacterName = async () => {
    if (!editingCharacter || !editCharacterName.trim()) return;

    // 检查名称唯一性
    if (editCharacterName.trim() !== editingCharacter.customName) {
      try {
        const check = await apiClient.soraCharacters.getByCustomName(editCharacterName.trim());
        if (check?.character) {
          toast.error('该自定义名称已被使用');
          return;
        }
      } catch {
        // 404 表示名称可用
      }
    }

    try {
      await apiClient.soraCharacters.update(editingCharacter.id, {
        customName: editCharacterName.trim(),
      });
      toast.success('名称更新成功');
      setEditingCharacter(null);
      loadCharacters();
    } catch (error: any) {
      toast.error(error.response?.data?.error || '更新失败');
    }
  };

  const handleDeleteCharacter = async (id: string) => {
    if (!confirm('确定要删除这个角色吗？')) return;
    try {
      await apiClient.soraCharacters.delete(id);
      toast.success('角色删除成功');
      loadCharacters();
    } catch (error: any) {
      toast.error(error.response?.data?.error || '删除失败');
    }
  };

  const handleImageUpload = async (character: SoraCharacter, file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }

    setEditingImageCharacter(character);
    setUploadingImage(true);
    try {
      // 使用前端直传 OSS
      const uploadResponse = await apiClient.assets.upload(file);
      console.log('[SoraCharacters] 上传响应:', uploadResponse);
      const imageUrl = uploadResponse?.data?.url || uploadResponse?.url || uploadResponse?.asset?.url;

      if (!imageUrl) {
        console.error('[SoraCharacters] 无法获取图片URL，响应:', uploadResponse);
        throw new Error('上传失败：无法获取图片地址');
      }
      console.log('[SoraCharacters] 图片URL:', imageUrl);

      // 更新角色头像
      await apiClient.soraCharacters.update(character.id, {
        avatarUrl: imageUrl,
      });

      toast.success('角色图片更新成功');
      setEditingImageCharacter(null);
      loadCharacters();
    } catch (error: any) {
      toast.error(error.response?.data?.error || '图片上传失败');
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <div className="pr-8 pb-8">
      {/* 返回按钮 + 标题 - 固定在左上角 */}
      <div className="fixed top-4 left-[136px] z-40 flex items-center gap-4 h-[72px]">
        <button
          onClick={() => navigate('/assets')}
          className="w-10 h-10 flex items-center justify-center bg-white dark:bg-[#18181b] border border-neutral-200 dark:border-neutral-700 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black hover:border-transparent rounded-lg transition-all"
        >
          <span className="material-symbols-outlined text-neutral-600 dark:text-neutral-400" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>arrow_back</span>
        </button>
        <span className="text-2xl font-semibold text-neutral-900 dark:text-white font-display">Sora角色库</span>
      </div>

      {/* 角色列表 - 顶部留出header空间 */}
      <div className="pt-36">
        {loading ? (
          <div className="text-center py-12 text-slate-500 dark:text-gray-400">
            加载中...
          </div>
        ) : characters.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-24 h-24 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-neutral-400 dark:text-neutral-500 text-5xl">face</span>
            </div>
            <h2 className="text-xl font-bold text-neutral-800 dark:text-white mb-2">还没有角色</h2>
            <p className="text-neutral-500 dark:text-neutral-400 mb-6">在工作流中使用Sora角色生成节点创建角色</p>
            <button
              onClick={() => navigate('/workflow')}
              className="px-6 py-3 bg-black dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-200 text-white dark:text-black font-medium rounded-lg transition-all"
            >
              去创建角色
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {characters.map((character) => (
              <div
                key={character.id}
                className="group relative border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden hover:border-neutral-400 dark:hover:border-neutral-600 hover:shadow-lg transition-all duration-300"
                style={{ height: '320px' }}
              >
                {/* 头像区域 */}
                <div className="h-[80%] bg-neutral-100 dark:bg-neutral-900 flex items-start justify-center overflow-hidden relative">
                  {character.avatarUrl ? (
                    <img
                      src={character.avatarUrl.startsWith('http') ? character.avatarUrl : `${API_URL}${character.avatarUrl}`}
                      alt={character.customName}
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    <span className="material-symbols-outlined text-6xl text-neutral-300 dark:text-neutral-600 mt-8">face</span>
                  )}
                  
                  {/* 操作按钮 - 右上角 */}
                  <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <label
                      className="w-7 h-7 flex items-center justify-center bg-black/60 dark:bg-white/80 hover:bg-black dark:hover:bg-white text-white dark:text-black rounded-full shadow-md backdrop-blur-sm transition-all cursor-pointer"
                      title="更换图片"
                    >
                      <span className="material-symbols-outlined text-base">image</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleImageUpload(character, file);
                          }
                          e.target.value = ''; // 清空，允许重复选择同一文件
                        }}
                      />
                    </label>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCharacter(character);
                        setEditCharacterName(character.customName);
                      }}
                      className="w-7 h-7 flex items-center justify-center bg-black/60 dark:bg-white/80 hover:bg-black dark:hover:bg-white text-white dark:text-black rounded-full shadow-md backdrop-blur-sm transition-all"
                      title="编辑名称"
                    >
                      <span className="material-symbols-outlined text-base">edit</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCharacter(character.id);
                      }}
                      className="w-7 h-7 flex items-center justify-center bg-black/60 dark:bg-white/80 hover:bg-black dark:hover:bg-white text-white dark:text-black rounded-full shadow-md backdrop-blur-sm transition-all"
                      title="删除角色"
                    >
                      <span className="material-symbols-outlined text-base">delete</span>
                    </button>
                  </div>
                  
                  {/* 上传中遮罩 */}
                  {uploadingImage && editingImageCharacter?.id === character.id && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="text-white text-sm">上传中...</div>
                    </div>
                  )}
                </div>

                {/* 信息区域 */}
                <div className="h-[20%] px-3 py-2 flex flex-col justify-center">
                  {editingCharacter?.id === character.id ? (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={editCharacterName}
                        onChange={(e) => setEditCharacterName(e.target.value)}
                        className="flex-1 px-2 py-1 text-xs rounded border border-amber-300 dark:border-amber-600 bg-white dark:bg-black/50 text-slate-700 dark:text-white"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdateCharacterName();
                          if (e.key === 'Escape') setEditingCharacter(null);
                        }}
                      />
                      <button
                        onClick={handleUpdateCharacterName}
                        className="px-2 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => setEditingCharacter(null)}
                        className="px-2 py-1 text-xs bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-white rounded"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="font-bold text-sm text-slate-800 dark:text-white truncate">
                        {character.customName}
                      </div>
                      <div className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono truncate">
                        {character.characterName}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SoraCharactersPage;
