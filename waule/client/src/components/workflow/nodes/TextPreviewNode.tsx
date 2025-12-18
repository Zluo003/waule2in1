import { memo, useEffect, useRef, useState } from 'react';
import { NodeProps, useReactFlow, Position } from 'reactflow';
import { apiClient } from '../../../lib/api';
import { toast } from 'sonner';
import CustomHandle from '../CustomHandle';

interface TextPreviewData {
  content: string;
  timestamp?: number;
  noHandles?: boolean;
  title?: string;
  workflowContext?: {
    project?: any;
    episode?: any;
    nodeGroup?: any;
    nodeGroups?: any[];
  };
}

const TextPreviewNode = ({ data, id, selected }: NodeProps<TextPreviewData>) => {
  const { getNodes, getEdges, setEdges, setNodes, getNode } = useReactFlow();
  const [promptText, setPromptText] = useState<string>(data.content || '');
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const storyboardContainerRef = useRef<HTMLDivElement | null>(null);
  const textContentRef = useRef<HTMLDivElement | null>(null);
  
  // 阻止滚轮事件冒泡到画布，使用原生事件监听
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.stopPropagation();
    };
    
    const container = containerRef.current;
    const sbContainer = storyboardContainerRef.current;
    
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: true });
    }
    if (sbContainer) {
      sbContainer.addEventListener('wheel', handleWheel, { passive: true });
    }
    
    const textContent = textContentRef.current;
    if (textContent) {
      textContent.addEventListener('wheel', handleWheel, { passive: true });
    }
    
    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
      if (sbContainer) {
        sbContainer.removeEventListener('wheel', handleWheel);
      }
      if (textContent) {
        textContent.removeEventListener('wheel', handleWheel);
      }
    };
  }, []);
  const saveTimerRef = useRef<number | null>(null);
  const saveStoryboard = async (updates: Record<string, string>) => {
    try {
      const ctx = (data as any)?.workflowContext || {};
      const ep = ctx.episode;
      const ng = ctx.nodeGroup || (Array.isArray(ctx.nodeGroups) ? (ctx.nodeGroups.find((g: any) => (g.nodeIds || []).includes(id)) || null) : null);
      let scene = ng?.scene;
      let shot = ng?.shot;
      try {
        const sp = new URLSearchParams(window.location.search);
        const s1 = Number(sp.get('scene'));
        const s2 = Number(sp.get('shot'));
        if (Number.isFinite(s1) && s1 > 0) scene = scene ?? s1;
        if (Number.isFinite(s2) && s2 > 0) shot = shot ?? s2;
      } catch {}
      const projectId = ctx.project?.id || ep?.projectId;
      const episodeId = ep?.id;
      if (!projectId || !episodeId || !scene || !shot) return;
      const res = await apiClient.episodes.getById(projectId, episodeId);
      const root = (res as any)?.data ?? res;
      const episodeObj: any = (root as any)?.data ?? root;
      const acts = Array.isArray(episodeObj?.scriptJson?.acts) ? [...episodeObj.scriptJson.acts] : [];
      let act = acts.find((a: any) => Number(a.actIndex) === Number(scene));
      if (!act) {
        act = { actIndex: Number(scene), shots: [] };
        acts.push(act);
      }
      act.shots = Array.isArray(act.shots) ? [...act.shots] : [];
      let shotItem = act.shots.find((s: any) => Number(s.shotIndex) === Number(shot));
      if (!shotItem) {
        shotItem = { shotIndex: Number(shot) };
        act.shots.push(shotItem);
      }
      Object.keys(updates).forEach((key) => { (shotItem as any)[key] = updates[key] || ''; });
      const scriptJson = { ...(episodeObj.scriptJson || {}), acts };
      await apiClient.episodes.update(projectId, episodeId, { scriptJson });
    } catch (e: any) {
      toast.error(e?.message || '保存失败');
    }
  };
  const sendToNext = () => {
    try {
      const nodes = getNodes();
      const edges = getEdges();
      const me = nodes.find(n => n.id === id);
      const agentEdges = edges.filter((e: any) => e.source === id).map((e: any) => e.target);
      const agents = nodes.filter(n => n.type === 'agent');
      let targetId = '';
      const connectedAgent = agents.find(a => agentEdges.includes(a.id));
      if (connectedAgent) {
        targetId = connectedAgent.id;
      } else if (me && agents.length > 0) {
        const sorted = agents
          .map(a => ({ a, dx: (a.position?.x ?? 0) - (me.position?.x ?? 0), dy: Math.abs((a.position?.y ?? 0) - (me.position?.y ?? 0)) }))
          .sort((p, q) => (p.dx >= 0 && q.dx >= 0 ? p.dx - q.dx : p.dx - q.dx) || p.dy - q.dy);
        targetId = (sorted[0]?.a?.id) || agents[0].id;
      } else {
        const myIndex = nodes.findIndex(n => n.id === id);
        targetId = nodes[myIndex + 1]?.id || '';
      }
      if (!targetId) return;
      setEdges((eds) => {
        const exists = eds.some((e: any) => e.source === id && e.target === targetId);
        return exists ? eds : [...eds, { id: `e-${Date.now()}`, source: id, target: targetId } as any];
      });
      const text = promptText || String((data as any)?.content || '');
      setNodes((nds) => nds.map((n: any) => {
        if (n.id !== targetId) return n;
        const d: any = n.data || {};
        if (n.type === 'agent') {
          return { ...n, data: { ...d, config: { ...(d.config || {}), prompt: text } } };
        }
        if (n.type === 'midjourney') {
          return { ...n, data: { ...d, prompt: text } };
        }
        if (n.type === 'aiImage') {
          return { ...n, data: { ...d, config: { ...(d.config || {}), prompt: text } } };
        }
        if (n.type === 'textPreview') {
          return { ...n, data: { ...d, content: text } };
        }
        return { ...n, data: { ...d, config: { ...(d.config || {}), prompt: text } } };
      }));
    } catch {}
  };

  const isStoryboard = (data.title || '') === '分镜设计';
  const isPrompt = (data.title || '') === '提示词';
  const sections = (() => {
    if (!isStoryboard) return [] as Array<{ label: string; content: string }>;
    const raw = String(data.content || '');
    const lines = raw.split(/\r?\n/).map(s => s.trim());
    const headers = new Set(['画面', '景别/镜头', '内容/动作', '声音/对话', '时长']);
    const out: Array<{ label: string; content: string }> = [];
    let current: { label: string; content: string } | null = null;
    for (const line of lines) {
      if (!line) continue;
      const m = line.match(/^(.+?)[：:]\s*(.*)$/);
      if (m && headers.has(m[1])) {
        if (current) out.push(current);
        current = { label: m[1], content: m[2] || '' };
        continue;
      }
      if (headers.has(line)) {
        if (current) out.push(current);
        current = { label: line, content: '' };
        continue;
      }
      if (current) {
        current.content = current.content ? `${current.content}\n${line}` : line;
      } else {
        current = { label: '文本', content: line };
      }
    }
    if (current) out.push(current);
    if (out.length === 0) return [{ label: '文本', content: raw }];
    const order = ['画面', '景别/镜头', '内容/动作', '声音/对话', '时长', '文本'];
    const indexed = new Map(order.map((k, idx) => [k, idx] as const));
    return out
      .filter(s => s.content && s.content.trim().length > 0)
      .sort((a, b) => (indexed.get(a.label) ?? 999) - (indexed.get(b.label) ?? 999));
  })();
  const [sbSections, setSbSections] = useState<Array<{ label: string; content: string }>>(sections);
  const sbSaveTimerRef = useRef<number | null>(null);
  const sbTextareaRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  useEffect(() => {
    setSbSections(sections);
  }, [data.content, isStoryboard]);
  useEffect(() => {
    requestAnimationFrame(() => {
      sbTextareaRefs.current.forEach((el) => {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
      });
    });
  }, [sbSections]);

  // 移除自动高度调整，使用固定高度和滚动

  useEffect(() => {
    if (isPrompt) {
      setPromptText(data.content || '');
    }
  }, [data.content, isPrompt]);

  return (
    <div className={`relative bg-white dark:bg-[#18181b] backdrop-blur-xl border rounded-2xl shadow-xl transition-all ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-white/60 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'}`} style={{ width: 340 }}>
      {/* 节点头部 - Aurora渐变样式 */}
      <div className="flex items-center justify-between px-3 py-2 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 0, "wght" 200, "GRAD" 0, "opsz" 20' }}>assignment</span>
          <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-white">{data.title || '分镜设计'}</span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse shadow-[0_0_5px_currentColor]"></div>
      </div>
      <div className="px-3 pb-3">
        {isStoryboard ? (
          <div ref={storyboardContainerRef} className="space-y-2 nowheel">
            {sbSections.length === 0 ? (
              <div className="text-sm text-slate-600 dark:text-white/60">暂无内容</div>
            ) : (
              sbSections.map((sec, i) => (
                <div key={`sec-${i}`} className="pt-2">
                  <div className="text-sm font-semibold text-slate-700 dark:text-white/90 mb-1">{sec.label}</div>
                  <textarea
                    value={sec.content}
                    onChange={(e) => {
                      const v = e.target.value;
                      e.target.style.height = 'auto';
                      e.target.style.height = `${e.target.scrollHeight}px`;
                      setSbSections((prev) => {
                        const next = prev.map((s, idx) => (idx === i ? { ...s, content: v } : s));
                        const combined = next.map((s) => `${s.label}：${s.content}`).join('\n');
                        const node = getNode(id);
                        if (node) {
                          setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, content: combined } } : n)));
                        }
                        if (sbSaveTimerRef.current) {
                          clearTimeout(sbSaveTimerRef.current);
                          sbSaveTimerRef.current = null;
                        }
                        sbSaveTimerRef.current = window.setTimeout(async () => {
                          const headers = new Set(['画面', '景别/镜头', '内容/动作', '声音/对话', '时长']);
                          const payload: Record<string, string> = {};
                          next.forEach((s) => { if (headers.has(s.label)) payload[s.label] = s.content; });
                          await saveStoryboard(payload);
                        }, 600);
                        return next;
                      });
                    }}
                    onBlur={async (e) => {
                      const headers = new Set(['画面', '景别/镜头', '内容/动作', '声音/对话', '时长']);
                      const payload: Record<string, string> = {};
                      payload[sec.label] = e.currentTarget.value;
                      if (headers.has(sec.label)) await saveStoryboard(payload);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    ref={(el) => { sbTextareaRefs.current[i] = el; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; el.style.overflow = 'hidden'; el.style.wordBreak = 'break-word'; } }}
                    className="nodrag w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white text-sm p-2 resize-none whitespace-pre-wrap leading-snug focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-400/50 transition-colors"
                    placeholder={`填写${sec.label}...`}
                  />
                </div>
              ))
            )}
          </div>
        ) : isPrompt ? (
          <div ref={containerRef} className="flex flex-col pt-2 nowheel">
            <textarea
              value={promptText}
              onChange={(e) => {
                const v = e.target.value;
                setPromptText(v);
                // 自动调整高度，但不超过最大值
                const maxHeight = 440; // 540px - 头部48px - 按钮52px
                e.target.style.height = 'auto';
                const newHeight = Math.min(e.target.scrollHeight, maxHeight);
                e.target.style.height = `${newHeight}px`;
                e.target.style.overflowY = e.target.scrollHeight > maxHeight ? 'auto' : 'hidden';
                const node = getNode(id);
                if (node) {
                  setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, content: v } } : n));
                }
                if (saveTimerRef.current) {
                  clearTimeout(saveTimerRef.current);
                  saveTimerRef.current = null;
                }
                saveTimerRef.current = window.setTimeout(async () => {
                  await saveStoryboard({ '提示词': v });
                }, 600);
              }}
              onBlur={async (e) => { const v = e.currentTarget.value; await saveStoryboard({ '提示词': v }); }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              ref={(el) => { 
                promptTextareaRef.current = el; 
                if (el) { 
                  const maxHeight = 440;
                  el.style.wordBreak = 'break-word'; 
                  el.style.height = 'auto'; 
                  const newHeight = Math.min(el.scrollHeight, maxHeight);
                  el.style.height = `${newHeight}px`; 
                  el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'; 
                } 
              }}
              className="nodrag nowheel w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white text-sm p-2 resize-none whitespace-pre-wrap break-words focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-400/50 transition-colors scrollbar-hide"
              style={{ minHeight: '60px', maxHeight: '440px' }}
              placeholder="输入提示词..."
            />
            <button
              onClick={sendToNext}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={!promptText.trim()}
              className="nodrag relative w-full mt-2 py-2 bg-neutral-800 dark:bg-white text-white dark:text-black hover:shadow-lg disabled:from-gray-600 disabled:to-gray-700 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all overflow-hidden flex-shrink-0"
            >
              <span className="relative z-10 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">send</span>
                <span>发送</span>
              </span>
            </button>
          </div>
        ) : (
          <div 
            ref={textContentRef}
            className="text-sm text-slate-800 dark:text-white whitespace-pre-wrap nowheel overflow-y-auto scrollbar-hide"
            style={{ maxHeight: 'calc(540px - 48px)' }}
          >
            {data.content || '暂无内容'}
          </div>
        )}
      </div>
      {/* 输入连接点 - 左侧 */}
      {!data.noHandles && (
        <CustomHandle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
        />
      )}
      {/* 输出连接点 - 右侧 */}
      {!data.noHandles && (
        <CustomHandle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
        />
      )}
    </div>
  );
};

export default memo(TextPreviewNode);

