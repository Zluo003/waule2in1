import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Position, NodeProps, useReactFlow, useStore } from 'reactflow';
import { Pencil, Loader2, Trash2, MousePointer2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import CustomHandle from '../CustomHandle';
import { apiClient } from '../../../lib/api';
import { useBillingEstimate } from '../../../hooks/useBillingEstimate';

interface Point {
  id: number;
  x: number; // 归一化坐标 0-1
  y: number;
  name?: string; // 识别的物体名称
}

interface ImageEditingNodeData {
  label?: string;
  prompt?: string;
  points?: Point[];
  generatedImageUrl?: string;
  taskId?: string; // 任务ID，用于恢复进行中的任务
}

const ImageEditingNode = ({ data, id, selected }: NodeProps<ImageEditingNodeData>) => {
  const { getNode, setNodes, setEdges } = useReactFlow();

  // 获取连接到此节点的边（使用浅比较避免不必要的重新渲染）
  const connectedEdges = useStore(
    useCallback((state) => state.edges.filter((edge) => edge.target === id), [id])
  );

  // 状态
  const [prompt, setPrompt] = useState(data.prompt || '');
  const [points, setPoints] = useState<Point[]>(data.points || []);
  const [isLoading, setIsLoading] = useState(false);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [mainImageUrl, setMainImageUrl] = useState<string | null>(null);
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const [, setGeneratedImageUrl] = useState<string | null>(data.generatedImageUrl || null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [, setTaskId] = useState(data.taskId || '');
  const [, setGenerationProgress] = useState(0);

  const imageRef = useRef<HTMLDivElement>(null);
  const nextPointId = useRef(1);

  // 积分估算
  const { credits, loading: creditsLoading, isFreeUsage, freeUsageRemaining, refetch: refetchEstimate } = useBillingEstimate({
    nodeType: 'image_editing',
    quantity: 1,
  });

  // 更新节点数据
  const updateNodeData = useCallback((updates: Partial<ImageEditingNodeData>) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                ...updates,
              },
            }
          : node
      )
    );
  }, [id, setNodes]);

  // 获取从此节点输出的边（用于检查是否已有预览节点）
  const outgoingEdges = useStore(
    useCallback((state) => state.edges.filter((edge) => edge.source === id), [id])
  );

  // 创建预览节点（如果已有预览节点连接，则更新而非新建）
  const createPreviewNode = useCallback((imageUrl: string) => {
    const currentNode = getNode(id);
    if (!currentNode) return;

    // 检查是否已有连接的预览节点
    const existingPreviewEdge = outgoingEdges.find((edge) => {
      const targetNode = getNode(edge.target);
      return targetNode?.type === 'imagePreview';
    });

    if (existingPreviewEdge) {
      // 已有预览节点，更新其图片URL
      const previewNodeId = existingPreviewEdge.target;
      setNodes((nds) =>
        nds.map((node) =>
          node.id === previewNodeId
            ? { ...node, data: { ...node.data, imageUrl: imageUrl } }
            : node
        )
      );
      return;
    }

    // 没有预览节点，创建新的
    const timestamp = Date.now();
    const previewNodeId = `preview-${id}-${timestamp}`;
    
    const previewNode = {
      id: previewNodeId,
      type: 'imagePreview',
      position: {
        x: (currentNode?.position?.x || 0) + 450,
        y: currentNode?.position?.y || 0,
      },
      data: {
        imageUrl: imageUrl,
        width: 400,
      },
    };

    setTimeout(() => {
      setNodes((nds) => [...nds, previewNode]);

      const newEdge = {
        id: `edge-${id}-${previewNodeId}`,
        source: id,
        target: previewNodeId,
        targetHandle: `${previewNodeId}-target`,
        type: 'aurora',
      };

      setEdges((eds) => {
        const existingEdge = eds.find((e) => e.source === id && e.target === previewNodeId);
        if (existingEdge) return eds;
        return [...eds, newEdge];
      });
    }, 100);
  }, [id, getNode, setNodes, setEdges, outgoingEdges]);

  // 轮询任务状态（使用 ref 存储轮询状态，避免闭包问题）
  const pollingRef = useRef<{ active: boolean; timeoutId: ReturnType<typeof setTimeout> | null }>({ active: false, timeoutId: null });

  const pollTaskStatus = useCallback(async (taskId: string) => {
    const maxAttempts = 300; // 最多5分钟 (300 * 1秒)
    let attempts = 0;

    // 清除之前的轮询
    if (pollingRef.current.timeoutId) {
      clearTimeout(pollingRef.current.timeoutId);
    }
    pollingRef.current.active = true;

    const poll = async () => {
      if (!pollingRef.current.active) return;

      try {
        attempts++;
        const response = await apiClient.tasks.getTaskStatus(taskId);
        const task = response.task;

        if (!pollingRef.current.active) return;

        // 更新进度
        setGenerationProgress(task.progress || 0);

        if (task.status === 'SUCCESS') {
          // 生成成功
          pollingRef.current.active = false;
          setIsLoading(false);
          setGenerationProgress(100);

          const imageUrl = task.resultUrl;
          
          updateNodeData({
            generatedImageUrl: imageUrl,
            taskId: '', // 清除taskId
          });
          setGeneratedImageUrl(imageUrl);

          toast.success('🎨 编辑完成，快来看看效果吧！');

          // 创建预览节点
          if (imageUrl) {
            createPreviewNode(imageUrl);
          }
          return;
        } else if (task.status === 'FAILURE') {
          // 生成失败
          pollingRef.current.active = false;
          setIsLoading(false);
          setGenerationProgress(0);
          updateNodeData({ taskId: '' });
          toast.error(task.errorMessage || '编辑遇到问题，积分已退还，请重试');
          return;
        } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
          // 继续轮询
          if (attempts < maxAttempts && pollingRef.current.active) {
            pollingRef.current.timeoutId = setTimeout(poll, 1000);
          } else {
            pollingRef.current.active = false;
            setIsLoading(false);
            setGenerationProgress(0);
            updateNodeData({ taskId: '' });
            toast.error('编辑时间较长，请刷新页面查看结果或重新尝试');
          }
        }
      } catch (error: any) {
        pollingRef.current.active = false;
        setIsLoading(false);
        setGenerationProgress(0);
        updateNodeData({ taskId: '' });
        toast.error('网络波动，请刷新页面查看结果');
      }
    };

    poll();
  }, [updateNodeData, createPreviewNode]);

  // 组件卸载时清除轮询
  useEffect(() => {
    return () => {
      pollingRef.current.active = false;
      if (pollingRef.current.timeoutId) {
        clearTimeout(pollingRef.current.timeoutId);
      }
    };
  }, []);

  // 页面加载时恢复进行中的任务（只在有 taskId 时执行）
  useEffect(() => {
    const initialTaskId = data.taskId;
    if (!initialTaskId) return;

    const recoverTask = async () => {
      try {
        const response = await apiClient.tasks.getTaskStatus(initialTaskId);
        const task = response.task;

        if (task.status === 'SUCCESS') {
          // 任务已完成
          setIsLoading(false);
          setGenerationProgress(100);

          const imageUrl = task.resultUrl;
          if (imageUrl) {
            updateNodeData({
              generatedImageUrl: imageUrl,
              taskId: '',
            });
            setGeneratedImageUrl(imageUrl);
            toast.success('🎨 编辑已完成，快来看看效果吧！');
          } else {
            updateNodeData({ taskId: '' });
          }
        } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
          // 任务仍在进行中，恢复轮询
          setIsLoading(true);
          setGenerationProgress(task.progress || 0);
          pollTaskStatus(initialTaskId);
        } else if (task.status === 'FAILURE') {
          // 任务失败
          setIsLoading(false);
          setGenerationProgress(0);
          updateNodeData({ taskId: '' });
          toast.error(task.errorMessage ? `编辑遇到问题：${task.errorMessage}` : '编辑未能完成，请重试');
        }
      } catch (error: any) {
        console.error('[ImageEditingNode] Error recovering task:', error);
        setIsLoading(false);
        setGenerationProgress(0);
        updateNodeData({ taskId: '' });
      }
    };

    recoverTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 获取图片尺寸
  const loadImageDimensions = useCallback((url: string) => {
    const img = new Image();
    img.onload = () => {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = url;
  }, []);

  // 从连接的节点获取图片
  useEffect(() => {
    try {
      const imageUrls: string[] = [];

      connectedEdges.forEach((edge) => {
        const sourceNode = getNode(edge.source);
        if (!sourceNode) return;

        const nodeData = sourceNode.data as any;
        let url: string | null = null;

        // 尝试从不同类型的节点获取图片 URL
        if (nodeData?.url) {
          url = nodeData.url;
        } else if (nodeData?.imageUrl) {
          url = nodeData.imageUrl;
        } else if (nodeData?.output) {
          url = nodeData.output;
        } else if (nodeData?.config?.generatedImageUrl) {
          url = nodeData.config.generatedImageUrl;
        } else if (nodeData?.config?.uploadedFiles?.[0]?.url) {
          url = nodeData.config.uploadedFiles[0].url;
        }

        if (url) {
          imageUrls.push(url);
        }
      });

      if (imageUrls.length > 0) {
        setMainImageUrl(imageUrls[0]);
        setReferenceImageUrls(imageUrls.slice(1));
        // 加载主图尺寸
        loadImageDimensions(imageUrls[0]);
      } else {
        setMainImageUrl(null);
        setReferenceImageUrls([]);
        setImageDimensions(null);
      }
    } catch (error) {
      console.error('[ImageEditingNode] Error getting images from connected nodes:', error);
    }
  }, [connectedEdges, getNode, loadImageDimensions]);

  // 同步 prompt 和 points 到节点数据（防抖，仅在值变化时更新）
  useEffect(() => {
    const timer = setTimeout(() => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== id) return node;
          const currentData = node.data as ImageEditingNodeData;
          // 检查是否需要更新
          if (currentData.prompt === prompt && 
              JSON.stringify(currentData.points) === JSON.stringify(points)) {
            return node;
          }
          return {
            ...node,
            data: {
              ...node.data,
              prompt,
              points,
            },
          };
        })
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [prompt, points, id, setNodes]);

  // 处理点击添加标记点
  const handleImageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (!imageRef.current) return;

      const rect = imageRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      const newPoint: Point = {
        id: nextPointId.current++,
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      };

      setPoints((prev) => [...prev, newPoint]);
    },
    []
  );

  // 删除标记点
  const removePoint = useCallback((pointId: number) => {
    setPoints((prev) => prev.filter((p) => p.id !== pointId));
  }, []);

  // 更新标记点名称
  const updatePointName = useCallback((pointId: number, name: string) => {
    setPoints((prev) =>
      prev.map((p) => (p.id === pointId ? { ...p, name } : p))
    );
  }, []);

  // 拖动标记点开始
  const handlePointDragStart = useCallback((e: React.DragEvent, point: Point) => {
    e.stopPropagation();
    const text = point.name ? `@${point.name}` : `@位置${point.id}`;
    e.dataTransfer.setData('text/plain', text);
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  // 拖动参考图开始
  const handleRefDragStart = useCallback((e: React.DragEvent, index: number) => {
    e.stopPropagation();
    const text = `@参考图${index + 1}`;
    e.dataTransfer.setData('text/plain', text);
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  // 指令框拖放处理
  const handlePromptDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handlePromptDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const text = e.dataTransfer.getData('text/plain');
    if (text) {
      const textarea = e.target as HTMLTextAreaElement;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = prompt.slice(0, start) + text + prompt.slice(end);
      setPrompt(newValue);
      // 设置光标位置
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + text.length;
        textarea.focus();
      }, 0);
    }
  }, [prompt]);

  // 自动识别标记点物体
  const identifyPoints = useCallback(async () => {
    if (!mainImageUrl || points.length === 0) return;

    setIsIdentifying(true);
    try {
      const res = await apiClient.ai.imageEditing.identifyPoints({
        image: mainImageUrl,
        points: points.map((p) => ({ id: p.id, x: p.x, y: p.y })),
      });

      if (res.success && res.data?.points) {
        const identified = res.data.points as Array<{ id: number; name: string }>;
        setPoints((prev) =>
          prev.map((p) => {
            const match = identified.find((ip) => ip.id === p.id);
            return match ? { ...p, name: match.name } : p;
          })
        );
        toast.success('✨ 标记点已识别完成');
      }
    } catch (error) {
      console.error('Identify points error:', error);
      toast.error('识别失败，请重试');
    } finally {
      setIsIdentifying(false);
    }
  }, [mainImageUrl, points]);

  // 执行图片编辑（异步任务模式）
  const handleEdit = useCallback(async () => {
    if (!mainImageUrl) {
      toast.error('请先连接一张图片作为编辑对象~');
      return;
    }
    if (!prompt.trim()) {
      toast.error('请描述您想要的编辑效果~');
      return;
    }

    setIsLoading(true);
    setGenerationProgress(0);

    try {
      // 提交异步任务
      const response = await apiClient.tasks.createImageEditTask({
        prompt: prompt.trim(),
        mainImage: mainImageUrl,
        referenceImages: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
        points: points.length > 0 ? points : undefined,
        sourceImageDimensions: imageDimensions || undefined,
        sourceNodeId: id,
      });

      const newTaskId = response.taskId;
      const creditsCharged = response.creditsCharged || 0;
      const isFreeUsageResponse = response.isFreeUsage;
      const freeUsageRemainingResponse = response.freeUsageRemaining ?? 0;

      // 保存 taskId 到节点数据（用于页面刷新后恢复）
      setTaskId(newTaskId);
      updateNodeData({
        prompt: prompt.trim(),
        points,
        taskId: newTaskId,
      });

      // 显示提示
      if (isFreeUsageResponse) {
        toast.success(`🎁 免费编辑中，今日还剩 ${freeUsageRemainingResponse} 次机会`);
        refetchEstimate();
      } else if (creditsCharged > 0) {
        const { useAuthStore } = await import('../../../store/authStore');
        const { refreshUser } = useAuthStore.getState();
        await refreshUser();
        toast.success(`✨ 编辑已开始，消耗 ${creditsCharged} 积分`);
        refetchEstimate();
      } else {
        toast.success('✨ 编辑已开始，请稍候...');
      }

      // 开始轮询任务状态
      pollTaskStatus(newTaskId);
    } catch (error: any) {
      console.error('Image editing error:', error);
      setIsLoading(false);
      setGenerationProgress(0);
      
      if (error.response?.status === 403) {
        const errMsg = error.response?.data?.error || '当前账户暂无此功能权限';
        toast.error(errMsg);
      } else {
        const errorDetail = error.response?.data?.error || error.message || '未知原因';
        toast.error(`编辑启动失败：${errorDetail}，请稍后重试`);
      }
    }
  }, [mainImageUrl, prompt, referenceImageUrls, points, imageDimensions, id, updateNodeData, pollTaskStatus, refetchEstimate]);

  return (
    <div
      className={`relative bg-white/80 dark:bg-black/60 backdrop-blur-xl border rounded-2xl shadow-xl transition-all ring-1 ${
        selected 
          ? 'border-purple-400 shadow-purple-400/50' 
          : 'border-white/60 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'
      }`}
      style={{ width: 320 }}
    >
      {/* 输入 Handle */}
      <CustomHandle
        type="target"
        position={Position.Left}
        id={`${id}-target`}
        className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
      />

      {/* 输出 Handle */}
      <CustomHandle
        type="source"
        position={Position.Right}
        id={`${id}-source`}
        className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
      />

      {/* 头部 - Aurora渐变样式（与图片生成节点一致） */}
      <div className="flex items-center justify-between px-4 py-3 border-b rounded-t-2xl border-slate-200 dark:border-white/10 bg-gradient-to-r from-pink-500/20 from-pink-200/50 via-purple-500/20 via-purple-200/50 to-cyan-500/20 to-cyan-200/50 dark:from-pink-500/20 dark:via-purple-500/20 dark:to-cyan-500/20">
        <div className="flex items-center gap-2">
          <Pencil className="w-4 h-4 text-slate-800 dark:text-white" />
          <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-white">图片编辑</span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse shadow-[0_0_5px_currentColor]"></div>
      </div>

      {/* 内容区 */}
      <div className="p-4 space-y-3">
        {/* 图片预览区 */}
        <div
          ref={imageRef}
          className="relative w-full aspect-square bg-slate-100 dark:bg-white/5 rounded-lg overflow-hidden cursor-crosshair border border-slate-200 dark:border-white/10"
          onClick={handleImageClick}
        >
          {mainImageUrl ? (
            <>
              <img
                src={mainImageUrl}
                alt="Main"
                className="w-full h-full object-contain"
                draggable={false}
              />
              {/* Ctrl+点击提示 */}
              <div className="absolute bottom-2 left-2 right-2 text-center">
                <span className="px-2 py-1 bg-black/60 text-white text-[10px] rounded backdrop-blur-sm">
                  Ctrl+点击 添加标记点
                </span>
              </div>
              {/* 标记点 */}
              {points.map((point) => (
                <div
                  key={point.id}
                  className="absolute w-6 h-6 -ml-3 -mt-3 bg-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg border-2 border-white cursor-pointer hover:scale-110 transition-transform"
                  style={{
                    left: `${point.x * 100}%`,
                    top: `${point.y * 100}%`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    removePoint(point.id);
                  }}
                  title={point.name || `点击删除 #${point.id}`}
                >
                  {point.id}
                </div>
              ))}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-white/30">
              <div className="text-center">
                <MousePointer2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs">连接图片节点</p>
                <p className="text-[10px] mt-1 opacity-60">Ctrl+点击添加标记点</p>
              </div>
            </div>
          )}
        </div>

        {/* 参考图缩略图 */}
        {referenceImageUrls.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {referenceImageUrls.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Ref ${i + 1}`}
                draggable
                onDragStart={(e) => handleRefDragStart(e, i)}
                className="w-12 h-12 object-cover rounded border border-slate-200 dark:border-slate-700 flex-shrink-0 cursor-grab active:cursor-grabbing nodrag"
                title="拖动到指令框插入 @参考图"
              />
            ))}
            <span className="text-xs text-slate-500 self-center">
              +{referenceImageUrls.length} 参考图
            </span>
          </div>
        )}

        {/* 标记点列表 */}
        {points.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">
                标记点 ({points.length})
              </label>
              <button
                onClick={identifyPoints}
                disabled={isIdentifying || !mainImageUrl}
                className="text-[10px] text-purple-500 hover:text-purple-600 disabled:opacity-50 flex items-center gap-1"
              >
                {isIdentifying ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                自动识别
              </button>
            </div>
            <div className="max-h-20 overflow-y-auto space-y-1">
              {points.map((point) => (
                <div
                  key={point.id}
                  className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-white/5 rounded text-xs"
                >
                  <span
                    draggable
                    onDragStart={(e) => handlePointDragStart(e, point)}
                    className="w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 cursor-grab active:cursor-grabbing nodrag"
                    title="拖动到指令框插入标记"
                  >
                    {point.id}
                  </span>
                  <input
                    type="text"
                    placeholder="物体名称..."
                    value={point.name || ''}
                    onChange={(e) => updatePointName(point.id, e.target.value)}
                    className="flex-1 px-2 py-1 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded text-slate-800 dark:text-white min-w-0 nodrag text-xs"
                  />
                  <button
                    onClick={() => removePoint(point.id)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 编辑指令 */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">
            编辑指令
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onDragOver={handlePromptDragOver}
            onDrop={handlePromptDrop}
            placeholder="描述你想要的修改..."
            className="nodrag w-full p-2 text-xs rounded-md border outline-none resize-none transition-colors font-mono leading-relaxed bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 focus:bg-white dark:focus:bg-white/10 border-slate-200 dark:border-white/10 focus:border-purple-400 dark:focus:border-purple-400/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30"
            style={{ minHeight: '60px' }}
          />
        </div>

        {/* 执行按钮 - Aurora样式（与图片生成节点一致） */}
        <button
          onClick={handleEdit}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          disabled={isLoading || !mainImageUrl || !prompt.trim()}
          className={`nodrag w-full mt-2 py-2 text-[10px] font-bold rounded-lg border transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${isLoading ? 'bg-gray-600 dark:bg-gray-700 text-white cursor-wait border-transparent dark:border-white/10' : 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white shadow-md hover:shadow-lg border-transparent dark:border-white/10'}`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>编辑中...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3" />
              <span>执行编辑</span>
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
      </div>
    </div>
  );
};

export default memo(ImageEditingNode);
