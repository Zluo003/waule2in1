import { memo, useState, useEffect, useMemo, useRef } from 'react';
import { Position, NodeProps, useReactFlow, useStore, useNodes } from 'reactflow';
import { toast } from 'react-hot-toast';
import { Loader2, Sparkles } from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { processImageUrl, smartCompressImage } from '../../../utils/imageUtils';
import { processTaskResult } from '../../../utils/taskResultHandler';
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
    maxImages?: number; // SeeDream 4.5 组图数量 (1-15)
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
  const [maxImages, setMaxImages] = useState(data.config.maxImages || 1); // SeeDream 4.5 组图数量
  // 如果有未完成的taskId，初始化为生成中状态
  const [isGenerating, setIsGenerating] = useState(!!data.config.taskId);
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
    const savedGeneratedImageUrl = data.config.generatedImageUrl;

    const recoverTask = async () => {
      // 如果已有生成的图片 URL 且没有进行中的任务，不需要恢复
      // 这意味着任务已经完成并处理过了
      if (savedGeneratedImageUrl && !initialTaskId) {
        console.log('[AIImageNode] 已有生成结果，跳过恢复:', savedGeneratedImageUrl.substring(0, 50));
        return;
      }

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
              toast.error('任务完成但未找到结果');
              return;
            }

            // 如果已有保存的本地 URL，优先使用（避免重复下载已删除的 OSS 文件）
            let displayUrl = imageUrl;
            if (savedGeneratedImageUrl) {
              console.log('[AIImageNode] 使用已保存的本地 URL:', savedGeneratedImageUrl.substring(0, 50));
              displayUrl = savedGeneratedImageUrl;
            } else {
              // 处理任务结果（如果启用本地存储，会下载到本地）
              const processedResult = await processTaskResult({
                taskId: initialTaskId,
                resultUrl: imageUrl,
                type: 'IMAGE',
                allImageUrls: task.metadata?.allImageUrls as string[] | undefined,
              });
              displayUrl = processedResult.displayUrl;
            }

            // 使用保存在node data中的ratio（页面刷新前保存的）
            const savedRatio = data.config.ratio || '1:1';

            updateNodeData({
              prompt: data.config.prompt || prompt,
              ratio: savedRatio,
              modelId: data.config.modelId || selectedModel?.id,
              generatedImageUrl: displayUrl,
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

            const existingNode = connectedPreviewNodes.find(node => node.data.imageUrl === displayUrl || node.data.imageUrl === imageUrl);
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
                createPreviewNode(displayUrl, savedRatio);
              }
            } catch {
              createPreviewNode(displayUrl, savedRatio);
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
            toast.error(`生成失败: ${task.errorMessage || '未知错误'}`);
          }
        } catch (error: any) {
          setIsGenerating(false);
          setGenerationProgress(0);
          updateNodeData({ taskId: '' });
          toast.error('任务恢复失败，请重新生成');
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
      toast.error('参考图已达上限，已移除多余连接');
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
      toast.error('图片节点不接受视频/音频/文档');
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
    const maxAttempts = 300; // 最多5分钟 (300 * 1秒)
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
          // 检查是否有多图（SeeDream 4.5 组图）
          const allImageUrls = task.metadata?.allImageUrls as string[] | undefined;
          const imageCount = allImageUrls?.length || 1;
          
          // 调试：查看任务返回数据
          console.log('[AIImageNode] 任务完成，检查多图:', {
            hasMetadata: !!task.metadata,
            allImageUrls,
            imageCount,
            metadata: task.metadata,
          });

          // 处理任务结果（如果启用本地存储，会下载到本地）
          const processedResult = await processTaskResult({
            taskId,
            resultUrl: imageUrl,
            type: 'IMAGE',
            allImageUrls,
          });
          
          const displayUrl = processedResult.displayUrl;
          const displayUrls = processedResult.allDisplayUrls;
          
          if (processedResult.isLocalStored) {
            console.log('[AIImageNode] 结果已下载到本地:', displayUrl);
          }
          
          updateNodeData({
            prompt,
            ratio,
            modelId: selectedModel?.id,
            generatedImageUrl: displayUrl,
            taskId: '',
          });

          // 为所有图片创建预览节点
          if (displayUrls && displayUrls.length > 1) {
            createMultiplePreviewNodes(displayUrls, ratio);
            toast.success(`生成成功！共 ${imageCount} 张图片`);
          } else {
            createPreviewNode(displayUrl, ratio, 0);
            toast.success('图片生成成功！');
          }
          return;
        } else if (task.status === 'FAILURE') {
          // 生成失败，刷新积分（因为会退款）
          setIsGenerating(false);
          setGenerationProgress(0);
          updateNodeData({ taskId: '' });
          
          // 刷新用户积分（退款后）
          const { useTenantAuthStore } = await import('../../../store/tenantAuthStore');
          const { refreshUser } = useTenantAuthStore.getState();
          if (refreshUser) await refreshUser();
          
          toast.error(task.errorMessage || '图片生成失败，积分已退还');
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
            toast.error('生成超时，请重试');
          }
        }
      } catch (error: any) {
        setIsGenerating(false);
        setGenerationProgress(0);
        updateNodeData({ taskId: '' });
        toast.error('查询任务状态失败');
      }
    };

    poll();
  };

  // 从连接的节点获取新鲜的图片URL（每次生成都重新获取，避免使用已删除的OSS链接）
  const getFreshReferenceImages = (): string[] => {
    const freshImages: string[] = [];
    const maxImages = getMaxReferenceImages();
    
    connectedEdges.forEach((edge: any) => {
      if (freshImages.length >= maxImages) return;
      const sourceNode = getNode(edge.source);
      if (!sourceNode) return;
      
      const sourceData = sourceNode.data as any;
      
      // 资产选择器角色多图
      if (sourceNode.type === 'assetSelector' && sourceData.config?.subjects && sourceData.config.subjects.length > 0) {
        const first = sourceData.config.subjects[0].images?.[0];
        if (first && !freshImages.includes(first)) {
          freshImages.push(first);
        }
      }
      
      // 检查生成的图片节点
      let imageUrl = sourceData.config?.generatedImageUrl || sourceData.imageUrl || '';
      
      // 检查资产选择器节点
      if (!imageUrl && sourceData.config?.selectedAsset) {
        const asset = sourceData.config.selectedAsset;
        if (asset.type === 'IMAGE') {
          imageUrl = asset.url;
        }
      }
      
      // 检查上传节点
      if (!imageUrl && sourceData.config?.uploadedFiles && sourceData.config.uploadedFiles.length > 0) {
        const uploadedFile = sourceData.config.uploadedFiles[0];
        if (uploadedFile.type === 'IMAGE') {
          imageUrl = uploadedFile.url;
        }
      }
      
      if (imageUrl && !freshImages.includes(imageUrl)) {
        freshImages.push(imageUrl);
      }
    });
    
    return freshImages.slice(0, maxImages);
  };

  // 生成图片（异步任务）
  const handleGenerate = async () => {
    if (!prompt.trim() || !selectedModel) return;

    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      // 每次生成都从连接节点重新获取图片URL（避免使用已删除的OSS链接）
      const freshImages = getFreshReferenceImages();
      console.log('[AIImageNode] 获取新鲜图片URL:', freshImages);
      
      // 处理参考图片（本地转base64，公网直接用）
      // 超过10MB的图片自动等比压缩
      let processedReferenceImages: string[] = [];

      if (freshImages.length > 0) {
        try {
          for (const imageUrl of freshImages) {
            // 先智能压缩（超过10MB自动压缩）
            const compressedUrl = await smartCompressImage(imageUrl);
            // 再处理URL（本地转base64等）
            const processedUrl = await processImageUrl(compressedUrl);
            processedReferenceImages.push(processedUrl);
          }
        } catch (error) {
          console.error('[AIImageNode] 处理参考图失败:', error);
        }
      }

      // 处理提示词：SeeDream 4.5 组图模式时自动添加前缀
      let finalPrompt = prompt.trim();
      const isSeeDream45 = selectedModel.modelId === 'doubao-seedream-4-5-251128';
      if (isSeeDream45 && maxImages > 1) {
        finalPrompt = `生成一组${maxImages}张图片，${finalPrompt}`;
      }
      
      // Gemini 3 Pro Image 模型：自动添加比例到提示词末尾
      const isGemini3Pro = selectedModel.modelId === 'gemini-3-pro-image-preview';
      if (isGemini3Pro && ratio) {
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
      
      // 如果是 SeeDream 4.5 模型，添加组图数量参数
      if (isSeeDream45 && maxImages > 1) {
        taskPayload.metadata = {
          ...taskPayload.metadata,
          maxImages,
        };
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
        toast.success(`免费生成，今日还剩 ${freeUsageRemaining} 次`);
        refetchEstimate();
      } else if (creditsCharged > 0) {
        // 扣除积分，刷新用户积分和剩余次数
        const { useTenantAuthStore } = await import('../../../store/tenantAuthStore');
        const { refreshUser } = useTenantAuthStore.getState();
        if (refreshUser) await refreshUser();
        toast.success(`任务已提交（已扣除 ${creditsCharged} 积分）`);
        refetchEstimate();
      } else {
        toast.success('任务已提交，正在生成中...');
      }

      // 开始轮询任务状态
      pollTaskStatus(newTaskId);
    } catch (error: any) {
      console.error('❌ [AIImageNode] 提交任务失败:', error);
      setIsGenerating(false);
      setGenerationProgress(0);
      
      // 权限错误 (403) 使用更友好的提示
      if (error.response?.status === 403) {
        const errMsg = error.response?.data?.error || '您没有权限使用此功能';
        toast.error(errMsg);
      } else {
        toast.error(`提交失败: ${error.response?.data?.error || error.message}`);
      }
    }
  };

  // 创建预览节点
  const createPreviewNode = (imageUrl: string, imageRatio: string, offsetIndex: number = 0) => {
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
    const existingCount = connectedPreviewNodes.length;
    const posX = baseX;
    // 使用 offsetIndex + existingCount 来计算位置，避免快速创建多个节点时位置重叠
    const posY = baseY + (existingCount + offsetIndex) * (targetH + spacingY);

    // 使用时间戳 + 随机数创建唯一 ID
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const previewNode = {
      id: `preview-${id}-${timestamp}-${randomSuffix}`,
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

  // 批量创建多个预览节点（解决快速连续调用 setNodes 导致只有最后一个生效的问题）
  const createMultiplePreviewNodes = (imageUrls: string[], imageRatio: string) => {
    const currentNode = getNode(id);
    if (!currentNode) return;

    const zoom = 1;
    const allNodes = getNodes();
    const edges = getEdges();
    const connectedPreviewNodes = allNodes.filter(node => {
      return node.type === 'imagePreview' && edges.some(edge =>
        edge.source === id && edge.target === node.id
      );
    });

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
    const existingCount = connectedPreviewNodes.length;

    // 过滤掉已存在的 URL
    const existingUrls = new Set(connectedPreviewNodes.map(node => node.data.imageUrl));
    const newUrls = imageUrls.filter(url => !existingUrls.has(url));

    if (newUrls.length === 0) {
      console.log('⚠️ [AIImageNode] 所有预览节点已存在，跳过创建');
      return;
    }

    // 一次性创建所有新节点和边
    const newNodes: any[] = [];
    const newEdges: any[] = [];

    newUrls.forEach((imageUrl, index) => {
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const nodeId = `preview-${id}-${timestamp}-${randomSuffix}-${index}`;
      const posY = baseY + (existingCount + index) * (targetH + spacingY);

      const previewNode = {
        id: nodeId,
        type: 'imagePreview',
        position: { x: baseX, y: posY },
        data: {
          imageUrl,
          width: previewWidth,
          ratio: imageRatio,
          projectId: (currentNode.data as any).projectId,
          episodeId: (currentNode.data as any).episodeId,
        },
      };

      const newEdge = {
        id: `edge-${id}-${nodeId}`,
        source: id,
        target: nodeId,
        sourceHandle: 'output',
        targetHandle: 'input',
        type: 'default',
      };

      newNodes.push(previewNode);
      newEdges.push(newEdge);
    });

    // 一次性更新所有节点和边
    setNodes((nds) => [...nds, ...newNodes]);
    setEdges((eds) => [...eds, ...newEdges]);

    console.log(`✅ [AIImageNode] 批量创建了 ${newNodes.length} 个预览节点`);
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
        className={`relative bg-white/80 dark:bg-[#18181b]/100 dark:backdrop-blur-none backdrop-blur-sm border rounded-2xl shadow-xl transition-all ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-white/60 dark:border-neutral-700 ring-black/5 dark:ring-neutral-700 ring-black/5'
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
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">提示词</label>
              <p className="text-xs text-slate-800 dark:text-white line-clamp-6 whitespace-pre-wrap break-words">
                {prompt}
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-neutral-400 text-center italic">
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
      className={`relative bg-white/80 dark:bg-[#18181b]/100 dark:backdrop-blur-none backdrop-blur-sm border rounded-2xl shadow-xl transition-all ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-white/60 dark:border-neutral-700 ring-black/5 dark:ring-neutral-700 ring-black/5'
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
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">模型</label>
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
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">提示词</label>
              <textarea
                ref={promptTextareaRef}
                value={prompt}
                onChange={(e) => {
                  userEditedPromptRef.current = true;
                  setPrompt(e.target.value);
                }}
                className="nodrag w-full p-2 text-xs rounded-md border outline-none resize-none overflow-hidden transition-colors leading-relaxed bg-slate-100 dark:bg-[#000000] backdrop-blur-none hover:bg-slate-200 dark:hover:bg-neutral-800 focus:bg-white dark:focus:bg-neutral-800 border-slate-200 dark:border-neutral-800 focus:border-neutral-400 dark:focus:border-neutral-400/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500"
                placeholder="输入您的创意"
                style={{ minHeight: '60px' }}
              />
            </div>

            {/* 参考图缩略图区域 */}
            {referenceImages.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">参考图片 ({referenceImages.length})</div>
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
                        className="w-full h-full object-cover rounded-md border border-slate-200 dark:border-neutral-800 group-hover:border-neutral-400 dark:group-hover:border-neutral-400 transition-colors"
                      />
                      {/* 序号标签 */}
                      <div className="absolute top-0 left-0 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-black text-xs px-1.5 py-0.5 rounded-br">
                        {index + 1}
                      </div>

                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Gemini 3 Pro Image 分辨率选择 */}
            {selectedModel?.modelId === 'gemini-3-pro-image-preview' && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">分辨率</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setImageSize('2K')}
                    className={`nodrag py-2 rounded-lg text-[10px] font-bold transition-colors border ${
                      imageSize === '2K'
                        ? 'bg-neutral-800 dark:bg-white text-white dark:text-black shadow-md border-transparent dark:border-neutral-700'
                        : 'bg-slate-100 dark:bg-[#000000] backdrop-blur-none text-slate-700 dark:text-neutral-300 border-slate-200 dark:border-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-sm">hd</span>
                      <span>2K</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setImageSize('4K')}
                    className={`nodrag py-2 rounded-lg text-[10px] font-bold transition-colors border ${
                      imageSize === '4K'
                        ? 'bg-neutral-800 dark:bg-white text-white dark:text-black shadow-md border-transparent dark:border-neutral-700'
                        : 'bg-slate-100 dark:bg-[#000000] backdrop-blur-none text-slate-700 dark:text-neutral-300 border-slate-200 dark:border-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-sm">4k</span>
                      <span>4K</span>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* SeeDream 4.5 组图数量滑块 */}
            {selectedModel?.modelId === 'doubao-seedream-4-5-251128' && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">
                  出图数量 <span className="text-neutral-500 dark:text-neutral-400">{maxImages}</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="1"
                    max="15"
                    value={maxImages}
                    onChange={(e) => setMaxImages(parseInt(e.target.value))}
                    className="nodrag w-full h-2 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #404040 0%, #737373 ${((maxImages - 1) / 14) * 50}%, #06b6d4 ${((maxImages - 1) / 14) * 100}%, var(--range-bg-color, #e2e8f0) ${((maxImages - 1) / 14) * 100}%, var(--range-bg-color, #e2e8f0) 100%)`
                    }}
                  />
                  <span className="text-xs text-slate-500 dark:text-neutral-400 w-6 text-center">{maxImages}</span>
                </div>
                <p className="text-[9px] text-slate-400 dark:text-white/40">
                  生成一组连贯的系列图片（1-15张）
                </p>
              </div>
            )}

            {/* 比例选择：Sora模型显示横竖屏按钮，其他模型显示下拉框 */}
            {getSupportedRatios().length > 0 && (
              <div className="space-y-1">
                {(selectedModel?.provider?.toLowerCase() === 'sora') ? (
                  <>
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">图片比例</label>
                    <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setRatio('16:9')}
                      className={`nodrag py-2 rounded text-sm font-medium transition-colors border ${ratio === '16:9'
                          ? 'bg-neutral-800 text-white border-neutral-700 dark:bg-white dark:text-black dark:border-neutral-300'
                          : 'bg-neutral-100 dark:bg-neutral-700/50 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-600 hover:bg-neutral-200 dark:hover:bg-neutral-600/50'
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
                          ? 'bg-neutral-800 text-white border-neutral-700 dark:bg-white dark:text-black dark:border-neutral-300'
                          : 'bg-neutral-100 dark:bg-neutral-700/50 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-600 hover:bg-neutral-200 dark:hover:bg-neutral-600/50'
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
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">图片比例</label>
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
              onClick={handleGenerate}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={isGenerating || !prompt.trim() || data._canEdit === false}
              className={`nodrag w-full mt-2 py-2 text-[10px] font-bold rounded-lg border transition-all active:scale-95 flex items-center justify-center gap-2 ${
                isGenerating || !prompt.trim() || data._canEdit === false
                  ? 'bg-neutral-400 dark:bg-neutral-700 text-white dark:text-neutral-300 cursor-not-allowed border-transparent dark:border-neutral-700'
                  : 'bg-neutral-800 dark:bg-white text-white dark:text-black shadow-md hover:shadow-lg border-transparent dark:border-neutral-700'
              }`}
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
                      <span className="ml-1 text-[9px] opacity-70">
                        免费，今日剩{freeUsageRemaining}次
                      </span>
                    ) : credits !== null && credits > 0 ? (
                      <span className="ml-1 text-[9px] opacity-70">
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
