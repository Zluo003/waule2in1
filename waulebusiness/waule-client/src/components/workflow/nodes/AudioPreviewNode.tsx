import { memo, useEffect, useRef, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { NodeProps, Position } from 'reactflow';
import CustomHandle from '../CustomHandle';
import { useReactFlow } from 'reactflow';
import { toast } from 'sonner';
import { apiClient } from '../../../lib/api';
import { generateAssetName, findNodeGroup } from '../../../utils/assetNaming';
import { useTransformLocalServerUrl } from '../../../utils/assetUrlHelper';

interface AssetLibrary {
  id: string;
  name: string;
  description?: string;
  category?: 'ROLE' | 'SCENE' | 'PROP' | 'OTHER';
  _count: {
    assets: number;
  };
}

interface NodeData {
  audioUrl: string;
  sourceNodeId?: string;
  workflowContext?: {
    project?: any;
    episode?: any;
    nodeGroup?: any;
    nodeGroups?: any[];
  };
}

const AudioPreviewNode = ({ data, id }: NodeProps<NodeData>) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { getNode, setNodes } = useReactFlow();
  const location = useLocation();
  const isEpisodeWorkflow = !!((data as any)?.workflowContext?.episode) || location.pathname.includes('/episodes/');

  // 检查当前节点是否已添加到分镜素材（根据实际 mediaList 判断）
  useEffect(() => {
    const checkIfInMediaList = async () => {
      if (!isEpisodeWorkflow) return;
      try {
        const ctx = (data as any)?.workflowContext || {};
        const ep = ctx.episode;
        const sp = new URLSearchParams(window.location.search);
        const shot = Number(sp.get('shot')) || 1;
        const parts = location.pathname.split('/').filter(Boolean);
        const pIdx = parts.indexOf('projects');
        const eIdx = parts.indexOf('episodes');
        const projectId = ctx.project?.id || ep?.projectId || (pIdx >= 0 ? parts[pIdx + 1] : undefined);
        const episodeId = ep?.id || (eIdx >= 0 ? parts[eIdx + 1] : undefined);
        if (!projectId || !episodeId) return;
        
        const res = await apiClient.episodes.getById(projectId, episodeId);
        const root: any = (res as any)?.data ?? res;
        const episodeObj: any = (root as any)?.data ?? root;
        const acts: any[] = Array.isArray(episodeObj?.scriptJson?.acts) ? episodeObj.scriptJson.acts : [];
        const act = acts.find((a: any) => a.actIndex === 1);
        const shotItem = act?.shots?.find((s: any) => Number(s.shotIndex) === shot);
        const mediaList = Array.isArray(shotItem?.mediaList) ? shotItem.mediaList : [];
        const isInList = mediaList.some((m: any) => m?.nodeId === id);
        
        // 同步 addedToStoryboard 状态
        setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, addedToStoryboard: isInList } } : n));
      } catch {}
    };
    checkIfInMediaList();
  }, [id, isEpisodeWorkflow, location.pathname]);

  const [showLibrarySelector, setShowLibrarySelector] = useState(false);
  const [libraries, setLibraries] = useState<AssetLibrary[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'ROLE' | 'SCENE' | 'PROP' | 'OTHER'>('ALL');
  const [assetName, setAssetName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const apiBase = useMemo(() => window.location.origin, []);
  const transformUrl = useTransformLocalServerUrl();
  const computedSrc = useMemo(() => {
    const src = data.audioUrl || '';
    if (src.startsWith('blob:')) {
      const n = data.sourceNodeId ? getNode(data.sourceNodeId) as any : null;
      const out = n?.data?.outputUrl || '';
      if (out.startsWith('http')) return out;
      if (out.startsWith('/')) return `${apiBase}${out}`;
      return src;
    }
    // 先尝试转换本地服务器 URL
    const transformed = transformUrl(src);
    if (transformed !== src) return transformed;
    if (src.startsWith('http')) return `${apiBase}/api/assets/proxy-stream?url=${encodeURIComponent(src)}`;
    if (src.startsWith('/')) return `${apiBase}${src}`;
    return src;
  }, [data.audioUrl, data.sourceNodeId, apiBase, transformUrl]);
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.preload = 'auto';
    (a as any).playsInline = true;
    a.crossOrigin = 'anonymous';
    a.load();
  }, [computedSrc]);

  // 当打开资产库选择器时，加载资产库并生成名称
  useEffect(() => {
    if (showLibrarySelector) {
      loadLibraries();
      // 延迟到下一个事件循环，确保 React Flow 完全更新了节点数据
      setTimeout(() => {
        generateAutoName();
      }, 100);
    }
  }, [showLibrarySelector]);

  // 加载资产库列表
  const loadLibraries = async () => {
    try {
      const params = selectedCategory === 'ALL' ? undefined : { category: selectedCategory } as any;
      const response = await apiClient.assetLibraries.getAll(params);
      const libs = response.data || [];
      setLibraries(libs);
      const filtered = selectedCategory === 'ALL'
        ? libs
        : libs.filter((l: any) => (l.category || 'OTHER') === selectedCategory);
      if (filtered.length > 0) {
        const currentInFilter = filtered.find((l: any) => l.id === selectedLibraryId);
        setSelectedLibraryId(currentInFilter ? currentInFilter.id : filtered[0].id);
      } else {
        setSelectedLibraryId('');
      }
    } catch (error: any) {
      toast.error('加载资产库列表失败');
    }
  };

  // 生成自动命名（从全局变量读取）
  const generateAutoName = () => {
    // 直接从全局变量读取工作流上下文
    const context = (window as any).__workflowContext;

    if (!context || !context.project || !context.nodeGroups) {
      toast.warning('工作流信息未加载完成，请稍后再试');
      return;
    }

    // 查找当前节点所在的编组
    const nodeGroup = findNodeGroup(id, context.nodeGroups);

    // 如果没找到编组，检查是否有当前镜头的编组
    if (!nodeGroup && context.nodeGroups.length > 0) {
      const firstGroup = context.nodeGroups[0];
      
      // 使用第一个编组（在镜头工作流中，通常就是当前镜头的编组）
      const autoName = generateAssetName({
        project: context.project,
        episode: context.episode,
        nodeGroup: firstGroup,
        nodeId: id,
        assetType: 'audio',
      });
      
      if (autoName) {
        setAssetName(autoName);
        toast.success(`已自动生成资产名称：${autoName}`);
      } else {
        toast.warning('编组信息不完整，无法自动命名');
      }
      return;
    }

    // 生成名称
    const autoName = generateAssetName({
      project: context.project,
      episode: context.episode,
      nodeGroup,
      nodeId: id,
      assetType: 'audio',
    });

    if (autoName) {
      setAssetName(autoName);
      toast.success(`已自动生成资产名称：${autoName}`);
    } else {
      toast.warning('请先为编组命名（幕数-镜头数），才能自动命名');
    }
  };

  // 添加到资产库
  const handleAddToLibrary = async () => {
    if (!selectedLibraryId) {
      toast.error('请选择资产库');
      return;
    }

    if (!assetName.trim()) {
      toast.error('请输入资产名称');
      return;
    }

    try {
      setIsAdding(true);
      await apiClient.assetLibraries.addFromUrl(
        selectedLibraryId,
        data.audioUrl,
        assetName.trim()
      );
      
      // 添加成功后，真正递增计数器
      const context = (window as any).__workflowContext;
      if (context && context.project && context.nodeGroups) {
        const nodeGroup = findNodeGroup(id, context.nodeGroups) || context.nodeGroups[0];
        if (nodeGroup) {
          generateAssetName({
            project: context.project,
            episode: context.episode,
            nodeGroup,
            nodeId: id,
            assetType: 'audio',
            preview: false,
          });
        }
      }
      
      toast.success('已添加到资产库');
      setShowLibrarySelector(false);
      setAssetName('');
      try {
        setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, addedToLibrary: true } } : n));
      } catch { }
      try {
        const evt = new CustomEvent('asset-library-updated', { detail: { libraryId: selectedLibraryId } });
        window.dispatchEvent(evt);
      } catch { }
    } catch (error: any) {
      toast.error(error.response?.data?.message || '添加失败');
    } finally {
      setIsAdding(false);
    }
  };

  // 下载音频 - 使用自动生成的资产名称
  const handleDownload = async () => {
    // 生成下载文件名
    let fileName = `audio-${Date.now()}.mp3`;
    
    // 尝试使用自动命名
    const context = (window as any).__workflowContext;
    if (context && context.project && context.nodeGroups) {
      const nodeGroup = findNodeGroup(id, context.nodeGroups) || context.nodeGroups[0];
      if (nodeGroup) {
        const autoName = generateAssetName({
          project: context.project,
          episode: context.episode,
          nodeGroup,
          nodeId: id,
          assetType: 'audio',
          preview: true,
        });
        if (autoName) {
          fileName = autoName;
          // 确保有扩展名
          if (!fileName.includes('.')) {
            // 从URL获取扩展名
            const ext = data.audioUrl.match(/\.(mp3|wav|ogg|m4a|flac)$/i)?.[0] || '.mp3';
            fileName += ext;
          }
        }
      }
    }
    
    // Electron 环境使用专用下载方法
    if (window.electronAPI?.downloadFile) {
      try {
        toast.info('正在下载音频...');
        const result = await window.electronAPI.downloadFile(data.audioUrl, fileName);
        if (result.success) {
          toast.success(`音频下载成功：${fileName}`);
        } else if (result.message !== '用户取消下载') {
          toast.error(`下载失败: ${result.message}`);
        }
      } catch (error) {
        toast.error(`下载失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
      return;
    }
    
    // Web 环境使用后端代理下载
    try {
      toast.info('正在下载音频...');
      
      // 构建完整的下载 URL
      const API_URL = import.meta.env.VITE_API_URL || '';
      const baseUrl = API_URL ? `${API_URL}/api` : '/api';
      const downloadUrl = `${baseUrl}/assets/proxy-download-with-name?url=${encodeURIComponent(data.audioUrl)}&filename=${encodeURIComponent(fileName)}`;
      
      // 使用原生 fetch 避免 axios 拦截器问题
      const response = await fetch(downloadUrl);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`下载失败: HTTP ${response.status} ${errorText}`);
      }
      
      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 100);

      toast.success(`音频下载成功：${fileName}`);
    } catch (error) {
      toast.error(`下载失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  return (
    <div className="relative group" style={{ width: 360 }}>
      <CustomHandle
        type="target"
        position={Position.Left}
        id={`${id}-target`}
        isConnectable={false}
        className="!z-[10000] opacity-60 cursor-default"
      />
      
      {/* 音频容器 */}
      <div className="relative bg-white/80 dark:bg-black/60 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-xl shadow-xl overflow-hidden py-4 px-3">
        <audio ref={audioRef} controls src={computedSrc} className="w-full nodrag" />

        {/* 操作按钮（hover时显示） */}
        <div className="nodrag absolute bottom-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* 添加到分镜素材按钮 - 仅在剧集工作流中显示 */}
          {isEpisodeWorkflow && (
          <button
            onClick={async () => {
              try {
                const url = data.audioUrl;
                const ctx = data.workflowContext || {};
                const ep = ctx.episode;
                // 从 URL 参数获取 shot
                const sp = new URLSearchParams(window.location.search);
                const shot = Number(sp.get('shot')) || 1;
                // 从 URL 路径获取 projectId 和 episodeId
                const parts = location.pathname.split('/').filter(Boolean);
                const pIdx = parts.indexOf('projects');
                const eIdx = parts.indexOf('episodes');
                const projectId = ctx.project?.id || ep?.projectId || (pIdx >= 0 ? parts[pIdx + 1] : undefined);
                const episodeId = ep?.id || (eIdx >= 0 ? parts[eIdx + 1] : undefined);
                if (!projectId || !episodeId) {
                  toast.error('缺少剧集上下文，无法写回分镜');
                  return;
                }
                const res = await apiClient.episodes.getById(projectId, episodeId);
                const root: any = (res as any)?.data ?? res;
                const episodeObj: any = (root as any)?.data ?? root;
                // 使用 acts 结构（与 EpisodeDetailPage 保持一致）
                let acts: any[] = Array.isArray(episodeObj?.scriptJson?.acts) ? [...episodeObj.scriptJson.acts] : [];
                let act = acts.find((a: any) => a.actIndex === 1);
                if (!act) { act = { actIndex: 1, shots: [] }; acts.push(act); }
                act.shots = Array.isArray(act.shots) ? [...act.shots] : [];
                let shotItem = act.shots.find((s: any) => Number(s.shotIndex) === shot);
                if (!shotItem) { 
                  shotItem = { shotIndex: shot, mediaList: [] }; 
                  act.shots.push(shotItem); 
                }
                const list = Array.isArray(shotItem.mediaList) ? shotItem.mediaList.slice() : [];
                // 获取音频时长
                const duration = audioRef.current?.duration || 0;
                list.push({ type: 'audio', url, nodeId: id, duration });
                shotItem.mediaList = list;
                const scriptJson = { ...(episodeObj.scriptJson || {}), acts };
                await apiClient.episodes.update(projectId, episodeId, { scriptJson });
                
                // 标记为已添加到分镜脚本
                try {
                  setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, addedToStoryboard: true } } : n));
                } catch { }
                
                toast.success('已添加到分镜素材');
              } catch (e: any) {
                toast.error(e?.message || '添加到分镜素材失败');
              }
            }}
            className={`w-7 h-7 flex items-center justify-center ${(data as any)?.addedToStoryboard ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/90 dark:to-pink-600/90'} hover:shadow-lg text-white rounded-full transition-all backdrop-blur-sm shadow-md active:scale-95 relative`}
            title={(data as any)?.addedToStoryboard ? '已添加到分镜素材' : '添加到分镜素材'}
            disabled={(data as any)?.addedToStoryboard}
          >
            <span className="material-symbols-outlined text-sm">playlist_add</span>
            {(data as any)?.addedToStoryboard && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-green-600 leading-none" style={{ fontVariationSettings: '"FILL" 1, "wght" 300', fontSize: '10px' }}>check_circle</span>
              </span>
            )}
          </button>
          )}
          {/* 添加到资产库按钮 - 已添加后变绿色+对钩+禁用 */}
          <button
            onClick={() => {
              setShowLibrarySelector(true);
            }}
            className={`w-7 h-7 flex items-center justify-center ${(data as any)?.addedToLibrary ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/90 dark:to-pink-600/90'} hover:shadow-lg text-white rounded-full transition-all backdrop-blur-sm shadow-md active:scale-95 relative`}
            title={(data as any)?.addedToLibrary ? '已添加到资产库' : '添加到资产库'}
            disabled={(data as any)?.addedToLibrary}
          >
            <span className="material-symbols-outlined text-sm">audio_file</span>
            {(data as any)?.addedToLibrary && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-green-600 leading-none" style={{ fontVariationSettings: '"FILL" 1, "wght" 300', fontSize: '10px' }}>check_circle</span>
              </span>
            )}
          </button>
          <button
            onClick={handleDownload}
            className="w-7 h-7 flex items-center justify-center bg-slate-800/90 dark:bg-slate-700/90 hover:bg-slate-900 dark:hover:bg-slate-600 text-white rounded-full transition-all backdrop-blur-sm shadow-md active:scale-95"
            title="下载音频"
          >
            <span className="material-symbols-outlined text-sm">download</span>
          </button>
        </div>
      </div>

      {/* 选择资产库弹窗 - 使用 Portal 渲染到 body，避免被编组遮挡 */}
      {showLibrarySelector && createPortal(
        <div className="nodrag fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-text-dark-primary">
                添加到资产库
              </h3>
              <button
                onClick={() => setShowLibrarySelector(false)}
                className="p-1.5 rounded-md text-slate-400 dark:text-text-dark-secondary hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <div className="space-y-4">
              {/* 资产名称 */}
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-text-dark-secondary mb-2">
                  资产名称 *
                </label>
                <input
                  type="text"
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-text-dark-primary placeholder-slate-400 dark:placeholder-text-dark-secondary focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="输入资产名称"
                  maxLength={200}
                />
              </div>

              {/* 选择资产库 */}
              <div className="min-h-[72px]">
                <label className="block text-sm font-medium text-slate-600 dark:text-text-dark-secondary mb-2">
                  选择资产库 *
                </label>
                {(() => {
                  const filtered = selectedCategory === 'ALL'
                    ? libraries
                    : libraries.filter((l) => (l.category || 'OTHER') === selectedCategory);
                  if (filtered.length === 0) {
                    return (
                      <div className="text-sm text-slate-600 dark:text-text-dark-secondary">
                        {selectedCategory === 'ALL' ? '暂无资产库，请先创建' : '该类型暂无资产库'}
                      </div>
                    );
                  }
                  return (
                    <select
                      value={selectedLibraryId}
                      onChange={(e) => setSelectedLibraryId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-text-dark-primary focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      {filtered.map((lib) => (
                        <option key={lib.id} value={lib.id}>
                          {lib.name} ({lib._count.assets} 个资产)
                        </option>
                      ))}
                    </select>
                  );
                })()}
              </div>

              {/* 库类型选择 */}
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-text-dark-secondary mb-2">
                  库类型
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(['ROLE', 'SCENE', 'PROP', 'OTHER'] as const).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(cat);
                        const filtered = libraries.filter((l) => (l.category || 'OTHER') === cat);
                        setSelectedLibraryId(filtered.length > 0 ? filtered[0].id : '');
                      }}
                      className={`px-3 py-2 rounded-lg border transition-all text-left ${selectedCategory === cat ? 'border-purple-500 bg-purple-500/10 dark:bg-purple-500/20' : 'border-slate-200 dark:border-border-dark hover:border-purple-400 dark:hover:border-purple-500'
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-slate-600 dark:text-text-dark-secondary">
                          {cat === 'ROLE' ? 'person' : cat === 'SCENE' ? 'landscape' : cat === 'PROP' ? 'inventory_2' : 'widgets'}
                        </span>
                        <span className="font-medium text-slate-900 dark:text-text-dark-primary">
                          {cat === 'ROLE' ? '角色库' : cat === 'SCENE' ? '场景库' : cat === 'PROP' ? '道具库' : '分镜资产'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowLibrarySelector(false)}
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-background-dark text-slate-900 dark:text-text-dark-primary rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 transition-all border border-slate-200 dark:border-border-dark"
                >
                  取消
                </button>
                <button
                  onClick={handleAddToLibrary}
                  disabled={isAdding || libraries.length === 0 || !assetName.trim()}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600 dark:to-pink-600 hover:shadow-lg text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAdding ? '添加中...' : '确认添加'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      <CustomHandle
        type="source"
        position={Position.Right}
        id={`${id}-source`}
        isConnectable={false}
        className="!z-[10000] opacity-60 cursor-default"
      />
    </div>
  );
};

export default memo(AudioPreviewNode);
