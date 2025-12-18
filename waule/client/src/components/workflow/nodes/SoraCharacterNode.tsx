import NodeCreatorBadge from '../NodeCreatorBadge';
import { memo, useState, useEffect, useMemo, useCallback } from 'react';
import { Position, NodeProps, useReactFlow, useEdges, useNodes } from 'reactflow';
import { toast } from 'sonner';
import { apiClient } from '../../../lib/api';
import CustomHandle from '../CustomHandle';
import { useBillingEstimate } from '../../../hooks/useBillingEstimate';

const API_URL = import.meta.env.VITE_API_URL || '';

interface AIModel {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  type: string;
  config: {
    supportedRatios?: string[];
    supportedDurations?: number[];
    acceptedInputs?: string[];
  };
}

interface SoraCharacterNodeData {
  label: string;
  type: string;
  models?: AIModel[];
  isExpanded?: boolean;
  config: {
    modelId?: string;
    customName?: string;
    characterName?: string;
    avatarUrl?: string;
    taskId?: string;
    sourceVideoUrl?: string;
  };
}

interface CreatedCharacter {
  id: string;
  customName: string;
  characterName: string;
  avatarUrl?: string;
}

const SoraCharacterNode = ({ data, selected, id }: NodeProps<SoraCharacterNodeData>) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [customName, setCustomName] = useState(data.config.customName || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [taskId, setTaskId] = useState(data.config.taskId || '');
  const [createdCharacter, setCreatedCharacter] = useState<CreatedCharacter | null>(null);

  // 积分估算（按次计费）
  const { credits, loading: creditsLoading } = useBillingEstimate({
    nodeType: 'sora_character',
  });

  const { setNodes, getNode, setEdges } = useReactFlow();
  const edges = useEdges();
  const allNodes = useNodes(); // 监听节点变化以更新视频输入状态

  // 检查源节点是否提供视频
  const isVideoSource = useCallback((sourceNode: any): boolean => {
    if (!sourceNode) return false;
    const t = sourceNode.type || '';
    const cfg = (sourceNode.data as any)?.config || {};

    // 上传节点 - 检查是否有视频文件
    if (t === 'upload') {
      const files = cfg.uploadedFiles || cfg.files || [];
      return files.some((f: any) => {
        const mime = (f.mimeType || f.type || '').toLowerCase();
        return mime.startsWith('video/');
      });
    }

    // 视频预览节点
    if (t === 'videoPreview') {
      return !!cfg.url;
    }

    // 资源选择器节点 - 检查是否选择了视频
    if (t === 'assetSelector') {
      const asset = cfg.selectedAsset;
      const mime = (asset?.mimeType || '').toLowerCase();
      return mime.startsWith('video/') && !!asset?.url;
    }

    // AI视频节点 - 检查是否已生成视频
    if (t.startsWith('aiVideo') || t === 'soraVideo') {
      return !!cfg.generatedVideoUrl;
    }

    // 其它类型一律不接受
    return false;
  }, []);

  // 验证并清理连接 - 只保留1个有效的视频连接
  useEffect(() => {
    const incoming = edges.filter(e => e.target === id);
    if (incoming.length === 0) return;

    const validVideoEdges: string[] = [];
    const invalidEdges: string[] = [];

    for (const edge of incoming) {
      const sourceNode = allNodes.find(n => n.id === edge.source) || getNode(edge.source);
      if (isVideoSource(sourceNode)) {
        validVideoEdges.push(edge.id);
      } else {
        invalidEdges.push(edge.id);
      }
    }

    // 如果有多个视频连接，只保留第一个
    if (validVideoEdges.length > 1) {
      invalidEdges.push(...validVideoEdges.slice(1));
      toast.error('角色生成器只接受1个视频输入');
    }

    // 如果有无效连接，断开它们
    if (invalidEdges.length > 0) {
      setEdges((eds) => eds.filter(e => !invalidEdges.includes(e.id)));
      if (invalidEdges.length > 0 && validVideoEdges.length <= 1) {
        const hasNonVideo = incoming.some(e => {
          const src = allNodes.find(n => n.id === e.source) || getNode(e.source);
          return !isVideoSource(src);
        });
        if (hasNonVideo) {
          toast.error('角色生成器只接受视频输入');
        }
      }
    }
  }, [edges, id, allNodes, getNode, setEdges, isVideoSource]);
  
  // 强制重新计算的触发器 - 当连接的节点内容变化时
  const connectedNodeData = useMemo(() => {
    const incoming = edges.filter(e => e.target === id);
    return incoming.map(e => {
      const node = allNodes.find(n => n.id === e.source);
      return (node?.data as any)?.config;
    });
  }, [edges, id, allNodes]);

  // 筛选 Sora 模型
  const videoModels = useMemo(() => {
    const all = (data.models || []);
    return all.filter(m => m.type === 'VIDEO_GENERATION' && m.provider?.toLowerCase() === 'sora');
  }, [data.models]);

  // 角色创建固定使用 sora-video-landscape-10s 模型
  const soraModelId = videoModels.find(m => (m as any).modelId?.includes('landscape-10s'))?.id || videoModels[0]?.id || '';

  // 更新节点数据
  const updateNodeData = useCallback((updates: Partial<SoraCharacterNodeData['config']>) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              config: {
                ...node.data.config,
                ...updates,
              },
            },
          };
        }
        return node;
      })
    );
  }, [id, setNodes]);

  // 恢复已创建的角色（仅在页面加载时，不在生成过程中）
  useEffect(() => {
    if (data.config.characterName && data.config.customName && !isGenerating) {
      setCreatedCharacter({
        id: '',
        customName: data.config.customName,
        characterName: data.config.characterName,
        avatarUrl: data.config.avatarUrl,
      });
      setCustomName(data.config.customName);
    }
  }, [data.config.characterName, data.config.customName, data.config.avatarUrl, isGenerating]);

  // 获取视频输入信息（URL和缩略图）
  const videoInputInfo = useMemo(() => {
    // 使用connectedNodeData触发重新计算
    void connectedNodeData;
    
    const incoming = edges.filter(e => e.target === id);
    
    for (const edge of incoming) {
      // 优先使用 allNodes，回退到 getNode
      const sourceNode = allNodes.find(n => n.id === edge.source) || getNode(edge.source);
      if (!sourceNode) continue;

      const t = sourceNode.type || '';
      const cfg = (sourceNode.data as any)?.config || {};

      // 上传节点 - 使用 uploadedFiles
      if (t === 'upload') {
        const files = cfg.uploadedFiles || cfg.files || [];
        const video = files.find((f: any) => {
          const mime = (f.mimeType || f.type || '').toLowerCase();
          return mime.startsWith('video/');
        });
        if (video?.url) {
          return { url: video.url, thumbnail: video.thumbnail || video.url, name: video.name || video.originalName || '视频' };
        }
      }

      // 视频预览节点
      if (t === 'videoPreview') {
        if (cfg.url) {
          return { url: cfg.url, thumbnail: cfg.thumbnail || cfg.url, name: cfg.name || '视频' };
        }
      }

      // 资源选择器节点
      if (t === 'assetSelector') {
        const asset = cfg.selectedAsset;
        const mime = (asset?.mimeType || '').toLowerCase();
        if (mime.startsWith('video/') && asset?.url) {
          return { url: asset.url, thumbnail: asset.thumbnail || asset.url, name: asset.name || '视频' };
        }
      }

      // AI视频节点
      if (t.startsWith('aiVideo') || t === 'soraVideo') {
        if (cfg.generatedVideoUrl) {
          return { url: cfg.generatedVideoUrl, thumbnail: cfg.generatedVideoUrl, name: '生成视频' };
        }
      }
    }
    return null;
  }, [edges, id, allNodes, connectedNodeData, getNode]);

  // 检查是否有视频输入
  const hasVideoInput = !!videoInputInfo;

  // 轮询任务状态
  const pollTaskStatus = async (taskId: string) => {
    const maxAttempts = 600;
    let attempts = 0;

    const poll = async () => {
      try {
        attempts++;
        const response = await apiClient.tasks.getTaskStatus(taskId);
        const task = response.task;

        setGenerationProgress(task.progress || 0);

        if (task.status === 'SUCCESS' || task.status === 'COMPLETED' || task.status === 'DONE') {
          setIsGenerating(false);
          setGenerationProgress(100);

          // 解析角色信息（从task.metadata或resultUrl）
          const metadata = task.metadata || {};
          const characterName = metadata.characterName || '';
          const avatarUrl = metadata.avatarUrl || task.resultUrl || '';

          console.log('[SoraCharacterNode] 任务完成，metadata:', metadata);
          console.log('[SoraCharacterNode] characterName:', characterName, 'avatarUrl:', avatarUrl);

          if (!characterName) {
            toast.error('未能获取角色名称');
            updateNodeData({ taskId: '' });
            setTaskId('');
            return;
          }

          // 保存角色到数据库
          try {
            const result = await apiClient.soraCharacters.create({
              customName: customName || characterName,
              characterName,
              avatarUrl,
              sourceVideoUrl: videoInputInfo?.url || undefined,
            });

            const character = result.character;
            setCreatedCharacter({
              id: character.id,
              customName: character.customName,
              characterName: character.characterName,
              avatarUrl: character.avatarUrl,
            });

            updateNodeData({
              customName: character.customName,
              characterName: character.characterName,
              avatarUrl: character.avatarUrl,
              taskId: '',
            });

            toast.success(`角色创建成功: ${character.customName}`);
          } catch (saveError: any) {
            console.error('保存角色失败:', saveError);
            // 即使保存失败也显示结果
            setCreatedCharacter({
              id: '',
              customName: customName || characterName,
              characterName,
              avatarUrl,
            });
            toast.error(`角色创建成功但保存失败: ${saveError.message}`);
          }

          setTaskId('');
          setTimeout(() => setGenerationProgress(0), 1000);
          return;
        } else if (task.status === 'FAILURE') {
          console.error('角色创建失败:', task.errorMessage);
          setIsGenerating(false);
          setGenerationProgress(0);
          updateNodeData({ taskId: '' });
          toast.error(task.errorMessage || '角色创建失败');
          return;
        } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
          if (attempts < maxAttempts) {
            setTimeout(poll, 1000);
          } else {
            setIsGenerating(false);
            setGenerationProgress(0);
            updateNodeData({ taskId: '' });
            toast.error('创建超时');
          }
        }
      } catch (error: any) {
        console.error('轮询失败:', error);
        setIsGenerating(false);
        setGenerationProgress(0);
        updateNodeData({ taskId: '' });
        toast.error('查询状态失败');
      }
    };

    poll();
  };

  // 生成角色
  const handleGenerate = async () => {
    if (!videoInputInfo) {
      toast.error('请先连接视频输入');
      return;
    }

    if (!customName.trim()) {
      toast.error('请输入角色自定义名称');
      return;
    }

    if (!soraModelId) {
      toast.error('Sora模型未配置');
      return;
    }

    const videoUrl = videoInputInfo.url;
    if (!videoUrl) {
      toast.error('未找到视频输入');
      return;
    }

    // 检查自定义名称是否已存在（静默检查，不显示网络错误）
    try {
      const existingCheck = await apiClient.soraCharacters.getByCustomName(customName.trim());
      if (existingCheck?.character) {
        toast.error(`自定义名称"${customName.trim()}"已被使用，请更换名称`);
        return;
      }
    } catch {
      // 404 或其他错误都表示名称可用，静默忽略
    }

    setIsGenerating(true);
    setGenerationProgress(5);
    setCreatedCharacter(null); // 清除旧的角色信息

    try {
      // 创建角色生成任务（不带prompt，只有视频）
      const response = await apiClient.tasks.createVideoTask({
        modelId: soraModelId,
        prompt: '', // 角色创建不需要prompt
        ratio: '16:9',
        referenceImages: [videoUrl], // 视频作为参考
        generationType: '角色创建',
        sourceNodeId: id,
        metadata: {
          isCharacterCreation: true,
          customName: customName.trim(),
          referenceType: 'video', // 标记为视频输入
          nodeType: 'sora_character', // 用于节点计费
        },
      });

      const newTaskId = response.taskId;
      const creditsCharged = response.creditsCharged || 0;
      setTaskId(newTaskId);
      updateNodeData({
        customName: customName.trim(),
        taskId: newTaskId,
      });

      // 刷新用户积分
      if (creditsCharged > 0) {
        try {
          const { useAuthStore } = await import('../../../store/authStore');
          const { refreshUser } = useAuthStore.getState();
          await refreshUser();
          toast.success(`角色创建任务已提交（已扣除 ${creditsCharged} 积分）`);
        } catch {
          toast.success('角色创建任务已提交');
        }
      } else {
        toast.success('角色创建任务已提交');
      }
      pollTaskStatus(newTaskId);
    } catch (error: any) {
      console.error('提交任务失败:', error);
      setIsGenerating(false);
      setGenerationProgress(0);
      
      // 权限错误 (403) 使用更友好的提示
      if (error.response?.status === 403) {
        const errMsg = error.response?.data?.error || '您没有权限使用此功能';
        toast.error(errMsg);
      } else {
        toast.error(`提交失败: ${error.response?.data?.error || error.message}`);
      }
    }
  };

  // 继续轮询已有任务
  useEffect(() => {
    if (taskId && !isGenerating) {
      setIsGenerating(true);
      pollTaskStatus(taskId);
    }
  }, []);

  return (
    <div
      className={`relative bg-white dark:bg-[#18181b] backdrop-blur-xl border rounded-2xl shadow-xl transition-all ring-1 ${
        selected
          ? 'border-neutral-400 shadow-neutral-400/50'
          : 'border-white/60 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'
      }`}
      style={{ width: 300 }}
    >
      {/* 创建者头像徽章 */}
      <NodeCreatorBadge createdBy={(data as any).createdBy} isSharedWorkflow={(data as any)._isSharedWorkflow} />
      
      {/* 输入Handle - 接受视频 */}
      <CustomHandle
        type="target"
        position={Position.Left}
        id="video-input"
        className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
      />

      {/* 头部 - Aurora渐变样式 */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer select-none rounded-t-2xl rounded-t-2xl"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 0, "wght" 200, "GRAD" 0, "opsz" 20' }}>face</span>
          <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-white">
            {data.label || 'SORA角色生成器'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse shadow-[0_0_5px_currentColor]"></div>
          <span className={`material-symbols-outlined text-slate-400 dark:text-white/50 transition-transform text-sm ${isExpanded ? 'rotate-180' : ''}`}>
            expand_more
          </span>
        </div>
      </div>

      {/* 内容区域 */}
      {isExpanded && (
        <div className="p-4 space-y-3">
          {/* 视频缩略图 */}
          {videoInputInfo && (
            <div className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-white/10">
              <video
                src={`${videoInputInfo.url.startsWith('http') || videoInputInfo.url.startsWith('data:') ? videoInputInfo.url : API_URL + videoInputInfo.url}`}
                className="w-full h-24 object-cover bg-black"
                muted
                playsInline
              />
              <div className="absolute bottom-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                {videoInputInfo.name}
              </div>
              <div className="absolute top-1 right-1 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">videocam</span>
                已连接
              </div>
            </div>
          )}

          {/* 自定义名称输入 */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">
              角色自定义名称
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="输入便于记忆的名称..."
              className="nodrag w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-400/50 transition-colors"
              disabled={isGenerating}
            />
          </div>

          {/* 已创建的角色信息（生成过程中不显示） */}
          {createdCharacter && !isGenerating && (
            <div className="p-3 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
              <div className="flex items-start gap-3">
                {createdCharacter.avatarUrl ? (
                  <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-neutral-400 dark:border-neutral-400/50 flex-shrink-0">
                    <img
                      src={createdCharacter.avatarUrl.startsWith('http') ? createdCharacter.avatarUrl : `${API_URL}${createdCharacter.avatarUrl}`}
                      alt="角色头像"
                      className="w-full h-full object-cover object-top"
                      onError={(e) => {
                        console.log('头像加载失败:', createdCharacter.avatarUrl);
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center border-2 border-neutral-400 dark:border-neutral-400/50 flex-shrink-0">
                    <span className="material-symbols-outlined text-slate-500 dark:text-white/50">face</span>
                  </div>
                )}
                <div className="flex-1 min-w-0 pt-1">
                  <div className="font-bold text-sm text-slate-800 dark:text-white truncate">
                    {createdCharacter.customName}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-white/50 font-mono truncate">
                    {createdCharacter.characterName}
                  </div>
                </div>
                <span className="material-symbols-outlined text-green-500 dark:text-green-400 text-lg flex-shrink-0">check_circle</span>
              </div>
            </div>
          )}

          {/* 生成进度 */}
          {isGenerating && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500 dark:text-white/50">
                <span>创建中...</span>
                <span>{generationProgress}%</span>
              </div>
              <div className="h-1.5 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-neutral-800 to-neutral-700 transition-all duration-300"
                  style={{ width: `${generationProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* 生成按钮 */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !hasVideoInput || !customName.trim() || (data as any)._canEdit === false}
            className={`nodrag w-full py-2.5 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
              isGenerating || !hasVideoInput || !customName.trim() || (data as any)._canEdit === false
                ? 'bg-neutral-800 dark:bg-white text-white dark:text-black cursor-not-allowed'
                : 'bg-neutral-800 dark:bg-white text-white dark:text-black hover:shadow-lg active:scale-95'
            }`}
          >
            {isGenerating ? (
              <>
                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                <span>创建中...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                <span>创建角色</span>
                {!creditsLoading && credits !== null && credits > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-[10px]">
                    {credits}积分
                  </span>
                )}
              </>
            )}
          </button>

          {/* 提示信息 */}
          <div className="text-[10px] text-slate-400 dark:text-white/40 text-center">
            连接包含人物的视频，自动提取角色信息
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(SoraCharacterNode);
