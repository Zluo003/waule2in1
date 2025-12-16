import NodeCreatorBadge from '../NodeCreatorBadge';
import { memo, useState, useEffect, useRef } from 'react';
import { NodeProps, Position, useReactFlow } from 'reactflow';
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
    text?: string;
    outputUrl?: string;
    status?: string;
  };
  models?: any[];
}

const SYSTEM_VOICES: Array<{ id: string; label: string }> = [
  { id: 'male-qn-qingse', label: '中文 (普通话) 青涩青年' },
  { id: 'male-qn-jingying', label: '中文 (普通话) 精英青年' },
  { id: 'male-qn-badao', label: '中文 (普通话) 霸道青年' },
  { id: 'male-qn-daxuesheng', label: '中文 (普通话) 青年大学生' },
  { id: 'female-shaonv', label: '中文 (普通话) 少女' },
  { id: 'female-yujie', label: '中文 (普通话) 御姐' },
  { id: 'female-chengshu', label: '中文 (普通话) 成熟女性' },
  { id: 'female-tianmei', label: '中文 (普通话) 甜美女性' },
  { id: 'male-qn-qingse-jingpin', label: '中文 (普通话) 青涩青年(beta)' },
  { id: 'male-qn-jingying-jingpin', label: '中文 (普通话) 精英青年(beta)' },
  { id: 'male-qn-badao-jingpin', label: '中文 (普通话) 霸道青年(beta)' },
  { id: 'male-qn-daxuesheng-jingpin', label: '中文 (普通话) 青年大学生(beta)' },
  { id: 'female-shaonv-jingpin', label: '中文 (普通话) 少女(beta)' },
  { id: 'female-yujie-jingpin', label: '中文 (普通话) 御姐(beta)' },
  { id: 'female-chengshu-jingpin', label: '中文 (普通话) 成熟女性(beta)' },
  { id: 'female-tianmei-jingpin', label: '中文 (普通话) 甜美女性(beta)' },
  { id: 'clever_boy', label: '中文 (普通话) 聪明男童' },
  { id: 'cute_boy', label: '中文 (普通话) 可爱男童' },
  { id: 'lovely_girl', label: '中文 (普通话) 萌萌女童' },
  { id: 'cartoon_pig', label: '中文 (普通话) 卡通猪小琪' },
  { id: 'bingjiao_didi', label: '中文 (普通话) 病娇弟弟' },
  { id: 'junlang_nanyou', label: '中文 (普通话) 俊朗男友' },
  { id: 'chunzhen_xuedi', label: '中文 (普通话) 纯真学弟' },
  { id: 'lengdan_xiongzhang', label: '中文 (普通话) 冷淡学长' },
  { id: 'badao_shaoye', label: '中文 (普通话) 霸道少爷' },
  { id: 'tianxin_xiaoling', label: '中文 (普通话) 甜心小玲' },
  { id: 'qiaopi_mengmei', label: '中文 (普通话) 俏皮萌妹' },
  { id: 'wumei_yujie', label: '中文 (普通话) 妩媚御姐' },
  { id: 'diadia_xuemei', label: '中文 (普通话) 嗲嗲学妹' },
  { id: 'danya_xuejie', label: '中文 (普通话) 淡雅学姐' },
  { id: 'Chinese (Mandarin)_Reliable_Executive', label: '中文 (普通话) 沉稳高管' },
  { id: 'Chinese (Mandarin)_News_Anchor', label: '中文 (普通话) 新闻女声' },
  { id: 'Chinese (Mandarin)_Mature_Woman', label: '中文 (普通话) 傲娇御姐' },
  { id: 'Chinese (Mandarin)_Unrestrained_Young_Man', label: '中文 (普通话) 不羁青年' },
  { id: 'Arrogant_Miss', label: '中文 (普通话) 嚣张小姐' },
  { id: 'Robot_Armor', label: '中文 (普通话) 机械战甲' },
  { id: 'Chinese (Mandarin)_Kind-hearted_Antie', label: '中文 (普通话) 热心大婶' },
  { id: 'Chinese (Mandarin)_HK_Flight_Attendant', label: '中文 (普通话) 港普空姐' },
  { id: 'Chinese (Mandarin)_Humorous_Elder', label: '中文 (普通话) 搞笑大爷' },
  { id: 'Chinese (Mandarin)_Gentleman', label: '中文 (普通话) 温润男声' },
  { id: 'Chinese (Mandarin)_Warm_Bestie', label: '中文 (普通话) 温暖闺蜜' },
  { id: 'Chinese (Mandarin)_Male_Announcer', label: '中文 (普通话) 播报男声' },
  { id: 'Chinese (Mandarin)_Sweet_Lady', label: '中文 (普通话) 甜美女声' },
  { id: 'Chinese (Mandarin)_Southern_Young_Man', label: '中文 (普通话) 南方小哥' },
  { id: 'Chinese (Mandarin)_Wise_Women', label: '中文 (普通话) 阅历姐姐' },
  { id: 'Chinese (Mandarin)_Gentle_Senior', label: '中文 (普通话) 温柔学姐' },
  { id: 'Chinese (Mandarin)_Warm_Girl', label: '中文 (普通话) 温暖少女' },
  { id: 'Chinese (Mandarin)_Kind-hearted_Elder', label: '中文 (普通话) 花甲奶奶' },
  { id: 'Chinese (Mandarin)_Cute_Spirit', label: '中文 (普通话) 憨憨萌兽' },
  { id: 'Chinese (Mandarin)_Radio_Host', label: '中文 (普通话) 电台男主播' },
  { id: 'Chinese (Mandarin)_Lyrical_Voice', label: '中文 (普通话) 抒情男声' },
  { id: 'Chinese (Mandarin)_Straightforward_Boy', label: '中文 (普通话) 率真弟弟' },
  { id: 'Chinese (Mandarin)_Sincere_Adult', label: '中文 (普通话) 真诚青年' },
  { id: 'Chinese (Mandarin)_Gentle_Senior', label: '中文 (普通话) 温柔学姐' },
  { id: 'Chinese (Mandarin)_Stubborn_Friend', label: '中文 (普通话) 嘴硬竹马' },
  { id: 'Chinese (Mandarin)_Crisp_Girl', label: '中文 (普通话) 清脆少女' },
  { id: 'Chinese (Mandarin)_Pure-hearted_Boy', label: '中文 (普通话) 清澈邻家弟弟' },
  { id: 'Chinese (Mandarin)_Soft_Girl', label: '中文 (普通话) 软软女孩' },
  { id: 'Cantonese_ProfessionalHost（F)', label: '中文 (粤语) 专业女主持' },
  { id: 'Cantonese_GentleLady', label: '中文 (粤语) 温柔女声' },
  { id: 'Cantonese_ProfessionalHost（M)', label: '中文 (粤语) 专业男主持' },
  { id: 'Cantonese_PlayfulMan', label: '中文 (粤语) 活泼男声' },
  { id: 'Cantonese_CuteGirl', label: '中文 (粤语) 可爱女孩' },
  { id: 'Cantonese_KindWoman', label: '中文 (粤语) 善良女声' },
  { id: 'Santa_Claus', label: '英文 Santa Claus' },
  { id: 'Grinch', label: '英文 Grinch' },
  { id: 'Rudolph', label: '英文 Rudolph' },
  { id: 'Arnold', label: '英文 Arnold' },
  { id: 'Charming_Santa', label: '英文 Charming Santa' },
  { id: 'Charming_Lady', label: '英文 Charming Lady' },
  { id: 'Sweet_Girl', label: '英文 Sweet Girl' },
  { id: 'Cute_Elf', label: '英文 Cute Elf' },
  { id: 'Attractive_Girl', label: '英文 Attractive Girl' },
  { id: 'Serene_Woman', label: '英文 Serene Woman' },
  { id: 'English_Trustworthy_Man', label: '英文 Trustworthy Man' },
  { id: 'English_Graceful_Lady', label: '英文 Graceful Lady' },
  { id: 'English_Aussie_Bloke', label: '英文 Aussie Bloke' },
  { id: 'English_Whispering_girl', label: '英文 Whispering girl' },
  { id: 'English_Diligent_Man', label: '英文 Diligent Man' },
  { id: 'English_Gentle-voiced_man', label: '英文 Gentle-voiced man' },
  { id: 'Japanese_IntellectualSenior', label: '日文 Intellectual Senior' },
  { id: 'Japanese_DecisivePrincess', label: '日文 Decisive Princess' },
  { id: 'Japanese_LoyalKnight', label: '日文 Loyal Knight' },
  { id: 'Japanese_DominantMan', label: '日文 Dominant Man' },
  { id: 'Japanese_SeriousCommander', label: '日文 Serious Commander' },
  { id: 'Japanese_ColdQueen', label: '日文 Cold Queen' },
  { id: 'Japanese_DependableWoman', label: '日文 Dependable Woman' },
  { id: 'Japanese_GentleButler', label: '日文 Gentle Butler' },
  { id: 'Japanese_KindLady', label: '日文 Kind Lady' },
  { id: 'Japanese_CalmLady', label: '日文 Calm Lady' },
  { id: 'Japanese_OptimisticYouth', label: '日文 Optimistic Youth' },
  { id: 'Japanese_GenerousIzakayaOwner', label: '日文 Generous Izakaya Owner' },
  { id: 'Japanese_SportyStudent', label: '日文 Sporty Student' },
  { id: 'Japanese_InnocentBoy', label: '日文 Innocent Boy' },
  { id: 'Japanese_GracefulMaiden', label: '日文 Graceful Maiden' },
  { id: 'Korean_SweetGirl', label: '韩文 Sweet Girl' },
  { id: 'Korean_CheerfulBoyfriend', label: '韩文 Cheerful Boyfriend' },
  { id: 'Korean_EnchantingSister', label: '韩文 Enchanting Sister' },
  { id: 'Korean_ShyGirl', label: '韩文 Shy Girl' },
  { id: 'Korean_ReliableSister', label: '韩文 Reliable Sister' },
  { id: 'Korean_StrictBoss', label: '韩文 Strict Boss' },
];

const AudioSynthesizeNode = ({ data, id, selected }: NodeProps<NodeData>) => {
  const { setNodes, getNode, setEdges } = useReactFlow();
  const [modelId, setModelId] = useState<string>(data.config.modelId || '');
  const [voiceId, setVoiceId] = useState<string>(data.config.voiceId || '');

  const [text, setText] = useState<string>(data.config.text || '你好，这是语音合成预览');
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const [language, setLanguage] = useState<'zh' | 'yue' | 'en' | 'ja' | 'ko' | 'custom'>('zh');
  const blobUrlRef = useRef<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewBlobUrlRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [savedVoices, setSavedVoices] = useState<Array<{ id: string; voiceId: string; prefix?: string; targetModel?: string }>>([]);
  const reloadSavedVoices = async () => { try { const resp = await apiClient.ai.audio.voices.list(); const list = (resp as any)?.data ?? resp; setSavedVoices(Array.isArray(list) ? list : []); } catch { } };

  const unlockAudio = async () => {
    try {
      const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new AC();
      const ctx = audioCtxRef.current as AudioContext;
      if (ctx.state === 'suspended') await ctx.resume();
    } catch { }
  };

  const [isBusy, setIsBusy] = useState(false);


  const [emotion] = useState<string>('');
  const [sampleRate] = useState<number | undefined>(undefined);
  const [format] = useState<'mp3' | 'wav'>('mp3');
  const [rate] = useState<number | undefined>(undefined);
  const [volume] = useState<number | undefined>(undefined);
  const [pitch] = useState<number | undefined>(undefined);
  // 保留以匹配节点配置但不再使用，避免类型错误
  const [outputFormat] = useState<'hex' | 'url'>('url'); void outputFormat;

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

  useEffect(() => { reloadSavedVoices(); }, []);
  useEffect(() => { if (language === 'custom') { reloadSavedVoices(); } }, [language]);

  // 还原后不再使用 voiceSource/savedVoices，这里移除副作用以避免未定义引用



  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);



  const updateNodeData = (updates: Partial<NodeData['config']>) => {
    const current = getNode(id);
    if (!current) return;
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, ...updates } } } : n));
  };

  const handleSynthesize = async (preview = false) => {
    let vid = (voiceId || data.config.voiceId || '').trim();
    if (preview && !vid) {
      if (language === 'custom') {
        const pick = savedVoices[0];
        if (pick) { vid = String(pick.voiceId); setVoiceId(vid); updateNodeData({ voiceId: vid }); }
      } else {
        const pick = SYSTEM_VOICES.find((v) => {
          const l = v.label;
          if (language === 'zh') return l.startsWith('中文 (普通话)');
          if (language === 'yue') return l.startsWith('中文 (粤语)');
          if (language === 'en') return l.startsWith('英文 ');
          if (language === 'ja') return l.startsWith('日文 ');
          if (language === 'ko') return l.startsWith('韩文 ');
          return true;
        });
        if (pick) { vid = pick.id; setVoiceId(vid); updateNodeData({ voiceId: vid }); }
      }
    }
    const txt = (preview ? '很高兴认识您，祝您创作愉快！' : (text || '').trim());
    if (!vid || !txt) { toast.error('请选择音色并输入文本'); return; }
    let mid = modelId;
    if (!mid) {
      const list = (data.models || []).filter((m: any) => m.type === 'AUDIO_SYNTHESIS' && m.isActive);
      if (list[0]) { mid = list[0].id; setModelId(mid); updateNodeData({ modelId: mid }); }
      else { toast.error('请先在后台配置语音合成模型'); return; }
    }
    setIsBusy(true);
    try {
      if (preview) await unlockAudio();
      const adv: any = {};
      if (emotion) { try { adv.voice_modify = { emotion }; } catch { } }
      const resp = await apiClient.ai.audio.synthesize({ modelId: mid, voiceId: vid, text: txt, format, sampleRate, volume, rate, pitch, output_format: 'hex', language_boost: 'auto', audio_setting: { channel: 2 }, ...adv });
      const url = (resp as any)?.data?.url || (resp as any)?.url;
      const apiBase = window.location.origin;
      const normalizeUrl = (u?: string): string => {
        if (!u) return '';
        try {
          if (u.startsWith('http://localhost:3000') || u.startsWith('http://127.0.0.1:3000')) {
            const p = new URL(u).pathname;
            return `${apiBase}${p}`;
          }
          if (u.startsWith('http')) return u;
          if (u.startsWith('/')) return `${apiBase}${u}`;
          return `${apiBase}/${u}`;
        } catch {
          return u;
        }
      };
      const absolute = normalizeUrl(url);
      let buf: ArrayBuffer | undefined;
      const detectMime = (bytes: Uint8Array): string => {
        if (bytes.length >= 12) {
          if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) return 'audio/wav';
          if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'audio/mpeg';
          if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'audio/mpeg';
        }
        return format === 'wav' ? 'audio/wav' : 'audio/mpeg';
      };
      const detectMp4 = (bytes: Uint8Array) => bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
      const detectOgg = (bytes: Uint8Array) => bytes.length >= 4 && bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53;
      const detectFlac = (bytes: Uint8Array) => bytes.length >= 4 && bytes[0] === 0x66 && bytes[1] === 0x4C && bytes[2] === 0x61 && bytes[3] === 0x43;
      const bytes = new Uint8Array(buf || new ArrayBuffer(0));
      let mime = detectMime(bytes);
      if (!mime || mime === 'application/octet-stream') {
        if (detectMp4(bytes)) mime = 'audio/mp4';
        else if (detectOgg(bytes)) mime = 'audio/ogg';
        else if (detectFlac(bytes)) mime = 'audio/flac';
      }
      let blobUrl: string | undefined;
      if (preview) {
        if (previewSourceRef.current) { try { previewSourceRef.current.stop(); } catch { } previewSourceRef.current.disconnect(); previewSourceRef.current = null; }
        const a = previewAudioRef.current || new Audio();
        a.preload = 'auto';
        (a as any).autoplay = true;
        (a as any).playsInline = true;
        a.crossOrigin = 'anonymous';
        previewAudioRef.current = a;
        let played = false;
        const waitEvent = (el: HTMLAudioElement, ev: string, ms = 1500) => new Promise<boolean>((resolve) => {
          let done = false;
          const onOk = () => { if (done) return; done = true; cleanup(); resolve(true); };
          const onFail = () => { if (done) return; done = true; cleanup(); resolve(false); };
          const cleanup = () => { el.removeEventListener(ev, onOk); el.removeEventListener('error', onFail); };
          el.addEventListener(ev, onOk);
          el.addEventListener('error', onFail);
          setTimeout(() => { onFail(); }, ms);
        });

        try {
          const hexToBytes = (h: string) => {
            const s = (h || '').replace(/\s+/g, '');
            const out = new Uint8Array(Math.floor(s.length / 2));
            for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
            return out;
          };
          const hex = (resp as any)?.data?.hex || (resp as any)?.hex;
          const fb = hex ? hexToBytes(String(hex)).buffer : undefined;
          if (fb && (fb as ArrayBuffer).byteLength > 0) {
            const bytes = new Uint8Array(fb);
            const mime = detectMime(bytes);
            const blob = new Blob([fb], { type: mime });
            const objectUrl = URL.createObjectURL(blob);
            if (previewBlobUrlRef.current) { try { URL.revokeObjectURL(previewBlobUrlRef.current); } catch { } }
            previewBlobUrlRef.current = objectUrl;
            a.src = objectUrl;
            a.load();
            const ok = await waitEvent(a, 'canplay');
            if (!ok) throw new Error('blob not ready');
            await a.play();
            played = true;
          } else {
            throw new Error('no hex');
          }
        } catch {
          played = false;
        }
        if (!played) {
          try {
            const hexToBytes = (h: string) => {
              const s = (h || '').replace(/\s+/g, '');
              const out = new Uint8Array(Math.floor(s.length / 2));
              for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
              return out;
            };
            const hex = (resp as any)?.data?.hex || (resp as any)?.hex;
            const fb = hex ? hexToBytes(String(hex)).buffer : undefined;
            if (!fb || (fb as ArrayBuffer).byteLength === 0) {
              const ab = await apiClient.assets.proxyDownload(absolute);
              if (!ab || ab.byteLength === 0) throw new Error('音频数据为空或不完整');
              const bytes = new Uint8Array(ab);
              const mime = detectMime(bytes);
              const blob = new Blob([ab], { type: mime });
              const objectUrl = URL.createObjectURL(blob);
              if (previewBlobUrlRef.current) { try { URL.revokeObjectURL(previewBlobUrlRef.current); } catch { } }
              previewBlobUrlRef.current = objectUrl;
              a.src = objectUrl;
              a.load();
              const ok = await waitEvent(a, 'canplay');
              if (!ok) throw new Error('blob not ready');
              await a.play();
              played = true;
            } else {
              const bytes = new Uint8Array(fb);
              const mime = detectMime(bytes);
              const blob = new Blob([fb], { type: mime });
              const objectUrl = URL.createObjectURL(blob);
              if (previewBlobUrlRef.current) { try { URL.revokeObjectURL(previewBlobUrlRef.current); } catch { } }
              previewBlobUrlRef.current = objectUrl;
              a.src = objectUrl;
              a.load();
              const ok = await waitEvent(a, 'canplay');
              if (!ok) throw new Error('blob not ready');
              await a.play();
              played = true;
            }
          } catch { }
          if (!played) {
            throw new Error('音频拉取失败');
          }
        }
      } else {
        try {
          const fb = await apiClient.assets.proxyDownload(absolute);
          const bytes = new Uint8Array(fb);
          const mime = detectMime(bytes);
          blobUrl = URL.createObjectURL(new Blob([fb], { type: mime }));
        } catch { }
      }
      if (!preview && blobUrl) {
        if (blobUrlRef.current) { try { URL.revokeObjectURL(blobUrlRef.current); } catch { } }
        blobUrlRef.current = blobUrl;
        let stableUrl = absolute || blobUrl;
        
        // 本地存储模式：将音频上传到本地服务器
        if (isLocalStorageEnabled()) {
          const localServerUrl = getLocalServerUrl();
          if (localServerUrl) {
            try {
              // 获取 blob 数据
              const response = await fetch(blobUrl);
              const audioBlob = await response.blob();
              const fileName = `audio-${Date.now()}.${format || 'mp3'}`;
              
              const formData = new FormData();
              formData.append('file', audioBlob, fileName);
              formData.append('userId', 'audio');
              
              const uploadResponse = await fetch(`${localServerUrl}/api/upload`, {
                method: 'POST',
                body: formData,
              });
              
              if (uploadResponse.ok) {
                const result = await uploadResponse.json();
                if (result.localUrl) {
                  stableUrl = result.localUrl;
                  console.log('[AudioSynthesize] 音频已上传到本地服务器:', stableUrl);
                }
              }
            } catch (uploadError) {
              console.warn('[AudioSynthesize] 上传到本地失败，使用原URL:', uploadError);
            }
          }
        }
        
        updateNodeData({ outputUrl: stableUrl });
        try {
          const parent = getNode(id);
          if (parent) {
            const spacingX = 160;
            const parentEl = document.querySelector(`.react-flow__node[data-id="${parent.id}"]`) as HTMLElement | null;
            const parentW = Math.round((parentEl?.getBoundingClientRect().width || 420));
            const posX = parent.position.x + parentW + spacingX;
            const newId = `audio-preview-${Date.now()}`;
            setNodes((nds) => {
              const siblings = nds.filter((n: any) => n.type === 'audioPreview' && n.data?.sourceNodeId === id);
              const baseY = parent.position.y;
              const posY = siblings.length > 0 ? (Math.max(...siblings.map((s: any) => s.position?.y || baseY)) + 120) : baseY;
              return [...nds, { id: newId, type: 'audioPreview', position: { x: posX, y: posY }, data: { audioUrl: stableUrl, sourceNodeId: id, createdBy: (parent.data as any)?.createdBy } } as any];
            });
            setEdges((eds) => [...eds, { id: `${id}-${newId}`, source: id, target: newId } as any]);
          }
        } catch { }
      }
      if (preview && previewAudioRef.current && !previewAudioRef.current.paused) toast.success('音色预览已生成并播放');
      else if (!preview && blobUrl) toast.success('语音合成成功');
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || (preview ? '预览失败' : '语音合成失败');
      toast.error(msg);
    }
    setIsBusy(false);
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
            options={(data.models || []).filter((m: any) => m.type === 'AUDIO_SYNTHESIS' && m.isActive).map((m: any) => ({ value: m.id, label: m.name }))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">语言</label>
          <CustomSelect
            value={language}
            onChange={(value) => { setLanguage(value as any); if (value === 'custom') reloadSavedVoices(); }}
            options={[
              { value: 'zh', label: '中文(普通话)' },
              { value: 'yue', label: '中文(粤语)' },
              { value: 'en', label: '英文' },
              { value: 'ja', label: '日文' },
              { value: 'ko', label: '韩文' },
              { value: 'custom', label: '自定义音色' }
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">音色</label>
            <CustomSelect
              value={voiceId}
              onChange={(value) => { setVoiceId(value); updateNodeData({ voiceId: value }); }}
              options={[{ value: '', label: '选择音色' }, ...(language === 'custom' ? savedVoices.map(v => ({ value: v.voiceId, label: v.prefix || v.voiceId })) : SYSTEM_VOICES.filter(v => { const l = v.label; if (language === 'zh') return l.startsWith('中文 (普通话)'); if (language === 'yue') return l.startsWith('中文 (粤语)'); if (language === 'en') return l.startsWith('英文 '); if (language === 'ja') return l.startsWith('日文 '); if (language === 'ko') return l.startsWith('韩文 '); return true; }).map(v => ({ value: v.id, label: v.label.replace(/^中文 \(普通话\) |^中文 \(粤语\) |^英文 |^日文 |^韩文 /, '') })))]}
            />
          </div>
          <button onClick={() => handleSynthesize(true)} disabled={isBusy} className={`mt-auto w-9 h-9 rounded-full flex items-center justify-center text-white hover:shadow-lg ${isBusy ? 'bg-gray-600 dark:bg-gray-700' : ''}`} style={!isBusy ? { background: document.documentElement.classList.contains('dark') ? 'linear-gradient(to right, #4b1b77, #6f153f)' : 'linear-gradient(to right, #a855f7, #ec4899)' } : undefined}>
            <span className="material-symbols-outlined text-base">play_arrow</span>
          </button>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">合成文本</label>
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => { setText(e.target.value); updateNodeData({ text: e.target.value }); }}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="输入要合成的文本"
            className="nodrag w-full p-2 text-xs rounded-md border outline-none resize-none overflow-hidden transition-colors font-mono leading-relaxed bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 focus:bg-white dark:focus:bg-white/10 border-slate-200 dark:border-white/10 focus:border-purple-400 dark:focus:border-purple-400/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30"
          />
        </div>
        <button onClick={() => handleSynthesize(false)} disabled={isBusy || (data as any)._canEdit === false} className={`nodrag w-full mt-2 py-2 text-[10px] font-bold rounded-lg border transition-all active:scale-95 flex items-center justify-center gap-2 text-white shadow-md hover:shadow-lg ${isBusy || (data as any)._canEdit === false ? 'bg-gray-600 dark:bg-gray-700' : 'border-transparent dark:border-white/10'}`} style={!(isBusy || (data as any)._canEdit === false) ? { background: document.documentElement.classList.contains('dark') ? 'linear-gradient(to right, #4b1b77, #6f153f)' : 'linear-gradient(to right, #a855f7, #ec4899)' } : undefined}>
          {isBusy ? '合成中...' : '生成语音'}
        </button>
      </div>
      <audio ref={previewAudioRef} className="hidden" />
      <CustomHandle type="source" position={Position.Right} id={`${id}-source`} className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]" />
    </div>
  );
};

export default memo(AudioSynthesizeNode);