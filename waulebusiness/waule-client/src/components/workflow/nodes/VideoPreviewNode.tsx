import { memo, useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Position, NodeProps, useReactFlow } from 'reactflow';
import { toast } from 'sonner';
import { apiClient } from '../../../lib/api';
import CustomHandle from '../CustomHandle';
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

interface VideoPreviewNodeData {
  videoUrl: string;
  width?: number;
  height?: number;
  ratio?: string;
  resolution?: string; // 分辨率标识（HD, 2K, 4K, 8K）
  workflowContext?: {
    project?: any;
    episode?: any;
    nodeGroup?: any;
    nodeGroups?: any[];
  };
}

const VideoPreviewNode = ({ data, id }: NodeProps<VideoPreviewNodeData>) => {
  const API_URL = import.meta.env.VITE_API_URL || '';
  const transformUrl = useTransformLocalServerUrl();
  
  // 转换视频 URL，确保使用当前配置的本地服务器地址
  const videoUrl = useMemo(() => {
    const url = data.videoUrl;
    if (!url) return '';
    // 先尝试转换本地服务器 URL
    const transformed = transformUrl(url);
    if (transformed !== url) return transformed;
    // 如果不是本地服务器 URL，使用原有逻辑
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    return `${API_URL}${url}`;
  }, [data.videoUrl, transformUrl, API_URL]);
  const [showLibrarySelector, setShowLibrarySelector] = useState(false);
  const [libraries, setLibraries] = useState<AssetLibrary[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'ROLE' | 'SCENE' | 'PROP' | 'AUDIO' | 'OTHER'>('ALL');
  const [assetName, setAssetName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const { setNodes } = useReactFlow();

  const [containerWidth] = useState(data.width || 400);  // 使用传入的 width 或默认 400
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const location = useLocation();
  const isEpisodeWorkflow = !!((data as any)?.workflowContext?.episode) || location.pathname.includes('/episodes/');

  // 检查当前节点是否已添加到分镜素材（根据实际 mediaList 判断）
  useEffect(() => {
    const checkIfInMediaList = async () => {
      if (!isEpisodeWorkflow) return;
      try {
        const ctx = (data as any)?.workflowContext || {};
        const ep = ctx.episode;
        // 优先从 nodeGroup 获取 scene 和 shot
        let nodeGroup = ctx.nodeGroup;
        if (!nodeGroup && ctx.nodeGroups) {
          nodeGroup = ctx.nodeGroups.find((g: any) => g.nodeIds?.includes(id));
        }
        if (!nodeGroup && (window as any).__workflowContext?.nodeGroups) {
          nodeGroup = (window as any).__workflowContext.nodeGroups.find((g: any) => g.nodeIds?.includes(id));
        }
        const sp = new URLSearchParams(window.location.search);
        const scene = Number(nodeGroup?.scene) || Number(sp.get('scene')) || 1;
        const shot = Number(nodeGroup?.shot) || Number(sp.get('shot')) || 1;
        const shotId = nodeGroup?.shotId || sp.get('shotId') || '';
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
        const act = acts.find((a: any) => Number(a.actIndex) === scene);
        // 优先使用 shotId 查找分镜
        const shotItem = act?.shots?.find((s: any) =>
          shotId ? s.shotId === shotId : Number(s.shotIndex) === shot
        );
        const mediaList = Array.isArray(shotItem?.mediaList) ? shotItem.mediaList : [];
        const isInList = mediaList.some((m: any) => m?.nodeId === id);

        // 同步 addedToStoryboard 状态
        setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, addedToStoryboard: isInList } } : n));
      } catch {}
    };
    checkIfInMediaList();
  }, [id, isEpisodeWorkflow, location.pathname]);

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

  useEffect(() => {
    const el = videoElRef.current;
    if (!el) return;
    const onMeta = () => {
      const vw = el.videoWidth || 0;
      const vh = el.videoHeight || 0;
      if (vw > 0 && vh > 0) {
        const aspect = vw / vh;
        setContainerHeight(Math.round(containerWidth / aspect));
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    return () => { 
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
    };
  }, [containerWidth, data.videoUrl]);

  // 播放/暂停切换
  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = videoElRef.current;
    if (!el) return;
    if (el.paused) {
      el.play();
    } else {
      el.pause();
    }
  };

  useEffect(() => {
    try {
      const suppressedRaw = localStorage.getItem('suppressedPreviewTasks') || '[]';
      const suppressed: Array<{ sourceNodeId?: string; taskId?: string; messageId?: string }> = JSON.parse(suppressedRaw);
      const pending: any = (data as any)?.pendingButtonAction;
      if (pending) {
        const isSuppressed = suppressed.some(s => (
          (s.taskId && s.taskId === pending.newTaskId) ||
          (s.sourceNodeId && s.sourceNodeId === pending.sourceNodeId)
        ));
        if (isSuppressed) {
          setShowLibrarySelector(false);
          return;
        }
      }
    } catch {}
  }, []);

  const loadLibraries = async () => {
    try {
      const response = await apiClient.assetLibraries.getAll({ includeShared: 'true' });
      setLibraries(response.data);
      if (response.data.length > 0) {
        setSelectedLibraryId(response.data[0].id);
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
        assetType: 'video',
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
      assetType: 'video',
    });

    if (autoName) {
      setAssetName(autoName);
      toast.success(`已自动生成资产名称：${autoName}`);
    } else {
      toast.warning('请先为编组命名（幕数-镜头数），才能自动生成资产名称');
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
        data.videoUrl,
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
            assetType: 'video',
            preview: false,
          });
        }
      }
      
      toast.success('已添加到资产库');
      setShowLibrarySelector(false);
      setAssetName('');
      try {
        setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, addedToLibrary: true } } : n));
      } catch {}
      try {
        const evt = new CustomEvent('asset-library-updated', { detail: { libraryId: selectedLibraryId } });
        window.dispatchEvent(evt);
      } catch {}
    } catch (error: any) {
      toast.error(error.response?.data?.message || '添加失败');
    } finally {
      setIsAdding(false);
    }
  };

  // 下载视频 - 使用自动生成的资产名称
  const handleDownload = async () => {
    try {
      const videoUrl = data.videoUrl;
      
      // 生成下载文件名
      let fileName = `video-${Date.now()}.mp4`;
      
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
            assetType: 'video',
            preview: true,
          });
          if (autoName) {
            fileName = autoName;
            // 确保有扩展名
            if (!fileName.includes('.')) {
              // 从URL获取扩展名
              const ext = videoUrl.match(/\.(mp4|mov|avi|webm)$/i)?.[0] || '.mp4';
              fileName += ext;
            }
          }
        }
      }
      
      // Electron 环境使用专用下载方法
      if (window.electronAPI?.downloadFile) {
        toast.info('正在下载视频...');
        const result = await window.electronAPI.downloadFile(videoUrl, fileName);
        if (result.success) {
          toast.success(`视频下载成功：${fileName}`);
        } else if (result.message !== '用户取消下载') {
          toast.error(`下载失败: ${result.message}`);
        }
        return;
      }
      
      // Web 环境使用后端代理下载
      toast.info('正在下载视频...');
      
      // 构建完整的下载 URL
      const API_URL = import.meta.env.VITE_API_URL || '';
      const baseUrl = API_URL ? `${API_URL}/api` : '/api';
      const downloadUrl = `${baseUrl}/assets/proxy-download-with-name?url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent(fileName)}`;
      
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

      toast.success(`视频下载成功：${fileName}`);
    } catch (error) {
      toast.error(`操作失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  return (
    <div className="relative group" style={{ width: containerWidth }}>
      <CustomHandle
        type="target"
        position={Position.Left}
        id={`${id}-target`}
        isConnectable={false}
        className="!z-[10000] opacity-60 cursor-default"
      />
      <div className="relative bg-white/80 dark:bg-[#18181b]/100 dark:backdrop-blur-none backdrop-blur-sm border border-slate-200 dark:border-neutral-800 rounded-xl shadow-xl overflow-hidden">
      {/* 拖动遮罩 + 播放按钮 */}
      <div 
        className="absolute inset-0 z-10 cursor-move flex items-center justify-center"
      >
        {/* 中央播放/暂停按钮 - nodrag 确保可以点击 */}
        <button
          className={`nodrag w-16 h-16 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-all dark:backdrop-blur-none backdrop-blur-sm ${isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}
          onClick={togglePlay}
        >
          <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: '"FILL" 1' }}>
            {isPlaying ? 'pause' : 'play_arrow'}
          </span>
        </button>
      </div>
      <video
        ref={videoElRef}
        src={videoUrl}
        className="nodrag block w-full h-auto"
        style={{ 
          width: '100%',
          height: containerHeight ? `${containerHeight}px` : 'auto',
          objectFit: 'cover',
        }}
        playsInline
      />

      {/* 分辨率标识 */}
      {data.resolution && (
        <div className="absolute top-2 right-2 px-2 py-0.5 bg-neutral-800 dark:bg-white  rounded text-[10px] font-bold text-white dark:text-black shadow-lg dark:backdrop-blur-none backdrop-blur-sm z-10">
          {data.resolution}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="nodrag absolute bottom-2 right-2 flex gap-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        {isEpisodeWorkflow && (
        <button
          onClick={async () => {
            try {
              const url = data.videoUrl;
              const ctx = data.workflowContext || {};
              const ep = ctx.episode;
              // 优先从 URL 参数获取，如果没有则从 nodeGroup 获取
              const sp = new URLSearchParams(window.location.search);
              let scene = Number(sp.get('scene')) || 0;
              let shot = Number(sp.get('shot')) || 0;
              let shotId = sp.get('shotId') || '';
              // 如果 URL 没有参数，从 nodeGroup 获取
              if (!scene || !shot) {
                let nodeGroup = ctx.nodeGroup;
                if (!nodeGroup && ctx.nodeGroups) {
                  nodeGroup = ctx.nodeGroups.find((g: any) => g.nodeIds?.includes(id));
                }
                if (!nodeGroup && (window as any).__workflowContext?.nodeGroups) {
                  nodeGroup = (window as any).__workflowContext.nodeGroups.find((g: any) => g.nodeIds?.includes(id));
                }
                scene = Number(nodeGroup?.scene) || 1;
                shot = Number(nodeGroup?.shot) || 1;
                shotId = nodeGroup?.shotId || '';
              }
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
              let act = acts.find((a: any) => Number(a.actIndex) === scene);
              if (!act) { act = { actIndex: scene, shots: [] }; acts.push(act); }
              act.shots = Array.isArray(act.shots) ? [...act.shots] : [];
              // 优先使用 shotId 查找分镜
              let shotItem = act.shots.find((s: any) =>
                shotId ? s.shotId === shotId : Number(s.shotIndex) === shot
              );
              if (!shotItem) {
                shotItem = { shotIndex: shot, shotId: shotId || undefined, mediaList: [] };
                act.shots.push(shotItem);
              }
              const list = Array.isArray(shotItem.mediaList) ? shotItem.mediaList.slice() : [];
              // 获取视频时长
              const duration = videoElRef.current?.duration || 0;
              list.push({ type: 'video', url, nodeId: id, duration });
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
          className={`w-7 h-7 flex items-center justify-center ${(data as any)?.addedToStoryboard ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-neutral-800 dark:bg-white '} hover:shadow-lg text-white dark:text-black rounded-full transition-all dark:backdrop-blur-none backdrop-blur-sm shadow-md active:scale-95 relative`}
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
          className={`w-7 h-7 flex items-center justify-center ${(data as any)?.addedToLibrary ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-neutral-800 dark:bg-white '} hover:shadow-lg text-white dark:text-black rounded-full transition-all dark:backdrop-blur-none backdrop-blur-sm shadow-md active:scale-95 relative`}
          title={(data as any)?.addedToLibrary ? '已添加到资产库' : '添加到资产库'}
          disabled={(data as any)?.addedToLibrary}
        >
          <span className="material-symbols-outlined text-sm">video_library</span>
          {(data as any)?.addedToLibrary && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-green-600 leading-none" style={{ fontVariationSettings: '"FILL" 1, "wght" 300', fontSize: '10px' }}>check_circle</span>
            </span>
          )}
        </button>
        <button
          onClick={handleDownload}
          className="w-7 h-7 flex items-center justify-center bg-slate-800/90 dark:bg-slate-700/90 hover:bg-slate-900 dark:hover:bg-slate-600 text-white rounded-full transition-all dark:backdrop-blur-none backdrop-blur-sm shadow-md active:scale-95"
          title="下载视频"
        >
          <span className="material-symbols-outlined text-sm">download</span>
        </button>
      </div>
      </div>

      {/* 选择资产库弹窗 - 使用 Portal 渲染到 body，避免被编组遮挡 */}
      {showLibrarySelector && createPortal(
        <div className="nodrag fixed inset-0 bg-black/60 dark:backdrop-blur-none backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-text-dark-primary">
                添加到资产库
              </h3>
              <button
                onClick={() => setShowLibrarySelector(false)}
                className="p-1.5 rounded-md text-slate-400 dark:text-text-dark-secondary hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
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
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-text-dark-primary placeholder-slate-400 dark:placeholder-text-dark-secondary focus:outline-none focus:ring-2 focus:ring-neutral-500"
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
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-text-dark-primary focus:outline-none focus:ring-2 focus:ring-neutral-500"
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
                <div className="flex gap-1.5">
                  {(['ROLE', 'SCENE', 'PROP', 'AUDIO', 'OTHER'] as const).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(cat);
                        const filtered = libraries.filter((l) => (l.category || 'OTHER') === cat);
                        setSelectedLibraryId(filtered.length > 0 ? filtered[0].id : '');
                      }}
                      className={`flex-1 px-1.5 py-1.5 rounded-lg border transition-all ${selectedCategory === cat ? 'border-neutral-500 bg-neutral-500/10 dark:bg-neutral-500/20' : 'border-slate-200 dark:border-border-dark hover:border-neutral-400 dark:hover:border-neutral-500'
                        }`}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="material-symbols-outlined text-sm text-slate-600 dark:text-text-dark-secondary">
                          {cat === 'ROLE' ? 'person' : cat === 'SCENE' ? 'landscape' : cat === 'PROP' ? 'inventory_2' : cat === 'AUDIO' ? 'music_note' : 'widgets'}
                        </span>
                        <span className="text-xs text-slate-900 dark:text-text-dark-primary">
                          {cat === 'ROLE' ? '角色' : cat === 'SCENE' ? '场景' : cat === 'PROP' ? '道具' : cat === 'AUDIO' ? '音频' : '其他'}
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
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-background-dark text-slate-900 dark:text-text-dark-primary rounded-lg hover:bg-slate-200 dark:hover:bg-neutral-800 transition-all border border-slate-200 dark:border-border-dark"
                >
                  取消
                </button>
                <button
                  onClick={handleAddToLibrary}
                  disabled={isAdding || libraries.length === 0 || !assetName.trim()}
                  className="flex-1 px-4 py-2 bg-neutral-800 dark:bg-white  hover:shadow-lg text-white dark:text-black rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
      />
    </div>
  );
};

export default memo(VideoPreviewNode);
