import NodeCreatorBadge from '../NodeCreatorBadge';
import { memo, useState, useEffect, useRef } from 'react';
import { NodeProps, Position, useReactFlow } from 'reactflow';
import { apiClient } from '../../../lib/api';
import { toast } from 'sonner';
import CustomHandle from '../CustomHandle';
import CustomSelect from './CustomSelect';

interface NodeData {
  label: string;
  type: string;
  config: {
    modelId?: string;
    prompt?: string;
    previewText?: string;
    voiceId?: string;
    trialHex?: string;
    status?: string;
  };
  models?: any[];
}

const AudioDesignNode = ({ data, id, selected }: NodeProps<NodeData>) => {
  const { setNodes, getNode, setEdges } = useReactFlow();
  const [modelId, setModelId] = useState<string>(data.config.modelId || '');
  const [prompt, setPrompt] = useState<string>(data.config.prompt || '');
  const [previewText, setPreviewText] = useState<string>(data.config.previewText || '');
  const [voiceId, setVoiceId] = useState<string>(data.config.voiceId || '');
  const [isBusy, setIsBusy] = useState(false);
  // const [showManager, setShowManager] = useState(false); // Unused
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLTextAreaElement | null>(null);
  const previewBlobUrlRef = useRef<string | null>(null);
  const [savedVoices, setSavedVoices] = useState<Array<{ id: string; voiceId: string; prefix?: string; targetModel?: string }>>([]);

  useEffect(() => {
    if (!modelId) {
      const list = (data.models || []).filter((m: any) => m.type === 'AUDIO_SYNTHESIS' && m.isActive && ['minimaxi', 'hailuo', '海螺'].includes(String(m.provider || '').toLowerCase()) && (Array.isArray(m.capabilities) ? m.capabilities.some((c: any) => c.capability === '音色设计' && c.supported) : true));
      const first = list[0];
      if (first) {
        setModelId(first.id);
        updateNodeData({ modelId: first.id });
      }
    }
  }, [data.models, modelId]);

  const updateNodeData = (updates: Partial<NodeData['config']>) => {
    const current = getNode(id);
    if (!current) return;
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, ...updates } } } : n));
  };

  useEffect(() => {
    (async () => { try { const resp = await apiClient.ai.audio.voices.list(); const list = (resp as any)?.data ?? resp; setSavedVoices(Array.isArray(list) ? list : []); } catch { } })();
  }, []);

  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => { autoResize(promptRef.current); }, [prompt]);
  useEffect(() => { autoResize(previewRef.current); }, [previewText]);

  const playPreviewHex = async (hex?: string) => {
    if (!hex) return false;
    try {
      const s = (hex || '').replace(/\s+/g, '');
      const out = new Uint8Array(Math.floor(s.length / 2));
      for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
      const mime = (() => {
        const b = out;
        if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45) return 'audio/wav';
        if (b.length >= 3 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return 'audio/mpeg';
        if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'audio/mpeg';
        return 'audio/mpeg';
      })();
      const blob = new Blob([out.buffer], { type: mime });
      const objectUrl = URL.createObjectURL(blob);
      if (previewBlobUrlRef.current) { try { URL.revokeObjectURL(previewBlobUrlRef.current); } catch { } }
      previewBlobUrlRef.current = objectUrl;
      const a = previewAudioRef.current || new Audio();
      a.preload = 'auto';
      (a as any).autoplay = true;
      (a as any).playsInline = true;
      a.crossOrigin = 'anonymous';
      a.src = objectUrl;
      previewAudioRef.current = a;
      await a.play();
      return true;
    } catch { return false; }
  };

  const handleDesign = async () => {
    if (!prompt.trim()) { toast.error('请输入音色描述'); return; }
    let mid = modelId;
    if (!mid) {
      const list = (data.models || []).filter((m: any) => m.type === 'AUDIO_SYNTHESIS' && m.isActive && ['minimaxi', 'hailuo', '海螺'].includes(String(m.provider || '').toLowerCase()));
      if (list[0]) { mid = list[0].id; setModelId(mid); updateNodeData({ modelId: mid }); }
      else { toast.error('请先在后台配置 MiniMax 语音模型'); return; }
    }
    setIsBusy(true);
    try {
      const resp = await apiClient.ai.audio.design({ modelId: mid, prompt, preview_text: previewText, voice_id: voiceId || undefined, aigc_watermark: false });
      const v = (resp as any)?.data?.voice_id || (resp as any)?.voice_id;
      const hex = (resp as any)?.data?.trial_audio || (resp as any)?.trial_audio || (resp as any)?.data?.hex || (resp as any)?.hex;
      if (v) { setVoiceId(String(v)); updateNodeData({ voiceId: String(v) }); }
      if (hex && typeof hex === 'string') {
        updateNodeData({ trialHex: hex });
        await playPreviewHex(hex);
        toast.success('音色设计成功，已生成试听');
      } else {
        toast.success('音色设计成功');
      }
      try {
        const parent = getNode(id);
        if (parent) {
          const spacingX = 160;
          const parentEl = document.querySelector(`.react-flow__node[data-id="${parent.id}"]`) as HTMLElement | null;
          const parentW = Math.round((parentEl?.getBoundingClientRect().width || 420));
          const posX = parent.position.x + parentW + spacingX;
          const newId = `audio-preview-${Date.now()}`;
          setNodes((nds) => [...nds, { id: newId, type: 'audioPreview', position: { x: posX, y: parent.position.y }, data: { audioUrl: previewBlobUrlRef.current || '', sourceNodeId: id, createdBy: (parent.data as any)?.createdBy } } as any]);
          setEdges((eds) => [...eds, { id: `${id}-${newId}`, source: id, target: newId } as any]);
        }
      } catch { }
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || '音色设计失败';
      toast.error(msg);
    }
    setIsBusy(false);
  };

  const handleSaveVoice = async () => {
    const vid = (voiceId || '').trim();
    if (!vid) { toast.error('请先生成或输入音色ID'); return; }
    try {
      const exists = savedVoices.some((v) => String(v.voiceId) === String(vid));
      if (exists) { toast.success('已保存到我的音色'); return; }
      const models = (data.models || []) as any[];
      const sel = models.find((m: any) => m.id === modelId);
      const tm = sel?.modelId || 'cosyvoice-v2';
      const prefix = (prompt || vid).slice(0, 40);
      await apiClient.ai.audio.voices.add({ voiceId: vid, prefix, targetModel: tm, provider: String(sel?.provider || '') });
      const resp = await apiClient.ai.audio.voices.list();
      const list = (resp as any)?.data ?? resp;
      setSavedVoices(Array.isArray(list) ? list : []);
      toast.success('已保存音色');
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || '保存失败';
      toast.error(msg);
    }
  };

  return (
    <div className={`relative bg-white/80 dark:bg-black/60 backdrop-blur-xl border rounded-2xl shadow-xl transition-all ring-1 ${selected ? 'border-purple-400 shadow-purple-400/50' : 'border-white/60 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'}`} style={{ width: 320 }}>
      {/* 创建者头像徽章 */}
      <NodeCreatorBadge createdBy={(data as any).createdBy} isSharedWorkflow={(data as any)._isSharedWorkflow} />
      <CustomHandle
        type="target"
        position={Position.Left}
        id={`${id}-target`}
        className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
      />
      <div className="flex items-center justify-between px-4 py-3 border-b rounded-t-2xl border-slate-200 dark:border-white/10 bg-gradient-to-r from-pink-500/20 dark:from-pink-500/20 from-pink-200/50 via-purple-500/20 dark:via-purple-500/20 via-purple-200/50 to-cyan-500/20 dark:to-cyan-500/20 to-cyan-200/50">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 0, "wght" 200, "GRAD" 0, "opsz" 20' }}>record_voice_over</span>
          <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-white">{data.label}</span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse shadow-[0_0_5px_currentColor]"></div>
      </div>
      <div className="p-4 space-y-4">
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">模型</label>
          <CustomSelect
            value={modelId}
            onChange={(value) => { setModelId(value); updateNodeData({ modelId: value }); }}
            options={(data.models || []).filter((m: any) => {
              if (m.type !== 'AUDIO_SYNTHESIS' || !m.isActive) return false;
              if (Array.isArray(m.capabilities)) {
                return m.capabilities.some((c: any) => c.capability === '音色设计' && c.supported);
              }
              return ['minimaxi', 'hailuo', '海螺'].includes(String(m.provider || '').toLowerCase());
            }).map((m: any) => ({ value: m.id, label: m.name }))}
          />
        </div>
        {savedVoices.length > 0 && (
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">我的音色</label>
            <CustomSelect
              value={voiceId || ''}
              onChange={(value) => { setVoiceId(value); updateNodeData({ voiceId: value }); }}
              options={[{ value: '', label: '选择音色' }, ...savedVoices.map((v) => ({ value: v.voiceId, label: v.prefix || v.voiceId }))]}
            />
          </div>
        )}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">音色名称</label>
          <input
            value={voiceId}
            onChange={(e) => { const v = e.target.value; setVoiceId(v); updateNodeData({ voiceId: v }); }}
            placeholder="定义音色名称"
            className="nodrag w-full p-2 text-xs rounded-md border outline-none transition-colors bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 focus:bg-white dark:focus:bg-white/10 border-slate-200 dark:border-white/10 focus:border-purple-400 dark:focus:border-purple-400/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">音色描述</label>
          <textarea
            ref={promptRef}
            value={prompt}
            onChange={(e) => { setPrompt(e.target.value); updateNodeData({ prompt: e.target.value }); }}
            placeholder="描述你想要的音色特征，例如：温暖、亲切、低沉"
            className="nodrag w-full p-2 text-xs rounded-md border outline-none resize-none overflow-hidden transition-colors font-mono leading-relaxed bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 focus:bg-white dark:focus:bg-white/10 border-slate-200 dark:border-white/10 focus:border-purple-400 dark:focus:border-purple-400/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30"
            rows={3}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">试听文本</label>
          <textarea
            ref={previewRef}
            value={previewText}
            onChange={(e) => { setPreviewText(e.target.value); updateNodeData({ previewText: e.target.value }); }}
            placeholder="输入试听文本"
            className="nodrag w-full p-2 text-xs rounded-md border outline-none resize-none overflow-hidden transition-colors font-mono leading-relaxed bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 focus:bg-white dark:focus:bg-white/10 border-slate-200 dark:border-white/10 focus:border-purple-400 dark:focus:border-purple-400/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30"
            rows={2}
          />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDesign} disabled={isBusy || (data as any)._canEdit === false} className={`nodrag flex-1 py-2 text-[10px] font-bold rounded-lg border transition-all active:scale-95 flex items-center justify-center gap-2 ${isBusy || (data as any)._canEdit === false ? 'bg-gray-600 dark:bg-gray-700 text-white' : 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white shadow-md hover:shadow-lg border-transparent dark:border-white/10'}`}>
            {isBusy ? '设计中...' : '设计音色'}
          </button>
          <button onClick={handleSaveVoice} disabled={isBusy || !voiceId || (data as any)._canEdit === false} className={`nodrag px-3 py-2 text-[10px] font-bold rounded-lg border transition-all active:scale-95 ${isBusy || !voiceId || (data as any)._canEdit === false ? 'bg-gray-600 dark:bg-gray-700 text-white opacity-50' : 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white shadow-md hover:shadow-lg border-transparent dark:border-white/10'}`}>
            保存
          </button>
        </div>
      </div>
      <audio ref={previewAudioRef} className="hidden" />
      <CustomHandle
        type="source"
        position={Position.Right}
        id={`${id}-source`}
        className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
      />
    </div>
  );
};

export default memo(AudioDesignNode);