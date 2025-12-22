import { memo, useState, useRef, useEffect } from 'react';
import { Position, NodeProps, useReactFlow } from 'reactflow';
import { apiClient } from '../../../lib/api';
import { toast } from 'sonner';
import CustomHandle from '../CustomHandle';

interface UploadedFile {
  id: string;
  name: string;
  originalName: string;
  type: string;
  mimeType: string;
  size: number;
  url: string;
}

interface UploadNodeData {
  label: string;
  type: string;
  config: {
    uploadedFiles?: UploadedFile[];
  };
}

const API_URL = import.meta.env.VITE_API_URL || '';

const MEDIA_NODE_WIDTH = 400;

const UploadNode = ({ data, id, selected }: NodeProps<UploadNodeData>) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>(data.config.uploadedFiles || []);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
  
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioCanvasRef = useRef<HTMLCanvasElement>(null);
  const [audioIsPlaying, setAudioIsPlaying] = useState(false);
  const [audioDurationSec, setAudioDurationSec] = useState(0);
  const [audioProgress, setAudioProgress] = useState(0);
  const [videoIsPlaying, setVideoIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { setNodes, getNode, setEdges, getEdges } = useReactFlow();

  // 跟踪是否已经有本地修改（创建者修改后不再从服务器同步）
  const hasLocalChangeRef = useRef(false);
  
  // 同步外部数据变化
  useEffect(() => {
    // 如果有本地修改，不从外部同步（本地状态权威）
    if (hasLocalChangeRef.current) {
      return;
    }
    
    const externalFiles = data.config.uploadedFiles || [];
    // 只有当外部数据变化时才更新
    if (!isUploading && JSON.stringify(externalFiles) !== JSON.stringify(uploadedFiles)) {
      setUploadedFiles(externalFiles);
      // 重置尺寸状态，让图片/视频重新计算
      setImageDimensions(null);
      setVideoDimensions(null);
    }
  }, [data.config.uploadedFiles, isUploading]);

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

  // 更新节点数据
  const updateNodeData = (files: UploadedFile[]) => {
    const currentNode = getNode(id);
    if (currentNode) {
      // 标记有本地修改，后续不从服务器同步
      hasLocalChangeRef.current = true;
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  config: {
                    ...node.data.config,
                    uploadedFiles: files,
                  },
                },
              }
            : node
        )
      );
    }
  };

  // 处理文件上传
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
        const newFiles: UploadedFile[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // 验证文件类型
        const allowedTypes = [
          'image/png', 'image/jpeg', 'image/jpg',
          'video/mp4', 'video/quicktime', 'video/avi', 'video/x-msvideo',
          'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a',
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/plain'
        ];

        if (!allowedTypes.includes(file.type)) {
          toast.error(`不支持的文件类型: ${file.name}`);
          continue;
        }

        // 上传文件
        const response = await apiClient.assets.upload(file, undefined, {
          onUploadProgress: (evt: any) => {
            const total = (evt?.total as number) || 0;
            const loaded = (evt?.loaded as number) || 0;
            if (total > 0) {
              const percent = Math.round((loaded / total) * 100);
              setUploadProgress(percent);
            }
          }
        });
        
        if (response.data) {
          const respType = (response.data.type || '').toUpperCase();
          const mime = (response.data.mimeType || '').toLowerCase();
          const derivedType = respType === 'IMAGE' || respType === 'VIDEO' || respType === 'AUDIO'
            ? respType
            : (mime.startsWith('image/') ? 'IMAGE' : (mime.startsWith('video/') ? 'VIDEO' : (mime.startsWith('audio/') ? 'AUDIO' : respType || '')));
          const fileUrl = response.data.url;
          newFiles.push({
            id: response.data.id,
            name: response.data.name,
            originalName: response.data.originalName,
            type: derivedType,
            mimeType: response.data.mimeType,
            size: response.data.size,
            url: fileUrl,
          });
        }
      }

      if (newFiles.length > 0) {
        let nextFiles: UploadedFile[] = [];
        const newFileType = newFiles[0].type;
        if (replaceIndex !== null) {
          nextFiles = [...uploadedFiles];
          nextFiles[replaceIndex] = newFiles[0];
        } else {
          const byId: Record<string, UploadedFile> = {};
          for (const f of uploadedFiles) byId[f.id] = f;
          for (const f of newFiles) byId[f.id] = f;
          nextFiles = Object.values(byId);
        }

        // 检查输出连接是否仍然兼容（按 mergedFiles 的首个文件类型进行提示标签）
        const currentNode = getNode(id);
        if (currentNode) {
          // 获取所有从此节点输出的边
          const outputEdges = getEdges().filter((edge: any) => edge.source === id);
          
          // 检查每条边的目标节点是否接受新的文件类型
          const incompatibleEdges: string[] = [];
          outputEdges.forEach((edge: any) => {
            const targetNode = getNode(edge.target);
            if (!targetNode) return;
            // AI视频节点的连线由生成模式控制，不基于 acceptedInputs 断开
            if ((targetNode.type as string).startsWith('aiVideo')) return;
            const targetAcceptedInputs = targetNode.data.config?.acceptedInputs as string[] | undefined;
            if (targetAcceptedInputs && targetAcceptedInputs.length > 0) {
              const upper = newFileType.toUpperCase();
              const acceptedUpper = targetAcceptedInputs.map((t) => (typeof t === 'string' ? t.toUpperCase() : t));
              if (!acceptedUpper.includes(upper)) {
                incompatibleEdges.push(edge.id);
              }
            }
          });
          
          // 断开不兼容的连接
          if (incompatibleEdges.length > 0) {
            setEdges((eds) => eds.filter((edge) => !incompatibleEdges.includes(edge.id)));
            const typeLabels: Record<string, string> = {
              TEXT: '文本',
              IMAGE: '图片',
              VIDEO: '视频',
              AUDIO: '音乐',
              DOCUMENT: '文档',
            };
            toast.warning(`已断开 ${incompatibleEdges.length} 个不兼容的连接（目标节点不接受${typeLabels[newFileType] || newFileType}类型）`);
          }
        }

        setImageDimensions(null);
        setVideoDimensions(null);
        setUploadedFiles(nextFiles);
        updateNodeData(nextFiles);
        try {
          const edges = getEdges().filter((e: any) => e.source === id);
          const hasVideoTargets = edges.some((e: any) => {
            const t = getNode(e.target);
            return t?.type === 'aiVideo';
          });
          if (hasVideoTargets) {
            const nodesJson = localStorage.getItem('workflow:nodes');
            const nodes = nodesJson ? JSON.parse(nodesJson) : [];
            const affectedTargets = edges.filter((e: any) => getNode(e.target)?.type === 'aiVideo').map((e: any) => e.target);
            const toUpdate = nodes.filter((n: any) => affectedTargets.includes(n.id));
            if (toUpdate.length > 0) {
              // 触发AI视频节点的参考图重算：通过轻微变更其数据时间戳
              setNodes((nds) => nds.map((n) => toUpdate.find((x: any) => x.id === n.id)
                ? { ...n, data: { ...n.data, config: { ...n.data.config, _updatedAt: Date.now() } } }
                : n));
            }
          }
        } catch {}
        toast.success('文件上传成功');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(`上传失败: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setReplaceIndex(null);
    }
  };

  // 删除节点
  const handleDeleteNode = () => {
    // 删除节点
    setNodes((nds) => nds.filter((node) => node.id !== id));
    
    // 删除相关的边
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
    
    toast.success('节点已删除');
  };

  // 替换文件（用于重新上传）
  const handleReplaceFile = () => {
    setReplaceIndex(0);
    fileInputRef.current?.click();
  };


  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  // 获取文件图标
  const getFileIcon = (mimeType: string): { icon: string; color: string } => {
    if (mimeType.startsWith('image/')) return { icon: 'image', color: 'text-neutral-500 dark:text-neutral-400' };
    if (mimeType.startsWith('video/')) return { icon: 'movie', color: 'text-neutral-500 dark:text-neutral-400' };
    if (mimeType.startsWith('audio/')) return { icon: 'audio_file', color: 'text-neutral-500 dark:text-neutral-400' };
    return { icon: 'description', color: 'text-neutral-500 dark:text-neutral-400' };
  };

  // 当上传文件后，如果是图片，获取其尺寸
  useEffect(() => {
    if (uploadedFiles.length > 0) {
      const file = uploadedFiles[0];
      const fileUrl = (file.url.startsWith('http') || file.url.startsWith('data:') ? file.url : `${API_URL}${file.url}`).replace('.oss-oss-', '.oss-');
      
      if (file.type === 'IMAGE') {
        const img = new Image();
        img.onload = () => {
          const aspectRatio = img.width / img.height;
          const nodeHeight = MEDIA_NODE_WIDTH / aspectRatio;
          setImageDimensions({ width: MEDIA_NODE_WIDTH, height: nodeHeight });
        };
        img.onerror = (e) => {
          console.error('[UploadNode] 图片加载失败:', e);
          // 设置默认尺寸，让节点至少能显示
          setImageDimensions({ width: MEDIA_NODE_WIDTH, height: MEDIA_NODE_WIDTH * 0.75 });
        };
        img.src = fileUrl;
      } else if (file.type === 'VIDEO') {
        const video = document.createElement('video');
        video.onloadedmetadata = () => {
          const aspectRatio = video.videoWidth / video.videoHeight;
          const nodeHeight = MEDIA_NODE_WIDTH / aspectRatio;
          setVideoDimensions({ width: MEDIA_NODE_WIDTH, height: nodeHeight });
        };
        video.onerror = (e) => {
          console.error('[UploadNode] 视频加载失败:', e);
          setVideoDimensions({ width: MEDIA_NODE_WIDTH, height: MEDIA_NODE_WIDTH * 0.5625 });
        };
        video.src = fileUrl;
      }
    }
  }, [uploadedFiles]);

  // 音频播放控制
  const toggleAudio = () => {
    const a = audioRef.current;
    if (!a) return;
    if (audioIsPlaying) { a.pause(); setAudioIsPlaying(false); } else { a.play(); setAudioIsPlaying(true); }
  };

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onLoaded = () => setAudioDurationSec(a.duration || 0);
    const onUpdate = () => setAudioProgress(a.duration ? (a.currentTime / a.duration) : 0);
    const onEnded = () => setAudioIsPlaying(false);
    a.addEventListener('loadedmetadata', onLoaded);
    a.addEventListener('timeupdate', onUpdate);
    a.addEventListener('ended', onEnded);
    return () => {
      a.removeEventListener('loadedmetadata', onLoaded);
      a.removeEventListener('timeupdate', onUpdate);
      a.removeEventListener('ended', onEnded);
    };
  }, [uploadedFiles]);

  useEffect(() => {
    const file = uploadedFiles[0];
    if (!file || file.type !== 'AUDIO') return;
    const raw = (file.url.startsWith('http') || file.url.startsWith('data:') ? file.url : `${API_URL}${file.url}`).replace('.oss-oss-', '.oss-');
    const url = raw.includes('aliyuncs.com') ? raw : raw;
    const c = audioCanvasRef.current as HTMLCanvasElement | null;
    if (!c) return;
    const draw = (vals: Float32Array) => {
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const w = c.width; const h = c.height;
      ctx.clearRect(0, 0, w, h);
      // Transparent background - no fill
      const n = vals.length; const gap = 2; const bw = Math.max(1, Math.floor((w - (n - 1) * gap) / n));
      
      // Create left-to-right gradient for waveform
      const gradient = ctx.createLinearGradient(0, 0, w, 0);
      gradient.addColorStop(0, '#737373');    // purple-500
      gradient.addColorStop(0.5, '#525252');  // fuchsia-500
      gradient.addColorStop(1, '#404040');    // pink-500
      
      for (let i = 0; i < n; i++) {
        const v = Math.min(1, Math.max(0, vals[i]));
        const bh = Math.max(2, Math.floor(v * h));
        const x = i * (bw + gap); const y = Math.floor((h - bh) / 2);
        ctx.fillStyle = gradient; 
        ctx.fillRect(x, y, bw, bh);
      }
      if (audioProgress > 0) { const px = Math.floor(w * audioProgress); ctx.fillStyle = '#ffffff88'; ctx.fillRect(px, 0, 2, h); }
    };
    const run = async () => {
      try {
        let buf: ArrayBuffer;
        if (/https:\/\/.*aliyuncs\.com\//.test(url)) {
          const resp = await apiClient.assets.proxyDownload(url);
          buf = resp; // responseType: 'arraybuffer'
        } else {
          const res = await fetch(url, { mode: 'cors' });
          buf = await res.arrayBuffer();
        }
        const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext; const ac = new AC();
        const audio = await ac.decodeAudioData(buf); const ch = audio.getChannelData(0);
        const bars = 120; const step = Math.max(1, Math.floor(ch.length / bars)); const vals = new Float32Array(bars);
        for (let i = 0; i < bars; i++) { let sum = 0; let cnt = 0; const start = i * step; const end = Math.min(ch.length, start + step); for (let j = start; j < end; j++) { sum += Math.abs(ch[j]); cnt++; } vals[i] = cnt ? sum / cnt : 0; }
        draw(vals);
      } catch {
        const n = 120; const vals = new Float32Array(n); for (let i = 0; i < n; i++) vals[i] = (Math.sin(i / 5) + 1) / 2; draw(vals);
      }
    };
    run();
  }, [uploadedFiles, audioProgress]);

  const formatAudio = (s: number) => {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60); const ss = Math.floor(s % 60); return `${m}:${ss.toString().padStart(2, '0')}`;
  };

  const supportedFormats = [
    { type: 'image', formats: ['PNG', 'JPG', 'JPEG'], icon: 'image', color: 'neutral' },
    { type: 'video', formats: ['MP4', 'MOV'], icon: 'movie', color: 'neutral' },
    { type: 'audio', formats: ['MP3', 'WAV'], icon: 'audio_file', color: 'neutral' },
    { type: 'document', formats: ['PDF', 'DOCX', 'XLSX', 'TXT'], icon: 'description', color: 'neutral' },
  ];

  const file = uploadedFiles[0];
  const fileUrl = file ? (file.url.startsWith('http') || file.url.startsWith('data:') ? file.url : `${API_URL}${file.url}`).replace('.oss-oss-', '.oss-') : '';

  if (file && file.type === 'IMAGE' && imageDimensions) {
    return (
      <div
        className={`relative border rounded-2xl overflow-hidden shadow-lg transition-all ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-slate-200 dark:border-neutral-800 ring-black/5 dark:ring-neutral-700 ring-black/5'}`}
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
            alt=""
            className="w-full object-cover"
            draggable={false}
            style={{ width: MEDIA_NODE_WIDTH, height: imageDimensions.height, pointerEvents: 'none' }}
          />
          {/* 操作按钮 - 右下角图标 */}
          <div className="nodrag absolute bottom-2 right-2 flex gap-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto">
            <button
              onClick={handleReplaceFile}
              className="w-7 h-7 flex items-center justify-center bg-neutral-800 dark:bg-white hover:shadow-lg text-white dark:text-black rounded-full transition-all dark:backdrop-blur-none backdrop-blur-sm shadow-md active:scale-95"
              title="重新上传"
            >
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>upload</span>
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.mp4,.mov,.mp3,.wav,.pdf,.docx,.xlsx,.txt"
          onChange={(e) => handleFileUpload(e.target.files)}
          className="hidden"
        />
      </div>
    );
  }

  if (file && file.type === 'VIDEO' && videoDimensions) {
    return (
      <div
        className={`relative border rounded-2xl overflow-hidden shadow-lg transition-all ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-slate-200 dark:border-neutral-800 ring-black/5 dark:ring-neutral-700 ring-black/5'}`}
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
              className={`nodrag w-16 h-16 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-all dark:backdrop-blur-none backdrop-blur-sm ${videoIsPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}
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
          {/* 操作按钮 - 右下角图标 */}
          <div className="nodrag absolute bottom-2 right-2 flex gap-1.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto">
            <button
              onClick={handleReplaceFile}
              className="w-7 h-7 flex items-center justify-center bg-neutral-800 dark:bg-white hover:shadow-lg text-white dark:text-black rounded-full transition-all dark:backdrop-blur-none backdrop-blur-sm shadow-md active:scale-95"
              title="重新上传"
            >
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>upload</span>
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.mp4,.mov,.mp3,.wav,.pdf,.docx,.xlsx,.txt"
          onChange={(e) => handleFileUpload(e.target.files)}
          className="hidden"
        />
      </div>
    );
  }

  if (file && file.type === 'AUDIO') {
    return (
      <div
        className={`relative bg-white/80 dark:bg-[#18181b]/100 dark:backdrop-blur-none backdrop-blur-sm border rounded-2xl shadow-lg transition-all ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-slate-200 dark:border-neutral-800 ring-black/5 dark:ring-neutral-700 ring-black/5'}`}
        style={{ width: 400 }}
      >
        
        <CustomHandle
          type="source"
          position={Position.Right}
          id={`${id}-source`}
          className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
        />
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <button onClick={toggleAudio} className="nodrag w-8 h-8 rounded-full bg-neutral-800 dark:bg-white hover:shadow-lg flex items-center justify-center transition-all shadow-md active:scale-95">
              <span className="material-symbols-outlined text-white text-lg" style={{ fontVariationSettings: '"FILL" 1, "wght" 400' }}>{audioIsPlaying ? 'pause' : 'play_arrow'}</span>
            </button>
            <span className="text-xs text-slate-600 dark:text-slate-400">{formatAudio(audioDurationSec)}</span>
          </div>
          <div className="">
            <canvas ref={audioCanvasRef} width={360} height={90} className="w-full" />
          </div>
          <audio ref={audioRef} src={fileUrl} className="hidden" />
          {/* 操作按钮 - 右下角图标 */}
          <div className="nodrag absolute bottom-2 right-2 flex gap-1.5 z-10">
            <button
              onClick={handleReplaceFile}
              className="w-7 h-7 flex items-center justify-center bg-neutral-800 dark:bg-white hover:shadow-lg text-white dark:text-black rounded-full transition-all dark:backdrop-blur-none backdrop-blur-sm shadow-md active:scale-95"
              title="重新上传"
            >
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>upload</span>
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.mp4,.mov,.mp3,.wav,.pdf,.docx,.xlsx,.txt"
          onChange={(e) => handleFileUpload(e.target.files)}
          className="hidden"
        />
      </div>
    );
  }

  if (file && file.type === 'DOCUMENT') {
    return (
        <div
          className={`relative bg-white/80 dark:bg-[#18181b]/100 dark:backdrop-blur-none backdrop-blur-sm border rounded-2xl shadow-lg transition-all p-4 ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-slate-200 dark:border-neutral-800 ring-black/5 dark:ring-neutral-700 ring-black/5'}`}
          style={{ width: 400 }}
        >
          
          <CustomHandle
            type="source"
            position={Position.Right}
            id={`${id}-source`}
            className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
          />
          <div className="flex flex-col items-center gap-3 py-4">
            <span className={`material-symbols-outlined text-red-400 text-6xl`} style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>picture_as_pdf</span>
            <p className="text-slate-800 dark:text-white text-sm text-center px-2" title={file.originalName}>
              {file.originalName}
            </p>
            <p className="text-slate-500 dark:text-slate-400 text-xs">{formatFileSize(file.size)}</p>
          </div>
          
          {/* 操作按钮 - 右下角图标 */}
          <div className="nodrag absolute bottom-2 right-2 flex gap-1.5 z-10">
            <button
              onClick={handleReplaceFile}
              className="w-7 h-7 flex items-center justify-center bg-neutral-800 dark:bg-white hover:shadow-lg text-white dark:text-black rounded-full transition-all dark:backdrop-blur-none backdrop-blur-sm shadow-md active:scale-95"
              title="重新上传"
            >
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>upload</span>
            </button>
          </div>
          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.mp4,.mov,.mp3,.wav,.pdf,.docx,.xlsx,.txt"
            onChange={(e) => handleFileUpload(e.target.files)}
            className="hidden"
          />
        </div>
    );
  }

  // Default: no file uploaded or unknown type
  return (
    <div
      className={`relative bg-white/80 dark:bg-[#18181b]/100 dark:backdrop-blur-none backdrop-blur-sm border rounded-2xl shadow-lg transition-all ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-slate-200 dark:border-neutral-800 ring-black/5 dark:ring-neutral-700 ring-black/5'}`}
      style={{ width: 320 }}
    >
      
      <CustomHandle
        type="source"
        position={Position.Right}
        id={`${id}-source`}
        className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
      />

      {/* 节点头部 - Aurora风格 */}
      <div className="flex items-center justify-between px-4 py-3 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 0, "wght" 200, "GRAD" 0, "opsz" 20' }}>upload_file</span>
          <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-white">{data.label}</span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse shadow-[0_0_5px_currentColor]"></div>
      </div>

      {/* 节点内容 */}
      <div className="p-4">
        <div className="space-y-3">
          {/* 上传区域 */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.mp4,.mov,.mp3,.wav,.pdf,.docx,.xlsx,.txt"
            onChange={(e) => handleFileUpload(e.target.files)}
            className="hidden"
          />
          <div
            onClick={() => {
              if ((data as any)._canEdit === false) return;
              fileInputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if ((data as any)._canEdit === false) return;
              handleFileUpload(e.dataTransfer.files);
            }}
            className={`nodrag w-full p-6 bg-slate-100 dark:bg-[#000000] backdrop-blur-none border-2 border-dashed border-slate-300 dark:border-white/20 rounded-xl cursor-pointer hover:border-neutral-400 dark:hover:border-neutral-400/50 transition-colors ${
              isUploading || (data as any)._canEdit === false ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <div className="text-center">
              <span className="material-symbols-outlined text-slate-400 dark:text-neutral-400 text-4xl mb-2 block" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>
                {isUploading ? 'hourglass_empty' : 'cloud_upload'}
              </span>
              <p className="text-sm text-slate-800 dark:text-white font-medium mb-1">
                {isUploading ? `上传中... ${uploadProgress}%` : '点击上传或拖放文件'}
              </p>
              {isUploading && (
                <div className="w-full h-2 bg-slate-200 dark:bg-black rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-neutral-800 dark:bg-white transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
              )}
              <p className="text-xs text-slate-400 dark:text-neutral-400">支持多种格式，最大100MB</p>
            </div>
          </div>

          {/* 支持的格式 */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">支持的格式</p>
            <div className="grid grid-cols-2 gap-2">
              {supportedFormats.map((category) => (
                <div key={category.type} className="flex items-center gap-1.5 text-xs">
                  <span className={`material-symbols-outlined text-${category.color}-400 text-sm`} style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>
                    {category.icon}
                  </span>
                  <span className="text-slate-600 dark:text-slate-400 text-[10px]">{category.formats.join(', ')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 已上传文件列表 */}
          {uploadedFiles.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">已上传 ({uploadedFiles.length})</p>
              {uploadedFiles.map((file) => {
                const { icon, color } = getFileIcon(file.mimeType);
                return (
                  <div
                    key={file.id}
                    className="nodrag flex items-center gap-2 p-2 bg-slate-100 dark:bg-[#000000] backdrop-blur-none border border-slate-200 dark:border-neutral-800 rounded-md hover:bg-slate-200 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <span className={`material-symbols-outlined ${color} text-base flex-shrink-0`} style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>
                      {icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-800 dark:text-white truncate" title={file.originalName}>
                        {file.originalName}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{formatFileSize(file.size)}</p>
                    </div>
                    <button
                      onClick={handleDeleteNode}
                      className="nodrag p-1 hover:bg-red-500/20 rounded flex-shrink-0 transition-colors"
                    >
                      <span className="material-symbols-outlined text-red-500 dark:text-red-400 text-base" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>close</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>

      {/* 输出连接点 */}
      <CustomHandle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
      />
    </div>
  );
};

export default memo(UploadNode);
