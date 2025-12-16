import NodeCreatorBadge from '../NodeCreatorBadge';
import { memo, useState, useEffect } from 'react';
import { NodeProps, Position, useReactFlow } from 'reactflow';
import { apiClient } from '../../../lib/api';
import { toast } from 'sonner';
import CustomHandle from '../CustomHandle';
import CustomSelect from './CustomSelect';

interface AudioVoiceNodeData {
  label: string;
  type: string;
  config: {
    modelId?: string;
    voicePrefix?: string;
    audioUrl?: string; // 训练音频URL
    voiceId?: string;
    text?: string; // 合成文本
    outputUrl?: string; // 合成结果
    status?: string; // OK / DEPLOYING / UNDEPLOYED
  };
  models?: any[];
}



const AudioVoiceNode = ({ data, id, selected }: NodeProps<AudioVoiceNodeData>) => {
  const { setNodes, getNode } = useReactFlow();
  const [modelId, setModelId] = useState<string>(data.config.modelId || '');

  const [voiceId, setVoiceId] = useState<string>(data.config.voiceId || '');
  const [text, setText] = useState<string>(data.config.text || '恭喜，已成功复刻并合成了属于自己的声音！');
  const [status, setStatus] = useState<string>(data.config.status || '');
  const [isBusy, setIsBusy] = useState(false);
  const [savedVoices, setSavedVoices] = useState<Array<{ id: string; voiceId: string; prefix?: string; targetModel?: string }>>([]);

  // Unused state variables (kept for potential future use)
  // const [emotion] = useState<string>('');
  const [sampleRate] = useState<number | undefined>(undefined);
  const [format] = useState<'mp3' | 'wav'>('mp3');
  const [rate] = useState<number | undefined>(undefined);
  const [volume] = useState<number | undefined>(undefined);
  const [pitch] = useState<number | undefined>(undefined);
  // const [stream] = useState<boolean>(false);
  // const [subtitleEnable] = useState<boolean>(false);
  // const [languageBoost] = useState<string>('auto');
  const [outputFormat] = useState<'hex' | 'url'>('hex');

  useEffect(() => {
    if (data.config.modelId && !modelId) setModelId(data.config.modelId);
  }, [data.config.modelId, modelId]);

  useEffect(() => {
    if (!voiceId && data.config.voiceId) setVoiceId(String(data.config.voiceId));
  }, [data.config.voiceId, voiceId]);

  useEffect(() => {
    if (!modelId) {
      const list = (data.models || []).filter((m: any) => m.type === 'AUDIO_SYNTHESIS' && m.isActive);
      const first = list[0];
      if (first) {
        setModelId(first.id);
        updateNodeData({ modelId: first.id });
      }
    }
  }, [data.models, modelId]);

  useEffect(() => {
    loadSavedVoices();
  }, []);



  const loadSavedVoices = async () => {
    try {
      const resp = await apiClient.tenant.get('/ai/audio/voices');
      const list = (resp as any)?.data ?? resp;
      setSavedVoices(Array.isArray(list) ? list : []);
    } catch { }
  };

  const updateNodeData = (updates: Partial<AudioVoiceNodeData['config']>) => {
    const current = getNode(id);
    if (!current) return;
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, ...updates } } } : n));
  };







  const handleSynthesize = async () => {
    const vid = (voiceId || data.config.voiceId || '').trim();
    const txt = (text || '').trim();
    if (!vid || !txt) { toast.error('请先选择音色并输入文本'); return; }
    let mid = modelId;
    if (!mid) {
      const list = (data.models || []).filter((m: any) => m.type === 'AUDIO_SYNTHESIS' && m.isActive);
      if (list[0]) { mid = list[0].id; setModelId(mid); updateNodeData({ modelId: mid }); }
      else { toast.error('请先在后台配置语音合成模型'); return; }
    }
    setIsBusy(true);
    try {
      if (status !== 'OK') {
        const max = 12; let count = 0; let ok = false;
        while (count < max) {
          count++;
          try {
            const resp = await apiClient.ai.audio.queryVoice({ voiceId: vid, modelId: mid });
            const st = resp.data?.status || resp.status;
            setStatus(st); updateNodeData({ status: st });
            if (st === 'OK') { ok = true; break; }
            if (st === 'UNDEPLOYED') { break; }
          } catch { }
          await new Promise(r => setTimeout(r, 2500));
        }
        if (!ok) { toast.error('音色未就绪，稍后重试'); setIsBusy(false); return; }
      }
      const resp = await apiClient.ai.audio.synthesize({ modelId: mid, voiceId: vid, text: txt, format, sampleRate, volume, rate, pitch, output_format: outputFormat });
      const url = resp.data?.url || resp.url;
      try {
        const absolute = url && url.startsWith('http') ? url : (import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}${url}` : undefined);
        let buf: ArrayBuffer | undefined;
        if (absolute) {
          buf = await apiClient.assets.proxyDownload(absolute);
        } else {
          const res = await fetch(url, { mode: 'cors' });
          buf = await res.arrayBuffer();
        }
        const blobUrl = URL.createObjectURL(new Blob([buf!], { type: format === 'wav' ? 'audio/wav' : 'audio/mpeg' }));
        updateNodeData({ outputUrl: blobUrl });
      } catch {
        updateNodeData({ outputUrl: url });
      }
      toast.success('语音合成成功');
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || '语音合成失败';
      if (/url error/i.test(msg)) {
        toast.error('音频URL不可达或不符合要求，请确认上传音频公网可访问');
      } else if (/访问被拒绝|Access denied/i.test(msg)) {
        toast.error('访问被拒绝：请确认API Key有效、账号状态正常、且已开通对应CosyVoice版本（v3/v3-plus需申请获批）');
      } else {
        toast.error(msg);
      }
    }
    setIsBusy(false);
  };



  // Unused function - kept for potential future use
  // const handleDeleteSaved = async (idToDelete: string) => {
  //   try { await apiClient.delete(`/ai/audio/voices/${idToDelete}`); await loadSavedVoices(); toast.success('已删除音色ID'); } catch {}
  // };

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
            options={(data.models || []).filter((m: any) => m.type === 'AUDIO_SYNTHESIS' && m.isActive).map((m: any) => ({ value: m.id, label: m.name }))}
          />
        </div>
        {savedVoices.length > 0 && (
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">我的音色 ({savedVoices.length})</label>
            <CustomSelect
              value={voiceId || ''}
              onChange={(value) => { setVoiceId(value); updateNodeData({ voiceId: value }); }}
              options={[{ value: '', label: '选择音色' }, ...savedVoices.map((v) => ({ value: v.voiceId, label: v.prefix || v.voiceId }))]}
            />
          </div>
        )}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">Voice ID</label>
          <input
            value={voiceId}
            onChange={(e) => { const v = e.target.value; setVoiceId(v); updateNodeData({ voiceId: v }); }}
            placeholder="输入 Voice ID"
            className="nodrag w-full p-2 text-xs rounded-md border outline-none transition-colors bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 focus:bg-white dark:focus:bg-white/10 border-slate-200 dark:border-white/10 focus:border-purple-400 dark:focus:border-purple-400/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">合成文本</label>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); updateNodeData({ text: e.target.value }); }}
            placeholder="输入要合成的文本"
            className="nodrag w-full p-2 text-xs rounded-md border outline-none resize-none overflow-hidden transition-colors font-mono leading-relaxed bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 focus:bg-white dark:focus:bg-white/10 border-slate-200 dark:border-white/10 focus:border-purple-400 dark:focus:border-purple-400/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30"
            rows={3}
          />
        </div>
        <button onClick={handleSynthesize} disabled={isBusy || (data as any)._canEdit === false} className={`nodrag w-full mt-2 py-2 text-[10px] font-bold rounded-lg border transition-all active:scale-95 flex items-center justify-center gap-2 ${isBusy ? 'bg-gray-600 dark:bg-gray-700 text-white' : 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white shadow-md hover:shadow-lg border-transparent dark:border-white/10'}`}>
          {isBusy ? '合成中...' : '生成语音'}
        </button>
        {data.config.outputUrl && (
          <audio controls src={data.config.outputUrl} className="w-full" />
        )}
      </div>
      <CustomHandle
        type="source"
        position={Position.Right}
        id={`${id}-source`}
        className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
      />
    </div>
  );
};

export default memo(AudioVoiceNode);
