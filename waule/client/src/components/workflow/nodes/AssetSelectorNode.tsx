import { memo, useState, useEffect, useRef } from 'react';
import { Position, NodeProps, useReactFlow } from 'reactflow';
import CustomHandle from '../CustomHandle';
import { toast } from 'sonner';

interface SelectedAsset {
  id: string;
  name: string;
  originalName: string;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
  mimeType: string;
  size: number;
  url: string;
}

interface RoleGroup {
  id: string;
  name: string;
  coverUrl: string;
  images: { id: string; url: string; name: string }[];
}

type SelectedInput = SelectedAsset | RoleGroup;

interface AssetSelectorNodeData {
  label: string;
  type: string;
  config: {
    selectedAsset?: SelectedAsset; // 兼容旧存档
    selectedInput?: SelectedInput;
    subjects?: Array<{ name: string; images: string[] }>;
    roleIds?: string[]; // 角色资产ID数组，用于传递给后端
  };
  onOpenAssetPanel?: (nodeId: string) => void;
}

const API_URL = import.meta.env.VITE_API_URL || '';

const MEDIA_NODE_WIDTH = 320;

const AssetSelectorNode = ({ data, id, selected }: NodeProps<AssetSelectorNodeData>) => {
  const [selectedInput, setSelectedInput] = useState<SelectedInput | null>(
    (data.config.selectedInput as SelectedInput) || (data.config.selectedAsset as SelectedInput) || null
  );
  const [roleImages, setRoleImages] = useState<{ id: string; url: string; name: string }[]>([]);
  const { setNodes, getNode } = useReactFlow();
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioCanvasRef = useRef<HTMLCanvasElement>(null);
  const [audioIsPlaying, setAudioIsPlaying] = useState(false);
  const [audioDurationSec, setAudioDurationSec] = useState(0);
  const [audioProgress, setAudioProgress] = useState(0);
  const waveformDataRef = useRef<Float32Array | null>(null);
  const [waveformReady, setWaveformReady] = useState(false);
  const [videoIsPlaying, setVideoIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 视频播放控制
  const toggleVideoPlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setVideoIsPlaying(true);
      } else {
        videoRef.current.pause();
        setVideoIsPlaying(false);
      }
    }
  };

  // 跟踪是否已经有本地修改（创建者修改后不再从服务器同步）
  const hasLocalChangeRef = useRef(false);
  
  // 同步data中的selectedAsset
  useEffect(() => {
    // 获取当前用户ID和节点创建者ID
    const currentUserId = (data as any)._currentUserId;
    const createdBy = (data as any).createdBy;
    const creatorId = typeof createdBy === 'object' ? createdBy?.id : createdBy;
    
    // 如果是创建者且已有本地修改，不从外部同步（本地状态权威）
    if (currentUserId && creatorId && currentUserId === creatorId && hasLocalChangeRef.current) {
      return;
    }
    
    const incoming = (data.config.selectedInput as SelectedInput) || (data.config.selectedAsset as SelectedInput) || null;
    if (!incoming) return;
    const prev = selectedInput as any;
    const isSame = () => {
      if (!prev) return false;
      const aHasImages = (prev as any).images && !(prev as any).type;
      const bHasImages = (incoming as any).images && !(incoming as any).type;
      if (aHasImages && bHasImages) {
        const ai = (prev as any).images || [];
        const bi = (incoming as any).images || [];
        if (ai.length !== bi.length) return false;
        for (let i = 0; i < ai.length; i++) {
          if (ai[i].id !== bi[i].id || ai[i].url !== bi[i].url) return false;
        }
        return true;
      }
      if ((prev as any).id && (incoming as any).id) {
        return (prev as any).id === (incoming as any).id && (prev as any).url === (incoming as any).url && (prev as any).type === (incoming as any).type;
      }
      try {
        return JSON.stringify(prev) === JSON.stringify(incoming);
      } catch { return false; }
    };
    if (!isSame()) {
      setSelectedInput(incoming);
    }
  }, [data.config.selectedInput, data.config.selectedAsset, (data as any)._currentUserId, (data as any).createdBy]);

  useEffect(() => {
    const isRole = selectedInput && (selectedInput as any).images && !(selectedInput as any).type;
    if (isRole) {
      const rg = selectedInput as RoleGroup;
      const ref = (getNode(id)?.data?.config as any)?.referenceImages as Array<{ id: string; url: string; name: string }> | undefined;
      if (Array.isArray(ref) && ref.length > 0) {
        setRoleImages(ref.map((r) => ({ id: r.id, url: r.url, name: r.name })));
      } else {
        setRoleImages(rg.images || []);
      }
    } else {
      setRoleImages([]);
    }
  }, [selectedInput, getNode, id]);

  const updateNodeData = (updates: Partial<{ selectedInput: SelectedInput; selectedAsset: SelectedAsset; subjects: Array<{ name: string; images: string[] }>; referenceImages: Array<{ id: string; url: string; name: string }>; roleIds: string[] }>) => {
    const node = getNode(id);
    if (!node) return;
    // 标记有本地修改，后续不从服务器同步
    hasLocalChangeRef.current = true;
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, ...updates } } } : n)));
    setSelectedInput(((updates as any)?.selectedInput ?? (updates as any)?.selectedAsset ?? node.data.config.selectedInput ?? node.data.config.selectedAsset) as any);
  };

  const isAbs = (u: string) => /^https?:\/\//.test(u) || u.startsWith('data:');
  const toAbs = (u: string) => {
    if (!u) return u as any;
    if (u.startsWith('data:')) return u;
    if (/^https?:\/\/localhost(?::\d+)?\//i.test(u)) {
      return u.replace(/^https?:\/\/localhost(?::\d+)?/i, API_URL);
    }
    return isAbs(u) ? u : `${API_URL}${u}`;
  };

  useEffect(() => {
    const isRole = selectedInput && (selectedInput as any).images && !(selectedInput as any).type;
    if (!isRole) return;
    const rg = selectedInput as RoleGroup;
    const images = roleImages.length ? roleImages : rg.images || [];
    if (images.length === 1) {
      const only = images[0];
      const single: SelectedAsset = { id: only.id, name: only.name, originalName: only.name, type: 'IMAGE', mimeType: 'image/jpeg', size: 0, url: only.url };
      updateNodeData({ selectedInput: single, selectedAsset: single, subjects: undefined, referenceImages: undefined, roleIds: undefined });
      return;
    }
    const subjects = [{ name: rg.name, images: images.map((i) => toAbs(i.url)) }];
    const referenceImages = images.map((i) => ({ id: i.id, url: i.url, name: i.name }));
    const roleIds = [rg.id]; // 存储角色资产ID
    const prevSubjects = (getNode(id)?.data?.config as any)?.subjects;
    const prevRef = (getNode(id)?.data?.config as any)?.referenceImages;
    const prevRoleIds = (getNode(id)?.data?.config as any)?.roleIds;
    if (JSON.stringify(prevSubjects) !== JSON.stringify(subjects) || JSON.stringify(prevRef) !== JSON.stringify(referenceImages) || JSON.stringify(prevRoleIds) !== JSON.stringify(roleIds)) {
      updateNodeData({ subjects, referenceImages, roleIds });
    }
  }, [roleImages]);

  const handleDeleteImage = (index: number) => {
    const isRole = selectedInput && (selectedInput as any).images && !(selectedInput as any).type;
    if (!isRole) return;
    const rg = selectedInput as RoleGroup;
    const images = [...roleImages];
    if (index < 0 || index >= images.length) return;
    images.splice(index, 1);
    setRoleImages(images);
    toast.success('已删除参考图');
    if (images.length === 0) {
      setSelectedInput(null);
      updateNodeData({ selectedInput: undefined as any, selectedAsset: undefined as any, subjects: undefined, referenceImages: undefined, roleIds: undefined });
      toast.info('已清空角色图片');
      return;
    }
    if (images.length === 1) {
      const only = images[0];
      const single: SelectedAsset = { id: only.id, name: only.name, originalName: only.name, type: 'IMAGE', mimeType: 'image/jpeg', size: 0, url: only.url };
      setSelectedInput(single);
      updateNodeData({ selectedInput: single, selectedAsset: single, subjects: undefined, referenceImages: undefined, roleIds: undefined });
      toast.success('已切换为单张图片输出');
      return;
    }
    const newGroup: RoleGroup = { id: rg.id, name: rg.name, coverUrl: toAbs(images[0].url), images };
    setSelectedInput(newGroup);
    const subjects = [{ name: newGroup.name, images: images.map((i) => toAbs(i.url)) }];
    const referenceImages = images.map((i) => ({ id: i.id, url: i.url, name: i.name }));
    const roleIds = [newGroup.id]; // 存储角色资产ID
    updateNodeData({ selectedInput: newGroup, subjects, referenceImages, roleIds });
    toast.success('已更新图片组');
  };

  // 打开右侧资产面板
  const handleOpenAssetPanel = () => {
    // 编组内节点不允许重新选择素材
    if ((data as any)._canEdit === false) return;
    if (data.onOpenAssetPanel) {
      data.onOpenAssetPanel(id);
    }
  };

  // 当选择资产后，计算图片/视频的显示尺寸
  useEffect(() => {
    if (selectedInput && (selectedInput as any).type) {
      const asset = selectedInput as SelectedAsset;
      if (asset.type === 'IMAGE') {
        const img = new Image();
        img.onload = () => {
          const aspectRatio = img.width / img.height;
          const nodeHeight = MEDIA_NODE_WIDTH / aspectRatio;
          setImageDimensions({ width: MEDIA_NODE_WIDTH, height: nodeHeight });
        };
        img.src = toAbs(asset.url);
      } else if (asset.type === 'VIDEO') {
        const video = document.createElement('video');
        video.onloadedmetadata = () => {
          const aspectRatio = video.videoWidth / video.videoHeight;
          const nodeHeight = MEDIA_NODE_WIDTH / aspectRatio;
          setVideoDimensions({ width: MEDIA_NODE_WIDTH, height: nodeHeight });
        };
        video.src = toAbs(asset.url);
      }
    }
  }, [selectedInput]);

  useEffect(() => {
    const isAudio = selectedInput && (selectedInput as any).type === 'AUDIO';
    if (!isAudio) {
      setWaveformReady(false);
      return;
    }
    const asset = selectedInput as SelectedAsset;
    const fileUrl = toAbs(asset.url);
    const a = audioRef.current;
    const c = audioCanvasRef.current as HTMLCanvasElement | null;
    if (!a || !c) return;
    a.src = fileUrl;
    setAudioProgress(0);
    setWaveformReady(false);
    const onLoaded = () => setAudioDurationSec(a.duration || 0);
    const onUpdate = () => setAudioProgress(a.duration ? (a.currentTime / a.duration) : 0);
    const onEnded = () => setAudioIsPlaying(false);
    a.addEventListener('loadedmetadata', onLoaded);
    a.addEventListener('timeupdate', onUpdate);
    a.addEventListener('ended', onEnded);
    const run = async () => {
      try {
        const res = await fetch(fileUrl, { mode: 'cors' });
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
        waveformDataRef.current = vals;
        setWaveformReady(true);
      } catch {
        const n = 120;
        const vals = new Float32Array(n);
        for (let i = 0; i < n; i++) vals[i] = (Math.sin(i / 5) + 1) / 2;
        waveformDataRef.current = vals;
        setWaveformReady(true);
      }
    };
    run();
    return () => {
      a.removeEventListener('loadedmetadata', onLoaded);
      a.removeEventListener('timeupdate', onUpdate);
      a.removeEventListener('ended', onEnded);
    };
  }, [selectedInput]);

  // Draw audio waveform with progress
  useEffect(() => {
    const isAudio = selectedInput && (selectedInput as any).type === 'AUDIO';
    if (!isAudio || !waveformReady) return;
    const c = audioCanvasRef.current;
    const vals = waveformDataRef.current;
    if (!c || !vals) return;
    
    const ctx = c.getContext('2d');
    if (!ctx) return;
    
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    
    const n = vals.length;
    const gap = 2;
    const bw = Math.max(1, Math.floor((w - (n - 1) * gap) / n));
    
    // Create left-to-right gradient for waveform
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, '#525252');    // neutral-600
    gradient.addColorStop(0.5, '#d946ef');  // fuchsia-500
    gradient.addColorStop(1, '#404040');    // neutral-500
    
    for (let i = 0; i < n; i++) {
      const v = Math.min(1, Math.max(0, vals[i]));
      const bh = Math.max(2, Math.floor(v * h));
      const x = i * (bw + gap);
      const y = Math.floor((h - bh) / 2);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, bw, bh);
    }
    
    // Draw progress indicator
    if (audioProgress > 0) {
      const px = Math.floor(w * audioProgress);
      ctx.fillStyle = '#ffffff88';
      ctx.fillRect(px, 0, 2, h);
    }
  }, [selectedInput, audioProgress, waveformReady]);

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  // 如果已选择资产，显示预览
  if (selectedInput) {
    const isRole = (selectedInput as any).images && !(selectedInput as any).type;
    if (isRole) {
      const rg = selectedInput as RoleGroup;

      return (
        <div className={`relative bg-white dark:bg-[#18181b] backdrop-blur-xl border rounded-2xl shadow-lg transition-all p-4 ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-slate-200 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'}`} style={{ width: MEDIA_NODE_WIDTH }}>
          <CustomHandle type="source" position={Position.Right} id={`${id}-source`} className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]" />
          <div className="relative group flex flex-col gap-4">
            <div
              className="nodrag nopan w-full overflow-hidden rounded-xl border-2 border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 relative"
              style={{ height: MEDIA_NODE_WIDTH * 0.5625 }}
            >
              {roleImages[0] ? (
                <>
                  <img draggable={false} onDragStart={(e) => e.preventDefault()} src={toAbs(roleImages[0].url)} alt={rg.name} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // @ts-ignore
                      if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                        // @ts-ignore
                        e.nativeEvent.stopImmediatePropagation();
                      }
                      handleDeleteImage(0);
                    }}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    style={{ pointerEvents: 'auto' }}
                    className="nodrag absolute z-[10002] top-2 right-2 w-7 h-7 flex items-center justify-center bg-red-500/80 hover:bg-red-600 text-white rounded-full transition-all backdrop-blur-sm shadow-md pointer-events-auto"
                  >
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>delete</span>
                  </button>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-4xl text-slate-400 dark:text-white/50" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>person</span>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-slate-800 dark:text-white font-bold mb-2">{rg.name}</div>
              <div className="flex gap-2 flex-wrap">
                {roleImages.slice(1).map((img, idx) => (
                  <div key={img.id} className="nodrag nopan w-20 h-20 rounded border-2 border-slate-200 dark:border-white/10 overflow-hidden relative pointer-events-auto">
                    <img draggable={false} onDragStart={(e) => e.preventDefault()} src={toAbs(img.url)} alt={img.name} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // @ts-ignore
                        if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                          // @ts-ignore
                          e.nativeEvent.stopImmediatePropagation();
                        }
                        handleDeleteImage(idx + 1);
                      }}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      style={{ pointerEvents: 'auto' }}
                      className="nodrag absolute z-[10002] top-0.5 right-0.5 w-5 h-5 flex items-center justify-center bg-red-500/80 hover:bg-red-600 text-white rounded-full transition-all backdrop-blur-sm shadow-md pointer-events-auto"
                    >
                      <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>close</span>
                    </button>
                  </div>
                ))}
              </div>
              <div className="nodrag absolute bottom-2 right-2 flex gap-1.5 z-10">
                <button onClick={handleOpenAssetPanel} className="w-7 h-7 flex items-center justify-center bg-neutral-800 dark:bg-white text-white dark:text-black hover:shadow-lg text-white rounded-full transition-all backdrop-blur-sm shadow-md active:scale-95" title="重新选择">
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>swap_horiz</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    const asset = selectedInput as SelectedAsset;
    const fileUrl = toAbs(asset.url);

    // 图片预览
    if (asset.type === 'IMAGE' && imageDimensions) {
      return (
        <div
          className={`relative border rounded-2xl overflow-hidden shadow-lg transition-all ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-slate-200 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'}`}
          style={{ width: MEDIA_NODE_WIDTH }}
        >
          <CustomHandle
            type="source"
            position={Position.Right}
            id={`${id}-source`}
            className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
          />
          <div className="relative group">
            <img
              src={fileUrl}
              alt={asset.name}
              className="w-full object-cover"
              style={{ width: MEDIA_NODE_WIDTH, height: imageDimensions.height }}
            />
            {/* 重新选择按钮 */}
            <div className="nodrag absolute bottom-2 right-2 flex gap-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleOpenAssetPanel}
                className="w-7 h-7 flex items-center justify-center bg-neutral-800 dark:bg-white text-white dark:text-black hover:shadow-lg text-white rounded-full transition-all backdrop-blur-sm shadow-md active:scale-95"
                title="重新选择"
              >
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>swap_horiz</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    // 视频预览
    if (asset.type === 'VIDEO' && videoDimensions) {
      return (
        <div
          className={`relative border rounded-2xl overflow-hidden shadow-lg transition-all ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-slate-200 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'}`}
          style={{ width: MEDIA_NODE_WIDTH }}
        >
          <CustomHandle
            type="source"
            position={Position.Right}
            id={`${id}-source`}
            className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
          />
          <div className="relative group">
            {/* 拖动遮罩 + 播放按钮 */}
            <div 
              className="absolute inset-0 z-10 cursor-move flex items-center justify-center"
            >
              <button
                className={`nodrag w-16 h-16 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-all backdrop-blur-sm ${videoIsPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}
                onClick={(e) => { e.stopPropagation(); toggleVideoPlay(); }}
              >
                <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: '"FILL" 1' }}>
                  {videoIsPlaying ? 'pause' : 'play_arrow'}
                </span>
              </button>
            </div>
            <video
              ref={videoRef}
              src={fileUrl}
              playsInline
              className="w-full object-cover rounded-2xl"
              draggable={false}
              style={{ width: MEDIA_NODE_WIDTH, height: videoDimensions.height }}
              onEnded={() => setVideoIsPlaying(false)}
            />
            {/* 重新选择按钮 */}
            <div className="nodrag absolute bottom-2 right-2 flex gap-1.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto">
              <button
                onClick={handleOpenAssetPanel}
                className="w-7 h-7 flex items-center justify-center bg-neutral-800 dark:bg-white text-white dark:text-black hover:shadow-lg text-white rounded-full transition-all backdrop-blur-sm shadow-md active:scale-95"
                title="重新选择"
              >
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>swap_horiz</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

  // 音频预览
  if (asset.type === 'AUDIO') {
    return (
      <div
        className={`relative bg-white dark:bg-[#18181b] backdrop-blur-xl border rounded-2xl shadow-lg transition-all p-4 ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-slate-200 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'}`}
        style={{ width: 400 }}
      >
        <CustomHandle
          type="source"
          position={Position.Right}
          id={`${id}-source`}
          className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
        />
        <div className="space-y-3">
          <p className="text-sm text-center text-slate-800 dark:text-white truncate">{asset.name}</p>
          <div className="flex items-center gap-2">
            <button onClick={() => { const a = audioRef.current; if (!a) return; if (audioIsPlaying) { a.pause(); setAudioIsPlaying(false); } else { a.play(); setAudioIsPlaying(true); } }} className="nodrag w-8 h-8 rounded-full bg-neutral-800 dark:bg-white text-white dark:text-black hover:shadow-lg flex items-center justify-center transition-all shadow-md active:scale-95">
              <span className="material-symbols-outlined text-white text-lg" style={{ fontVariationSettings: '"FILL" 1, "wght" 400' }}>{audioIsPlaying ? 'pause' : 'play_arrow'}</span>
            </button>
            <span className="text-xs text-slate-600 dark:text-slate-400">{(() => { const s = audioDurationSec; if (!s || !isFinite(s)) return '0:00'; const m = Math.floor(s / 60); const ss = Math.floor(s % 60); return `${m}:${ss.toString().padStart(2, '0')}`; })()}</span>
          </div>
          <div>
            <canvas ref={audioCanvasRef} width={360} height={90} className="w-full" />
          </div>
          <audio ref={audioRef} src={fileUrl} className="hidden" />
        </div>
        {/* 重新选择按钮 - 右下角圆形按钮 */}
        <div className="nodrag absolute bottom-2 right-2 flex gap-1.5 z-10">
          <button
            onClick={handleOpenAssetPanel}
            className="w-7 h-7 flex items-center justify-center bg-neutral-800 dark:bg-white text-white dark:text-black hover:shadow-lg text-white rounded-full transition-all backdrop-blur-sm shadow-md active:scale-95"
            title="重新选择"
          >
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>swap_horiz</span>
          </button>
        </div>
      </div>
    );
  }

    // 文档预览
    if (asset.type === 'DOCUMENT') {
      const getDocIcon = (mimeType: string) => {
        if (mimeType.includes('pdf')) return { icon: 'picture_as_pdf', color: 'text-red-400' };
        if (mimeType.includes('word')) return { icon: 'description', color: 'text-blue-400' };
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet'))
          return { icon: 'table_chart', color: 'text-green-400' };
        return { icon: 'insert_drive_file', color: 'text-gray-400' };
      };

      const { icon, color } = getDocIcon(asset.mimeType);

      return (
        <div
          className={`relative bg-white dark:bg-[#18181b] backdrop-blur-xl border rounded-2xl shadow-lg transition-all p-4 ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-slate-200 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'}`}
          style={{ width: 400 }}
        >
      <CustomHandle
        type="source"
        position={Position.Right}
        id={`${id}-source`}
        className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
      />
          <div className="flex flex-col items-center gap-3 py-4">
            <span className={`material-symbols-outlined ${color} text-6xl`} style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>{icon}</span>
            <p className="text-slate-800 dark:text-white text-sm text-center px-2" title={asset.originalName}>
              {asset.originalName}
            </p>
            <p className="text-slate-500 dark:text-slate-400 text-xs">{formatFileSize(asset.size)}</p>
          </div>
          
          {/* 重新选择按钮 - 右下角圆形按钮 */}
          <div className="nodrag absolute bottom-2 right-2 flex gap-1.5 z-10">
            <button
              onClick={handleOpenAssetPanel}
              className="w-7 h-7 flex items-center justify-center bg-neutral-800 dark:bg-white text-white dark:text-black hover:shadow-lg text-white rounded-full transition-all backdrop-blur-sm shadow-md active:scale-95"
              title="重新选择"
            >
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>swap_horiz</span>
            </button>
          </div>
        </div>
      );
    }
  }

  // 未选择资产时，显示选择按钮
  return (
    <div
      className={`relative bg-white dark:bg-[#18181b] backdrop-blur-xl border rounded-2xl shadow-lg transition-all p-6 ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-slate-200 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'}`}
      style={{ width: MEDIA_NODE_WIDTH }}
    >
      <CustomHandle
        type="source"
        position={Position.Right}
        id={`${id}-source`}
        className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
      />

      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <span className="material-symbols-outlined text-6xl text-slate-400 dark:text-white/50" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>photo_library</span>
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-white mb-1">
            资产选择器
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            从资产库选择素材
          </p>
        </div>
        <button
          onClick={handleOpenAssetPanel}
          className="nodrag w-full px-4 py-2.5 bg-neutral-800 dark:bg-white text-white dark:text-black hover:shadow-lg text-white rounded-md transition-all flex items-center justify-center gap-2 font-medium active:scale-95"
        >
          <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>folder_open</span>
          <span>选择素材</span>
        </button>
      </div>
    </div>
  );
};

export default memo(AssetSelectorNode);
