import NodeCreatorBadge from '../NodeCreatorBadge';
import { memo, useState, useEffect, useRef } from 'react';
import { NodeProps, Position, useReactFlow, useStore, useNodes } from 'reactflow';
import { apiClient } from '../../../lib/api';
import { toast } from 'sonner';
import CustomHandle from '../CustomHandle';
import CustomSelect from './CustomSelect';
import { isLocalStorageEnabled, getLocalServerUrl } from '../../../store/tenantStorageStore';

interface NodeData {
    label: string;
    type: string;
    config: {
        modelId?: string;
        voiceId?: string;
        voiceName?: string;
        cloneAudioUrl?: string;
        promptAudioUrl?: string;
        promptText?: string;
        previewText?: string;
        sampleUrl?: string;
        status?: string;
    };
    models?: any[];
}



const VoiceCloneNode = ({ data, id, selected }: NodeProps<NodeData>) => {
    const { setNodes, setEdges, getNode } = useReactFlow();
    const [modelId, setModelId] = useState<string>(data.config.modelId || '');
    const [voiceId, setVoiceId] = useState<string>(data.config.voiceId || '');
    const [voiceName, setVoiceName] = useState<string>(data.config.voiceName || '');
    const [cloneAudioUrl, setCloneAudioUrl] = useState<string>(data.config.cloneAudioUrl || '');
    const [promptAudioUrl, setPromptAudioUrl] = useState<string>(data.config.promptAudioUrl || '');
    const [promptText, setPromptText] = useState<string>(data.config.promptText || '');
    const [previewText, setPreviewText] = useState<string>(data.config.previewText || '欢迎使用 MiniMax 语音克隆服务，这是一个合成示例。');
    const [isBusy, setIsBusy] = useState(false);


    // Auto-generate voiceId if not exists
    // Auto-generate voiceId if not exists or invalid format
    useEffect(() => {
        const generateId = () => {
            const randomDigits = Math.floor(Math.random() * 1e16).toString().padStart(16, '0');
            return `Waule${randomDigits}`;
        };

        if (!voiceId || (!voiceId.startsWith('Waule') && !voiceId.startsWith('Aivider')) || voiceId.startsWith('minimax-')) {
            const generatedId = generateId();
            setVoiceId(generatedId);
            updateNode({ voiceId: generatedId });
        }
    }, [voiceId]);

    const connectedEdges = useStore((state) => state.edges.filter((e: any) => e.target === id));
    const allNodes = useNodes();
    const lastSigRef = useRef<string>('');

    // apiBase removed as it was only used for computedSampleSrc

    // Auto-select MiniMax model
    useEffect(() => {
        if (!modelId) {
            const list = (data.models || []).filter((m: any) => {
                if (m.type !== 'AUDIO_SYNTHESIS' || !m.isActive) return false;
                const provider = String(m.provider || '').toLowerCase();
                return provider.includes('minimaxi') || provider.includes('hailuo') || provider.includes('海螺');
            });
            const first = list[0];
            if (first) {
                setModelId(first.id);
                updateNode({ modelId: first.id });
            }
        }
    }, [data.models, modelId]);

    // Handle inputs from connected nodes
    useEffect(() => {
        try {
            const stateKey = connectedEdges
                .map((e: any) => `${e.id}-${e.source}-${e.targetHandle || ''}`)
                .sort()
                .join(',');

            if (stateKey === lastSigRef.current) return;
            lastSigRef.current = stateKey;

            let newCloneUrl = '';
            let newPromptUrl = '';

            for (const e of connectedEdges as any[]) {
                const src: any = getNode(e.source);
                if (!src) continue;
                const d: any = src.data || {};
                const t = String(src.type || '').toLowerCase();

                const getAudioUrl = () => {
                    if (t === 'upload') {
                        const f = (d.config?.uploadedFiles || []).find((x: any) => {
                            const tp = (x?.type || '').toUpperCase();
                            const m = (x?.mimeType || '').toLowerCase();
                            return tp === 'AUDIO' || m.startsWith('audio/');
                        });
                        return f?.url;
                    }
                    if (t === 'assetSelector') {
                        const a = d.config?.selectedAsset;
                        const tp = (a?.type || '').toUpperCase();
                        const m = (a?.mimeType || '').toLowerCase();
                        if ((tp === 'AUDIO' || m.startsWith('audio/'))) return a?.url;
                    }
                    return null;
                };

                const url = getAudioUrl();
                if (url) {
                    if (e.targetHandle === `${id}-target-clone`) newCloneUrl = url;
                    if (e.targetHandle === `${id}-target-prompt`) newPromptUrl = url;
                }
            }

            if (newCloneUrl !== cloneAudioUrl) {
                setCloneAudioUrl(newCloneUrl);
                updateNode({ cloneAudioUrl: newCloneUrl });
            }
            if (newPromptUrl !== promptAudioUrl) {
                setPromptAudioUrl(newPromptUrl);
                updateNode({ promptAudioUrl: newPromptUrl });
            }

        } catch { }
    }, [connectedEdges, allNodes, getNode, id, cloneAudioUrl, promptAudioUrl]);

    const updateNode = (updates: Partial<NodeData['config']>) => {
        setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, ...updates } } } : n));
    };

    const handleSaveVoice = async () => {
        if (!voiceId || !voiceName) {
            toast.error('请输入音色名称');
            return;
        }

        try {
            await apiClient.ai.audio.voices.add({ voiceId, prefix: voiceName });
            toast.success('音色已保存到自定义音色列表');
        } catch (e: any) {
            const msg = e?.response?.data?.message || e?.message || '保存失败';
            toast.error(msg);
        }
    };

    const handleCreate = async () => {
        if (!modelId || !voiceName || !cloneAudioUrl) {
            toast.error('请填写完整信息：模型、音色名称、克隆音频');
            return;
        }

        setIsBusy(true);
        toast.success('正在提交克隆任务...');

        try {
            const models = (data.models || []) as any[];
            const sel = models.find((m: any) => m.id === modelId);
            const tm = sel?.modelId || 'speech-2.6-hd';

            let urlForApi = cloneAudioUrl;
            if (urlForApi.startsWith('http')) {
                // Ensure it's accessible
            }

            // Always generate a new Voice ID for each clone attempt to avoid "duplicate voice id" error
            const newVoiceId = `Waule${Math.floor(Math.random() * 1e16).toString().padStart(16, '0')}`;
            setVoiceId(newVoiceId);
            updateNode({ voiceId: newVoiceId });

            const resp = await apiClient.ai.audio.createVoice({
                modelId,
                targetModel: tm,
                prefix: voiceName,
                url: urlForApi,
                promptUrl: promptAudioUrl || undefined,
                promptText: promptText || undefined,
                voiceId: newVoiceId,
                previewText: previewText || undefined
            });

            const resData = (resp as any)?.data || resp;
            const sUrl = resData?.sampleUrl;

            if (sUrl) {
                let audioUrl = sUrl;
                
                // 本地存储模式：将音频下载到本地
                if (isLocalStorageEnabled()) {
                    const localServerUrl = getLocalServerUrl();
                    if (localServerUrl && sUrl.includes('aliyuncs.com')) {
                        try {
                            // 下载音频文件
                            const response = await fetch(sUrl);
                            const audioBlob = await response.blob();
                            const fileName = `voice-clone-${Date.now()}.mp3`;
                            
                            const formData = new FormData();
                            formData.append('file', audioBlob, fileName);
                            formData.append('userId', 'voice');
                            
                            const uploadResponse = await fetch(`${localServerUrl}/api/upload`, {
                                method: 'POST',
                                body: formData,
                            });
                            
                            if (uploadResponse.ok) {
                                const result = await uploadResponse.json();
                                if (result.localUrl) {
                                    audioUrl = result.localUrl;
                                    console.log('[VoiceClone] 音频已上传到本地服务器:', audioUrl);
                                }
                            }
                        } catch (uploadError) {
                            console.warn('[VoiceClone] 上传到本地失败，使用原URL:', uploadError);
                        }
                    }
                }
                
                updateNode({ sampleUrl: audioUrl, status: 'OK', voiceName });
                toast.success('克隆成功，试听音频已生成');

                // Auto-create audio preview node
                const currentNode = getNode(id);
                if (currentNode) {
                    const newNodeId = `audioPreview-${Date.now()}`;
                    const newNode = {
                        id: newNodeId,
                        type: 'audioPreview',
                        position: {
                            x: currentNode.position.x + 450,
                            y: currentNode.position.y,
                        },
                        data: {
                            label: '音频预览',
                            type: 'audioPreview',
                            audioUrl: audioUrl,
                            config: {
                                audioUrl: audioUrl,
                                title: `${voiceName} - 试听`,
                            },
                            models: data.models,
                            createdBy: (currentNode.data as any)?.createdBy, // 🔑 继承父节点的创建者信息（协作者拖动权限）
                        },
                    };

                    setNodes((nds) => [...nds, newNode as any]);

                    // Create edge connecting VoiceCloneNode to AudioPreviewNode
                    const newEdge = {
                        id: `e-${id}-source-${newNodeId}-target`,
                        source: id,
                        sourceHandle: `${id}-source`,
                        target: newNodeId,
                        targetHandle: `${newNodeId}-target`,
                        type: 'aurora',
                    };

                    // We need to access setEdges from store or useReactFlow
                    // Since setEdges is not destructured from useReactFlow above, we need to add it or use store
                    // But wait, useReactFlow returns { setNodes, setEdges, ... }
                    // Let's check the destructuring at the top of the component
                    // It is: const { setNodes, getNode } = useReactFlow();
                    // We need to add setEdges there.
                    setEdges((eds) => [...eds, newEdge]);
                }
            } else {
                updateNode({ status: 'OK', voiceName });
                toast.success('克隆任务已提交');
            }

        } catch (e: any) {
            const msg = e?.response?.data?.message || e?.message || '创建失败';
            toast.error(msg);
        }
        setIsBusy(false);
    };

    // computedSampleSrc removed as audio player is removed

    return (
        <div className={`relative bg-white/80 dark:bg-[#18181b]/100 dark:backdrop-blur-none backdrop-blur-sm border rounded-2xl shadow-xl transition-all ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-white/60 dark:border-neutral-700 ring-black/5 dark:ring-neutral-700 ring-black/5'}`} style={{ width: 320 }}>
      {/* 创建者头像徽章 */}
      <NodeCreatorBadge createdBy={(data as any).createdBy} isSharedWorkflow={(data as any)._isSharedWorkflow} />

            <CustomHandle
                type="target"
                position={Position.Left}
                id={`${id}-target-clone`}
                label="克隆音频"
                style={{ top: '30%' }}
                className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
            />
            <CustomHandle
                type="target"
                position={Position.Left}
                id={`${id}-target-prompt`}
                label="提示音频"
                style={{ top: '50%' }}
                className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
            />

            <div className="flex items-center justify-between px-4 py-3 rounded-t-2xl border-slate-200 dark:border-neutral-800 bg-white dark:bg-[#18181b]">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 0, "wght" 200, "GRAD" 0, "opsz" 20' }}>record_voice_over</span>
                    <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-white">音色克隆</span>
                </div>
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse shadow-[0_0_5px_currentColor]"></div>
            </div>

            <div className="p-4 space-y-4">

                {/* Model Selection */}
                <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">模型</label>
                    <CustomSelect
                        value={modelId}
                        onChange={(value) => { setModelId(value); updateNode({ modelId: value }); }}
                        options={(data.models || []).filter((m: any) => {
                            if (m.type !== 'AUDIO_SYNTHESIS' || !m.isActive) return false;
                            if (Array.isArray(m.capabilities)) {
                                return m.capabilities.some((c: any) => c.capability === '音色克隆' && c.supported);
                            }
                            const provider = String(m.provider || '').toLowerCase();
                            return provider.includes('minimaxi') || provider.includes('hailuo') || provider.includes('海螺');
                        }).map((m: any) => ({ value: m.id, label: m.name }))}
                    />
                </div>

                {/* Voice Name Input */}
                <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">音色名称</label>
                    <div className="flex items-center gap-2">
                        <input
                            value={voiceName}
                            onChange={(e) => { setVoiceName(e.target.value); updateNode({ voiceName: e.target.value }); }}
                            placeholder="输入音色名称"
                            className="nodrag flex-1 p-2 text-xs rounded-md border outline-none transition-colors bg-slate-100 dark:bg-[#000000] backdrop-blur-none hover:bg-slate-200 dark:hover:bg-neutral-800 focus:bg-white dark:focus:bg-neutral-800 border-slate-200 dark:border-neutral-800 focus:border-neutral-400 dark:focus:border-neutral-400/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500"
                            onMouseDown={(e) => e.stopPropagation()}
                        />
                        <button
                            onClick={handleSaveVoice}
                            disabled={!voiceId || !voiceName}
                            className={`nodrag px-3 py-2 text-[10px] font-bold rounded-lg border transition-all whitespace-nowrap ${!voiceId || !voiceName ? 'bg-neutral-400 dark:bg-neutral-700 text-white dark:text-neutral-300 opacity-50' : 'bg-gradient-to-r from-green-500 to-emerald-500 dark:from-green-600/50 dark:to-emerald-600/50 text-white shadow-md hover:shadow-lg border-transparent dark:border-neutral-700'}`}
                        >
                            保存
                        </button>
                    </div>
                </div>

                {/* Status Indicators */}
                <div className="space-y-2 bg-slate-100/50 dark:bg-black p-3 rounded-lg border border-slate-200 dark:border-neutral-800">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 dark:text-slate-400">克隆音频:</span>
                        <span className={cloneAudioUrl ? "text-green-500 dark:text-green-400" : "text-red-500 dark:text-red-400"}>{cloneAudioUrl ? "✓ 已连接" : "✕ 未连接"}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 dark:text-slate-400">提示音频:</span>
                        <span className={promptAudioUrl ? "text-green-500 dark:text-green-400" : "text-slate-400 dark:text-slate-500"}>{promptAudioUrl ? "✓ 已连接" : "可选"}</span>
                    </div>
                </div>

                {/* Prompt Text */}
                <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">提示文本 (可选)</label>
                    <textarea
                        value={promptText}
                        onChange={(e) => { setPromptText(e.target.value); updateNode({ promptText: e.target.value }); }}
                        placeholder="输入提示音频对应的文本内容..."
                        className="nodrag w-full p-2 text-xs rounded-md border outline-none resize-none transition-colors font-mono leading-relaxed bg-slate-100 dark:bg-[#000000] backdrop-blur-none hover:bg-slate-200 dark:hover:bg-neutral-800 focus:bg-white dark:focus:bg-neutral-800 border-slate-200 dark:border-neutral-800 focus:border-neutral-400 dark:focus:border-neutral-400/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500"
                        rows={2}
                        onMouseDown={(e) => e.stopPropagation()}
                    />
                </div>

                {/* Preview Text */}
                <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">试听文本</label>
                    <textarea
                        value={previewText}
                        onChange={(e) => { setPreviewText(e.target.value); updateNode({ previewText: e.target.value }); }}
                        placeholder="输入用于生成试听音频的文本..."
                        className="nodrag w-full p-2 text-xs rounded-md border outline-none resize-none transition-colors font-mono leading-relaxed bg-slate-100 dark:bg-[#000000] backdrop-blur-none hover:bg-slate-200 dark:hover:bg-neutral-800 focus:bg-white dark:focus:bg-neutral-800 border-slate-200 dark:border-neutral-800 focus:border-neutral-400 dark:focus:border-neutral-400/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500"
                        rows={2}
                        onMouseDown={(e) => e.stopPropagation()}
                    />
                </div>

                {/* Action Button */}
                <button
                    onClick={handleCreate}
                    disabled={isBusy || (data as any)._canEdit === false}
                    className={`nodrag w-full mt-2 py-2 text-[10px] font-bold rounded-lg border transition-all active:scale-95 flex items-center justify-center gap-2 ${isBusy || (data as any)._canEdit === false ? 'bg-neutral-400 dark:bg-neutral-700 text-white dark:text-neutral-300 cursor-not-allowed border-transparent dark:border-neutral-700' : 'bg-neutral-800 dark:bg-white text-white dark:text-black shadow-md hover:shadow-lg border-transparent dark:border-neutral-700'}`}
                >
                    {isBusy ? '克隆中...' : '开始克隆'}
                </button>

                {/* Sample Audio Player - Removed as per user request, using AudioPreviewNode instead */}

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

export default memo(VoiceCloneNode);
