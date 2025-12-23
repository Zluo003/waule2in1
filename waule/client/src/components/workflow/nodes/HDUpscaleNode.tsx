import { useState, useEffect, useMemo, memo } from 'react';
import { NodeProps, useReactFlow, useStore, Handle, Position } from 'reactflow';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../../lib/api';
import { processImageUrl } from '../../../utils/imageUtils';
import { processTaskResult } from '../../../utils/taskResultHandler';
import { useBillingEstimate } from '../../../hooks/useBillingEstimate';

interface HDUpscaleNodeData {
  config: {
    imageSize?: string;
    inputImage?: string;
    generatedImageUrl?: string;
    taskId?: string;
  };
  models?: any[];
  workflowContext?: any;
  createdBy?: any;
  _canEdit?: boolean;
}

// 固定使用 gemini-3-pro-image-preview 模型
const FIXED_MODEL_ID = 'gemini-3-pro-image-preview';

// 标准比例列表
const STANDARD_RATIOS = ['21:9', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16', '9:21'];

// 将比例字符串转为数值
const ratioToNumber = (ratio: string): number => {
  const [w, h] = ratio.split(':').map(Number);
  return w / h;
};

// 根据图片尺寸找到最接近的标准比例
const findClosestRatio = (width: number, height: number): string => {
  const imageRatio = width / height;
  let closestRatio = '1:1';
  let minDiff = Infinity;

  for (const ratio of STANDARD_RATIOS) {
    const standardRatio = ratioToNumber(ratio);
    const diff = Math.abs(imageRatio - standardRatio);
    if (diff < minDiff) {
      minDiff = diff;
      closestRatio = ratio;
    }
  }

  return closestRatio;
};

// 获取图片尺寸
const getImageDimensions = (imageUrl: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
};

const HDUpscaleNode = ({ data, selected, id }: NodeProps<HDUpscaleNodeData>) => {
  const [imageSize, setImageSize] = useState(data.config.imageSize || '2K');
  const [inputImage, setInputImage] = useState<string | undefined>(data.config.inputImage);
  const [isGenerating, setIsGenerating] = useState(!!data.config.taskId);
  const [selectedModel, setSelectedModel] = useState<any>(null);

  // 从可用模型中查找目标模型
  const targetModel = useMemo(() => {
    const models = data.models || [];
    return models.find((m: any) => m.modelId === FIXED_MODEL_ID) || 
           models.find((m: any) => m.modelId?.includes('gemini')) ||
           models[0];
  }, [data.models]);

  // 积分预估（使用固定节点计费）
  const { credits, loading: creditsLoading, isFreeUsage, freeUsageRemaining } = useBillingEstimate({
    nodeType: 'hd_upscale',
    quantity: 1,
    resolution: imageSize,
  });

  useEffect(() => {
    if (targetModel) {
      setSelectedModel(targetModel);
    }
  }, [targetModel]);

  const { setNodes, setEdges, getNode, getNodes } = useReactFlow();

  // 监听连接变化，获取输入图片
  const connectedEdges = useStore((state) =>
    state.edges.filter((edge) => edge.target === id)
  );

  // 从连接的节点获取图片
  useEffect(() => {
    const nodes = getNodes();
    let newInputImage: string | undefined;

    connectedEdges.forEach((edge) => {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (sourceNode) {
        const imageUrl =
          sourceNode.data?.imageUrl ||
          sourceNode.data?.config?.generatedImageUrl ||
          sourceNode.data?.config?.imageUrl ||
          sourceNode.data?.url;
        if (imageUrl) {
          newInputImage = imageUrl;
        }
      }
    });

    if (newInputImage !== inputImage) {
      setInputImage(newInputImage);
      updateNodeData({ inputImage: newInputImage });
    }
  }, [connectedEdges, getNodes]);

  // 任务恢复逻辑
  useEffect(() => {
    const initialTaskId = data.config.taskId;

    const recoverTask = async () => {
      if (!initialTaskId) return;

      console.log('[HDUpscaleNode] 恢复任务查询:', initialTaskId);
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

  const updateNodeData = (updates: Partial<HDUpscaleNodeData['config']>) => {
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
    if (!inputImage) {
      toast.error('请先连接一张图片');
      return;
    }

    setIsGenerating(true);

    try {
      // 处理输入图片
      const processedImage = await processImageUrl(inputImage);

      // 计算输入图片的比例
      let detectedRatio = '1:1';
      try {
        const dimensions = await getImageDimensions(inputImage);
        detectedRatio = findClosestRatio(dimensions.width, dimensions.height);
        console.log('[HDUpscaleNode] 检测到图片比例:', detectedRatio, '尺寸:', dimensions);
      } catch (e) {
        console.warn('[HDUpscaleNode] 无法获取图片尺寸，使用默认比例 1:1');
      }

      // 获取后台配置的提示词
      let prompt = '';
      try {
        const res = await apiClient.get('/node-prompts/type/hdUpscale');
        if (res.success && res.data?.userPromptTemplate) {
          prompt = res.data.userPromptTemplate;
        }
      } catch (e) {
        console.log('[HDUpscaleNode] 使用默认提示词');
      }

      // 默认提示词：高清放大
      if (!prompt) {
        prompt = '将这张图片进行高清放大，保持原有的画面内容、构图和风格不变，提升图片的清晰度和细节';
      }

      // 在提示词最后追加比例信息
      prompt = `${prompt}，生成${detectedRatio}比例的图片`;

      if (!selectedModel) {
        toast.error('模型未加载，请稍后重试');
        setIsGenerating(false);
        return;
      }

      console.log('[HDUpscaleNode] 创建任务参数:', {
        modelId: selectedModel.id,
        modelIdString: selectedModel.modelId,
        prompt,
        ratio: detectedRatio,
        imageSize: imageSize,
      });

      const response = await apiClient.tasks.createImageTask({
        modelId: selectedModel.id,
        prompt,
        ratio: detectedRatio,
        referenceImages: [processedImage],
        sourceNodeId: id,
        metadata: { imageSize, nodeType: 'hd_upscale' },
      });

      if (!response.success) {
        throw new Error(response.message || '创建任务失败');
      }

      const taskId = response.taskId;
      const creditsCharged = response.creditsCharged || 0;
      updateNodeData({ taskId });

      // 立即保存工作流，确保刷新页面后能恢复任务
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('workflow:save'));
      }, 200);

      // 刷新用户积分
      if (creditsCharged > 0) {
        const { useAuthStore } = await import('../../../store/authStore');
        const { refreshUser } = useAuthStore.getState();
        await refreshUser();
        toast.success(`✨ 高清放大已开始，消耗 ${creditsCharged} 积分`);
      }

      pollTaskStatus(taskId);
    } catch (error: any) {
      console.error('[HDUpscaleNode] 生成失败:', error);
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
            imageSize,
          });

          // 创建预览节点
          createPreviewNode(displayUrl);

          toast.success('高清放大完成！');
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

  const createPreviewNode = (imageUrl: string) => {
    const currentNode = getNode(id);
    if (!currentNode) return;

    // 统计已有的预览节点数量，计算新节点位置
    const existingNodes = getNodes();
    const existingPreviews = existingNodes.filter(
      (n: any) => n.id.startsWith(`${id}-preview`) && n.type === 'imagePreview'
    );
    const previewIndex = existingPreviews.length;

    const nodeHeight = 220;
    const gap = 20;

    const newNode = {
      id: `${id}-preview-${Date.now()}`,
      type: 'imagePreview',
      position: {
        x: currentNode.position.x + 380,
        y: currentNode.position.y + previewIndex * (nodeHeight + gap),
      },
      data: {
        imageUrl,
        ratio: '1:1',
        label: '高清放大结果',
        sourceNodeId: id,
        createdBy: currentNode.data.createdBy,
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
          <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 0, "wght" 200, "GRAD" 0, "opsz" 20' }}>high_quality</span>
          <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-white">高清放大</span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse shadow-[0_0_5px_currentColor]"></div>
      </div>

      {/* 节点内容 */}
      <div className="p-4 space-y-4">
        {/* 输入图片预览 */}
        {inputImage && (
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">输入图片</label>
            <div className="w-full h-32 rounded-md overflow-hidden border border-slate-200 dark:border-white/10">
              <img src={inputImage} alt="输入" className="w-full h-full object-cover" />
            </div>
          </div>
        )}

        {/* 分辨率选择 */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">输出分辨率</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setImageSize('2K');
                updateNodeData({ imageSize: '2K' });
              }}
              className={`nodrag py-2 rounded-lg text-[10px] font-bold transition-colors border ${
                imageSize === '2K'
                  ? 'bg-neutral-800 dark:bg-white text-white dark:text-black text-white shadow-md border-transparent dark:border-white/10'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-white/70 border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10'
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
                  ? 'bg-neutral-800 dark:bg-white text-white dark:text-black text-white shadow-md border-transparent dark:border-white/10'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-white/70 border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-sm">4k</span>
                <span>4K</span>
              </div>
            </button>
          </div>
        </div>

        {/* 生成按钮 - Aurora样式 */}
        <button
          onClick={handleGenerate}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          disabled={isGenerating || !inputImage || data._canEdit === false}
          className={`nodrag w-full mt-2 py-2 text-[10px] font-bold rounded-lg border transition-all flex items-center justify-center gap-2 ${
            isGenerating || !inputImage
              ? 'bg-neutral-800 dark:bg-white text-white dark:text-black cursor-not-allowed border-transparent'
              : 'bg-neutral-800 dark:bg-white text-white dark:text-black shadow-md hover:shadow-lg border-transparent dark:border-white/10 active:scale-95'
          }`}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>处理中...</span>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-sm">high_quality</span>
              <span>高清放大</span>
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
      </div>
    </div>
  );
};

export default memo(HDUpscaleNode);
