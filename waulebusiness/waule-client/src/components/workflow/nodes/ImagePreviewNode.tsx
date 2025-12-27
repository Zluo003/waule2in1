import { memo, useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Position, NodeProps, useReactFlow, Node } from 'reactflow';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { useTenantAuthStore } from '../../../store/tenantAuthStore';
import CustomHandle from '../CustomHandle';
import { generateAssetName, findNodeGroup } from '../../../utils/assetNaming';
import { processTaskResult } from '../../../utils/taskResultHandler';
import { useTransformLocalServerUrl } from '../../../utils/assetUrlHelper';

interface AssetLibrary {
  id: string;
  name: string;
  description?: string;
  category?: 'ROLE' | 'SCENE' | 'PROP' | 'OTHER';
  _count: {
    assets: number;
  };
}

interface ImagePreviewNodeData {
  imageUrl: string;
  width: number;
  height: number;
  ratio: string;
  workflowContext?: {
    project?: any;
    episode?: any;
    nodeGroup?: any;
    nodeGroups?: any[];
  };
  midjourneyData?: {
    taskId?: string;
    messageId?: string;
    messageHash?: string;
    sourceNodeId?: string; // 父节点的ID，用于确保正确的父子关系
    mode?: 'relax' | 'fast'; // 继承自主节点的模式
    buttons?: Array<{
      customId: string;
      emoji: string;
      label: string;
      type: number;
      style: number;
    }>;
    action?: string;
  };
  // 正在执行的按钮操作（用于页面刷新恢复）
  pendingButtonAction?: {
    buttonLabel: string;
    buttonCustomId: string;
    newTaskId: string;
    sourceNodeId: string; // 父节点ID，确保恢复时能建立正确的父子关系
  };
  // 已点击过的按钮（customId列表），这些按钮将被禁用
  clickedButtons?: string[];
}

const ImagePreviewNode = ({ data, id }: NodeProps<ImagePreviewNodeData>) => {
  const { setNodes, setEdges, getNodes } = useReactFlow();
  const refreshUser = useTenantAuthStore((state) => state.refreshUser);
  const transformUrl = useTransformLocalServerUrl();
  const location = useLocation();
  const isEpisodeWorkflow = !!((data as any)?.workflowContext?.episode) || location.pathname.includes('/episodes/');

  // 检查当前节点是否已添加到分镜素材（根据实际 mediaList 判断）
  useEffect(() => {
    const checkIfInMediaList = async () => {
      if (!isEpisodeWorkflow) return;
      try {
        const ctx = (data as any)?.workflowContext || {};
        const ep = ctx.episode;
        // 优先从 nodeGroup 获取 scene 和 shot
        let nodeGroup = ctx.nodeGroup;
        if (!nodeGroup && ctx.nodeGroups) {
          nodeGroup = ctx.nodeGroups.find((g: any) => g.nodeIds?.includes(id));
        }
        if (!nodeGroup && (window as any).__workflowContext?.nodeGroups) {
          nodeGroup = (window as any).__workflowContext.nodeGroups.find((g: any) => g.nodeIds?.includes(id));
        }
        const sp = new URLSearchParams(window.location.search);
        const scene = Number(nodeGroup?.scene) || Number(sp.get('scene')) || 1;
        const shot = Number(nodeGroup?.shot) || Number(sp.get('shot')) || 1;
        const parts = location.pathname.split('/').filter(Boolean);
        const pIdx = parts.indexOf('projects');
        const eIdx = parts.indexOf('episodes');
        const projectId = ctx.project?.id || ep?.projectId || (pIdx >= 0 ? parts[pIdx + 1] : undefined);
        const episodeId = ep?.id || (eIdx >= 0 ? parts[eIdx + 1] : undefined);
        if (!projectId || !episodeId) return;

        const res = await apiClient.episodes.getById(projectId, episodeId);
        const root: any = (res as any)?.data ?? res;
        const episodeObj: any = (root as any)?.data ?? root;
        const acts: any[] = Array.isArray(episodeObj?.scriptJson?.acts) ? episodeObj.scriptJson.acts : [];
        const act = acts.find((a: any) => Number(a.actIndex) === scene);
        const shotItem = act?.shots?.find((s: any) => Number(s.shotIndex) === shot);
        const mediaList = Array.isArray(shotItem?.mediaList) ? shotItem.mediaList : [];
        const isInList = mediaList.some((m: any) => m?.nodeId === id);

        // 同步 addedToStoryboard 状态
        setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, addedToStoryboard: isInList } } : n));
      } catch {}
    };
    checkIfInMediaList();
  }, [id, isEpisodeWorkflow, location.pathname]);
  
  // 转换图片 URL，确保使用当前配置的本地服务器地址
  const imageUrl = useMemo(() => transformUrl(data.imageUrl), [data.imageUrl, transformUrl]);
  const [showLibrarySelector, setShowLibrarySelector] = useState(false);
  const [libraries, setLibraries] = useState<AssetLibrary[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'ROLE' | 'SCENE' | 'PROP' | 'AUDIO' | 'OTHER'>('ALL');
  const [assetName, setAssetName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // 如果有传入 width（Midjourney 节点），使用传入的宽度；否则使用默认 400px
  const containerWidth = data.width || 400;

  // 任务执行状态跟踪
  const [executingButton, setExecutingButton] = useState<string | null>(null);

  // 当打开资产库选择器时，加载资产库并生成名称
  useEffect(() => {
    if (showLibrarySelector) {
      loadLibraries();
      // 延迟到下一个事件循环，确保 React Flow 完全更新了节点数据
      setTimeout(() => {
        generateAutoName();
      }, 100);
    }
  }, [showLibrarySelector]);

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPollingRef = useRef<boolean>(false);

  // 页面加载时恢复进行中的按钮操作任务
  useEffect(() => {
    const pendingAction = data.pendingButtonAction;

    if (pendingAction) {
      try {
        const suppressedRaw = localStorage.getItem('suppressedPreviewTasks') || '[]';
        const suppressed: Array<{ sourceNodeId?: string; taskId?: string; messageId?: string }> = JSON.parse(suppressedRaw);
        const createdRaw = localStorage.getItem('createdPreviewTasks') || '[]';
        const created: Array<{ taskId?: string; messageId?: string }> = JSON.parse(createdRaw);
        const isSuppressed = suppressed.some(s => (
          (s.taskId && s.taskId === pendingAction.newTaskId) ||
          (s.sourceNodeId && s.sourceNodeId === pendingAction.sourceNodeId)
        ));

        // 检查画布上是否真的存在该节点
        const nodes = getNodes();
        const hasPreview = nodes.some((node: any) =>
          node.type === 'imagePreview' &&
          node.data?.midjourneyData?.sourceNodeId === pendingAction.sourceNodeId &&
          node.data?.midjourneyData?.taskId === pendingAction.newTaskId
        );

        // 只有当被抑制(suppressed)或者(已创建记录且画布上确实存在)时，才跳过
        // 如果localStorage有记录但画布上没有，说明是未保存的情况，需要重新恢复
        const isAlreadyCreated = created.some(c => c.taskId && c.taskId === pendingAction.newTaskId);

        if (isSuppressed || (isAlreadyCreated && hasPreview)) {
          setExecutingButton(null);
          setNodes((nds) => nds.map((node) => node.id === pendingAction.sourceNodeId ? { ...node, data: { ...node.data, pendingButtonAction: undefined } } : node));
          return;
        }
      } catch { }

      // 检查是否已经在轮询（防止React StrictMode导致的重复执行）
      if (isPollingRef.current) {
        return;
      }
      isPollingRef.current = true;

      const nodes = getNodes();
      const hasPreview = nodes.some((node: any) =>
        node.type === 'imagePreview' &&
        node.data?.midjourneyData?.sourceNodeId === pendingAction.sourceNodeId &&
        node.data?.midjourneyData?.taskId === pendingAction.newTaskId
      );
      if (hasPreview) {
        setExecutingButton(null);
        setNodes((nds) =>
          nds.map((node) =>
            node.id === pendingAction.sourceNodeId
              ? { ...node, data: { ...node.data, pendingButtonAction: undefined } }
              : node
          )
        );
        isPollingRef.current = false;
        return;
      }
      setExecutingButton(pendingAction.buttonCustomId);
      pollButtonTask(pendingAction.newTaskId, pendingAction.buttonLabel, pendingAction.sourceNodeId);
    }

    // 清理函数：组件卸载时取消轮询
    return () => {
      isPollingRef.current = false;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时执行一次

  // 轮询按钮操作任务
  // sourceNodeIdOverride: 用于恢复任务时指定正确的父节点ID
  const pollButtonTask = async (newTaskId: string, buttonLabel: string, sourceNodeIdOverride?: string) => {
    console.log('🎬 [ImagePreview] pollButtonTask 函数被调用:', {
      newTaskId,
      buttonLabel,
      sourceNodeIdOverride,
      currentNodeId: id,
      isPollingRefCurrent: isPollingRef.current,
    });
    
    const actualSourceNodeId = sourceNodeIdOverride || id; // 优先使用传入的sourceNodeId
    let attempts = 0;
    const maxAttempts = 150;
    const pollInterval = 2000;
    
    console.log('⚙️ [ImagePreview] 轮询配置:', { actualSourceNodeId, maxAttempts, pollInterval });

    // 🔑 关键：设置轮询标志为true，允许轮询执行
    isPollingRef.current = true;
    console.log('🚦 [ImagePreview] 设置 isPollingRef.current = true');

    // 判断按钮类型：需要验证的按钮包括：
    // 1. U1-U4 (Upscale)
    // 2. V1-V4 (Variation)
    // 3. Vary (Subtle/Strong/Region) - 单图后的变体按钮
    // 4. Upscale (2x/4x/Subtle/Creative) - 单图后的放大按钮
    // 基本上所有会生成新图的按钮都需要验证
    const isButtonGeneratingNewImage =
      /^[UV]\d$/.test(buttonLabel) || // U1-U4, V1-V4
      buttonLabel.includes('Vary') || // Vary (Subtle), Vary (Strong), Vary (Region)
      (buttonLabel.includes('Upscale') && buttonLabel !== 'Upscale') || // Upscale (2x), Upscale (4x), etc.
      buttonLabel.includes('Zoom') || // Zoom Out
      buttonLabel.includes('Pan') || // Pan Up/Down/Left/Right
      buttonLabel.includes('Make') || // Make Square
      buttonLabel.includes('Remaster'); // Remaster

    const poll = async () => {
      // 如果已经停止轮询（组件卸载），则不再执行
      if (!isPollingRef.current) return;

      try {
        console.log(`🔍 [ImagePreview] 轮询任务 ${buttonLabel}, 尝试 ${attempts + 1}/${maxAttempts}`);
        const taskResponse = await apiClient.midjourney.fetchTask(newTaskId);

        // 再次检查，防止异步操作期间组件卸载
        if (!isPollingRef.current) return;

        const task = taskResponse.task;

        console.log(`📊 [ImagePreview] 任务状态:`, {
          taskId: newTaskId,
          buttonLabel,
          status: task.status,
          hasImageUrl: !!task.imageUrl,
          hasButtons: task.buttons?.length || 0,
        });

        if (task.status === 'SUCCESS') {
          console.log('✅ [ImagePreview] 检测到 SUCCESS 状态，准备创建预览节点...');

          // 🔍 检查是否是错误的响应（服务器重启后可能返回原图）
          // 对于所有会生成新图的按钮操作，都需要验证返回的是新图
          if (isButtonGeneratingNewImage && data.imageUrl && data.midjourneyData?.messageId) {
            const isSameImage = task.imageUrl === data.imageUrl;
            const isSameMessage = task.properties?.messageId === data.midjourneyData?.messageId;

            // 只有当imageUrl和messageId都相同时，才认为是原图（需要继续等待）
            // 如果只是其中一个相同，可能是正常情况
            if (isSameImage && isSameMessage) {
              

              // 继续轮询，等待真正的新图
              attempts++;
              try {
                const createdRaw = localStorage.getItem('createdPreviewTasks') || '[]';
                const created: Array<{ taskId?: string; messageId?: string }> = JSON.parse(createdRaw);
                const already = created.some(c => (c.taskId && c.taskId === newTaskId) || (c.messageId && c.messageId === task.properties?.messageId));
                if (already) {
                  setExecutingButton(null);
                  setNodes((nds) => nds.map((node) => node.id === actualSourceNodeId ? { ...node, data: { ...node.data, pendingButtonAction: undefined } } : node));
                  return;
                }
              } catch { }
              if (attempts < maxAttempts) {
                pollTimeoutRef.current = setTimeout(poll, pollInterval);
              } else {
                

                toast.error(`${buttonLabel} 失败：服务器重启后无法获取新图片`);
                setExecutingButton(null);
                setNodes((nds) =>
                  nds.map((node) =>
                    node.id === actualSourceNodeId
                      ? { ...node, data: { ...node.data, pendingButtonAction: undefined } }
                      : node
                  )
                );
              }
              return;
            }

            
          }

          toast.success(`${buttonLabel} 完成！`);

          // 重置状态并清除pendingButtonAction
          setExecutingButton(null);

          // 清除node data中的pendingButtonAction（使用actualSourceNodeId）
          // 注意：不需要在这里添加到clickedButtons，因为在按钮点击时已经添加过了
          setNodes((nds) =>
            nds.map((node) =>
              node.id === actualSourceNodeId
                ? {
                  ...node,
                  data: {
                    ...node.data,
                    pendingButtonAction: undefined,
                  },
                }
                : node
            )
          );

          // 创建新的预览节点前，先检查是否已存在
          // 检查是否已存在该任务的预览节点（防止重复创建）
          const allNodesForCheck = getNodes();
          console.log('🔍 [ImagePreview] 检查重复节点:', {
            totalNodes: allNodesForCheck.length,
            imagePreviewNodes: allNodesForCheck.filter(n => n.type === 'imagePreview').length,
            searchingForTaskId: newTaskId,
            searchingForSourceNodeId: actualSourceNodeId,
          });
          
          const existingPreviewNode = allNodesForCheck.find((node: any) =>
            node.type === 'imagePreview' &&
            node.data.midjourneyData?.sourceNodeId === actualSourceNodeId &&
            ((node.data.midjourneyData?.taskId === newTaskId) ||
              (task.properties?.messageId && node.data.midjourneyData?.messageId === task.properties?.messageId))
          );

          if (existingPreviewNode) {
            console.log('⚠️ [ImagePreview] 预览节点已存在，跳过创建', {
              existingNodeId: existingPreviewNode.id,
              existingTaskId: (existingPreviewNode.data as any)?.midjourneyData?.taskId,
            });
            toast.info('任务已完成，预览节点已存在');
            return;
          }
          
          console.log('✅ [ImagePreview] 未找到重复节点，继续创建...');

          // 获取父节点
          const currentNode = getNodes().find(n => n.id === actualSourceNodeId);
          if (!currentNode) {
            console.error('❌ [ImagePreview] 找不到父节点:', actualSourceNodeId);
            return;
          }

          if (!task.imageUrl) {
            toast.error(`无法创建预览节点：缺少图片URL`);
            return;
          }

          // 处理本地存储（如果启用）
          let displayUrl = task.imageUrl;
          try {
            const processedResult = await processTaskResult({
              taskId: newTaskId,
              resultUrl: task.imageUrl,
              type: 'IMAGE',
            });
            displayUrl = processedResult.displayUrl;
            console.log('[ImagePreview] 图片已处理:', { original: task.imageUrl.substring(0, 50), display: displayUrl.substring(0, 50) });
          } catch (err) {
            console.warn('[ImagePreview] 处理本地存储失败，使用原始URL:', err);
          }

          // 计算新节点位置
          const SPACING_X = 200;
          const SPACING_Y = 100;
          const previewWidth = data.width || 400;
          const parseRatio = (r?: string, defH = 300) => {
            if (!r || !/^[0-9]+\s*:\s*[0-9]+$/.test(r)) return defH;
            const [rw, rh] = r.split(':').map((v) => parseFloat(v));
            if (!rw || !rh) return defH;
            return Math.round(previewWidth * (rh / rw));
          };
          const targetH = parseRatio(data.ratio, 300);
          const parentEl = document.querySelector(`.react-flow__node[data-id="${currentNode.id}"]`) as HTMLElement | null;
          const parentW = Math.round((parentEl?.getBoundingClientRect().width || (currentNode as any).data?.width || 400));
          const siblings = getNodes().filter((n: any) => n.type === 'imagePreview' && n.data?.midjourneyData?.sourceNodeId === actualSourceNodeId);
          const baseX = currentNode.position.x + parentW + SPACING_X;
          const baseY = currentNode.position.y;
          const posX = baseX;
          const posY = baseY + siblings.length * (targetH + SPACING_Y);

          const newNodeId = `preview-${Date.now()}`;
          const newNode: Node = {
            id: newNodeId,
            type: 'imagePreview',
            position: { x: posX, y: posY },
            data: {
              imageUrl: displayUrl, // 使用处理后的本地URL
              width: previewWidth,
              height: targetH,
              ratio: data.ratio,
              workflowContext: data.workflowContext,
              createdBy: (currentNode.data as any)?.createdBy, // 🔑 继承父节点的创建者信息（协作者拖动权限）
              midjourneyData: {
                taskId: newTaskId,
                messageId: task.properties?.messageId,
                messageHash: task.properties?.messageHash,
                sourceNodeId: actualSourceNodeId,
                buttons: task.buttons,
                action: task.action,
              },
            },
          };

          console.log('🆕 [ImagePreview] 创建新预览节点:', {
            nodeId: newNodeId,
            taskId: newTaskId,
            imageUrl: displayUrl,
            sourceNodeId: actualSourceNodeId,
            position: { x: posX, y: posY },
          });

          // 同步创建节点和边
          setNodes((nds) => {
            console.log(`🔧 [ImagePreview] 添加节点到数组，当前节点数: ${nds.length} -> ${nds.length + 1}`);
            return [...nds, newNode];
          });
          
          setEdges((eds) => {
            const newEdge = {
              id: `${actualSourceNodeId}-${newNodeId}`,
              source: actualSourceNodeId,
              target: newNodeId,
              type: 'aurora', // 使用 aurora 类型，显示彩色渐变动态线
              animated: true,
              style: { stroke: 'currentColor', strokeWidth: 2 },
            };
            console.log(`🔧 [ImagePreview] 添加边到数组，当前边数: ${eds.length} -> ${eds.length + 1}`, newEdge);
            return [...eds, newEdge];
          });

          // 强制React Flow在下一帧重新渲染，确保新节点立即显示
          requestAnimationFrame(() => {
            console.log('🎨 [ImagePreview] 请求动画帧完成，节点应该已渲染');
            
            // 再延迟一帧确保完全渲染
            requestAnimationFrame(() => {
              const updatedNodes = getNodes();
              const createdNode = updatedNodes.find(n => n.id === newNodeId);
              console.log(`✅ [ImagePreview] 验证节点是否存在: ${createdNode ? '存在' : '不存在'}`, {
                nodeId: newNodeId,
                totalNodes: updatedNodes.length,
              });
            });
          });

          // 记录已创建的任务（防止重复）
          try {
            const createdRaw = localStorage.getItem('createdPreviewTasks') || '[]';
            const created: Array<{ taskId?: string; messageId?: string }> = JSON.parse(createdRaw);
            const next = [...created, { taskId: newTaskId, messageId: task.properties?.messageId }].slice(-500);
            localStorage.setItem('createdPreviewTasks', JSON.stringify(next));
          } catch (e) {
            console.warn('localStorage 写入失败:', e);
          }

          toast.success(`已创建${buttonLabel}预览节点`);
          return;
        }

        if (task.status === 'FAILURE') {
          toast.error(`${buttonLabel} 失败: ${task.failReason || '未知错误'}`);
          setExecutingButton(null);
          // 清除pendingButtonAction（使用actualSourceNodeId）
          setNodes((nds) =>
            nds.map((node) =>
              node.id === actualSourceNodeId
                ? {
                  ...node,
                  data: {
                    ...node.data,
                    pendingButtonAction: undefined,
                  },
                }
                : node
            )
          );
          return;
        }

        if (task.status === 'NOT_FOUND') {
          const nodes = getNodes();
          const hasPreview = nodes.some((n: any) =>
            n.type === 'imagePreview' &&
            n.data?.midjourneyData?.sourceNodeId === actualSourceNodeId &&
            n.data?.midjourneyData?.taskId === newTaskId
          );
          if (hasPreview) {
            setExecutingButton(null);
            setNodes((nds) =>
              nds.map((node) =>
                node.id === actualSourceNodeId
                  ? { ...node, data: { ...node.data, pendingButtonAction: undefined } }
                  : node
              )
            );
            return;
          }
          toast.error(`${buttonLabel} 任务不存在`);
          setExecutingButton(null);
          setNodes((nds) =>
            nds.map((node) =>
              node.id === actualSourceNodeId
                ? { ...node, data: { ...node.data, pendingButtonAction: undefined } }
                : node
            )
          );
          return;
        }

        attempts++;
        if (attempts < maxAttempts) {
          pollTimeoutRef.current = setTimeout(poll, pollInterval);
        } else {
          toast.error(`${buttonLabel} 超时`);
          setExecutingButton(null);
          // 清除pendingButtonAction
          setNodes((nds) =>
            nds.map((node) =>
              node.id === id
                ? {
                  ...node,
                  data: {
                    ...node.data,
                    pendingButtonAction: undefined,
                  },
                }
                : node
            )
          );
        }
      } catch (error: any) {
        toast.error(`${buttonLabel} 失败: ${error.message}`);
        setExecutingButton(null);
        // 清除pendingButtonAction
        setNodes((nds) =>
          nds.map((node) =>
            node.id === id
              ? {
                ...node,
                data: {
                  ...node.data,
                  pendingButtonAction: undefined,
                },
              }
              : node
          )
        );
      }
    };

    poll();
  };

  // 从 localStorage 读取全局按钮配置
  const getButtonConfig = (): Record<string, boolean> => {
    try {
      const config = localStorage.getItem('midjourneyButtonConfig');
      if (config) {
        return JSON.parse(config);
      }
    } catch (error) {
    }
    return {};
  };

  // 按钮过滤函数 - 支持精确到每个按钮的控制
  const shouldShowButton = (button: { label: string; emoji?: string; customId?: string }): boolean => {
    const config = getButtonConfig();

    // 如果配置为空，默认显示所有按钮
    if (Object.keys(config).length === 0) {
      return true;
    }

    // 精确匹配按钮 label
    const buttonKey = button.label.replace(/\s+/g, '_'); // 转换空格为下划线

    if (config.hasOwnProperty(buttonKey)) {
      return config[buttonKey] === true;
    }

    // 默认显示
    return true;
  };

  // 规范化按钮显示名称（仅影响显示，不影响实际 customId）
  const normalizeButtonLabel = (label: string): string => {
    if (!label) return '';
    let result = label.trim();
    // 去掉 upscale_1、upscale_2 等前缀（Discord 返回的按钮会带这个）
    // 匹配开头的 upscale_数字 + 空格
    if (/^upscale_\d+\s/i.test(result)) {
      result = result.replace(/^upscale_\d+\s+/i, '');
    }
    console.log('[normalizeButtonLabel]', label, '->', result);
    return result;
  };

  // 判断层级：
  // 第一层（四宫格）：存在 U1-U4 或 V1-V4
  // 第二层（U1-U4后）：有 Upscale 按钮（如 Upscale (Subtle)/Creative），但没有 Redo
  // 第三层（Upscale后）：有 Redo Upscale 按钮，不显示任何按钮
  const buttonLabels = (data.midjourneyData?.buttons || []).map((b: any) => String(b.label || '').toLowerCase());
  const isFirstLevel = buttonLabels.some((l) => /^[uv][1-4]$/i.test(l));
  const hasRedoUpscale = buttonLabels.some((l) => l.includes('redo'));
  const isSecondLevel = !isFirstLevel && !hasRedoUpscale && buttonLabels.some((l) => l.includes('upscale'));
  // 第三层：有 Redo 按钮，说明已经 Upscale 过了

  // 业务过滤：按层级和需求隐藏不需要的按钮
  const stageFilter = (button: { label: string; emoji?: string; customId?: string }): boolean => {
    const raw = String(button.label || '');
    const lower = raw.toLowerCase();
    const cid = String(button.customId || '').toLowerCase();
    const hasLikeEmoji = /👍|❤️|❤/.test(raw);
    // 全局隐藏：Animate、点赞（like/emoji）、Web/浏览器
    if (
      lower.includes('animate') ||
      lower.includes('web') || cid.includes('web') || lower.includes('browser') || lower.includes('open in web') || lower.includes('open web') ||
      lower.includes('like') || cid.includes('like') || hasLikeEmoji
    ) {
      return false;
    }
    if (isFirstLevel) {
      // 第一层仅显示 U1-U4（隐藏 V1-V4）
      return /^U[1-4]$/i.test(raw);
    }
    if (isSecondLevel) {
      // 第二层（U1-U4执行后的单图）：仅显示 Upscale 按钮
      return lower.includes('upscale');
    }
    // 第三层（Upscale后）：不显示任何按钮
    return false;
  };

  // 加载资产库列表并生成自动命名
  useEffect(() => {
    if (showLibrarySelector) {
      loadLibraries();
      // 尝试自动生成名称
      generateAutoName();
    }
  }, [showLibrarySelector]);

  // 分类切换仅在前端过滤，避免因请求导致弹框尺寸变化造成抖动

  const loadLibraries = async () => {
    try {
      const params = selectedCategory === 'ALL' ? { includeShared: 'true' } : { category: selectedCategory, includeShared: 'true' } as any;
      const response = await apiClient.assetLibraries.getAll(params);
      const libs = response.data || [];
      setLibraries(libs);
      if (libs.length > 0) {
        const currentInFilter = libs.find((l: any) => l.id === selectedLibraryId);
        setSelectedLibraryId(currentInFilter ? currentInFilter.id : libs[0].id);
      } else {
        setSelectedLibraryId('');
      }
    } catch (error: any) {
      toast.error('加载资产库列表失败');
    }
  };

  // 生成自动命名（从全局变量读取）
  const generateAutoName = () => {
    // 直接从全局变量读取工作流上下文
    const context = (window as any).__workflowContext;

    if (!context || !context.project || !context.nodeGroups) {
      toast.warning('工作流信息未加载完成，请稍后再试');
      return;
    }

    // 查找当前节点所在的编组
    const nodeGroup = findNodeGroup(id, context.nodeGroups);
    
    // 如果没找到编组，检查是否有当前镜头的编组
    if (!nodeGroup && context.nodeGroups.length > 0) {
      const firstGroup = context.nodeGroups[0];
      
      // 使用第一个编组（在镜头工作流中，通常就是当前镜头的编组）
      const autoName = generateAssetName({
        project: context.project,
        episode: context.episode,
        nodeGroup: firstGroup,
        nodeId: id,
        assetType: 'image',
      });

      if (autoName) {
        setAssetName(autoName);
        toast.success(`已自动生成资产名称：${autoName}`);
      } else {
        toast.warning('编组信息不完整，无法自动命名');
      }
      return;
    }

    // 生成名称
    const autoName = generateAssetName({
      project: context.project,
      episode: context.episode,
      nodeGroup,
      nodeId: id,
      assetType: 'image',
    });

    if (autoName) {
      setAssetName(autoName);
      toast.success(`已自动生成资产名称：${autoName}`);
    } else {
      toast.warning('请先为编组命名（幕数-镜头数），才能自动生成资产名称');
    }
  };

  // 添加到资产库
  const handleAddToLibrary = async () => {
    if (!selectedLibraryId) {
      toast.error('请选择资产库');
      return;
    }

    if (!assetName.trim()) {
      toast.error('请输入资产名称');
      return;
    }

    try {
      setIsAdding(true);
      await apiClient.assetLibraries.addFromUrl(
        selectedLibraryId,
        data.imageUrl,
        assetName.trim()
      );
      
      // 添加成功后，真正递增计数器（确保下次序号正确）
      const context = (window as any).__workflowContext;
      if (context && context.project && context.nodeGroups) {
        const nodeGroup = findNodeGroup(id, context.nodeGroups) || context.nodeGroups[0];
        if (nodeGroup) {
          // 调用 generateAssetName 并传入 preview: false 来真正递增计数器
          generateAssetName({
            project: context.project,
            episode: context.episode,
            nodeGroup,
            nodeId: id,
            assetType: 'image',
            preview: false, // 实际添加，递增计数器
          });
        }
      }
      
      toast.success('已添加到资产库');
      setShowLibrarySelector(false);
      setAssetName('');
      try {
        setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, addedToLibrary: true } } : n));
      } catch { }
      try {
        const evt = new CustomEvent('asset-library-updated', { detail: { libraryId: selectedLibraryId } });
        window.dispatchEvent(evt);
      } catch { }
    } catch (error: any) {
      toast.error(error.response?.data?.message || '添加失败');
    } finally {
      setIsAdding(false);
    }
  };

  // 下载图片 - 使用自动生成的资产名称
  const handleDownload = async () => {
    try {
      const imageUrl = data.imageUrl;

      // 生成下载文件名
      let fileName = `image-${Date.now()}.jpg`;
      
      // 尝试使用自动命名
      const context = (window as any).__workflowContext;
      if (context && context.project && context.nodeGroups) {
        const nodeGroup = findNodeGroup(id, context.nodeGroups) || context.nodeGroups[0];
        if (nodeGroup) {
          const autoName = generateAssetName({
            project: context.project,
            episode: context.episode,
            nodeGroup,
            nodeId: id,
            assetType: 'image',
            preview: true,
          });
          if (autoName) {
            fileName = autoName;
            // 确保有扩展名
            if (!fileName.includes('.')) {
              // 从URL获取扩展名
              const ext = imageUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)?.[0] || '.jpg';
              fileName += ext;
            }
          }
        }
      }

      // Electron 环境使用专用下载方法
      if (window.electronAPI?.downloadFile) {
        toast.info('正在下载图片...');
        const result = await window.electronAPI.downloadFile(imageUrl, fileName);
        if (result.success) {
          toast.success(`图片下载成功：${fileName}`);
        } else if (result.message !== '用户取消下载') {
          toast.error(`下载失败: ${result.message}`);
        }
        return;
      }

      // Web 环境使用后端代理下载
      toast.info('正在下载图片...');
      
      // 构建完整的下载 URL
      const API_URL = import.meta.env.VITE_API_URL || '';
      const baseUrl = API_URL ? `${API_URL}/api` : '/api';
      const downloadUrl = `${baseUrl}/assets/proxy-download-with-name?url=${encodeURIComponent(imageUrl)}&filename=${encodeURIComponent(fileName)}`;
      
      // 使用原生 fetch 避免 axios 拦截器问题
      const response = await fetch(downloadUrl);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`下载失败: HTTP ${response.status} ${errorText}`);
      }
      
      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 100);

      toast.success(`图片下载成功：${fileName}`);
    } catch (error) {
      toast.error(`操作失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  return (
    <div className="relative group">
      <CustomHandle
        type="target"
        position={Position.Left}
        id={`${id}-target`}
        isConnectable={false}
        className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
      />

      {/* 图片容器 - 有可见按钮时只有上圆角，无按钮时全圆角 */}
      {(() => {
        const visibleButtons = data.midjourneyData
          ? (data.midjourneyData.buttons || []).filter((b) => shouldShowButton(b) && stageFilter(b))
          : [];
        const hasVisibleButtons = visibleButtons.length > 0;
        return (
      <div className="relative bg-white/80 dark:bg-[#18181b]/100 dark:backdrop-blur-none backdrop-blur-sm border border-slate-200 dark:border-neutral-800 shadow-xl overflow-hidden" style={{ width: containerWidth, borderRadius: hasVisibleButtons ? '12px 12px 0 0' : '12px' }}>
        <img
          src={imageUrl}
          alt="预览"
          className="block w-full h-auto"
          style={{
            backgroundColor: '#000',
          }}
        />

        {/* 操作按钮（hover时显示在图片右下角） */}
        <div className="nodrag absolute bottom-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* 添加到分镜素材按钮 - 仅在剧集工作流中显示 */}
          {isEpisodeWorkflow && (
          <button
            onClick={async () => {
              try {
                const url = data.imageUrl;
                const ctx = data.workflowContext || {};
                const ep = ctx.episode;
                // 直接从 URL 参数获取 scene 和 shot（最可靠的来源）
                const sp = new URLSearchParams(window.location.search);
                const scene = Number(sp.get('scene')) || 1;
                const shot = Number(sp.get('shot')) || 1;
                console.log('[ImagePreviewNode] 添加到分镜:', { scene, shot, urlScene: sp.get('scene'), urlShot: sp.get('shot') });
                // 从 URL 路径获取 projectId 和 episodeId
                const parts = location.pathname.split('/').filter(Boolean);
                const pIdx = parts.indexOf('projects');
                const eIdx = parts.indexOf('episodes');
                const projectId = ctx.project?.id || ep?.projectId || (pIdx >= 0 ? parts[pIdx + 1] : undefined);
                const episodeId = ep?.id || (eIdx >= 0 ? parts[eIdx + 1] : undefined);
                if (!projectId || !episodeId) {
                  toast.error('缺少剧集上下文，无法写回分镜');
                  return;
                }
                const res = await apiClient.episodes.getById(projectId, episodeId);
                const root: any = (res as any)?.data ?? res;
                const episodeObj: any = (root as any)?.data ?? root;
                // 使用 acts 结构（与 EpisodeDetailPage 保持一致）
                let acts: any[] = Array.isArray(episodeObj?.scriptJson?.acts) ? [...episodeObj.scriptJson.acts] : [];
                let act = acts.find((a: any) => Number(a.actIndex) === scene);
                if (!act) { act = { actIndex: scene, shots: [] }; acts.push(act); }
                act.shots = Array.isArray(act.shots) ? [...act.shots] : [];
                let shotItem = act.shots.find((s: any) => Number(s.shotIndex) === shot);
                if (!shotItem) { 
                  shotItem = { shotIndex: shot, mediaList: [] }; 
                  act.shots.push(shotItem); 
                }
                const list = Array.isArray(shotItem.mediaList) ? shotItem.mediaList.slice() : [];
                // 图片默认时长5秒
                list.push({ type: 'image', url, nodeId: id, duration: 5 });
                shotItem.mediaList = list;
                const scriptJson = { ...(episodeObj.scriptJson || {}), acts };
                await apiClient.episodes.update(projectId, episodeId, { scriptJson });
                
                // 标记为已添加到分镜脚本
                try {
                  setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, addedToStoryboard: true } } : n));
                } catch { }
                
                toast.success('已添加到分镜素材');
              } catch (e: any) {
                toast.error(e?.message || '添加到分镜素材失败');
              }
            }}
            className={`w-7 h-7 flex items-center justify-center ${(data as any)?.addedToStoryboard ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-neutral-800 dark:bg-white '} hover:shadow-lg text-white dark:text-black rounded-full transition-all dark:backdrop-blur-none backdrop-blur-sm shadow-md active:scale-95 relative`}
            title={(data as any)?.addedToStoryboard ? '已添加到分镜素材' : '添加到分镜素材'}
            disabled={(data as any)?.addedToStoryboard}
          >
            <span className="material-symbols-outlined text-sm">playlist_add</span>
            {(data as any)?.addedToStoryboard && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-green-600 leading-none" style={{ fontVariationSettings: '"FILL" 1, "wght" 300', fontSize: '10px' }}>check_circle</span>
              </span>
            )}
          </button>
          )}
          {/* 添加到资产库按钮 - 已添加后变绿色+对钩+禁用 */}
          <button
            onClick={() => {
              setShowLibrarySelector(true);
            }}
            className={`w-7 h-7 flex items-center justify-center ${(data as any)?.addedToLibrary ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-neutral-800 dark:bg-white '} hover:shadow-lg text-white dark:text-black rounded-full transition-all dark:backdrop-blur-none backdrop-blur-sm shadow-md active:scale-95 relative`}
            title={(data as any)?.addedToLibrary ? '已添加到资产库' : '添加到资产库'}
            disabled={(data as any)?.addedToLibrary}
          >
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>add_photo_alternate</span>
            {(data as any)?.addedToLibrary && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-green-600 leading-none" style={{ fontVariationSettings: '"FILL" 1, "wght" 300', fontSize: '10px' }}>check_circle</span>
              </span>
            )}
          </button>
          <button
            onClick={handleDownload}
            className="w-7 h-7 flex items-center justify-center bg-slate-800/90 dark:bg-slate-700/90 hover:bg-slate-900 dark:hover:bg-slate-600 text-white rounded-full transition-all dark:backdrop-blur-none backdrop-blur-sm shadow-md active:scale-95"
            title="下载图片"
          >
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>download</span>
          </button>
        </div>
      </div>
        );
      })()}

      {/* Midjourney操作按钮（在图片下方）- 仅在有可见按钮时显示 */}
      {data.midjourneyData && (() => {
        const visibleButtons = (data.midjourneyData.buttons || []).filter((b) => shouldShowButton(b) && stageFilter(b));
        if (visibleButtons.length === 0) return null; // 第三层或无按钮时不显示整个区域
        return (
        <div className="nodrag bg-white/80 dark:bg-[#18181b]/100 dark:backdrop-blur-none backdrop-blur-sm border-2 border-t-0 border-slate-200 dark:border-neutral-800 rounded-b-xl p-3 space-y-2 shadow-lg" style={{ width: containerWidth }}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-400">Midjourney 操作</div>
            <div className="flex flex-wrap gap-2">
              {visibleButtons.map((button, idx) => {
                  // 检查按钮是否已被点击过
                  const displayLabel = normalizeButtonLabel(button.label);
                  const isClicked = data.clickedButtons?.includes(button.label) || false;
                  const isExecuting = executingButton === button.customId;
                  // 编组内节点禁用操作按钮
                  const isGroupedReadOnly = (data as any)._canEdit === false;
                  const isDisabled = (executingButton !== null && executingButton !== button.customId) || isClicked || isGroupedReadOnly;

                  return (
                    <button
                      key={idx}
                      onClick={async () => {
                        console.log('🖱️ [ImagePreview] 按钮被点击:', {
                          buttonLabel: button.label,
                          buttonCustomId: button.customId,
                          nodeId: id,
                          taskId: data.midjourneyData?.taskId,
                        });
                        
                        if (!data.midjourneyData?.taskId) {
                          console.error('❌ [ImagePreview] 缺少任务ID');
                          toast.error('缺少任务ID');
                          return;
                        }

                        if (isClicked) {
                          console.warn('⚠️ [ImagePreview] 按钮已被点击过');
                          toast.warning('该按钮已被点击过');
                          return;
                        }

                        // 设置正在执行的按钮
                        setExecutingButton(button.customId);
                        console.log('🎯 [ImagePreview] 设置执行中按钮:', button.customId);

                        try {
                          toast.info(`正在执行 ${button.label}...`);
                          console.log('📤 [ImagePreview] 发送API请求...');
                          
                          const response = await apiClient.midjourney.action({
                            taskId: data.midjourneyData.taskId!,
                            customId: button.customId,
                            messageId: data.midjourneyData.messageId, // 🔑 直接传递messageId，服务器重启后也能工作
                            nodeId: id, // 🔑 传递当前节点ID作为父节点ID
                            mode: data.midjourneyData.mode || 'relax', // 🔑 继承主节点的模式
                          });
                          
                          console.log('📥 [ImagePreview] 收到API响应:', response);
                          
                          if (!response.success) {
                            console.error('❌ [ImagePreview] API返回失败:', response.description);
                            toast.error(response.description || '操作失败');
                            setExecutingButton(null);
                            return;
                          }

                          const newTaskId = response.taskId;
                          console.log('🆔 [ImagePreview] 新任务ID:', newTaskId);
                          
                          // 刷新用户积分（如果有扣费）
                          if (response.creditsCharged && response.creditsCharged > 0) {
                            refreshUser();
                          }
                          
                          if (!newTaskId) {
                            console.error('❌ [ImagePreview] 未收到新任务ID');
                            toast.error('未收到新任务ID');
                            setExecutingButton(null);
                            return;
                          }


                          // 保存pendingButtonAction到node data，并标记按钮为已点击（用于页面刷新恢复）
                          console.log('💾 [ImagePreview] 保存pendingButtonAction到节点数据');
                          setNodes((nds) =>
                            nds.map((node) =>
                              node.id === id
                                ? {
                                  ...node,
                                  data: {
                                    ...node.data,
                                    pendingButtonAction: {
                                      buttonLabel: button.label,
                                      buttonCustomId: button.customId,
                                      newTaskId,
                                      sourceNodeId: id, // ✅ 记录父节点ID
                                    },
                                    // 立即标记按钮为已点击，防止重复点击
                                    clickedButtons: [
                                      ...(node.data.clickedButtons || []),
                                      button.label,
                                    ],
                                  },
                                }
                                : node
                            )
                          );

                          toast.info(`${displayLabel} 已提交，正在处理...`);

                          // 开始轮询
                          console.log('🔄 [ImagePreview] 准备开始轮询任务:', { newTaskId, displayLabel });
                          console.log('🚀 [ImagePreview] 调用 pollButtonTask...');
                          pollButtonTask(newTaskId, displayLabel);
                          console.log('✅ [ImagePreview] pollButtonTask 已调用');
                        } catch (error: any) {
                          // 任务限制错误 (429) 使用警告提示
                          if (error.response?.status === 429) {
                            toast.warning(error.response?.data?.error || '每位用户只允许同时执行一个Midjourney任务');
                          } else {
                            const errMsg = error.response?.data?.error || error.message;
                            toast.error(errMsg);
                          }
                          setExecutingButton(null);
                        }
                      }}
                      disabled={isDisabled}
                      className={`
                        px-3 py-1.5 text-[10px] font-bold rounded-md transition-all border
                        ${isClicked
                          ? 'bg-neutral-400 dark:bg-neutral-700 text-white dark:text-neutral-300 cursor-not-allowed border-transparent'
                          : isExecuting
                            ? 'bg-neutral-800 dark:bg-white cursor-wait text-white dark:text-black border-transparent shadow-md'
                            : executingButton !== null
                              ? 'bg-neutral-400 dark:bg-neutral-700 text-white dark:text-neutral-300 cursor-not-allowed border-transparent'
                              : 'bg-neutral-800 dark:bg-white hover:shadow-lg active:scale-95 text-white dark:text-black border-transparent dark:border-neutral-700'
                        }
                      `}
                      title={isClicked ? `${displayLabel} (已点击)` : displayLabel}
                    >
                      {/* 按钮内容 */}
                      <span className="flex items-center gap-1">
                        {isExecuting && (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        )}
                        {/* emoji 可能包含 upscale_1 等前缀，过滤掉 */}
                        {button.emoji && !/^upscale_\d+$/i.test(button.emoji) && <span>{button.emoji}</span>}
                        {displayLabel}
                        {isClicked && <span className="ml-1">✓</span>}
                      </span>
                    </button>
                  );
                })}
            </div>
        </div>
        );
      })()}

      {/* 选择资产库弹窗 - 使用 Portal 渲染到 body，避免被编组遮挡 */}
      {showLibrarySelector && createPortal(
        <div className="nodrag fixed inset-0 bg-black/60 dark:backdrop-blur-none backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-text-dark-primary">
                添加到资产库
              </h3>
              <button
                onClick={() => setShowLibrarySelector(false)}
                className="p-1.5 rounded-md text-slate-400 dark:text-text-dark-secondary hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <div className="space-y-4">
              {/* 资产名称 */}
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-text-dark-secondary mb-2">
                  资产名称 *
                </label>
                <input
                  type="text"
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-text-dark-primary placeholder-slate-400 dark:placeholder-text-dark-secondary focus:outline-none focus:ring-2 focus:ring-neutral-500"
                  placeholder="输入资产名称"
                  maxLength={200}
                />
              </div>

              {/* 选择资产库 */}
              <div className="min-h-[72px]">
                <label className="block text-sm font-medium text-slate-600 dark:text-text-dark-secondary mb-2">
                  选择资产库 *
                </label>
                {(() => {
                  const filtered = selectedCategory === 'ALL'
                    ? libraries
                    : libraries.filter((l) => (l.category || 'OTHER') === selectedCategory);
                  if (filtered.length === 0) {
                    return (
                      <div className="text-sm text-slate-600 dark:text-text-dark-secondary">
                        {selectedCategory === 'ALL' ? '暂无资产库，请先创建' : '该类型暂无资产库'}
                      </div>
                    );
                  }
                  return (
                    <select
                      value={selectedLibraryId}
                      onChange={(e) => setSelectedLibraryId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-text-dark-primary focus:outline-none focus:ring-2 focus:ring-neutral-500"
                    >
                      {filtered.map((lib) => (
                        <option key={lib.id} value={lib.id}>
                          {lib.name} ({lib._count.assets} 个资产)
                        </option>
                      ))}
                    </select>
                  );
                })()}
              </div>

              {/* 库类型选择 */}
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-text-dark-secondary mb-2">
                  库类型
                </label>
                <div className="flex gap-1.5">
                  {(['ROLE', 'SCENE', 'PROP', 'AUDIO', 'OTHER'] as const).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(cat);
                        const filtered = libraries.filter((l) => (l.category || 'OTHER') === cat);
                        setSelectedLibraryId(filtered.length > 0 ? filtered[0].id : '');
                      }}
                      className={`flex-1 px-1.5 py-1.5 rounded-lg border transition-all ${selectedCategory === cat ? 'border-neutral-500 bg-neutral-500/10 dark:bg-neutral-500/20' : 'border-slate-200 dark:border-border-dark hover:border-neutral-400 dark:hover:border-neutral-500'
                        }`}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="material-symbols-outlined text-sm text-slate-600 dark:text-text-dark-secondary">
                          {cat === 'ROLE' ? 'person' : cat === 'SCENE' ? 'landscape' : cat === 'PROP' ? 'inventory_2' : cat === 'AUDIO' ? 'music_note' : 'widgets'}
                        </span>
                        <span className="text-xs text-slate-900 dark:text-text-dark-primary">
                          {cat === 'ROLE' ? '角色' : cat === 'SCENE' ? '场景' : cat === 'PROP' ? '道具' : cat === 'AUDIO' ? '音频' : '其他'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowLibrarySelector(false)}
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-background-dark text-slate-900 dark:text-text-dark-primary rounded-lg hover:bg-slate-200 dark:hover:bg-neutral-800 transition-all border border-slate-200 dark:border-border-dark"
                >
                  取消
                </button>
                <button
                  onClick={handleAddToLibrary}
                  disabled={isAdding || libraries.length === 0 || !assetName.trim()}
                  className="flex-1 px-4 py-2 bg-neutral-800 dark:bg-white  hover:shadow-lg text-white dark:text-black rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAdding ? '添加中...' : '确认添加'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      <CustomHandle
        type="source"
        position={Position.Right}
        id={`${id}-source`}
        className="!w-3 !h-3 !border-2 !rounded-full !bg-white dark:!bg-black !border-slate-400 dark:!border-white hover:!scale-150 !transition-transform !cursor-crosshair !shadow-[0_0_5px_rgba(255,255,255,0.5)]"
      />
    </div>
  );
};

export default memo(ImagePreviewNode);
