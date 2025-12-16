import { useState, useCallback, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps, useReactFlow, Node, useEdges, useNodes } from 'reactflow';
import { Loader2, Sparkles, Image as ImageIcon } from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { toast } from 'sonner';
import CustomSelect from './CustomSelect';
import { useBillingEstimate } from '../../../hooks/useBillingEstimate';
import NodeCreatorBadge from '../NodeCreatorBadge';

interface MidjourneyNodeData {
  prompt?: string;
  ratio?: string; // 宽高比
  mode?: 'relax' | 'fast'; // 生成模式
  chaos?: number; // 混乱度 0-100
  stylize?: number; // 风格化 0-1000
  weird?: number; // 怪异度 0-3000
  quality?: number; // 质量 0.25/0.5/1/2
  styleRaw?: boolean; // 原始风格
  omniWeight?: number; // Omni-Reference 权重 0-1000
  styleWeight?: number; // Style-Reference 权重 0-1000
  taskId?: string;
  messageId?: string; // Discord消息ID
  messageHash?: string; // Discord消息Hash
  status?: 'idle' | 'submitting' | 'processing' | 'success' | 'error';
  imageUrl?: string;
  progress?: string;
  buttons?: Array<{
    customId: string;
    emoji: string;
    label: string;
    type: number;
    style: number;
  }>;
  referenceImages?: string[]; // 垫图（已废弃）
  omniReferenceImages?: string[]; // V7 Omni-Reference 参考图列表
  styleReferenceImages?: string[]; // V7 Style-Reference 参考图列表
  workflowContext?: any;
  isExpanded?: boolean;
  createdBy?: { id: string; nickname?: string; avatar?: string } | string;
  _isSharedWorkflow?: boolean;
}

const MidjourneyNode = ({ data, selected, id }: NodeProps<MidjourneyNodeData>) => {
  const { setNodes, setEdges, getNode, getNodes, getEdges, getViewport } = useReactFlow();
  const edges = useEdges();
  const allNodes = useNodes();
  const [isExpanded] = useState(data.isExpanded ?? true);
  const [prompt, setPrompt] = useState(data.prompt || '');
  const [ratio, setRatio] = useState(data.ratio || '16:9');
  const [mode, setMode] = useState<'relax' | 'fast'>(data.mode || 'relax');
  const [chaos, setChaos] = useState(data.chaos ?? 0);
  const [stylize, setStylize] = useState(data.stylize ?? 100);
  const [weird, setWeird] = useState(data.weird ?? 0);
  const [quality, setQuality] = useState(data.quality ?? 1);
  const [styleRaw, setStyleRaw] = useState(data.styleRaw ?? false);
  const [omniWeight, setOmniWeight] = useState(data.omniWeight ?? 100);
  const [styleWeight, setStyleWeight] = useState(data.styleWeight ?? 100);
  const [, setTaskId] = useState(data.taskId || '');
  // 保持状态，不要重置（用于任务恢复）
  const [status, setStatus] = useState<'idle' | 'submitting' | 'processing' | 'success' | 'error'>(data.status || 'idle');
  const [progress, setProgress] = useState(data.progress || '');
  const [omniReferenceImages, setOmniReferenceImages] = useState<string[]>(data.omniReferenceImages || []);
  const [styleReferenceImages, setStyleReferenceImages] = useState<string[]>(data.styleReferenceImages || []);
  const [fastModeEnabled, setFastModeEnabled] = useState(true); // Fast 模式是否可用

  // 获取 Midjourney 设置（Fast 模式是否可用）
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await apiClient.midjourney.getSettings();
        setFastModeEnabled(response.settings?.fastEnabled ?? true);
      } catch (error) {
        console.error('获取 Midjourney 设置失败:', error);
      }
    };
    fetchSettings();
  }, []);

  // 积分估算（根据模式动态计算）
  const { credits, isFreeUsage, freeUsageRemaining, refetch: refetchEstimate } = useBillingEstimate({
    moduleType: 'midjourney',
    operationType: 'imagine',  // 小写，匹配数据库
    mode: mode,                 // 'fast' 或 'relax'，匹配数据库
  });

  // Ref for auto-resizing textarea
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const userEditedPromptRef = useRef<boolean>(false);
  
  // Ref for pollTaskStatus to avoid stale closure
  const pollTaskStatusRef = useRef<(taskId: string) => void>(() => {});

  // 外部广播到 data.prompt 时，强制同步到本地输入框（覆盖旧文本）
  useEffect(() => {
    if (typeof data.prompt === 'string' && data.prompt !== prompt) {
      setPrompt(data.prompt);
    }
  }, [data.prompt]);

  // 更新节点数据
  const updateNodeData = (updates: Partial<MidjourneyNodeData>) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, ...updates } }
          : node
      )
    );
  };

  // 页面加载时恢复进行中的任务（只运行一次）
  useEffect(() => {
    const initialTaskId = data.taskId;
    const initialStatus = data.status;

    const recoverTask = async () => {
      // 如果有taskId且状态是processing或submitting，说明有未完成的任务
      if (initialTaskId && (initialStatus === 'processing' || initialStatus === 'submitting')) {
        console.log('🔄 [MidjourneyNode] 检测到未完成的任务，准备恢复:', {
          taskId: initialTaskId,
          status: initialStatus,
        });

        try {
          // 先查询一次任务状态，看任务是否还存在
          const response = await apiClient.midjourney.fetchTask(initialTaskId);
          const task = response.task;

          console.log('📋 [MidjourneyNode] 任务当前状态:', {
            status: task.status,
            progress: task.progress,
            hasImageUrl: !!task.imageUrl,
          });

          if (task.status === 'SUCCESS') {
            // 任务已完成，直接处理结果
            console.log('✅ [MidjourneyNode] 任务已完成，显示结果', {
              hasImageUrl: !!task.imageUrl,
              savedRatio: data.ratio,
            });
            const generatedImageUrl = task.imageUrl || '';
            const msgId = task.properties?.messageId || '';
            const msgHash = task.properties?.messageHash || '';

            // 使用保存在node data中的ratio（页面刷新前保存的）
            const savedRatio = data.ratio || '16:9';

            setStatus('idle');
            setProgress('');
            updateNodeData({
              status: 'idle',
              progress: '',
              taskId: '', // 清除taskId，任务已完成
            });

            // 检查是否已存在该任务的预览节点（防止重复创建）
            // ⚠️ 关键：必须同时匹配 taskId/messageId 和 sourceNodeId，确保父子关系正确
            const allNodes = getNodes();
            const existingPreviewNode = allNodes.find((node: any) =>
              node.type === 'imagePreview' &&
              node.data.midjourneyData?.sourceNodeId === id && // 必须来自当前 Midjourney 节点
              ((node.data.midjourneyData?.taskId === initialTaskId) ||
                (msgId && node.data.midjourneyData?.messageId === msgId))
            );

            if (existingPreviewNode) {
              toast.info('任务已完成，图片已在预览节点中');
              return;
            }

            toast.success('🎨 Midjourney 图片已生成完成！');

            

            // 创建预览节点（使用保存的ratio）
            createPreviewNode(generatedImageUrl, '4宫格', savedRatio, {
              taskId: initialTaskId,
              messageId: msgId,
              messageHash: msgHash,
              mode: data.mode || 'relax', // 🔑 继承主节点的模式
              buttons: task.buttons,
              action: task.action,
            });
          } else if (task.status === 'IN_PROGRESS' || task.status === 'SUBMITTED') {
            // 任务还在进行中，恢复轮询
            console.log('🔄 [MidjourneyNode] 任务进行中，恢复轮询');
            setStatus('processing');
            // 使用 setTimeout 确保 pollTaskStatusRef 已更新
            setTimeout(() => {
              pollTaskStatusRef.current(initialTaskId);
            }, 100);
          } else if (task.status === 'FAILURE') {
            // 任务失败
            
            setStatus('error');
            setProgress('');
            updateNodeData({ status: 'error', progress: '', taskId: '' });
            toast.error(task.failReason ? `生成遇到问题：${task.failReason}` : '生成未能完成，请稍后重试');
          } else if (task.status === 'NOT_FOUND') {
            // 任务不存在，重置状态
            
            setStatus('idle');
            setProgress('');
            updateNodeData({ status: 'idle', progress: '', taskId: '' });
          }
        } catch (error: any) {
          console.error('❌ [MidjourneyNode] 任务恢复失败:', error);
          // 查询失败，重置状态
          setStatus('idle');
          setProgress('');
          updateNodeData({ status: 'idle', progress: '', taskId: '' });
          toast.error('无法恢复之前的任务，请重新生成');
        }
      }
    };

    recoverTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时执行一次

  // 从输入边获取参考图和文本（根据不同的 Handle 区分类型）
  const refreshInputs = useCallback(() => {
    const incomingEdges = edges.filter((edge) => edge.target === id);
    const newOmniImages: string[] = [];
    const newStyleImages: string[] = [];
    let newTextInput = '';

    incomingEdges.forEach((edge) => {
      const sourceNode = getNode(edge.source);
      if (sourceNode) {
        const sourceData = sourceNode.data as any;
        const targetHandle = edge.targetHandle || 'omni-ref'; // 默认为 omni-ref（兼容旧版）

        // 处理文本输入
        if (targetHandle === 'text-input') {
          if (sourceNode.type === 'agent') {
            const textContent = sourceData.config?.generatedText || '';
            if (textContent && typeof textContent === 'string') {
              newTextInput = textContent;
            }
          }
        } else {
          // 处理图片输入
          let imageUrl = sourceData.imageUrl || '';

          if (!imageUrl && sourceData.config?.selectedAsset) {
            const asset = sourceData.config.selectedAsset;
            if (asset.type === 'IMAGE') {
              const API_URL = import.meta.env.VITE_API_URL || '';
              imageUrl = `${API_URL}${asset.url}`.replace('.oss-oss-', '.oss-');
            }
          }

          if (!imageUrl && sourceData.config?.generatedImageUrl) {
            imageUrl = sourceData.config.generatedImageUrl;
          }

          // 资产选择器：处理角色/物体与风格参考
          if (sourceNode.type === 'assetSelector') {
            const API_URL = import.meta.env.VITE_API_URL || '';
            const normalize = (u: string) => {
              let url = u || '';
              if (!url) return url;
              if (!url.startsWith('http') && !url.startsWith('data:')) url = `${API_URL}${url}`;
              url = url.replace('.oss-oss-', '.oss-');
              return url.replace(/^https?:\/\/localhost(?::\d+)?/i, API_URL);
            };
            const subjects = sourceData.config?.subjects as Array<{ name: string; images: string[] }> | undefined;
            const refImgs = sourceData.config?.referenceImages as Array<{ id: string; url: string; name: string }> | undefined;
            if (targetHandle === 'omni-ref') {
              // 角色/物体：仅接收单图（有多张只取第一张）
              let firstUrl = '';
              if (subjects && subjects.length > 0 && subjects[0].images && subjects[0].images.length > 0) {
                firstUrl = normalize(subjects[0].images[0]);
              } else if (refImgs && refImgs.length > 0) {
                firstUrl = normalize(refImgs[0].url);
              } else if (sourceData.config?.selectedAsset && sourceData.config.selectedAsset.type === 'IMAGE') {
                firstUrl = normalize(sourceData.config.selectedAsset.url);
              }
              if (firstUrl && !newOmniImages.includes(firstUrl) && newOmniImages.length < 1) newOmniImages.push(firstUrl);
            } else if (targetHandle === 'style-ref') {
              // 风格参考：仅接收单图（有多张只取第一张）；无图不显示占位
              let firstStyle = '';
              if (subjects && subjects.length > 0 && subjects[0].images && subjects[0].images.length > 0) {
                firstStyle = normalize(subjects[0].images[0]);
              } else if (refImgs && refImgs.length > 0) {
                firstStyle = normalize(refImgs[0].url);
              } else if (sourceData.config?.selectedAsset && sourceData.config.selectedAsset.type === 'IMAGE') {
                firstStyle = normalize(sourceData.config.selectedAsset.url);
              }
              if (firstStyle && !newStyleImages.includes(firstStyle) && newStyleImages.length < 1) newStyleImages.push(firstStyle);
            }
          }

          // 上传节点：读取第一张图片，按句柄分别接收单张
          if (sourceNode.type === 'upload') {
            const API_URL = import.meta.env.VITE_API_URL || '';
            const normalize = (u: string) => {
              let url = u || '';
              if (!url) return url;
              if (!url.startsWith('http') && !url.startsWith('data:')) url = `${API_URL}${url}`;
              url = url.replace('.oss-oss-', '.oss-');
              return url.replace(/^https?:\/\/localhost(?::\d+)?/i, API_URL);
            };
            const files = sourceData.config?.uploadedFiles || [];
            const firstImg = files.find((f: any) => f.type === 'IMAGE' || (f.mimeType || '').startsWith('image/'));
            if (firstImg) {
              const nu = normalize(firstImg.url);
              if (targetHandle === 'omni-ref') {
                if (nu && !newOmniImages.includes(nu) && newOmniImages.length < 1) newOmniImages.push(nu);
              } else if (targetHandle === 'style-ref') {
                if (nu && !newStyleImages.includes(nu) && newStyleImages.length < 1) newStyleImages.push(nu);
              }
            }
          }

          if (imageUrl) {
            if (targetHandle === 'omni-ref' && !newOmniImages.includes(imageUrl)) {
              newOmniImages.push(imageUrl);
            } else if (targetHandle === 'style-ref' && !newStyleImages.includes(imageUrl)) {
              newStyleImages.push(imageUrl);
            }
          }
        }
      }
    });

    // 更新文本输入（仅在用户未手动编辑时覆盖）
    if (newTextInput && newTextInput !== prompt && !userEditedPromptRef.current) {
      
      setPrompt(newTextInput);
      updateNodeData({ prompt: newTextInput });
    }

    const isValid = (u: string) => {
      if (!u || typeof u !== 'string') return false;
      const s = u.trim();
      if (!s) return false;
      if (s.startsWith('data:image/')) return true;
      // 宽松验证：只要是 http 开头或 / 开头的路径，都认为是有效的
      // 因为内部 API 返回的图片 URL 可能不带扩展名
      if (/^https?:\/\//.test(s) || s.startsWith('/')) {
        return true;
      }
      return false;
    };
    const filteredOmni = newOmniImages.filter(isValid).slice(0, 1);
    const filteredStyle = newStyleImages.filter(isValid).slice(0, 1);
    // 更新 Omni-Reference 参考图（断开连接时清空）
    if (JSON.stringify(filteredOmni) !== JSON.stringify(omniReferenceImages)) {
      setOmniReferenceImages(filteredOmni);
      updateNodeData({ omniReferenceImages: filteredOmni });
    }
    // 更新 Style-Reference 参考图（断开连接时清空）
    if (JSON.stringify(filteredStyle) !== JSON.stringify(styleReferenceImages)) {
      setStyleReferenceImages(filteredStyle);
      updateNodeData({ styleReferenceImages: filteredStyle });
    }
  }, [edges, id, getNode, allNodes, prompt, userEditedPromptRef.current]);

  // 监听输入边和节点数据的变化，自动更新输入
  useEffect(() => {
    refreshInputs();
  }, [refreshInputs]);

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
  }, [prompt, isExpanded]);

  // 获取高分辨率图片URL
  // 注意：Discord的图片URL查询参数是必需的，不能全部移除
  // 只移除width和height参数（如果存在），保留其他必需的参数
  const getHighResImageUrl = (url: string): string => {
    try {
      const urlObj = new URL(url);
      const params = new URLSearchParams(urlObj.search);

      // 只移除width和height参数（如果存在）
      if (params.has('width') || params.has('height')) {
        params.delete('width');
        params.delete('height');
        urlObj.search = params.toString();
        return urlObj.toString();
      }

      // 如果没有width/height参数，直接返回原URL
      return url;
    } catch {
      // 如果不是有效URL，直接返回原URL
      return url;
    }
  };

  // 根据宽高比计算预览尺寸
  const getPreviewSize = (ratio: string): { width: number; height: number } => {
    // 默认尺寸
    const baseSize = 512;

    // 解析宽高比
    const [w, h] = ratio.split(':').map(Number);
    if (!w || !h) {
      return { width: baseSize, height: baseSize };
    }

    // 计算实际尺寸，保持最大边为512
    const aspectRatio = w / h;
    if (aspectRatio >= 1) {
      // 横向或正方形
      return { width: baseSize, height: Math.round(baseSize / aspectRatio) };
    } else {
      // 纵向
      return { width: Math.round(baseSize * aspectRatio), height: baseSize };
    }
  };

  // 创建图片预览节点
  const createPreviewNode = useCallback((
    imageUrl: string,
    label: string,
    currentRatio: string, // 明确传递ratio
    midjourneyData?: {
      taskId?: string;
      messageId?: string;
      messageHash?: string;
      mode?: 'relax' | 'fast'; // 🔑 继承主节点的模式
      buttons?: Array<{
        customId: string;
        emoji: string;
        label: string;
        type: number;
        style: number;
      }>;
      action?: string;
    }
  ) => {
    const currentNode = getNode(id);
    if (!currentNode) return;

    // 对于UPSCALE操作，尝试移除width/height参数（如果存在），但保留其他必需的查询参数
    const highResUrl = label.startsWith('U') ? getHighResImageUrl(imageUrl) : imageUrl;

    // ✅ 去重检查：如果已经存在相同 URL 的预览节点，不要重复创建
    const allNodes = getNodes();
    const allEdges = getEdges();
    const connectedPreviewNodes = allNodes.filter(node => {
      return node.type === 'imagePreview' && allEdges.some(edge =>
        edge.source === id && edge.target === node.id
      );
    });

    const existingNode = connectedPreviewNodes.find(node => node.data.imageUrl === highResUrl);
    if (existingNode) {
      console.log('⚠️ [MidjourneyNode] 预览节点已存在，跳过创建:', {
        imageUrl: highResUrl,
        label,
        existingNodeId: existingNode.id,
      });
      return; // 直接返回，不创建新节点
    }

    // Midjourney 预览节点使用固定宽度（与节点宽度一致），让图片自适应高度
    const previewWidth = 400;

    console.log('🎨 [创建预览节点]', {
      label,
      ratio: currentRatio,
      width: previewWidth,
      note: '宽度固定，高度自适应',
    });

    const SPACING_X = 200;
    const SPACING_Y = 100;
    const measure = (node: Node) => {
      const zoom = getViewport().zoom || 1;
      const el = document.querySelector(`.react-flow__node[data-id="${node.id}"]`) as HTMLElement | null;
      const wPx = el?.getBoundingClientRect().width || (node.data && (node.data as any).width) || 400;
      const hPx = el?.getBoundingClientRect().height || (node.data && (node.data as any).height) || 300;
      const w = Math.round(wPx / zoom);
      const h = Math.round(hPx / zoom);
      return { w, h };
    };
    const parseRatio = (r?: string, defaultH = 300) => {
      if (!r || !/^[0-9]+\s*:\s*[0-9]+$/.test(r)) return defaultH;
      const [rw, rh] = r.split(':').map((v) => parseFloat(v));
      if (!rw || !rh) return defaultH;
      return Math.round(previewWidth * (rh / rw));
    };
    const parentSize = measure(currentNode);
    const targetH = parseRatio(currentRatio, 300);
    const baseX = currentNode.position.x + parentSize.w + SPACING_X;
    const baseY = currentNode.position.y;
    const existingCount = getNodes().filter((n) => n.type === 'imagePreview' && (n.data as any)?.midjourneyData?.sourceNodeId === id).length;
    const posX = baseX;
    const posY = baseY + existingCount * (targetH + SPACING_Y);
    const newNodeId = `preview-${Date.now()}`;
    const newNode: Node = {
      id: newNodeId,
      type: 'imagePreview',
      position: { x: posX, y: posY },
      data: {
        imageUrl: highResUrl,
        width: previewWidth,
        ratio: currentRatio,
        workflowContext: currentNode.data.workflowContext,
        createdBy: currentNode.data.createdBy, // 🔑 继承父节点的创建者信息（协作者拖动权限）
        midjourneyData: midjourneyData
          ? {
            taskId: midjourneyData.taskId,
            messageId: midjourneyData.messageId,
            messageHash: midjourneyData.messageHash,
            sourceNodeId: id,
            mode: midjourneyData.mode, // 🔑 继承主节点的模式
            buttons: midjourneyData.buttons,
            action: midjourneyData.action,
          }
          : undefined,
      },
    };

    setNodes((nds) => [...nds, newNode]);
    setEdges((eds) => [
      ...eds,
      {
        id: `${id}-${newNodeId}`,
        source: id,
        target: newNodeId,
        type: 'aurora', // 使用 aurora 类型，显示彩色渐变动态线
        animated: true,
        style: { stroke: 'currentColor', strokeWidth: 2 },
      },
    ]);

    toast.success(`✨ 已创建${label}预览节点`);
  }, [id, getNode, getNodes, getEdges, setNodes, setEdges, getHighResImageUrl, getPreviewSize]);

  // 提交 Imagine 任务
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      toast.error('请先输入创作描述~');
      return;
    }

    // 重置状态和进度
    setStatus('submitting');
    setProgress('');
    updateNodeData({ status: 'submitting', progress: '' });

    try {
      // 检测提示词中是否包含参数（避免用户绕开设置）
      const forbiddenParams = ['--ar', '--v', '--version', '--fast', '--relax', '--turbo', '--style', '--chaos', '--c', '--stylize', '--s', '--weird', '--w', '--quality', '--q', '--no', '--seed'];
      const lowerPrompt = prompt.toLowerCase();
      const foundParam = forbiddenParams.find(param => lowerPrompt.includes(param));

      if (foundParam) {
        toast.error(`检测到参数 "${foundParam}"，请使用下方的配置选项来设置`, { duration: 4000 });
        setStatus('idle');
        updateNodeData({ status: 'idle', progress: '', taskId: '' });
        return;
      }

      setStatus('submitting');

      // 智能翻译：如果不是英文，自动翻译成英文
      let translatedPrompt = prompt;
      try {
        toast.info('正在智能翻译中...');
        const translationResponse = await apiClient.translation.smartTranslate({ text: prompt });

        if (translationResponse.success) {
          translatedPrompt = translationResponse.translatedText;

          if (translationResponse.needsTranslation) {
            console.log('🌐 [MidjourneyNode] 翻译完成:', {
              original: prompt,
              translated: translatedPrompt,
              detectedLanguage: translationResponse.detectedLanguage,
            });
            toast.success(`✨ 已自动翻译为英文`, { duration: 3000 });
          } else {
            console.log('✅ [MidjourneyNode] 检测到英文，无需翻译');
          }
        }
      } catch (error: any) {
        console.error('❌ [MidjourneyNode] 翻译失败:', error);
        // 翻译失败不阻止生成，继续使用原文
        toast.warning('翻译暂不可用，将使用原始描述', { duration: 3000 });
      }

      toast.info('🎨 正在提交创作任务...');

      // 构建完整提示词（使用翻译后的文本）
      let fullPrompt = translatedPrompt.trim();

      // 添加宽高比参数
      if (ratio && ratio !== '1:1' && !fullPrompt.includes('--ar')) {
        fullPrompt += ` --ar ${ratio}`;
      }

      // 添加版本参数（固定v7.0）
      if (!fullPrompt.includes('--v') && !fullPrompt.includes('--version')) {
        fullPrompt += ` --v 7.0`;
      }

      // 添加模式参数
      if (mode === 'fast' && !fullPrompt.includes('--fast')) {
        fullPrompt += ` --fast`;
      } else if (mode === 'relax' && !fullPrompt.includes('--relax')) {
        fullPrompt += ` --relax`;
      }

      // 添加高级参数
      if (chaos > 0) {
        fullPrompt += ` --chaos ${chaos}`;
      }
      if (stylize !== 100) {
        fullPrompt += ` --stylize ${stylize}`;
      }
      if (weird > 0) {
        fullPrompt += ` --weird ${weird}`;
      }
      if (quality !== 1) {
        fullPrompt += ` --quality ${quality}`;
      }
      if (styleRaw) {
        fullPrompt += ` --style raw`;
      }

      // V7 Omni-Reference: 上传参考图到 Discord 并添加 --oref 参数
      if (omniReferenceImages.length > 0) {
        toast.info(`正在上传 ${omniReferenceImages.length} 张参考图...`);

        const discordUrls: string[] = [];
        for (let i = 0; i < omniReferenceImages.length; i++) {
          const imageUrl = omniReferenceImages[i];
          try {
            console.log(`📤 [MidjourneyNode] 上传参考图 ${i + 1}/${omniReferenceImages.length}:`, imageUrl);

            const uploadResponse = await apiClient.midjourney.uploadReferenceImage({
              imageUrl: imageUrl,
            });

            if (uploadResponse.success && uploadResponse.discordUrl) {
              discordUrls.push(uploadResponse.discordUrl);
              console.log(`✅ [MidjourneyNode] 参考图 ${i + 1} 上传成功:`, uploadResponse.discordUrl);
            } else {
              throw new Error('上传失败：未返回 Discord URL');
            }
          } catch (error: any) {
            console.error(`❌ [MidjourneyNode] 参考图 ${i + 1} 上传失败:`, error);
            toast.error(`参考图 ${i + 1} 上传失败，请检查图片格式`);
            setStatus('idle');
            return;
          }
        }

        // 添加 --oref 参数（支持多张参考图）
        fullPrompt += ` --oref ${discordUrls.join(' ')}`;

        // 添加 --ow 参数（权重）
        if (omniWeight !== 100) {
          fullPrompt += ` --ow ${omniWeight}`;
        }

        console.log('🖼️ [MidjourneyNode] Omni-Reference 参数已添加');
        toast.success('✅ 参考图上传完成');
      }

      // V7 Style-Reference: 上传风格参考图到 Discord 并添加 --sref 参数
      if (styleReferenceImages.length > 0) {
        toast.info(`正在上传 ${styleReferenceImages.length} 张风格图...`);

        const discordUrls: string[] = [];
        for (let i = 0; i < styleReferenceImages.length; i++) {
          const imageUrl = styleReferenceImages[i];
          try {
            console.log(`📤 [MidjourneyNode] 上传风格参考图 ${i + 1}/${styleReferenceImages.length}:`, imageUrl);

            const uploadResponse = await apiClient.midjourney.uploadReferenceImage({
              imageUrl: imageUrl,
            });

            if (uploadResponse.success && uploadResponse.discordUrl) {
              discordUrls.push(uploadResponse.discordUrl);
              console.log(`✅ [MidjourneyNode] 风格参考图 ${i + 1} 上传成功:`, uploadResponse.discordUrl);
            } else {
              throw new Error('上传失败：未返回 Discord URL');
            }
          } catch (error: any) {
            console.error(`❌ [MidjourneyNode] 风格参考图 ${i + 1} 上传失败:`, error);
            toast.error(`风格图 ${i + 1} 上传失败，请检查图片格式`);
            setStatus('idle');
            return;
          }
        }

        // 添加 --sref 参数
        fullPrompt += ` --sref ${discordUrls.join(' ')}`;

        // 添加 --sw 参数（权重）
        if (styleWeight !== 100) {
          fullPrompt += ` --sw ${styleWeight}`;
        }

        console.log('🎨 [MidjourneyNode] Style-Reference 参数已添加');
        toast.success('✅ 风格图上传完成');
      }

      console.log('📝 [MidjourneyNode] 完整提示词:', fullPrompt);
      console.log('🔑 [MidjourneyNode] 节点ID:', id);

      // 提交任务，传递节点ID和模式用于精确追踪和权限检查
      const response = await apiClient.midjourney.imagine({
        prompt: fullPrompt,
        nodeId: id, // 🔑 传递节点ID，确保并发场景下的精确匹配
        mode, // 传递模式用于权限检查
      });

      if (!response.success) {
        throw new Error(response.description || '任务提交失败');
      }

      const newTaskId = response.taskId;
      setTaskId(newTaskId);
      setStatus('processing');

      // 保存任务ID和当前配置到node data（用于页面刷新恢复）
      updateNodeData({
        taskId: newTaskId,
        status: 'processing',
        progress: '',
        prompt,
        ratio,
        mode,
        chaos,
        stylize,
        weird,
        quality,
        styleRaw,
        omniWeight,
        styleWeight,
      });

      // 显示提示并刷新剩余次数
      const respIsFree = response.isFreeUsage;
      const respCredits = response.creditsCharged || 0;
      
      if (respIsFree) {
        toast.success(`🎁 免费创作中，今日还剩 ${freeUsageRemaining} 次机会`);
        refetchEstimate();
      } else if (respCredits > 0) {
        // 扣除积分，刷新用户积分
        const { useAuthStore } = await import('../../../store/authStore');
        const { refreshUser } = useAuthStore.getState();
        await refreshUser();
        toast.success(`🎨 创作已开始，消耗 ${respCredits} 积分`);
        refetchEstimate();
      } else {
        toast.success('🎨 创作已开始，请稍候...');
      }

      // 开始轮询任务状态
      console.log('🚀 [MidjourneyNode] 开始轮询, taskId:', newTaskId, 'ref有效:', !!pollTaskStatusRef.current);
      pollTaskStatusRef.current(newTaskId);
    } catch (error: any) {
      console.error('❌ [MidjourneyNode] 任务提交失败:', error);
      setStatus('error');
      setProgress('');
      updateNodeData({ status: 'error', progress: '', taskId: '' });

      // 权限错误 (403) 使用更友好的提示
      if (error.response?.status === 403) {
        const errMsg = error.response?.data?.error || '当前账户暂无 Midjourney 功能权限';
        toast.error(errMsg);
        return;
      }

      // 任务限制错误 (429)
      if (error.response?.status === 429) {
        toast.warning(error.response?.data?.error || '您已有一个任务进行中，请等待完成后再试');
        return;
      }

      // 显示更友好的错误信息
      const errorMsg = error.response?.data?.description || error.response?.data?.error || error.message;
      const bannedWord = error.response?.data?.bannedWord;

      if (bannedWord) {
        toast.error(`检测到敏感词 "${bannedWord}"，请修改描述`, { duration: 5000 });
      } else {
        toast.error(`创作启动失败：${errorMsg}，请稍后重试`);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, ratio, mode, chaos, stylize, weird, quality, styleRaw, omniReferenceImages, omniWeight, styleReferenceImages, styleWeight, updateNodeData, isFreeUsage, freeUsageRemaining, refetchEstimate]);

  // 轮询任务状态
  const pollTaskStatus = useCallback(async (taskId: string) => {
    let attempts = 0;
    const maxAttempts = 150; // 5分钟（2秒 * 150次）
    const pollInterval = 2000; // 2秒

    const poll = async () => {
      try {
        const response = await apiClient.midjourney.fetchTask(taskId);
        const task = response.task;

        console.log(`🔍 [MidjourneyNode] 轮询 ${attempts + 1}/${maxAttempts}`, {
          taskId: taskId,
          status: task.status,
          progress: task.progress,
          progressType: typeof task.progress,
          progressIsEmpty: !task.progress,
          hasImageUrl: !!task.imageUrl,
          hasButtons: !!(task.buttons && task.buttons.length > 0),
        });

        // 检查是否为成功状态
        if (task.status === 'SUCCESS') {
          console.log('✅ [MidjourneyNode] 检测到 SUCCESS 状态，准备处理...');
          const generatedImageUrl = task.imageUrl || '';
          const msgId = task.properties?.messageId || '';
          const msgHash = task.properties?.messageHash || '';

          console.log('✅ [MidjourneyNode] 生成完成，imageUrl:', generatedImageUrl);
          console.log('🔘 [MidjourneyNode] messageId:', msgId);
          console.log('🔘 [MidjourneyNode] messageHash:', msgHash);
          console.log('🔘 [MidjourneyNode] buttons数量:', task.buttons?.length || 0);
          console.log('🔘 [MidjourneyNode] buttons详情:', task.buttons);

          // 重置为 idle 状态，清空进度
          setStatus('idle');
          setProgress('');

          // 更新节点数据，确保清空所有进度相关状态和taskId
          updateNodeData({
            status: 'idle',
            taskId: '', // 清除taskId，任务已完成
            progress: '', // 清空进度
          });

          // 检查是否已存在该任务的预览节点（防止重复创建）
          // ⚠️ 关键：必须同时匹配 taskId/messageId 和 sourceNodeId，确保父子关系正确
          const allNodes = getNodes();
          const existingPreviewNode = allNodes.find((node: any) =>
            node.type === 'imagePreview' &&
            node.data.midjourneyData?.sourceNodeId === id && // 必须来自当前 Midjourney 节点
            ((node.data.midjourneyData?.taskId === taskId) ||
              (msgId && node.data.midjourneyData?.messageId === msgId))
          );

          if (existingPreviewNode) {
            console.log('⚠️ [MidjourneyNode] 该任务的预览节点已存在，跳过创建', {
              taskId: taskId,
              messageId: msgId,
              existingNodeId: existingPreviewNode.id,
              sourceNodeId: id,
            });
            toast.info('任务已完成，图片已在预览节点中');
            return;
          }

          toast.success('🎨 Midjourney 图片已生成完成！');

          console.log('📐 [准备创建预览] 当前ratio值:', ratio);

          // 自动创建预览节点显示4宫格图片
          createPreviewNode(generatedImageUrl, '4宫格', ratio, {
            taskId: taskId,
            messageId: msgId,
            messageHash: msgHash,
            mode, // 🔑 继承主节点的模式
            buttons: task.buttons,
            action: task.action,
          });

          return;
        }

        // 对于非SUCCESS状态，更新进度
        const currentProgress = task.progress || '';
        console.log(`📊 [MidjourneyNode] 设置进度为:`, currentProgress);
        setProgress(currentProgress);

        // 同时更新节点数据中的进度，确保UI响应
        if (task.status === 'IN_PROGRESS' || task.status === 'SUBMITTED') {
          setStatus('processing');
          updateNodeData({
            status: 'processing',
            progress: currentProgress,
          });
        }

        if (task.status === 'FAILURE') {
          setStatus('error');
          setProgress('');
          updateNodeData({ status: 'error', progress: '', taskId: '' });
          toast.error(task.failReason ? `生成遇到问题：${task.failReason}` : '生成未能完成，请稍后重试');
          return;
        }

        if (task.status === 'NOT_FOUND') {
          setStatus('error');
          setProgress('');
          updateNodeData({ status: 'error', progress: '', taskId: '' });
          toast.error('任务已失效，请重新生成');
          return;
        }

        // 继续轮询
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, pollInterval);
        } else {
          setStatus('error');
          setProgress('');
          updateNodeData({ status: 'error', progress: '', taskId: '' });
          toast.error('任务仍在生成中，请刷新页面查看结果');
        }
      } catch (error: any) {
        // 网络中断或请求取消时，静默重试
        const isNetworkError = error.code === 'ECONNABORTED' || 
                               error.code === 'ERR_NETWORK' ||
                               error.message?.includes('aborted') ||
                               error.message?.includes('Network Error');
        
        if (isNetworkError && attempts < maxAttempts - 1) {
          console.warn('⚠️ [MidjourneyNode] 网络中断，稍后重试...', error.code);
          attempts++;
          setTimeout(poll, pollInterval * 2); // 网络错误时延长间隔
          return;
        }
        
        console.error('❌ [MidjourneyNode] 轮询失败:', error);
        setStatus('error');
        setProgress('');
        updateNodeData({ status: 'error', progress: '', taskId: '' });
        toast.error('网络波动，请刷新页面查看生成结果');
      }
    };

    poll();
  }, [id, ratio, createPreviewNode, updateNodeData, getNodes]);

  // 同步更新 ref（不用 useEffect，避免异步问题）
  pollTaskStatusRef.current = pollTaskStatus;

  return (
    <div
      className={`relative bg-white/80 dark:bg-black/60 backdrop-blur-xl border rounded-2xl shadow-xl transition-all ring-1 ${selected ? 'border-purple-400 shadow-purple-400/50' : 'border-white/60 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'}`}
      style={{ width: 320 }}
    >
      {/* 创建者头像徽章 */}
      <NodeCreatorBadge createdBy={data.createdBy} isSharedWorkflow={data._isSharedWorkflow} />
      
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b rounded-t-2xl border-slate-200 dark:border-white/10 bg-gradient-to-r from-pink-500/20 dark:from-pink-500/20 from-pink-200/50 via-purple-500/20 dark:via-purple-500/20 via-purple-200/50 to-cyan-500/20 dark:to-cyan-500/20 to-cyan-200/50">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-800 dark:text-white" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 0, "wght" 200, "GRAD" 0, "opsz" 20' }}>auto_awesome</span>
          <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-white">Midjourney</span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse shadow-[0_0_5px_currentColor]"></div>
      </div>

      {/* 内容区 */}
      {isExpanded && (
        <div className="p-4 space-y-3">
          {/* Prompt 输入 */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">提示词</label>
            <textarea
              ref={promptTextareaRef}
              value={prompt}
              onChange={(e) => {
                userEditedPromptRef.current = true;
                setPrompt(e.target.value);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="描述你想生成的图片..."
              className="nodrag w-full p-2 text-xs rounded-md border outline-none resize-none overflow-hidden transition-colors font-mono leading-relaxed bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 focus:bg-white dark:focus:bg-white/10 border-slate-200 dark:border-white/10 focus:border-purple-400 dark:focus:border-purple-400/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30"
              style={{ minHeight: '60px' }}
              disabled={status === 'processing' || status === 'submitting'}
            />
          </div>

          {/* 生成模式选择 */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">生成模式</label>
            <div className="nodrag flex gap-2" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setMode('relax')}
                disabled={status === 'processing' || status === 'submitting'}
                className={`nodrag flex-1 px-3 py-2 text-xs font-medium rounded-md border transition-all ${mode === 'relax'
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white border-transparent shadow-md'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-white border-slate-200 dark:border-white/10 hover:border-purple-400 dark:hover:border-purple-400/50'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                慢速
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!fastModeEnabled) {
                    toast.warning('快速模式额度已用完，目前仅支持轻松模式~');
                    return;
                  }
                  setMode('fast');
                }}
                disabled={status === 'processing' || status === 'submitting'}
                className={`nodrag flex-1 px-3 py-2 text-xs font-medium rounded-md border transition-all ${
                  !fastModeEnabled
                    ? 'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-white/30 border-slate-200 dark:border-white/10 cursor-not-allowed'
                    : mode === 'fast'
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white border-transparent shadow-md'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-white border-slate-200 dark:border-white/10 hover:border-purple-400 dark:hover:border-purple-400/50'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={!fastModeEnabled ? 'Fast模式已经用完，目前仅支持Relax模式' : ''}
              >
                快速{!fastModeEnabled && ' (不可用)'}
              </button>
            </div>
          </div>

          {/* 宽高比选择 */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50">宽高比</label>
            <CustomSelect
              value={ratio}
              onChange={(value) => setRatio(value)}
              options={[
                { value: '21:9', label: '21:9 超宽屏' },
                { value: '16:9', label: '16:9 宽屏' },
                { value: '4:3', label: '4:3 标准横屏' },
                { value: '3:2', label: '3:2 横屏' },
                { value: '1:1', label: '1:1 正方形' },
                { value: '2:3', label: '2:3 竖屏' },
                { value: '3:4', label: '3:4 标准竖屏' },
                { value: '9:16', label: '9:16 竖屏' }
              ]}
              className={status === 'processing' || status === 'submitting' ? 'opacity-50 pointer-events-none' : ''}
            />
          </div>

          {/* 高级参数 */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/50">高级参数</div>

            {/* Chaos - 混乱度 */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] text-slate-600 dark:text-slate-400">混乱度 Chaos</label>
                <span className="text-[10px] text-slate-800 dark:text-white font-bold">{chaos}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={chaos}
                onChange={(e) => setChaos(Number(e.target.value))}
                disabled={status === 'processing' || status === 'submitting'}
                className="nodrag w-full h-2 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #ec4899 0%, #a855f7 ${chaos / 2}%, #06b6d4 ${chaos}%, var(--range-bg-color) ${chaos}%, var(--range-bg-color) 100%)`
                }}
              />
            </div>

            {/* Stylize - 风格化 */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] text-slate-600 dark:text-slate-400">风格化 Stylize</label>
                <span className="text-[10px] text-slate-800 dark:text-white font-bold">{stylize}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1000"
                step="50"
                value={stylize}
                onChange={(e) => setStylize(Number(e.target.value))}
                disabled={status === 'processing' || status === 'submitting'}
                className="nodrag w-full h-2 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #ec4899 0%, #a855f7 ${(stylize / 1000) * 50}%, #06b6d4 ${(stylize / 1000) * 100}%, var(--range-bg-color) ${(stylize / 1000) * 100}%, var(--range-bg-color) 100%)`
                }}
              />
            </div>

            {/* Weird - 怪异度 */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] text-slate-600 dark:text-slate-400">怪异度 Weird</label>
                <span className="text-[10px] text-slate-800 dark:text-white font-bold">{weird}</span>
              </div>
              <input
                type="range"
                min="0"
                max="3000"
                step="100"
                value={weird}
                onChange={(e) => setWeird(Number(e.target.value))}
                disabled={status === 'processing' || status === 'submitting'}
                className="nodrag w-full h-2 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #ec4899 0%, #a855f7 ${(weird / 3000) * 50}%, #06b6d4 ${(weird / 3000) * 100}%, var(--range-bg-color) ${(weird / 3000) * 100}%, var(--range-bg-color) 100%)`
                }}
              />
            </div>

            {/* Quality - 质量 */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] text-slate-600 dark:text-slate-400">质量 Quality</label>
                <span className="text-[10px] text-slate-800 dark:text-white font-bold">{quality}</span>
              </div>
              <input
                type="range"
                min="0"
                max="3"
                step="1"
                value={quality === 0.25 ? 0 : quality === 0.5 ? 1 : quality === 1 ? 2 : 3}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setQuality(val === 0 ? 0.25 : val === 1 ? 0.5 : val === 2 ? 1 : 2);
                }}
                disabled={status === 'processing' || status === 'submitting'}
                className="nodrag w-full h-2 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #ec4899 0%, #a855f7 ${((quality === 0.25 ? 0 : quality === 0.5 ? 1 : quality === 1 ? 2 : 3) / 3) * 50}%, #06b6d4 ${((quality === 0.25 ? 0 : quality === 0.5 ? 1 : quality === 1 ? 2 : 3) / 3) * 100}%, var(--range-bg-color) ${((quality === 0.25 ? 0 : quality === 0.5 ? 1 : quality === 1 ? 2 : 3) / 3) * 100}%, var(--range-bg-color) 100%)`
                }}
              />
              <div className="flex justify-between text-[10px] text-slate-600 dark:text-slate-400 mt-1">
                <span>草图</span>
                <span>低</span>
                <span>标准</span>
                <span>高</span>
              </div>
            </div>

            {/* Style Raw - 原始风格（开关） */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-slate-600 dark:text-slate-400">原始风格 Style Raw</label>
                <button
                  type="button"
                  onClick={() => setStyleRaw(!styleRaw)}
                  disabled={status === 'processing' || status === 'submitting'}
                  className={`nodrag relative inline-flex h-6 w-11 items-center rounded-full transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${styleRaw
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600 dark:to-pink-600 border-2 border-transparent'
                      : 'bg-slate-100 dark:bg-white/5 border-2 border-purple-500 dark:border-purple-400'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full transition-transform ${styleRaw
                        ? 'translate-x-6 bg-white shadow-md'
                        : 'translate-x-0.5 bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600 dark:to-pink-600'
                      }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* V7 Omni-Reference 参考图 */}
          {omniReferenceImages.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/50 flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" />
                  角色/物体参考 ({omniReferenceImages.length})
                </label>
              </div>

              {/* 参考图预览（统一为 1:1 缩略图，尺寸与其他节点一致） */}
              <div className="space-y-1">
                <div className="flex gap-2 flex-wrap">
                  {omniReferenceImages.map((url, index) => (
                    <div key={index} className="relative group w-16 h-16 rounded-md overflow-hidden">
                      <img
                        src={url}
                        alt={`Reference ${index + 1}`}
                        className="w-full h-full object-cover border-2 border-slate-200 dark:border-white/10"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center">
                        <span className="text-[10px] text-white">参考 {index + 1}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Omni Weight 滑块 */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] text-slate-600 dark:text-slate-400">参考权重 Omni Weight</label>
                  <span className="text-[10px] text-slate-800 dark:text-white font-bold">{omniWeight}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1000"
                  step="50"
                  value={omniWeight}
                  onChange={(e) => setOmniWeight(Number(e.target.value))}
                  disabled={status === 'processing' || status === 'submitting'}
                  className="nodrag w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #ec4899 0%, #a855f7 ${(omniWeight / 1000) * 50}%, #06b6d4 ${(omniWeight / 1000) * 100}%, var(--range-bg-color) ${(omniWeight / 1000) * 100}%, var(--range-bg-color) 100%)`
                  }}
                />
                <div className="flex justify-between text-[10px] text-slate-600 dark:text-slate-400 mt-1">
                  <span>风格转换</span>
                  <span>平衡</span>
                  <span>细节</span>
                </div>
              </div>
            </div>
          )}

          {/* V7 Style-Reference 参考图 */}
          {styleReferenceImages.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/50 flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" />
                  风格参考 ({styleReferenceImages.length})
                </label>
              </div>
              {/* 风格参考图预览（统一为 1:1 缩略图，尺寸与其他节点一致；无图不显示） */}
              <div className="space-y-1">
                <div className="flex gap-2 flex-wrap">
                  {styleReferenceImages.map((url, index) => (
                    <div key={index} className="relative group w-16 h-16 rounded-md overflow-hidden">
                      <img
                        src={url}
                        alt={`Style ${index + 1}`}
                        className="w-full h-full object-cover border-2 border-slate-200 dark:border-white/10"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center">
                        <span className="text-[10px] text-white">风格 {index + 1}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Style Weight 滑块 */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] text-slate-600 dark:text-slate-400">风格权重 Style Weight</label>
                  <span className="text-[10px] text-slate-800 dark:text-white font-bold">{styleWeight}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1000"
                  step="50"
                  value={styleWeight}
                  onChange={(e) => setStyleWeight(Number(e.target.value))}
                  disabled={status === 'processing' || status === 'submitting'}
                  className="nodrag w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #ec4899 0%, #a855f7 ${(styleWeight / 1000) * 50}%, #06b6d4 ${(styleWeight / 1000) * 100}%, var(--range-bg-color) ${(styleWeight / 1000) * 100}%, var(--range-bg-color) 100%)`
                  }}
                />
                <div className="flex justify-between text-[10px] text-slate-600 dark:text-slate-400 mt-1">
                  <span>微妙</span>
                  <span>标准</span>
                  <span>强烈</span>
                </div>
              </div>
            </div>
          )}

          {/* 生成按钮 */}
          <button
            onClick={handleGenerate}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={status === 'processing' || status === 'submitting' || (data as any)._canEdit === false}
            className="nodrag w-full mt-2 py-2 text-[10px] font-bold rounded-lg border transition-all active:scale-95 flex items-center justify-center gap-2 relative overflow-hidden bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white shadow-md hover:shadow-lg border-transparent dark:border-white/10 disabled:opacity-50 disabled:cursor-wait"
          >
            {/* 进度条背景 */}
            {status === 'processing' && progress && (
              <div
                className="absolute inset-0 bg-gradient-to-br from-purple-400/30 to-accent-400/30 transition-all duration-300"
                style={{ width: progress }}
              />
            )}

            {/* 按钮内容 */}
            <span className="relative z-10 flex items-center gap-2">
              {status === 'submitting' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>提交中...</span>
                </>
              ) : status === 'processing' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>
                    {!progress || progress === '' || progress === '0%'
                      ? (mode === 'relax' ? '排队中...' : '生成中...')
                      : `${progress}`}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>生成图片</span>
                  {/* 免费次数或积分显示 */}
                  {isFreeUsage ? (
                    <span className="ml-1 px-1.5 py-0.5 bg-amber-500/40 text-amber-200 rounded text-[9px]">
                      免费，今日剩{freeUsageRemaining}次
                    </span>
                  ) : credits !== null && credits > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-blue-500/30 text-blue-200 rounded text-[9px]">
                      {credits}积分
                    </span>
                  )}
                </>
              )}
            </span>
          </button>

          {/* 错误提示 */}
          {status === 'error' && (
            <div className="text-[10px] text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700/30 rounded-md px-2 py-1">
              生成失败，请重试
            </div>
          )}
        </div>
      )}

      {/* 输入句柄 - 多类型参考图输入，带文字标签 */}

      {/* Text Input */}
      <div className="absolute left-0 top-[15%] -translate-x-full flex items-center gap-1 pointer-events-none">
        <span className="text-xs text-gray-900 dark:text-gray-400 bg-gray-200/80 dark:bg-gray-900/80 px-2 py-0.5 rounded">文本</span>
        <Handle
          type="target"
          position={Position.Left}
          id="text-input"
          style={{ position: 'relative', left: '8px', transform: 'none' }}
          className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)] pointer-events-auto"
          isValidConnection={(conn) => {
            const src = getNode(conn.source || '');
            return !!src && src.type === 'agent';
          }}
        />
      </div>

      {/* Omni-Reference Input */}
      <div className="absolute left-0 top-[35%] -translate-x-full flex items-center gap-1 pointer-events-none">
        <span className="text-xs text-gray-900 dark:text-gray-400 bg-gray-200/80 dark:bg-gray-900/80 px-2 py-0.5 rounded whitespace-nowrap">角色/物体</span>
        <Handle
          type="target"
          position={Position.Left}
          id="omni-ref"
          style={{ position: 'relative', left: '8px', transform: 'none' }}
          className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)] pointer-events-auto"
          isValidConnection={(_conn) => {
            const hasOmni = edges.some((e) => e.target === id && e.targetHandle === 'omni-ref');
            return !hasOmni;
          }}
        />
      </div>

      {/* Style-Reference Input */}
      <div className="absolute left-0 top-[55%] -translate-x-full flex items-center gap-1 pointer-events-none">
        <span className="text-xs text-gray-900 dark:text-gray-400 bg-gray-200/80 dark:bg-gray-900/80 px-2 py-0.5 rounded">风格</span>
        <Handle
          type="target"
          position={Position.Left}
          id="style-ref"
          style={{ position: 'relative', left: '8px', transform: 'none' }}
          className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)] pointer-events-auto"
          isValidConnection={(_conn) => {
            const hasStyle = edges.some((e) => e.target === id && e.targetHandle === 'style-ref');
            return !hasStyle;
          }}
        />
      </div>

      {/* 输出句柄 */}
      <div className="absolute right-0 top-1/2 translate-x-full -translate-y-1/2 flex items-center gap-1 pointer-events-none">
        <Handle
          type="source"
          position={Position.Right}
          style={{ position: 'relative', right: '8px', transform: 'none' }}
          className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)] pointer-events-auto"
        />
      </div>
    </div>
  );
};

export default MidjourneyNode;
