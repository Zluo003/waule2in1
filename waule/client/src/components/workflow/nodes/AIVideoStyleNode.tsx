import NodeCreatorBadge from '../NodeCreatorBadge';
import { memo, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Position, NodeProps, useReactFlow, useEdges } from 'reactflow';
import CustomHandle from '../CustomHandle';
import CustomSelect from './CustomSelect';
import { toast } from 'sonner';
import { apiClient } from '../../../lib/api';
import { useBillingEstimate } from '../../../hooks/useBillingEstimate';

interface AIModel {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  type: string;
  config: {
    supportedEditingCapabilities?: string[];
  };
}

interface AIVideoStyleNodeData {
  label: string;
  type: string;
  models?: AIModel[];
  config: {
    modelId?: string;
    modelName?: string;
    prompt?: string;
    taskId?: string;
    styleId?: number;
    videoFps?: number;
    generatedVideoUrl?: string;
  };
}

const API_URL = import.meta.env.VITE_API_URL || '';

const STYLES: { id: number; name: string }[] = [
  { id: 0, name: '日式漫画' },
  { id: 1, name: '美式漫画' },
  { id: 2, name: '清新漫画' },
  { id: 3, name: '3D卡通' },
  { id: 4, name: '国风卡通' },
  { id: 5, name: '纸艺风格' },
  { id: 6, name: '简易插画' },
  { id: 7, name: '国风水墨' },
];

const AIVideoStyleNode = ({ data, selected, id }: NodeProps<AIVideoStyleNodeData>) => {
  const [isExpanded] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [styleId, setStyleId] = useState<number>(typeof data.config.styleId === 'number' ? data.config.styleId! : 0);
  const [videoFps, setVideoFps] = useState<number>(data.config.videoFps || 15);
  const [videoDuration, setVideoDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { setNodes, setEdges, getNode, getNodes, getEdges } = useReactFlow();
  const edges = useEdges();

  const editingModels = useMemo(() => {
    const all = data.models || [];
    return all.filter((m) => (
      (m.type || '') === 'VIDEO_EDITING' &&
      Array.isArray(m.config?.supportedEditingCapabilities) &&
      m.config.supportedEditingCapabilities.includes('风格转换')
    ));
  }, [data.models]);

  const [modelId, setModelId] = useState(data.config.modelId || (editingModels[0]?.id || ''));

  // 积分估算
  const { credits, loading: creditsLoading } = useBillingEstimate({
    aiModelId: modelId,
    duration: videoDuration,
  });

  useMemo(() => editingModels.find((m) => m.id === modelId), [editingModels, modelId]);

  useEffect(() => {
    if (!editingModels.find((m) => m.id === modelId)) {
      const next = editingModels[0]?.id || '';
      setModelId(next);
      setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, modelId: next || undefined, modelName: next ? editingModels[0]?.name : undefined } } } : n));
    }
  }, [editingModels]);

  const connectedInputs = useMemo(() => {
    const es = edges.filter((e) => e.target === id);
    let videoUrl: string | null = null;
    for (const e of es) {
      const src = getNode(e.source);
      if (!src) continue;
      const t = String(src.type || '');
      if (t === 'upload') {
        const file = (src.data as any)?.config?.uploadedFiles?.[0];
        if (!file) continue;
        const m = String(file.mimeType || '').toLowerCase();
        const tp = String(file.type || '').toUpperCase();
        const url = file.url.startsWith('http') || file.url.startsWith('data:') ? file.url : `${API_URL}${file.url}`;
        if (!videoUrl && (tp === 'VIDEO' || m.startsWith('video/'))) videoUrl = url;
      } else if (t === 'assetSelector') {
        const a = (src.data as any)?.config?.selectedAsset;
        if (a) {
          const m = String(a.mimeType || '').toLowerCase();
          const tp = String(a.type || '').toUpperCase();
          const url = a.url.startsWith('http') || a.url.startsWith('data:') ? a.url : `${API_URL}${a.url}`;
          if (!videoUrl && (tp === 'VIDEO' || m.startsWith('video/'))) videoUrl = url;
        }
      } else if (t === 'videoPreview' || t.startsWith('aiVideo')) {
        const u = (src.data as any)?.videoUrl || (src.data as any)?.url || (src.data as any)?.config?.generatedVideoUrl;
        if (!videoUrl && u) videoUrl = u.startsWith('http') || u.startsWith('data:') ? u : `${API_URL}${u}`;
      }
      if (videoUrl) break;
    }
    return { videoUrl };
  }, [edges, id, getNode]);

  // 当视频URL变化时获取时长
  useEffect(() => {
    if (!connectedInputs.videoUrl) {
      setVideoDuration(0);
      return;
    }
    // 创建临时video元素来获取时长（不依赖DOM中的video元素）
    const tempVideo = document.createElement('video');

    tempVideo.preload = 'metadata';
    tempVideo.onloadedmetadata = () => {
      if (tempVideo.duration && tempVideo.duration !== Infinity) {
        setVideoDuration(tempVideo.duration);
      }
    };
    tempVideo.onerror = () => setVideoDuration(0);
    tempVideo.src = connectedInputs.videoUrl;
  }, [connectedInputs.videoUrl]);

  const canGenerate = useMemo(() => {
    return !!modelId && !!connectedInputs.videoUrl;
  }, [modelId, connectedInputs.videoUrl]);

  const createPreviewNode = useCallback((videoUrl: string) => {
    const currentNode = getNode(id);
    if (!currentNode) return;
    if (!videoUrl) return;
    const allNodes = getNodes();
    const allEdges = getEdges();
    const connectedPreviewNodes = allNodes.filter((n: any) => n.type === 'videoPreview' && allEdges.some((e: any) => e.source === id && e.target === n.id));
    const exist = connectedPreviewNodes.find((n: any) => (n.data as any)?.videoUrl === videoUrl);
    if (exist) return;
    const previewWidth = 400;
    const parseRatio = (r?: string, defH = 300) => {
      if (!r || !/^[0-9]+\s*:\s*[0-9]+$/.test(r)) return defH;
      const [rw, rh] = r.split(':').map((v) => parseFloat(v));
      if (!rw || !rh) return defH;
      return Math.round(previewWidth * (rh / rw));
    };
    const spacingX = 200;
    const spacingY = 100;
    const targetH = parseRatio('16:9', 300);
    const parentEl = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement | null;
    const parentW = Math.round((parentEl?.getBoundingClientRect().width || 400));
    const baseX = (currentNode.position?.x || 0) + parentW + spacingX;
    const baseY = currentNode.position?.y || 0;
    const siblings = connectedPreviewNodes.length;
    const posX = baseX;
    const posY = baseY + siblings * (targetH + spacingY);
    const previewNode = {
      id: `preview-${id}-${Date.now()}`,
      type: 'videoPreview',
      position: { x: posX, y: posY },
      data: { videoUrl, width: previewWidth, ratio: '16:9', workflowContext: (currentNode as any).data.workflowContext, createdBy: (currentNode as any).data?.createdBy },
    } as any;
    setNodes((nds) => [...nds, previewNode]);
    setEdges((eds) => [...eds, { id: `edge-${id}-${previewNode.id}`, source: id, target: previewNode.id, type: 'aurora' }]);
  }, [id, getNode, getNodes, getEdges, setNodes, setEdges]);

  useEffect(() => {
    const url = (data as any)?.config?.generatedVideoUrl;
    if (url) {
      createPreviewNode(url);
    }
  }, [(data as any)?.config?.generatedVideoUrl]);

  useEffect(() => {
    const initialTid = data.config.taskId;
    const recover = async () => {
      let handled = false;
      if (initialTid) {
        try {
          const response = await apiClient.tasks.getTaskStatus(initialTid);
          const task = response.task;
          if (task.status === 'SUCCESS') {
            const url = task.resultUrl || task.previewNodeData?.url;
            if (url) {
              let suppressed = false;
              try {
                const suppressedRaw = localStorage.getItem('suppressedPreviewTasks') || '[]';
                const list: Array<{ sourceNodeId?: string; taskId?: string; messageId?: string }> = JSON.parse(suppressedRaw);
                suppressed = list.some(s => (s.taskId && s.taskId === initialTid) || (s.sourceNodeId && s.sourceNodeId === id));
              } catch { }
              if (!suppressed) {
                createPreviewNode(url);
              }
              setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, generatedVideoUrl: url, taskId: initialTid } } } : n));
            }
            setIsGenerating(false);
            handled = true;
          } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
            setIsGenerating(true);
            await pollTaskStatus(initialTid);
            return;
          } else if (task.status === 'FAILURE') {
            setIsGenerating(false);
            setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, taskId: '' } } } : n));
          }
        } catch (e) {
          setIsGenerating(false);
        }
      }
      if (!handled) {
        try {
          const r = await apiClient.tasks.getPendingPreviewNodes(id);
          if (Array.isArray(r.tasks) && r.tasks.length > 0) {
            for (const t of r.tasks) {
              const u = t.previewNodeData?.url;
              if (u) {
                let suppressed = false;
                try {
                  const suppressedRaw = localStorage.getItem('suppressedPreviewTasks') || '[]';
                  const list: Array<{ sourceNodeId?: string; taskId?: string; messageId?: string }> = JSON.parse(suppressedRaw);
                  suppressed = list.some(s => (s.taskId && s.taskId === t.id) || (s.sourceNodeId && s.sourceNodeId === id));
                } catch { }
                if (!suppressed) {
                  createPreviewNode(u);
                }
                await apiClient.tasks.markPreviewNodeCreated(t.id);
              }
            }
          }
        } catch { }
      }
    };
    recover();
  }, []);

  const pollTaskStatus = async (tid: string) => {
    let attempts = 0;
    const maxAttempts = 600;
    const poll = async () => {
      try {
        attempts++;
        const response = await apiClient.tasks.getTaskStatus(tid);
        const task = response.task;
        if (task.status === 'SUCCESS') {
          const url = task.resultUrl || task.previewNodeData?.url;
          if (url) {
            createPreviewNode(url);
            setNodes((nds) => nds.map((n) => {
              if (n.id !== id) return n;
              return {
                ...n,
                data: {
                  ...n.data,
                  config: {
                    ...n.data.config,
                    generatedVideoUrl: url,
                    taskId: tid,
                  },
                },
              } as any;
            }));
          }
          setIsGenerating(false);
          toast.success('🎨 风格转换完成，快去看看效果吧！');
        } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
          if (attempts < maxAttempts) setTimeout(poll, 5000); // 5秒轮询一次
          else {
            setIsGenerating(false);
            toast.error('任务仍在处理中，请刷新页面查看结果');
            setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, taskId: '' } } } : n));
          }
        } else if (task.status === 'FAILURE') {
          setIsGenerating(false);
          toast.error(task.errorMessage || '转换遇到问题，积分已自动退还');
          setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, taskId: '' } } } : n));
        }
      } catch (e: any) {
        setIsGenerating(false);
        toast.error('网络波动，请刷新页面查看结果');
        setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, taskId: '' } } } : n));
      }
    };
    poll();
  };

  const handleGenerate = async () => {
    if (!canGenerate) {
      toast.error('请先连接 1 个视频~');
      return;
    }
    setIsGenerating(true);
    try {
      const response = await apiClient.post('/tasks/video-edit', {
        modelId,
        prompt: '',
        referenceImages: [],
        sourceNodeId: id,
        generationType: '风格转换',
        duration: videoDuration, // 传递时长用于计费
        metadata: { videoUrl: connectedInputs.videoUrl, styleId, videoFps, duration: videoDuration },
      } as any);
      const tid = response.taskId;
      const creditsCharged = response.creditsCharged || 0;
      
      // 刷新用户积分
      if (creditsCharged > 0) {
        try {
          const { useAuthStore } = await import('../../../store/authStore');
          const { refreshUser } = useAuthStore.getState();
          await refreshUser();
          toast.success(`🎨 风格转换已启动，消耗 ${creditsCharged} 积分。视频处理需要一些时间，请耐心等待~`);
        } catch {
          toast.success('🎨 风格转换已启动，视频处理需要一些时间，请耐心等待~');
        }
      } else {
        toast.success('🎨 风格转换已启动，视频处理需要一些时间，请耐心等待~');
      }
      setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, taskId: tid, styleId, videoFps } } } : n));
      await pollTaskStatus(tid);
    } catch (e: any) {
      setIsGenerating(false);
      const errorDetail = e?.response?.data?.error || e.message || '未知原因';
      toast.error(`启动失败：${errorDetail}，请稍后重试`);
    }
  };

  return (
    <div className={`relative bg-white dark:bg-[#18181b] backdrop-blur-xl border rounded-2xl shadow-xl transition-all ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-white/60 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'}`} style={{ width: 320 }}>
      {/* 创建者头像徽章 */}
      <NodeCreatorBadge createdBy={(data as any).createdBy} isSharedWorkflow={(data as any)._isSharedWorkflow} />
      <CustomHandle type="target" position={Position.Left} id={`${id}-target`} className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]" />
      <div className="flex items-center justify-between px-4 py-3 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 0, "wght" 200, "GRAD" 0, "opsz" 20' }}>palette</span>
          <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-white">风格转换</span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse shadow-[0_0_5px_currentColor]"></div>
      </div>
      <div className="p-4">
        {isExpanded ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">视频转绘模型</label>
              <CustomSelect
                value={modelId}
                onChange={(v) => { setModelId(v); setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, modelId: v, modelName: editingModels.find(m => m.id === v)?.name } } } : n)); }}
                options={editingModels.length === 0 ? [{ value: '', label: '暂无可用模型' }] : editingModels.map((m) => ({ value: m.id, label: m.name }))}
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">风格</label>
                  <CustomSelect
                    value={String(styleId)}
                    onChange={(v) => { const val = parseInt(v, 10); setStyleId(val); setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, styleId: val } } } : n)); }}
                    options={STYLES.map((s) => ({ value: String(s.id), label: s.name }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">帧率</label>
                  <input type="number" value={videoFps} min={15} max={25} onChange={(e) => { let v = parseInt(e.target.value, 10) || 15; if (v < 15) v = 15; if (v > 25) v = 25; setVideoFps(v); setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, videoFps: v } } } : n)); }} className="nodrag w-full p-2 text-xs rounded-md border outline-none transition-colors bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 focus:bg-white dark:focus:bg-white/10 border-slate-200 dark:border-white/10 focus:border-neutral-400 dark:focus:border-neutral-400/50 text-slate-800 dark:text-white" />
                </div>
              </div>
              <div className="mt-2 space-y-0.5 text-[10px] text-slate-600 dark:text-slate-400">
                <p>1. 连接原始视频</p>
                <p>2. 8种风格预设</p>
                <p>3. 时长≤30秒，分辨率≤4096</p>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">原始视频</label>
              {connectedInputs.videoUrl ? (
                <div className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md overflow-hidden">
                  <video
                    ref={videoRef}
                    src={connectedInputs.videoUrl}
                    controls
                    muted
                    playsInline

                    className="w-full object-cover"
                    style={{ height: 120 }}
                    draggable={false}
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      if (v.duration && v.duration !== Infinity) {
                        setVideoDuration(v.duration);
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="w-full h-20 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md flex items-center justify-center text-slate-400 dark:text-white/30 text-[10px]">未连接</div>
              )}
            </div>
            <button onClick={handleGenerate} disabled={isGenerating || (data as any)._canEdit === false} className={`nodrag w-full mt-2 py-2 text-[10px] font-bold rounded-lg border transition-all active:scale-95 flex items-center justify-center gap-2 ${isGenerating ? 'bg-neutral-800 dark:bg-white text-white dark:text-black cursor-not-allowed border-transparent' : 'bg-neutral-800 dark:bg-white text-white dark:text-black text-white shadow-md hover:shadow-lg border-transparent dark:border-white/10'}`}>
              {isGenerating ? (
                <>
                  <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  <span>转绘中...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">auto_awesome</span>
                  <span>开始转绘</span>
                  {!creditsLoading && (
                    credits !== null && credits > 0 ? (
                      <span className="ml-1 px-1.5 py-0.5 text-neutral-400 dark:text-neutral-500 text-[9px]">
                        {credits}积分
                      </span>
                    ) : videoDuration === 0 ? (
                      <span className="ml-1 px-1.5 py-0.5 text-neutral-400 dark:text-neutral-500 text-[9px]">
                        10积分/秒
                      </span>
                    ) : null
                  )}
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="py-2 px-2">
            <p className="text-xs text-neutral-400 text-center italic">双击展开配置</p>
          </div>
        )}
      </div>
      <CustomHandle type="source" position={Position.Right} id={`${id}-source`} className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]" />
    </div>
  );
};

export default memo(AIVideoStyleNode);