import { useState, useEffect, useMemo, memo, useRef } from 'react';
import { NodeProps, useReactFlow, useStore, Handle, Position } from 'reactflow';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../../lib/api';
import { processImageUrl } from '../../../utils/imageUtils';
import { processTaskResult } from '../../../utils/taskResultHandler';
import { sliceImageGrid } from '../../../utils/imageGridSlicer';
import { uploadBase64ToLocal } from '../../../api/tenantLocalServer';
import { isLocalStorageEnabled } from '../../../store/tenantStorageStore';

interface SmartStoryboardNodeData {
  config: {
    aspectRatio?: string;
    imageSize?: string;
    inputImages?: string[]; // 支持多图输入（最多5张）
    userPrompt?: string; // 用户剧情简述
    generatedImageUrl?: string;
    taskId?: string;
    slicedImages?: string[];
  };
  models?: any[];
  workflowContext?: any;
  createdBy?: any;
  _canEdit?: boolean;
}

const ASPECT_RATIOS = ['16:9', '21:9', '1:1', '9:16', '9:21', '4:3', '3:4', '3:2', '2:3'];

// 模型ID
const TEXT_MODEL_ID = 'gemini-3-pro-preview'; // 第一步：文字生成
const IMAGE_MODEL_ID = 'gemini-3-pro-image-preview'; // 第二步：图片生成
const MAX_INPUT_IMAGES = 5; // 最多输入图片数

const SmartStoryboardNode = ({ data, selected, id }: NodeProps<SmartStoryboardNodeData>) => {
  const [aspectRatio, setAspectRatio] = useState(data.config.aspectRatio || '1:1');
  const [inputImages, setInputImages] = useState<string[]>(data.config.inputImages || []);
  const [userPrompt, setUserPrompt] = useState(data.config.userPrompt || '');
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

  // 任务恢复逻辑
  useEffect(() => {
    const initialTaskId = data.config.taskId;

    const recoverTask = async () => {
      if (!initialTaskId) return;

      console.log('[SmartStoryboardNode] 恢复任务查询:', initialTaskId);
      try {
        const response = await apiClient.tasks.getTaskStatus(initialTaskId);
        const task = response.task;

        if (task.status === 'SUCCESS') {
          setIsGenerating(false);
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
          pollTaskStatus(initialTaskId);
        } else if (task.status === 'FAILURE') {
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

    setIsGenerating(true);
    setGeneratingStep('text');

    try {
      // 处理所有输入图片
      const processedImages = await Promise.all(
        inputImages.map(img => processImageUrl(img))
      );

      // 使用默认提示词（后台配置功能暂不使用）
      let systemPrompt = '';
      let imagePrompt = '';

      // 默认系统提示词
      if (!systemPrompt) {
        systemPrompt = '你是一个专业的分镜师，根据用户提供的图片和剧情简述，生成详细的9个分镜描述。每个分镜应包含场景、动作、镜头角度等信息。';
      }
      if (!imagePrompt) {
        imagePrompt = '根据以下分镜描述和参考图片，生成3x3的九宫格分镜图，每个格子展示一个分镜场景，保持角色和风格一致，使用细黑边框分隔每个画面。';
      }

      // ========== 第一步：调用文字模型生成分镜描述 ==========
      console.log('========================================');
      console.log('[SmartStoryboardNode] 【第1步开始】调用文字模型生成分镜描述');
      console.log('[SmartStoryboardNode] 模型ID:', TEXT_MODEL_ID);
      console.log('[SmartStoryboardNode] 系统提示词:', systemPrompt);
      console.log('[SmartStoryboardNode] 用户提示词(剧情简述):', userPrompt);
      console.log('[SmartStoryboardNode] 图片数量:', processedImages.length);
      console.log('========================================');
      
      const textResponse = await apiClient.ai.text.generate({
        modelId: TEXT_MODEL_ID,
        systemPrompt: systemPrompt,
        prompt: userPrompt,
        imageUrls: processedImages,
      });

      console.log('[SmartStoryboardNode] 【第1步完成】文字模型响应:', JSON.stringify(textResponse, null, 2));

      if (!textResponse.success) {
        console.error('[SmartStoryboardNode] 【第1步失败】success=false');
        throw new Error(textResponse.message || '文字生成失败');
      }
      
      // 兼容不同响应格式：优先检查 data.text，其次 data.content
      const generatedText = textResponse.data?.text || textResponse.data?.content || textResponse.content;
      if (!generatedText || typeof generatedText !== 'string') {
        console.error('[SmartStoryboardNode] 【第1步失败】返回内容为空或格式错误', textResponse.data);
        throw new Error('文字生成返回为空');
      }

      console.log('[SmartStoryboardNode] 【第1步成功】生成的分镜描述:', String(generatedText).substring(0, 500) + '...');

      // ========== 第二步：调用图片模型生成9宫格 ==========
      setGeneratingStep('image');
      console.log('[SmartStoryboardNode] 第二步：调用图片模型生成9宫格');

      if (!selectedModel) {
        toast.error('图片模型未加载，请稍后重试');
        setIsGenerating(false);
        setGeneratingStep(null);
        return;
      }

      // 组合最终的图片生成提示词，结尾添加比例提示
      const finalImagePrompt = `${imagePrompt}\n\n分镜描述：\n${generatedText}\n\n生成${aspectRatio}比例的图片`;

      const response = await apiClient.tasks.createImageTask({
        modelId: selectedModel.id,
        prompt: finalImagePrompt,
        ratio: aspectRatio,
        imageSize: '4K', // 固定4K分辨率
        referenceImages: processedImages,
        sourceNodeId: id,
      });

      if (!response.success) {
        throw new Error(response.message || '创建图片任务失败');
      }

      const taskId = response.taskId;
      updateNodeData({ taskId, userPrompt });

      pollTaskStatus(taskId);
    } catch (error: any) {
      console.error('[SmartStoryboardNode] 生成失败:', error);
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

          // 自动切割成9个图片
          await handleSliceAndCreatePreviews(displayUrl);

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

  const handleSliceAndCreatePreviews = async (imageUrl: string) => {
    try {
      console.log('[SmartStoryboardNode] 开始切割图片:', imageUrl);
      
      // 先将远程图片转换为base64以避免CORS问题
      let imageToSlice = imageUrl;
      if (!imageUrl.startsWith('data:')) {
        try {
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          imageToSlice = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          console.log('[SmartStoryboardNode] 图片已转换为base64');
        } catch (fetchError) {
          console.warn('[SmartStoryboardNode] 无法转换为base64，尝试直接切割:', fetchError);
        }
      }
      
      // 固定3x3九宫格
      const result = await sliceImageGrid(imageToSlice, 3, 3);
      console.log('[SmartStoryboardNode] 切割完成，共', result.slices.length, '个片段');

      // 如果启用了本地存储，将base64图片上传到本地服务器
      let finalSlices = result.slices;
      if (isLocalStorageEnabled()) {
        console.log('[SmartStoryboardNode] 正在上传分割图片到本地存储...');
        const userId = data.createdBy?.id || 'default';
        const uploadPromises = result.slices.map(async (base64, index) => {
          const filename = `storyboard_${id}_slice_${index + 1}_${Date.now()}.png`;
          const uploadResult = await uploadBase64ToLocal(base64, userId, filename);
          if (uploadResult.success && uploadResult.localUrl) {
            console.log(`[SmartStoryboardNode] 分镜 ${index + 1} 已上传:`, uploadResult.localUrl);
            return uploadResult.localUrl;
          }
          console.warn(`[SmartStoryboardNode] 分镜 ${index + 1} 上传失败，使用base64`);
          return base64;
        });
        finalSlices = await Promise.all(uploadPromises);
        console.log('[SmartStoryboardNode] 所有分割图片已上传到本地存储');
      }

      updateNodeData({ slicedImages: finalSlices });

      // 批量创建9个预览节点（避免状态覆盖）
      createAllPreviewNodes(finalSlices, aspectRatio);
      
      console.log('[SmartStoryboardNode] 已创建', finalSlices.length, '个预览节点');
    } catch (error: any) {
      console.error('[SmartStoryboardNode] 切割失败:', error);
      toast.error('图片切割失败: ' + error.message);
    }
  };

  // 批量创建所有预览节点（一次性添加，避免状态覆盖）
  const createAllPreviewNodes = (slices: string[], ratio: string) => {
    const currentNode = getNode(id);
    if (!currentNode) return;

    const nodeHeight = 220;  // 每个预览节点的高度
    const gap = 20;          // 节点之间的间距
    const batchId = Date.now(); // 唯一批次ID，确保每次生成的节点不会覆盖之前的

    // 起始位置：在当前节点右侧，垂直居中对齐
    const baseX = currentNode.position.x + 350;
    const totalHeight = slices.length * nodeHeight + (slices.length - 1) * gap;
    const baseY = currentNode.position.y - totalHeight / 2 + 150;  // 居中偏移

    const newNodes: any[] = [];
    const newEdges: any[] = [];

    slices.forEach((imageUrl, index) => {
      const newNode = {
        id: `${id}-slice-${batchId}-${index}`,
        type: 'imagePreview',
        position: {
          x: baseX,
          y: baseY + index * (nodeHeight + gap),  // 纵向排列
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
  };

  return (
    <div
      className={`relative bg-white/80 dark:bg-black/60 backdrop-blur-xl border rounded-2xl shadow-xl transition-all ring-1 ${
        selected ? 'border-purple-400 shadow-purple-400/50' : 'border-white/60 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'
      }`}
      style={{ width: 320 }}
    >
      {/* 输入连接点 - 节点外部左侧 */}
      <div className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 flex items-center gap-1 pointer-events-none">
        <span className="text-xs text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/60 px-2 py-0.5 rounded whitespace-nowrap">
          图片 {inputImages.length > 0 ? `(${inputImages.length}/${MAX_INPUT_IMAGES})` : ''}
        </span>
        <Handle
          type="target"
          position={Position.Left}
          id={`${id}-input`}
          style={{ position: 'relative', left: '8px', transform: 'none' }}
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
      <div className="flex items-center justify-between px-4 py-3 border-b rounded-t-2xl border-slate-200 dark:border-white/10 bg-gradient-to-r from-pink-500/20 dark:from-pink-500/20 from-pink-200/50 via-purple-500/20 dark:via-purple-500/20 via-purple-200/50 to-cyan-500/20 dark:to-cyan-500/20 to-cyan-200/50">
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
                    className="w-full h-full object-cover rounded-md border border-slate-200 dark:border-white/10 group-hover:border-purple-400 dark:group-hover:border-purple-400 transition-colors"
                  />
                  {/* 序号标签 */}
                  <div className="absolute top-0 left-0 bg-purple-600 text-white text-xs px-1.5 py-0.5 rounded-br">
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
            className="nodrag w-full h-20 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-700 dark:text-white/90 placeholder-slate-400 dark:placeholder-white/30 resize-none focus:outline-none focus:ring-1 focus:ring-purple-500"
            disabled={data._canEdit === false}
          />
        </div>

        {/* 宽高比 */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">宽高比</label>
          <div className="grid grid-cols-3 gap-1">
            {ASPECT_RATIOS.map((r) => (
              <button
                key={r}
                onClick={() => {
                  setAspectRatio(r);
                  updateNodeData({ aspectRatio: r });
                }}
                className={`nodrag py-1.5 rounded-lg text-[9px] font-medium transition-colors border ${
                  aspectRatio === r
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white border-transparent dark:border-white/10'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-white/70 border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* 生成按钮 - Aurora样式 */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleGenerate();
          }}
          disabled={isGenerating}
          className={`nodrag w-full mt-2 py-2 text-[10px] font-bold rounded-lg border transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
            isGenerating
              ? 'bg-gray-600 dark:bg-gray-700 text-white cursor-wait border-transparent dark:border-white/10'
              : 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white shadow-md hover:shadow-lg border-transparent dark:border-white/10'
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
