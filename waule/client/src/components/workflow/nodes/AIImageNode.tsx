import { memo, useState, useEffect, useMemo, useRef } from 'react';
import { Position, NodeProps, useReactFlow, useStore, useNodes } from 'reactflow';
import { toast } from 'react-hot-toast';
import { Loader2, Sparkles } from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { processImageUrl } from '../../../utils/imageUtils';
import CustomHandle from '../CustomHandle';
import CustomSelect from './CustomSelect';
import { useBillingEstimate } from '../../../hooks/useBillingEstimate';
import NodeCreatorBadge from '../NodeCreatorBadge';

interface AIImageNodeData {
  label: string;
  type: string;
  config: {
    modelId?: string;
    prompt?: string;
    ratio?: string;
    imageSize?: string; // 新增：图片分辨率（2K/4K）
    maxImages?: number; // 组图生成数量（1-15，仅 SeeDream 4.5）
    referenceImages?: string[];
    generatedImageUrl?: string;
    acceptedInputs?: string[];
    taskId?: string;
  };
  models?: any[];
  isExpanded?: boolean;
  createdBy?: { id: string; nickname?: string; avatar?: string } | string;
  _isSharedWorkflow?: boolean;
  _canEdit?: boolean; // 是否可编辑（编组内节点为false）
  _isGrouped?: boolean; // 是否在编组内
}

const AIImageNode = ({ data, selected, id }: NodeProps<AIImageNodeData>) => {
  const [isExpanded, setIsExpanded] = useState(data.isExpanded !== false);
  const [selectedModel, setSelectedModel] = useState<any>(null);
  const [prompt, setPrompt] = useState(data.config.prompt || '');
  const [ratio, setRatio] = useState(data.config.ratio || '');
  const [imageSize, setImageSize] = useState(data.config.imageSize || '2K'); // 默认2K
  const [maxImages, setMaxImages] = useState(data.config.maxImages || 1); // 组图数量，默认1
  const [isGenerating, setIsGenerating] = useState(false);
  const [, setGenerationProgress] = useState(0);
  const [, setTaskId] = useState(data.config.taskId || '');
  const [referenceImages, setReferenceImages] = useState<string[]>(data.config.referenceImages || []);

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const userEditedPromptRef = useRef<boolean>(false);
  const { setNodes, setEdges, getNode, getEdges, getNodes } = useReactFlow();
  const allNodes = useNodes(); // 监听所有节点变化

  // 使用 useStore 监听连接到当前节点的边
  const connectedEdges = useStore((state) =>
    state.edges.filter((edge) => edge.target === id)
  );

  // 使用 ref 避免无限循环
  const lastEdgesRef = useRef<string>('');
  const lastPromptSourceRef = useRef<string>(''); // 追踪上游文本来源

  // 积分估算
  const { credits, loading: creditsLoading, isFreeUsage, freeUsageRemaining, refetch: refetchEstimate } = useBillingEstimate({
    aiModelId: selectedModel?.id,
    quantity: 1, // 图片生成按张数计费
    resolution: imageSize, // 传递分辨率（2K/4K）
  });

  // 获取图片模型列表（使用 useMemo 避免不必要的重新创建）
  // 过滤掉Midjourney模型，因为Midjourney有专门的节点
  const imageModels = useMemo(() =>
    (data.models || []).filter((m: any) =>
      m.type === 'IMAGE_GENERATION' &&
      m.isActive &&
      !m.name.toLowerCase().includes('midjourney')
    ),
    [data.models]
  );

  // 当模型ID变化时，更新选中模型和比例选项
  useEffect(() => {
    if (data.config.modelId) {
      const model = imageModels.find((m: any) => m.id === data.config.modelId);
      if (model) {
        setSelectedModel(model);
        const config = model.config as any;
        if (config?.supportedRatios && config.supportedRatios.length > 0 && !ratio) {
          setRatio(config.supportedRatios[0]);
        }
        // 同步模型的acceptedInputs配置到节点（如果节点还没有）
        if (!data.config.acceptedInputs) {
          updateNodeData({
            acceptedInputs: config?.acceptedInputs || ['TEXT', 'IMAGE']
          });
        }
      }
    } else if (imageModels.length > 0) {
      setSelectedModel(imageModels[0]);
      const config = imageModels[0].config as any;
      if (config?.supportedRatios && config.supportedRatios.length > 0 && !ratio) {
        setRatio(config.supportedRatios[0]);
      }
      // 同步模型的acceptedInputs配置到节点（如果节点还没有）
      if (!data.config.acceptedInputs) {
        updateNodeData({
          acceptedInputs: config?.acceptedInputs || ['TEXT', 'IMAGE']
        });
      }
    }
  }, [data.config.modelId, imageModels]);

  // 页面加载时恢复进行中的任务（只运行一次）
  useEffect(() => {
    const initialTaskId = data.config.taskId;

    const recoverTask = async () => {
      // 如果有taskId，说明有任务（无论是否正在生成），需要检查状态
      if (initialTaskId) {
        try {
          const response = await apiClient.tasks.getTaskStatus(initialTaskId);
          const task = response.task;

          if (task.status === 'SUCCESS') {
            // 任务已完成，直接处理结果
            setIsGenerating(false);
            setGenerationProgress(100);

            const imageUrl = task.resultUrl;
            if (!imageUrl) {
              setIsGenerating(false);
              setGenerationProgress(0);
              updateNodeData({ taskId: '' });
              toast.error('生成完成，但图片获取失败，请重试');
              return;
            }

            // 使用保存在node data中的ratio（页面刷新前保存的）
            const savedRatio = data.config.ratio || '1:1';

            updateNodeData({
              prompt: data.config.prompt || prompt,
              ratio: savedRatio,
              modelId: data.config.modelId || selectedModel?.id,
              generatedImageUrl: imageUrl,
              taskId: '', // 清除taskId，任务已完成
            });

            // 检查是否已存在该任务的预览节点（防止重复创建）
            const allNodes = getNodes();
            const edges = getEdges();
            const connectedPreviewNodes = allNodes.filter(node => {
              return node.type === 'imagePreview' && edges.some(edge =>
                edge.source === id && edge.target === node.id
              );
            });

            const existingNode = connectedPreviewNodes.find(node => node.data.imageUrl === imageUrl);
            if (existingNode) {
              updateNodeData({ taskId: '' });
              toast.success('图片生成已完成！');
              return;
            }

            toast.success('图片生成已完成！');

            try {
              const suppressedRaw = localStorage.getItem('suppressedPreviewTasks') || '[]';
              const suppressed: Array<{ sourceNodeId?: string; taskId?: string; messageId?: string }> = JSON.parse(suppressedRaw);
              const isSuppressed = suppressed.some(s => (s.taskId && s.taskId === initialTaskId) || (s.sourceNodeId && s.sourceNodeId === id));
              if (!isSuppressed) {
                createPreviewNode(imageUrl, savedRatio);
              }
            } catch {
              createPreviewNode(imageUrl, savedRatio);
            }
          } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
            // 任务仍在进行中，恢复轮询
            setIsGenerating(true);
            setGenerationProgress(task.progress || 0);
            pollTaskStatus(initialTaskId);
          } else if (task.status === 'FAILURE') {
            // 任务失败
            setIsGenerating(false);
            setGenerationProgress(0);
            updateNodeData({ taskId: '' });
            toast.error(task.errorMessage ? `很抱歉，生成遇到问题：${task.errorMessage}` : '生成未能完成，请稍后重试');
          }
        } catch (error: any) {
          setIsGenerating(false);
          setGenerationProgress(0);
          updateNodeData({ taskId: '' });
          toast.error('无法恢复之前的任务，请重新生成');
        }
      }
    };

    recoverTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时执行一次

  // 获取当前模型支持的比例
  const getSupportedRatios = () => {
    if (!selectedModel) return [];
    const config = selectedModel.config as any;
    return config?.supportedRatios || [];
  };

  const getMaxReferenceImages = () => {
    const modelId = (data as any)?.config?.modelId;
    const modelItem = imageModels.find((m: any) => m.id === modelId) || imageModels[0];
    const cfg = (modelItem?.config || {}) as any;
    return cfg.maxReferenceImages || cfg.supportedReferenceImagesLimit || cfg.referenceImagesLimit || 10;
  };

  function countImagesForNode(n: any): number {
    const t = (n?.type || '') as string;
    if (t === 'upload') {
      const files = ((n as any)?.data?.config?.uploadedFiles || []) as any[];
      return files.reduce((s, f) => {
        const tp = (f?.type || '').toUpperCase();
        const m = (f?.mimeType || '').toLowerCase();
        return s + ((tp === 'IMAGE' || m.startsWith('image/')) ? 1 : 0);
      }, 0);
    }
    if (t === 'assetSelector') {
      const conf = (n as any)?.data?.config || {};
      if (conf.selectedAsset) {
        const tp = (conf.selectedAsset.type || '').toUpperCase();
        const m = (conf.selectedAsset.mimeType || '').toLowerCase();
        return ((tp === 'IMAGE' || m.startsWith('image/')) ? 1 : 0);
      }
      if (Array.isArray(conf.subjects) && conf.subjects.length > 0) {
        const imgs = (conf.subjects[0]?.images || []) as string[];
        return imgs.length > 0 ? 1 : 0;
      }
      return 0;
    }
    if (t === 'aiImage') {
      const u = (n as any)?.data?.config?.generatedImageUrl;
      return u ? 1 : 0;
    }
    if (t === 'imagePreview') {
      const u = (n as any)?.data?.imageUrl;
      return u ? 1 : 0;
    }
    return 0;
  }

  function getNodeOutputType(node: any): string | null {
    const nodeType = (node?.type || '') as string;
    const nodeData = node?.data;
    if (nodeType === 'upload' && nodeData?.config?.uploadedFiles?.length > 0) {
      const file = nodeData.config.uploadedFiles[0];
      const t = (file.type || '').toUpperCase();
      const m = (file.mimeType || '').toLowerCase();
      if (t === 'IMAGE' || m.startsWith('image/')) return 'IMAGE';
      if (t === 'VIDEO' || m.startsWith('video/')) return 'VIDEO';
      if (t === 'AUDIO' || m.startsWith('audio/')) return 'AUDIO';
      return t || null;
    }
    if (nodeType === 'assetSelector') {
      if (nodeData?.config?.subjects) return 'IMAGE';
      if (nodeData?.config?.selectedAsset) {
        const asset = nodeData.config.selectedAsset;
        const t = (asset.type || '').toUpperCase();
        const m = (asset.mimeType || '').toLowerCase();
        if (t === 'IMAGE' || m.startsWith('image/')) return 'IMAGE';
        if (t === 'VIDEO' || m.startsWith('video/')) return 'VIDEO';
        if (t === 'AUDIO' || m.startsWith('audio/')) return 'AUDIO';
        return t || null;
      }
    }
    if (nodeType === 'aiImage' || nodeType === 'imagePreview') return 'IMAGE';
    if ((nodeType || '').startsWith('aiVideo') || nodeType === 'videoPreview') return 'VIDEO';
    if (nodeType === 'agent') return 'TEXT';
    return null;
  }



  const isHandleDisabled = useMemo(() => {
    const targetEdges = connectedEdges;
    const hasAgent = targetEdges.some((e) => {
      const s = getNode(e.source);
      return (s?.type || '') === 'agent';
    });
    const maxImages = getMaxReferenceImages();
    const existingImageCount = targetEdges.reduce((acc, e) => acc + countImagesForNode(getNode(e.source)), 0);
    return hasAgent && existingImageCount >= maxImages;
  }, [connectedEdges, getNode]);



  const validateIncomingConnection = (conn: any) => {
    const src = getNode(conn.source);
    if (!src) return false;
    const st = (src.type || '') as string;
    const targetEdges = getEdges().filter((e) => e.target === id);
    const srcType = getNodeOutputType(src);
    if (srcType === 'VIDEO' || srcType === 'AUDIO' || srcType === 'DOCUMENT') return false;
    const hasAgent = targetEdges.some((e) => {
      const s2 = getNode(e.source);
      return (s2?.type || '') === 'agent';
    });
    if (st === 'agent' || st === 'textPreview') {
      return !hasAgent;
    }
    const existingImageCount = targetEdges.reduce((acc, e) => acc + countImagesForNode(getNode(e.source)), 0);
    const addCount = countImagesForNode(src);
    const maxImages = getMaxReferenceImages();
    return existingImageCount + addCount <= maxImages;
  };

  useEffect(() => {
    const targetEdges = connectedEdges;
    const maxImages = getMaxReferenceImages();
    let remaining = maxImages;
    const toRemove: string[] = [];
    targetEdges.forEach((e) => {
      const s = getNode(e.source);
      const cnt = countImagesForNode(s);
      if (cnt <= 0) return;
      if (remaining - cnt >= 0) {
        remaining -= cnt;
      } else {
        toRemove.push(e.id);
      }
    });
    if (toRemove.length > 0) {
      setEdges((eds) => eds.filter((edge) => !toRemove.includes(edge.id)));
      toast.error('参考图数量已达上限，多余的连接已自动断开');
    }
  }, [connectedEdges, getNode, setEdges]);

  useEffect(() => {
    const targetEdges = connectedEdges;
    const ids: string[] = [];
    targetEdges.forEach((e) => {
      const s = getNode(e.source);
      const t = getNodeOutputType(s);
      if (t === 'VIDEO' || t === 'AUDIO' || t === 'DOCUMENT') ids.push(e.id);
    });
    if (ids.length > 0) {
      setEdges((eds) => eds.filter((edge) => !ids.includes(edge.id)));
      toast.error('图片生成节点仅支持图片和文本输入哦');
    }
  }, [connectedEdges, getNode, setEdges]);

  // 自动刷新参考图和提示词（监听连接边的变化）
  useEffect(() => {
    const stateKey = connectedEdges
      .map((e) => {
        const s = getNode(e.source);
        if (!s) return `${e.id}-${e.source}`;
        const sd: any = s.data || {};
        let imgsSig: string[] = [];
        if (s.type === 'assetSelector') {
          const subs = sd.config?.subjects;
          if (subs && subs.length > 0) {
            const first = subs[0].images?.[0];
            imgsSig = first ? [first] : [];
          } else if (sd.config?.selectedAsset && sd.config.selectedAsset.type === 'IMAGE') {
            imgsSig = [sd.config.selectedAsset.url];
          }
        } else if (s.type === 'upload') {
          const files = sd.config?.uploadedFiles || [];
          imgsSig = files.filter((f: any) => f.type === 'IMAGE').map((f: any) => f.url);
        } else if (s.type === 'aiImage' || s.type === 'imagePreview') {
          const u = sd.config?.generatedImageUrl || sd.imageUrl;
          if (u) imgsSig = [u];
        }
        return `${e.id}-${e.source}-${imgsSig.join('|')}`;
      })
      .sort()
      .join(',');
    if (stateKey === lastEdgesRef.current) return;
    lastEdgesRef.current = stateKey;

    const newImages: string[] = [];
    let newPromptText = '';

    connectedEdges.forEach((edge: any) => {
      const sourceNode = getNode(edge.source);
      if (sourceNode) {
        const sourceData = sourceNode.data as any;

        // 1. 检查文本内容（智能体节点、文本预览节点）
        if (sourceNode.type === 'agent' && sourceData.config?.generatedText) {
          // 智能体节点的生成内容
          if (!newPromptText) {
            newPromptText = sourceData.config.generatedText;
          }
        } else if (sourceNode.type === 'textPreview' && sourceData.content) {
          // 文本预览节点的内容
          if (!newPromptText) {
            newPromptText = sourceData.content;
          }
        }

        // 2. 检查图片内容
        // 资产选择器角色多图
        if (sourceNode.type === 'assetSelector' && sourceData.config?.subjects && sourceData.config.subjects.length > 0) {
          const first = sourceData.config.subjects[0].images?.[0];
          if (first && !newImages.includes(first)) {
            newImages.push(first);
          }
        }
        // 检查生成的图片节点
        let imageUrl = sourceData.config?.generatedImageUrl || sourceData.imageUrl || '';

        // 检查资产选择器节点（使用同源相对路径，避免跨域）
        if (!imageUrl && sourceData.config?.selectedAsset) {
          const asset = sourceData.config.selectedAsset;
          if (asset.type === 'IMAGE') {
            imageUrl = asset.url; // 例如 /uploads/xxx
          }
        }

        // 检查上传节点（使用同源相对路径，避免跨域）
        if (!imageUrl && sourceData.config?.uploadedFiles && sourceData.config.uploadedFiles.length > 0) {
          const uploadedFile = sourceData.config.uploadedFiles[0];
          if (uploadedFile.type === 'IMAGE') {
            imageUrl = uploadedFile.url; // 例如 /uploads/xxx
          }
        }

        if (imageUrl && !newImages.includes(imageUrl)) {
          newImages.push(imageUrl);
        }
      }
    });

    const maxImages = getMaxReferenceImages();
    const clampedImages = newImages.slice(0, Math.max(0, maxImages));
    setReferenceImages(clampedImages);
    updateNodeData({ referenceImages: clampedImages });

    // 更新提示词（如果有新的文本内容）
    if (newPromptText && newPromptText !== prompt) {
      setPrompt(newPromptText);
      updateNodeData({ prompt: newPromptText });
    }
  }, [connectedEdges, getNode, id, prompt, allNodes]);

  // 监听上游节点数据变化（智能体执行后更新提示词）
  useEffect(() => {
    if (connectedEdges.length === 0) return;

    // 检查上游智能体节点的 generatedText
    let sourceText = '';
    let sourceKey = '';

    connectedEdges.forEach((edge) => {
      const sourceNode = allNodes.find(n => n.id === edge.source);
      if (sourceNode && sourceNode.type === 'agent') {
        const agentData = sourceNode.data as any;
        if (agentData.config?.generatedText) {
          sourceText = agentData.config.generatedText;
          sourceKey = `${sourceNode.id}-${agentData.config.generatedText.substring(0, 50)}`;
        }
      }
    });

    // 如果找到新的文本且与上次不同
    if (sourceText && sourceKey !== lastPromptSourceRef.current) {
      lastPromptSourceRef.current = sourceKey;
      setPrompt(sourceText);
      updateNodeData({ prompt: sourceText });
    }
  }, [allNodes, connectedEdges, id]);

  // 自动调整提示词输入框高度（基于实际内容）
  useEffect(() => {
    const textarea = promptTextareaRef.current;
    if (textarea && isExpanded) {
      // 使用 requestAnimationFrame 确保 DOM 已更新
      requestAnimationFrame(() => {
        // 重置高度以获取准确的 scrollHeight
        textarea.style.height = 'auto';
        // 设置高度为内容高度，最小60px，最大600px
        const newHeight = Math.max(60, Math.min(textarea.scrollHeight, 600));
        textarea.style.height = `${newHeight}px`;
      });
    }
  }, [prompt, isExpanded]); // 添加 isExpanded 依赖

  // 自动保存提示词到节点数据（防抖）
  useEffect(() => {
    const timer = setTimeout(() => {
      if (prompt !== data.config.prompt) {
        updateNodeData({ prompt });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [prompt]);

  // 外部更新同步到本地状态（例如来自智能体广播）
  useEffect(() => {
    if (data.config.prompt && data.config.prompt !== prompt) {
      setPrompt(data.config.prompt);
    }
  }, [data.config.prompt]);

  // 自动保存比例到节点数据
  useEffect(() => {
    if (ratio && ratio !== data.config.ratio) {
      updateNodeData({ ratio });
    }
  }, [ratio]);

  // 自动保存分辨率到节点数据
  useEffect(() => {
    if (imageSize && imageSize !== data.config.imageSize) {
      updateNodeData({ imageSize });
    }
  }, [imageSize]);

  // 当模型变化时，检查当前分辨率是否在支持列表中
  useEffect(() => {
    if (selectedModel?.modelId === 'gemini-3-pro-image-preview') {
      const supportedResolutions: string[] = selectedModel?.config?.supportedResolutions || [];
      if (supportedResolutions.length > 0 && !supportedResolutions.includes(imageSize)) {
        // 当前分辨率不在支持列表中，自动切换到第一个支持的分辨率
        setImageSize(supportedResolutions[0]);
      } else if (supportedResolutions.length === 1) {
        // 只有一个分辨率时，自动选中
        setImageSize(supportedResolutions[0]);
      }
    }
  }, [selectedModel]);

  // 自动保存组图数量到节点数据
  useEffect(() => {
    if (maxImages !== data.config.maxImages) {
      updateNodeData({ maxImages });
    }
  }, [maxImages]);

  // 更新节点数据
  const updateNodeData = (updates: Partial<AIImageNodeData['config']>) => {
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



  // 拖拽开始
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  // 拖拽覆盖
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newImages = [...referenceImages];
    const draggedImage = newImages[draggedIndex];
    newImages.splice(draggedIndex, 1);
    newImages.splice(index, 0, draggedImage);

    setReferenceImages(newImages);
    setDraggedIndex(index);
  };

  // 拖拽结束时保存顺序
  const handleDragComplete = () => {
    setDraggedIndex(null);
    updateNodeData({ referenceImages });
  };

  // 轮询任务状态
  const pollTaskStatus = async (taskId: string) => {
    const maxAttempts = 600; // 组图模式最多10分钟 (600 * 1秒)
    let attempts = 0;

    const poll = async () => {
      try {
        attempts++;

        const response = await apiClient.tasks.getTaskStatus(taskId);
        const task = response.task;

        // 更新进度
        setGenerationProgress(task.progress || 0);

        if (task.status === 'SUCCESS') {
          // 生成成功
          setIsGenerating(false);
          setGenerationProgress(100);

          const imageUrl = task.resultUrl;
          
          // 检查是否有多图结果（组图生成）
          const allImageUrls = task.metadata?.allImageUrls as string[] | undefined;
          
          updateNodeData({
            prompt,
            ratio,
            modelId: selectedModel?.id,
            generatedImageUrl: imageUrl,
            taskId: '',
          });

          // 如果是组图生成（多张图片），批量创建预览节点
          if (allImageUrls && allImageUrls.length > 1) {
            console.log(`🖼️ [AIImageNode] 组图生成完成，共 ${allImageUrls.length} 张图片`);
            createMultiplePreviewNodes(allImageUrls, ratio);
            toast.success(`🎉 创作完成！共生成 ${allImageUrls.length} 张精美图片`);
          } else {
            // 单图生成
            createPreviewNode(imageUrl, ratio);
            toast.success('🎨 图片生成完成，快去看看吧！');
          }
          return;
        } else if (task.status === 'FAILURE') {
          // 生成失败，刷新积分（因为会退款）
          setIsGenerating(false);
          setGenerationProgress(0);
          updateNodeData({ taskId: '' });
          
          // 刷新用户积分（退款后）
          const { useAuthStore } = await import('../../../store/authStore');
          const { refreshUser } = useAuthStore.getState();
          await refreshUser();
          
          toast.error(task.errorMessage || '生成遇到问题，积分已自动退还，请重试');
          return;
        } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
          // 继续轮询
          if (attempts < maxAttempts) {
            setTimeout(poll, 1000); // 1秒后继续轮询
          } else {
            // 超时
            setIsGenerating(false);
            setGenerationProgress(0);
            updateNodeData({ taskId: '' });
            toast.error('生成时间较长，请刷新页面查看结果或重新尝试');
          }
        }
      } catch (error: any) {
        setIsGenerating(false);
        setGenerationProgress(0);
        updateNodeData({ taskId: '' });
        toast.error('网络波动，请刷新页面查看生成结果');
      }
    };

    poll();
  };

  // 生成图片（异步任务）
  const handleGenerate = async () => {
    console.log('[AIImageNode] 🔥 handleGenerate 被调用', { 
      prompt: prompt?.substring(0, 50), 
      selectedModel: selectedModel?.id,
      isGenerating,
      _canEdit: data._canEdit 
    });
    if (!prompt.trim() || !selectedModel) {
      console.log('[AIImageNode] ⚠️ 提前返回: prompt或model无效', { promptEmpty: !prompt.trim(), noModel: !selectedModel });
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(0);
    console.log('[AIImageNode] ✅ 开始生成，referenceImages数量:', referenceImages.length);

    try {
      // 处理参考图片（processImageUrl会自动压缩大图）
      let processedReferenceImages: string[] = [];

      if (referenceImages.length > 0) {
        console.log('[AIImageNode] 🖼️ 开始处理参考图片...');
        try {
          for (let i = 0; i < referenceImages.length; i++) {
            const imageUrl = referenceImages[i];
            console.log(`[AIImageNode] 处理参考图 ${i + 1}/${referenceImages.length}:`, imageUrl?.substring(0, 50));
            // processImageUrl 会自动处理：超时、压缩大图、转换本地图
            try {
              const processedUrl = await processImageUrl(imageUrl);
              console.log('[AIImageNode] processImageUrl完成');
              processedReferenceImages.push(processedUrl);
            } catch (processError) {
              console.error('[AIImageNode] processImageUrl失败，跳过此图:', processError);
              // 处理失败时跳过此图，继续处理其他图片
            }
          }
          console.log('[AIImageNode] ✅ 所有参考图片处理完成，成功:', processedReferenceImages.length);
        } catch (error) {
          console.error('[AIImageNode] ❌ 处理参考图失败:', error);
          // 处理参考图失败
        }
      }

      // 构建最终提示词
      let finalPrompt = prompt.trim();
      
      // 如果是 SeeDream 4.5 模型且组图数量 > 1，添加内置提示词前缀
      if (selectedModel.modelId === 'doubao-seedream-4-5-251128' && maxImages > 1) {
        finalPrompt = `生成一组共${maxImages}张连贯图片，${finalPrompt}`;
      }
      
      // 如果是 Gemini 3 Pro Image 模型且选择了比例，将比例追加到提示词末尾
      if (selectedModel.modelId === 'gemini-3-pro-image-preview' && ratio) {
        finalPrompt = `${finalPrompt}，生成${ratio}的比例`;
      }

      // 提交任务到后端
      const taskPayload: any = {
        modelId: selectedModel.id,
        prompt: finalPrompt,
        ratio: ratio || '1:1',
        referenceImages: processedReferenceImages.length > 0 ? processedReferenceImages : undefined,
      };

      // 如果是 Gemini 3 Pro Image 模型，添加分辨率参数
      if (selectedModel.modelId === 'gemini-3-pro-image-preview') {
        taskPayload.imageSize = imageSize;
      }
      
      // 如果是 SeeDream 4.5 模型且组图数量 > 1，添加 maxImages 参数
      if (selectedModel.modelId === 'doubao-seedream-4-5-251128' && maxImages > 1) {
        taskPayload.maxImages = maxImages;
      }
      const response = await apiClient.tasks.createImageTask(taskPayload);

      const newTaskId = response.taskId;
      const creditsCharged = response.creditsCharged || 0;
      const isFreeUsage = response.isFreeUsage;
      const freeUsageRemaining = response.freeUsageRemaining ?? 0;
      
      setTaskId(newTaskId);
      updateNodeData({
        prompt,
        ratio,
        modelId: selectedModel.id,
        taskId: newTaskId,
      });

      // 显示提示并刷新剩余次数
      if (isFreeUsage) {
        // 免费使用，刷新剩余次数显示
        toast.success(`🎁 免费创作中，今日还剩 ${freeUsageRemaining} 次机会`);
        refetchEstimate();
      } else if (creditsCharged > 0) {
        // 扣除积分，刷新用户积分和剩余次数
        const { useAuthStore } = await import('../../../store/authStore');
        const { refreshUser } = useAuthStore.getState();
        await refreshUser();
        toast.success(`✨ 创作已开始，消耗 ${creditsCharged} 积分`);
        refetchEstimate();
      } else {
        toast.success('✨ 创作已开始，请稍候...');
      }

      // 开始轮询任务状态
      pollTaskStatus(newTaskId);
    } catch (error: any) {
      console.error('❌ [AIImageNode] 提交任务失败:', error);
      setIsGenerating(false);
      setGenerationProgress(0);
      
      // 权限错误 (403) 使用更友好的提示
      if (error.response?.status === 403) {
        const errMsg = error.response?.data?.error || '当前账户暂无此功能权限';
        toast.error(errMsg);
      } else {
        const errorDetail = error.response?.data?.error || error.message || '未知原因';
        toast.error(`创作启动失败：${errorDetail}，请稍后重试`);
      }
    }
  };

  // 批量创建预览节点（用于组图生成）
  const createMultiplePreviewNodes = (imageUrls: string[], imageRatio: string) => {
    if (!imageUrls || imageUrls.length === 0) return;
    
    console.log(`🖼️ [AIImageNode] 创建 ${imageUrls.length} 个预览节点`);
    
    // 依次创建每个预览节点
    imageUrls.forEach((imageUrl, index) => {
      // 使用 setTimeout 避免状态更新冲突
      setTimeout(() => {
        createPreviewNode(imageUrl, imageRatio, index);
      }, index * 100); // 每个节点间隔100ms创建
    });
  };

  // 创建预览节点
  const createPreviewNode = (imageUrl: string, imageRatio: string, batchIndex?: number) => {
    const currentNode = getNode(id);
    if (!currentNode) return;

    const zoom = 1;

    const allNodes = getNodes();
    const edges = getEdges();
    const connectedPreviewNodes = allNodes.filter(node => {
      // 检查是否有边从当前节点连接到这个节点，并且目标节点是 imagePreview 类型
      return node.type === 'imagePreview' && edges.some(edge =>
        edge.source === id && edge.target === node.id
      );
    });

    // ✅ 去重检查：如果已经存在相同 URL 的预览节点，不要重复创建
    const existingNode = connectedPreviewNodes.find(node => node.data.imageUrl === imageUrl);
    if (existingNode) {
      console.log('⚠️ [AIImageNode] 预览节点已存在，跳过创建:', {
        imageUrl,
        existingNodeId: existingNode.id,
      });
      return; // 直接返回，不创建新节点
    }

    const previewWidth = 400;
    const parseRatio = (r?: string, defH = 300) => {
      if (!r || !/^[0-9]+\s*:\s*[0-9]+$/.test(r)) return defH;
      const [rw, rh] = r.split(':').map((v) => parseFloat(v));
      if (!rw || !rh) return defH;
      return Math.round(previewWidth * (rh / rw));
    };
    const parentEl = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement | null;
    const parentWpx = parentEl?.getBoundingClientRect().width || 400;
    const parentW = Math.round(parentWpx / zoom);
    const spacingX = 200;
    const spacingY = 100;
    const targetH = parseRatio(imageRatio, 300);
    const baseX = currentNode.position.x + parentW + spacingX;
    const baseY = currentNode.position.y;
    // 如果是批量创建，使用 batchIndex 计算位置；否则使用现有连接数
    const existingCount = batchIndex !== undefined ? connectedPreviewNodes.length + batchIndex : connectedPreviewNodes.length;
    const posX = baseX;
    const posY = baseY + existingCount * (targetH + spacingY);

    // 使用时间戳创建唯一 ID
    const timestamp = Date.now();
    const previewNode = {
      id: `preview-${id}-${timestamp}`,
      type: 'imagePreview',
      position: {
        x: posX,
        y: posY,
      },
      data: {
        imageUrl,
        width: previewWidth,
        ratio: imageRatio,
        // 继承父节点的工作流上下文，用于自动命名
        workflowContext: currentNode.data.workflowContext,
        createdBy: currentNode.data.createdBy, // 🔑 继承父节点的创建者信息（协作者拖动权限）
      },
    };

    setNodes((nds) => [...nds, previewNode]);

    // 自动连接
    const newEdge = {
      id: `edge-${id}-${previewNode.id}`,
      source: id,
      target: previewNode.id,
      targetHandle: `${previewNode.id}-target`,
      type: 'aurora',
    };

    setEdges((eds) => {
      // 检查是否已存在连接
      const existingEdge = eds.find(
        (e) => e.source === id && e.target === previewNode.id
      );
      if (existingEdge) return eds;
      return [...eds, newEdge];
    });
  };

  // 监听节点数据变化，控制展开/缩略状态
  useEffect(() => {
    // 如果节点数据中有isExpanded标记，使用它
    if (data.isExpanded !== undefined) {
      setIsExpanded(data.isExpanded);
    }
  }, [data.isExpanded]);

  // 检查模型是否支持图片输入（提前声明）
  // ByteDance (豆包) 的所有图片生成模型都支持参考图输入
  // const supportsImageInput = !!(selectedModel && (
  //   (selectedModel.config as any)?.supportsImageToImage === true ||
  //   (selectedModel.provider?.toLowerCase() === 'bytedance' && selectedModel.type === 'IMAGE_GENERATION')
  // ));

  // 如果已生成图片且处于缩略状态，显示缩略图
  if (!isExpanded && data.config.generatedImageUrl) {
    const [ratioW, ratioH] = (data.config.ratio || '1:1').split(':').map(Number);
    const aspectRatio = ratioW / ratioH;
    const thumbnailWidth = 320;
    const thumbnailHeight = thumbnailWidth / aspectRatio;

    return (
      <div
        className="relative cursor-pointer"
        style={{ width: thumbnailWidth, height: thumbnailHeight }}
        onDoubleClick={() => {
          setIsExpanded(true);
          const currentNode = getNode(id);
          if (currentNode) {
            setNodes((nds) =>
              nds.map((node) =>
                node.id === id
                  ? {
                    ...node,
                    data: {
                      ...node.data,
                      isExpanded: true,
                    },
                  }
                  : node
              )
            );
          }
        }}
      >
        {/* 创建者头像徽章 */}
        <NodeCreatorBadge createdBy={data.createdBy} isSharedWorkflow={data._isSharedWorkflow} />
        
        <CustomHandle
          type="target"
          position={Position.Left}
          id={`${id}-target`}
          className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)] !z-[10000]"
          isConnectable={true}
          disabled={isHandleDisabled}
          isValidConnection={validateIncomingConnection}
        />

        <img
          src={data.config.generatedImageUrl}
          alt=""
          className="w-full h-full object-cover rounded-2xl"
        />
        {prompt && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-2 rounded-b-2xl">
            <p className="truncate" title={prompt}>{prompt}</p>
          </div>
        )}
        <CustomHandle
          type="source"
          position={Position.Right}
          id={`${id}-source`}
          className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)] !z-[10000]"
        />
      </div>
    );
  }

  // 如果未生成图片且处于缩略状态，显示提示词
  if (!isExpanded && !data.config.generatedImageUrl) {
    return (
      <div
        className={`relative bg-white dark:bg-[#18181b] backdrop-blur-xl border rounded-2xl shadow-xl transition-all ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-white/60 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'
        }`}
        style={{ width: 320 }}
        onDoubleClick={() => {
          setIsExpanded(true);
          const currentNode = getNode(id);
          if (currentNode) {
            setNodes((nds) =>
              nds.map((node) =>
                node.id === id
                  ? {
                    ...node,
                    data: {
                      ...node.data,
                      isExpanded: true,
                    },
                  }
                  : node
              )
            );
          }
        }}
      >
        {/* 创建者头像徽章 */}
        <NodeCreatorBadge createdBy={data.createdBy} isSharedWorkflow={data._isSharedWorkflow} />
        
        <CustomHandle
          type="target"
          position={Position.Left}
          id={`${id}-target`}
          className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
          isConnectable={true}
          disabled={isHandleDisabled}
          isValidConnection={validateIncomingConnection}
        />

        {/* 节点头部 - Aurora渐变样式 */}
        <div className="flex items-center justify-between px-4 py-3 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 0, "wght" 200, "GRAD" 0, "opsz" 20' }}>image</span>
            <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-white">{data.label}</span>
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse shadow-[0_0_5px_currentColor]"></div>

        </div>

        {/* 收缩状态内容 */}
        <div className="p-4">
          {prompt ? (
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">提示词</label>
              <p className="text-xs text-slate-800 dark:text-white line-clamp-6 whitespace-pre-wrap break-words">
                {prompt}
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-white/50 text-center italic">
              双击展开配置
            </p>
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
  }

  // 极简展开状态
  return (
    <div
      className={`relative bg-white dark:bg-[#18181b] backdrop-blur-xl border rounded-2xl shadow-xl transition-all ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-white/60 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'
      }`}
      style={{ width: 320 }}
    >
      {/* 创建者头像徽章 */}
      <NodeCreatorBadge createdBy={data.createdBy} isSharedWorkflow={data._isSharedWorkflow} />
      
      <CustomHandle
        type="target"
        position={Position.Left}
        id={`${id}-target`}
        className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
        isConnectable={true}
        disabled={isHandleDisabled}
        isValidConnection={validateIncomingConnection}
      />

      {/* 节点头部 - Aurora渐变样式 */}
      <div className="flex items-center justify-between px-4 py-3 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 0, "wght" 200, "GRAD" 0, "opsz" 20' }}>image</span>
          <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-white">{data.label}</span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse shadow-[0_0_5px_currentColor]"></div>
      </div>

      <div className="p-4 space-y-4">
        {isExpanded ? (
          <>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">模型</label>
              <CustomSelect
                value={selectedModel?.id || ''}
                onChange={(value) => {
                  const model = imageModels.find((m: any) => m.id === value);
                  setSelectedModel(model || null);
                  if (model) {
                    const config = model.config as any;
                    if (config?.supportedRatios && config.supportedRatios.length > 0) {
                      setRatio(config.supportedRatios[0]);
                    }
                    updateNodeData({
                      modelId: model.id,
                      acceptedInputs: config?.acceptedInputs || ['TEXT', 'IMAGE']
                    });
                  }
                }}
                options={imageModels.map((model: any) => ({
                  value: model.id,
                  label: model.name
                }))}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">提示词</label>
              <textarea
                ref={promptTextareaRef}
                value={prompt}
                onChange={(e) => {
                  userEditedPromptRef.current = true;
                  setPrompt(e.target.value);
                }}
                className="nodrag w-full p-2 text-xs rounded-md border outline-none resize-none overflow-hidden transition-colors font-mono leading-relaxed bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 focus:bg-white dark:focus:bg-white/10 border-slate-200 dark:border-white/10 focus:border-neutral-400 dark:focus:border-neutral-400/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30"
                placeholder="输入您的创意"
                style={{ minHeight: '60px' }}
              />
            </div>

            {/* 参考图缩略图区域 */}
            {referenceImages.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">参考图片 ({referenceImages.length})</div>
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    width: '100%'
                  }}
                >
                  {referenceImages.map((imgUrl, index) => (
                    <div
                      key={index}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        handleDragStart(index);
                      }}
                      onDragEnd={(e) => {
                        e.stopPropagation();
                        handleDragComplete();
                      }}
                      onDragOver={(e) => {
                        e.stopPropagation();
                        handleDragOver(e, index);
                      }}
                      className={`nodrag relative group cursor-move aspect-square ${draggedIndex === index ? 'opacity-50' : ''
                        }`}
                    >
                      <img
                        src={imgUrl}
                        alt={`图片${index + 1}`}
                        className="w-full h-full object-cover rounded-md border border-slate-200 dark:border-white/10 group-hover:border-neutral-400 dark:group-hover:border-neutral-400 transition-colors"
                      />
                      {/* 序号标签 */}
                      <div className="absolute top-0 left-0 bg-neutral-600 text-white text-xs px-1.5 py-0.5 rounded-br">
                        {index + 1}
                      </div>

                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Gemini 3 Pro Image 分辨率选择 - 根据管理后台配置动态显示 */}
            {selectedModel?.modelId === 'gemini-3-pro-image-preview' && (() => {
              const supportedResolutions: string[] = selectedModel?.config?.supportedResolutions || [];
              // 如果没有配置任何分辨率或只有一个，不显示选择器
              if (supportedResolutions.length <= 1) return null;
              return (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">分辨率</label>
                  <div className={`grid grid-cols-${supportedResolutions.length} gap-2`}>
                    {supportedResolutions.map((res) => (
                      <button
                        key={res}
                        onClick={() => setImageSize(res)}
                        className={`nodrag py-2 rounded-lg text-[10px] font-bold transition-colors border ${
                          imageSize === res
                            ? 'bg-neutral-800 dark:bg-white text-white dark:text-black text-white shadow-md border-transparent dark:border-white/10'
                            : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-white/70 border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center justify-center gap-2">
                          <span className="material-symbols-outlined text-sm">{res === '4K' ? '4k' : 'hd'}</span>
                          <span>{res}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* SeeDream 4.5 组图数量选择 */}
            {selectedModel?.modelId === 'doubao-seedream-4-5-251128' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">出图数量</label>
                  <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">{maxImages} 张</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="15"
                  value={maxImages}
                  onChange={(e) => setMaxImages(Number(e.target.value))}
                  className="nodrag w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #404040 0%, #525252 ${((maxImages - 1) / 14) * 50}%, #06b6d4 ${((maxImages - 1) / 14) * 100}%, var(--range-bg-color) ${((maxImages - 1) / 14) * 100}%, var(--range-bg-color) 100%)`
                  }}
                />
                <div className="flex justify-between text-[9px] text-slate-400 dark:text-white/40">
                  <span>1张</span>
                  <span>15张</span>
                </div>
                {maxImages > 1 && (
                  <p className="text-[9px] text-amber-500 dark:text-amber-400">
                    💡 组图模式：生成一组连贯的图片，生成时间较长（可能需要几分钟）
                  </p>
                )}
              </div>
            )}

            {/* 比例选择：Sora模型显示横竖屏按钮，其他模型显示下拉框 */}
            {getSupportedRatios().length > 0 && (
              <div className="space-y-1">
                {(selectedModel?.provider?.toLowerCase() === 'sora') ? (
                  <>
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">图片比例</label>
                    <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setRatio('16:9')}
                      className={`nodrag py-2 rounded text-sm font-medium transition-colors border ${ratio === '16:9'
                          ? 'bg-neutral-600 text-white border-neutral-500'
                          : 'bg-neutral-950/50 text-neutral-300 border-neutral-700/30 hover:bg-neutral-900/50'
                        }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-lg">crop_landscape</span>
                        <span>横屏</span>
                      </div>
                    </button>
                    <button
                      onClick={() => setRatio('9:16')}
                      className={`nodrag py-2 rounded text-sm font-medium transition-colors border ${ratio === '9:16'
                          ? 'bg-neutral-600 text-white border-neutral-500'
                          : 'bg-neutral-950/50 text-neutral-300 border-neutral-700/30 hover:bg-neutral-900/50'
                        }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-lg">crop_portrait</span>
                        <span>竖屏</span>
                      </div>
                    </button>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">图片比例</label>
                    <CustomSelect
                      value={ratio}
                      onChange={(value) => setRatio(value)}
                      options={getSupportedRatios().map((r: string) => {
                        const [w, h] = r.split(':');
                        const labels: Record<string, string> = {
                          '21:9': '21:9 超宽屏',
                          '16:9': '16:9 宽屏',
                          '4:3': '4:3 标准横屏',
                          '3:2': '3:2 横屏',
                          '5:4': '5:4 接近正方形',
                          '1:1': '1:1 正方形',
                          '4:5': '4:5 接近正方竖屏',
                          '2:3': '2:3 竖屏',
                          '3:4': '3:4 标准竖屏',
                          '9:16': '9:16 竖屏',
                        };
                        return {
                          value: r,
                          label: labels[r] || `${w}:${h}`
                        };
                      })}
                    />
                  </>
                )}
              </div>
            )}

            {/* 生成按钮 - Aurora样式 */}
            <button
              onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={isGenerating || !prompt.trim() || data._canEdit === false}
              className={`nodrag w-full mt-2 py-2 text-[10px] font-bold rounded-lg border transition-all flex items-center justify-center gap-2 ${isGenerating || !prompt.trim() ? 'bg-neutral-800 dark:bg-white text-white dark:text-black cursor-not-allowed border-transparent' : 'bg-neutral-800 dark:bg-white text-white dark:text-black shadow-md hover:shadow-lg border-transparent dark:border-white/10 active:scale-95'}`}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>生成中...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3" />
                  <span>生成图片</span>
                  {/* 积分/免费显示 */}
                  {!creditsLoading && (
                    isFreeUsage ? (
                      <span className="ml-1 px-1.5 py-0.5 text-neutral-400 dark:text-neutral-500 rounded text-[9px]">
                        免费，今日剩{Math.floor(freeUsageRemaining)}次
                      </span>
                    ) : credits !== null && credits > 0 ? (
                      <span className="ml-1 px-1.5 py-0.5 text-neutral-400 dark:text-neutral-500 text-[9px]">
                        {credits}积分
                      </span>
                    ) : null
                  )}
                </>
              )}
            </button>

          </>
        ) : null}
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

export default memo(AIImageNode);
