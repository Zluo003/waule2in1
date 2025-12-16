import { memo, useState, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow, useNodes, useEdges } from 'reactflow';
import { Video, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { apiClient } from '../../../lib/api';

interface VideoUpscaleNodeData {
  label: string;
  config: {
    upscaleResolution?: '1080p' | '2K' | '4K' | '8K';
    inputVideoUrl?: string;
    outputVideoUrl?: string;
    taskId?: string;
  };
}

const VideoUpscaleNode = ({ data, selected, id }: NodeProps<VideoUpscaleNodeData>) => {
  const [upscaleResolution, setUpscaleResolution] = useState<'1080p' | '2K' | '4K' | '8K'>(
    data.config.upscaleResolution || '1080p'
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [inputVideoUrl, setInputVideoUrl] = useState(data.config.inputVideoUrl || '');
  const [, setTaskId] = useState(data.config.taskId || ''); // taskId 用于任务恢复和保存

  const { setNodes, setEdges } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();

  const updateNodeData = (updates: Partial<VideoUpscaleNodeData['config']>) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, config: { ...node.data.config, ...updates } } }
          : node
      )
    );
  };

  // 获取连接的视频输入
  useEffect(() => {
    const incomingEdges = edges.filter(edge => edge.target === id);
    
    if (incomingEdges.length > 0) {
      const sourceNode = nodes.find(n => n.id === incomingEdges[0].source);
      if (sourceNode) {
        // 尝试多个可能的字段名
        const sourceData = sourceNode.data as any;
        const videoUrl = 
          sourceData.videoUrl ||           // VideoPreviewNode
          sourceData.config?.videoUrl ||    // AIVideoNode output
          sourceData.config?.outputVideoUrl ||
          sourceData.config?.resultUrl;
        
        if (videoUrl && videoUrl !== inputVideoUrl) {
          console.log('[VideoUpscaleNode] 已设置输入视频URL:', videoUrl);
          setInputVideoUrl(videoUrl);
          updateNodeData({ inputVideoUrl: videoUrl });
        }
      }
    } else if (inputVideoUrl) {
      // 如果连接被删除，清除输入
      setInputVideoUrl('');
      updateNodeData({ inputVideoUrl: '' });
    }
  }, [edges, nodes, id]); // 移除 inputVideoUrl 依赖避免循环

  // 页面加载时恢复进行中的任务
  useEffect(() => {
    const initialTaskId = data.config.taskId;
    
    console.log('[VideoUpscaleNode] useEffect 触发，taskId:', initialTaskId);
    console.log('[VideoUpscaleNode] data.config:', data.config);

    const recoverTask = async () => {
      if (initialTaskId) {
        try {
          console.log('[VideoUpscaleNode] 开始恢复任务:', initialTaskId);
          const response = await apiClient.get(`/tasks/${initialTaskId}`);
          console.log('[VideoUpscaleNode] 任务状态响应:', response);
          
          const task = response.task; // 从响应中提取 task 对象
          console.log('[VideoUpscaleNode] 任务对象:', task);

          if (task.status === 'SUCCESS') {
            const videoUrl = task.resultUrl;
            console.log('[VideoUpscaleNode] 任务已完成，视频URL:', videoUrl);
            
            updateNodeData({ 
              outputVideoUrl: videoUrl,
              taskId: ''
            });

            // 检查是否已存在预览节点
            const outgoingEdges = edges.filter(edge => edge.source === id);
            const connectedPreviewNodes = outgoingEdges
              .map(edge => nodes.find(n => n.id === edge.target))
              .filter(n => n && n.type === 'videoPreview');

            const existingNode = connectedPreviewNodes.find((node: any) => node.data.videoUrl === videoUrl);
            if (!existingNode) {
              createPreviewNode(videoUrl);
            }
            
            toast.success('🎬 智能超清完成，画质提升成功！');
            setIsProcessing(false);
          } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
            console.log('[VideoUpscaleNode] 任务进行中，恢复轮询');
            setIsProcessing(true);
            pollTaskStatus(initialTaskId);
          } else if (task.status === 'FAILURE') {
            console.log('[VideoUpscaleNode] 任务失败:', task.errorMessage);
            setIsProcessing(false);
            updateNodeData({ taskId: '' });
            toast.error(task.errorMessage ? `超清处理遇到问题：${task.errorMessage}` : '超清处理失败，请稍后重试');
          }
        } catch (error: any) {
          console.error('[VideoUpscaleNode] 任务恢复失败:', error);
          setIsProcessing(false);
          updateNodeData({ taskId: '' });
          toast.error('无法恢复之前的任务，请重新处理');
        }
      }
    };

    recoverTask();
  }, []); // 只在组件挂载时运行一次

  // 轮询任务状态
  const pollTaskStatus = async (taskId: string) => {
    const maxAttempts = 300; // 最多5分钟
    let attempts = 0;

    const poll = async () => {
      try {
        attempts++;
        const response = await apiClient.get(`/tasks/${taskId}`);
        const task = response.task; // 从响应中提取 task 对象

        if (task.status === 'SUCCESS') {
          const videoUrl = task.resultUrl;
          console.log('[VideoUpscaleNode] 任务完成，视频URL:', videoUrl);
          
          setIsProcessing(false);
          updateNodeData({ 
            outputVideoUrl: videoUrl,
            taskId: ''
          });

          createPreviewNode(videoUrl);
          toast.success('🎬 智能超清完成，画质提升成功！');
          return;
        } else if (task.status === 'FAILURE') {
          setIsProcessing(false);
          updateNodeData({ taskId: '' });
          toast.error(task.errorMessage || '超清处理遇到问题，请稍后重试');
          return;
        } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
          if (attempts < maxAttempts) {
            setTimeout(poll, 3000);
          } else {
            setIsProcessing(false);
            updateNodeData({ taskId: '' });
            toast.error('任务仍在处理中，请刷新页面查看结果');
          }
        }
      } catch (error: any) {
        console.error('[VideoUpscaleNode] 轮询失败:', error);
        setIsProcessing(false);
        updateNodeData({ taskId: '' });
        toast.error('网络波动，请刷新页面查看结果');
      }
    };

    poll();
  };

  // 创建预览节点
  const createPreviewNode = (videoUrl: string) => {
    const currentNode = nodes.find(n => n.id === id);
    if (currentNode) {
      const previewNodeId = `preview-video-${Date.now()}`;
      
      // 分辨率标识转换（1080p→HD）
      const resolutionLabel = upscaleResolution === '1080p' ? 'HD' : upscaleResolution;
      
      const newPreviewNode = {
        id: previewNodeId,
        type: 'videoPreview',
        position: {
          x: currentNode.position.x + 400,
          y: currentNode.position.y,
        },
        data: {
          label: '超清视频',
          videoUrl: videoUrl,
          ratio: '16:9',
          resolution: resolutionLabel, // 添加分辨率标识
          createdBy: (currentNode.data as any)?.createdBy, // 🔑 继承父节点的创建者信息（协作者拖动权限）
        },
      };

      const newEdge = {
        id: `edge-${id}-${previewNodeId}`,
        source: id,
        target: previewNodeId,
        type: 'aurora',
      };

      setNodes((nds) => [...nds, newPreviewNode]);
      setTimeout(() => {
        setEdges((eds) => [...eds, newEdge]);
      }, 100);
    }
  };

  const handleUpscale = async () => {
    console.log('[VideoUpscaleNode] 按钮被点击！');
    console.log('[VideoUpscaleNode] inputVideoUrl:', inputVideoUrl);
    console.log('[VideoUpscaleNode] isProcessing:', isProcessing);
    
    if (!inputVideoUrl) {
      console.log('[VideoUpscaleNode] 缺少视频输入');
      toast.error('请先连接一个视频~');
      return;
    }

    console.log('[VideoUpscaleNode] 开始处理超清任务');
    setIsProcessing(true);

    try {
      // 获取任意 Vidu 模型的配置（用于获取 API Key）
      console.log('[VideoUpscaleNode] 正在获取 Vidu 模型配置...');
      const viduModels = await apiClient.get('/ai/models?provider=vidu&isActive=true');
      console.log('[VideoUpscaleNode] Vidu 模型列表:', viduModels);
      
      if (!viduModels || viduModels.length === 0) {
        console.log('[VideoUpscaleNode] 未找到 Vidu 模型');
        toast.error('超清服务暂时不可用，请稍后重试');
        setIsProcessing(false);
        return;
      }

      const viduModel = viduModels[0]; // 使用第一个 Vidu 模型的配置
      console.log('[VideoUpscaleNode] 使用模型:', viduModel);

      // 创建超清任务
      console.log('[VideoUpscaleNode] 正在创建超清任务...');
      const taskResponse = await apiClient.post('/ai/video-upscale', {
        video_url: inputVideoUrl,
        upscale_resolution: upscaleResolution,
        apiKey: viduModel.apiKey,
        apiUrl: viduModel.apiUrl,
      });
      console.log('[VideoUpscaleNode] 任务创建响应:', taskResponse);

      // 保存 taskId 并开始轮询
      const newTaskId = taskResponse.taskId;
      setTaskId(newTaskId);
      updateNodeData({ 
        taskId: newTaskId,
        upscaleResolution
      });
      
      toast.success('🎬 超清处理已启动，视频处理需要一些时间，请耐心等待~');
      
      // 开始轮询任务状态
      pollTaskStatus(newTaskId);

    } catch (error: any) {
      console.error('[VideoUpscaleNode] 智能超清失败:', error);
      console.error('[VideoUpscaleNode] 错误详情:', {
        message: error.message,
        response: error.response,
        data: error.response?.data,
      });
      const errorDetail = error.response?.data?.error || error.message || '未知原因';
      toast.error(`启动失败：${errorDetail}，请稍后重试`);
      setIsProcessing(false);
    }
  };

  return (
    <div
      className={`relative bg-white/80 dark:bg-black/60 backdrop-blur-xl border rounded-2xl shadow-xl transition-all ring-1 ${
        selected ? 'border-purple-400 shadow-purple-400/50' : 'border-white/60 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'
      }`}
      style={{ width: 320 }}
    >
      {/* 输入连接点 */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
      />

      {/* 节点头部 - Aurora渐变样式 */}
      <div className="flex items-center justify-between px-4 py-3 border-b rounded-t-2xl border-slate-200 dark:border-white/10 bg-gradient-to-r from-pink-500/20 dark:from-pink-500/20 from-pink-200/50 via-purple-500/20 dark:via-purple-500/20 via-purple-200/50 to-cyan-500/20 dark:to-cyan-500/20 to-cyan-200/50">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 0, "wght" 200, "GRAD" 0, "opsz" 20' }}>
            high_quality
          </span>
          <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-white">智能超清</span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse shadow-[0_0_5px_currentColor]"></div>
      </div>

      {/* 内容区 */}
      <div className="p-4 space-y-3">
        {/* 输入视频预览 */}
        {inputVideoUrl && (
          <div className="relative rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700">
            <video
              src={inputVideoUrl}
              className="w-full h-32 object-cover"
              controls
            />
            <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 rounded text-[10px] text-white">
              输入视频
            </div>
          </div>
        )}

        {/* 分辨率选择 */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">
            目标分辨率
          </label>
          <div className="grid grid-cols-4 gap-1">
            {(['1080p', '2K', '4K', '8K'] as const).map((res) => (
              <button
                key={res}
                type="button"
                onClick={() => {
                  setUpscaleResolution(res);
                  updateNodeData({ upscaleResolution: res });
                }}
                disabled={isProcessing}
                className={`nodrag px-2 py-1 text-[10px] font-bold rounded-lg transition-all ${
                  upscaleResolution === res
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {res}
              </button>
            ))}
          </div>
        </div>

        {/* 处理按钮 */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[VideoUpscaleNode] 按钮点击事件触发');
            handleUpscale();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          disabled={isProcessing || !inputVideoUrl || (data as any)._canEdit === false}
          className={`w-full px-4 py-2.5 text-[11px] font-bold rounded-xl transition-all ${
            isProcessing || !inputVideoUrl || (data as any)._canEdit === false
              ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]'
          }`}
        >
          <div className="flex items-center justify-center space-x-2">
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Video className="w-4 h-4" />
            )}
            <span>{isProcessing ? '处理中...' : '开始超清'}</span>
          </div>
        </button>
      </div>

      {/* 输出连接点 */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
      />
    </div>
  );
};

export default memo(VideoUpscaleNode);
