import { memo, useState, useEffect, useRef, useMemo } from 'react';
import { Position, NodeProps, useReactFlow, useStore, useNodes } from 'reactflow';
import CustomHandle from '../CustomHandle';
import CustomSelect from './CustomSelect';
import { apiClient } from '../../../lib/api';
import { toast } from 'sonner';
import { useBillingEstimate } from '../../../hooks/useBillingEstimate';
import NodeCreatorBadge from '../NodeCreatorBadge';

interface Agent {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  roles?: AgentRole[];
}

interface AgentRole {
  id: string;
  agentId: string;
  name: string;
  description?: string;
  systemPrompt: string;
  aiModelId: string;
  temperature: number;
  maxTokens: number;
  isActive: boolean;
  order?: number;
  aiModel: {
    id: string;
    name: string;
    provider: string;
    modelId: string;
  };
}

interface AgentNodeData {
  label: string;
  type: string;
  config: {
    agentId?: string;
    prompt?: string;
    generatedText?: string;
    acceptedInputs?: string[];
    roleId?: string;
  };
  createdBy?: { id: string; nickname?: string; avatar?: string } | string;
  _isSharedWorkflow?: boolean;
}

const AgentNode = ({ data, selected, id }: NodeProps<AgentNodeData>) => {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loadingAgent, setLoadingAgent] = useState(false);
  const [prompt, setPrompt] = useState(data.config.prompt || '');
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const userEditedPromptRef = useRef<boolean>(false);
  const [executing, setExecuting] = useState(false);
  const { setNodes, setEdges, getNode, getNodes, getEdges } = useReactFlow();
  const connectedEdges = useStore((state) => state.edges.filter((e) => e.target === id));
  const allNodes = useNodes();
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [referenceDocuments, setReferenceDocuments] = useState<Array<{ name: string; url: string }>>([]);
  const lastEdgesRef = useRef<string>('');

  // 获取当前选择角色的模型ID
  const selectedRole = useMemo(() => {
    return (agent?.roles || []).find((r) => r.id === selectedRoleId);
  }, [agent, selectedRoleId]);

  // 积分估算（文本生成按次计费）
  const { credits, loading: creditsLoading, isFreeUsage, freeUsageRemaining } = useBillingEstimate({
    aiModelId: selectedRole?.aiModelId,
    quantity: 1,
  });

  // 加载智能体信息
  useEffect(() => {
    if (data.config.agentId) {
      loadAgent(data.config.agentId);
    }
  }, [data.config.agentId]);

  const loadAgent = async (agentId: string) => {
    try {
      setLoadingAgent(true);
      const agentData = await apiClient.agents.getById(agentId);
      let fetchedRoles: any[] = [];
      try {
        const roles = await apiClient.agents.roles.listByAgent(agentId);
        fetchedRoles = roles || [];
        setAgent({ ...agentData, roles: fetchedRoles });
        const presetRoleId = (data as any)?.config?.roleId || '';
        setSelectedRoleId(presetRoleId || (fetchedRoles[0]?.id || ''));
      } catch {
        setAgent(agentData);
      }
      try {
        const models = await apiClient.agents.getAvailableModels();
        const role = (fetchedRoles || []).find((r: any) => r.id === (data as any)?.config?.roleId);
        if (role) {
          const m = (models || []).find((x: any) => x.id === role.aiModelId);
          const accepted = m?.config?.acceptedInputs || (m?.type === 'TEXT_GENERATION' && m?.provider?.toLowerCase()?.includes('google') ? ['TEXT','IMAGE','DOCUMENT'] : ['TEXT']);
          updateNodeData({ acceptedInputs: accepted });
        } else {
          updateNodeData({ acceptedInputs: ['TEXT'] });
        }
      } catch {}
    } catch (error) {
      console.error('Failed to load agent:', error);
      toast.error('加载智能体信息失败');
    } finally {
      setLoadingAgent(false);
    }
  };

  useEffect(() => {
    updateNodeData({ roleId: selectedRoleId });
    (async () => {
      if (!agent) return;
      try {
        const models = await apiClient.agents.getAvailableModels();
        const role = (agent.roles || []).find((r) => r.id === selectedRoleId);
        if (role) {
          const m: any = (models || []).find((x: any) => x.id === role.aiModelId);
          const accepted = m?.config?.acceptedInputs || (m?.type === 'TEXT_GENERATION' && m?.provider?.toLowerCase()?.includes('google') ? ['TEXT','IMAGE','DOCUMENT'] : ['TEXT']);
          updateNodeData({ acceptedInputs: accepted });
        } else {
          updateNodeData({ acceptedInputs: ['TEXT'] });
        }
      } catch {}
    })();
  }, [selectedRoleId, agent]);

  // 更新节点数据
  const updateNodeData = (updates: Partial<AgentNodeData['config']>) => {
    const currentNode = getNode(id);
    if (currentNode) {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  config: {
                    ...node.data.config,
                    ...updates,
                  },
                },
              }
            : node
        )
      );
    }
  };

  

  // 自动调整输入框高度（基于实际内容）
  useEffect(() => {
    const textarea = promptTextareaRef.current;
    if (textarea) {
      // 使用 requestAnimationFrame 确保 DOM 已更新
      requestAnimationFrame(() => {
        // 重置高度以获取准确的 scrollHeight
        textarea.style.height = 'auto';
        // 设置高度为内容高度，最小60px，最大600px
        const newHeight = Math.max(60, Math.min(textarea.scrollHeight, 600));
        textarea.style.height = `${newHeight}px`;
      });
    }
  }, [prompt]);

  // 自动保存prompt
  useEffect(() => {
    const timer = setTimeout(() => {
      if (prompt !== data.config.prompt) {
        updateNodeData({ prompt });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [prompt, data.config.prompt]);

  useEffect(() => {
    const edges = connectedEdges;
    if (!edges || edges.length === 0) return;
    let incomingText = '';
    edges.some((e: any) => {
      const src = allNodes.find(n => n.id === e.source);
      if (!src) return false;
      const sd: any = src.data || {};
      if (src.type === 'textPreview' && typeof sd.content === 'string' && sd.content.trim()) {
        incomingText = sd.content.trim();
        return true;
      }
      return false;
    });
    if (incomingText && !userEditedPromptRef.current) {
      setPrompt(incomingText);
      updateNodeData({ prompt: incomingText });
    }
  }, [connectedEdges, allNodes]);

  useEffect(() => {
    const key = connectedEdges.map(e => `${e.id}-${e.source}`).sort().join(',');
    if (key === lastEdgesRef.current) return;
    lastEdgesRef.current = key;
    const imgs: string[] = [];
    const docs: Array<{ name: string; url: string }> = [];
    connectedEdges.forEach((edge: any) => {
      const src = getNode(edge.source);
      if (!src) return;
      const sd: any = src.data || {};
      if (src.type === 'upload') {
        const files = sd.config?.uploadedFiles || [];
        files.forEach((f: any) => {
          if (f.type === 'IMAGE') imgs.push(f.url);
          if (f.type === 'DOCUMENT') docs.push({ name: f.originalName, url: f.url });
        });
      } else if (src.type === 'assetSelector') {
        const subjects = sd.config?.subjects;
        if (subjects && subjects.length > 0) {
          const urls = (subjects[0].images || []).map((u: string) => {
            const API_URL = import.meta.env.VITE_API_URL || '';
            if (u.startsWith('data:')) return u;
            if (u.startsWith('http')) return u.replace(/^https?:\/\/localhost(?::\d+)?/i, API_URL);
            return `${API_URL}${u}`;
          });
          urls.forEach((u: string) => imgs.push(u));
        } else {
          const a = sd.config?.selectedAsset;
          if (a) {
            const API_URL = import.meta.env.VITE_API_URL || '';
            const normalize = (u: string) => u.startsWith('http') ? u.replace(/^https?:\/\/localhost(?::\d+)?/i, API_URL) : `${API_URL}${u}`;
            if (a.type === 'IMAGE') imgs.push(normalize(a.url));
            if (a.type === 'DOCUMENT') docs.push({ name: a.originalName, url: normalize(a.url) });
          }
        }
      } else if (src.type === 'imagePreview') {
        if (sd.imageUrl) imgs.push(sd.imageUrl);
      }
    });
    setReferenceImages(imgs);
    setReferenceDocuments(docs);
  }, [connectedEdges, getNode, allNodes]);

  // 根据当前选择的角色或默认配置计算执行配置
  const effectiveConfig = () => {
    if (!agent) return null;
    const role = (agent.roles || []).find((r) => r.id === selectedRoleId);
    if (role) {
      return {
        systemPrompt: role.systemPrompt,
        aiModelId: role.aiModelId,
        temperature: role.temperature,
        maxTokens: role.maxTokens,
      };
    }
    return null;
  };

  // 执行智能体
  const handleExecute = async () => {
    if (!agent) {
      toast.error('智能体信息未加载');
      return;
    }

    if (!prompt.trim()) {
      toast.error('请输入画面描述');
      return;
    }

    let role = (agent.roles || []).find((r) => r.id === selectedRoleId) || (agent.roles || [])[0];
    if (!role) {
      toast.error('该智能体没有可用角色');
      return;
    }
    if (!selectedRoleId || selectedRoleId !== role.id) {
      setSelectedRoleId(role.id);
      updateNodeData({ roleId: role.id });
    }

    try {
      setExecuting(true);

      // 获取上游节点的内容（文档、图片、视频等）
      const edges = getEdges();
      const incomingEdges = edges.filter((e) => e.target === id);
      let upstreamContent = '';
      const API_URL = import.meta.env.VITE_API_URL || '';

      // 准备文档文件数组（用于RAG）
      const documentFiles: Array<{ filePath: string; mimeType: string; }> = [];
      // 准备图片URL数组（用于视觉理解）
      const imageUrls: string[] = [];
      // 准备视频URL数组（用于视频理解）
      const videoUrls: string[] = [];

      // 收集上游节点的输出
      for (const edge of incomingEdges) {
        const sourceNode = getNode(edge.source);
        if (!sourceNode) continue;

        // 处理上传节点
        if (sourceNode.type === 'upload') {
          const uploadedFiles = sourceNode.data?.config?.uploadedFiles || [];
          for (const file of uploadedFiles) {
            if (file.type === 'DOCUMENT') {
              documentFiles.push({
                filePath: file.url,
                mimeType: file.mimeType,
              });
              upstreamContent += `[文档文件: ${file.originalName}]\n`;
            } else if (file.type === 'IMAGE') {
              const fullUrl = file.url.startsWith('http') ? file.url : `${API_URL}${file.url}`;
              imageUrls.push(fullUrl);
              upstreamContent += `[图片文件: ${file.originalName}]\n`;
            } else if (file.type === 'VIDEO') {
              const fullUrl = file.url.startsWith('http') ? file.url : `${API_URL}${file.url}`;
              videoUrls.push(fullUrl);
              upstreamContent += `[视频文件: ${file.originalName}]\n`;
            } else if (file.type === 'AUDIO') {
              upstreamContent += `[音频文件: ${file.originalName}]\n`;
            }
          }
        } 
        // 处理资产选择器节点
        else if (sourceNode.type === 'assetSelector') {
          const subjects = sourceNode.data?.config?.subjects as Array<{ name: string; images: string[] }> | undefined;
          if (subjects && subjects.length > 0) {
            const urls = (subjects[0].images || []).map((u: string) => (u.startsWith('http') ? u : `${API_URL}${u}`)).map((u) => u.replace(/^https?:\/\/localhost(?::\d+)?/i, API_URL));
            urls.forEach((u) => imageUrls.push(u));
            upstreamContent += `[参考图片组: ${urls.length} 张]\n`;
          } else {
            const selectedAsset = sourceNode.data?.config?.selectedAsset;
            if (selectedAsset) {
              if (selectedAsset.type === 'DOCUMENT') {
                documentFiles.push({ filePath: selectedAsset.url, mimeType: selectedAsset.mimeType });
                upstreamContent += `[文档文件: ${selectedAsset.originalName}]\n`;
              } else if (selectedAsset.type === 'IMAGE') {
                let fullUrl = selectedAsset.url.startsWith('http') ? selectedAsset.url : `${API_URL}${selectedAsset.url}`;
                fullUrl = fullUrl.replace(/^https?:\/\/localhost(?::\d+)?/i, API_URL);
                imageUrls.push(fullUrl);
                upstreamContent += `[图片文件: ${selectedAsset.originalName}]\n`;
              } else if (selectedAsset.type === 'VIDEO') {
                let fullUrl = selectedAsset.url.startsWith('http') ? selectedAsset.url : `${API_URL}${selectedAsset.url}`;
                fullUrl = fullUrl.replace(/^https?:\/\/localhost(?::\d+)?/i, API_URL);
                videoUrls.push(fullUrl);
                upstreamContent += `[视频文件: ${selectedAsset.originalName}]\n`;
              }
            }
          }
        } 
        // 处理 AI 图片节点（直接输出的生成图片）
        else if (sourceNode.type === 'aiImage') {
          const genUrl = sourceNode.data?.config?.generatedImageUrl;
          if (genUrl) {
            const fullUrl = genUrl.startsWith('http') ? genUrl : `${API_URL}${genUrl}`;
            imageUrls.push(fullUrl);
            upstreamContent += `[AI生成的图片]\n`;
          }
        }
        // 处理图片预览节点
        else if (sourceNode.type === 'imagePreview') {
          const imageUrl = sourceNode.data.imageUrl;
          if (imageUrl) {
            imageUrls.push(imageUrl);
            upstreamContent += `[AI生成的图片]\n`;
          }
        }
        // 处理视频预览节点
        else if (sourceNode.type === 'videoPreview') {
          const videoUrl = sourceNode.data.videoUrl;
          if (videoUrl) {
            const fullUrl = videoUrl.startsWith('http') ? videoUrl : `${API_URL}${videoUrl}`;
            videoUrls.push(fullUrl);
            upstreamContent += `[AI生成的视频]\n`;
          }
        }
        // 处理文本预览节点
        else if (sourceNode.type === 'textPreview') {
          if (sourceNode.data.content) {
            upstreamContent += sourceNode.data.content + '\n\n';
          }
        }
      }

      // 构建最终提示词：智能体预设 + 上游内容 + 用户输入
      const cfg = effectiveConfig();
      if (!cfg) return;
      let finalPrompt = cfg.systemPrompt;
      if (upstreamContent) {
        finalPrompt += `\n\n上下文内容：\n${upstreamContent}`;
      }
      finalPrompt += `\n\n用户指令：\n${prompt}`;

      

      // 调用AI API生成内容
      const response = await apiClient.ai.text.generate({
        modelId: role.aiModel.id || cfg.aiModelId,
        prompt: finalPrompt,
        systemPrompt: role.systemPrompt || cfg.systemPrompt,
        temperature: role.temperature ?? cfg.temperature,
        maxTokens: role.maxTokens ?? cfg.maxTokens,
        documentFiles: documentFiles.length > 0 ? documentFiles : undefined,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        videoUrls: videoUrls.length > 0 ? videoUrls : undefined,
      });


      const generatedText = (response && (response.data?.text || (response as any)?.text)) || '';
      

      if (!generatedText || generatedText.trim() === '') {
        toast.error('AI返回了空内容，请检查模型配置或重试');
        return;
      }

      // 保存生成的文本到节点数据（供下游节点读取）
      updateNodeData({ generatedText });

      const outgoingEdges = getEdges().filter((e) => e.source === id);
      // 获取最新的节点列表（使用 getNodes() 而非渲染时捕获的 allNodes）
      const currentNodes = getNodes();
      
      // 检查是否有非 textPreview 类型的下游节点（如 midjourney, aiImage, aiVideo, sora2Video 等）
      const nonPreviewEdges = outgoingEdges.filter((e) => {
        const targetNode = currentNodes.find((n: any) => n.id === e.target);
        return targetNode && targetNode.type !== 'textPreview';
      });
      
      if (nonPreviewEdges.length > 0) {
        // 已连接了其他节点，将文本传递到下游节点的提示词字段
        setNodes((nds) => {
          const downstreamIds = new Set(nonPreviewEdges.map((e) => e.target));
          return nds.map((node) => {
            if (!downstreamIds.has(node.id)) return node;
            const cfg = (node.data as any)?.config || {};
            if ((node as any).type === 'midjourney') {
              return { ...node, data: { ...node.data, prompt: generatedText } } as any;
            }
            // 支持 aiImage, aiVideo, sora2Video 等节点
            return { ...node, data: { ...node.data, config: { ...cfg, prompt: generatedText } } } as any;
          });
        });
        // 有下游连接时不创建文本预览节点
      } else {
        // 没有连接其他节点时，自动创建文本预览节点
        const me = getNode(id);
        if (me) {
          const timestamp = Date.now();
          const previewNodeId = `text-preview-${id}-${timestamp}`;
          
          // 计算预览节点位置（在当前节点右侧，根据已有预览节点数量向下偏移）
          const existingPreviewEdges = outgoingEdges.filter((e) => {
            const targetNode = currentNodes.find((n: any) => n.id === e.target);
            return targetNode && targetNode.type === 'textPreview';
          });
          
          const parentEl = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement | null;
          const parentWidth = parentEl?.getBoundingClientRect().width || 300;
          const posX = me.position.x + parentWidth + 100;
          const posY = me.position.y + existingPreviewEdges.length * 700;
          
          // 创建文本预览节点
          const previewNode = {
            id: previewNodeId,
            type: 'textPreview',
            position: { x: posX, y: posY },
            data: {
              label: '文本预览',
              title: '提示词',
              content: generatedText,
              createdBy: (me.data as any)?.createdBy, // 🔑 继承父节点的创建者信息（协作者拖动权限）
            },
          };
          
          // 添加节点和连线
          const newEdge = {
            id: `edge-${id}-${previewNodeId}`,
            source: id,
            target: previewNodeId,
            type: 'aurora',
          };
          
          setNodes((nds) => [...nds, previewNode]);
          setTimeout(() => {
            setEdges((eds: any[]) => [...eds, newEdge]);
          }, 50);
        }
      }

      // 处理扣费信息
      const creditsCharged = (response as any)?.creditsCharged || 0;
      if (creditsCharged > 0) {
        const { refreshTenantCredits } = await import('../../../lib/api');
        await refreshTenantCredits();
        toast.success(`执行成功（已扣除 ${creditsCharged} 积分）`);
      } else {
        toast.success('执行成功');
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.response?.data?.error || error?.message || '未知错误';
      toast.error('执行失败：' + msg);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div
      className={`relative bg-white/80 dark:bg-black/60 backdrop-blur-xl border rounded-2xl shadow-xl transition-all ring-1 ${
        selected ? 'border-purple-400 shadow-purple-400/50' : 'border-white/60 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'
      }`}
      style={{ width: 320 }}
    >
      {/* 创建者头像徽章 */}
      <NodeCreatorBadge createdBy={data.createdBy} isSharedWorkflow={data._isSharedWorkflow} />
      
      {/* 输入连接点 */}
      <CustomHandle
        type="target"
        position={Position.Left}
        id={`${id}-target`}
        className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
      />

      {/* 节点头部 - Aurora 渐变样式 */}
      <div className="flex items-center justify-between px-4 py-3 border-b rounded-t-2xl border-slate-200 dark:border-white/10 bg-gradient-to-r from-pink-500/20 dark:from-pink-500/20 from-pink-200/50 via-purple-500/20 dark:via-purple-500/20 via-purple-200/50 to-cyan-500/20 dark:to-cyan-500/20 to-cyan-200/50">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 0, "wght" 200, "GRAD" 0, "opsz" 20' }}>psychology</span>
          <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-white">
            {loadingAgent ? 'LOADING...' : (agent?.name || data.label).toUpperCase()}
          </span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse shadow-[0_0_5px_currentColor]"></div>
      </div>

      {/* 节点内容 */}
      <div className="p-4 space-y-4">
        {agent && (agent.roles || []).length > 0 && (
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">角色/风格</label>
            <CustomSelect
              value={selectedRoleId}
              onChange={(value) => setSelectedRoleId(value)}
              options={([...((agent.roles || []))].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))).map((r) => ({
                value: r.id,
                label: r.name
              }))}
            />
          </div>
        )}
        {/* Prompt输入框 */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">
            画面描述
          </label>
          <textarea
            ref={promptTextareaRef}
            value={prompt}
            onChange={(e) => { userEditedPromptRef.current = true; setPrompt(e.target.value); }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="nodrag w-full p-2 text-xs rounded-md border outline-none resize-none overflow-hidden transition-colors font-mono leading-relaxed bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 focus:bg-white dark:focus:bg-white/10 border-slate-200 dark:border-white/10 focus:border-purple-400 dark:focus:border-purple-400/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30"
            placeholder="输入您对于画面的初步想法"
            style={{ minHeight: '60px' }}
          />
        </div>

        {/* 执行按钮 - Aurora样式 */}
        <button
          onClick={handleExecute}
          disabled={executing || loadingAgent || !agent || !prompt.trim() || (data as any)._canEdit === false}
          className="nodrag w-full mt-2 py-2 text-[10px] font-bold rounded-lg border transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white shadow-md hover:shadow-lg dark:hover:from-purple-500/60 dark:hover:to-pink-500/60 border-transparent dark:border-white/10"
        >
          {executing ? (
            <>
              <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></div>
              <span>执行中...</span>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-white/90" style={{ fontSize: '12px' }} dangerouslySetInnerHTML={{__html: '&#xe1e1;'}}></span>
              <span>执行智能体</span>
              {/* 积分/免费显示 */}
              {!creditsLoading && (
                isFreeUsage ? (
                  <span className="ml-1 px-1.5 py-0.5 bg-amber-500/40 text-amber-200 rounded text-[9px]">
                    免费，今日剩{freeUsageRemaining}次
                  </span>
                ) : credits !== null && credits > 0 ? (
                  <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-[9px]">
                    {credits}积分
                  </span>
                ) : null
              )}
            </>
          )}
        </button>


        {referenceImages.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">参考图片 ({referenceImages.length})</div>
            <div className="grid grid-cols-4 gap-2">
              {referenceImages.map((u, i) => (
                <div key={i} className="relative group">
                  <img src={u} alt="ref" className="w-full h-12 object-cover rounded-md border border-slate-200 dark:border-white/10 group-hover:border-purple-400 dark:group-hover:border-purple-400 transition-colors" />
                </div>
              ))}
            </div>
          </div>
        )}

        {referenceDocuments.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">参考文档 ({referenceDocuments.length})</div>
            <div className="space-y-1">
              {referenceDocuments.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span className="material-symbols-outlined text-slate-400 dark:text-white/50" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 0, "wght" 200, "GRAD" 0, "opsz" 20' }}>description</span>
                  <span className="truncate" title={d.name}>{d.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 输出连接点 */}
      <CustomHandle
        type="source"
        position={Position.Right}
        id={`${id}-source`}
        className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
      />
    </div>
  );
};

export default memo(AgentNode);
