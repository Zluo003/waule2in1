import { memo, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import { Position, NodeProps, useReactFlow, useEdges, useNodes } from 'reactflow';
import { toast } from 'sonner';
import { apiClient } from '../../../lib/api';
import { processImageUrl } from '../../../utils/imageUtils';
import { processTaskResult } from '../../../utils/taskResultHandler';
import CustomHandle from '../CustomHandle';
import CustomSelect from './CustomSelect';
import { useBillingEstimate } from '../../../hooks/useBillingEstimate';
import NodeCreatorBadge from '../NodeCreatorBadge';

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
    supportsAudioOutput?: boolean;
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
    audio?: boolean;
    movementAmplitude?: 'auto' | 'small' | 'medium' | 'large';
    referenceImages?: ReferenceImage[];
    acceptedInputs?: string[];
    taskId?: string;
    generatedVideoUrl?: string;
  };
  _canEdit?: boolean;
  _isGrouped?: boolean;
}

const AIVideoNode = ({ data, selected, id }: NodeProps<AIVideoNodeData>) => {
  // AI视频节点强制默认展开（忽略保存的状态）
  const [isExpanded, setIsExpanded] = useState(true);
  const [, setGenerationProgress] = useState(0);
  const [taskId, setTaskId] = useState(data.config.taskId || '');
  
  // 选中的模型ID和时长/分辨率
  const selectedModelId = data.config.modelId;
  const videoDuration = data.config.duration || 5;
  const videoResolution = data.config.resolution || '720p';
  
  // 积分估算
  const { credits, loading: creditsLoading, isFreeUsage, freeUsageRemaining, refetch: refetchEstimate } = useBillingEstimate({
    aiModelId: selectedModelId,
    duration: videoDuration,
    resolution: videoResolution,
  });

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

  // 筛选可用模型：
  // - 若选择了编辑能力：优先 VIDEO_EDITING 中支持该能力的模型；兼容“视频换人”从 VIDEO_GENERATION 中支持编辑的模型
  // - 否则：默认取 VIDEO_GENERATION
  const videoModels = useMemo(() => {
    const all = (data.models || []).filter(m => m.provider?.toLowerCase() !== 'sora' && m.id !== 'sora-video');
    if (selectedEditingCapability) {
      const editing = all.filter((m) => m.type === 'VIDEO_EDITING')
        .filter((m) => Array.isArray(m?.config?.supportedEditingCapabilities) && m.config.supportedEditingCapabilities!.includes(selectedEditingCapability));

      const genCompat = all.filter((m) => m.type === 'VIDEO_GENERATION')
        .filter((m) => {
          if (selectedEditingCapability !== '视频换人') return false;
          const okFlag = m?.config?.supportsVideoEditing === true;
          const arr: string[] = Array.isArray(m?.config?.supportedGenerationTypes) ? m.config.supportedGenerationTypes! : [];
          const hasType = arr.some((t) => (t || '').toLowerCase().includes('换人') || (t || '').includes('视频换人'));
          return okFlag || hasType;
        });

      const map: Record<string, AIModel> = {};
      [...editing, ...genCompat].forEach((m) => { if (!map[m.id]) map[m.id] = m; });
      return Object.values(map);
    }
    return all.filter(m => m.type === 'VIDEO_GENERATION');
  }, [data.models, selectedEditingCapability]);

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
  const [resolution, setResolution] = useState(data.config.resolution || '');
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
  const [duration, setDuration] = useState(data.config.duration || 5);
  const [audioEnabled, setAudioEnabled] = useState(data.config.audio || false);
  const [movementAmplitude, setMovementAmplitude] = useState<'auto' | 'small' | 'medium' | 'large'>(data.config.movementAmplitude || 'auto');
  const [isGenerating, setIsGenerating] = useState(false);
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText] = useState('');
  const [confirmType] = useState<'alert' | 'confirm'>('confirm');
  const [confirmBehavior] = useState<'dropImages' | 'useFirstImage' | 'useFirstTwoImages' | null>(null);

  // 角色提及状态（内联下拉选择器）
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const [roleSuggestions, setRoleSuggestions] = useState<Array<{ id: string; name: string; thumbnail?: string }>>([]);
  const [roleSearchQuery, setRoleSearchQuery] = useState('');
  const [mentionCursorPosition, setMentionCursorPosition] = useState(0);
  const [selectedRoleIndex, setSelectedRoleIndex] = useState(0);
  const [mentionedRoles, setMentionedRoles] = useState<Record<string, string>>({}); // { roleName: roleId }
  const [allRolesCache, setAllRolesCache] = useState<Array<{ id: string; name: string; thumbnail?: string }>>([]);

  // 当前选中的模型
  const selectedModel = videoModels.find(m => m.id === modelId);

  // 当可用模型集合变化时，若当前模型不再可用则自动切换到第一个可用模型
  useEffect(() => {
    if (!videoModels.find(m => m.id === modelId)) {
      const nextId = videoModels[0]?.id || '';
      setModelId(nextId);
      updateNodeData({ modelId: nextId, modelName: videoModels[0]?.name });
    }
  }, [videoModels]);

  // 当分辨率选项变化时，确保当前分辨率有效
  useEffect(() => {
    if (selectedModel?.config.supportedResolutions?.length) {
      const resolutions = selectedModel.config.supportedResolutions;
      if (!resolution || !resolutions.includes(resolution)) {
        const firstResolution = resolutions[0];
        setResolution(firstResolution);
        updateNodeData({ resolution: firstResolution });
      }
    }
  }, [selectedModel?.id]);

  // 当切换到首尾帧模式时，检查并调整duration
  useEffect(() => {
    const isViduQ2 = selectedModel?.modelId?.includes('viduq2');
    const isStartEndMode = normalizeGenType(generationType) === '首尾帧';
    if (isViduQ2 && isStartEndMode && duration > 8) {
      // 首尾帧模式最多支持8秒
      setDuration(8);
      updateNodeData({ duration: 8 });
    }
  }, [generationType, selectedModel?.modelId]);

  // 检测是否为 Sora 模型
  const isSoraModel = selectedModel?.provider?.toLowerCase() === 'sora';

  const durationOptions = useMemo(() => {
    if (selectedModel?.config.supportedDurations?.length) {
      let durations = selectedModel.config.supportedDurations;
      
      // Vidu Q2 首尾帧模式只支持 1-8 秒
      const isViduQ2 = selectedModel.modelId?.includes('viduq2');
      const isStartEndMode = normalizeGenType(generationType) === '首尾帧';
      if (isViduQ2 && isStartEndMode) {
        durations = durations.filter(d => d <= 8);
      }

      // Minimax 1080P 限制时长为 6s
      const isMinimax = selectedModel.provider?.toLowerCase() === 'minimax' || selectedModel.modelId?.toLowerCase().includes('minimax');
      if (isMinimax && resolution && resolution.includes('1080')) {
        durations = durations.filter(d => d === 6);
      }
      
      return durations;
    }
    // 默认值（如果模型配置中没有设置）
    return [duration || 5];
  }, [selectedModel, duration, generationType, normalizeGenType, resolution]);

  // 当可用时长选项变化时，确保当前时长有效
  // Moved to after updateNodeData declaration


  const resolutionOptions = useMemo(() => {
    if (selectedModel?.config.supportedResolutions?.length) {
      return selectedModel.config.supportedResolutions;
    }
    // 返回空数组，所有分辨率配置都应该从ModelConfigPage.tsx来
    return [];
  }, [selectedModel]);

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

  // 当可用时长选项变化时，确保当前时长有效
  useEffect(() => {
    if (durationOptions.length > 0 && !durationOptions.includes(duration)) {
      const validDuration = durationOptions[0];
      setDuration(validDuration);
      updateNodeData({ duration: validDuration });
    }
  }, [durationOptions, duration, updateNodeData]);

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
    let result: ReferenceImage[] = [];
    if (g === '文生视频') result = [];
    else if (g === '首帧' || g === '尾帧') result = dedup.slice(0, 1);
    else if (g === '首尾帧') result = dedup.slice(0, 2);
    else if (g === '参考图') result = dedup.slice(0, 7);
    else result = dedup;
    return result;
  };
  const inputImages = useMemo(() => computeInputImages(), [edges, allNodes, generationType, id]);

  // 点击缩略图时在光标位置插入 @图1
  const handleThumbnailClick = (imageName: string) => {
    if (!promptTextareaRef.current) return;
    
    const textarea = promptTextareaRef.current;
    const cursorPos = textarea.selectionStart || prompt.length;
    const textBefore = prompt.slice(0, cursorPos);
    const textAfter = prompt.slice(cursorPos);
    
    // 在光标位置插入 @图1
    const mention = `@${imageName} `;
    const newPrompt = textBefore + mention + textAfter;
    setPrompt(newPrompt);
    
    // 记录到 mentionedRoles
    setMentionedRoles(prev => ({
      ...prev,
      [imageName]: `image-${imageName}` // 使用图片名称作为ID
    }));
    
    // 恢复光标位置
    setTimeout(() => {
      const newCursorPos = cursorPos + mention.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
      textarea.focus();
    }, 0);
    
    console.log('[AIVideoNode] 点击缩略图添加提及:', imageName);
  };

  // 加载所有角色（用于@提及）- 包含共享的资产库
  const loadAllRoles = useCallback(async () => {
    if (allRolesCache.length > 0) return;
    try {
      const response = await apiClient.assetLibraries.getAll({ includeShared: 'true' });
      const libraries = response.data || response || [];
      const roles: Array<{ id: string; name: string; thumbnail?: string }> = [];
      for (const lib of libraries) {
        if (lib.category !== 'ROLE') continue;
        try {
          const roleResponse = await apiClient.assetLibraries.roles.list(lib.id);
          const roleList = roleResponse.data || roleResponse || [];
          for (const role of roleList) {
            roles.push({
              id: role.id,
              name: role.metadata?.name || role.name || '',
              thumbnail: role.thumbnail,
            });
          }
        } catch {}
      }
      setAllRolesCache(roles);
    } catch (error) {
      console.error('[AIVideoNode] 加载角色失败:', error);
    }
  }, [allRolesCache.length]);

  // 搜索角色（从缓存中过滤）
  const searchRoles = useCallback((query: string) => {
    if (!query) {
      // 空查询显示前5个角色
      setRoleSuggestions(allRolesCache.slice(0, 5));
      return;
    }
    const filtered = allRolesCache.filter(r => 
      r.name.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5);
    setRoleSuggestions(filtered);
    setSelectedRoleIndex(0);
  }, [allRolesCache]);

  // 处理提示词输入变化（检测@提及）
  const handleRolePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setPrompt(value);

    // 检测@符号
    const textBeforeCursor = value.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([^@\s]*)$/);

    if (atMatch) {
      const query = atMatch[1];
      setRoleSearchQuery(query);
      setMentionCursorPosition(cursorPos - query.length - 1);
      setShowRoleSelector(true);
      loadAllRoles().then(() => searchRoles(query));
    } else {
      setShowRoleSelector(false);
      setRoleSuggestions([]);
    }
  }, [loadAllRoles, searchRoles]);

  // 选择角色并插入提及
  const handleSelectRole = useCallback((role: { id: string; name: string }) => {
    const textBeforeMention = prompt.substring(0, mentionCursorPosition);
    const textAfterCursor = prompt.substring(mentionCursorPosition + roleSearchQuery.length + 1);
    const mentionText = `@${role.name} `;
    const newPrompt = textBeforeMention + mentionText + textAfterCursor;
    
    setPrompt(newPrompt);
    setMentionedRoles(prev => ({ ...prev, [role.name]: role.id }));
    setShowRoleSelector(false);
    setRoleSuggestions([]);
    setRoleSearchQuery('');
    
    setTimeout(() => {
      if (promptTextareaRef.current) {
        promptTextareaRef.current.focus();
        const newCursorPos = textBeforeMention.length + mentionText.length;
        promptTextareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  }, [prompt, mentionCursorPosition, roleSearchQuery]);

  // 处理键盘导航（角色选择器）
  const handleRoleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showRoleSelector || roleSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedRoleIndex(prev => prev < roleSuggestions.length - 1 ? prev + 1 : prev);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedRoleIndex(prev => prev > 0 ? prev - 1 : prev);
    } else if (e.key === 'Enter' && roleSuggestions[selectedRoleIndex]) {
      e.preventDefault();
      handleSelectRole(roleSuggestions[selectedRoleIndex]);
    } else if (e.key === 'Escape') {
      setShowRoleSelector(false);
    }
  }, [showRoleSelector, roleSuggestions, selectedRoleIndex, handleSelectRole]);

  // 页面加载时恢复进行中的任务（参考AIImageNode逻辑）
  useEffect(() => {
    const initialTaskId = data.config.taskId;
    const existingVideoUrl = data.config.generatedVideoUrl;

    const recoverTask = async () => {
      // 如果有taskId，说明有任务需要检查状态
      if (initialTaskId) {
        console.log('🔄 [AIVideoNode] 检测到任务ID，准备恢复:', initialTaskId);

        try {
          const response = await apiClient.tasks.getTaskStatus(initialTaskId);
          const task = response.task;

          console.log('📋 [AIVideoNode] 任务当前状态:', {
            status: task.status,
            progress: task.progress,
            hasResultUrl: !!task.resultUrl,
          });

          if (task.status === 'SUCCESS') {
            // 任务已完成，直接处理结果
            console.log('✅ [AIVideoNode] 任务已完成，显示结果');
            setIsGenerating(false);
            setGenerationProgress(100);

            const videoUrl = task.resultUrl;
            if (!videoUrl) {
              console.error('❌ [AIVideoNode] 任务完成但没有结果URL');
              setIsGenerating(false);
              setGenerationProgress(0);
              updateNodeData({ taskId: '' });
              setTaskId('');
              toast.error('任务完成但未找到结果');
              return;
            }

            // 如果已有保存的本地 URL，优先使用（避免重复下载已删除的 OSS 文件）
            let displayUrl = videoUrl;
            if (existingVideoUrl) {
              console.log('[AIVideoNode] 使用已保存的本地 URL:', existingVideoUrl.substring(0, 50));
              displayUrl = existingVideoUrl;
            } else {
              // 处理任务结果（如果启用本地存储，会下载到本地）
              const processedResult = await processTaskResult({
                taskId: initialTaskId,
                resultUrl: videoUrl,
                type: 'VIDEO',
              });
              displayUrl = processedResult.displayUrl;
            }

            // 使用保存在node data中的ratio
            const savedRatio = data.config.ratio || '16:9';

            updateNodeData({
              prompt: data.config.prompt || prompt,
              ratio: savedRatio,
              modelId: data.config.modelId,
              modelName: data.config.modelName,
              generatedVideoUrl: displayUrl,
              taskId: '', // 清除taskId，任务已完成
            });
            setTaskId('');

            // 检查是否已存在该任务的预览节点（防止重复创建）
            const allNodes = getNodes();
            const allEdges = getEdges();
            const connectedPreviewNodes = allNodes.filter(node => {
              return node.type === 'videoPreview' && allEdges.some(edge =>
                edge.source === id && edge.target === node.id
              );
            });

            const existingNode = connectedPreviewNodes.find(node => node.data.videoUrl === videoUrl);
            if (existingNode) {
              console.log('⚠️ [AIVideoNode] 该任务的预览节点已存在，跳过创建', {
                taskId: initialTaskId,
                existingNodeId: existingNode.id,
                sourceNodeId: id,
              });
              // 预览节点已存在，不需要提示
              setTimeout(() => setGenerationProgress(0), 1000);
              return;
            }

            toast.success('视频生成已完成！');

            try {
              const suppressedRaw = localStorage.getItem('suppressedPreviewTasks') || '[]';
              const suppressed: Array<{ sourceNodeId?: string; taskId?: string; messageId?: string }> = JSON.parse(suppressedRaw);
              const isSuppressed = suppressed.some(s => (s.taskId && s.taskId === initialTaskId) || (s.sourceNodeId && s.sourceNodeId === id));
              if (!isSuppressed) {
                createPreviewNode(videoUrl, savedRatio);
              }
            } catch {
              createPreviewNode(videoUrl, savedRatio);
            }

            setTimeout(() => setGenerationProgress(0), 1000);
          } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
            // 任务仍在进行中，恢复轮询
            console.log('⏳ [AIVideoNode] 任务仍在进行中，恢复轮询');
            setIsGenerating(true);
            setGenerationProgress(task.progress || 0);
            pollTaskStatus(initialTaskId);
            return;
          } else if (task.status === 'FAILURE') {
            // 任务失败
            console.log('❌ [AIVideoNode] 任务失败');
            setIsGenerating(false);
            setGenerationProgress(0);
            updateNodeData({ taskId: '' });
            setTaskId('');
            toast.error(`生成失败: ${task.errorMessage || '未知错误'}`);
          }
        } catch (error: any) {
          console.error('❌ [AIVideoNode] 恢复任务失败:', error);
          setIsGenerating(false);
          setGenerationProgress(0);
          updateNodeData({ taskId: '' });
          setTaskId('');
          toast.error('任务恢复失败，请重新生成');
        }
        return; // 如果有taskId，处理完就返回
      }
      
      // 如果没有taskId但有已生成的视频URL，检查是否需要恢复预览节点
      if (existingVideoUrl) {
        const allNodes = getNodes();
        const allEdges = getEdges();
        const connectedPreviewNodes = allNodes.filter(node => {
          return node.type === 'videoPreview' && allEdges.some(edge =>
            edge.source === id && edge.target === node.id
          );
        });
        
        const existingNode = connectedPreviewNodes.find(node => node.data.videoUrl === existingVideoUrl);
        if (!existingNode) {
          // 预览节点不存在，需要创建
          console.log('🔄 [AIVideoNode] 检测到已生成的视频URL但无预览节点，创建预览节点');
          const savedRatio = data.config.ratio || '16:9';
          createPreviewNode(existingVideoUrl, savedRatio);
        }
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
  }, [referenceImages.length, generationType, normalizeGenType]);

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
    if (g === '文生视频') return ['TEXT'];
    return ['TEXT', 'IMAGE'];
  }, [normalizeGenType, selectedEditingCapability]);

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

  // 首尾帧不支持音频直出，自动关闭音频开关
  useEffect(() => {
    if (normalizeGenType(generationType) === '首尾帧' && audioEnabled) {
      setAudioEnabled(false);
      updateNodeData({ audio: false });
    }
  }, [generationType, normalizeGenType]);

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

  // 模型切换时更新配置和acceptedInputs
  const handleModelChange = (newModelId: string) => {
    setModelId(newModelId);
    const model = filteredVideoModels.find(m => m.id === newModelId);
    if (model) {
      const modelRatios = model.config.supportedRatios?.length ? model.config.supportedRatios : ['16:9'];
      const modelResolutions = model.config.supportedResolutions || [];
      const modelTypes = model.config.supportedGenerationTypes?.length ? model.config.supportedGenerationTypes : ['文生视频'];
      const modelDurations = model.config.supportedDurations?.length ? model.config.supportedDurations : [5];

      const nextRatio = modelRatios[0];
      const nextResolution = modelResolutions.length > 0 ? modelResolutions[0] : resolution;
      const nextType = normalizeGenType(generationType || modelTypes[0]);
      const nextDuration = modelDurations[0];
      
      // 如果新模型不支持音频，则禁用音频
      const nextAudio = model.config.supportsAudioOutput ? audioEnabled : false;

      setRatio(nextRatio);
      setResolution(nextResolution);
      setGenerationType(nextType);
      setDuration(nextDuration);
      if (!model.config.supportsAudioOutput) {
        setAudioEnabled(false);
      }

      updateNodeData({
        modelId: newModelId,
        modelName: model.name,
        ratio: nextRatio,
        resolution: nextResolution,
        generationType: nextType,
        duration: nextDuration,
        audio: nextAudio,
        acceptedInputs: computeAcceptedInputs(nextType),
      });
    }
  };

  const canGenerate = useMemo(() => {
    const g = normalizeGenType(generationType);
    const imgCount = inputImages.length;
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
      return t === 'videoPreview' || (t || '').startsWith('aiVideo');
    });
    const videoCount = videoInputs.length;
    if (!modelId) return false;
    if (g === '文生视频') return !!prompt.trim();
    if (g === '首帧' || g === '尾帧') return imgCount >= 1;
    if (g === '首尾帧') return imgCount >= 2;
    if (g === '参考图') return imgCount >= 1 && !!prompt.trim();
    if (g === '视频换人' || g === '视频换背景' || g === '风格转换') return videoCount >= 1 && imgCount >= 1;
    return false;
  }, [generationType, modelId, prompt, inputImages, normalizeGenType, edges, id, getNode]);

  // 移除监听 generatedVideoUrl 变化创建预览节点的逻辑
  // 统一在 pollTaskStatus 和 页面初始化恢复逻辑中处理，避免重复创建
  // useEffect(() => {
  //   const url = data?.config?.generatedVideoUrl;
  //   if (url) {
  //     createPreviewNode(url, data.config.ratio || '16:9');
  //   }
  // }, [data?.config?.generatedVideoUrl]);

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
          // 生成成功
          setIsGenerating(false);
          setGenerationProgress(100);

          const videoUrl = task.resultUrl;

          // 处理任务结果（如果启用本地存储，会下载到本地）
          let displayUrl = videoUrl;
          if (videoUrl) {
            const processedResult = await processTaskResult({
              taskId: taskId,
              resultUrl: videoUrl,
              type: 'VIDEO',
            });
            displayUrl = processedResult.displayUrl;
            
            if (processedResult.isLocalStored) {
              console.log('[AIVideoNode] 视频已下载到本地:', displayUrl);
            }
          }

          // 创建预览节点
          if (displayUrl) {
            createPreviewNode(displayUrl, data.config.ratio || '16:9');
          }

          // 更新节点数据
          updateNodeData({
            prompt: data.config.prompt,
            ratio: data.config.ratio,
            modelId: data.config.modelId,
            modelName: data.config.modelName,
            taskId: '',
            generatedVideoUrl: displayUrl,
          });
          setTaskId('');

          toast.success('视频生成成功！');

          setTimeout(() => setGenerationProgress(0), 1000);
          return;
        } else if (task.status === 'FAILURE') {
          // 生成失败，刷新积分（因为会退款）
          console.error('❌ [AIVideoNode] 生成失败:', task.errorMessage);
          setIsGenerating(false); // ✅ 停止生成状态
          setGenerationProgress(0);
          updateNodeData({ taskId: '' });
          
          // 刷新租户积分（退款后）
          const { refreshTenantCredits } = await import('../../../lib/api');
          await refreshTenantCredits();
          
          toast.error(task.errorMessage || '视频生成失败，积分已退还');
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
            updateNodeData({ taskId: '' });
            toast.error('生成超时，请重试');
          }
        }
      } catch (error: any) {
        console.error('❌ [AIVideoNode] 轮询任务失败:', error);
        setIsGenerating(false); // ✅ 停止生成状态
        setGenerationProgress(0);
        updateNodeData({ taskId: '' });
        toast.error('查询任务状态失败');
      }
    };

    poll();
  };

  // 生成视频（异步任务）
  const executeGenerate = async () => {
    const g = normalizeGenType(generationType);
    if (g === '文生视频' && !prompt.trim()) {
      toast.error('请输入提示词');
      return;
    }
    setIsGenerating(true);
    const latestInputs = computeInputImages();
    updateNodeData({ referenceImages: latestInputs });
    setGenerationProgress(0);
    try {
      let processedReferenceImages: string[] = [];
      let subjectsPayload: Array<{ name: string; images: string[] }> | undefined;
      const imageCount = referenceImages.length;
      if (referenceImages.length > 0) {
        try {
          for (const img of referenceImages) {
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
          toast.error('参考图处理失败');
        }
      }
      const connectedEdgesSubjects = edges.filter(e => e.target === id);
      let collectedRoleIds: string[] = [];
      if (normalizeGenType(generationType) === '参考图') {
        // 首先从提示词中解析 @ 提及的角色
        const mentionRegex = /@(\S+)/g;
        const matches = [...prompt.matchAll(mentionRegex)];
        const mentionedRoleNames = matches.map(m => m[1]);
        
        console.log('[AIVideoNode] 提示词中提及的角色:', mentionedRoleNames);
        
        // 从 mentionedRoles 映射中查找角色ID
        for (const roleName of mentionedRoleNames) {
          const roleId = mentionedRoles[roleName];
          if (roleId) {
            collectedRoleIds.push(roleId);
            console.log('[AIVideoNode] 从提示词提及获取到 roleId:', { roleName, roleId });
          }
        }
        
        const roleMap = new Map<string, string[]>();
        for (const edge of connectedEdgesSubjects) {
          const srcNode = getNode(edge.source);
          if (srcNode?.type === 'assetSelector') {
            // 收集节点连接的 roleIds（补充）
            const nodeRoleIds = srcNode.data.config?.roleIds as string[] | undefined;
            if (nodeRoleIds && nodeRoleIds.length > 0) {
              // 避免重复添加
              for (const roleId of nodeRoleIds) {
                if (!collectedRoleIds.includes(roleId)) {
                  collectedRoleIds.push(roleId);
                }
              }
              console.log('[AIVideoNode] 从节点收集到 roleIds:', nodeRoleIds);
            }
            
            // 仍然收集 subjects 用于 UI 显示和备用
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
            toast.info('已限制参考图为前7张（包含角色图片）');
          }
        }
        
        // 将普通图片也添加到 subjects
        if (processedReferenceImages.length > 0) {
          const regularImages = inputImages.filter(img => !img.id.includes('subject'));
          if (regularImages.length > 0) {
            // 初始化 subjectsPayload（如果还没有）
            if (!subjectsPayload) {
              subjectsPayload = [];
            }
            
            // 为每张普通图片创建 subject
            regularImages.forEach((img, index) => {
              const imageName = `图${index + 1}`;
              const imageUrl = img.url.startsWith('http') || img.url.startsWith('data:') ? img.url : `${API_URL}${img.url}`;
              
              // 连接的图片都添加到 subjects（Vidu API 要求 subjects 和 images 二选一）
              subjectsPayload!.push({
                name: imageName,
                images: [imageUrl]
              });
              console.log('[AIVideoNode] 添加图片到 subjects:', imageName);
            });
          }
        }
      }
      // 计算有效图片数量（包括角色）
      const effectiveImageCount = subjectsPayload && subjectsPayload.length > 0
        ? subjectsPayload.reduce((acc, r) => acc + (r.images?.length || 0), 0)
        : imageCount;
      
      // 如果有 roleIds，说明有角色输入（即使没有显示图片）
      const hasRoleInput = collectedRoleIds.length > 0;
      
      console.log('[AIVideoNode] submitGenerate 验证:', {
        effectiveImageCount,
        hasRoleInput,
        roleIdsCount: collectedRoleIds.length
      });
      
      let payloadGenerationType = generationType;
      if (payloadGenerationType === '首帧' || payloadGenerationType === '尾帧') {
        if (effectiveImageCount !== 1 && !hasRoleInput) {
          toast.error('当前生成方法需要且仅接受1张图片');
          setIsGenerating(false);
          setGenerationProgress(0);
          return;
        }
      } else if (payloadGenerationType === '首尾帧') {
        if (effectiveImageCount === 1) {
          payloadGenerationType = '首帧';
        } else if (effectiveImageCount !== 2 && !hasRoleInput) {
          toast.error('首尾帧生成需要且仅接受2张图片');
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
        if (effectiveImageCount < 1 && !hasRoleInput) {
          toast.error('参考生成需要至少1张图片或角色');
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
            toast.info('已限制参考图为前7张');
          }
        } else {
          if (processedReferenceImages.length > 7) {
            processedReferenceImages = processedReferenceImages.slice(0, 7);
            toast.info('已限制参考图为前7张');
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
        // 如果有 subjects，不再单独传递 referenceImages（图片已在 subjects 中）
        referenceImages: subjectsPayload && subjectsPayload.length > 0 ? undefined : (processedReferenceImages.length > 0 ? processedReferenceImages : undefined),
        roleIds: collectedRoleIds.length > 0 ? collectedRoleIds : undefined,
        generationType: payloadGenerationType,
        sourceNodeId: id,
        metadata: {
          duration,
          resolution,
          audio: audioEnabled,
          movementAmplitude,
          roleIds: collectedRoleIds.length > 0 ? collectedRoleIds : undefined, // 也在 metadata 中传递，兼容旧代码
        },
        ...(subjectsPayload ? { subjects: subjectsPayload } : {}),
      };
      
      // 关键日志：Subjects 详情
      if (subjectsPayload && subjectsPayload.length > 0) {
        console.log('[AIVideoNode] 📦 Subjects:', subjectsPayload.map(s => `${s.name}(${s.images.length}张)`).join(', '));
      }
      
      // 输出完整的 taskPayload（检查 subjects 是否包含在内）
      console.log('[AIVideoNode] 🚀 完整 taskPayload:', {
        hasSubjects: !!taskPayload.subjects,
        subjectsCount: taskPayload.subjects?.length || 0,
        hasRoleIds: !!taskPayload.roleIds,
        roleIdsCount: taskPayload.roleIds?.length || 0,
      });
      
      const genNorm = normalizeGenType(payloadGenerationType);
      if (genNorm === '文生视频') {
        if (!prompt.trim()) {
          toast.error('请输入提示词');
          setIsGenerating(false);
          setGenerationProgress(0);
          return;
        }
        taskPayload.prompt = prompt.trim();
      } else if (genNorm === '参考图') {
        if (!prompt.trim()) {
          toast.error('请输入参考图提示词');
          setIsGenerating(false);
          setGenerationProgress(0);
          return;
        }
        taskPayload.prompt = prompt.trim();
      } else if (prompt.trim()) {
        taskPayload.prompt = prompt.trim();
      }
      const response = await apiClient.tasks.createVideoTask(taskPayload);
      const newTaskId = response.taskId;
      const creditsCharged = response.creditsCharged || 0;
      const isFreeUsage = response.isFreeUsage;
      const freeUsageRemaining = response.freeUsageRemaining ?? 0;
      
      setTaskId(newTaskId);
      updateNodeData({
        prompt,
        ratio,
        resolution,
        generationType,
        duration,
        modelId,
        taskId: newTaskId,
      });
      
      // 显示提示并刷新剩余次数
      if (isFreeUsage) {
        // 免费使用，刷新剩余次数显示
        toast.success(`免费生成，今日还剩 ${freeUsageRemaining} 次`);
        refetchEstimate();
      } else if (creditsCharged > 0) {
        // 扣除积分，刷新租户积分和剩余次数
        const { refreshTenantCredits } = await import('../../../lib/api');
        await refreshTenantCredits();
        toast.success(`任务已提交（已扣除 ${creditsCharged} 积分）`);
        refetchEstimate();
      } else {
        toast.success('任务已提交，正在生成中...');
      }
      
      pollTaskStatus(newTaskId);
    } catch (error: any) {
      console.error('❌ [AIVideoNode] 提交任务失败:', error);
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

  const handleGenerate = async () => {
    const g = normalizeGenType(generationType);
    const latestInputs = computeInputImages();
    const imgCount = latestInputs.length;
    
    // 检查是否有连接的角色节点
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
    
    // 检查是否有 @ 提及的角色
    const hasMentionedRoles = Object.keys(mentionedRoles).length > 0;
    
    console.log('[AIVideoNode] 生成验证:', {
      generationType: g,
      imgCount,
      hasSubjects,
      hasMentionedRoles,
      mentionedRolesCount: Object.keys(mentionedRoles).length
    });

    // 规则 8：传入角色且模式为首帧/尾帧/首尾帧，禁止执行
    if ((hasSubjects || hasMentionedRoles) && (g === '首帧' || g === '尾帧' || g === '首尾帧')) {
      toast.error('您选择的生成模式不支持传入角色图片，无法继续执行');
      return;
    }

    // 规则 7：模式需要图片但未传入（@ 提及的角色也算作有效输入）
    if ((g === '首帧' || g === '尾帧') && imgCount === 0 && !hasMentionedRoles) {
      toast.error('您选择的生成模式需要您传入1张图片，无法继续执行');
      return;
    }
    if (g === '首尾帧' && imgCount === 0 && !hasMentionedRoles) {
      toast.error('您选择的生成模式需要您传入2张图片，无法继续执行');
      return;
    }
    if (g === '参考图' && imgCount === 0 && !hasMentionedRoles) {
      toast.error('参考图模式需要传入图片或使用 @ 提及角色');
      return;
    }

    // 规则 1：有图片但模式是文生视频→提示确认（删除图片继续）
    if (g === '文生视频' && imgCount > 0) {
      const proceed = window.confirm('当前选择的模式是文生视频，继续执行会删除传入的图片，是否继续？');
      if (!proceed) {
        toast.info('请在面板中选择合适的生成模式');
        return;
      }
    }

    // 规则 2：1张图片且模式为首帧/尾帧/参考图→直接执行
    // 规则 3：≥2张图片且模式为首帧/尾帧→提示确认（仅用第1张）
    if ((g === '首帧' || g === '尾帧') && imgCount >= 2) {
      const proceed = window.confirm('当前模式只能传入1张图片，继续执行将只使用您提供的第1张图片生成，是否继续？');
      if (!proceed) {
        toast.info('请在面板中选择合适的生成模式');
        return;
      }
    }

    // 规则 4：2张图片且模式为首尾帧或参考图→直接执行
    // 规则 5：≥3张图片且模式为首尾帧→提示确认（仅用前2张）
    if (g === '首尾帧' && imgCount >= 3) {
      const proceed = window.confirm('首尾帧模式只能传入2张图片，继续执行将只使用您提供的前两张图片生成，是否继续？');
      if (!proceed) {
        toast.info('请在面板中选择合适的生成模式');
        return;
      }
    }

    // 文本提示词在参考图/首帧/尾帧/首尾帧可选；仅文生视频强制需要
    if (g === '文生视频' && !prompt.trim()) {
      toast.error('请输入提示词');
      return;
    }

    if (!modelId) {
      toast.error('请选择视频生成模型');
      return;
    }

    setReferenceImages(latestInputs);
    updateNodeData({ referenceImages: latestInputs });
    setIsGenerating(true);
    setGenerationProgress(0);

    await executeGenerate();
  };

  // 用于防止并发创建相同URL的预览节点
  const creatingPreviewUrlsRef = useRef<Set<string>>(new Set());

  // 用于追踪重试次数
  const createPreviewRetryRef = useRef<Map<string, number>>(new Map());

  // 创建视频预览节点
  const createPreviewNode = (videoUrl: string, videoRatio: string) => {
    console.log('🎬 [AIVideoNode] createPreviewNode 被调用:', { videoUrl: videoUrl?.substring(0, 50), videoRatio, nodeId: id });
    
    const currentNode = getNode(id);
    if (!currentNode) {
      console.error('❌ [AIVideoNode] createPreviewNode 失败: currentNode 不存在, nodeId:', id);
      return;
    }
    if (!videoUrl) {
      console.error('❌ [AIVideoNode] createPreviewNode 失败: videoUrl 为空');
      return;
    }

    // 检查工作流是否已加载完成（通过检查节点数量是否稳定）
    // 如果节点数量为 0 或很少，可能工作流还在加载中
    const allNodesNow = getNodes();
    if (allNodesNow.length === 0) {
      const retryCount = createPreviewRetryRef.current.get(videoUrl) || 0;
      if (retryCount < 10) {
        console.warn('⏳ [AIVideoNode] createPreviewNode 延迟: 工作流可能还在加载中，1秒后重试 (', retryCount + 1, '/10)');
        createPreviewRetryRef.current.set(videoUrl, retryCount + 1);
        setTimeout(() => createPreviewNode(videoUrl, videoRatio), 1000);
        return;
      } else {
        console.error('❌ [AIVideoNode] createPreviewNode 放弃: 重试次数已达上限');
        createPreviewRetryRef.current.delete(videoUrl);
        return;
      }
    }
    // 清理重试计数
    createPreviewRetryRef.current.delete(videoUrl);

    // 防止并发创建：如果正在创建这个URL的预览节点，直接返回
    if (creatingPreviewUrlsRef.current.has(videoUrl)) {
      console.warn('⚠️ [AIVideoNode] createPreviewNode 跳过: 正在创建相同URL的预览节点');
      return;
    }

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

    console.log('📊 [AIVideoNode] 当前状态:', { 
      allNodesCount: allNodes.length, 
      allEdgesCount: allEdges.length, 
      connectedPreviewNodesCount: connectedPreviewNodes.length 
    });

    // ✅ 去重检查：如果已经存在相同 URL 的预览节点，不要重复创建
    const existingNode = connectedPreviewNodes.find(node => node.data.videoUrl === videoUrl);
    if (existingNode) {
      console.warn('⚠️ [AIVideoNode] createPreviewNode 跳过: 已存在相同URL的预览节点:', existingNode.id);
      return; // 直接返回，不创建新节点
    }

    // 标记正在创建
    creatingPreviewUrlsRef.current.add(videoUrl);

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

    console.log('✅ [AIVideoNode] 准备创建预览节点:', { 
      previewNodeId: previewNode.id, 
      position: previewNode.position,
      videoUrl: videoUrl?.substring(0, 50),
      type: previewNode.type,
      data: previewNode.data,
      parentNodeData: {
        workflowContext: currentNode.data.workflowContext,
        createdBy: currentNode.data.createdBy,
      }
    });

    setNodes((nds) => {
      console.log('📝 [AIVideoNode] setNodes 被调用, 当前节点数:', nds.length);
      const newNodes = [...nds, previewNode];
      console.log('📝 [AIVideoNode] setNodes 返回新节点数:', newNodes.length);
      // 验证新节点是否在数组中
      const addedNode = newNodes.find(n => n.id === previewNode.id);
      console.log('📝 [AIVideoNode] 新节点已添加:', !!addedNode, addedNode?.type);
      return newNodes;
    });

    // 延迟检查节点是否真的被添加，如果没有则重试
    setTimeout(() => {
      const allNodesAfter = getNodes();
      const previewNodeExists = allNodesAfter.find(n => n.id === previewNode.id);
      console.log('🔍 [AIVideoNode] 延迟检查 - 节点总数:', allNodesAfter.length, '预览节点存在:', !!previewNodeExists);
      if (!previewNodeExists) {
        console.warn('⚠️ [AIVideoNode] 预览节点未被添加，可能被工作流加载覆盖，尝试重新创建...');
        // 移除正在创建的标记，允许重新创建
        creatingPreviewUrlsRef.current.delete(videoUrl);
        // 检查是否已达到重试上限
        const retryCount = createPreviewRetryRef.current.get(videoUrl) || 0;
        if (retryCount < 5) {
          createPreviewRetryRef.current.set(videoUrl, retryCount + 1);
          console.log('🔄 [AIVideoNode] 重新创建预览节点 (重试', retryCount + 1, '/5)');
          createPreviewNode(videoUrl, finalRatio);
        } else {
          console.error('❌ [AIVideoNode] 预览节点创建失败，已达重试上限');
          createPreviewRetryRef.current.delete(videoUrl);
        }
      } else {
        console.log('✅ [AIVideoNode] 预览节点已成功添加到状态中');
      }
    }, 500);

    // 自动连接
    const newEdge = {
      id: `edge-${id}-${previewNode.id}`,
      source: id,
      target: previewNode.id,
      sourceHandle: `${id}-source`,
      targetHandle: `${previewNode.id}-target`,
      type: 'aurora',
    };

    console.log('🔗 [AIVideoNode] 准备创建边:', newEdge);

    setEdges((eds) => {
      const existingEdge = eds.find((e) => e.source === id && e.target === previewNode.id);
      if (existingEdge) {
        console.warn('⚠️ [AIVideoNode] setEdges 跳过: 边已存在');
        return eds;
      }
      console.log('📝 [AIVideoNode] setEdges 被调用, 当前边数:', eds.length);
      return [...eds, newEdge];
    });

    // 延迟移除标记，确保状态已更新
    setTimeout(() => {
      creatingPreviewUrlsRef.current.delete(videoUrl);
      console.log('🏁 [AIVideoNode] 预览节点创建完成');
    }, 100);
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
      className={`relative bg-white/80 dark:bg-[#18181b]/100 dark:backdrop-blur-none backdrop-blur-sm border rounded-2xl shadow-xl transition-all ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-white/60 dark:border-neutral-700 ring-black/5 dark:ring-neutral-700 ring-black/5'}`}
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
          if (isT2V) return !hasAgent;
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
      <div className="flex items-center justify-between px-4 py-3 rounded-t-2xl border-slate-200 dark:border-neutral-800 bg-white dark:bg-[#18181b]">
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
                <button onClick={() => { setConfirmOpen(false); toast.info('请在面板中选择合适的生成模式'); }} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg">选择模式</button>
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

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">视频生成模型</label>
              <CustomSelect
                value={modelId}
                onChange={(value) => handleModelChange(value)}
                options={filteredVideoModels.length === 0 ? [{ value: '', label: '暂无可用模型' }] : filteredVideoModels.map((model) => ({
                  value: model.id,
                  label: model.name
                }))}
              />
            </div>

            {/* 提示词 */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">
                {isSoraModel ? '视频提示词' : '提示词'}
              </label>
              <div className="relative">
                <textarea
                  ref={promptTextareaRef}
                  value={prompt}
                  onChange={(e) => {
                    // 检测 @ 输入 - 只在 viduq2 + 参考图模式下启用
                    const isViduQ2 = selectedModel?.modelId?.includes('viduq2');
                    const isReferenceMode = normalizeGenType(generationType) === '参考图';
                    const shouldEnableRoleMention = isViduQ2 && isReferenceMode;
                    
                    if (shouldEnableRoleMention) {
                      handleRolePromptChange(e);
                    } else {
                      setPrompt(e.target.value);
                      setShowRoleSelector(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    const isViduQ2 = selectedModel?.modelId?.includes('viduq2');
                    const isReferenceMode = normalizeGenType(generationType) === '参考图';
                    if (isViduQ2 && isReferenceMode) {
                      handleRoleKeyDown(e);
                    }
                  }}
                  placeholder={
                    selectedModel?.modelId?.includes('viduq2') && normalizeGenType(generationType) === '参考图'
                      ? "描述你想要生成的视频场景...（输入 @ 可选择角色）"
                      : "描述你想要生成的视频场景..."
                  }
                  className="nodrag w-full p-2 text-xs rounded-md border outline-none resize-none overflow-hidden transition-colors font-mono leading-relaxed bg-slate-100 dark:bg-[#000000] backdrop-blur-none hover:bg-slate-200 dark:hover:bg-neutral-800 focus:bg-white dark:focus:bg-neutral-800 border-slate-200 dark:border-neutral-800 focus:border-neutral-400 dark:focus:border-neutral-400/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500"
                  style={{ minHeight: '60px' }}
                />
                {/* 角色选择器下拉菜单 - 内联显示 */}
                {showRoleSelector && roleSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-black/90 dark:backdrop-blur-none backdrop-blur-sm border border-slate-200 dark:border-neutral-800 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {roleSuggestions.map((role, index) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => handleSelectRole(role)}
                        className={`nodrag w-full px-3 py-2 flex items-center gap-2 text-left transition-colors ${
                          index === selectedRoleIndex
                            ? 'bg-neutral-100 dark:bg-neutral-800/30'
                            : 'hover:bg-slate-100 dark:hover:bg-white/5'
                        }`}
                      >
                        {role.thumbnail ? (
                          <img src={role.thumbnail} alt="" className="w-6 h-6 rounded-full object-cover object-top" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center">
                            <span className="material-symbols-outlined text-xs text-neutral-600 dark:text-neutral-300">person</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-700 dark:text-white truncate">
                            @{role.name}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* @ 提及的角色提示 - 只在 viduq2 + 参考图模式下显示 */}
            {Object.keys(mentionedRoles).length > 0 && 
             selectedModel?.modelId?.includes('viduq2') && 
             normalizeGenType(generationType) === '参考图' && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">
                  已提及角色
                </label>
                <div className="flex gap-2 flex-wrap">
                  {Object.keys(mentionedRoles).map((roleName) => (
                    <div
                      key={roleName}
                      className="nodrag px-2 py-1 rounded-md bg-neutral-500/10 dark:bg-neutral-500/20 border border-neutral-400/50 dark:border-neutral-400/30 flex items-center gap-1 group relative"
                    >
                      <span className="material-symbols-outlined text-neutral-500 dark:text-neutral-400" style={{ fontSize: '12px' }}>
                        person
                      </span>
                      <span className="text-[10px] font-medium text-neutral-700 dark:text-neutral-300">
                        {roleName}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          // 从映射中删除
                          setMentionedRoles(prev => {
                            const newRoles = { ...prev };
                            delete newRoles[roleName];
                            return newRoles;
                          });
                          // 从提示词中删除 @角色名
                          const regex = new RegExp(`@${roleName}\\s*`, 'g');
                          const newPrompt = prompt.replace(regex, '');
                          setPrompt(newPrompt);
                          console.log('[AIVideoNode] 删除角色提及:', roleName);
                        }}
                        className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <span className="material-symbols-outlined text-neutral-500 dark:text-neutral-400 hover:text-red-500 dark:hover:text-red-400" style={{ fontSize: '12px' }}>
                          close
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-[9px] text-slate-500 dark:text-gray-500">
                  💡 这些角色的图片会自动用于生成视频
                </p>
              </div>
            )}

            {/* 参考图缩略图（≥1张时显示，Sora 模型不显示） */}
            {!isSoraModel && referenceImages.length >= 1 && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">
                  {/* 检测是否为角色图片 */}
                  {referenceImages[0]?.name && referenceImages[0].id.includes('subject') ? '角色图片' : '参考图'} {generationType === '首尾帧' && '(拖动调整)'}
                  {normalizeGenType(generationType) === '参考图' && referenceImages.some(img => !img.id.includes('subject')) && (
                    <span className="ml-2 text-[9px] font-normal text-blue-500 dark:text-blue-400">
                      点击图片插入提及
                    </span>
                  )}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {referenceImages.map((img, index) => {
                    // 计算普通图片的编号（排除角色图片）
                    const regularImageIndex = referenceImages.slice(0, index + 1).filter(i => !i.id.includes('subject')).length;
                    const isRegularImage = !img.id.includes('subject');
                    const imageName = isRegularImage ? `图${regularImageIndex}` : img.name;
                    
                    return (
                      <div
                        key={img.id}
                        draggable={generationType === '首尾帧'}
                        onDragStart={() => handleImageDragStart(index)}
                        onDragOver={handleImageDragOver}
                        onDrop={() => handleImageDrop(index)}
                        onClick={() => {
                          if (isRegularImage && normalizeGenType(generationType) === '参考图') {
                            handleThumbnailClick(imageName);
                          }
                        }}
                        className={`nodrag relative w-16 h-16 rounded-md border-2 overflow-hidden transition-all ${
                          generationType === '首尾帧' ? 'cursor-move' : isRegularImage && normalizeGenType(generationType) === '参考图' ? 'cursor-pointer' : ''
                        } ${draggedImageIndex === index ? 'opacity-50' : ''} ${
                          img.id.includes('subject') ? 'border-neutral-400 dark:border-neutral-400/50' : 'border-blue-400 dark:border-blue-400/50'
                        } hover:border-neutral-400 dark:hover:border-neutral-400/50 ${
                          isRegularImage && normalizeGenType(generationType) === '参考图' ? 'hover:scale-105' : ''
                        }`}
                        title={isRegularImage && normalizeGenType(generationType) === '参考图' ? `点击插入 @${imageName}` : img.name}
                      >
                        <img
                          src={`${img.url.startsWith('http') || img.url.startsWith('data:') ? img.url : API_URL + img.url}`}
                          alt={img.name}
                          className="w-full h-full object-cover"
                        />
                        {/* 角色标识 */}
                        {img.id.includes('subject') && (
                          <div className="absolute top-0 left-0 bg-neutral-700 text-white dark:bg-neutral-300 dark:text-black text-[10px] font-bold px-1.5 py-0.5 rounded-br flex items-center gap-0.5">
                            <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>person</span>
                            {img.name}
                          </div>
                        )}
                        {/* 普通图片编号标识 */}
                        {isRegularImage && generationType !== '首尾帧' && (
                          <div className="absolute top-0 left-0 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-br flex items-center gap-0.5">
                            <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>image</span>
                            {imageName}
                          </div>
                        )}
                        {/* 首尾帧标识 */}
                        {generationType === '首尾帧' && !img.id.includes('subject') && (
                          <div className="absolute top-0 left-0 bg-neutral-700 text-white dark:bg-neutral-300 dark:text-black text-[10px] font-bold px-1.5 py-0.5 rounded-br">
                            {index === 0 ? '首' : index === 1 ? '尾' : index + 1}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedModel && !isSoraModel && (
              <>

                {/* 视频时长（按钮组） */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">
                    视频时长{durationDisabled ? '(未配置)' : ''}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {durationOptions.map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => {
                          setDuration(dur);
                          updateNodeData({ duration: dur });
                        }}
                        disabled={durationDisabled}
                        className={`nodrag px-3 py-1.5 text-[10px] font-medium rounded-md border transition-all ${duration === dur
                          ? 'bg-neutral-800 dark:bg-white text-white dark:text-black border-transparent shadow-md'
                          : 'bg-slate-100 dark:bg-[#000000] backdrop-blur-none text-slate-800 dark:text-white border-slate-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-400/50'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {dur}秒
                      </button>
                    ))}
                  </div>
                </div>

                {/* 比例选择：Sora模型显示横竖屏按钮，其他模型显示下拉框 */}
                {isRatioSelectable && (selectedModel?.config.supportedRatios?.length || 0) > 0 && (
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">
                      画面比例
                    </label>
                    {isSoraModel ? (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            setRatio('16:9');
                            updateNodeData({ ratio: '16:9' });
                          }}
                          className={`nodrag py-2 rounded-lg text-xs font-bold transition-all border ${ratio === '16:9'
                            ? 'bg-neutral-800 dark:bg-white text-white dark:text-black shadow-md border-transparent'
                            : 'bg-slate-100 dark:bg-[#000000] backdrop-blur-none text-slate-600 dark:text-white border-slate-200 dark:border-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-800'
                            }`}
                        >
                          <div className="flex items-center justify-center gap-2">
                            <span className="material-symbols-outlined text-lg">crop_landscape</span>
                            <span>横屏</span>
                          </div>
                        </button>
                        <button
                          onClick={() => {
                            setRatio('9:16');
                            updateNodeData({ ratio: '9:16' });
                          }}
                          className={`nodrag py-2 rounded-lg text-xs font-bold transition-all border ${ratio === '9:16'
                            ? 'bg-neutral-800 dark:bg-white text-white dark:text-black shadow-md border-transparent'
                            : 'bg-slate-100 dark:bg-[#000000] backdrop-blur-none text-slate-600 dark:text-white border-slate-200 dark:border-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-800'
                            }`}
                        >
                          <div className="flex items-center justify-center gap-2">
                            <span className="material-symbols-outlined text-lg">crop_portrait</span>
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

                {/* 分辨率 */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">
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

                {/* 运动幅度控制 - Vidu 模型显示（viduq2 不支持） */}
                {selectedModel?.provider?.toLowerCase() === 'vidu' && 
                 selectedModel?.modelId !== 'viduq2' && (
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">
                      运动幅度
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                      {(['auto', 'small', 'medium', 'large'] as const).map((amplitude) => (
                        <button
                          key={amplitude}
                          type="button"
                          onClick={() => {
                            setMovementAmplitude(amplitude);
                            updateNodeData({ movementAmplitude: amplitude });
                          }}
                          className={`nodrag px-2 py-1 text-[10px] font-bold rounded-lg transition-all ${
                            movementAmplitude === amplitude
                              ? 'bg-neutral-800 dark:bg-white text-white dark:text-black'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                          }`}
                        >
                          {amplitude === 'auto' ? '自动' : amplitude === 'small' ? '小' : amplitude === 'medium' ? '中' : '大'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 音频直出开关 - 仅Vidu Q2显示，首尾帧不显示（首尾帧只支持BGM） */}
                {selectedModel?.config.supportsAudioOutput && normalizeGenType(generationType) !== '首尾帧' && (
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">
                      音频直出
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const newValue = !audioEnabled;
                        setAudioEnabled(newValue);
                        updateNodeData({ audio: newValue });
                      }}
                      className={`nodrag relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                        audioEnabled
                          ? 'bg-neutral-800 dark:bg-white'
                          : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          audioEnabled ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                )}
              </>
            )}

            {/* 生成按钮 */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !canGenerate || (data as any)._canEdit === false}
              className={`nodrag w-full mt-2 py-2 text-[10px] font-bold rounded-lg border transition-all active:scale-95 flex items-center justify-center gap-2 ${isGenerating || !canGenerate || (data as any)._canEdit === false ? 'bg-neutral-400 dark:bg-neutral-700 text-white dark:text-neutral-300 cursor-not-allowed border-transparent dark:border-neutral-700' : 'bg-neutral-800 dark:bg-white text-white dark:text-black shadow-md hover:shadow-lg border-transparent dark:border-neutral-700'}`}
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
          </div>
        ) : (
          <div className="py-2 px-2">
            {prompt ? (
              <div className="space-y-1">
                <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">提示词：</p>
                <p className="text-xs text-neutral-400 line-clamp-6 whitespace-pre-wrap break-words">
                  {prompt}
                </p>
              </div>
            ) : (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 text-center italic">
                双击展开配置
              </p>
            )}
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

export default memo(AIVideoNode);
