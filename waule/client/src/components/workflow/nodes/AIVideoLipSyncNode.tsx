import NodeCreatorBadge from '../NodeCreatorBadge';
import { memo, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Position, NodeProps, useReactFlow, useEdges, useNodes } from 'reactflow';
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

interface NodeData {
  label: string;
  type: string;
  models?: AIModel[];
  config: {
    modelId?: string;
    modelName?: string;
    prompt?: string;
    taskId?: string;
    generatedVideoUrl?: string;
    selectedEditingCapability?: string;
  };
}

const API_URL = import.meta.env.VITE_API_URL || '';

const AIVideoLipSyncNode = ({ data, selected, id }: NodeProps<NodeData>) => {
  const [isExpanded] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoExtension, setVideoExtension] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { setNodes, setEdges, getNode, getNodes, getEdges } = useReactFlow();
  const edges = useEdges();
  const nodes = useNodes(); // 监听所有节点变化，确保上游更新时能获取最新数据
  const storageKey = useMemo(() => `lipSyncTask:${id}`, [id]);

  const editingModels = useMemo(() => {
    const all = data.models || [];
    return all.filter((m) => (
      (m.type || '') === 'VIDEO_EDITING' &&
      Array.isArray(m.config?.supportedEditingCapabilities) &&
      m.config.supportedEditingCapabilities.includes('对口型')
    ));
  }, [data.models]);

  const [modelId, setModelId] = useState(data.config.modelId || (editingModels[0]?.id || ''));

  useEffect(() => {
    if (!editingModels.find((m) => m.id === modelId)) {
      const next = editingModels[0]?.id || '';
      setModelId(next);
      setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, modelId: next || undefined, modelName: next ? editingModels[0]?.name : undefined } } } : n));
    }
  }, [editingModels]);

  // 计费时长估算
  const billingDuration = useMemo(() => {
    if (!videoDuration || !audioDuration) return 0;
    if (videoDuration >= audioDuration) return audioDuration;
    // videoDuration < audioDuration
    return videoExtension ? audioDuration : videoDuration;
  }, [videoDuration, audioDuration, videoExtension]);

  // 积分估算
  const { credits, loading: creditsLoading } = useBillingEstimate({
    aiModelId: modelId,
    duration: billingDuration,
    mode: 'standard', // 对口型默认为标准模式
    operationType: 'video_retalk'
  });

  const connectedInputs = useMemo(() => {
    const es = edges.filter((e) => e.target === id);
    let videoUrl: string | null = null;
    let audioUrl: string | null = null;
    let imageUrl: string | null = null;
    for (const e of es) {
      const src = nodes.find((n) => n.id === e.source); // 使用 nodes 数组查找，而不是 getNode
      if (!src) continue;
      const t = String(src.type || '');
      if (t === 'upload') {
        const file = (src.data as any)?.config?.uploadedFiles?.[0];
        if (!file) continue;
        const m = String(file.mimeType || '').toLowerCase();
        const tp = String(file.type || '').toUpperCase();
        const url = file.url.startsWith('http') || file.url.startsWith('data:') ? file.url : `${API_URL}${file.url}`;
        if (!videoUrl && (tp === 'VIDEO' || m.startsWith('video/'))) videoUrl = url;
        if (!audioUrl && (tp === 'AUDIO' || m.startsWith('audio/'))) audioUrl = url;
        if (!imageUrl && (tp === 'IMAGE' || m.startsWith('image/'))) imageUrl = url;
      } else if (t === 'assetSelector') {
        const a = (src.data as any)?.config?.selectedAsset;
        if (a) {
          const m = String(a.mimeType || '').toLowerCase();
          const tp = String(a.type || '').toUpperCase();
          const url = a.url.startsWith('http') || a.url.startsWith('data:') ? a.url : `${API_URL}${a.url}`;
          if (!videoUrl && (tp === 'VIDEO' || m.startsWith('video/'))) videoUrl = url;
          if (!audioUrl && (tp === 'AUDIO' || m.startsWith('audio/'))) audioUrl = url;
          if (!imageUrl && (tp === 'IMAGE' || m.startsWith('image/'))) imageUrl = url;
        }
      } else if (t === 'videoPreview' || t.startsWith('aiVideo')) {
        const u = (src.data as any)?.videoUrl || (src.data as any)?.url || (src.data as any)?.config?.generatedVideoUrl;
        if (!videoUrl && u) videoUrl = u.startsWith('http') || u.startsWith('data:') ? u : `${API_URL}${u}`;
      }
    if (videoUrl && audioUrl && imageUrl) break;
    }
    return { videoUrl, audioUrl, imageUrl };
  }, [edges, id, nodes]);

  // 检查是否是 VideoRetalk 模型
  const isVideoRetalkModel = useMemo(() => {
    const model = editingModels.find(m => m.id === modelId);
    return model?.modelId?.toLowerCase().includes('videoretalk') || false;
  }, [modelId, editingModels]);

  const canGenerate = useMemo(() => {
    return !!modelId && !!connectedInputs.videoUrl && !!connectedInputs.audioUrl && !validationError;
  }, [modelId, connectedInputs.videoUrl, connectedInputs.audioUrl, validationError]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !connectedInputs.audioUrl) return;
    a.src = connectedInputs.audioUrl;
    a.load(); // Force reload
    const onLoaded = () => {
      // setDurationSec(a.duration || 0); // Removed
      setAudioDuration(a.duration || 0);
    };
    const onUpdate = () => setProgress(a.duration ? (a.currentTime / a.duration) : 0);
    const onEnded = () => setIsPlaying(false);
    a.addEventListener('loadedmetadata', onLoaded);
    a.addEventListener('timeupdate', onUpdate);
    a.addEventListener('ended', onEnded);
    return () => {
      a.removeEventListener('loadedmetadata', onLoaded);
      a.removeEventListener('timeupdate', onUpdate);
      a.removeEventListener('ended', onEnded);
    };
  }, [connectedInputs.audioUrl]);

  // 获取视频时长和验证
  useEffect(() => {
    if (!connectedInputs.videoUrl) {
      setVideoDuration(0);
      return;
    }
    // 创建临时video元素来获取时长和验证（不依赖DOM中的video元素）
    const tempVideo = document.createElement('video');
    tempVideo.src = connectedInputs.videoUrl;
    tempVideo.onloadedmetadata = () => {
      setVideoDuration(tempVideo.duration || 0);
      
      // 仅对 VideoRetalk 模型验证视频分辨率
      if (isVideoRetalkModel) {
        const width = tempVideo.videoWidth;
        const height = tempVideo.videoHeight;
        if (width > 2048 || height > 2048) {
          setValidationError(`视频分辨率 ${width}x${height} 超出限制（单边最大 2048）`);
          toast.error(`视频分辨率超出限制（当前 ${width}x${height}，最大 2048），连接已断开`);
          // 断开视频连线
          setEdges(eds => eds.filter(e => {
            if (e.target !== id) return true;
            const srcNode = nodes.find(n => n.id === e.source);
            if (!srcNode) return true;
            const isVideoSource = 
              (srcNode.type === 'upload' && (srcNode.data as any)?.config?.uploadedFiles?.[0]?.type === 'VIDEO') ||
              (srcNode.type === 'assetSelector' && (srcNode.data as any)?.config?.selectedAsset?.type === 'VIDEO') ||
              srcNode.type === 'videoPreview' ||
              (srcNode.type as string)?.startsWith('aiVideo');
            return !isVideoSource;
          }));
        } else if (validationError?.includes('视频分辨率')) {
          setValidationError(null);
        }
      }
    };
    tempVideo.onerror = () => setVideoDuration(0);
    tempVideo.load();
  }, [connectedInputs.videoUrl, isVideoRetalkModel, id, nodes, setEdges]);

  useEffect(() => {
    const u = connectedInputs.audioUrl;
    const c = canvasRef.current as HTMLCanvasElement | null;
    if (!u || !c) return;
    const draw = (vals: Float32Array) => {
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const w = c.width;
      const h = c.height;
      ctx.clearRect(0, 0, w, h);
      const bg = '#1a1033';
      const bar = '#7a0fe8';
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      const n = vals.length;
      const gap = 2;
      const bw = Math.max(1, Math.floor((w - (n - 1) * gap) / n));
      for (let i = 0; i < n; i++) {
        const v = Math.min(1, Math.max(0, vals[i]));
        const bh = Math.max(2, Math.floor(v * h));
        const x = i * (bw + gap);
        const y = Math.floor((h - bh) / 2);
        ctx.fillStyle = bar;
        ctx.fillRect(x, y, bw, bh);
      }
      if (progress > 0) {
        const px = Math.floor(w * progress);
        ctx.fillStyle = '#ffffff88';
        ctx.fillRect(px, 0, 2, h);
      }
    };
    const run = async () => {
      try {
        // 如果是 OSS 地址，通过后端代理避免 CORS 问题
        let audioUrl = u;
        if (u.includes('aliyuncs.com')) {
          // 通过后端代理获取音频文件
          const API_URL = import.meta.env.VITE_API_URL || '';
          audioUrl = `${API_URL}/proxy/audio?url=${encodeURIComponent(u)}`;
        }
        
        const res = await fetch(audioUrl, { 
          mode: u.includes('aliyuncs.com') ? 'cors' : 'cors',
          credentials: u.includes('aliyuncs.com') ? 'include' : 'omit'
        });
        const buf = await res.arrayBuffer();
        const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
        const ac = new AC();
        const audio = await ac.decodeAudioData(buf);
        const ch = audio.getChannelData(0);
        const bars = 120;
        const step = Math.max(1, Math.floor(ch.length / bars));
        const vals = new Float32Array(bars);
        for (let i = 0; i < bars; i++) {
          let sum = 0;
          let cnt = 0;
          const start = i * step;
          const end = Math.min(ch.length, start + step);
          for (let j = start; j < end; j++) {
            sum += Math.abs(ch[j]);
            cnt++;
          }
          vals[i] = cnt ? sum / cnt : 0;
        }
        draw(vals);
      } catch {
        const n = 120;
        const vals = new Float32Array(n);
        for (let i = 0; i < n; i++) vals[i] = (Math.sin(i / 5) + 1) / 2;
        draw(vals);
      }
    };
    run();
  }, [connectedInputs.audioUrl, progress]);

  const toggleAudio = () => {
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) {
      a.pause();
      setIsPlaying(false);
    } else {
      a.play();
      setIsPlaying(true);
    }
  };

  const format = (s: number) => {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, '0')}`;
  };

  const createPreviewNode = useCallback((videoUrl: string) => {
    const currentNode = getNode(id);
    if (!currentNode || !videoUrl) return;
    const normUrl = (videoUrl.startsWith('http') || videoUrl.startsWith('data:')) ? videoUrl : `${API_URL}${videoUrl}`;
    const allNodes = getNodes();
    const allEdges = getEdges();
    const connectedPreviewNodes = allNodes.filter((n: any) => n.type === 'videoPreview' && allEdges.some((e: any) => e.source === id && e.target === n.id));
    const exist = connectedPreviewNodes.find((n: any) => (n.data as any)?.videoUrl === normUrl);
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
    const previewNode = { id: `preview-${id}-${Date.now()}`, type: 'videoPreview', position: { x: posX, y: posY }, data: { videoUrl: normUrl, ratio: '16:9', workflowContext: (currentNode as any).data.workflowContext, createdBy: (currentNode as any).data?.createdBy } } as any;
    setNodes((nds) => [...nds, previewNode]);
    setEdges((eds) => [...eds, { id: `edge-${id}-${previewNode.id}`, source: id, target: previewNode.id, type: 'aurora' }]);
  }, [id, getNode, getNodes, getEdges, setNodes, setEdges]);

  useEffect(() => {
    const url = (data as any)?.config?.generatedVideoUrl;
    if (url) createPreviewNode(url);
  }, [(data as any)?.config?.generatedVideoUrl]);

  useEffect(() => {
    const initialTid = data.config.taskId || (() => { try { return localStorage.getItem(storageKey) || ''; } catch { return ''; } })();
    const recover = async () => {
      let handled = false;
      if (initialTid) {
        try {
          const response = await apiClient.tasks.getTaskStatus(initialTid);
          const task = response.task;
          console.log('[LipSync] Recover status:', task.status); // Debug log

          // 检查任务是否太旧（超过1小时还在 PROCESSING 则放弃）
          if (task.status === 'PROCESSING' || task.status === 'PENDING') {
            const createdAt = new Date(task.createdAt);
            const now = new Date();
            const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
            
            if (hoursSinceCreation > 1) {
              console.warn('[LipSync] 任务超过1小时仍在处理，视为失效');
              setIsGenerating(false);
              setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, taskId: '' } } } : n));
              try { localStorage.removeItem(storageKey); } catch { }
              return;
            }
          }
          
          if (task.status === 'SUCCESS' || task.status === 'COMPLETED' || task.status === 'DONE') {
            // ... success logic ...
            // (keep existing logic)
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
            // ...
            setIsGenerating(false);
            try { localStorage.removeItem(storageKey); } catch { }
            handled = true;
          } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
            setIsGenerating(true);
            await pollTaskStatus(initialTid);
            return;
          } else if (task.status === 'FAILURE' || task.status === 'FAILED') {
            setIsGenerating(false);
            setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, taskId: '' } } } : n));
            try { localStorage.removeItem(storageKey); } catch { }
          }
        } catch (e) {
          setIsGenerating(false);
          try { localStorage.removeItem(storageKey); } catch { }
        }
      }
      
      // 如果任务还未处理完，检查是否有待创建的预览节点
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
  }, [storageKey, id, createPreviewNode]);

  const pollTaskStatus = async (tid: string) => {
    let attempts = 0;
    const maxAttempts = 600;
    let lastProgress = -1;
    let sameProgressCount = 0;
    const maxSameProgressCount = 60; // 进度60次不变则认为任务卡死（5秒×60=5分钟）- 视频对口型通常需要几分钟
    
    const poll = async () => {
      try {
        attempts++;
        const response = await apiClient.tasks.getTaskStatus(tid);
        const task = response.task;
        
        // 检测僵尸任务：进度长时间不变
        if (task.status === 'PROCESSING' || task.status === 'PENDING') {
          const currentProgress = task.progress || 0;
          if (currentProgress === lastProgress) {
            sameProgressCount++;
            if (sameProgressCount >= maxSameProgressCount) {
              setIsGenerating(false);
              toast.error('任务进度停滞，请刷新页面或重新尝试');
              setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, taskId: '' } } } : n));
              try { localStorage.removeItem(storageKey); } catch { }
              return;
            }
          } else {
            lastProgress = currentProgress;
            sameProgressCount = 0;
          }
        }

        if (task.status === 'SUCCESS' || task.status === 'COMPLETED' || task.status === 'DONE') {
          // ... success logic ...
          const url = task.resultUrl || task.previewNodeData?.url;
          if (url) {
             // ... logic ...
             createPreviewNode(url);
             setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, generatedVideoUrl: url, taskId: tid } } } : n));
          }
          // ...
          setIsGenerating(false);
          toast.success('🎬 对口型完成，快去看看效果吧！');
          try { localStorage.removeItem(storageKey); } catch { }
          return; // 停止轮询
        } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
          if (attempts < maxAttempts) {
            setTimeout(poll, 5000); // 5秒轮询一次
          } else {
             // ... timeout logic ...
             setIsGenerating(false);
             toast.error('任务仍在处理中，请刷新页面查看结果');
             setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, taskId: '' } } } : n));
             try { localStorage.removeItem(storageKey); } catch { }
             return;
          }
        } 
        // ... failure logic ...
 else if (task.status === 'FAILURE' || task.status === 'FAILED') {
          setIsGenerating(false);
          
          // 刷新用户积分（失败后退款）
          try {
            const { useAuthStore } = await import('../../../store/authStore');
            const { refreshUser } = useAuthStore.getState();
            await refreshUser();
          } catch {}

          toast.error(task.errorMessage || '处理遇到问题，积分已自动退还');
          setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, taskId: '' } } } : n));
          try { localStorage.removeItem(storageKey); } catch { }
          return; // 停止轮询
        } else {
          // 处理未知状态
          console.warn('[LipSync] Unknown status:', task.status);
          setIsGenerating(false);
          toast.error('任务状态异常，请稍后重试');
          setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, taskId: '' } } } : n));
          try { localStorage.removeItem(storageKey); } catch { }
          return;
        }
      } catch (e: any) {
        setIsGenerating(false);
        toast.error('网络波动，请刷新页面查看结果');
        setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, taskId: '' } } } : n));
        try { localStorage.removeItem(storageKey); } catch { }
        return; // 停止轮询
      }
    };
    poll();
  };

  const handleGenerate = async () => {
    if (!canGenerate) {
      toast.error('请先连接 1 个视频和 1 个音频（图片可选）~');
      return;
    }
    setIsGenerating(true);
    try {
      const response = await apiClient.post('/tasks/video-edit', {
        modelId,
        prompt: '',
        referenceImages: connectedInputs.imageUrl ? [connectedInputs.imageUrl] : [],
        sourceNodeId: id,
        generationType: '对口型',
        duration: billingDuration, // 传递时长用于计费
        metadata: { videoUrl: connectedInputs.videoUrl, audioUrl: connectedInputs.audioUrl, videoExtension, duration: billingDuration },
      } as any);
      
      const tid = response.taskId;
      const creditsCharged = response.creditsCharged || 0;

      // 刷新用户积分
      if (creditsCharged > 0) {
        try {
          const { useAuthStore } = await import('../../../store/authStore');
          const { refreshUser } = useAuthStore.getState();
          await refreshUser();
          toast.success(`🎬 对口型处理已启动，消耗 ${creditsCharged} 积分。视频处理需要一些时间，请耐心等待~`);
        } catch {
          toast.success('🎬 对口型处理已启动，视频处理需要一些时间，请耐心等待~');
        }
      } else {
        toast.success('🎬 对口型处理已启动，视频处理需要一些时间，请耐心等待~');
      }

      setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, taskId: tid } } } : n));
      try { localStorage.setItem(storageKey, tid); } catch { }
      await pollTaskStatus(tid);
    } catch (e: any) {
      setIsGenerating(false);
      const errorDetail = e?.response?.data?.error || e.message || '未知原因';
      toast.error(`启动失败：${errorDetail}，请稍后重试`);
      try { localStorage.removeItem(storageKey); } catch { }
    }
  };

  return (
    <div className={`relative bg-white dark:bg-[#18181b] backdrop-blur-xl border rounded-2xl shadow-xl transition-all ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-white/60 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'}`} style={{ width: 320 }}>
      {/* 创建者头像徽章 */}
      <NodeCreatorBadge createdBy={(data as any).createdBy} isSharedWorkflow={(data as any)._isSharedWorkflow} />
      <CustomHandle type="target" position={Position.Left} id={`${id}-target`} className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]" />
      <div className="flex items-center justify-between px-4 py-3 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 0, "wght" 200, "GRAD" 0, "opsz" 20' }}>mic</span>
          <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-white">对口型</span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse shadow-[0_0_5px_currentColor]"></div>
      </div>
      <div className="p-4">
        {isExpanded ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">视频编辑模型</label>
              <CustomSelect
                value={modelId}
                onChange={(v) => { setModelId(v); setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, modelId: v, modelName: editingModels.find(m => m.id === v)?.name } } } : n)); }}
                options={editingModels.length === 0 ? [{ value: '', label: '暂无可用模型' }] : editingModels.map((m) => ({ value: m.id, label: m.name }))}
              />
              <div className="mt-2 space-y-0.5 text-[10px] text-slate-600 dark:text-slate-400">
                <p>1. 输入原始视频和配音即可对口型</p>
                <p>2. 多人场景可上传人物头像指定人物</p>
                <p>3. 时长2-120秒，建议配音与视频时长接近</p>
                <p>4. 视频最大分辨率2048，音频最大30MB</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">原始视频</label>
                <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md overflow-hidden flex items-center justify-center" style={{ width: '100%', height: 100 }}>
                  {connectedInputs.videoUrl ? (
                    <video key={connectedInputs.videoUrl} src={connectedInputs.videoUrl} controls muted playsInline className="object-cover" style={{ width: '100%', height: '100%' }} draggable={false} />
                  ) : (
                    <span className="text-slate-400 dark:text-white/30 text-[10px]">未连接</span>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">参考图（选）</label>
                <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md overflow-hidden flex items-center justify-center" style={{ width: '100%', height: 100 }}>
                  {connectedInputs.imageUrl ? (
                    <img key={connectedInputs.imageUrl} src={connectedInputs.imageUrl} alt="" className="object-cover" style={{ width: '100%', height: '100%' }} draggable={false} />
                  ) : (
                    <span className="text-slate-400 dark:text-white/30 text-[10px]">未连接</span>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">语音音频</label>
              {connectedInputs.audioUrl ? (
                <div className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md overflow-hidden" style={{ height: 140 }}>
                  <div className="flex items-center gap-2 p-2">
                    <button onClick={toggleAudio} className="nodrag w-7 h-7 rounded-full bg-neutral-800 dark:bg-white text-white dark:text-black hover:shadow-lg flex items-center justify-center transition-all active:scale-95">
                      <span className="material-symbols-outlined text-white text-sm">{isPlaying ? 'pause' : 'play_arrow'}</span>
                    </button>
                    <span className="text-[10px] text-slate-800 dark:text-white">{format(audioDuration)}</span>
                  </div>
                  <div className="px-2 pb-2">
                    <canvas ref={canvasRef} width={280} height={70} className="w-full" />
                  </div>
                  <audio ref={audioRef} src={connectedInputs.audioUrl} className="hidden" />
                  <video 
                    ref={videoRef} 
                    className="hidden" 
                    muted
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      if (v.duration && v.duration !== Infinity) {
                        setVideoDuration(v.duration);
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="w-full h-16 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md flex items-center justify-center text-slate-400 dark:text-white/30 text-[10px]">未连接</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" className="nodrag" checked={videoExtension} onChange={(e) => setVideoExtension(e.target.checked)} />
              <span className="text-[10px] text-slate-600 dark:text-white">音频更长时扩展视频</span>
            </div>
            
            <button onClick={handleGenerate} disabled={isGenerating || (data as any)._canEdit === false} className={`nodrag w-full mt-2 py-2 text-[10px] font-bold rounded-lg border transition-all active:scale-95 flex items-center justify-center gap-2 ${isGenerating ? 'bg-neutral-800 dark:bg-white text-white dark:text-black cursor-not-allowed border-transparent' : 'bg-neutral-800 dark:bg-white text-white dark:text-black text-white shadow-md hover:shadow-lg border-transparent dark:border-white/10'}`}>
              {isGenerating ? (
                <>
                  <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  <span>生成中...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">auto_awesome</span>
                  <span>开始对口型</span>
                  {!creditsLoading && (
                    credits !== null && credits > 0 ? (
                      <span className="ml-1 px-1.5 py-0.5 text-neutral-400 dark:text-neutral-500 text-[9px]">
                        {credits}积分
                      </span>
                    ) : billingDuration === 0 ? (
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
          <div className="py-2 px-2"><p className="text-xs text-neutral-400 text-center italic">双击展开配置</p></div>
        )}
      </div>
      <CustomHandle type="source" position={Position.Right} id={`${id}-source`} className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]" />
    </div>
  );
};

export default memo(AIVideoLipSyncNode);