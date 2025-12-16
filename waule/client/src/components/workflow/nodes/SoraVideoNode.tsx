import { memo, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import { Position, NodeProps, useReactFlow, useEdges, useNodes } from 'reactflow';
import { toast } from 'sonner';
import { apiClient } from '../../../lib/api';
import { processImageUrl } from '../../../utils/imageUtils';
import CustomHandle from '../CustomHandle';
import CustomSelect from './CustomSelect';
import { useBillingEstimate } from '../../../hooks/useBillingEstimate';
import NodeCreatorBadge from '../NodeCreatorBadge';

// 角色提及类型
interface SoraCharacterMention {
  id: string;
  customName: string;
  characterName: string;
  avatarUrl?: string;
}

const API_URL = import.meta.env.VITE_API_URL || '';

interface AIModel {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  type: string;
  config: {
    supportedRatios?: string[];
    supportedResolutions?: string[];
    supportedGenerationTypes?: string[];
    supportsVideoEditing?: boolean;
    supportedDurations?: number[];
    acceptedInputs?: string[];
    supportedEditingCapabilities?: string[];
  };
}

interface ReferenceImage {
  id: string;
  url: string;
  name: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
}

interface AIVideoNodeData {
  label: string;
  type: string;
  models?: AIModel[];
  isExpanded?: boolean;
  config: {
    modelId?: string;
    modelName?: string;
    prompt?: string;
    ratio?: string;
    resolution?: string;
    generationType?: string;
    lockedGenerationType?: string;
    hideGenerationTypeSelector?: boolean;
    duration?: number;
    referenceImages?: ReferenceImage[];
    acceptedInputs?: string[];
    taskId?: string;
    generatedVideoUrl?: string;
    isGenerating?: boolean; // 生成状态，用于刷新页面后恢复
  };
  _canEdit?: boolean;
  _isGrouped?: boolean;
}

const SoraVideoNode = ({ data, selected, id }: NodeProps<AIVideoNodeData>) => {
  // AI视频节点强制默认展开（忽略保存的状态）
  const [isExpanded, setIsExpanded] = useState(true);
  const [, setGenerationProgress] = useState(0);
  const [taskId, setTaskId] = useState(data.config.taskId || '');

  // 调试日志：显示当前taskId
  useEffect(() => {
    if (taskId) {
    
    }
  }, [taskId]);

  const { setNodes, setEdges, getNode, getNodes, getEdges } = useReactFlow();
  const edges = useEdges();
  const allNodes = useNodes(); // 监听所有节点变化
  const lastPromptSourceRef = useRef<string>(''); // 追踪上游文本来源

  // 当前选择的视频编辑能力（若有）
  const selectedEditingCapability = (data.config as any)?.selectedEditingCapability as string | undefined;

  // 筛选可用模型：只保留 Sora 模型
  const videoModels = useMemo(() => {
    const all = (data.models || []);
    return all.filter(m => m.type === 'VIDEO_GENERATION' && m.provider?.toLowerCase() === 'sora');
  }, [data.models]);

  // 表单状态
  const [prompt, setPrompt] = useState(data.config.prompt || '');
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  
  // 同步外部传入的 prompt（当上游节点直接更新 config.prompt 时）
  useEffect(() => {
    if (data.config.prompt && data.config.prompt !== prompt) {
      setPrompt(data.config.prompt);
    }
  }, [data.config.prompt]);
  const [modelId, setModelId] = useState(data.config.modelId || (videoModels[0]?.id || ''));
  const [ratio, setRatio] = useState(data.config.ratio || '16:9');
  const [resolution, setResolution] = useState(data.config.resolution || '1080P');
  const normalizeGenType = useCallback((t?: string) => {
    const s = (t || '').toLowerCase();
    if (!s) return '';
    if (s.includes('文生') || s.includes('t2v')) return '文生视频';
    if (s.includes('首尾')) return '首尾帧';
    if (s.includes('首帧') || s.includes('first frame') || s.includes('start frame') || s.includes('initial frame') || s.includes('keyframe')) return '首帧';
    if (s.includes('尾帧') || s.includes('last frame') || s.includes('end frame') || s.includes('final frame')) return '尾帧';
    if (s.includes('主体参考')) return '参考图';
    if (s.includes('参考') || s.includes('reference image') || s.includes('image reference') || s.includes('ref image')) return '参考图';
    if (s.includes('text-to-video')) return '文生视频';
    if (s.includes('first-last') || s.includes('two-frame') || s.includes('frame pair')) return '首尾帧';
    if (s.includes('first')) return '首帧';
    if (s.includes('last')) return '尾帧';
    if (s.includes('subject')) return '参考图';
    if (s.includes('reference')) return '参考图';
    return t || '';
  }, []);

  const [generationType, setGenerationType] = useState(
    (data.config.lockedGenerationType ? normalizeGenType(data.config.lockedGenerationType) : data.config.generationType) || '文生视频'
  );
  const [duration, setDuration] = useState(data.config.duration || 10);
  // 从节点数据恢复生成状态（解决刷新页面丢失任务问题）
  const [isGenerating, setIsGenerating] = useState(data.config.isGenerating || false);
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText] = useState('');
  const [confirmType] = useState<'alert' | 'confirm'>('confirm');
  const [confirmBehavior] = useState<'dropImages' | 'useFirstImage' | 'useFirstTwoImages' | null>(null);

  // 角色@提及相关状态
  const [showCharacterSelector, setShowCharacterSelector] = useState(false);
  const [characterSuggestions, setCharacterSuggestions] = useState<SoraCharacterMention[]>([]);
  const [characterSearchQuery, setCharacterSearchQuery] = useState('');
  const [mentionCursorPosition, setMentionCursorPosition] = useState(0);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const isComposingRef = useRef(false); // 跟踪中文输入法状态
  
  // BGM开关状态（默认关闭，即无BGM）
  const [enableBGM, setEnableBGM] = useState(false);

  // 当前选中的模型（如果指定ID不存在，则回退到第一个可用模型，确保UI不消失）
  const selectedModel = videoModels.find(m => m.id === modelId) || videoModels[0];

  // 积分估算
  const { credits, loading: creditsLoading, isFreeUsage, freeUsageRemaining, refetch: refetchEstimate } = useBillingEstimate({
    aiModelId: selectedModel?.id,
    duration: duration,
    resolution: resolution,
  });

  // 当可用模型集合变化时，若当前模型不再可用则自动切换到第一个可用模型
  useEffect(() => {
    if (!videoModels.find(m => m.id === modelId)) {
      const nextId = videoModels[0]?.id || '';
      setModelId(nextId);
      updateNodeData({ modelId: nextId, modelName: videoModels[0]?.name });
    }
  }, [videoModels]);

  // 检测是否为 Sora 模型
  const isSoraModel = selectedModel?.provider?.toLowerCase() === 'sora';

  const durationOptions = useMemo(() => {
    if (selectedModel?.config.supportedDurations?.length) {
      return selectedModel.config.supportedDurations;
    }
    const prov = (selectedModel?.provider || '').toLowerCase();
    if (prov === 'sora') return [10, 15];
    if (prov === 'minimaxi') return [6, 10];
    return [duration || 10];
  }, [selectedModel, duration]);

  const resolutionOptions = useMemo(() => {
    if (selectedModel?.config.supportedResolutions?.length) {
      return selectedModel.config.supportedResolutions;
    }
    const prov = (selectedModel?.provider || '').toLowerCase();
    if (prov === 'minimaxi') return ['768P', '1080P'];
    return ['720P', '1080P', '2K', '4K'];
  }, [selectedModel]);

  const durationMin = useMemo(() => Math.min(...durationOptions), [durationOptions]);
  const durationMax = useMemo(() => Math.max(...durationOptions), [durationOptions]);
  const durationRange = useMemo(() => Math.max(1, durationMax - durationMin), [durationMax, durationMin]);
  const durationProgress = useMemo(() => {
    const raw = ((duration - durationMin) / durationRange) * 100;
    if (Number.isNaN(raw)) return 0;
    return Math.min(100, Math.max(0, raw));
  }, [duration, durationMin, durationRange]);
  const durationDisabled = !selectedModel || !(selectedModel.config.supportedDurations?.length);
  const resolutionDisabled = !selectedModel || !(selectedModel.config.supportedResolutions?.length);


  // 更新节点数据
  const updateNodeData = useCallback((updates: Partial<AIVideoNodeData['config']>) => {
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
  }, [getNode, id, setNodes]);

  // 计算图片宽高比
  const calculateAspectRatio = (width: number, height: number): string => {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(width, height);
    const w = width / divisor;
    const h = height / divisor;

    // 映射到常见比例
    const ratioMap: Record<string, string> = {
      '16:9': '16:9',
      '9:16': '9:16',
      '4:3': '4:3',
      '3:4': '3:4',
      '1:1': '1:1',
      '21:9': '21:9',
    };

    const ratioStr = `${w}:${h}`;
    return ratioMap[ratioStr] || ratioStr;
  };

  // 获取连接到此节点的参考图
  const computeInputImages = () => {
    const connectedEdges = edges.filter(edge => edge.target === id);
    const images: ReferenceImage[] = [];

    connectedEdges.forEach(edge => {
      const sourceNode = getNode(edge.source);
      

      // 处理上传节点
      if (sourceNode && sourceNode.type === 'upload') {
        const uploadedFiles = sourceNode.data.config?.uploadedFiles || [];
        
        uploadedFiles.forEach((file: any) => {
          const fileType = file.type || file.mimeType || '';
          
          // 检查是否为图片类型（可能是 'IMAGE' 或 'image/...'）
          if (fileType === 'IMAGE' || fileType.startsWith('image/')) {
            
            images.push({
              id: file.id || file.name,
              url: file.url,
              name: file.name || file.originalName,
              width: file.width,
              height: file.height,
              // 如果没有宽高信息，使用默认16:9（后续可以优化为动态获取）
              aspectRatio: file.width && file.height
                ? calculateAspectRatio(file.width, file.height)
                : '16:9',
            });
          }
        });
      }

      // 处理资产选择器节点
      if (sourceNode && sourceNode.type === 'assetSelector') {
        const conf = sourceNode.data.config || {};
        const subjects = conf.subjects as Array<{ name: string; images: string[] }> | undefined;
        const selectedAsset = conf.selectedAsset;
        const g = normalizeGenType(generationType);
        if (subjects && subjects.length > 0) {
          if (g === '首尾帧') {
            // 首尾帧明确不接受角色组
          } else {
            const imgs = (subjects[0].images || []);
            
            imgs.forEach((u, idx) => {
              images.push({
                id: `${sourceNode.id}-subject-${idx}`,
                url: u,
                name: subjects[0].name,
                width: undefined,
                height: undefined,
                aspectRatio: '16:9',
              });
            });
          }
        } else if (selectedAsset && selectedAsset.type === 'IMAGE') {
          images.push({
            id: selectedAsset.id,
            url: selectedAsset.url,
            name: selectedAsset.name || selectedAsset.originalName,
            width: undefined,
            height: undefined,
            aspectRatio: '16:9',
          });
        }
      }

      // 处理图片预览节点
      if (sourceNode && sourceNode.type === 'imagePreview') {
        const imageUrl = sourceNode.data.imageUrl;
        const width = sourceNode.data.width;
        const height = sourceNode.data.height;
        if (imageUrl) {
          images.push({
            id: sourceNode.id,
            url: imageUrl,
            name: '生成的图片',
            width,
            height,
            aspectRatio: width && height
              ? calculateAspectRatio(width, height)
              : '16:9', // 默认16:9
          });
        }
      }
    });

    // 去重（按URL）
    const set = new Set<string>();
    const dedup: ReferenceImage[] = [];
    images.forEach((img) => {
      const key = img.url;
      if (!set.has(key)) {
        set.add(key);
        dedup.push(img);
      }
    });
    const g = normalizeGenType(generationType);
    if (g === '文生视频') return isSoraModel ? dedup : [];
    if (g === '首帧' || g === '尾帧') return dedup.slice(0, 1);
    if (g === '首尾帧') return dedup.slice(0, 2);
    if (g === '参考图') return dedup.slice(0, 7);
    return dedup;
  };
  const inputImages = useMemo(() => computeInputImages(), [edges, allNodes, generationType, id, isSoraModel]);

  // 页面加载时恢复进行中的任务 + 恢复缺失的预览节点
  useEffect(() => {
    const initialTaskId = data.config.taskId;

    const recoverTask = async () => {
      let taskHandledByFirstPart = false; // 标记第一部分是否已处理任务

      // 🔧 如果节点数据中标记了正在生成，通过后端查询恢复任务
      if (data.config.isGenerating || !initialTaskId) {
        try {
          const activeResponse = await apiClient.tasks.getActiveTask(id);
          if (activeResponse.task) {
            const activeTask = activeResponse.task;
            console.log(`[SoraVideoNode] 发现进行中的任务: ${activeTask.id}, 状态: ${activeTask.status}`);
            setTaskId(activeTask.id);
            setIsGenerating(true);
            setGenerationProgress(activeTask.progress || 0);
            pollTaskStatus(activeTask.id);
            return; // 已恢复任务，不需要继续
          } else if (data.config.isGenerating) {
            // 节点数据标记为生成中，但后端没有进行中的任务，说明任务已完成或失败
            console.log('[SoraVideoNode] 节点标记生成中但后端无任务，重置状态');
            setIsGenerating(false);
            updateNodeData({ isGenerating: false });
          }
        } catch (error) {
          console.warn('[SoraVideoNode] 查询进行中任务失败:', error);
        }
      }

      // 第一部分：如果有 taskId，检查任务状态
      if (initialTaskId) {
        

        // ✅ 优先检查：预览节点是否已存在
        const allNodes = getNodes();
        const allEdges = getEdges();
        const existingPreviewNode = allNodes.find(node => {
          return node.type === 'videoPreview' && allEdges.some(edge =>
            edge.source === id && edge.target === node.id
          );
        });

        if (existingPreviewNode && existingPreviewNode.data.videoUrl) {
          // 已存在预览节点，跳过创建，仅重置状态
          taskHandledByFirstPart = true;
          // 预览节点已存在，清空 taskId 避免重复查询
          if (initialTaskId) {
            updateNodeData({ taskId: '' });
            setTaskId('');
          }
          return;
        }

        try {
          const response = await apiClient.tasks.getTaskStatus(initialTaskId);
          const task = response.task;

          

          if (task.status === 'SUCCESS') {
            // 任务已完成（页面加载时发现的）
            // 注意：后端已经做了 OSS 转存，task.resultUrl 已经是 OSS 链接

            const videoUrl = task.resultUrl;
            
            // 恢复进度条显示
            setGenerationProgress(100);
            setTimeout(() => setGenerationProgress(0), 1000);

            try {
              const suppressedRaw = localStorage.getItem('suppressedPreviewTasks') || '[]';
              const suppressed: Array<{ sourceNodeId?: string; taskId?: string; messageId?: string }> = JSON.parse(suppressedRaw);
              const isSuppressed = suppressed.some(s => (s.taskId && s.taskId === initialTaskId) || (s.sourceNodeId && s.sourceNodeId === id));
              if (!isSuppressed) {
                createPreviewNode(videoUrl, data.config.ratio || '16:9');
              }
            } catch {
              createPreviewNode(videoUrl, data.config.ratio || '16:9');
            }

            taskHandledByFirstPart = true; // 标记已处理，跳过第二部分

            // ✅ 创建预览节点后清空 taskId，下次进入时检测到预览节点就不再查询
            
            updateNodeData({ taskId: '' });
            setTaskId('');

            toast.success('🎬 视频创作完成，快去欣赏吧！');
          } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
            // 任务仍在进行中，恢复轮询
            
            setIsGenerating(true); // ✅ 恢复生成中状态
            setGenerationProgress(task.progress || 0);
            pollTaskStatus(initialTaskId);
            return; // 任务还在进行中，不需要检查待恢复的预览节点
          } else if (task.status === 'FAILURE') {
            // 任务失败
            
            setGenerationProgress(0);
            updateNodeData({ taskId: '' });
            toast.error(task.errorMessage ? `视频生成遇到问题：${task.errorMessage}` : '视频生成未能完成，请稍后重试');
          }
        } catch (error: any) {
          setGenerationProgress(0);
          updateNodeData({ taskId: '' });
        }
      }

      // 第二部分：检查并恢复缺失的预览节点（只在第一部分未处理任务时执行）
      if (!taskHandledByFirstPart) {
        try {
          
          const response = await apiClient.tasks.getPendingPreviewNodes(id);

          if (response.tasks && response.tasks.length > 0) {
            for (const task of response.tasks) {
              const { previewNodeData } = task;
              if (previewNodeData && previewNodeData.url) {
                const recoveryRatio = previewNodeData.ratio || data.config.ratio || '16:9';
                let suppressed = false;
                try {
                  const suppressedRaw = localStorage.getItem('suppressedPreviewTasks') || '[]';
                  const list: Array<{ sourceNodeId?: string; taskId?: string; messageId?: string }> = JSON.parse(suppressedRaw);
                  suppressed = list.some(s => (s.taskId && s.taskId === task.id) || (s.sourceNodeId && s.sourceNodeId === id));
                } catch { }
                if (!suppressed) {
                  createPreviewNode(previewNodeData.url, recoveryRatio);
                }
                await apiClient.tasks.markPreviewNodeCreated(task.id);
              }
            }
          }
        } catch (error: any) {
        }
      } else {
        
      }
    };

    recoverTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时执行一次

  // 监听上游节点的文本内容变化，自动更新提示词
  useEffect(() => {
    const connectedEdges = edges.filter(edge => edge.target === id);
    let newPromptText = '';

    connectedEdges.forEach(edge => {
      const sourceNode = getNode(edge.source);
      if (sourceNode) {
        const sourceData = sourceNode.data as any;

        // 检查智能体节点的生成内容
        if (sourceNode.type === 'agent' && sourceData.config?.generatedText) {
          if (!newPromptText) {
            newPromptText = sourceData.config.generatedText;
          }
        }
        // 检查文本预览节点的内容
        else if (sourceNode.type === 'textPreview' && sourceData.content) {
          if (!newPromptText) {
            newPromptText = sourceData.content;
          }
        }
      }
    });

    // 更新提示词（如果有新的文本内容且与当前不同）
    if (newPromptText && newPromptText !== prompt) {
      
      setPrompt(newPromptText);
      updateNodeData({ prompt: newPromptText });
    }
  }, [edges, id, getNode, prompt, updateNodeData]);

  // 监听上游节点数据变化（智能体执行后更新提示词）
  useEffect(() => {
    const connectedEdges = edges.filter(edge => edge.target === id);
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
  }, [allNodes, edges, id, updateNodeData]);

  // 更新本地参考图状态（使用JSON.stringify比较避免无限循环）
  useEffect(() => {
    const newImagesJSON = JSON.stringify(inputImages);
    const currentImagesJSON = JSON.stringify(referenceImages);

    if (newImagesJSON !== currentImagesJSON) {
      
      setReferenceImages(inputImages);
    }
  }, [inputImages]);

  // 判断视频比例是否可选
  const isRatioSelectable = useMemo(() => {
    if (isSoraModel) return true;
    const imageCount = referenceImages.length;
    const g = normalizeGenType(generationType);
    if (imageCount === 0) return true;
    if (imageCount === 1) {
      return g === '参考图';
    }
    if (imageCount === 2) {
      if (g === '首尾帧') return false;
      return g === '参考图';
    }
    if (imageCount > 2) {
      return g === '参考图';
    }
    return false;
  }, [referenceImages.length, generationType, normalizeGenType, isSoraModel]);

  const availableGenerationTypes = useMemo(() => {
    return ['文生视频', '首帧', '尾帧', '首尾帧', '参考图'];
  }, []);

  const filteredVideoModels = useMemo(() => {
    const g = normalizeGenType(generationType);
    if (selectedEditingCapability) return videoModels;
    return videoModels.filter((m) => {
      const types = (m.config?.supportedGenerationTypes || []).map((t) => normalizeGenType(t));
      if (g === '首帧' || g === '尾帧') return types.includes('首帧') || types.includes('尾帧');
      return types.includes(g);
    });
  }, [videoModels, generationType, normalizeGenType, selectedEditingCapability]);

  const modelListForUI = useMemo(() => {
    const list = selectedEditingCapability ? videoModels : filteredVideoModels;
    if (list.length > 0) return list;
    // 回退：编辑模式下若无匹配，至少展示全部 VIDEO_EDITING 以便选择
    if (selectedEditingCapability) {
      const all = (data.models || []) as any[];
      return all.filter((m) => (m.type || '') === 'VIDEO_EDITING');
    }
    return list;
  }, [selectedEditingCapability, videoModels, filteredVideoModels, data.models]);

  useEffect(() => {
    const exists = modelListForUI.find((m) => m.id === modelId);
    if (!exists) {
      const next = modelListForUI[0]?.id || '';
      setModelId(next);
      updateNodeData({ modelId: next || undefined, modelName: next ? modelListForUI[0]?.name : undefined });
    }
  }, [modelListForUI]);

  const computeAcceptedInputs = useCallback((genType: string): string[] => {
    const g = normalizeGenType(genType);
    if (selectedEditingCapability) return ['IMAGE', 'VIDEO'];
    if (g === '文生视频') return isSoraModel ? ['TEXT', 'IMAGE'] : ['TEXT'];
    return ['TEXT', 'IMAGE'];
  }, [normalizeGenType, selectedEditingCapability, isSoraModel]);

  // 根据参考图自动设置视频比例
  useEffect(() => {
    if (!isRatioSelectable && referenceImages.length > 0) {
      const firstImageRatio = referenceImages[0].aspectRatio;
      if (firstImageRatio && ratio !== firstImageRatio) {
        setRatio(firstImageRatio);
        // 使用setTimeout避免在渲染期间更新
        setTimeout(() => {
          updateNodeData({ ratio: firstImageRatio });
        }, 0);
      }
    }
  }, [isRatioSelectable, referenceImages, ratio]);

  // 确保生成类型有效并自动更新
  useEffect(() => {
    if (selectedEditingCapability) return;
    if (availableGenerationTypes.length > 0 && !availableGenerationTypes.includes(generationType)) {
      const preferred = '文生视频';
      setGenerationType(preferred);
      setTimeout(() => {
        updateNodeData({ generationType: preferred, acceptedInputs: computeAcceptedInputs(preferred) });
      }, 0);
    }
  }, [availableGenerationTypes, generationType, computeAcceptedInputs, selectedEditingCapability]);


  useEffect(() => {
    const g = normalizeGenType(generationType);
    if (g === '文生视频') return;
    const connectedEdges = edges.filter((e) => e.target === id);
    const imageEdges: string[] = [];
    const videoEdges: string[] = [];
    connectedEdges.forEach((e) => {
      const src = getNode(e.source);
      if (!src) return;
      const t = src.type as string;
      if ((t || '').startsWith('aiVideo') || t === 'videoPreview') {
        videoEdges.push(e.id);
        return;
      }
      if (t === 'upload') {
        const file = (src.data as any)?.config?.uploadedFiles?.[0];
        const tp = (file?.type || '').toUpperCase();
        const m = (file?.mimeType || '').toLowerCase();
        if (tp === 'VIDEO' || m.startsWith('video/')) {
          videoEdges.push(e.id);
          return;
        }
        if (tp === 'IMAGE' || m.startsWith('image/')) imageEdges.push(e.id);
        return;
      }
      if (t === 'assetSelector') {
        const conf = (src.data as any)?.config || {};
        if (conf.selectedAsset) {
          const tp = (conf.selectedAsset.type || '').toUpperCase();
          const m = (conf.selectedAsset.mimeType || '').toLowerCase();
          if (tp === 'VIDEO' || m.startsWith('video/')) {
            videoEdges.push(e.id);
          } else if (tp === 'IMAGE' || m.startsWith('image/')) {
            imageEdges.push(e.id);
          }
        } else if (conf.subjects && conf.subjects.length > 0) {
          const count = (conf.subjects[0]?.images || []).length;
          if (g === '参考图') {
            imageEdges.push(e.id);
          } else if (g === '首尾帧') {
            imageEdges.push(e.id);
          } else if (g === '首帧' || g === '尾帧') {
            if (count > 1) videoEdges.push(e.id); else imageEdges.push(e.id);
          }
        }
        return;
      }
      if (t === 'aiImage' || t === 'imagePreview') imageEdges.push(e.id);
    });
    let toRemove = new Set<string>([...videoEdges]);
    if (g === '首帧' || g === '尾帧') {
      imageEdges.slice(1).forEach((id2) => toRemove.add(id2));
    } else if (g === '首尾帧') {
      imageEdges.slice(2).forEach((id2) => toRemove.add(id2));
    }
    // 参考图与文生视频：保留图片输入，视频输入已纳入默认移除
    if (toRemove.size > 0) setEdges((eds) => eds.filter((e) => !toRemove.has(e.id)));
  }, [generationType, edges, id, getNode, setEdges, normalizeGenType]);

  useEffect(() => {
    const current = data.config.generationType;
    if (!current || normalizeGenType(current) !== normalizeGenType(generationType)) {
      const synced = normalizeGenType(generationType) || '文生视频';
      updateNodeData({ generationType: synced, acceptedInputs: computeAcceptedInputs(synced) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const inputs = computeAcceptedInputs(generationType);
    updateNodeData({ acceptedInputs: inputs });
  }, [generationType, computeAcceptedInputs]);

  // 拖拽图片缩略图
  const handleImageDragStart = (index: number) => {
    setDraggedImageIndex(index);
  };

  const handleImageDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleImageDrop = (dropIndex: number) => {
    if (draggedImageIndex === null) return;

    const newImages = [...referenceImages];
    const [draggedImage] = newImages.splice(draggedImageIndex, 1);
    newImages.splice(dropIndex, 0, draggedImage);

    setReferenceImages(newImages);
    setDraggedImageIndex(null);

    // 保存到节点数据
    updateNodeData({ referenceImages: newImages });
  };

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

  // 自动保存提示词
  useEffect(() => {
    if (prompt === data.config.prompt) return;

    const timeoutId = setTimeout(() => {
      updateNodeData({ prompt });
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [prompt]);

  // 搜索角色（防抖）
  const searchCharacters = useCallback(async (query: string) => {
    if (!query) {
      setCharacterSuggestions([]);
      return;
    }
    try {
      const result = await apiClient.soraCharacters.search(query, 5);
      setCharacterSuggestions(result.characters || []);
      setSelectedSuggestionIndex(0);
    } catch (error) {
      console.error('搜索角色失败:', error);
      setCharacterSuggestions([]);
    }
  }, []);

  // 处理提示词输入变化（检测@提及）
  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setPrompt(value);

    // 中文输入法正在输入时，不要关闭角色选择器
    if (isComposingRef.current) {
      return;
    }

    // 检测@符号
    const textBeforeCursor = value.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([^@\s#]*)$/);

    if (atMatch) {
      const query = atMatch[1];
      setCharacterSearchQuery(query);
      setMentionCursorPosition(cursorPos - query.length - 1); // @符号的位置
      setShowCharacterSelector(true);
      searchCharacters(query);
    } else {
      setShowCharacterSelector(false);
      setCharacterSuggestions([]);
    }
  }, [searchCharacters]);

  // 选择角色并插入提及
  const handleSelectCharacter = useCallback((character: SoraCharacterMention) => {
    const textBeforeMention = prompt.substring(0, mentionCursorPosition);
    const textAfterCursor = prompt.substring(mentionCursorPosition + characterSearchQuery.length + 1);
    const mentionText = `@#${character.customName}#`;
    const newPrompt = textBeforeMention + mentionText + textAfterCursor;
    
    setPrompt(newPrompt);
    setShowCharacterSelector(false);
    setCharacterSuggestions([]);
    setCharacterSearchQuery('');
    
    // 聚焦并移动光标到提及之后
    setTimeout(() => {
      if (promptTextareaRef.current) {
        promptTextareaRef.current.focus();
        const newCursorPos = textBeforeMention.length + mentionText.length;
        promptTextareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  }, [prompt, mentionCursorPosition, characterSearchQuery]);

  // 处理键盘导航
  const handlePromptKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showCharacterSelector || characterSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => 
        prev < characterSuggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : prev);
    } else if (e.key === 'Enter' && characterSuggestions[selectedSuggestionIndex]) {
      e.preventDefault();
      handleSelectCharacter(characterSuggestions[selectedSuggestionIndex]);
    } else if (e.key === 'Escape') {
      setShowCharacterSelector(false);
    }
  }, [showCharacterSelector, characterSuggestions, selectedSuggestionIndex, handleSelectCharacter]);

  // 将提示词中的 @#自定义名称# 替换为实际的角色名称
  const resolveCharacterMentions = useCallback(async (text: string): Promise<string> => {
    const mentionPattern = /@#([^#]+)#/g;
    const matches = [...text.matchAll(mentionPattern)];
    
    if (matches.length === 0) return text;

    let result = text;
    for (const match of matches) {
      const customName = match[1];
      try {
        const response = await apiClient.soraCharacters.getByCustomName(customName);
        if (response.character?.characterName) {
          // 角色名称前后添加空格，确保模型能正确识别
          result = result.replace(match[0], ` ${response.character.characterName} `);
        }
      } catch (error) {
        console.warn(`未找到角色: ${customName}`);
      }
    }
    return result;
  }, []);

  // 模型切换时更新配置和acceptedInputs
  const handleModelChange = (newModelId: string) => {
    setModelId(newModelId);
    const model = filteredVideoModels.find(m => m.id === newModelId);
    if (model) {
      const modelRatios = model.config.supportedRatios?.length ? model.config.supportedRatios : ['16:9'];
      const modelResolutions = model.config.supportedResolutions?.length ? model.config.supportedResolutions : ['1080P'];
      const modelTypes = model.config.supportedGenerationTypes?.length ? model.config.supportedGenerationTypes : ['文生视频'];
      const prov = (model.provider || '').toLowerCase();
      const modelDurations = model.config.supportedDurations?.length ? model.config.supportedDurations : (prov === 'sora' ? [10, 15] : (prov === 'minimaxi' ? [6, 10] : [10]));

      const nextRatio = modelRatios[0];
      const nextResolution = modelResolutions[0];
      const nextType = normalizeGenType(generationType || modelTypes[0]);
      const nextDuration = modelDurations[0];

      setRatio(nextRatio);
      setResolution(nextResolution);
      setGenerationType(nextType);
      setDuration(nextDuration);

      updateNodeData({
        modelId: newModelId,
        modelName: model.name,
        ratio: nextRatio,
        resolution: nextResolution,
        generationType: nextType,
        duration: nextDuration,
        acceptedInputs: computeAcceptedInputs(nextType),
      });
    }
  };

  const canGenerate = useMemo(() => {
    const g = normalizeGenType(generationType);
    const imgCount = referenceImages.length;
    const connectedEdges = edges.filter((e) => e.target === id);
    const videoInputs = connectedEdges.filter((e) => {
      const src = getNode(e.source);
      const t = src?.type as string;
      if (!src) return false;
      if (t === 'upload') {
        const f = (src.data as any)?.config?.uploadedFiles?.[0];
        const m = (f?.mimeType || '').toLowerCase();
        const tp = (f?.type || '').toUpperCase();
        return tp === 'VIDEO' || m.startsWith('video/');
      }
      if (t === 'assetSelector') {
        const a = (src.data as any)?.config?.selectedAsset;
        const m = (a?.mimeType || '').toLowerCase();
        const tp = (a?.type || '').toUpperCase();
        return tp === 'VIDEO' || m.startsWith('video/');
      }
      if ((t || '').startsWith('aiVideo') || t === 'videoPreview') return true;
      return false;
    });
    const videoCount = videoInputs.length;
    if (!modelId) return false;
    if (g === '文生视频') {
      if (isSoraModel) return true; // Sora模型支持文生视频（带或不带图片）
      return !!prompt.trim();
    }
    if (g === '首帧' || g === '尾帧') return imgCount >= 1;
    if (g === '首尾帧') return imgCount >= 2;
    if (g === '参考图') return imgCount >= 1;
    if (g === '视频换人') return videoCount >= 1 && imgCount >= 1;
    if (g === '对口型') return videoCount >= 1; // 需音频，此处简化
    if (g === '风格转换') return videoCount >= 1;
    return false;
  }, [generationType, referenceImages.length, prompt, isGenerating, edges, id, getNode, normalizeGenType, isSoraModel]);

  useEffect(() => {
    const url = data?.config?.generatedVideoUrl;
    if (url) {
      createPreviewNode(url, data.config.ratio || '16:9');
    }
  }, [data?.config?.generatedVideoUrl]);

  // 轮询任务状态
  const pollTaskStatus = async (taskId: string) => {
    const maxAttempts = 600; // 最多10分钟 (600 * 1秒)
    let attempts = 0;

    const poll = async () => {
      try {
        attempts++;
        

        const response = await apiClient.tasks.getTaskStatus(taskId);
        const task = response.task;

        

        // 更新进度
        setGenerationProgress(task.progress || 0);

        if (task.status === 'SUCCESS' || task.status === 'COMPLETED' || task.status === 'DONE') {
          // 生成成功（轮询发现的）
          // 注意：后端已经做了 OSS 转存，task.resultUrl 已经是 OSS 链接
          
          setGenerationProgress(100);

          const videoUrl = task.resultUrl;
          
          setIsGenerating(false); // ✅ 停止生成状态

          // 创建预览节点（后端返回的已经是 OSS 链接）
          createPreviewNode(videoUrl, data.config.ratio || '16:9');

          // ✅ 标记预览节点已创建，避免页面刷新后重复创建
          try {
            await apiClient.tasks.markPreviewNodeCreated(taskId);
          } catch (e) {
            console.warn('标记预览节点失败:', e);
          }

          // ✅ 修复：任务完成后清空 taskId 和 isGenerating
          updateNodeData({
            prompt: data.config.prompt,
            ratio: data.config.ratio,
            modelId: data.config.modelId,
            generatedVideoUrl: videoUrl,
            taskId: '', // ✅ 清空 taskId
            isGenerating: false, // ✅ 清空生成状态
          });
          setTaskId('');

          toast.success('🎬 视频创作完成，快去欣赏吧！');

          setTimeout(() => setGenerationProgress(0), 1000);
          return;
        } else if (task.status === 'FAILURE') {
          // 生成失败
          console.error('❌ [AIVideoNode] 生成失败:', task.errorMessage);
          setIsGenerating(false); // ✅ 停止生成状态
          setGenerationProgress(0);
          updateNodeData({ taskId: '', isGenerating: false });
          toast.error(task.errorMessage || '视频生成遇到问题，积分已退还，请重试');
          return;
        } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
          // 继续轮询
          if (attempts < maxAttempts) {
            setTimeout(poll, 1000); // 1秒后继续轮询
          } else {
            // 超时
            console.warn('⏱️ [AIVideoNode] 轮询超时');
            setIsGenerating(false); // ✅ 停止生成状态
            setGenerationProgress(0);
            updateNodeData({ taskId: '', isGenerating: false });
            toast.error('视频仍在生成中，请刷新页面查看结果');
          }
        }
      } catch (error: any) {
        console.error('❌ [AIVideoNode] 轮询任务失败:', error);
        setIsGenerating(false); // ✅ 停止生成状态
        setGenerationProgress(0);
        updateNodeData({ taskId: '', isGenerating: false });
        toast.error('网络波动，请刷新页面查看生成结果');
      }
    };

    poll();
  };

  // 生成视频（异步任务）
  const executeGenerate = async () => {
    const g = normalizeGenType(generationType);
    if (g === '文生视频' && !prompt.trim()) {
      toast.error('请先输入视频描述，告诉 AI 您想要什么样的画面~');
      return;
    }
    setIsGenerating(true);
    const latestInputs = computeInputImages();
    updateNodeData({ referenceImages: latestInputs });
    setGenerationProgress(0);
    try {
      let processedReferenceImages: string[] = [];
      let subjectsPayload: Array<{ name: string; images: string[] }> | undefined;
      const imageCount = latestInputs.length;
      if (latestInputs.length > 0) {
        try {
          for (const img of latestInputs) {
            let fullUrl = img.url;
            if (!fullUrl.startsWith('data:') && !fullUrl.startsWith('http')) {
              fullUrl = `${API_URL}${fullUrl}`;
            }
            fullUrl = fullUrl.replace(/^https?:\/\/localhost(?::\d+)?/i, API_URL);
            const processedUrl = await processImageUrl(fullUrl);
            processedReferenceImages.push(processedUrl);
          }
        } catch (error) {
          console.error('Failed to process reference images:', error);
          toast.error('参考图加载失败，请检查图片是否有效');
        }
      }
      const connectedEdgesSubjects = edges.filter(e => e.target === id);
      if (normalizeGenType(generationType) === '参考图') {
        const roleMap = new Map<string, string[]>();
        for (const edge of connectedEdgesSubjects) {
          const srcNode = getNode(edge.source);
          if (srcNode?.type === 'assetSelector') {
            const subs = srcNode.data.config?.subjects as Array<{ name: string; images: string[] }> | undefined;
            if (subs && subs.length > 0) {
              for (const s of subs) {
                if (!roleMap.has(s.name)) {
                  const imgs = (s.images || []).map((u) => (u.startsWith('http') || u.startsWith('data:')) ? u : `${API_URL}${u}`);
                  roleMap.set(s.name, imgs);
                }
              }
            }
          }
        }
        if (roleMap.size > 0) {
          const rolesInOrder = Array.from(roleMap.entries());
          // 计算总图片并按上限7裁剪（跨角色）
          let total = 0;
          const trimmedRoles: Array<{ name: string; images: string[] }> = [];
          for (const [name, imgs] of rolesInOrder) {
            if (total >= 7) break;
            const remain = 7 - total;
            const useImgs = imgs.slice(0, Math.max(0, remain));
            if (useImgs.length > 0) {
              trimmedRoles.push({ name, images: useImgs });
              total += useImgs.length;
            }
          }
          subjectsPayload = trimmedRoles;
          if (rolesInOrder.some(([, imgs]) => imgs.length > 0) && total < rolesInOrder.reduce((acc, [, imgs]) => acc + imgs.length, 0)) {
            toast.info('参考图较多，已自动选取前 7 张');
          }
        }
      }
      const effectiveImageCount = subjectsPayload && subjectsPayload.length > 0
        ? subjectsPayload.reduce((acc, r) => acc + (r.images?.length || 0), 0)
        : imageCount;
      let payloadGenerationType = generationType;
      if (payloadGenerationType === '首帧' || payloadGenerationType === '尾帧') {
        if (effectiveImageCount !== 1) {
          toast.error('此模式需要连接 1 张图片作为参考');
          setIsGenerating(false);
          setGenerationProgress(0);
          return;
        }
      } else if (payloadGenerationType === '首尾帧') {
        if (effectiveImageCount === 1) {
          payloadGenerationType = '首帧';
        } else if (effectiveImageCount !== 2) {
          toast.error('首尾帧模式需要连接 2 张图片（起始帧和结束帧）');
          setIsGenerating(false);
          setGenerationProgress(0);
          return;
        }
        if (subjectsPayload && subjectsPayload.length > 0) {
          subjectsPayload = [{ ...subjectsPayload[0], images: subjectsPayload[0].images.slice(0, 2) }];
        } else {
          processedReferenceImages = processedReferenceImages.slice(0, 2);
        }
      } else if (payloadGenerationType === '参考图' || payloadGenerationType === '主体参考') {
        if (effectiveImageCount < 1) {
          toast.error('参考模式需要至少连接 1 张图片');
          setIsGenerating(false);
          setGenerationProgress(0);
          return;
        }
        if (subjectsPayload && subjectsPayload.length > 0) {
          const total = subjectsPayload.reduce((acc, r) => acc + (r.images?.length || 0), 0);
          if (total > 7) {
            // 按已有顺序裁剪至7张（跨角色）
            let remain = 7;
            subjectsPayload = subjectsPayload.map((r) => ({ ...r, images: r.images.slice(0, Math.max(0, remain -= r.images.length, r.images.length)) }));
            // 重新计算裁剪后的 images（修正上面的 slice 逻辑）
            remain = 7;
            subjectsPayload = subjectsPayload.map((r) => {
              const use = r.images.slice(0, Math.min(r.images.length, remain));
              remain -= use.length;
              return { ...r, images: use };
            }).filter((r) => r.images.length > 0);
            toast.info('参考图较多，已自动选取前 7 张');
          }
        } else {
          if (processedReferenceImages.length > 7) {
            processedReferenceImages = processedReferenceImages.slice(0, 7);
            toast.info('参考图较多，已自动选取前 7 张');
          }
        }
      }
      if (confirmBehavior === 'dropImages') {
        processedReferenceImages = [];
        subjectsPayload = undefined;
      }
      if ((normalizeGenType(generationType) === '首帧' || normalizeGenType(generationType) === '尾帧') && confirmBehavior === 'useFirstImage' && processedReferenceImages.length >= 2) {
        processedReferenceImages = [processedReferenceImages[0]];
      }
      if (normalizeGenType(generationType) === '首尾帧' && confirmBehavior === 'useFirstTwoImages' && processedReferenceImages.length >= 3) {
        processedReferenceImages = processedReferenceImages.slice(0, 2);
      }
      const taskPayload: any = {
        modelId,
        ratio,
        duration,
        referenceImages: processedReferenceImages.length > 0 && !subjectsPayload ? processedReferenceImages : undefined,
        generationType: payloadGenerationType,
        sourceNodeId: id,
        ...(subjectsPayload ? { subjects: subjectsPayload } : {}),
      };
      const genNorm = normalizeGenType(payloadGenerationType);
      
      // 解析提示词中的角色提及（@#自定义名称# -> 实际角色名）
      let resolvedPrompt = prompt.trim();
      if (resolvedPrompt && resolvedPrompt.includes('@#')) {
        resolvedPrompt = await resolveCharacterMentions(resolvedPrompt);
      }
      
      // 如果BGM关闭，在提示词最前方添加"No BGM. "
      if (!enableBGM && resolvedPrompt) {
        resolvedPrompt = 'No BGM. ' + resolvedPrompt;
      }
      
      if (genNorm === '文生视频') {
        if (!resolvedPrompt) {
          toast.error('请先输入视频描述~');
          setIsGenerating(false);
          setGenerationProgress(0);
          return;
        }
        taskPayload.prompt = resolvedPrompt;
      } else if (genNorm === '参考图') {
        if (!resolvedPrompt) {
          toast.error('请描述您希望参考图呈现的效果~');
          setIsGenerating(false);
          setGenerationProgress(0);
          return;
        }
        taskPayload.prompt = resolvedPrompt;
      } else if (resolvedPrompt) {
        taskPayload.prompt = resolvedPrompt;
      }
      const response = await apiClient.tasks.createVideoTask(taskPayload);
      const newTaskId = response.taskId;
      const creditsCharged = response.creditsCharged || 0;
      const respIsFreeUsage = response.isFreeUsage;
      const respFreeUsageRemaining = response.freeUsageRemaining ?? 0;
      
      setTaskId(newTaskId);
      updateNodeData({
        prompt,
        ratio,
        resolution,
        generationType,
        duration,
        modelId,
        taskId: newTaskId,
        isGenerating: true, // 保存生成状态，刷新页面后可恢复
      });
      
      // 显示积分/免费信息（视频生成需要较长时间，给用户友好提示）
      if (respIsFreeUsage) {
        toast.success(`🎁 免费创作中，今日还剩 ${respFreeUsageRemaining} 次。视频生成需要一些时间，您可以先处理其他内容~`);
        refetchEstimate();
      } else if (creditsCharged > 0) {
        const { useAuthStore } = await import('../../../store/authStore');
        const { refreshUser } = useAuthStore.getState();
        await refreshUser();
        toast.success(`🎬 创作已启动，消耗 ${creditsCharged} 积分。AI 正在精心制作您的视频，请耐心等待~`);
        refetchEstimate();
      } else {
        toast.success('🎬 视频创作已启动，AI 正在努力工作中，您可以继续编辑其他节点~');
      }
      pollTaskStatus(newTaskId);
    } catch (error: any) {
      console.error('❌ [AIVideoNode] 提交任务失败:', error);
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

  const handleGenerate = async () => {
    const g = normalizeGenType(generationType);
    const latestInputs = computeInputImages();
    const imgCount = latestInputs.length;
    const hasSubjects = (() => {
      const connectedEdgesSubjects = edges.filter(e => e.target === id);
      for (const edge of connectedEdgesSubjects) {
        const srcNode = getNode(edge.source);
        if (srcNode?.type === 'assetSelector') {
          const subs = srcNode.data.config?.subjects as Array<{ name: string; images: string[] }> | undefined;
          if (subs && subs.length > 0) return true;
        }
      }
      return false;
    })();

    // 规则 8：传入角色且模式为首帧/尾帧/首尾帧，禁止执行
    if (hasSubjects && (g === '首帧' || g === '尾帧' || g === '首尾帧')) {
      toast.error('当前模式不支持角色图片，请切换到"参考图"模式');
      return;
    }

    // 规则 7：模式需要图片但未传入
    if ((g === '首帧' || g === '尾帧') && imgCount === 0) {
      toast.error('请先连接 1 张图片作为起始画面');
      return;
    }
    if (g === '首尾帧' && imgCount === 0) {
      toast.error('请连接 2 张图片（起始帧 + 结束帧）');
      return;
    }
    if (g === '参考图' && imgCount === 0) {
      toast.error('请先连接参考图片');
      return;
    }

    // 规则 1：有图片但模式是文生视频→提示确认（删除图片继续）
    // Sora模型除外：Sora模型支持在文生视频模式下传入图片（作为图生视频）
    if (g === '文生视频' && imgCount > 0 && !isSoraModel) {
      const proceed = window.confirm('当前是"文生视频"模式，连接的图片将被忽略。如需使用图片，请切换到其他模式。是否继续？');
      if (!proceed) {
        toast.info('您可以在面板中切换生成模式');
        return;
      }
    }

    // 规则 2：1张图片且模式为首帧/尾帧/参考图→直接执行
    // 规则 3：≥2张图片且模式为首帧/尾帧→提示确认（仅用第1张）
    if ((g === '首帧' || g === '尾帧') && imgCount >= 2) {
      const proceed = window.confirm('当前模式仅支持 1 张图片，将使用第 1 张作为起始画面。是否继续？');
      if (!proceed) {
        toast.info('您可以在面板中切换生成模式');
        return;
      }
    }

    // 规则 4：2张图片且模式为首尾帧或参考图→直接执行
    // 规则 5：≥3张图片且模式为首尾帧→提示确认（仅用前2张）
    if (g === '首尾帧' && imgCount >= 3) {
      const proceed = window.confirm('首尾帧模式仅支持 2 张图片，将使用前 2 张作为起始和结束画面。是否继续？');
      if (!proceed) {
        toast.info('您可以在面板中切换生成模式');
        return;
      }
    }

    // 文本提示词在参考图/首帧/尾帧/首尾帧可选；仅文生视频强制需要
    if (g === '文生视频' && !prompt.trim()) {
      toast.error('请先输入视频描述~');
      return;
    }

    if (!modelId) {
      toast.error('请先选择一个视频模型');
      return;
    }

    setReferenceImages(latestInputs);
    updateNodeData({ referenceImages: latestInputs });
    setIsGenerating(true);
    setGenerationProgress(0);

    await executeGenerate();
  };

  // 创建视频预览节点，返回创建的节点 ID（用于后续更新）
  const createPreviewNode = (videoUrl: string, videoRatio: string): string | null => {
    const currentNode = getNode(id);
    if (!currentNode) return null;
    if (!videoUrl) return null;

    // 确保 ratio 有效
    const finalRatio = videoRatio || ratio || '16:9';

    // 找到所有从当前节点输出的预览节点
    const allNodes = getNodes();
    const allEdges = getEdges();
    const connectedPreviewNodes = allNodes.filter(node => {
      return node.type === 'videoPreview' && allEdges.some(edge =>
        edge.source === id && edge.target === node.id
      );
    });

    // ✅ 去重检查：如果已经存在相同 URL 的预览节点，不要重复创建
    const existingNode = connectedPreviewNodes.find(node => node.data.videoUrl === videoUrl);
    if (existingNode) {
      return existingNode.id; // 返回已存在的节点 ID
    }

    const zoom = 1;
    const previewWidth = 400;

    

    const parseRatio = (r?: string, defH = 300) => {
      if (!r || !/^[0-9]+\s*:\s*[0-9]+$/.test(r)) return defH;
      const [rw, rh] = r.split(':').map((v) => parseFloat(v));
      if (!rw || !rh) return defH;
      return Math.round(previewWidth * (rh / rw));
    };
    const parentEl = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement | null;
    const parentRect = parentEl?.getBoundingClientRect();
    const parentWpx = Math.round((parentRect?.width || 400) / zoom);
    const spacingY = 100;
    const spacingX = 200;
    const targetH = parseRatio(finalRatio, 300);
    const existingCount = connectedPreviewNodes.length;
    const baseX = currentNode.position.x + parentWpx + spacingX;
    const baseY = currentNode.position.y;
    const posX = baseX;
    const posY = baseY + existingCount * (targetH + spacingY);

    // 使用时间戳创建唯一 ID
    const timestamp = Date.now();
    const previewNode = {
      id: `preview-${id}-${timestamp}`,
      type: 'videoPreview',
      position: {
        x: posX,
        y: posY,
      },
      data: {
        videoUrl,
        width: previewWidth,
        ratio: finalRatio,
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
      const existingEdge = eds.find((e) => e.source === id && e.target === previewNode.id);
      if (existingEdge) return eds;
      return [...eds, newEdge];
    });
    
    return previewNode.id; // 返回新创建的节点 ID
  };

  // 双击切换展开/收缩
  const handleDoubleClick = (e: React.MouseEvent) => {
    // 防止在可交互元素上触发
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('select')
    ) {
      return;
    }
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, isExpanded: newExpanded } } : node
      )
    );
  };

  return (
    <div
      onDoubleClick={handleDoubleClick}
      className={`relative bg-white/80 dark:bg-black/60 backdrop-blur-xl border rounded-2xl shadow-xl transition-all ring-1 ${selected ? 'border-purple-400 shadow-purple-400/50' : 'border-white/60 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'}`}
      style={{ width: 320 }}
    >
      {/* 创建者头像徽章 */}
      <NodeCreatorBadge createdBy={(data as any).createdBy} isSharedWorkflow={(data as any)._isSharedWorkflow} />
      
      {/* 输入连接点 */}
      <CustomHandle
        type="target"
        position={Position.Left}
        id={`${id}-target`}
        className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
        isConnectable={(() => {
          const nodeType = getNode(id)?.type || '';
          const gen = normalizeGenType(generationType);
          const isT2V = gen === '文生视频' || nodeType === 'aiVideo_t2v';
          const isFirstOrLast = (nodeType === 'aiVideo_i2v_first' || nodeType === 'aiVideo_i2v_last' || gen === '首帧' || gen === '尾帧');
          const isFirstLast = (nodeType === 'aiVideo_first_last' || gen === '首尾帧');
          const isReference = (nodeType === 'aiVideo_reference' || gen === '参考图');
          const connectedEdges = edges.filter(e => e.target === id);
          const hasAgent = connectedEdges.some((e) => {
            const src = getNode(e.source);
            return src?.type === 'agent';
          });
          const imageCount = connectedEdges.reduce((acc, e) => {
            const src = getNode(e.source);
            const st = (src?.type || '') as string;
            if (st === 'aiImage' || st === 'imagePreview') return acc + 1;
            if (st === 'upload') {
              const file = (src as any)?.data?.config?.uploadedFiles?.[0];
              const tp = (file?.type || '').toUpperCase();
              const m = (file?.mimeType || '').toLowerCase();
              return acc + ((tp === 'IMAGE' || m.startsWith('image/')) ? 1 : 0);
            }
            if (st === 'assetSelector') {
              const conf = (src as any)?.data?.config || {};
              if (conf.selectedAsset) return acc + (((conf.selectedAsset.type || '').toUpperCase() === 'IMAGE' || (conf.selectedAsset.mimeType || '').toLowerCase().startsWith('image/')) ? 1 : 0);
              if (conf.subjects && conf.subjects.length > 0) return acc + ((conf.subjects[0].images || []).length || 0);
            }
            return acc;
          }, 0);
          if (isT2V) return isSoraModel || !hasAgent;
          if (isFirstOrLast) return !(hasAgent && imageCount >= 1);
          if (isFirstLast) {
            // 首尾帧：允许在仅有智能体或仅有1张图片时继续连接；仅当智能体+两张图片齐备时禁用
            return !(hasAgent && imageCount >= 2);
          }
          if (isReference) {
            // 参考图：上限 1 智能体 + 7 图片；仅当智能体+图片达到上限时禁用
            return !(hasAgent && imageCount >= 7);
          }
          return true;
        })()}
      />

      {/* 节点头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b rounded-t-2xl border-slate-200 dark:border-white/10 bg-gradient-to-r from-pink-500/20 dark:from-pink-500/20 from-pink-200/50 via-purple-500/20 dark:via-purple-500/20 via-purple-200/50 to-cyan-500/20 dark:to-cyan-500/20 to-cyan-200/50">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 0, "wght" 200, "GRAD" 0, "opsz" 20' }}>movie</span>
          <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-white">{data.label}</span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse shadow-[0_0_5px_currentColor]"></div>
      </div>
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center">
          <div className="bg-card-dark border border-border-dark rounded-xl p-6 w-96 shadow-2xl">
            <div className="text-lg font-bold text-text-dark-primary mb-4">提示</div>
            <div className="text-text-dark-primary mb-6 text-sm">{confirmText}</div>
            {confirmType === 'alert' ? (
              <div className="flex justify-end">
                <button onClick={() => { setConfirmOpen(false); }} className="px-4 py-2 bg-tiffany-500 hover:bg-tiffany-600 text-white rounded-lg">好的</button>
              </div>
            ) : (
              <div className="flex gap-3 justify-end">
                <button onClick={() => { setConfirmOpen(false); toast.info('您可以在面板中切换生成模式'); }} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg">选择模式</button>
                <button onClick={async () => { setConfirmOpen(false); await executeGenerate(); }} className="px-4 py-2 bg-tiffany-500 hover:bg-tiffany-600 text-white rounded-lg">确认执行</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 节点内容 */}
      <div className="p-4">
        {isExpanded ? (
          <div className="space-y-3">
            {/* 生成方法区域已废弃，不再显示 */}

            {/* 视频生成模型选择（Sora模型隐藏，通过下方比例按钮切换） */}
            {!isSoraModel && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">视频生成模型</label>
                <CustomSelect
                  value={modelId}
                  onChange={(value) => handleModelChange(value)}
                  options={filteredVideoModels.length === 0 ? [{value: '', label: '暂无可用模型'}] : filteredVideoModels.map((model) => ({
                    value: model.id,
                    label: model.name
                  }))}
                />
              </div>
            )}

            {/* 提示词 */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">
                提示词 <span className="text-purple-400 font-normal">（输入@调用角色）</span>
              </label>
              <div className="relative">
                <textarea
                  ref={promptTextareaRef}
                  value={prompt}
                  onChange={handlePromptChange}
                  onKeyDown={handlePromptKeyDown}
                  onCompositionStart={() => { isComposingRef.current = true; }}
                  onCompositionEnd={(e) => {
                    isComposingRef.current = false;
                    // 输入法结束后重新触发一次检测
                    handlePromptChange(e as any);
                  }}
                  placeholder="描述你想要生成的视频场景...输入@调用角色"
                  className="nodrag w-full p-2 text-xs rounded-md border outline-none resize-none overflow-hidden transition-colors font-mono leading-relaxed bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 focus:bg-white dark:focus:bg-white/10 border-slate-200 dark:border-white/10 focus:border-purple-400 dark:focus:border-purple-400/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30"
                  style={{ minHeight: '60px' }}
                />
                {/* 角色选择器弹窗 */}
                {showCharacterSelector && characterSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-[#1a1a2e] border border-slate-200 dark:border-white/10 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {characterSuggestions.map((char, index) => (
                      <button
                        key={char.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleSelectCharacter(char);
                        }}
                        className={`nodrag w-full px-3 py-2 flex items-center gap-2 text-left transition-colors ${
                          index === selectedSuggestionIndex
                            ? 'bg-purple-100 dark:bg-purple-900/30'
                            : 'hover:bg-slate-100 dark:hover:bg-white/5'
                        }`}
                      >
                        {char.avatarUrl ? (
                          <img src={char.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover object-top" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-purple-200 dark:bg-purple-800 flex items-center justify-center">
                            <span className="material-symbols-outlined text-xs text-purple-600 dark:text-purple-300">face</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-700 dark:text-white truncate">
                            {char.customName}
                          </div>
                          <div className="text-[10px] text-purple-500 dark:text-purple-400 font-mono truncate">
                            {char.characterName}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 参考图缩略图（≥1张时显示） */}
            {referenceImages.length >= 1 && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">
                  参考图 {generationType === '首尾帧' && '(拖动调整)'}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {referenceImages.map((img, index) => (
                    <div
                      key={img.id}
                      draggable={generationType === '首尾帧'}
                      onDragStart={() => handleImageDragStart(index)}
                      onDragOver={handleImageDragOver}
                      onDrop={() => handleImageDrop(index)}
                      className={`nodrag relative w-16 h-16 rounded-md border-2 overflow-hidden transition-all ${generationType === '首尾帧' ? 'cursor-move' : ''} ${draggedImageIndex === index ? 'opacity-50' : ''} border-slate-200 dark:border-white/10 hover:border-purple-400 dark:hover:border-purple-400/50`}
                    >
                      <img
                        src={`${img.url.startsWith('http') || img.url.startsWith('data:') ? img.url : API_URL + img.url}`}
                        alt={img.name}
                        className="w-full h-full object-cover"
                      />
                      {generationType === '首尾帧' && (
                        <div className="absolute top-0 left-0 bg-purple-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-br">
                          {index === 0 ? '首' : index === 1 ? '尾' : index + 1}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 视频时长（滑块条） */}
            {selectedModel && !isSoraModel && (
              <div className="space-y-1">
                <label className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider">
                  <span className="text-slate-400 dark:text-white/50">视频时长{durationDisabled ? '(未配置)' : ''}</span>
                  <span className="text-slate-600 dark:text-white">{duration}秒</span>
                </label>
                <div className="relative py-1.5">
                  <input
                    type="range"
                    min={durationMin}
                    max={durationMax}
                    step="1"
                    value={duration}
                    onChange={(e) => {
                      const newDuration = parseInt(e.target.value, 10);
                      setDuration(newDuration);
                      updateNodeData({ duration: newDuration });
                    }}
                    disabled={durationDisabled}
                    className="nodrag w-full appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-purple-500 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:shadow-md [&::-webkit-slider-runnable-track]:w-full [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:w-full [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent"
                    style={{
                      backgroundImage: `linear-gradient(to right, #a855f7 ${durationProgress}%, #3b0764 ${durationProgress}%)`,
                      backgroundSize: '100% 4px',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                    }}
                  />
                </div>
              </div>
            )}

            {/* 比例选择：Sora模型显示横竖屏按钮，其他模型显示下拉框 */}
            {selectedModel && (isRatioSelectable && (isSoraModel || (selectedModel?.config.supportedRatios?.length || 0) > 0)) && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">
                  画面比例
                </label>
                {isSoraModel ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        const orientation = 'landscape';
                        const dur = duration === 15 ? 15 : 10;
                        const targetModelId = `sora-video-${orientation}-${dur}s`;
                        const targetModel = videoModels.find(m => (m as any).modelId?.toLowerCase() === targetModelId) || videoModels[0];
                        const nextId = targetModel?.id || '';
                        setModelId(nextId);
                        setRatio('16:9');
                        updateNodeData({
                          modelId: nextId,
                          ratio: '16:9',
                          modelName: targetModel?.name || `Sora Video (Landscape ${dur}s)`
                        });
                      }}
                      className={`nodrag py-2 rounded-lg text-[10px] font-bold transition-all border ${ratio === '16:9'
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white shadow-md border-transparent'
                        : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-white border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10'
                        }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-sm">crop_landscape</span>
                        <span>横屏</span>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        const orientation = 'portrait';
                        const dur = duration === 15 ? 15 : 10;
                        const targetModelId = `sora-video-${orientation}-${dur}s`;
                        const targetModel = videoModels.find(m => (m as any).modelId?.toLowerCase() === targetModelId) || videoModels[0];
                        const nextId = targetModel?.id || '';
                        setModelId(nextId);
                        setRatio('9:16');
                        updateNodeData({
                          modelId: nextId,
                          ratio: '9:16',
                          modelName: targetModel?.name || `Sora Video (Portrait ${dur}s)`
                        });
                      }}
                      className={`nodrag py-2 rounded-lg text-[10px] font-bold transition-all border ${ratio === '9:16'
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white shadow-md border-transparent'
                        : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-white border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10'
                        }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-sm">crop_portrait</span>
                        <span>竖屏</span>
                      </div>
                    </button>
                  </div>
                ) : (
                  <CustomSelect
                    value={ratio}
                    onChange={(value) => {
                      setRatio(value);
                      updateNodeData({ ratio: value });
                    }}
                    options={
                    (selectedModel?.config.supportedRatios || []).map((r) => {
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
                      return { value: r, label: labels[r] || `${w}:${h}` };
                    })}
                  />
                )}
              </div>
            )}

            {/* Sora模型时长选择 */}
            {selectedModel && isSoraModel && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">
                  视频时长
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      const orientation = ratio === '9:16' ? 'portrait' : 'landscape';
                      const targetModelId = `sora-video-${orientation}-10s`;
                      const targetModel = videoModels.find(m => (m as any).modelId?.toLowerCase() === targetModelId) || videoModels[0];
                      const nextId = targetModel?.id || '';
                      setDuration(10);
                      setModelId(nextId);
                      updateNodeData({
                        duration: 10,
                        modelId: nextId,
                        modelName: targetModel?.name || `Sora Video (${orientation === 'landscape' ? 'Landscape' : 'Portrait'} 10s)`
                      });
                    }}
                    className={`nodrag py-2 rounded-lg text-[10px] font-bold transition-all border ${duration === 10
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white shadow-md border-transparent'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-white border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10'
                      }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-sm">timer</span>
                      <span>10秒</span>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      const orientation = ratio === '9:16' ? 'portrait' : 'landscape';
                      const targetModelId = `sora-video-${orientation}-15s`;
                      const targetModel = videoModels.find(m => (m as any).modelId?.toLowerCase() === targetModelId) || videoModels[0];
                      const nextId = targetModel?.id || '';
                      setDuration(15);
                      setModelId(nextId);
                      updateNodeData({
                        duration: 15,
                        modelId: nextId,
                        modelName: targetModel?.name || `Sora Video (${orientation === 'landscape' ? 'Landscape' : 'Portrait'} 15s)`
                      });
                    }}
                    className={`nodrag py-2 rounded-lg text-[10px] font-bold transition-all border ${duration === 15
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white shadow-md border-transparent'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-white border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10'
                      }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-sm">timer</span>
                      <span>15秒</span>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* BGM开关 - Sora模型专用 */}
            {selectedModel && isSoraModel && (
              <div className="flex items-center justify-between py-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">
                  背景音乐
                </label>
                <button
                  onClick={() => setEnableBGM(!enableBGM)}
                  className={`nodrag relative w-10 h-5 rounded-full transition-all ${enableBGM ? 'bg-gradient-to-r from-purple-500 to-pink-500' : 'bg-slate-300 dark:bg-white/20'}`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-all ${enableBGM ? 'left-5' : 'left-0.5'}`}
                  />
                </button>
              </div>
            )}

            {/* 分辨率 */}
            {selectedModel && !isSoraModel && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">
                  分辨率{resolutionDisabled ? '(未配置)' : ''}
                </label>
                <CustomSelect
                  value={resolution}
                  onChange={(value) => {
                    setResolution(value);
                    updateNodeData({ resolution: value });
                  }}
                  options={resolutionOptions.map((res) => ({ value: res, label: res }))}
                  className={resolutionDisabled ? 'opacity-50 pointer-events-none' : ''}
                />
              </div>
            )}

            {/* 生成按钮 */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !canGenerate || (data as any)._canEdit === false}
              className={`nodrag w-full mt-2 py-2 text-[10px] font-bold rounded-lg border transition-all active:scale-95 flex items-center justify-center gap-2 ${isGenerating || !canGenerate ? 'bg-gray-600 dark:bg-gray-700 text-white opacity-50 cursor-not-allowed' : 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white shadow-md hover:shadow-lg border-transparent dark:border-white/10'}`}
            >
              {isGenerating ? (
                <>
                  <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  <span>生成中...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">auto_awesome</span>
                  <span>生成视频</span>
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
          </div >
        ) : (
          <div className="py-2 px-2">
            {prompt ? (
              <div className="space-y-1">
                <p className="text-xs text-purple-400 font-medium">提示词：</p>
                <p className="text-xs text-purple-300 line-clamp-6 whitespace-pre-wrap break-words">
                  {prompt}
                </p>
              </div>
            ) : (
              <p className="text-xs text-purple-400 text-center italic">
                双击展开配置
              </p>
            )}
          </div>
        )}
      </div >

      {/* 输出连接点 */}
      <CustomHandle
        type="source"
        position={Position.Right}
        id={`${id}-source`}
        className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
      />
    </div >
  );
};

export default memo(SoraVideoNode);
