import { memo, useState, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow, useNodes, useEdges } from 'reactflow';
import { Loader2, Film } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { apiClient } from '../../../lib/api';
import { useBillingEstimate } from '../../../hooks/useBillingEstimate';

interface CommercialVideoNodeData {
  label: string;
  config: {
    images?: string[];
    prompt?: string;
    duration?: number;
    ratio?: '16:9' | '9:16' | '1:1';
    language?: 'zh' | 'en';
    taskId?: string;
  };
}

const CommercialVideoNode = ({ data, selected, id }: NodeProps<CommercialVideoNodeData>) => {
  const [prompt, setPrompt] = useState(data.config.prompt || '');
  const [duration, setDuration] = useState<number>(data.config.duration || 30);
  const [ratio, setRatio] = useState<'16:9' | '9:16' | '1:1'>(data.config.ratio || '16:9');
  const [language, setLanguage] = useState<'zh' | 'en'>(data.config.language || 'zh');
  const [isProcessing, setIsProcessing] = useState(false);
  const [images, setImages] = useState<string[]>(data.config.images || []);
  const [, setTaskId] = useState(data.config.taskId || '');

  // 积分估算
  const { credits, loading: creditsLoading } = useBillingEstimate({
    nodeType: 'ad_composition',
    duration,
  });

  const { setNodes, setEdges } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();

  const updateNodeData = (updates: Partial<CommercialVideoNodeData['config']>) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, config: { ...node.data.config, ...updates } } }
          : node
      )
    );
  };

  // 监听输入连接的图片
  useEffect(() => {
    const incomingEdges = edges.filter(edge => edge.target === id);
    const connectedImages: string[] = [];

    incomingEdges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source) as any;
      if (!sourceNode) return;

      if (sourceNode.type === 'imagePreview' && sourceNode.data?.imageUrl) {
        connectedImages.push(sourceNode.data.imageUrl);
      } else if (sourceNode.type === 'aiImage' && sourceNode.data?.config?.generatedImageUrl) {
        connectedImages.push(sourceNode.data.config.generatedImageUrl);
      } else if (sourceNode.type === 'upload' && sourceNode.data?.config?.uploadedFiles) {
        const imageFiles = sourceNode.data.config.uploadedFiles.filter((f: any) => 
          f.type === 'IMAGE' || (f.mimeType || '').startsWith('image/')
        );
        imageFiles.forEach((f: any) => connectedImages.push(f.url));
      } else if (sourceNode.type === 'assetSelector') {
        if (sourceNode.data?.config?.subjects) {
          const subjects = sourceNode.data.config.subjects;
          subjects.forEach((subject: any) => {
            if (Array.isArray(subject.images)) {
              subject.images.forEach((img: any) => connectedImages.push(img.url));
            }
          });
        } else if (sourceNode.data?.config?.selectedAsset?.type === 'IMAGE') {
          connectedImages.push(sourceNode.data.config.selectedAsset.url);
        }
      }
    });

    if (JSON.stringify(connectedImages) !== JSON.stringify(images)) {
      setImages(connectedImages);
      updateNodeData({ images: connectedImages });
    }
  }, [edges, nodes, id]);

  // 任务恢复逻辑
  useEffect(() => {
    const initialTaskId = data.config.taskId;
    
    const recoverTask = async () => {
      if (initialTaskId) {
        try {
          console.log('[CommercialVideoNode] 恢复任务:', initialTaskId);
          const response = await apiClient.get(`/tasks/${initialTaskId}`);
          const task = response.task;

          if (task.status === 'SUCCESS') {
            const videoUrl = task.resultUrl;
            console.log('[CommercialVideoNode] 任务已完成，视频URL:', videoUrl);
            
            // 页面刷新恢复时，只清除 taskId，不创建预览节点
            // 因为用户可能已经手动删除了预览节点
            updateNodeData({ 
              taskId: ''
            });

            // 不自动创建预览节点
            // createPreviewNode(videoUrl);
            console.log('[CommercialVideoNode] 任务已完成，但不自动创建预览节点（用户可能已删除）');
            setIsProcessing(false);
          } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
            console.log('[CommercialVideoNode] 任务进行中，恢复轮询');
            setIsProcessing(true);
            pollTaskStatus(initialTaskId);
          } else if (task.status === 'FAILURE') {
            console.log('[CommercialVideoNode] 任务失败:', task.errorMessage);
            setIsProcessing(false);
            updateNodeData({ taskId: '' });
            toast.error(`广告成片失败: ${task.errorMessage || '未知错误'}`);
          }
        } catch (error: any) {
          console.error('[CommercialVideoNode] 任务恢复失败:', error);
          setIsProcessing(false);
          updateNodeData({ taskId: '' });
        }
      }
    };

    recoverTask();
  }, []);

  // 轮询任务状态
  const pollTaskStatus = async (taskId: string) => {
    console.log('[CommercialVideoNode] 🔄 开始轮询任务状态, taskId:', taskId);
    const maxAttempts = 120; // 最多20分钟（10秒*120）
    let attempts = 0;

    const poll = async () => {
      try {
        attempts++;
        console.log(`[CommercialVideoNode] 📡 轮询第 ${attempts} 次, taskId: ${taskId}`);
        const response = await apiClient.get(`/tasks/${taskId}`);
        const task = response.task;

        if (task.status === 'SUCCESS') {
          const videoUrl = task.resultUrl;
          console.log('[CommercialVideoNode] 任务完成，视频URL:', videoUrl);
          
          setIsProcessing(false);
          updateNodeData({ 
            taskId: ''
          });

          createPreviewNode(videoUrl);
          toast.success('广告成片完成！');
          return;
        } else if (task.status === 'FAILURE') {
          setIsProcessing(false);
          updateNodeData({ taskId: '' });
          toast.error(task.errorMessage || '广告成片失败');
          return;
        } else if (task.status === 'PROCESSING' || task.status === 'PENDING') {
          if (attempts < maxAttempts) {
            setTimeout(poll, 10000);
          } else {
            setIsProcessing(false);
            updateNodeData({ taskId: '' });
            toast.error('任务超时，请重试');
          }
        }
      } catch (error: any) {
        console.error('[CommercialVideoNode] 轮询失败:', error);
        setIsProcessing(false);
        updateNodeData({ taskId: '' });
        toast.error('查询任务状态失败');
      }
    };

    poll();
  };

  // 创建预览节点
  const createPreviewNode = (videoUrl: string) => {
    const currentNode = nodes.find(n => n.id === id);
    if (currentNode) {
      const previewNodeId = `preview-video-${Date.now()}`;
      
      const newPreviewNode = {
        id: previewNodeId,
        type: 'videoPreview',
        position: {
          x: currentNode.position.x + 400,
          y: currentNode.position.y,
        },
        data: {
          label: '广告成片',
          videoUrl: videoUrl,
          ratio: ratio,
          width: 320,  // 与广告成片节点宽度一致
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

  const handleGenerate = async () => {
    console.log('[CommercialVideoNode] 开始生成, ratio:', ratio, 'duration:', duration, 'language:', language);
    
    if (images.length === 0) {
      toast.error('请先连接至少一张图片');
      return;
    }

    if (images.length > 15) {
      toast.error('最多支持15张图片');
      return;
    }

    if (!prompt.trim()) {
      toast.error('请输入提示词');
      return;
    }

    setIsProcessing(true);

    try {
      // 获取 Vidu 模型配置
      const viduModels = await apiClient.get('/ai/models?provider=vidu&isActive=true');
      
      if (!viduModels || viduModels.length === 0) {
        toast.error('未找到可用的 Vidu 模型配置');
        setIsProcessing(false);
        return;
      }

      const viduModel = viduModels[0];

      // 创建广告成片任务
      const requestPayload = {
        images,
        prompt,
        duration,
        ratio,
        language,
        apiKey: viduModel.apiKey,
        apiUrl: viduModel.apiUrl,
      };
      
      console.log('[CommercialVideoNode] 📤 发送请求 payload:', requestPayload);
      
      const taskResponse = await apiClient.post('/ai/commercial-video', requestPayload);

      const newTaskId = taskResponse.taskId;
      const creditsCharged = taskResponse.creditsCharged || 0;
      setTaskId(newTaskId);
      updateNodeData({ 
        taskId: newTaskId,
        images,
        prompt,
        duration,
        ratio,
        language
      });
      
      // 刷新用户积分
      if (creditsCharged > 0) {
        try {
          const { useAuthStore } = await import('../../../store/authStore');
          const { refreshUser } = useAuthStore.getState();
          await refreshUser();
          toast.success(`任务已提交（已扣除 ${creditsCharged} 积分）`);
        } catch {
          toast.success('任务已提交，正在生成中...');
        }
      } else {
        toast.success('任务已提交，正在生成中...');
      }
      
      // 开始轮询任务状态
      pollTaskStatus(newTaskId);

    } catch (error: any) {
      console.error('[CommercialVideoNode] 生成失败:', error);
      
      // 权限错误 (403) 使用更友好的提示
      if (error.response?.status === 403) {
        toast.error(error.response?.data?.error || '您没有权限使用广告成片功能');
      } else {
        toast.error(error.response?.data?.error || error.message || '广告成片失败');
      }
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

      {/* 节点头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b rounded-t-2xl border-slate-200 dark:border-white/10 bg-gradient-to-r from-pink-500/20 dark:from-pink-500/20 from-pink-200/50 via-purple-500/20 dark:via-purple-500/20 via-purple-200/50 to-cyan-500/20 dark:to-cyan-500/20 to-cyan-200/50">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 0, "wght" 200, "GRAD" 0, "opsz" 20' }}>
            featured_video
          </span>
          <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-white">广告成片</span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse shadow-[0_0_5px_currentColor]"></div>
      </div>

      {/* 内容区 */}
      <div className="p-4 space-y-3">
        {/* 连接的图片数量 */}
        <div className="text-[10px] text-slate-500 dark:text-slate-400">
          已连接图片：{images.length}/15
        </div>

        {/* 提示词 */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">
            提示词
          </label>
          <textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              updateNodeData({ prompt: e.target.value });
              // 自适应高度
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            onFocus={(e) => {
              // 聚焦时也调整高度
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            ref={(el) => {
              // 初始化时调整高度
              if (el && prompt) {
                el.style.height = 'auto';
                el.style.height = el.scrollHeight + 'px';
              }
            }}
            disabled={isProcessing}
            placeholder="描述你想要的广告内容..."
            className="nodrag w-full p-2 text-xs rounded-md border outline-none resize-none transition-colors font-mono leading-relaxed bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 focus:bg-white dark:focus:bg-white/10 border-slate-200 dark:border-white/10 focus:border-purple-400 dark:focus:border-purple-400/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 overflow-hidden"
            rows={2}
          />
        </div>

        {/* 时长选择 */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">
            时长（秒）
          </label>
          <div className="grid grid-cols-3 gap-1">
            {([15, 20, 30, 40, 50, 60] as const).map((dur) => (
              <button
                key={dur}
                type="button"
                onClick={() => {
                  setDuration(dur);
                  updateNodeData({ duration: dur });
                }}
                disabled={isProcessing}
                className={`nodrag px-2 py-1 text-[10px] font-bold rounded-lg transition-all ${
                  duration === dur
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {dur}s
              </button>
            ))}
          </div>
        </div>

        {/* 比例选择 */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">
            视频比例
          </label>
          <div className="grid grid-cols-3 gap-1">
            {(['16:9', '9:16', '1:1'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRatio(r);
                  updateNodeData({ ratio: r });
                }}
                disabled={isProcessing}
                className={`nodrag px-2 py-1 text-[10px] font-bold rounded-lg transition-all ${
                  ratio === r
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* 语言选择 */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">
            语言
          </label>
          <div className="grid grid-cols-2 gap-1">
            {([
              { value: 'zh', label: '中文' },
              { value: 'en', label: 'English' }
            ] as const).map((lang) => (
              <button
                key={lang.value}
                type="button"
                onClick={() => {
                  setLanguage(lang.value);
                  updateNodeData({ language: lang.value });
                }}
                disabled={isProcessing}
                className={`nodrag px-2 py-1 text-[10px] font-bold rounded-lg transition-all ${
                  language === lang.value
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        {/* 生成按钮 */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isProcessing || images.length === 0 || !prompt.trim() || (data as any)._canEdit === false}
          className={`w-full px-4 py-2.5 text-[11px] font-bold rounded-xl transition-all ${
            isProcessing || images.length === 0 || !prompt.trim() || (data as any)._canEdit === false
              ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]'
          }`}
        >
          <div className="flex items-center justify-center space-x-2">
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Film className="w-4 h-4" />
            )}
            <span>{isProcessing ? '生成中...' : '开始生成'}</span>
            {/* 积分显示 */}
            {!isProcessing && !creditsLoading && credits !== null && credits > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-[9px]">
                {credits}积分
              </span>
            )}
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

export default memo(CommercialVideoNode);
