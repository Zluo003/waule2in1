import { useState, useEffect, useMemo, memo, useRef } from 'react';
import { NodeProps, useReactFlow, useStore, Handle, Position } from 'reactflow';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../../lib/api';
import { processImageUrl } from '../../../utils/imageUtils';
import { processTaskResult } from '../../../utils/taskResultHandler';
import { useBillingEstimate } from '../../../hooks/useBillingEstimate';

// 任务状态持久化 - 独立于工作流保存
const TASK_STORAGE_KEY = 'smart_storyboard_tasks';

const saveTaskState = (nodeId: string, taskId: string, step: 'text' | 'image') => {
  try {
    const tasks = JSON.parse(localStorage.getItem(TASK_STORAGE_KEY) || '{}');
    tasks[nodeId] = { taskId, step, timestamp: Date.now() };
    localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
  } catch (e) {
    console.warn('[SmartStoryboardNode] 保存任务状态失败:', e);
  }
};

const clearTaskState = (nodeId: string) => {
  try {
    const tasks = JSON.parse(localStorage.getItem(TASK_STORAGE_KEY) || '{}');
    delete tasks[nodeId];
    localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
  } catch (e) {
    console.warn('[SmartStoryboardNode] 清除任务状态失败:', e);
  }
};

const getTaskState = (nodeId: string): { taskId: string; step: 'text' | 'image'; timestamp: number } | null => {
  try {
    const tasks = JSON.parse(localStorage.getItem(TASK_STORAGE_KEY) || '{}');
    return tasks[nodeId] || null;
  } catch (e) {
    return null;
  }
};

interface SmartStoryboardNodeData {
  config: {
    aspectRatio?: string;
    imageSize?: string;
    inputImages?: string[]; // 支持多图输入（最多5张）
    userPrompt?: string; // 用户剧情简述
    imageStyle?: string; // 图片风格
    autoSlice?: boolean; // 自动切割开关
    generatedImageUrl?: string;
    taskId?: string;
    slicedImages?: string[];
  };
  models?: any[];
  workflowContext?: any;
  createdBy?: any;
  _canEdit?: boolean;
}

const ASPECT_RATIOS = ['16:9', '9:16'];

// 模型ID
const TEXT_MODEL_ID = 'gemini-3-flash-preview'; // 第一步：文字生成
const IMAGE_MODEL_ID = 'gemini-3-pro-image-preview'; // 第二步：图片生成
const MAX_INPUT_IMAGES = 5; // 最多输入图片数

const SmartStoryboardNode = ({ data, selected, id }: NodeProps<SmartStoryboardNodeData>) => {
  const [aspectRatio, setAspectRatio] = useState(data.config.aspectRatio || '16:9');
  const [inputImages, setInputImages] = useState<string[]>(data.config.inputImages || []);
  const [userPrompt, setUserPrompt] = useState(data.config.userPrompt || '');
  const [imageStyle, setImageStyle] = useState(data.config.imageStyle || '');
  const [autoSlice, setAutoSlice] = useState(data.config.autoSlice !== false); // 默认开启
  const [isGenerating, setIsGenerating] = useState(!!data.config.taskId);
  const [generatingStep, setGeneratingStep] = useState<'text' | 'image' | null>(null);
  const [selectedModel, setSelectedModel] = useState<any>(null);

  // 从可用模型中查找图片生成模型
  const imageModel = useMemo(() => {
    const models = data.models || [];
    return models.find((m: any) => m.modelId === IMAGE_MODEL_ID) ||
           models.find((m: any) => m.modelId?.includes('gemini')) ||
           models[0];
  }, [data.models]);

  useEffect(() => {
    if (imageModel) {
      setSelectedModel(imageModel);
    }
  }, [imageModel]);

  // 积分估算
  const { credits, loading: creditsLoading } = useBillingEstimate({
    aiModelId: selectedModel?.id,
    nodeType: 'smart_storyboard',
    resolution: '4K',
  });

  const { setNodes, setEdges, getNode, getNodes } = useReactFlow();

  // 监听连接变化，获取输入图片
  const connectedEdges = useStore((state) =>
    state.edges.filter((edge) => edge.target === id)
  );

  // 从连接的节点获取图片（支持多图，最多5张）
  const prevImagesRef = useRef<string>('');
  
  useEffect(() => {
    const nodes = getNodes();
    const newInputImages: string[] = [];

    connectedEdges.forEach((edge) => {
      if (newInputImages.length >= MAX_INPUT_IMAGES) return;
      
      const sourceNode = nodes.find((n) => n.id === edge.source);
      
      if (sourceNode) {
        // UploadNode: 从 uploadedFiles 数组获取
        const uploadedFiles = sourceNode.data?.config?.uploadedFiles;
        if (Array.isArray(uploadedFiles)) {
          uploadedFiles.forEach((file: any) => {
            if (newInputImages.length >= MAX_INPUT_IMAGES) return;
            if (file?.url && !newInputImages.includes(file.url)) {
              newInputImages.push(file.url);
            }
          });
        }
        
        // 其他节点类型：直接获取 URL
        const imageUrl =
          sourceNode.data?.imageUrl ||
          sourceNode.data?.config?.generatedImageUrl ||
          sourceNode.data?.config?.imageUrl ||
          sourceNode.data?.url;
        
        if (imageUrl && !newInputImages.includes(imageUrl)) {
          newInputImages.push(imageUrl);
        }
      }
    });

    // 避免无限循环：只在图片实际变化时更新
    const imagesKey = newInputImages.join(',');
    if (imagesKey !== prevImagesRef.current) {
      prevImagesRef.current = imagesKey;
      setInputImages(newInputImages);
      updateNodeData({ inputImages: newInputImages });
    }
  }, [connectedEdges, getNodes]);

  // 任务恢复逻辑 - 优先从 localStorage 恢复
  useEffect(() => {
    const savedTask = getTaskState(id);
    const initialTaskId = savedTask?.taskId || data.config.taskId;

    const recoverTask = async () => {
      if (!initialTaskId) return;

      console.log('[SmartStoryboardNode] 恢复任务查询:', initialTaskId, savedTask ? '(from localStorage)' : '(from node data)');
      setIsGenerating(true);
      setGeneratingStep('image');

      try {
        const response = await apiClient.tasks.getTaskStatus(initialTaskId);
        const task = response.task;

        if (task.status === 'SUCCESS') {
          setIsGenerating(false);
          setGeneratingStep(null);
          clearTaskState(id);
          const imageUrl = task.resultUrl;
          if (!imageUrl) {
            updateNodeData({ taskId: '' });
            return;
          }

          const processedResult = await processTaskResult({
            taskId: initialTaskId,
            resultUrl: imageUrl,
            type: 'IMAGE',
          });

          const displayUrl = processedResult.displayUrl;
          updateNodeData({
            generatedImageUrl: displayUrl,
            taskId: '',
          });

          // 检查是否已有预览节点
          const existingNodes = getNodes();
          const hasPreviewNodes = existingNodes.some(
            (n: any) => n.data?.sourceNodeId === id && n.type === 'imagePreview'
          );

          if (!hasPreviewNodes) {
            await handleSliceAndCreatePreviews(displayUrl);
          }
        } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
          setIsGenerating(true);
          setGeneratingStep('image');
          pollTaskStatus(initialTaskId);
        } else if (task.status === 'FAILURE') {
          setIsGenerating(false);
          setGeneratingStep(null);
          clearTaskState(id);
          updateNodeData({ taskId: '' });
          toast.error(`生成失败: ${task.errorMessage || '未知错误'}`);
        }
      } catch (error: any) {
        setIsGenerating(false);
        setGeneratingStep(null);
        clearTaskState(id);
        updateNodeData({ taskId: '' });
        toast.error('任务恢复失败，请重新生成');
      }
    };

    recoverTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateNodeData = (updates: Partial<SmartStoryboardNodeData['config']>) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              config: {
                ...node.data.config,
                ...updates,
              },
            },
          };
        }
        return node;
      })
    );
  };

  const handleGenerate = async () => {
    console.log('[SmartStoryboardNode] handleGenerate called, inputImages:', inputImages.length, 'userPrompt:', userPrompt);

    if (inputImages.length === 0) {
      toast.error('请先连接至少一张图片');
      return;
    }

    if (!userPrompt.trim()) {
      toast.error('请输入剧情简述');
      return;
    }

    // 检查输入图片大小（限制 10MB）
    const MAX_IMAGE_SIZE_MB = 10;
    const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

    for (const imageUrl of inputImages) {
      try {
        if (imageUrl.startsWith('http') || imageUrl.startsWith('/')) {
          const headRes = await fetch(imageUrl, { method: 'HEAD' });
          const contentLength = headRes.headers.get('content-length');
          if (contentLength && parseInt(contentLength) > MAX_IMAGE_SIZE_BYTES) {
            toast.error(`输入图片过大，不能超过 ${MAX_IMAGE_SIZE_MB}MB。请压缩图片或降低分辨率后重试。`);
            return;
          }
        } else if (imageUrl.startsWith('data:')) {
          const base64Size = (imageUrl.length * 3) / 4;
          if (base64Size > MAX_IMAGE_SIZE_BYTES) {
            toast.error(`输入图片过大，不能超过 ${MAX_IMAGE_SIZE_MB}MB。请压缩图片或降低分辨率后重试。`);
            return;
          }
        }
      } catch {
        // 检查失败，继续处理
      }
    }

    setIsGenerating(true);
    setGeneratingStep('text');

    try {
      // 处理所有输入图片
      const processedImages = await Promise.all(
        inputImages.map(img => processImageUrl(img))
      );

      // 优先从后台获取提示词配置
      let systemPrompt = '';
      let imagePrompt = '';

      try {
        const res = await apiClient.get('/tenant/node-prompts/type/smartStoryboard');
        if (res.success && res.data) {
          if (res.data.systemPrompt) systemPrompt = res.data.systemPrompt;
          if (res.data.userPromptTemplate) imagePrompt = res.data.userPromptTemplate;
        }
      } catch (e) {
        console.log('[SmartStoryboardNode] 后台未配置提示词，使用内置默认值');
      }

      // 替换提示词中的变量
      const replaceVariables = (template: string) => {
        return template
          .replace(/\{\{userPrompt\}\}/g, userPrompt)
          .replace(/\{\{imageStyle\}\}/g, imageStyle || '')
          .replace(/\{\{aspectRatio\}\}/g, aspectRatio);
      };
      
      if (systemPrompt) systemPrompt = replaceVariables(systemPrompt);
      if (imagePrompt) imagePrompt = replaceVariables(imagePrompt);

      if (!selectedModel) {
        toast.error('图片模型未加载，请稍后重试');
        setIsGenerating(false);
        setGeneratingStep(null);
        return;
      }

      // 创建智能分镜任务（后端处理文字生成+图片生成两步）
      console.log('[SmartStoryboardNode] 创建智能分镜任务');
      const response = await apiClient.tasks.createSmartStoryboardTask({
        modelId: selectedModel.id,
        prompt: userPrompt,
        ratio: aspectRatio,
        imageSize: '4K',
        referenceImages: processedImages,
        sourceNodeId: id,
        metadata: {
          textModelId: TEXT_MODEL_ID,
          systemPrompt: systemPrompt || undefined,
          imagePrompt: imagePrompt || undefined,
          autoSlice: autoSlice, // 传递自动切割开关
        },
      });

      if (!response.success) {
        throw new Error(response.message || '创建任务失败');
      }

      const taskId = response.taskId;
      saveTaskState(id, taskId, 'image');
      updateNodeData({ taskId, userPrompt });
      setGeneratingStep('image');

      pollTaskStatus(taskId);
    } catch (error: any) {
      console.error('[SmartStoryboardNode] 生成失败:', error);
      clearTaskState(id);
      toast.error(error.message || '生成失败');
      setIsGenerating(false);
      setGeneratingStep(null);
    }
  };

  const pollTaskStatus = async (taskId: string) => {
    const maxAttempts = 300;
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await apiClient.tasks.getTaskStatus(taskId);
        const task = response.task;

        if (task.status === 'SUCCESS') {
          setIsGenerating(false);
          setGeneratingStep(null);
          clearTaskState(id); // 清除 localStorage 中的任务状态
          const imageUrl = task.resultUrl;

          if (!imageUrl) {
            toast.error('生成完成但未找到结果');
            return;
          }

          // 优先从 previewNodeData.allImageUrls 获取切片 URL（后端已解析）
          let slicedUrls: string[] | null = task.previewNodeData?.allImageUrls || null;
          let originalUrl = imageUrl;

          // 兼容旧逻辑：检查 resultUrl 是否是 JSON 格式
          if (!slicedUrls) {
            try {
              if (imageUrl.startsWith('{')) {
                const parsed = JSON.parse(imageUrl);
                if (parsed.slicedUrls && Array.isArray(parsed.slicedUrls)) {
                  slicedUrls = parsed.slicedUrls;
                  originalUrl = parsed.originalUrl || imageUrl;
                }
              }
            } catch (e) {
              // 不是 JSON，使用原始 URL
            }
          }

          // 下载原始图片和切片到本地
          const processedResult = await processTaskResult({
            taskId,
            resultUrl: originalUrl,
            type: 'IMAGE',
            allImageUrls: slicedUrls || undefined, // 传递切片 URL 一起下载
          });

          const displayUrl = processedResult.displayUrl;

          updateNodeData({
            generatedImageUrl: displayUrl,
            taskId: '',
            aspectRatio,
          });

          // 如果后端已切割，使用下载后的本地 URL
          if (slicedUrls && slicedUrls.length > 0) {
            // 使用下载后的本地 URL（如果有）
            const localSlicedUrls = processedResult.allDisplayUrls || slicedUrls;
            updateNodeData({ slicedImages: localSlicedUrls });
            toast.success(`成功生成 ${localSlicedUrls.length} 个分镜`);
            createAllPreviewNodes(localSlicedUrls, aspectRatio);
          } else if (autoSlice) {
            // 后端未切割，前端调用切割 API（兼容旧逻辑）
            await handleSliceAndCreatePreviews(displayUrl);
          } else {
            // 不切割，直接创建单个预览节点
            createSinglePreviewNodeNoSlice(displayUrl, aspectRatio);
          }

          toast.success('分镜生成完成！');
        } else if (task.status === 'FAILURE') {
          setIsGenerating(false);
          setGeneratingStep(null);
          clearTaskState(id); // 清除 localStorage 中的任务状态
          updateNodeData({ taskId: '' });
          toast.error(`生成失败: ${task.errorMessage || '未知错误'}`);
        } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(poll, 2000);
          } else {
            setIsGenerating(false);
            setGeneratingStep(null);
            clearTaskState(id); // 超时清除
            toast.error('生成超时，请重试');
          }
        }
      } catch (error: any) {
        setIsGenerating(false);
        setGeneratingStep(null);
        clearTaskState(id); // 错误时清除
        toast.error('查询任务状态失败');
      }
    };

    poll();
  };

  // 批量创建所有预览节点（一次性添加，九宫格排列）
  const createAllPreviewNodes = (slices: string[], ratio: string) => {
    const currentNode = getNode(id);
    if (!currentNode) return;

    const cols = 3;
    const gap = 20;
    const batchId = Date.now();
    const scale = 0.15;
    let nodeWidth: number;
    let nodeHeight: number;

    if (ratio === '16:9') {
      nodeWidth = Math.round(1835 * scale);
      nodeHeight = Math.round(1024 * scale);
    } else {
      nodeWidth = Math.round(1024 * scale);
      nodeHeight = Math.round(1835 * scale);
    }

    const baseX = currentNode.position.x + 350;
    const totalGridHeight = 3 * nodeHeight + 2 * gap;
    const baseY = currentNode.position.y - totalGridHeight / 2 + 150;

    const newNodes: any[] = [];
    const newEdges: any[] = [];

    slices.forEach((imageUrl, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;

      const newNode = {
        id: `${id}-slice-${batchId}-${index}`,
        type: 'imagePreview',
        position: {
          x: baseX + col * (nodeWidth + gap),
          y: baseY + row * (nodeHeight + gap),
        },
        data: {
          imageUrl,
          ratio,
          width: nodeWidth,
          height: nodeHeight,
          label: `分镜 ${index + 1}`,
          fromStoryboard: true,
          sourceNodeId: id,
          createdBy: currentNode.data.createdBy,
        },
      };

      const newEdge = {
        id: `edge-${id}-to-slice-${batchId}-${index}`,
        source: id,
        target: newNode.id,
        sourceHandle: `${id}-source`,
        type: 'aurora',
      };

      newNodes.push(newNode);
      newEdges.push(newEdge);
    });

    // 一次性添加所有节点和边
    setNodes((nodes) => [...nodes, ...newNodes]);
    setEdges((edges) => [...edges, ...newEdges]);

    // 立即触发保存
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('workflow:save'));
    }, 100);
  };

  const handleSliceAndCreatePreviews = async (imageUrl: string) => {
    try {
      toast('正在切割分镜图片...', { icon: '✂️' });

      // 调用后端 API 进行图片切割
      const res = await apiClient.post('/tenant/assets/slice-image', {
        imageUrl,
        rows: 3,
        cols: 3,
      });

      if (!res.success || !res.data?.urls) {
        throw new Error(res.message || '切割失败');
      }

      const savedUrls = res.data.urls as string[];
      updateNodeData({ slicedImages: savedUrls });
      toast.success(`成功生成 ${savedUrls.length} 个分镜`);

      // 创建预览节点
      createAllPreviewNodes(savedUrls, aspectRatio);
    } catch (error: any) {
      toast.error('图片切割失败: ' + error.message);
    }
  };

  // 创建单个预览节点（不切割时使用）
  const createSinglePreviewNodeNoSlice = (imageUrl: string, ratio: string) => {
    const currentNode = getNode(id);
    if (!currentNode) return;

    const batchId = Date.now();
    const newNode = {
      id: `${id}-preview-${batchId}`,
      type: 'imagePreview',
      position: {
        x: currentNode.position.x + 350,
        y: currentNode.position.y,
      },
      data: {
        imageUrl,
        ratio,
        label: '分镜结果',
        fromStoryboard: true,
        sourceNodeId: id,
        createdBy: currentNode.data.createdBy,
      },
    };

    const newEdge = {
      id: `edge-${id}-to-preview-${batchId}`,
      source: id,
      target: newNode.id,
      sourceHandle: `${id}-source`,
      type: 'aurora',
    };

    setNodes((nodes) => [...nodes, newNode]);
    setEdges((edges) => [...edges, newEdge]);

    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('workflow:save'));
    }, 100);
  };

  return (
    <div
      className={`relative bg-white/80 dark:bg-[#18181b]/100 dark:backdrop-blur-none backdrop-blur-sm border rounded-2xl shadow-xl transition-all ring-1 ${
        selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-white/60 dark:border-neutral-700 ring-black/5 dark:ring-neutral-700 ring-black/5'
      }`}
      style={{ width: 320 }}
    >
      {/* 输入连接点 - 节点外部左侧 */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none">
        <Handle
          type="target"
          position={Position.Left}
          id={`${id}-input`}
          style={{ position: 'relative', left: '-6px', transform: 'none' }}
          className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair pointer-events-auto !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
        />
      </div>

      {/* 输出连接点 - 右侧 */}
      <Handle
        type="source"
        position={Position.Right}
        id={`${id}-source`}
        className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
        style={{ right: -6, top: '50%' }}
      />

      {/* 节点头部 - Aurora渐变样式 */}
      <div className="flex items-center justify-between px-4 py-3 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 0, "wght" 200, "GRAD" 0, "opsz" 20' }}>grid_view</span>
          <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-white">智能分镜</span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse shadow-[0_0_5px_currentColor]"></div>
      </div>

      {/* 节点内容 */}
      <div className="p-4 space-y-4">
        {/* 输入图片预览 - 支持多图，带编号 */}
        {inputImages.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">
              参考图片 ({inputImages.length}/{MAX_INPUT_IMAGES})
            </div>
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: 'repeat(5, 1fr)',
                width: '100%'
              }}
            >
              {inputImages.map((imgUrl, index) => (
                <div
                  key={index}
                  className="nodrag relative group aspect-square"
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

        {/* 剧情简述输入 */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">剧情简述</label>
          <textarea
            value={userPrompt}
            onChange={(e) => {
              setUserPrompt(e.target.value);
              updateNodeData({ userPrompt: e.target.value });
            }}
            placeholder="请输入剧情简述，描述故事情节、角色动作等..."
            className="nodrag w-full h-20 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-[#000000] backdrop-blur-none text-slate-700 dark:text-white/90 placeholder-slate-400 dark:placeholder-neutral-500 resize-none focus:outline-none focus:ring-1 focus:ring-neutral-500"
            disabled={data._canEdit === false}
          />
        </div>

        {/* 图片风格输入 */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">图片风格</label>
          <input
            type="text"
            value={imageStyle}
            onChange={(e) => {
              setImageStyle(e.target.value);
              updateNodeData({ imageStyle: e.target.value });
            }}
            placeholder="如：赛博朋克、水彩画、日系动漫..."
            className="nodrag w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-[#000000] backdrop-blur-none text-slate-700 dark:text-white/90 placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            disabled={data._canEdit === false}
          />
        </div>

        {/* 宽高比 */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">宽高比</label>
          <div className="grid grid-cols-2 gap-1">
            {ASPECT_RATIOS.map((r) => (
              <button
                key={r}
                onClick={() => {
                  setAspectRatio(r);
                  updateNodeData({ aspectRatio: r });
                }}
                className={`nodrag py-1.5 rounded-lg text-[9px] font-medium transition-colors border ${
                  aspectRatio === r
                    ? 'bg-neutral-800 dark:bg-white text-white dark:text-black border-transparent dark:border-neutral-700'
                    : 'bg-slate-100 dark:bg-[#000000] backdrop-blur-none text-slate-700 dark:text-neutral-300 border-slate-200 dark:border-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-800'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* 自动切割开关 */}
        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">自动切割九宫格</label>
          <button
            type="button"
            onClick={() => {
              const newValue = !autoSlice;
              setAutoSlice(newValue);
              updateNodeData({ autoSlice: newValue });
            }}
            className={`nodrag relative w-10 h-5 rounded-full transition-colors ${
              autoSlice ? 'bg-neutral-800 dark:bg-white' : 'bg-slate-300 dark:bg-white/20'
            }`}
            disabled={data._canEdit === false}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full shadow transition-transform ${
                autoSlice ? 'translate-x-5 bg-white dark:bg-black' : 'translate-x-0.5 bg-white'
              }`}
            />
          </button>
        </div>

        {/* 生成按钮 - Aurora样式 */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleGenerate();
          }}
          disabled={isGenerating || inputImages.length === 0 || data._canEdit === false}
          className={`nodrag w-full mt-2 py-2 text-[10px] font-bold rounded-lg border transition-all active:scale-95 flex items-center justify-center gap-2 ${
            isGenerating || inputImages.length === 0 || data._canEdit === false
              ? 'bg-neutral-400 dark:bg-neutral-700 text-white dark:text-neutral-300 cursor-not-allowed border-transparent dark:border-neutral-700'
              : 'bg-neutral-800 dark:bg-white text-white dark:text-black shadow-md hover:shadow-lg border-transparent dark:border-neutral-700'
          }`}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{generatingStep === 'text' ? '分析剧情中...' : '生成分镜中...'}</span>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-sm">grid_view</span>
              <span>智能分镜</span>
              {!creditsLoading && credits !== null && credits > 0 && (
                <span className="ml-1 text-[9px] opacity-70">{credits}积分</span>
              )}
            </>
          )}
        </button>

        {/* 生成状态提示 */}
        {data.config.slicedImages && data.config.slicedImages.length > 0 && (
          <div className="text-center py-1">
            <span className="text-[10px] text-green-600 dark:text-green-400">✓ 已生成 {data.config.slicedImages.length} 个分镜</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(SmartStoryboardNode);
