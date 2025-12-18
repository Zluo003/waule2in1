import { memo, useState, useEffect, useRef, useMemo } from 'react';
import { Handle, Position, NodeProps, useReactFlow, useStore } from 'reactflow';
import { toast } from 'react-hot-toast';
import { Loader2, Sparkles } from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { processImageUrl } from '../../../utils/imageUtils';
import { processTaskResult } from '../../../utils/taskResultHandler';
import { sliceImageGrid, getGridDimensions } from '../../../utils/imageGridSlicer';
import { useBillingEstimate } from '../../../hooks/useBillingEstimate';
import NodeCreatorBadge from '../NodeCreatorBadge';

type GenerationMode = 'single' | 'grid2x2' | 'grid3x3';

interface ImageFusionNodeData {
  label: string;
  type: string;
  config: {
    modelId?: string;
    mode?: GenerationMode;
    aspectRatio?: string;
    imageSize?: string;
    userPrompt?: string;
    characterImages?: string[];
    sceneImages?: string[];
    styleImage?: string;
    generatedImageUrl?: string;
    slicedImages?: string[];
    taskId?: string;
  };
  models?: any[];
  promptTemplate?: {
    systemPrompt?: string;
    userPromptTemplate?: string;
    enhancePromptTemplate?: string;
  };
  isExpanded?: boolean;
  createdBy?: { id: string; nickname?: string; avatar?: string } | string;
  _isSharedWorkflow?: boolean;
  _canEdit?: boolean;
  _isGrouped?: boolean;
}

const ImageFusionNode = ({ data, selected, id }: NodeProps<ImageFusionNodeData>) => {
  const [selectedModel, setSelectedModel] = useState<any>(null);
  const mode: GenerationMode = 'single'; // 固定单图模式
  const [aspectRatio, setAspectRatio] = useState(data.config.aspectRatio || '16:9');
  const [imageSize, setImageSize] = useState(data.config.imageSize || '4K');
  const [userPrompt, setUserPrompt] = useState(data.config.userPrompt || '');
  // 如果有未完成的taskId，初始化为生成中状态
  const [isGenerating, setIsGenerating] = useState(!!data.config.taskId);

  const [characterImages, setCharacterImages] = useState<string[]>(data.config.characterImages || []);
  const [sceneImages, setSceneImages] = useState<string[]>(data.config.sceneImages || []);
  const [styleImage, setStyleImage] = useState<string | undefined>(data.config.styleImage);

  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { setNodes, setEdges, getNode, getNodes, getEdges } = useReactFlow();

  const connectedEdges = useStore((state) =>
    state.edges.filter((edge) => edge.target === id)
  );
  
  // 检查是否已有场景/风格连接（使用useStore保证响应式）
  const hasSceneConnection = useStore((state) =>
    state.edges.some((e) => e.target === id && e.targetHandle === `${id}-scene-input`)
  );
  const hasStyleConnection = useStore((state) =>
    state.edges.some((e) => e.target === id && e.targetHandle === `${id}-style-input`)
  );

  const lastEdgesRef = useRef<string>('');

  const { credits, loading: creditsLoading, isFreeUsage, freeUsageRemaining } = useBillingEstimate({
    aiModelId: selectedModel?.id,
    quantity: 1,
    resolution: imageSize,
  });

  // 固定使用 gemini-3-pro-image-preview 模型
  const FIXED_MODEL_ID = 'gemini-3-pro-image-preview';
  
  const targetModel = useMemo(() => {
    const models = data.models || [];
    return models.find((m: any) => m.modelId === FIXED_MODEL_ID) || 
           models.find((m: any) => m.modelId?.includes('gemini')) ||
           models[0];
  }, [data.models]);

  useEffect(() => {
    if (targetModel) {
      setSelectedModel(targetModel);
    }
  }, [targetModel]);

  // 页面加载时恢复进行中的任务（只运行一次）
  useEffect(() => {
    const initialTaskId = data.config.taskId;
    const savedGeneratedImageUrl = data.config.generatedImageUrl;

    console.log('[StoryboardMasterNode] 初始化检查:', { 
      taskId: initialTaskId, 
      hasGeneratedImage: !!savedGeneratedImageUrl,
      nodeId: id 
    });

    const recoverTask = async () => {
      // 如果没有taskId，不需要恢复
      if (!initialTaskId) {
        console.log('[StoryboardMasterNode] 无taskId，跳过恢复');
        return;
      }

      // 有taskId就需要检查任务状态（一个节点可能多次生成）
      console.log('[StoryboardMasterNode] 恢复任务查询:', initialTaskId);
      try {
          const response = await apiClient.tasks.getTaskStatus(initialTaskId);
          const task = response.task;

          if (task.status === 'SUCCESS') {
            // 任务已完成，直接处理结果
            setIsGenerating(false);

            const imageUrl = task.resultUrl;
            if (!imageUrl) {
              updateNodeData({ taskId: '' });
              toast.error('任务完成但未找到结果');
              return;
            }

            // 如果已有保存的本地 URL，优先使用
            let displayUrl = imageUrl;
            if (savedGeneratedImageUrl) {
              console.log('[StoryboardMasterNode] 使用已保存的本地 URL');
              displayUrl = savedGeneratedImageUrl;
            } else {
              // 处理任务结果
              const processedResult = await processTaskResult({
                taskId: initialTaskId,
                resultUrl: imageUrl,
                type: 'IMAGE',
              });
              displayUrl = processedResult.displayUrl;
            }

            updateNodeData({
              generatedImageUrl: displayUrl,
              taskId: '', // 清除taskId，任务已完成
            });

            // 检查是否已存在预览节点（防止重复创建）
            const allNodes = getNodes();
            const allEdges = getEdges();
            const connectedPreviewNodes = allNodes.filter((node: any) => {
              return node.type === 'imagePreview' && allEdges.some((edge: any) =>
                edge.source === id && edge.target === node.id
              );
            });

            const existingNode = connectedPreviewNodes.find((node: any) => 
              node.data.imageUrl === displayUrl || node.data.imageUrl === imageUrl
            );
            if (existingNode) {
              toast.success('图片生成已完成！');
              return;
            }

            toast.success('图片生成已完成！');
            createPreviewNode(displayUrl, aspectRatio, 0);

          } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
            // 任务仍在进行中，恢复轮询
            setIsGenerating(true);
            pollTaskStatus(initialTaskId);
          } else if (task.status === 'FAILURE') {
            // 任务失败
            setIsGenerating(false);
            updateNodeData({ taskId: '' });
            toast.error(`生成失败: ${task.errorMessage || '未知错误'}`);
          }
        } catch (error: any) {
          setIsGenerating(false);
          updateNodeData({ taskId: '' });
          toast.error('任务恢复失败，请重新生成');
        }
    };

    recoverTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时执行一次

  // 初始化textarea高度
  useEffect(() => {
    if (promptTextareaRef.current && userPrompt) {
      const textarea = promptTextareaRef.current;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, []);

  const updateNodeData = (updates: Partial<ImageFusionNodeData['config']>) => {
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

  useEffect(() => {
    const edgesKey = JSON.stringify(connectedEdges.map(e => ({ source: e.source, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })));
    if (edgesKey === lastEdgesRef.current) return;
    lastEdgesRef.current = edgesKey;

    const newCharacterImages: string[] = [];
    const newSceneImages: string[] = [];
    let newStyleImage: string | undefined = undefined;

    connectedEdges.forEach((edge) => {
      const sourceNode = getNode(edge.source);
      if (!sourceNode) return;

      const targetHandle = edge.targetHandle || '';
      const images = extractImagesFromNode(sourceNode);

      if (targetHandle.includes('character')) {
        newCharacterImages.push(...images);
      } else if (targetHandle.includes('scene')) {
        // 场景图限制1张，只取第一张
        if (newSceneImages.length === 0 && images.length > 0) {
          newSceneImages.push(images[0]);
        }
      } else if (targetHandle.includes('style')) {
        if (images.length > 0) {
          newStyleImage = images[0];
        }
      }
    });

    setCharacterImages(newCharacterImages);
    setSceneImages(newSceneImages);
    setStyleImage(newStyleImage);
    updateNodeData({
      characterImages: newCharacterImages,
      sceneImages: newSceneImages,
      styleImage: newStyleImage,
    });
  }, [connectedEdges, getNode]);

  const extractImagesFromNode = (node: any): string[] => {
    const nodeType = node?.type || '';
    const nodeData = node?.data;

    if (nodeType === 'upload' && nodeData?.config?.uploadedFiles) {
      return nodeData.config.uploadedFiles
        .filter((f: any) => f.type === 'IMAGE' || f.mimeType?.startsWith('image/'))
        .map((f: any) => f.url || f.localUrl);
    }

    if (nodeType === 'assetSelector' && nodeData?.config?.selectedAsset) {
      const asset = nodeData.config.selectedAsset;
      if (asset.type === 'IMAGE' || asset.mimeType?.startsWith('image/')) {
        return [asset.url];
      }
    }

    if (nodeType === 'imagePreview' && nodeData?.imageUrl) {
      return [nodeData.imageUrl];
    }

    if (nodeType === 'aiImage' && nodeData?.config?.generatedImageUrl) {
      return [nodeData.config.generatedImageUrl];
    }

    return [];
  };

  // 提示词构建 - 用户输入 + 风格图提示 + 比例提示
  const buildPrompt = (): string => {
    let prompt = userPrompt;
    
    // 如果有风格图，追加风格提示词
    // 风格图编号 = 角色图数量 + 场景图数量 + 1
    if (styleImage) {
      const styleIndex = characterImages.length + sceneImages.length + 1;
      prompt += `，参考图片${styleIndex}的色调与风格，不允许使用图片${styleIndex}的场景，所有元素保持合理的尺寸与比例`;
    }
    
    // 追加图片比例提示词
    prompt += `，生成${aspectRatio}比例的图片`;
    
    return prompt;
  };

  const handleGenerate = async () => {
    if (!userPrompt.trim()) {
      toast.error('请输入场景描述');
      return;
    }

    if (!selectedModel) {
      toast.error('请选择模型');
      return;
    }

    setIsGenerating(true);

    try {
      const finalPrompt = buildPrompt();
      const allReferenceImages = [
        ...characterImages,
        ...sceneImages,
        ...(styleImage ? [styleImage] : []),
      ];

      const processedImages = await Promise.all(
        allReferenceImages.map(async (url) => {
          try {
            return await processImageUrl(url);
          } catch {
            return url;
          }
        })
      );

      const response = await apiClient.tasks.createImageTask({
        modelId: selectedModel.id,
        prompt: finalPrompt,
        ratio: aspectRatio,
        imageSize: imageSize,
        referenceImages: processedImages.filter(Boolean),
        sourceNodeId: id,
      });

      if (!response.success) {
        throw new Error(response.message || '创建任务失败');
      }

      const taskId = response.taskId;
      updateNodeData({ taskId });

      pollTaskStatus(taskId);
    } catch (error: any) {
      console.error('[StoryboardMasterNode] 生成失败:', error);
      toast.error(error.message || '生成失败');
      setIsGenerating(false);
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
            modelId: selectedModel?.id,
            mode,
            aspectRatio,
            imageSize,
            userPrompt,
          });

          if (mode !== 'single') {
            await handleSliceAndCreatePreviews(displayUrl);
          } else {
            createPreviewNode(displayUrl, aspectRatio, 0);
          }

          toast.success('图片生成完成！');
        } else if (task.status === 'FAILURE') {
          setIsGenerating(false);
          updateNodeData({ taskId: '' });
          toast.error(`生成失败: ${task.errorMessage || '未知错误'}`);
        } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(poll, 2000);
          } else {
            setIsGenerating(false);
            toast.error('生成超时，请重试');
          }
        }
      } catch (error: any) {
        setIsGenerating(false);
        toast.error('查询任务状态失败');
      }
    };

    poll();
  };

  const handleSliceAndCreatePreviews = async (imageUrl: string) => {
    try {
      const { rows, cols } = getGridDimensions(mode);
      const result = await sliceImageGrid(imageUrl, rows, cols);

      updateNodeData({ slicedImages: result.slices });

      result.slices.forEach((sliceUrl, index) => {
        createPreviewNode(sliceUrl, aspectRatio, index);
      });
    } catch (error: any) {
      console.error('[StoryboardMasterNode] 切割失败:', error);
      toast.error('图片切割失败: ' + error.message);
    }
  };

  const createPreviewNode = (imageUrl: string, ratio: string, index: number) => {
    const currentNode = getNode(id);
    if (!currentNode) return;

    const { rows, cols } = getGridDimensions(mode);
    const totalImages = rows * cols;

    const nodeWidth = 280;
    const nodeHeight = 320;
    const gap = 20;

    const colIndex = index % cols;
    const rowIndex = Math.floor(index / cols);

    const baseX = currentNode.position.x + 400;
    const baseY = currentNode.position.y - ((totalImages - 1) * (nodeHeight + gap)) / 2;

    const newNode = {
      id: `${id}-preview-${index}-${Date.now()}`,
      type: 'imagePreview',
      position: {
        x: baseX + colIndex * (nodeWidth + gap),
        y: baseY + rowIndex * (nodeHeight + gap),
      },
      data: {
        imageUrl,
        ratio,
        label: `溶图 ${index + 1}`,
        fromStoryboard: true,
        sourceNodeId: id,
      },
    };

    const newEdge = {
      id: `edge-${id}-to-${newNode.id}`,
      source: id,
      target: newNode.id,
      sourceHandle: `${id}-source`,
      type: 'aurora',
    };

    setNodes((nodes) => [...nodes, newNode]);
    setEdges((edges) => [...edges, newEdge]);
  };

  
  const totalInputImages = characterImages.length + sceneImages.length + (styleImage ? 1 : 0);

  return (
    <div
      className={`relative bg-white/80 dark:bg-[#18181b]/100 dark:backdrop-blur-none backdrop-blur-sm border rounded-2xl shadow-xl transition-all ring-1 ${
        selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-white/60 dark:border-neutral-700 ring-black/5 dark:ring-neutral-700 ring-black/5'
      }`}
      style={{ width: 320 }}
    >
      {/* 角色输入 - 节点外部左侧 */}
      <div className="absolute left-0 top-[25%] -translate-x-full flex items-center gap-1 pointer-events-none">
        <span className="text-xs text-slate-800 dark:text-white whitespace-nowrap">
          角色 {characterImages.length > 0 && `(${characterImages.length})`}
        </span>
        <Handle
          type="target"
          position={Position.Left}
          id={`${id}-character-input`}
          style={{ position: 'relative', left: '8px', transform: 'none' }}
          className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair pointer-events-auto !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
        />
      </div>

      {/* 场景输入 - 节点外部左侧 */}
      <div className="absolute left-0 top-[50%] -translate-x-full flex items-center gap-1 pointer-events-none">
        <span className="text-xs text-slate-800 dark:text-white whitespace-nowrap">
          场景 {sceneImages.length > 0 ? '✓' : ''}
        </span>
        <Handle
          type="target"
          position={Position.Left}
          id={`${id}-scene-input`}
          style={{ position: 'relative', left: '8px', transform: 'none' }}
          className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair pointer-events-auto !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
          isValidConnection={() => !hasSceneConnection}
        />
      </div>

      {/* 风格输入 - 节点外部左侧 */}
      <div className="absolute left-0 top-[75%] -translate-x-full flex items-center gap-1 pointer-events-none">
        <span className="text-xs text-slate-800 dark:text-white whitespace-nowrap">
          风格 {styleImage ? '✓' : ''}
        </span>
        <Handle
          type="target"
          position={Position.Left}
          id={`${id}-style-input`}
          style={{ position: 'relative', left: '8px', transform: 'none' }}
          className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair pointer-events-auto !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
          isValidConnection={() => !hasStyleConnection}
        />
      </div>

      {/* 节点头部 - Aurora渐变样式 */}
      <div className="flex items-center justify-between px-4 py-3 rounded-t-2xl border-slate-200 dark:border-neutral-800 bg-white dark:bg-[#18181b]">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 0, "wght" 200, "GRAD" 0, "opsz" 20' }}>auto_awesome</span>
          <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-white">智能溶图</span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse shadow-[0_0_5px_currentColor]"></div>
      </div>

      {/* 创建者标记 */}
      {data._isSharedWorkflow && data.createdBy && (
        <NodeCreatorBadge createdBy={data.createdBy} />
      )}

      {/* 节点内容 */}
      <div className="p-4 space-y-4">
        {/* 输入图片缩略图（带编号） */}
        {totalInputImages > 0 && (
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">
              参考图片 ({totalInputImages})
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {(() => {
                let imageIndex = 1;
                const allImages: { url: string; type: 'char' | 'scene' | 'style'; index: number }[] = [];
                
                // 按顺序添加：角色图 -> 场景图 -> 风格图
                characterImages.forEach((url) => {
                  allImages.push({ url, type: 'char', index: imageIndex++ });
                });
                sceneImages.forEach((url) => {
                  allImages.push({ url, type: 'scene', index: imageIndex++ });
                });
                if (styleImage) {
                  allImages.push({ url: styleImage, type: 'style', index: imageIndex++ });
                }
                
                return allImages.map((img) => (
                  <div
                    key={`${img.type}-${img.index}`}
                    className="relative w-12 h-12 rounded-md overflow-hidden border border-slate-200 dark:border-neutral-800"
                  >
                    <img
                      src={img.url}
                      alt={`图${img.index}`}
                      className="w-full h-full object-cover"
                    />
                    {/* 序号标签 - 左上角紫色正方形 */}
                    <div className="absolute top-0 left-0 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-black text-xs px-1.5 py-0.5 rounded-br">
                      {img.index}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* 分辨率选择 */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">分辨率</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setImageSize('2K');
                updateNodeData({ imageSize: '2K' });
              }}
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
              onClick={() => {
                setImageSize('4K');
                updateNodeData({ imageSize: '4K' });
              }}
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

        {/* 宽高比 */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">宽高比</label>
          <div className="grid grid-cols-3 gap-1">
            {['16:9', '21:9', '1:1', '9:16', '9:21', '4:3', '3:4', '3:2', '2:3'].map((r) => (
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

        {/* 提示词 */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-400">提示词</label>
          <textarea
            ref={promptTextareaRef}
            value={userPrompt}
            onChange={(e) => {
              setUserPrompt(e.target.value);
              updateNodeData({ userPrompt: e.target.value });
              // 自适应高度
              const textarea = e.target;
              textarea.style.height = 'auto';
              textarea.style.height = `${textarea.scrollHeight}px`;
            }}
            onFocus={(e) => {
              // 聚焦时也调整高度
              const textarea = e.target;
              textarea.style.height = 'auto';
              textarea.style.height = `${textarea.scrollHeight}px`;
            }}
            placeholder="输入您的创意"
            rows={2}
            className="nodrag w-full p-2 text-xs rounded-md border outline-none resize-none overflow-hidden transition-colors font-mono leading-relaxed bg-slate-100 dark:bg-[#000000] backdrop-blur-none hover:bg-slate-200 dark:hover:bg-neutral-800 focus:bg-white dark:focus:bg-neutral-800 border-slate-200 dark:border-neutral-800 focus:border-neutral-400 dark:focus:border-neutral-400/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500"
            style={{ minHeight: '60px' }}
          />
        </div>

        {/* 生成按钮 - Aurora样式 */}
        <button
          onClick={handleGenerate}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          disabled={isGenerating || !userPrompt.trim() || data._canEdit === false}
          className={`nodrag w-full mt-2 py-2 text-[10px] font-bold rounded-lg border transition-all active:scale-95 flex items-center justify-center gap-2 ${
            isGenerating || !userPrompt.trim() || data._canEdit === false
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

      {/* 输出端口 - 节点外部右侧 */}
      <div className="absolute right-0 top-1/2 translate-x-full -translate-y-1/2 flex items-center gap-1 pointer-events-none">
        <Handle
          type="source"
          position={Position.Right}
          id={`${id}-source`}
          style={{ position: 'relative', right: '8px', transform: 'none' }}
          className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair pointer-events-auto !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
        />
      </div>
    </div>
  );
};

export default memo(ImageFusionNode);
