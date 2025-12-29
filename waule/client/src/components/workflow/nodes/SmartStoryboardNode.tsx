import { useState, useEffect, useMemo, memo, useRef } from 'react';
import { NodeProps, useReactFlow, useStore, Handle, Position } from 'reactflow';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '../../../lib/api';
import { processImageUrl } from '../../../utils/imageUtils';
import { processTaskResult } from '../../../utils/taskResultHandler';
import { sliceImageGrid, base64ToBlob } from '../../../utils/imageGridSlicer';
import { useBillingEstimate } from '../../../hooks/useBillingEstimate';

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
const TEXT_MODEL_ID = 'gemini-3-pro-preview'; // 第一步：文字生成
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

  // 积分估算
  const { credits, loading: creditsLoading, isFreeUsage, freeUsageRemaining } = useBillingEstimate({
    nodeType: 'smart_storyboard',
    quantity: 1,
  });

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

  const { setNodes, setEdges, getNode, getNodes } = useReactFlow();

  // 使用 ref 存储函数引用，解决 useEffect 闭包问题
  const handleSliceAndCreatePreviewsRef = useRef<((imageUrl: string) => Promise<void>) | null>(null);
  const createSinglePreviewNodeRef = useRef<((imageUrl: string, ratio: string) => void) | null>(null);
  const updateNodeDataRef = useRef<((updates: Partial<SmartStoryboardNodeData['config']>) => void) | null>(null);
  const pollTaskStatusRef = useRef<((taskId: string) => void) | null>(null);
  const getNodesRef = useRef<typeof getNodes>(getNodes);
  const autoSliceRef = useRef(autoSlice);

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

  // 任务恢复逻辑（使用 ref 解决闭包问题）
  useEffect(() => {
    const initialTaskId = data.config.taskId;

    const recoverTask = async () => {
      if (!initialTaskId) return;
      try {
        const response = await apiClient.tasks.getTaskStatus(initialTaskId);
        const task = response.task;

        if (task.status === 'SUCCESS') {
          setIsGenerating(false);
          setGeneratingStep(null);
          const imageUrl = task.resultUrl;
          
          if (!imageUrl) {
            updateNodeDataRef.current?.({ taskId: '' });
            return;
          }

          const processedResult = await processTaskResult({
            taskId: initialTaskId,
            resultUrl: imageUrl,
            type: 'IMAGE',
          });

          const displayUrl = processedResult.displayUrl;
          
          updateNodeDataRef.current?.({
            generatedImageUrl: displayUrl,
            taskId: '',
          });

          // 检查是否已有预览节点
          const existingNodes = getNodesRef.current();
          const hasPreviewNodes = existingNodes.some(
            (n: any) => n.data?.sourceNodeId === id && n.type === 'imagePreview'
          );

          if (!hasPreviewNodes) {
            if (autoSliceRef.current && handleSliceAndCreatePreviewsRef.current) {
              await handleSliceAndCreatePreviewsRef.current(displayUrl);
            } else if (createSinglePreviewNodeRef.current) {
              createSinglePreviewNodeRef.current(displayUrl, data.config.aspectRatio || '16:9');
            }
          }
          
          toast.success('分镜生成已完成！');
        } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
          setIsGenerating(true);
          setGeneratingStep('image');
          setTimeout(() => {
            pollTaskStatusRef.current?.(initialTaskId);
          }, 100);
        } else if (task.status === 'FAILURE') {
          setIsGenerating(false);
          setGeneratingStep(null);
          updateNodeDataRef.current?.({ taskId: '' });
          toast.error(`生成失败: ${task.errorMessage || '未知错误'}`);
        }
      } catch (error: any) {
        setIsGenerating(false);
        setGeneratingStep(null);
        updateNodeDataRef.current?.({ taskId: '' });
        toast.error('任务恢复失败，请重新生成');
      }
    };

    // 延迟执行，确保 ref 已设置
    const timer = setTimeout(recoverTask, 200);
    return () => clearTimeout(timer);
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

  // 设置 ref
  updateNodeDataRef.current = updateNodeData;
  getNodesRef.current = getNodes;
  autoSliceRef.current = autoSlice;

  const handleGenerate = async () => {
    if (inputImages.length === 0) {
      toast.error('请先连接至少一张图片');
      return;
    }

    if (!userPrompt.trim()) {
      toast.error('请输入剧情简述');
      return;
    }

    setIsGenerating(true);
    setGeneratingStep('text');

    try {
      // 处理所有输入图片（使用URL而非base64）
      const processedImages = await Promise.all(
        inputImages.map(img => processImageUrl(img, { skipCompression: true }))
      );

      // 从后台获取配置的提示词
      let systemPrompt = '你是一个专业的分镜师，根据用户提供的图片和剧情简述，生成详细的9个分镜描述。每个分镜应包含场景、动作、镜头角度等信息。';
      let imagePrompt = '根据以下分镜描述和参考图片，生成3x3的九宫格分镜图，每个格子展示一个分镜场景，保持角色和风格一致，使用细黑边框分隔每个画面。';
      
      try {
        const res = await apiClient.get('/node-prompts/type/smartStoryboard');
        if (res.success && res.data) {
          if (res.data.systemPrompt) {
            systemPrompt = res.data.systemPrompt;
          }
          if (res.data.userPromptTemplate) {
            imagePrompt = res.data.userPromptTemplate;
          }
        }
      } catch (e) {
        console.log('[SmartStoryboardNode] 使用默认提示词');
      }

      // 替换提示词中的变量
      const replaceVariables = (template: string) => {
        return template
          .replace(/\{\{userPrompt\}\}/g, userPrompt)
          .replace(/\{\{imageStyle\}\}/g, imageStyle || '')
          .replace(/\{\{aspectRatio\}\}/g, aspectRatio);
      };
      
      systemPrompt = replaceVariables(systemPrompt);
      imagePrompt = replaceVariables(imagePrompt);

      // ========== 第一步：调用文字模型生成分镜描述 ==========

      const textResponse = await apiClient.ai.text.generate({
        modelId: TEXT_MODEL_ID,
        systemPrompt: systemPrompt,
        prompt: userPrompt,
        imageUrls: processedImages,
        skipBilling: true,  // 跳过第一步的扣费，只在第二步扣费
      });

      if (!textResponse.success) {
        throw new Error(textResponse.message || '文字生成失败');
      }
      
      // 兼容不同响应格式
      const generatedText = textResponse.data?.text || textResponse.data?.content || textResponse.content;
      if (!generatedText || typeof generatedText !== 'string') {
        throw new Error('文字生成返回为空');
      }

      // ========== 第二步：调用图片模型生成9宫格 ==========
      setGeneratingStep('image');

      if (!selectedModel) {
        toast.error('图片模型未加载，请稍后重试');
        setIsGenerating(false);
        setGeneratingStep(null);
        return;
      }

      // 组合最终的图片生成提示词
      const finalImagePrompt = `${imagePrompt}\n\n分镜描述：\n${generatedText}\n\n生成${aspectRatio}比例的图片`;

      const response = await apiClient.tasks.createImageTask({
        modelId: selectedModel.id,
        prompt: finalImagePrompt,
        ratio: aspectRatio,
        referenceImages: processedImages,
        sourceNodeId: id,
        metadata: {
          imageSize: '4K',
          nodeType: 'smart_storyboard'  // 用于计费识别
        },
      });

      if (!response.success) {
        throw new Error(response.message || '创建图片任务失败');
      }

      const taskId = response.taskId;
      const creditsCharged = response.creditsCharged || 0;
      updateNodeData({ taskId, userPrompt });

      // 刷新用户积分
      if (creditsCharged > 0) {
        const { useAuthStore } = await import('../../../store/authStore');
        const { refreshUser } = useAuthStore.getState();
        await refreshUser();
      }

      // 触发工作流保存，确保刷新页面后能恢复任务
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('workflow:save'));
      }, 500);

      pollTaskStatus(taskId);
    } catch (error: any) {
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
          const imageUrl = task.resultUrl;

          if (!imageUrl) {
            toast.error('生成完成但未找到结果');
            return;
          }

          const processedResult = await processTaskResult({
            taskId,
            resultUrl: imageUrl,
            type: 'IMAGE',
          });

          const displayUrl = processedResult.displayUrl;

          updateNodeData({
            generatedImageUrl: displayUrl,
            taskId: '',
            aspectRatio,
          });

          // 根据自动切割开关决定是否切割
          if (autoSlice) {
            await handleSliceAndCreatePreviews(displayUrl);
          } else {
            // 不切割，直接创建单个预览节点
            createSinglePreviewNode(displayUrl, aspectRatio);
          }

          toast.success('分镜生成完成！');
        } else if (task.status === 'FAILURE') {
          setIsGenerating(false);
          setGeneratingStep(null);
          updateNodeData({ taskId: '' });
          toast.error(`生成失败: ${task.errorMessage || '未知错误'}`);
        } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(poll, 2000);
          } else {
            setIsGenerating(false);
            setGeneratingStep(null);
            toast.error('生成超时，请重试');
          }
        }
      } catch (error: any) {
        setIsGenerating(false);
        setGeneratingStep(null);
        toast.error('查询任务状态失败');
      }
    };

    poll();
  };

  // 设置 ref
  pollTaskStatusRef.current = pollTaskStatus;

  const handleSliceAndCreatePreviews = async (imageUrl: string) => {
    try {
      // 先将远程图片转换为base64以避免CORS问题
      let imageToSlice = imageUrl;
      if (!imageUrl.startsWith('data:')) {
        try {
          const proxyResponse = await apiClient.assets.proxyDownload(imageUrl);
          const blob = new Blob([proxyResponse], { type: 'image/png' });
          imageToSlice = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (fetchError) {
          // 代理下载失败，尝试直接切割
        }
      }

      // 固定3x3九宫格
      const result = await sliceImageGrid(imageToSlice, 3, 3);

      // 并行上传所有切片到服务器
      const TIMEOUT_MS = 30000; // 30秒超时

      toast.info(`开始上传 ${result.slices.length} 个分镜...`);

      // 创建所有上传任务
      const uploadTasks = result.slices.map(async (base64, i) => {
        try {
          const blob = base64ToBlob(base64, 'image/png');
          const fileName = `storyboard_${id}_slice_${i + 1}_${Date.now()}.png`;
          const file = new File([blob], fileName, { type: 'image/png' });

          const uploadPromise = apiClient.assets.upload(file);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('上传超时')), TIMEOUT_MS)
          );

          const uploadResult = await Promise.race([uploadPromise, timeoutPromise]) as any;

          if (uploadResult.success && uploadResult.data?.url) {
            return { success: true, url: uploadResult.data.url, index: i + 1 };
          } else {
            console.error(`分镜 ${i + 1} 上传失败:`, uploadResult.message);
            return { success: false, index: i + 1, error: uploadResult.message };
          }
        } catch (error: any) {
          console.error(`分镜 ${i + 1} 处理失败:`, error);
          return { success: false, index: i + 1, error: error.message };
        }
      });

      // 并行执行所有上传任务
      const results = await Promise.all(uploadTasks);

      // 收集成功上传的URL和失败的索引
      const savedUrls: string[] = [];
      const failedIndexes: number[] = [];

      results.forEach(result => {
        if (result.success && result.url) {
          savedUrls.push(result.url);
        } else {
          failedIndexes.push(result.index);
        }
      });

      updateNodeData({ slicedImages: savedUrls });

      if (failedIndexes.length > 0) {
        toast.error(`分镜 ${failedIndexes.join(', ')} 上传失败`);
      } else {
        toast.success(`成功生成 ${savedUrls.length} 个分镜`);
      }

      // 只为成功上传的图片创建预览节点
      createAllPreviewNodes(savedUrls, aspectRatio);
    } catch (error: any) {
      toast.error('图片切割失败: ' + error.message);
    }
  };

  // 设置 ref
  handleSliceAndCreatePreviewsRef.current = handleSliceAndCreatePreviews;

  // 创建单个预览节点（不切割时使用）
  const createSinglePreviewNode = (imageUrl: string, ratio: string) => {
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

  // 设置 ref
  createSinglePreviewNodeRef.current = createSinglePreviewNode;

  // 批量创建所有预览节点（一次性添加，避免状态覆盖）
  const createAllPreviewNodes = (slices: string[], ratio: string) => {
    const currentNode = getNode(id);
    if (!currentNode) return;

    const nodeHeight = 220;  // 每个预览节点的高度
    const gap = 20;          // 节点之间的间距
    const batchId = Date.now(); // 唯一批次ID

    // 起始位置：在当前节点右侧，垂直居中对齐
    const baseX = currentNode.position.x + 350;
    const totalHeight = slices.length * nodeHeight + (slices.length - 1) * gap;
    const baseY = currentNode.position.y - totalHeight / 2 + 150;

    const newNodes: any[] = [];
    const newEdges: any[] = [];

    slices.forEach((imageUrl, index) => {
      const newNode = {
        id: `${id}-slice-${batchId}-${index}`,
        type: 'imagePreview',
        position: {
          x: baseX,
          y: baseY + index * (nodeHeight + gap),
        },
        data: {
          imageUrl,
          ratio,
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

    // 立即触发保存，确保预览节点被持久化（避免刷新页面后丢失）
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('workflow:save'));
    }, 100);
  };

  return (
    <div
      className={`relative bg-white dark:bg-[#18181b] backdrop-blur-xl border rounded-2xl shadow-xl transition-all ring-1 ${
        selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-white/60 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'
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
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">
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

        {/* 剧情简述输入 */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">剧情简述</label>
          <textarea
            value={userPrompt}
            onChange={(e) => {
              setUserPrompt(e.target.value);
              updateNodeData({ userPrompt: e.target.value });
            }}
            placeholder="请输入剧情简述，描述故事情节、角色动作等..."
            className="nodrag w-full h-20 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-700 dark:text-white/90 placeholder-slate-400 dark:placeholder-white/30 resize-none focus:outline-none focus:ring-1 focus:ring-neutral-500"
            disabled={data._canEdit === false}
          />
        </div>

        {/* 图片风格输入 */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">图片风格</label>
          <input
            type="text"
            value={imageStyle}
            onChange={(e) => {
              setImageStyle(e.target.value);
              updateNodeData({ imageStyle: e.target.value });
            }}
            placeholder="如：赛博朋克、水彩画、日系动漫..."
            className="nodrag w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-700 dark:text-white/90 placeholder-slate-400 dark:placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            disabled={data._canEdit === false}
          />
        </div>

        {/* 宽高比 */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">宽高比</label>
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
                    ? 'bg-neutral-800 dark:bg-white text-white dark:text-black text-white border-transparent dark:border-white/10'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-white/70 border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* 自动切割开关 */}
        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">自动切割九宫格</label>
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
          disabled={isGenerating}
          className={`nodrag w-full mt-2 py-2 text-[10px] font-bold rounded-lg border transition-all flex items-center justify-center gap-2 ${
            isGenerating
              ? 'bg-neutral-800 dark:bg-white text-white dark:text-black cursor-not-allowed border-transparent'
              : 'bg-neutral-800 dark:bg-white text-white dark:text-black shadow-md hover:shadow-lg border-transparent dark:border-white/10 active:scale-95'
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
