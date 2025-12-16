import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useHeader } from '../contexts/HeaderContext';
import { useAuthStore } from '../store/authStore';
import { useTenantAuthStore } from '../store/tenantAuthStore';
import { useWorkflowSocket } from '../hooks/useWorkflowSocket';
import { WorkflowUsersProvider, useWorkflowUsers } from '../contexts/WorkflowUsersContext';
import ReactFlow, {
  Controls,
  Node,
  Edge,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  NodeTypes,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { apiClient } from '../lib/api';
import AIImageNode from '../components/workflow/nodes/AIImageNode';
import AIVideoNode from '../components/workflow/nodes/AIVideoNode';
import AIVideoT2VNode from '../components/workflow/nodes/AIVideoT2VNode';
import AIVideoI2VFirstNode from '../components/workflow/nodes/AIVideoI2VFirstNode';
import AIVideoI2VLastNode from '../components/workflow/nodes/AIVideoI2VLastNode';
import AIVideoFirstLastNode from '../components/workflow/nodes/AIVideoFirstLastNode';
import AIVideoReferenceNode from '../components/workflow/nodes/AIVideoReferenceNode';
import AIVideoEditNode from '../components/workflow/nodes/AIVideoEditNode';
import AIVideoLipSyncNode from '../components/workflow/nodes/AIVideoLipSyncNode';
import AIVideoStyleNode from '../components/workflow/nodes/AIVideoStyleNode';
import AgentNode from '../components/workflow/nodes/AgentNode';
import UploadNode from '../components/workflow/nodes/UploadNode';
import AssetSelectorNode from '../components/workflow/nodes/AssetSelectorNode';
import ImagePreviewNode from '../components/workflow/nodes/ImagePreviewNode';
import VideoPreviewNode from '../components/workflow/nodes/VideoPreviewNode';
import TextPreviewNode from '../components/workflow/nodes/TextPreviewNode';
import MidjourneyNode from '../components/workflow/nodes/MidjourneyNode';
import SoraVideoNode from '../components/workflow/nodes/SoraVideoNode';
import SoraCharacterNode from '../components/workflow/nodes/SoraCharacterNode';
import AudioVoiceNode from '../components/workflow/nodes/AudioVoiceNode';
import VoiceCloneNode from '../components/workflow/nodes/VoiceCloneNode';
import AudioSynthesizeNode from '../components/workflow/nodes/AudioSynthesizeNode';
import AuroraEdge from '../components/workflow/AuroraEdge';
import AudioPreviewNode from '../components/workflow/nodes/AudioPreviewNode';
import AudioDesignNode from '../components/workflow/nodes/AudioDesignNode';
import SuperCanvasNode from '../components/workflow/nodes/SuperCanvasNode';
import VideoUpscaleNode from '../components/workflow/nodes/VideoUpscaleNode';
import CommercialVideoNode from '../components/workflow/nodes/CommercialVideoNode';
import TextAnnotationNode from '../components/workflow/nodes/TextAnnotationNode';
import ImageFusionNode from '../components/workflow/nodes/ImageFusionNode';
import SmartStoryboardNode from '../components/workflow/nodes/SmartStoryboardNode';
import HDUpscaleNode from '../components/workflow/nodes/HDUpscaleNode';
import AssetLibraryPanel from '../components/workflow/AssetLibraryPanel';

interface Project {
  id: string;
  name: string;
  description?: string;
  type: string;
  status: string;
}

interface ContextMenu {
  x: number;
  y: number;
}

interface NodeGroup {
  id: string;
  nodeIds: string[];
  name?: string; // 命名格式：第x幕-第y镜
  scene?: number; // 幕数 (x)
  shot?: number; // 镜数 (y)
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  hidden?: boolean;
}

// 定义节点类型
const nodeTypes: NodeTypes = {
  agent: AgentNode,
  aiImage: AIImageNode,
  aiVideo: AIVideoNode,
  soraVideo: SoraVideoNode,
  soraCharacter: SoraCharacterNode,
  aiVideo_t2v: AIVideoT2VNode,
  aiVideo_i2v_first: AIVideoI2VFirstNode,
  aiVideo_i2v_last: AIVideoI2VLastNode,
  aiVideo_first_last: AIVideoFirstLastNode,
  aiVideo_reference: AIVideoReferenceNode,
  aiVideo_swap: AIVideoEditNode,
  aiVideo_lipsync: AIVideoLipSyncNode,
  aiVideo_style: AIVideoStyleNode,
  upload: UploadNode,
  assetSelector: AssetSelectorNode,
  imagePreview: ImagePreviewNode,
  videoPreview: VideoPreviewNode,
  textPreview: TextPreviewNode,
  midjourney: MidjourneyNode,
  audioVoice: AudioVoiceNode,
  voiceClone: VoiceCloneNode,
  audioSynthesize: AudioSynthesizeNode,
  audioDesign: AudioDesignNode,
  audioPreview: AudioPreviewNode,
  superCanvas: SuperCanvasNode,
  videoUpscale: VideoUpscaleNode,
  commercialVideo: CommercialVideoNode,
  textAnnotation: TextAnnotationNode,
  imageFusion: ImageFusionNode,
  smartStoryboard: SmartStoryboardNode,
  hdUpscale: HDUpscaleNode,
};

const edgeTypes = {
  aurora: AuroraEdge,
};

const WorkflowEditorInner = () => {
  // 支持三种路由：
  // 1. /projects/:id/workflow - 快速创作项目
  // 2. /projects/:projectId/episodes/:episodeId/workflow - 剧集创作
  // 3. /workflow/:workflowId - 直接访问工作流（共享的工作流）
  const { id, projectId, episodeId, workflowId: directWorkflowId } = useParams<{ id?: string; projectId?: string; episodeId?: string; workflowId?: string }>();
  const isDirectWorkflowAccess = !!directWorkflowId;
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const sceneParam = useMemo(() => {
    const v = Number(searchParams.get('scene'));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  }, [searchParams]);
  const shotParam = useMemo(() => {
    const v = Number(searchParams.get('shot'));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  }, [searchParams]);
  const forceReadOnly = useMemo(() => searchParams.get('readonly') === 'true', [searchParams]);
  // 从剧集详情页传入的资产
  const initialAssets = useMemo(() => {
    try {
      const assetsStr = searchParams.get('assets');
      if (assetsStr) {
        const parsed = JSON.parse(decodeURIComponent(assetsStr));
        return parsed;
      }
    } catch (e) {
    }
    return [];
  }, [searchParams]);
  const { screenToFlowPosition, setCenter, getViewport, fitView } = useReactFlow();
  const { setTitle } = useHeader();
  const authUser = useAuthStore(state => state.user); // 平台版当前登录用户
  const tenantUser = useTenantAuthStore(state => state.user); // 租户版当前登录用户
  const currentUser = tenantUser || authUser; // 优先使用租户用户
  const { setUsers: setWorkflowUsers } = useWorkflowUsers(); // 用户信息缓存
  const [project, setProject] = useState<Project | null>(null);
  const [episode, setEpisode] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isReadOnly, setIsReadOnly] = useState(false); // 协作者只读模式
  const isReadOnlyRef = useRef(false); // ref 版本用于回调中
  const [workflowOwner, setWorkflowOwner] = useState<{ nickname: string | null; avatar: string | null } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null); // 当前用户ID
  const [isWorkflowOwner, setIsWorkflowOwner] = useState(true); // 是否是工作流所有者
  const currentUserIdRef = useRef<string | null>(null); // ref 版本用于回调中
  const [isSharedWorkflow, setIsSharedWorkflow] = useState(false); // 是否是共享工作流（需要自动刷新）
  const [actualWorkflowId, setActualWorkflowId] = useState<string | null>(null); // 实际工作流ID（用于 WebSocket 连接）
  const actualWorkflowIdRef = useRef<string | null>(null); // ref 版本（用于回调中）
  // 路由参数的 ref 版本（用于 saveWorkflow 等回调函数中获取最新值）
  const projectIdRef = useRef(projectId);
  const episodeIdRef = useRef(episodeId);
  const sceneParamRef = useRef(sceneParam);
  const shotParamRef = useRef(shotParam);
  const idRef = useRef(id);
  const directWorkflowIdRef = useRef(directWorkflowId);
  const [initialFitDone, setInitialFitDone] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [aiModels, setAiModels] = useState<any[]>([]);
  const aiModelsRef = useRef<any[]>([]); // ref 版本用于回调中获取最新值
  const [agents, setAgents] = useState<any[]>([]);
  const [activeCtxSubmenu, setActiveCtxSubmenu] = useState<string | null>(null);
  const [activeConnSubmenu, setActiveConnSubmenu] = useState<string | null>(null);
  const ctxSubmenuTimeoutRef = useRef<number | null>(null);
  const connSubmenuTimeoutRef = useRef<number | null>(null);

  // 兼容旧逻辑的别名（统一管理为一个整体）
  // const showAgentSubmenu = activeCtxSubmenu === 'agent';
  const showVideoSubmenu = activeCtxSubmenu === 'video';
  const showVideoEditSubmenu = activeCtxSubmenu === 'edit';
  const showImageEditSubmenu = activeCtxSubmenu === 'imageEdit';
  const setShowAgentSubmenu = (v: boolean) => setActiveCtxSubmenu(v ? 'agent' : null);
  const setShowVideoSubmenu = (v: boolean) => setActiveCtxSubmenu(v ? 'video' : null);
  const setShowVideoEditSubmenu = (v: boolean) => setActiveCtxSubmenu(v ? 'edit' : null);
  const setShowImageEditSubmenu = (v: boolean) => setActiveCtxSubmenu(v ? 'imageEdit' : null);
  // const agentSubmenuTimeoutRef = ctxSubmenuTimeoutRef;
  const videoSubmenuTimeoutRef = ctxSubmenuTimeoutRef;
  const imageEditSubmenuTimeoutRef = ctxSubmenuTimeoutRef;
  // const editSubmenuTimeoutRef = ctxSubmenuTimeoutRef;
  const showConnectionAgentSubmenu = activeConnSubmenu === 'agent';
  // const showConnectionVideoSubmenu = activeConnSubmenu === 'video';
  // const showConnectionAudioSubmenu = activeConnSubmenu === 'audio';
  const setShowConnectionAgentSubmenu = (v: boolean) => setActiveConnSubmenu(v ? 'agent' : null);
  // const setShowConnectionVideoSubmenu = (v: boolean) => setActiveConnSubmenu(v ? 'video' : null);
  // const setShowConnectionAudioSubmenu = (v: boolean) => setActiveConnSubmenu(v ? 'audio' : null);
  const connectionAgentSubmenuTimeoutRef = connSubmenuTimeoutRef;
  // const connectionVideoSubmenuTimeoutRef = connSubmenuTimeoutRef;
  const connectionEditSubmenuTimeoutRef = connSubmenuTimeoutRef;


  const normalizeGenLabel = useCallback((t?: string) => {
    const s = (t || '').toLowerCase().replace(/[_\-\s]+/g, ' ');
    if (!s) return '';
    if (s.includes('文生') || s.includes('text to video') || s.includes('t2v') || s.includes('text-to-video')) return '文生视频';
    if (s.includes('首尾') || s.includes('first last') || s.includes('two frame') || s.includes('frame pair') || s.includes('first-last')) return '首尾帧';
    if (s.includes('首帧') || s.includes('first frame') || s.includes('start frame') || s.includes('initial frame') || s.includes('keyframe')) return '首帧';
    if (s.includes('尾帧') || s.includes('last frame') || s.includes('end frame') || s.includes('final frame')) return '尾帧';
    if (s.includes('主体参考') || s.includes('subject reference')) return '参考图';
    if (s.includes('参考') || s.includes('reference image') || s.includes('image reference') || s.includes('ref image')) return '参考图';
    return t || '';
  }, []);

  const supportedVideoTypes = useMemo(() => {
    const set = new Set<string>();
    const vids = (aiModels || []).filter((m: any) => (m.type || '') === 'VIDEO_GENERATION');
    vids.forEach((m: any) => {
      const arr: string[] = Array.isArray(m?.config?.supportedGenerationTypes) ? m.config.supportedGenerationTypes : [];
      arr.forEach((raw: string) => {
        const norm = normalizeGenLabel(raw);
        if (norm) set.add(norm);
      });
    });
    return set;
  }, [aiModels, normalizeGenLabel]);
  const videoEditingCapabilities = useMemo(() => ['视频换人', '动作克隆', '视频换背景', '风格转换', '对口型'], []);
  const getModelsForEditingCapability = useCallback((cap: string) => {
    const fromEditing = (aiModels || []).filter((m: any) => (m.type || '') === 'VIDEO_EDITING')
      .filter((m: any) => Array.isArray(m?.config?.supportedEditingCapabilities) && m.config.supportedEditingCapabilities.includes(cap));
    const fromGeneration = (aiModels || []).filter((m: any) => (m.type || '') === 'VIDEO_GENERATION')
      .filter((m: any) => {
        if (cap !== '视频换人') return false;
        const okFlag = m?.config?.supportsVideoEditing === true;
        const arr: string[] = Array.isArray(m?.config?.supportedGenerationTypes) ? m.config.supportedGenerationTypes : [];
        const hasType = arr.some((t) => normalizeGenLabel(t) === '视频换人');
        return okFlag || hasType;
      });
    const map: Record<string, any> = {};
    [...fromEditing, ...fromGeneration].forEach((m: any) => { if (!map[m.id]) map[m.id] = m; });
    return Object.values(map);
  }, [aiModels, normalizeGenLabel]);
  const [isAssetPanelOpen, setIsAssetPanelOpen] = useState(false);
  const [activeAssetSelectorNodeId, setActiveAssetSelectorNodeId] = useState<string | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // 编组相关状态
  const [nodeGroups, setNodeGroups] = useState<NodeGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [currentShotGroupId, setCurrentShotGroupId] = useState<string | null>(null);
  const [showNamingDialog, setShowNamingDialog] = useState(false);
  const [namingGroupId, setNamingGroupId] = useState<string | null>(null);
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const nodeGroupsRef = useRef<NodeGroup[]>([]);
  const draggingGroupIdRef = useRef<string | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false); // 是否处于选择模式
  const [isTextAnnotationMode, setIsTextAnnotationMode] = useState(false); // 是否处于添加文本标注模式
  const [viewportKey, setViewportKey] = useState(0); // 用于强制更新编组框位置
  const draggedNodeIdRef = useRef<string | null>(null); // 记录被拖动的节点ID
  const lastNodePositionRef = useRef<{ x: number; y: number } | null>(null); // 记录节点的上一次位置
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const lastNodesLengthRef = useRef<number>(0);

  // 判断是项目工作流还是剧集工作流
  const isEpisodeWorkflow = !!episodeId;
  const isShotWorkflow = isEpisodeWorkflow && !!sceneParam && !!shotParam;
  const workflowId = isDirectWorkflowAccess 
    ? directWorkflowId 
    : (isShotWorkflow ? `${episodeId}-${sceneParam}-${shotParam}` : (isEpisodeWorkflow ? episodeId : id));
  const isFrozenByStoryboard = isShotWorkflow;
  const isDirectWorkflowAccessRef = useRef(isDirectWorkflowAccess);
  const isEpisodeWorkflowRef = useRef(isEpisodeWorkflow);
  const isShotWorkflowRef = useRef(isShotWorkflow);

  // 同步路由参数到 ref（用于 saveWorkflow 等回调函数中获取最新值）
  useEffect(() => {
    projectIdRef.current = projectId;
    episodeIdRef.current = episodeId;
    sceneParamRef.current = sceneParam;
    shotParamRef.current = shotParam;
    idRef.current = id;
    directWorkflowIdRef.current = directWorkflowId;
    isDirectWorkflowAccessRef.current = isDirectWorkflowAccess;
    isEpisodeWorkflowRef.current = isEpisodeWorkflow;
    isShotWorkflowRef.current = isShotWorkflow;
  }, [projectId, episodeId, sceneParam, shotParam, id, directWorkflowId, isDirectWorkflowAccess, isEpisodeWorkflow, isShotWorkflow]);

  const [workflowLoaded, setWorkflowLoaded] = useState(false);

  // ========== WebSocket 实时协作 ==========
  
  // 记录从 WebSocket 接收的节点/边 ID（用于区分本地添加和远程同步）
  const remoteNodeIdsRef = useRef<Set<string>>(new Set());
  const remoteEdgeIdsRef = useRef<Set<string>>(new Set());
  const prevNodeIdsRef = useRef<Set<string>>(new Set());
  const prevEdgeIdsRef = useRef<Set<string>>(new Set());
  // 记录节点数据的快照（用于检测数据变化）
  const prevNodeDataRef = useRef<Map<string, string>>(new Map());
  // 记录正在接收远程更新的节点（避免重复广播）
  const remoteUpdatingNodesRef = useRef<Set<string>>(new Set());
  // 标记当前是否正在接收远程更新（避免远程更新触发自动保存）
  const isReceivingRemoteUpdateRef = useRef(false);
  
  // Socket 回调：收到其他用户添加的节点
  const handleSocketNodeAdd = useCallback((node: Node, userId: string) => {
    if (userId === currentUserIdRef.current) return; // 忽略自己的操作
    // 标记正在接收远程更新（避免触发自动保存）
    isReceivingRemoteUpdateRef.current = true;
    // 标记为远程节点，避免再次广播
    remoteNodeIdsRef.current.add(node.id);
    setNodes((nds) => {
      // 检查节点是否已存在
      if (nds.some(n => n.id === node.id)) return nds;
      // 使用 ref 获取最新的模型数据（避免闭包陷阱）
      const currentModels = aiModelsRef.current;
      console.log('[Socket] 添加远程节点:', node.id, '模型数量:', currentModels.length);
      return [...nds, { ...node, data: { ...node.data, models: currentModels } }];
    });
    // 延时清除标记
    setTimeout(() => { isReceivingRemoteUpdateRef.current = false; }, 500);
  }, [setNodes]); // 移除 aiModels 依赖，使用 ref 获取最新值

  // Socket 回调：收到其他用户更新的节点
  const handleSocketNodeUpdate = useCallback((nodeId: string, changes: any, userId: string) => {
    if (userId === currentUserIdRef.current) return;
    // 标记正在接收远程更新
    isReceivingRemoteUpdateRef.current = true;
    // 标记为远程更新，避免再次广播
    remoteUpdatingNodesRef.current.add(nodeId);
    setNodes((nds) => nds.map(n => 
      n.id === nodeId ? { ...n, data: { ...n.data, ...changes } } : n
    ));
    // 短暂延时后移除标记
    setTimeout(() => {
      remoteUpdatingNodesRef.current.delete(nodeId);
      isReceivingRemoteUpdateRef.current = false;
    }, 500);
  }, [setNodes]);

  // Socket 回调：收到其他用户删除的节点
  const handleSocketNodeDelete = useCallback((nodeId: string, userId: string) => {
    if (userId === currentUserIdRef.current) return;
    isReceivingRemoteUpdateRef.current = true;
    setNodes((nds) => nds.filter(n => n.id !== nodeId));
    setEdges((eds) => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
    setTimeout(() => { isReceivingRemoteUpdateRef.current = false; }, 500);
  }, [setNodes, setEdges]);

  // Socket 回调：收到其他用户移动的节点
  const handleSocketNodeMove = useCallback((nodeId: string, position: { x: number; y: number }, userId: string) => {
    if (userId === currentUserIdRef.current) return;
    isReceivingRemoteUpdateRef.current = true;
    setNodes((nds) => nds.map(n => 
      n.id === nodeId ? { ...n, position } : n
    ));
    setTimeout(() => { isReceivingRemoteUpdateRef.current = false; }, 500);
  }, [setNodes]);

  // Socket 回调：收到其他用户批量移动的节点
  const handleSocketNodesMove = useCallback((movedNodes: Array<{ id: string; position: { x: number; y: number } }>, userId: string) => {
    if (userId === currentUserIdRef.current) return;
    isReceivingRemoteUpdateRef.current = true;
    setNodes((nds) => nds.map(n => {
      const moved = movedNodes.find(m => m.id === n.id);
      return moved ? { ...n, position: moved.position } : n;
    }));
    setTimeout(() => { isReceivingRemoteUpdateRef.current = false; }, 500);
  }, [setNodes]);

  // Socket 回调：收到其他用户添加的边
  const handleSocketEdgeAdd = useCallback((edge: Edge, userId: string) => {
    if (userId === currentUserIdRef.current) return;
    isReceivingRemoteUpdateRef.current = true;
    // 标记为远程边，避免再次广播
    remoteEdgeIdsRef.current.add(edge.id);
    setEdges((eds) => {
      if (eds.some(e => e.id === edge.id)) return eds;
      return [...eds, edge];
    });
    setTimeout(() => { isReceivingRemoteUpdateRef.current = false; }, 500);
  }, [setEdges]);

  // Socket 回调：收到其他用户删除的边
  const handleSocketEdgeDelete = useCallback((edgeId: string, userId: string) => {
    if (userId === currentUserIdRef.current) return;
    isReceivingRemoteUpdateRef.current = true;
    setEdges((eds) => eds.filter(e => e.id !== edgeId));
    setTimeout(() => { isReceivingRemoteUpdateRef.current = false; }, 500);
  }, [setEdges]);

  // Socket 回调：收到其他用户更新的编组
  const handleSocketGroupsUpdate = useCallback((groups: any[], userId: string) => {
    if (userId === currentUserIdRef.current) return;
    isReceivingRemoteUpdateRef.current = true;
    console.log('[Socket] 收到编组更新，更新本地编组状态');
    setNodeGroups(groups);
    nodeGroupsRef.current = groups;
    setTimeout(() => { isReceivingRemoteUpdateRef.current = false; }, 500);
  }, []);

  // 使用 Socket Hook
  const {
    emitNodeAdd,
    emitNodeUpdate,
    emitNodeDelete,
    emitNodeMove: _emitNodeMove, // 保留供将来使用
    emitNodesMove,
    emitEdgeAdd,
    emitEdgeDelete,
    emitGroupsUpdate,
    onlineUsers,
  } = useWorkflowSocket({
    workflowId: actualWorkflowId,
    isSharedWorkflow,
    isReadOnly,
    onNodeAdd: handleSocketNodeAdd,
    onNodeUpdate: handleSocketNodeUpdate,
    onNodeDelete: handleSocketNodeDelete,
    onNodeMove: handleSocketNodeMove,
    onNodesMove: handleSocketNodesMove,
    onEdgeAdd: handleSocketEdgeAdd,
    onEdgeDelete: handleSocketEdgeDelete,
    onGroupsUpdate: handleSocketGroupsUpdate,
  });

  // 同步 nodeGroups 和 draggingGroupId 到 ref
  useEffect(() => {
    nodeGroupsRef.current = nodeGroups;
    
  }, [nodeGroups]);

  useEffect(() => {
    nodesRef.current = nodes;
    lastNodesLengthRef.current = nodes.length;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // 同步在线用户信息到 WorkflowUsersContext（用于节点头像实时更新）
  useEffect(() => {
    if (onlineUsers.length > 0) {
      setWorkflowUsers(onlineUsers.map(u => ({
        id: u.id,
        nickname: u.nickname,
        avatar: u.avatar,
      })));
    }
  }, [onlineUsers, setWorkflowUsers]);

  // 加载协作者列表到 WorkflowUsersContext（用于离线用户的头像显示）
  useEffect(() => {
    const loadCollaborators = async () => {
      if (!isSharedWorkflow || !actualWorkflowId) return;
      
      try {
        const res = await apiClient.workflows.getCollaborators(actualWorkflowId);
        if (res.data && Array.isArray(res.data)) {
          const users = res.data
            .filter((c: any) => c.user)
            .map((c: any) => ({
              id: c.user.id,
              nickname: c.user.nickname,
              avatar: c.user.avatar,
            }));
          if (users.length > 0) {
            setWorkflowUsers(users);
          }
        }
      } catch (e) {
        // 忽略错误，协作者列表加载失败不影响主功能
      }
    };
    
    loadCollaborators();
  }, [isSharedWorkflow, actualWorkflowId, setWorkflowUsers]);

  // 监听节点变化，自动广播新增的本地节点和数据更新
  useEffect(() => {
    // 工作流未加载完成时，只更新 ref，不广播
    if (!workflowLoaded) {
      prevNodeIdsRef.current = new Set(nodes.map(n => n.id));
      // 初始化节点数据快照
      const dataMap = new Map<string, string>();
      nodes.forEach(n => {
        try {
          dataMap.set(n.id, JSON.stringify(n.data?.config || {}));
        } catch { dataMap.set(n.id, '{}'); }
      });
      prevNodeDataRef.current = dataMap;
      return;
    }
    
    if (!isSharedWorkflow || isReadOnlyRef.current) {
      prevNodeIdsRef.current = new Set(nodes.map(n => n.id));
      return;
    }
    
    const currentNodeIds = new Set(nodes.map(n => n.id));
    const prevNodeIds = prevNodeIdsRef.current;
    
    // 检测新增的节点和数据变化
    nodes.forEach(node => {
      if (!prevNodeIds.has(node.id)) {
        // 是新节点
        if (!remoteNodeIdsRef.current.has(node.id)) {
          // 不是从远程接收的，是本地添加的，需要广播
          console.log('[Socket] 广播本地新增节点:', node.id, node.type);
          emitNodeAdd(node);
        }
      } else {
        // 已存在的节点，检查数据是否变化
        if (!remoteUpdatingNodesRef.current.has(node.id)) {
          try {
            const currentData = JSON.stringify(node.data?.config || {});
            const prevData = prevNodeDataRef.current.get(node.id) || '{}';
            if (currentData !== prevData) {
              // 数据变化了，广播更新
              console.log('[Socket] 广播节点数据更新:', node.id, node.type);
              emitNodeUpdate(node.id, { config: node.data?.config });
            }
          } catch { /* ignore */ }
        }
      }
    });
    
    // 更新上一次的节点 ID 集合和数据快照
    prevNodeIdsRef.current = currentNodeIds;
    const dataMap = new Map<string, string>();
    nodes.forEach(n => {
      try {
        dataMap.set(n.id, JSON.stringify(n.data?.config || {}));
      } catch { dataMap.set(n.id, '{}'); }
    });
    prevNodeDataRef.current = dataMap;
    // 清理已处理的远程节点 ID（避免内存泄漏）
    remoteNodeIdsRef.current = new Set([...remoteNodeIdsRef.current].filter(id => currentNodeIds.has(id)));
  }, [nodes, isSharedWorkflow, workflowLoaded, emitNodeAdd, emitNodeUpdate]);

  // 监听边变化，自动广播新增的本地边
  useEffect(() => {
    // 工作流未加载完成时，只更新 ref，不广播
    if (!workflowLoaded) {
      prevEdgeIdsRef.current = new Set(edges.map(e => e.id));
      return;
    }
    
    if (!isSharedWorkflow || isReadOnlyRef.current) {
      prevEdgeIdsRef.current = new Set(edges.map(e => e.id));
      return;
    }
    
    const currentEdgeIds = new Set(edges.map(e => e.id));
    const prevEdgeIds = prevEdgeIdsRef.current;
    
    // 检测新增的边
    edges.forEach(edge => {
      if (!prevEdgeIds.has(edge.id)) {
        // 是新边
        if (!remoteEdgeIdsRef.current.has(edge.id)) {
          // 不是从远程接收的，是本地添加的，需要广播
          console.log('[Socket] 广播本地新增边:', edge.id);
          emitEdgeAdd(edge);
        }
      }
    });
    
    // 更新上一次的边 ID 集合
    prevEdgeIdsRef.current = currentEdgeIds;
    // 清理已处理的远程边 ID
    remoteEdgeIdsRef.current = new Set([...remoteEdgeIdsRef.current].filter(id => currentEdgeIds.has(id)));
  }, [edges, isSharedWorkflow, workflowLoaded, emitEdgeAdd]);

  // 检查当前用户是否可以编辑指定节点
  // 规则：
  // 1. 工作流所有者可以编辑所有节点（包括协作者创建的节点）
  // 2. 协作者只能编辑自己创建的节点及其生成的内容节点
  // 3. 非隐藏编组内的节点对协作者只读（hidden: true 的编组是剧集工作流的默认编组，不限制）
  // 4. 没有 createdBy 的旧节点视为所有者创建，协作者不能编辑
  const canEditNode = useCallback((node: Node) => {
    // 只读模式下都不能编辑
    if (isReadOnlyRef.current) return false;
    
    // 工作流所有者可以编辑所有节点（包括编组内的节点和协作者创建的节点）
    if (isWorkflowOwner) return true;
    
    // 检查节点是否在非隐藏编组内（编组内节点对协作者只读）
    // hidden: true 的编组是剧集工作流的默认编组，不应该限制操作
    const isInGroup = nodeGroupsRef.current.some(g => !g.hidden && g.nodeIds?.includes(node.id));
    if (isInGroup) return false;
    
    // 协作者只能编辑自己创建的节点
    const nodeCreatedBy = node.data?.createdBy;
    // 兼容新旧格式：createdBy 可能是字符串(旧) 或对象(新)
    const creatorId = typeof nodeCreatedBy === 'object' ? nodeCreatedBy?.id : nodeCreatedBy;
    
    // 调试日志
    if (import.meta.env.DEV) {
      console.log('[canEditNode]', {
        nodeId: node.id,
        nodeType: node.type,
        creatorId,
        currentUserId: currentUserIdRef.current,
        isMatch: creatorId === currentUserIdRef.current,
      });
    }
    
    // 没有 createdBy 的节点视为所有者创建的旧节点，协作者不能编辑
    if (!creatorId) {
      return false;
    }
    
    if (creatorId === currentUserIdRef.current) {
      return true;
    }
    
    // 对于预览节点，检查其源节点的创建者
    const isPreviewNode = ['imagePreview', 'videoPreview', 'audioPreview', 'textPreview'].includes(node.type || '');
    if (isPreviewNode) {
      // 查找连接到该预览节点的边，找到源节点
      const incomingEdge = edgesRef.current.find(e => e.target === node.id);
      if (incomingEdge) {
        const sourceNode = nodesRef.current.find(n => n.id === incomingEdge.source);
        if (sourceNode) {
          const sourceCreatedBy = sourceNode.data?.createdBy;
          const sourceCreatorId = typeof sourceCreatedBy === 'object' ? sourceCreatedBy?.id : sourceCreatedBy;
          // 源节点也必须有 createdBy 且是当前用户
          if (sourceCreatorId && sourceCreatorId === currentUserIdRef.current) {
            return true;
          }
        }
      }
    }
    
    return false;
  }, [isWorkflowOwner]);

  // 为节点添加编辑权限标记和共享状态（用于视觉反馈）
  const nodesWithPermission = useMemo(() => {
    // 获取所有非隐藏编组（用户手动创建的编组）内的节点ID
    // hidden: true 的编组是分镜工作流的默认编组，不应该限制操作
    const groupedNodeIds = new Set(nodeGroups.filter(g => !g.hidden).flatMap(g => g.nodeIds || []));
    
    return nodes.map(node => {
      const isGrouped = groupedNodeIds.has(node.id);
      // 编组内节点：
      // - 所有者可以编辑
      // - 协作者不能编辑（仅能下载/保存素材）
      // 非编组节点：
      // - 所有者可以编辑所有节点
      // - 协作者只能编辑自己创建的节点
      const canEdit = isGrouped ? isWorkflowOwner : (isWorkflowOwner ? true : canEditNode(node));
      
      // 拖动权限：
      // - 只读模式：不能拖动
      // - 编组内节点：只有所有者可以拖动（拖动时移动整个编组）
      // - 非编组节点：只有可编辑的节点才能拖动
      const canDrag = isReadOnly ? false : (isGrouped ? isWorkflowOwner : canEdit);
      
      return {
        ...node,
        draggable: canDrag && node.draggable !== false,
        connectable: isGrouped ? isWorkflowOwner : (node.connectable !== false),
        data: {
          ...node.data,
          _canEdit: canEdit,
          _isGrouped: isGrouped, // 标记是否在编组内
          _currentUserId: currentUserId,
          _isSharedWorkflow: isSharedWorkflow, // 用于显示创建者头像
        }
      };
    });
  }, [nodes, nodeGroups, isWorkflowOwner, canEditNode, currentUserId, isSharedWorkflow, isReadOnly]);

  // 节点位置变更防抖定时器
  const nodeMoveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNodeMovesRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  
  // 带权限检查的节点变更处理器
  // 过滤掉对没有编辑权限节点的位置变更
  const handleNodesChangeWithPermission = useCallback((changes: any[]) => {
    // 只读模式直接返回
    if (isReadOnlyRef.current) {
      onNodesChange(changes);
      return;
    }
    
    // 过滤位置变更：编组内节点通过 handleNodeDrag 处理整体移动
    const filteredChanges = changes.filter((change: any) => {
      // 允许所有非位置变更（如选中状态）
      if (change.type !== 'position') return true;
      
      // 检查节点是否在非隐藏编组内
      const group = nodeGroupsRef.current.find(g => !g.hidden && g.nodeIds?.includes(change.id));
      if (group) {
        // 非隐藏编组内的节点只有所有者可以拖动（由 handleNodeDrag 处理整体移动）
        // 协作者不能拖动编组内的节点
        return isWorkflowOwner;
      }
      
      // 所有者可以拖动非编组节点
      if (isWorkflowOwner) return true;
      
      // 协作者只能拖动自己创建的非编组节点及其生成的内容节点
      const node = nodesRef.current.find(n => n.id === change.id);
      if (!node) return true;
      
      const nodeCreatedBy = node.data?.createdBy;
      const creatorId = typeof nodeCreatedBy === 'object' ? nodeCreatedBy?.id : nodeCreatedBy;
      
      // 没有 createdBy 的节点视为所有者创建的旧节点，协作者不能拖动
      if (!creatorId) {
        return false;
      }
      
      if (creatorId === currentUserIdRef.current) {
        return true;
      }
      
      // 对于预览节点，检查源节点的创建者
      const isPreviewNode = ['imagePreview', 'videoPreview', 'audioPreview', 'textPreview'].includes(node.type || '');
      if (isPreviewNode) {
        const incomingEdge = edgesRef.current.find(e => e.target === node.id);
        if (incomingEdge) {
          const sourceNode = nodesRef.current.find(n => n.id === incomingEdge.source);
          if (sourceNode) {
            const sourceCreatedBy = sourceNode.data?.createdBy;
            const sourceCreatorId = typeof sourceCreatedBy === 'object' ? sourceCreatedBy?.id : sourceCreatedBy;
            // 源节点也必须有 createdBy 且是当前用户
            if (sourceCreatorId && sourceCreatorId === currentUserIdRef.current) {
              return true;
            }
          }
        }
      }
      
      return false;
    });
    
    onNodesChange(filteredChanges);
    
    // 收集位置变更，防抖后广播
    const positionChanges = filteredChanges.filter((c: any) => c.type === 'position' && c.position);
    if (positionChanges.length > 0) {
      positionChanges.forEach((c: any) => {
        pendingNodeMovesRef.current.set(c.id, c.position);
      });
      
      if (nodeMoveDebounceRef.current) {
        clearTimeout(nodeMoveDebounceRef.current);
      }
      
      nodeMoveDebounceRef.current = setTimeout(() => {
        const moves = Array.from(pendingNodeMovesRef.current.entries()).map(([id, position]) => ({ id, position }));
        if (moves.length > 0) {
          emitNodesMove(moves);
          pendingNodeMovesRef.current.clear();
        }
      }, 100);
    }
  }, [isWorkflowOwner, onNodesChange, emitNodesMove]);

  useEffect(() => {
    draggingGroupIdRef.current = draggingGroupId;
  }, [draggingGroupId]);

  // 监听ESC键退出框选模式或文本标注模式
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isSelectionMode) {
          setIsSelectionMode(false);
        }
        if (isTextAnnotationMode) {
          setIsTextAnnotationMode(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSelectionMode, isTextAnnotationMode]);

  useEffect(() => {
    if (workflowId) {
      setInitialFitDone(false); // 重置标志以便新工作流能够自动适配
      setWorkflowLoaded(false); // 重置加载状态
      loadProject();
      loadAIModels();
      loadAgents();
      loadWorkflow().finally(() => {
        setWorkflowLoaded(true); // 标记加载完成
      });
    }
  }, [workflowId]);

  // 注：已移除10秒轮询刷新，改用 WebSocket 实时同步

  // 初始加载完成后自动适配视图
  useEffect(() => {
    if (!loading && !initialFitDone && nodes.length > 0) {
      // 延迟一小段时间以确保节点已完全渲染
      const timer = setTimeout(() => {
        fitView({
          padding: 0.1, // 10% 的边距
          duration: 800, // 动画持续时间
          maxZoom: 1.5, // 最大缩放比例
        });
        setInitialFitDone(true);
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [loading, initialFitDone, nodes.length, fitView]);

  useEffect(() => {
    if (!isShotWorkflow) return;
    if (!episode || !project) return;
    // 必须等待基础工作流加载完成，否则会被 loadWorkflow 的 setNodes 覆盖
    if (!workflowLoaded) return;

    const existing = nodeGroups.find(g => g.scene === sceneParam && g.shot === shotParam);
    if (existing) {
      setCurrentShotGroupId(existing.id);
      setSelectedGroupId(existing.id);
      // 脚本节点内容双向同步：以工作流中的内容为准，不覆盖
      // 只添加新的资产节点
      try {
        // 为传入的资产创建节点（即使是已存在的镜头组）
        if (Array.isArray(initialAssets) && initialAssets.length > 0) {
          const existingNodes = nodes;
          const newAssetNodes: Node[] = [];
          
          // 按类型分组：角色第1列、场景第2列、道具第3列
          const COL_WIDTH = 350;
          const ROW_HEIGHT = 400;
          const START_Y = 300;
          
          // 统计已有节点中每种类型的数量（用于计算新节点的起始行）
          const existingTypeCounts = { role: 0, scene: 0, prop: 0 };
          existingNodes.forEach(n => {
            if (n.type === 'assetSelector') {
              const label = (n.data as any)?.label || '';
              if (label.startsWith('角色')) existingTypeCounts.role++;
              else if (label.startsWith('场景')) existingTypeCounts.scene++;
              else if (label.startsWith('道具')) existingTypeCounts.prop++;
            }
          });
          
          // 新增节点的计数器（从已有数量开始）
          const typeCounters = { ...existingTypeCounts };
          
          // 用于更新已有节点的URL
          const nodesToUpdate: { nodeId: string; newUrl: string }[] = [];
          
          initialAssets.forEach((asset: any, idx: number) => {
            const assetUrl = asset.thumbnail || asset.url || '';
            
            // 检查是否已存在相同资产的节点（通过ID或名称匹配）
            let matchedNodeId: string | null = null;
            const alreadyExists = existingNodes.some(n => {
              if (n.type !== 'assetSelector') return false;
              const config = (n.data as any)?.config;
              const selectedAsset = config?.selectedAsset;
              // 通过ID匹配
              if (selectedAsset?.id === asset.id) { matchedNodeId = n.id; return true; }
              // 通过名称+类型匹配（兼容）
              const label = (n.data as any)?.label || '';
              const assetLabel = asset.type === 'role' ? '角色' : asset.type === 'scene' ? '场景' : '道具';
              if (label === `${assetLabel}: ${asset.name}`) { matchedNodeId = n.id; return true; }
              if (selectedAsset?.name === asset.name) { matchedNodeId = n.id; return true; }
              return false;
            });
            
            // 如果已存在，更新其URL（修复之前可能保存错误的URL）
            if (alreadyExists && matchedNodeId && assetUrl) {
              nodesToUpdate.push({ nodeId: matchedNodeId, newUrl: assetUrl });
            }
            if (alreadyExists) return;
            
            const assetType = asset.type as 'role' | 'scene' | 'prop';
            const colIndex = assetType === 'role' ? 0 : assetType === 'scene' ? 1 : 2;
            const rowIndex = typeCounters[assetType];
            typeCounters[assetType]++;
            
            const assetNodeId = `assetSelector-${Date.now()}-${idx}`;
            const assetPos = { x: colIndex * COL_WIDTH, y: START_Y + rowIndex * ROW_HEIGHT };
            const assetLabel = assetType === 'role' ? '角色' : assetType === 'scene' ? '场景' : '道具';
            
            // 角色使用 RoleGroup 格式（支持多图片），场景/道具使用 selectedAsset 格式
            const newAssetUrl = asset.thumbnail || asset.url || '';
            const metadata = asset.metadata;
            const hasMultipleImages = assetType === 'role' && metadata?.images;
            
            // 构建角色图片数组 - 从 metadata.images 中提取所有图片URL
            let roleImages: { id: string; url: string; name: string }[] = [];
            if (hasMultipleImages) {
              const imgs = metadata.images;
              if (imgs.frontUrl) roleImages.push({ id: 'front', url: imgs.frontUrl, name: `${asset.name}-正面` });
              if (imgs.sideUrl) roleImages.push({ id: 'side', url: imgs.sideUrl, name: `${asset.name}-侧面` });
              if (imgs.backUrl) roleImages.push({ id: 'back', url: imgs.backUrl, name: `${asset.name}-背面` });
              if (imgs.faceUrl) roleImages.push({ id: 'face', url: imgs.faceUrl, name: `${asset.name}-面部` });
            }
            
            const nodeConfig = hasMultipleImages && roleImages.length > 0
              ? {
                  selectedInput: {
                    id: asset.id,
                    name: asset.name,
                    coverUrl: newAssetUrl,
                    images: roleImages,
                  },
                }
              : {
                  selectedAsset: {
                    id: asset.id,
                    name: asset.name,
                    originalName: asset.name,
                    url: newAssetUrl,
                    type: 'IMAGE',
                    mimeType: 'image/png',
                    size: 0,
                  },
                };
            
            newAssetNodes.push({
              id: assetNodeId,
              type: 'assetSelector',
              position: assetPos,
              data: {
                id: assetNodeId,
                label: `${assetLabel}: ${asset.name}`,
                config: nodeConfig,
                freeDrag: true,
                createdBy: currentUser ? { id: currentUser.id, nickname: currentUser.nickname, avatar: currentUser.avatar } : undefined,
                workflowContext: { project, episode, nodeGroup: existing, nodeGroups },
              } as any,
            });
          });
          // 更新已有节点的URL（修复之前可能保存错误的URL）
          if (nodesToUpdate.length > 0) {
            setNodes((nds) => nds.map(n => {
              const update = nodesToUpdate.find(u => u.nodeId === n.id);
              if (update && n.type === 'assetSelector') {
                const config = (n.data as any)?.config || {};
                const selectedAsset = config.selectedAsset || {};
                return {
                  ...n,
                  data: {
                    ...n.data,
                    config: {
                      ...config,
                      selectedAsset: {
                        ...selectedAsset,
                        url: update.newUrl,
                      },
                    },
                  },
                } as any;
              }
              return n;
            }));
          }
          if (newAssetNodes.length > 0) {
            setNodes((nds) => [...nds, ...newAssetNodes]);
          }
        }
      } catch { }
      return;
    }
    const newGroup: NodeGroup = {
      id: `group-${Date.now()}`,
      nodeIds: [],
      name: `第${sceneParam}幕-第${shotParam}镜`,
      scene: sceneParam,
      shot: shotParam,
      bounds: { x: -50000, y: -50000, width: 100000, height: 100000 },
      hidden: true,
    };
    setNodeGroups(prev => [...prev, newGroup]);
    nodeGroupsRef.current = [...nodeGroupsRef.current, newGroup];
    setCurrentShotGroupId(newGroup.id);
    setSelectedGroupId(newGroup.id);

    try {
      const acts = (episode as any)?.scriptJson?.acts || [];
      const act = Array.isArray(acts) ? acts.find((a: any) => Number(a.actIndex) === Number(sceneParam)) : null;
      const shot = act ? (act.shots || []).find((s: any) => Number(s.shotIndex) === Number(shotParam)) : null;
      const makeDocText = () => {
        if (!shot) return '';
        const lines = [
          `画面：${(shot['画面'] || '').trim()}`,
          `景别/镜头：${(shot['景别/镜头'] || '').trim()}`,
          `内容/动作：${(shot['内容/动作'] || '').trim()}`,
          `声音/对话：${(shot['声音/对话'] || '').trim()}`,
          `时长：${(shot['时长'] || '').trim()}`,
        ];
        return lines.join('\n');
      };
      const docText = makeDocText();
      const promptText = (shot && (shot['提示词'] || '').trim()) || '';
      const pos1 = { x: 0, y: 0 };
      const pos2 = { x: 560, y: 0 };

      const nodeId1 = `textPreview-${Date.now()}-a`;
      const nodeId2 = `textPreview-${Date.now()}-b`;
      const newNodes: Node[] = [
        {
          id: nodeId1,
          type: 'textPreview',
          position: pos1,
          data: {
            content: docText || '暂无分镜文本',
            timestamp: Date.now(),
            title: '分镜设计',
            id: nodeId1,
            freeDrag: true,
            createdBy: currentUser ? { id: currentUser.id, nickname: currentUser.nickname, avatar: currentUser.avatar } : undefined, // 记录创建者
            workflowContext: { project, episode, nodeGroup: newGroup, nodeGroups: [...nodeGroups, newGroup] },
          } as any,
        },
        {
          id: nodeId2,
          type: 'textPreview',
          position: pos2,
          data: {
            content: promptText || '暂无提示词',
            timestamp: Date.now(),
            title: '提示词',
            id: nodeId2,
            freeDrag: true,
            createdBy: currentUser ? { id: currentUser.id, nickname: currentUser.nickname, avatar: currentUser.avatar } : undefined, // 记录创建者
            workflowContext: { project, episode, nodeGroup: newGroup, nodeGroups: [...nodeGroups, newGroup] },
          } as any,
        },
      ];
      
      // 为传入的资产创建资产选择器节点（按类型分列）
      const assetNodeIds: string[] = [];
      if (Array.isArray(initialAssets) && initialAssets.length > 0) {
        const COL_WIDTH = 350;
        const ROW_HEIGHT = 400;
        const START_Y = 300;
        const typeCounters = { role: 0, scene: 0, prop: 0 };
        
        initialAssets.forEach((asset: any, idx: number) => {
          const assetType = asset.type as 'role' | 'scene' | 'prop';
          const colIndex = assetType === 'role' ? 0 : assetType === 'scene' ? 1 : 2;
          const rowIndex = typeCounters[assetType];
          typeCounters[assetType]++;
          
          const assetNodeId = `assetSelector-${Date.now()}-${idx}`;
          assetNodeIds.push(assetNodeId);
          const assetPos = { x: colIndex * COL_WIDTH, y: START_Y + rowIndex * ROW_HEIGHT };
          const assetLabel = assetType === 'role' ? '角色' : assetType === 'scene' ? '场景' : '道具';
          
          // 角色使用 RoleGroup 格式（支持多图片），场景/道具使用 selectedAsset 格式
          const assetUrl = asset.thumbnail || asset.url || '';
          const metadata = asset.metadata;
          const hasMultipleImages = assetType === 'role' && metadata?.images;
          
          // 构建角色图片数组 - 从 metadata.images 中提取所有图片URL
          let roleImages: { id: string; url: string; name: string }[] = [];
          if (hasMultipleImages) {
            const imgs = metadata.images;
            if (imgs.frontUrl) roleImages.push({ id: 'front', url: imgs.frontUrl, name: `${asset.name}-正面` });
            if (imgs.sideUrl) roleImages.push({ id: 'side', url: imgs.sideUrl, name: `${asset.name}-侧面` });
            if (imgs.backUrl) roleImages.push({ id: 'back', url: imgs.backUrl, name: `${asset.name}-背面` });
            if (imgs.faceUrl) roleImages.push({ id: 'face', url: imgs.faceUrl, name: `${asset.name}-面部` });
          }
          
          const nodeConfig = hasMultipleImages && roleImages.length > 0
            ? {
                selectedInput: {
                  id: asset.id,
                  name: asset.name,
                  coverUrl: assetUrl,
                  images: roleImages,
                },
              }
            : {
                selectedAsset: {
                  id: asset.id,
                  name: asset.name,
                  originalName: asset.name,
                  url: assetUrl,
                  type: 'IMAGE',
                  mimeType: 'image/png',
                  size: 0,
                },
              };
          
          newNodes.push({
            id: assetNodeId,
            type: 'assetSelector',
            position: assetPos,
            data: {
              id: assetNodeId,
              label: `${assetLabel}: ${asset.name}`,
              config: nodeConfig,
              freeDrag: true,
              createdBy: currentUser ? { id: currentUser.id, nickname: currentUser.nickname, avatar: currentUser.avatar } : undefined,
              workflowContext: { project, episode, nodeGroup: newGroup, nodeGroups: [...nodeGroups, newGroup] },
              onOpenAssetPanel: handleOpenAssetPanelForNode,
            } as any,
          });
        });
      }
      
      setNodes((nds) => [...nds, ...newNodes]);
      const allNewNodeIds = [nodeId1, nodeId2, ...assetNodeIds];
      setNodeGroups(prev => prev.map(g => {
        if (g.id !== newGroup.id) return g;
        const updatedIds = Array.from(new Set([...(g.nodeIds || []), ...allNewNodeIds]));
        const b = g.bounds;
        return { ...g, nodeIds: updatedIds, bounds: b } as NodeGroup;
      }));
      nodeGroupsRef.current = nodeGroupsRef.current.map(g => {
        if (g.id !== newGroup.id) return g;
        const updatedIds = Array.from(new Set([...(g.nodeIds || []), ...allNewNodeIds]));
        const b = g.bounds;
        return { ...g, nodeIds: updatedIds, bounds: b } as NodeGroup;
      });
    } catch { }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEpisodeWorkflow, sceneParam, shotParam, episode, project, nodeGroups, setNodes, workflowLoaded, initialAssets]);

  // 编组框已经在 ReactFlow 内部，会自动跟随视口变化，不需要强制更新

  // 设置页面标题
  useEffect(() => {
    if (project) {
      if (isEpisodeWorkflow && episode) {
        const base = `${project.name} - ${episode.name || `第${episode.episodeNumber}集`}`;
        const suffix = sceneParam && shotParam ? `第${sceneParam}幕第${shotParam}镜` : '';
        setTitle(isShotWorkflow ? base : `${base} ${suffix}`.trim());
      } else {
        setTitle(project.name);
      }
    }

    // 清理函数：组件卸载时清空标题
    return () => setTitle('');
  }, [project, episode, isEpisodeWorkflow, isShotWorkflow, sceneParam, shotParam, setTitle]);

  // 监听节点和边的变化，自动保存
  useEffect(() => {
    // 只读模式下不自动保存
    if (!workflowId || loading || isReadOnlyRef.current) return;
    
    // 正在接收远程更新时不触发保存（避免保存协作者的状态）
    if (isReceivingRemoteUpdateRef.current) return;

    // 清除之前的定时器
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // 设置新的定时器，2秒后保存（防抖）
    saveTimeoutRef.current = setTimeout(() => {
      // 再次检查，确保保存时不是在接收远程更新
      if (isReceivingRemoteUpdateRef.current) return;
      autoSave();
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [nodes, edges, nodeGroups]);

  const loadWorkflow = async () => {
    try {
      let response;
      
      // 直接访问工作流（共享的工作流）
      if (isDirectWorkflowAccess && directWorkflowId) {
        response = await apiClient.workflows.getById(directWorkflowId);
      } else if (isShotWorkflow) {
        response = await apiClient.workflows.getOrCreateByShot(projectId!, episodeId!, sceneParam!, shotParam!);
      } else if (isEpisodeWorkflow) {
        response = await apiClient.workflows.getOrCreateByEpisode(projectId!, episodeId!);
      } else {
        // 确保 id 存在，否则不发起请求
        if (!id) {
          console.error('[loadWorkflow] 项目ID未定义');
          return;
        }
        response = await apiClient.workflows.getOrCreateByProject(id);
      }
      
      const workflow = response.data;
      
      // 检查是否为协作者（只读模式）
      // 只读条件：canEdit 明确为 false（无编辑权限的协作者）或 URL 参数 readonly=true（管理员查看模式）
      // 有编辑权限的协作者可以操作自己创建的节点
      const shouldBeReadOnly = workflow.canEdit === false || forceReadOnly;
      
      console.log('[Workflow] 权限检查:', { 
        canEdit: workflow.canEdit, 
        isOwner: workflow.isOwner, 
        shouldBeReadOnly,
        currentUserId: workflow.currentUserId,
      });
      
      if (shouldBeReadOnly) {
        console.log('[Workflow] 设置只读模式');
        setIsReadOnly(true);
        isReadOnlyRef.current = true;
        if (workflow.shareInfo?.owner) {
          setWorkflowOwner(workflow.shareInfo.owner);
          // 同时将所有者信息添加到用户缓存（用于节点头像显示）
          if (workflow.shareInfo.owner.id) {
            setWorkflowUsers([{
              id: workflow.shareInfo.owner.id,
              nickname: workflow.shareInfo.owner.nickname,
              avatar: workflow.shareInfo.owner.avatar,
            }]);
          }
        }
      } else {
        // 确保重置只读状态（从只读工作流切换到可编辑工作流时）
        setIsReadOnly(false);
        isReadOnlyRef.current = false;
        // 有编辑权限的协作者也显示工作流所有者信息
        if (!workflow.isOwner && workflow.shareInfo?.owner) {
          setWorkflowOwner(workflow.shareInfo.owner);
          // 同时将所有者信息添加到用户缓存（用于节点头像显示）
          if (workflow.shareInfo.owner.id) {
            setWorkflowUsers([{
              id: workflow.shareInfo.owner.id,
              nickname: workflow.shareInfo.owner.nickname,
              avatar: workflow.shareInfo.owner.avatar,
            }]);
          }
        } else {
          setWorkflowOwner(null);
        }
      }
      
      // 存储当前用户信息（用于判断节点所有权）
      if (workflow.currentUserId) {
        setCurrentUserId(workflow.currentUserId);
        currentUserIdRef.current = workflow.currentUserId;
        // 将当前用户信息添加到缓存（用于显示自己创建的节点头像）
        if (currentUser) {
          setWorkflowUsers([{
            id: currentUser.id,
            nickname: currentUser.nickname || undefined,
            avatar: currentUser.avatar || undefined,
          }]);
        }
      }
      // 是否是工作流所有者：只有 isOwner 明确为 true 时才是所有者
      // 协作者的 isOwner 为 false，即使有编辑权限也不是所有者
      const hasOwnerPermission = workflow.isOwner === true;
      setIsWorkflowOwner(hasOwnerPermission);
      
      console.log('[Workflow] 所有者权限:', { 
        isOwner: workflow.isOwner, 
        hasOwnerPermission,
        currentUserId: workflow.currentUserId,
        localUserId: currentUser?.id,
      });
      
      // 检测是否是共享工作流（需要自动刷新）
      // 条件：直接访问模式 或 有协作者的工作流
      const isShared = isDirectWorkflowAccess || workflow.hasCollaborators === true;
      setIsSharedWorkflow(isShared);
      setActualWorkflowId(workflow.id); // state 版本，触发 WebSocket 重新连接
      actualWorkflowIdRef.current = workflow.id; // ref 版本，用于回调中
      
      if (isShared) {
        console.log('[Workflow] 共享工作流，将启用 WebSocket 同步，workflowId:', workflow.id);
      }
      
      // 对于直接访问的工作流，创建一个虚拟项目对象
      if (isDirectWorkflowAccess) {
        setProject({
          id: workflow.projectId || directWorkflowId,
          name: workflow.name || '共享工作流',
          description: workflow.description,
          type: 'QUICK',
          status: 'DRAFT',
        });
      }
      
      // 移除从剧集工作流继承数据的逻辑，让每个镜头工作流完全独立
      // 每个镜头只会有自己的分镜设计和提示词节点

      // 加载保存的节点、边和编组
      if (workflow.data) {
        const { nodes: savedNodes, edges: savedEdges, nodeGroups: savedNodeGroups } = workflow.data as any;

        

        // 先加载编组数据
        if (savedNodeGroups && savedNodeGroups.length > 0) {
          setNodeGroups(savedNodeGroups);
          nodeGroupsRef.current = savedNodeGroups; // 更新 ref
          
        } else {
          
        }

        if (savedNodes && savedNodes.length > 0) {
          // 验证videoPreview节点的addedToStoryboard状态
          let validatedNodes = savedNodes;
          if (isShotWorkflow && episode?.scriptJson?.acts) {
            try {
              const acts = episode.scriptJson.acts;
              const currentAct = acts.find((a: any) => Number(a.actIndex) === Number(sceneParam));
              const currentShot = currentAct?.shots?.find((s: any) => Number(s.shotIndex) === Number(shotParam));
              
              // 收集分镜脚本中所有视频的nodeId
              const videoNodeIdsInScript = new Set<string>();
              if (currentShot) {
                // 从mediaList收集
                if (Array.isArray(currentShot.mediaList)) {
                  currentShot.mediaList.forEach((m: any) => {
                    if (m.nodeId) videoNodeIdsInScript.add(m.nodeId);
                  });
                }
                // 从单个media收集
                if (currentShot.media?.nodeId) {
                  videoNodeIdsInScript.add((currentShot.media as any).nodeId);
                }
              }
              
              // 验证每个videoPreview节点
              validatedNodes = savedNodes.map((node: Node) => {
                if (node.type === 'videoPreview' && node.data?.addedToStoryboard) {
                  // 检查该节点是否真的在分镜脚本中
                  const isReallyInScript = videoNodeIdsInScript.has(node.id);
                  if (!isReallyInScript) {
                    return {
                      ...node,
                      data: {
                        ...node.data,
                        addedToStoryboard: false
                      }
                    };
                  }
                }
                return node;
              });
            } catch (error) {
              console.error('验证视频节点状态失败:', error);
            }
          }

          // 从分镜脚本读取提示词
          let promptFromScript: string | undefined;
          if (isShotWorkflow && episode?.scriptJson?.acts) {
            try {
              const acts = episode.scriptJson.acts;
              const currentAct = acts.find((a: any) => Number(a.actIndex) === Number(sceneParam));
              const currentShot = currentAct?.shots?.find((s: any) => Number(s.shotIndex) === Number(shotParam));
              promptFromScript = currentShot?.['提示词'];
            } catch (error) {
              console.error('读取分镜脚本提示词失败:', error);
            }
          }

          // 获取非隐藏编组内的节点ID（hidden: true 的编组是分镜工作流的默认编组，不限制）
          const nonHiddenGroupedNodeIds = new Set(
            (savedNodeGroups || []).filter((g: NodeGroup) => !g.hidden).flatMap((g: NodeGroup) => g.nodeIds || [])
          );

          // 为每个节点添加模型数据、上下文信息，并根据编组状态设置属性
          const nodesWithModels = validatedNodes.map((node: Node) => {
            // 查找节点所在的编组
            const nodeGroup = savedNodeGroups
              ? savedNodeGroups.find((g: NodeGroup) => g.nodeIds.includes(node.id))
              : null;

            // 优先使用当前加载的 aiModels，如果还没加载则使用节点保存的 models
            // 如果两者都没有则使用空数组
            const modelsData = aiModels.length > 0 ? aiModels : (node.data.models || []);

            // 如果是Agent节点，从分镜脚本读取提示词作为输出
            const nodeData = node.type === 'agent' && promptFromScript
              ? { ...node.data, output: promptFromScript, lastOutput: promptFromScript }
              : node.data;

            return {
              ...node,
              data: {
                ...nodeData,
                models: modelsData,
                onOpenAssetPanel: node.type === 'assetSelector' ? (node.data.onOpenAssetPanel || handleOpenAssetPanelForNode) : node.data.onOpenAssetPanel,
                // 添加上下文信息用于资产自动命名
                workflowContext: {
                  project,
                  episode,
                  nodeGroup,
                  nodeGroups: savedNodeGroups || [],
                },
              },
              // 非隐藏编组内的节点：可拖动（拖动整个编组）、不可删除、不可连接
              // hidden: true 的编组是分镜工作流的默认编组，不限制
              draggable: node.draggable !== false,
              connectable: nonHiddenGroupedNodeIds.has(node.id) ? false : node.connectable !== false,
              deletable: nonHiddenGroupedNodeIds.has(node.id) ? false : node.deletable !== false,
            };
          });
          
          setNodes(nodesWithModels);
        }

        if (savedEdges && savedEdges.length > 0) {
          // 确保所有边都使用 default 类型和统一样式
          // 同时过滤掉无效的边（target 不存在或 targetHandle 无效）
          const validNodeIds = new Set(savedNodes.map((n: Node) => n.id));
          const savedTypeById = new Map<string, string>(savedNodes.map((n: any) => [n.id, n.type]));
          const edgesWithStyle = savedEdges
            .filter((edge: any) => {
              // 检查 source 和 target 节点是否存在
              if (!validNodeIds.has(edge.source) || !validNodeIds.has(edge.target)) return false;
              // 兼容旧存档：禁止 Midjourney 的 text-input 接受非智能体来源
              const targetType = savedTypeById.get(edge.target);
              const sourceType = savedTypeById.get(edge.source);
              if (targetType === 'midjourney' && edge.targetHandle === 'text-input' && sourceType !== 'agent') return false;
              return true;
            })
            .map((edge: any) => ({
              ...edge,
              type: 'aurora',
              animated: true,
              style: { stroke: 'currentColor', strokeWidth: 2 },
              // 如果 targetHandle 为 undefined，尝试设置默认值
              targetHandle: edge.targetHandle || undefined,
            }));
          setEdges(edgesWithStyle);
        }
      }
    } catch (error) {
      
    }
  };

  // 当模型加载完成后，更新所有节点的模型数据（保留原有的 draggable 和 deletable 状态）
  useEffect(() => {
    if (aiModels.length > 0 && nodes.length > 0) {
      
      setNodes((nds) =>
        nds.map((node) => {
          // 确保所有节点都有最新的模型列表
          return {
            ...node,
            data: {
              ...node.data,
              models: aiModels, // 强制更新为最新的模型列表
            },
            // 显式保留这些属性（避免被覆盖）
            draggable: node.draggable !== undefined ? node.draggable : true,
            deletable: node.deletable !== undefined ? node.deletable : true,
          };
        })
      );
    }
  }, [aiModels, nodes.length]);

  // 当项目/剧集信息加载完成后，更新所有节点的上下文
  useEffect(() => {
    if (!project && !episode) return;
    
    // 无论是否有节点，只要 project/episode 更新了，就应该准备更新 context
    if (nodes.length === 0) return;

    // 检查是否需要更新（避免不必要的重新渲染）
    const needsUpdate = nodes.some(node => {
      const ctx = node.data.workflowContext;
      // 使用 ID 比较而不是对象引用比较，因为对象引用可能会变
      const projectChanged = ctx?.project?.id !== project?.id;
      const episodeChanged = ctx?.episode?.id !== episode?.id;
      const nodeGroupsChanged = ctx?.nodeGroups !== nodeGroupsRef.current;
      return !ctx || projectChanged || episodeChanged || nodeGroupsChanged;
    });

    if (needsUpdate) {

      const currentShotGroup = (sceneParam && shotParam)
        ? (nodeGroupsRef.current.find((g) => g.scene === sceneParam && g.shot === shotParam) || null)
        : null;
      
      setNodes((nds) =>
        nds.map((node) => {
          // 查找节点所在的编组（使用 ref 确保获取最新值）
          const byMembership = nodeGroupsRef.current.find((g) => g.nodeIds.includes(node.id)) || null;
          const nodeGroup = currentShotGroup || byMembership;

          return {
            ...node,
            data: {
              ...node.data,
              workflowContext: {
                project,
                episode,
                nodeGroup,
                nodeGroups: nodeGroupsRef.current,
              },
            },
          };
        })
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, episode, sceneParam, shotParam, nodes.length, nodeGroups]);

  // 保存Agent节点输出到分镜脚本
  const syncWorkflowToStoryboard = async (nodes: any[], sceneNumber: number, shotNumber: number) => {
    if (!projectId || !episodeId) return;
    
    try {
      // 找到Agent节点的输出
      const agentNode = nodes.find(node => node.type === 'agent');
      if (!agentNode) return;
      
      const promptText = agentNode.data?.output || '';
      
      // 获取当前剧集的分镜脚本
      const episodeData = await apiClient.episodes.getById(projectId, episodeId);
      const scriptJson = episodeData.scriptJson;
      
      if (!scriptJson || !scriptJson.acts) return;
      
      // 更新对应幕和镜的提示词
      const updatedActs = scriptJson.acts.map((act: any) => {
        if (act.actIndex === sceneNumber) {
          return {
            ...act,
            shots: act.shots?.map((shot: any) => {
              if (shot.shotIndex === shotNumber && shot['提示词'] !== promptText) {
                return { ...shot, '提示词': promptText };
              }
              return shot;
            })
          };
        }
        return act;
      });
      
      // 保存回数据库
      await apiClient.episodes.update(projectId, episodeId, { 
        scriptJson: { acts: updatedActs } 
      });
    } catch (error) {
      console.error('保存提示词到分镜脚本失败:', error);
    }
  };

  const saveWorkflow = async () => {
    // 只读模式（协作者）不保存 - 使用 ref 确保在回调中获取最新值
    if (isReadOnly || isReadOnlyRef.current) return;
    
    // 正在接收远程更新时不保存（避免保存协作者的状态覆盖自己的编辑）
    if (isReceivingRemoteUpdateRef.current) {
      console.log('[saveWorkflow] 跳过保存：正在接收远程更新');
      return;
    }
    
    // 防止保存空数据覆盖已有工作流
    if (nodesRef.current.length === 0 && edgesRef.current.length === 0) {
      console.warn('[saveWorkflow] 跳过保存：节点和边都为空');
      return;
    }
    
    try {
      // 优化：清理节点数据，移除不必要的重复数据
      const optimizedNodes = nodesRef.current.map(node => {
        const { data, ...restNode } = node;
        // 移除运行时数据和内部权限字段
        const { workflowContext, _canEdit, _currentUserId, ...restData } = data || {};

        // 只保存必要的数据，去除：
        // 1. workflowContext（运行时数据，加载时重建）
        // 2. _canEdit, _currentUserId（权限检查用的内部字段）
        // 注意：保留 models，因为节点可能需要它们
        return {
          ...restNode,
          data: restData,
        };
      });

      // 保存边数据（保留完整信息以避免丢失）
      const optimizedEdges = edgesRef.current.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        type: edge.type,
        // style 会在加载时重建，不需要保存
      }));

      // 使用 ref 获取最新的路由参数值（避免闭包捕获旧值）
      const currentProjectId = projectIdRef.current;
      const currentEpisodeId = episodeIdRef.current;
      const currentSceneParam = sceneParamRef.current;
      const currentShotParam = shotParamRef.current;
      const currentId = idRef.current;
      const currentDirectWorkflowId = directWorkflowIdRef.current;
      const currentIsShotWorkflow = isShotWorkflowRef.current;
      const currentIsEpisodeWorkflow = isEpisodeWorkflowRef.current;
      const currentIsDirectWorkflowAccess = isDirectWorkflowAccessRef.current;

      if (currentIsShotWorkflow && currentProjectId && currentEpisodeId && currentSceneParam && currentShotParam) {
        await apiClient.workflows.saveShot(currentProjectId, currentEpisodeId, currentSceneParam, currentShotParam, {
          nodes: optimizedNodes,
          edges: optimizedEdges,
          nodeGroups: nodeGroupsRef.current,
          viewport: { x: 0, y: 0, zoom: 1 },
        });
        
        // 同步Agent节点的输出到剧集详情页的分镜脚本
        try {
          await syncWorkflowToStoryboard(nodesRef.current, currentSceneParam, currentShotParam);
        } catch (error) {
          console.error('同步到分镜脚本失败:', error);
        }
      } else if (currentIsEpisodeWorkflow && currentProjectId && currentEpisodeId) {
        await apiClient.workflows.saveEpisode(currentProjectId, currentEpisodeId, {
          nodes: optimizedNodes,
          edges: optimizedEdges,
          nodeGroups: nodeGroupsRef.current,
          viewport: { x: 0, y: 0, zoom: 1 },
        });
      } else if (currentIsDirectWorkflowAccess && currentDirectWorkflowId) {
        // 直接访问模式（所有者）保存
        await apiClient.workflows.update(currentDirectWorkflowId, {
          data: {
            nodes: optimizedNodes,
            edges: optimizedEdges,
            nodeGroups: nodeGroupsRef.current,
            viewport: { x: 0, y: 0, zoom: 1 },
          }
        });
      } else {
        // 保存项目工作流
        if (currentId) {
          await apiClient.workflows.save(currentId, {
            nodes: optimizedNodes,
            edges: optimizedEdges,
            nodeGroups: nodeGroupsRef.current,
            viewport: { x: 0, y: 0, zoom: 1 },
          });
        }
      }
      
    } catch (error) {
      
    }
  };

  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    autoSaveTimeoutRef.current = setTimeout(() => {
      // 只有当工作流完全加载后才执行自动保存
      // 注意：这里直接调用 saveWorkflow，因为它是在组件内部定义的闭包，
      // 可以访问最新的 state (通过 ref 或 setState action)
      // 但是由于 saveWorkflow 不是 useCallback，且依赖 state，
      // 在 setTimeout 执行时可能会使用旧的闭包。
      // 不过我们在 saveWorkflow 中主要使用 ref (nodesRef, edgesRef, nodeGroupsRef)
      // 所以应该没问题。
      saveWorkflow();
    }, 2000);
  }, []); // 依赖项为空，因为 saveWorkflow 内部使用 ref

  // 同步工作流上下文到全局变量
  useEffect(() => {
    if (project || episode) {
      // 在镜头工作流中，只保留当前镜头的编组
      let contextNodeGroups = nodeGroupsRef.current;
      if (isShotWorkflow && sceneParam && shotParam) {
        contextNodeGroups = nodeGroupsRef.current.filter(
          g => g.scene === sceneParam && g.shot === shotParam
        );
      }
      
      (window as any).__workflowContext = {
        project,
        episode,
        nodeGroups: contextNodeGroups,
      };
    }
  }, [project, episode, nodeGroups, isShotWorkflow, sceneParam, shotParam]);

  const loadProject = async () => {
    try {
      // 直接访问工作流时，项目信息在loadWorkflow中设置
      if (isDirectWorkflowAccess) {
        // 存储到全局变量
        (window as any).__workflowContext = {
          project: null,
          episode: null,
          nodeGroups: nodeGroupsRef.current,
        };
        return;
      }
      
      if (isEpisodeWorkflow) {
        // 加载剧集信息和所属项目信息
        const [episodeResponse, projectResponse] = await Promise.all([
          apiClient.episodes.getById(projectId!, episodeId!),
          apiClient.projects.getById(projectId!)
        ]);
        setEpisode(episodeResponse.data);
        setProject(projectResponse.data);
        
        // 在镜头工作流中，只保留当前镜头的编组
        let contextNodeGroups = nodeGroupsRef.current;
        if (isShotWorkflow && sceneParam && shotParam) {
          contextNodeGroups = nodeGroupsRef.current.filter(
            g => g.scene === sceneParam && g.shot === shotParam
          );
        }
        
        // 存储到全局变量，供节点直接访问
        (window as any).__workflowContext = {
          project: projectResponse.data,
          episode: episodeResponse.data,
          nodeGroups: contextNodeGroups,
        };
      } else {
        // 加载项目信息
        const response = await apiClient.projects.getById(id!);
        setProject(response.data);
        
        // 在镜头工作流中，只保留当前镜头的编组
        let contextNodeGroups = nodeGroupsRef.current;
        if (isShotWorkflow && sceneParam && shotParam) {
          contextNodeGroups = nodeGroupsRef.current.filter(
            g => g.scene === sceneParam && g.shot === shotParam
          );
        }
        
        // 存储到全局变量
        (window as any).__workflowContext = {
          project: response.data,
          episode: null,
          nodeGroups: contextNodeGroups,
        };
      }
    } catch (error: any) {
      console.error('❌ [加载项目] 加载失败:', error);
      toast.error(isEpisodeWorkflow ? '加载剧集失败' : '加载项目失败');
      navigate('/quick');
    } finally {
      setLoading(false);
    }
  };

  const loadAIModels = async () => {
    try {
      const response = await apiClient.tenant.get('/ai/models', { params: { isActive: 'true' } });
      // 后端返回 { success: true, data: [...] } 格式
      const models = response?.data || response || [];
      console.log('[AI Models] 加载模型:', models.length, '个');
      setAiModels(models);
    } catch (error) {
      console.error('Failed to load AI models:', error);
    }
  };

  // 同步 aiModels 到 ref
  useEffect(() => {
    aiModelsRef.current = aiModels;
  }, [aiModels]);

  // 当模型列表更新时，同步写入到节点的 data.models，确保下拉可用模型实时更新
  useEffect(() => {
    setNodes((nds) => nds.map((node) => {
      const t = String(node.type || '');
      // 需要模型列表的节点类型：aiImage, aiVideo*, audio*, voiceClone
      if (t !== 'aiImage' && !t.startsWith('aiVideo') && t !== 'audioVoice' && t !== 'voiceClone' && t !== 'audioSynthesize' && t !== 'audioDesign') return node;
      return {
        ...node,
        data: {
          ...node.data,
          models: aiModels,
        },
      } as any;
    }));
  }, [aiModels, setNodes]);

  const loadAgents = async () => {
    try {
      const data = await apiClient.agents.getAll();
      const activeAgents = data.filter((a: any) => a.isActive);
      setAgents(activeAgents);
    } catch (error) {
      
    }
  };

  // 当模型或智能体列表加载后，统一为 agent 节点写入 acceptedInputs（避免节点未初始化时连线失败）
  useEffect(() => {
    setNodes((nds) => nds.map((node) => {
      if (node.type !== 'agent') return node;
      const agentId = node.data?.config?.agentId;
      const agentItem = agents.find((a: any) => a.id === agentId);
      const modelId = agentItem?.aiModelId;
      const modelItem = aiModels.find((m: any) => m.id === modelId);
      let accepted: string[] | undefined = modelItem?.config?.acceptedInputs;
      if ((!accepted || accepted.length === 0) && modelItem) {
        const provider = (modelItem.provider || '').toLowerCase();
        const name = (modelItem.name || '').toLowerCase();
        if (provider.includes('google') || name.includes('gemini')) {
          accepted = ['TEXT', 'IMAGE', 'DOCUMENT'];
        }
      }
      if (Array.isArray(accepted) && accepted.length > 0) {
        const current = node.data?.config?.acceptedInputs;
        const normalize = (arr: string[]) => arr.map((s) => s.toUpperCase()).sort().join(',');
        if (!current || normalize(current) !== normalize(accepted)) {
          return {
            ...node,
            data: {
              ...node.data,
              config: {
                ...node.data.config,
                acceptedInputs: accepted,
              },
            },
          } as any;
        }
      }
      return node;
    }));
  }, [agents, aiModels, setNodes]);

  const onConnect = useCallback(
    (params: Connection) => {
      connectionCompletedRef.current = false;

      // 检查源节点或目标节点是否在非隐藏编组内（非隐藏编组内节点不允许新建连接）
      // hidden: true 的编组是分镜工作流的默认编组，不限制
      const isSourceInGroup = nodeGroupsRef.current.some(g => !g.hidden && g.nodeIds?.includes(params.source || ''));
      const isTargetInGroup = nodeGroupsRef.current.some(g => !g.hidden && g.nodeIds?.includes(params.target || ''));
      if (isSourceInGroup || isTargetInGroup) {
        toast.error('编组内的节点不允许新建连接');
        connectionCompletedRef.current = false;
        return;
      }

      // 验证连接是否符合模型的输入类型要求
      const sourceNode = nodes.find(n => n.id === params.source);
      const targetNode = nodes.find(n => n.id === params.target);

      if (sourceNode && targetNode) {
        // 获取源节点的输出类型
        const getNodeOutputType = (node: any): string | null => {
          const nodeType = node.type as string; // 使用真实的节点类型标识
          const nodeData = node.data;

          if (nodeType === 'upload' && Array.isArray(nodeData.config?.uploadedFiles) && nodeData.config.uploadedFiles.length > 0) {
            const files = nodeData.config.uploadedFiles as any[];
            const hasVideo = files.some((f) => {
              const t = (f?.type || '').toUpperCase();
              const m = (f?.mimeType || '').toLowerCase();
              return t === 'VIDEO' || m.startsWith('video/');
            });
            const hasImage = files.some((f) => {
              const t = (f?.type || '').toUpperCase();
              const m = (f?.mimeType || '').toLowerCase();
              return t === 'IMAGE' || m.startsWith('image/');
            });
            const hasAudio = files.some((f) => {
              const t = (f?.type || '').toUpperCase();
              const m = (f?.mimeType || '').toLowerCase();
              return t === 'AUDIO' || m.startsWith('audio/');
            });
            if ((targetNode?.type as string) === 'aiVideo_swap') {
              if (hasVideo) return 'VIDEO';
              if (hasImage) return 'IMAGE';
              if (hasAudio) return 'AUDIO';
              return null;
            }
            if (hasImage) return 'IMAGE';
            if (hasVideo) return 'VIDEO';
            if (hasAudio) return 'AUDIO';
            return null;
          }

          // 资产选择器节点
          if (nodeType === 'assetSelector') {
            if (nodeData.config?.subjects) {
              return 'IMAGE'; // 角色组以图片组形式输出
            }
            if (nodeData.config?.selectedAsset) {
              const asset = nodeData.config.selectedAsset;
              const t = (asset.type || '').toUpperCase();
              const m = (asset.mimeType || '').toLowerCase();
              if (t === 'IMAGE' || m.startsWith('image/')) return 'IMAGE';
              if (t === 'VIDEO' || m.startsWith('video/')) return 'VIDEO';
              if (t === 'AUDIO' || m.startsWith('audio/')) return 'AUDIO';
              return t || null;
            }
          }

          // AI图片节点
          if (nodeType === 'aiImage' || nodeType === 'imagePreview') {
            return 'IMAGE';
          }

          // AI视频节点
          if ((nodeType || '').startsWith('aiVideo') || nodeType === 'videoPreview') {
            return 'VIDEO';
          }

          // Agent节点
          if (nodeType === 'agent') {
            return 'TEXT';
          }

          return null;
        };

        const sourceOutputType = getNodeOutputType(sourceNode);
        let targetAcceptedInputs = targetNode.data.config?.acceptedInputs as string[] | undefined;

        // 文生视频节点仅接受文本输入，禁止图片等其他类型
        if ((targetNode.type as string) === 'aiVideo_t2v' && sourceOutputType && sourceOutputType !== 'TEXT') {
          const typeLabels: Record<string, string> = { TEXT: '文本', IMAGE: '图片', VIDEO: '视频', AUDIO: '音乐', DOCUMENT: '文档' };
          toast.error(`文生视频节点不接受${typeLabels[sourceOutputType] || sourceOutputType}输入`);
          connectionCompletedRef.current = false;
          return;
        }

        // 智能体节点的后备获取：如果节点上未设置 acceptedInputs，则从已加载的 agents/aiModels 推断
        if ((!targetAcceptedInputs || targetAcceptedInputs.length === 0) && targetNode.data.type === 'agent') {
          const agentId = targetNode.data.config?.agentId;
          const agentItem = agents.find((a: any) => a.id === agentId);
          const modelId = agentItem?.aiModelId;
          const modelItem = aiModels.find((m: any) => m.id === modelId);
          const cfgAccepted = modelItem?.config?.acceptedInputs;
          if (Array.isArray(cfgAccepted) && cfgAccepted.length > 0) {
            targetAcceptedInputs = cfgAccepted;
          } else {
            // 常见模型后备：Gemini 允许多模态
            const provider = modelItem?.provider?.toLowerCase() || '';
            const name = (modelItem?.name || '').toLowerCase();
            if (provider.includes('google') || name.includes('gemini')) {
              targetAcceptedInputs = ['TEXT', 'IMAGE', 'DOCUMENT'];
            }
          }
        }

        // 如果目标节点配置了acceptedInputs，需要验证
        // 智能体节点：连接不拦截，统一允许，执行阶段按模型能力处理
        if (targetNode.type === 'agent') {
          // 直接放行
        } else if (!(targetNode.type as string).startsWith('aiVideo') && targetAcceptedInputs && targetAcceptedInputs.length > 0 && sourceOutputType) {
          const acceptedUpper = targetAcceptedInputs.map((t) => (typeof t === 'string' ? t.toUpperCase() : t));
          const sourceUpper = (typeof sourceOutputType === 'string' ? sourceOutputType.toUpperCase() : sourceOutputType);
          if (!acceptedUpper.includes(sourceUpper)) {
            const typeLabels: Record<string, string> = {
              TEXT: '文本',
              IMAGE: '图片',
              VIDEO: '视频',
              AUDIO: '音乐',
              DOCUMENT: '文档',
            };
            toast.error(`该节点不接受${typeLabels[sourceUpper] || sourceUpper}类型的输入（允许：${acceptedUpper.map(t => typeLabels[t] || t).join('、')}）`);
            connectionCompletedRef.current = false;
            return;
          }
        }

        // 视频编辑节点：仅允许1个视频+1张图片，其他情况直接不允许连线
        if ((targetNode.type as string) === 'aiVideo_swap') {
          const edgesToTarget = edges.filter((e) => e.target === targetNode.id);
          const countVideo = edgesToTarget.filter((e) => {
            const src = nodes.find(n => n.id === e.source);
            const tp = getNodeOutputType(src);
            return tp === 'VIDEO';
          }).length;
          const countImage = edgesToTarget.filter((e) => {
            const src = nodes.find(n => n.id === e.source);
            const tp = getNodeOutputType(src);
            return tp === 'IMAGE';
          }).length;
          const nextVideo = countVideo + (sourceOutputType === 'VIDEO' ? 1 : 0);
          const nextImage = countImage + (sourceOutputType === 'IMAGE' ? 1 : 0);
          if (nextVideo > 1 || nextImage > 1 || (sourceOutputType !== 'VIDEO' && sourceOutputType !== 'IMAGE')) {
            toast.error('视频换人节点仅接受1个视频和1张图片的输入');
            connectionCompletedRef.current = false;
            return;
          }
        }

        if ((targetNode.type as string) === 'aiVideo_lipsync') {
          const edgesToTarget = edges.filter((e) => e.target === targetNode.id);
          const countVideo = edgesToTarget.filter((e) => { const src = nodes.find(n => n.id === e.source); const tp = getNodeOutputType(src); return tp === 'VIDEO'; }).length;
          const countAudio = edgesToTarget.filter((e) => { const src = nodes.find(n => n.id === e.source); const tp = getNodeOutputType(src); return tp === 'AUDIO'; }).length;
          const nextVideo = countVideo + (sourceOutputType === 'VIDEO' ? 1 : 0);
          const nextAudio = countAudio + (sourceOutputType === 'AUDIO' ? 1 : 0);
          const isAllowedType = sourceOutputType === 'VIDEO' || sourceOutputType === 'AUDIO' || sourceOutputType === 'IMAGE';
          if (nextVideo > 1 || nextAudio > 1 || !isAllowedType) {
            toast.error('对口型节点需且仅接受1个视频与1个音频（图片可选）');
            connectionCompletedRef.current = false;
            return;
          }
        }

        // 简化且方向一致的图片数量限制：在连线阶段按视频节点当前生成方法限制图片张数
        if ((targetNode.type as string).startsWith('aiVideo') && (targetNode.type as string) !== 'aiVideo_swap' && sourceOutputType === 'IMAGE') {
          const normalize = (t?: string) => {
            const s = (t || '').toLowerCase().replace(/[_\-\s]+/g, ' ');
            if (!s) return '';
            if (s.includes('文生') || s.includes('text to video') || s.includes('t2v')) return '文生视频';
            if (s.includes('首尾') || s.includes('first last') || s.includes('two frame') || s.includes('frame pair')) return '首尾帧';
            if (s.includes('首帧') || s.includes('first frame') || s.includes('start frame') || s.includes('initial frame') || s.includes('keyframe')) return '首帧';
            if (s.includes('尾帧') || s.includes('last frame') || s.includes('end frame') || s.includes('final frame')) return '尾帧';
            if (s.includes('主体参考') || s.includes('subject reference')) return '参考图';
            if (s.includes('参考') || s.includes('reference image') || s.includes('image reference') || s.includes('ref image')) return '参考图';
            return t || '';
          };
          const gt = normalize(targetNode.data?.config?.generationType);
          if ((targetNode.type as string) === 'aiVideo_t2v' || gt === '文生视频') {
            toast.error('文生视频节点不接受图片输入');
            connectionCompletedRef.current = false;
            return;
          }

          // 首尾帧不接受角色组输入
          if ((gt === '首帧' || gt === '尾帧') && sourceNode.type === 'assetSelector') {
            const conf = sourceNode.data?.config || {};
            if (conf.subjects && conf.subjects.length > 0) {
              const count = (conf.subjects[0].images || []).length;
              if (count > 1) {
                toast.error('首帧/尾帧仅允许单图角色或单张图片');
                connectionCompletedRef.current = false;
                return;
              }
            }
          }
          // 首尾帧禁止资产选择器角色组输入
          if (gt === '首尾帧' && sourceNode.type === 'assetSelector') {
            const conf = sourceNode.data?.config || {};
            if (conf.subjects && conf.subjects.length > 0) {
              toast.error('首尾帧不接受角色组输入，请连接两张单图');
              connectionCompletedRef.current = false;
              return;
            }
          }

          // 连接阶段不再进行模式推断或图片来源检测，由生成前校验处理

          // 连接阶段不统计图片数量，交由生成前校验




        }
        // 风格转换节点：仅接受1个视频输入；禁止非视频类型连接
        if ((targetNode.type as string) === 'aiVideo_style') {
          const edgesToTarget = edges.filter((e) => e.target === targetNode.id);
          const countVideo = edgesToTarget.filter((e) => {
            const src = nodes.find(n => n.id === e.source);
            const tp = getNodeOutputType(src);
            return tp === 'VIDEO';
          }).length;
          const nextVideo = countVideo + (sourceOutputType === 'VIDEO' ? 1 : 0);
          if (sourceOutputType !== 'VIDEO') {
            toast.error('风格转绘节点仅接受视频输入');
            connectionCompletedRef.current = false;
            return;
          }
          if (nextVideo > 1) {
            toast.error('风格转绘节点仅允许连接1个视频');
            connectionCompletedRef.current = false;
            return;
          }
        }
        if ((targetNode.type as string).startsWith('aiVideo') && sourceOutputType === 'TEXT') {
          const connectedEdges = edges.filter(e => e.target === targetNode.id);
          const existingAgentEdge = connectedEdges.find((e) => {
            const s = nodes.find(n => n.id === e.source);
            return s?.type === 'agent';
          });
          if (existingAgentEdge) {
            toast.error('视频节点仅允许一个智能体输入');
            connectionCompletedRef.current = false;
            return;
          }
        }

        // AI图片节点：限制一个智能体，图片数量与模型配置联动
        if ((targetNode.type as string) === 'aiImage') {
          if (sourceOutputType === 'TEXT') {
            const connectedEdges = edges.filter(e => e.target === targetNode.id);
            const hasAgent = connectedEdges.some((e) => {
              const s = nodes.find(n => n.id === e.source);
              return s?.type === 'agent';
            });
            if (hasAgent) {
              toast.error('图片节点仅允许一个智能体输入');
              connectionCompletedRef.current = false;
              return;
            }
          } else if (sourceOutputType === 'IMAGE') {
            const connectedEdges = edges.filter(e => e.target === targetNode.id);
            const existingImageCount = connectedEdges.reduce((acc, e) => {
              const s = nodes.find(n => n.id === e.source);
              const st = (s?.type || '') as string;
              if (st === 'upload') {
                const file = (s as any)?.data?.config?.uploadedFiles?.[0] || null;
                const tp = (file?.type || '').toUpperCase();
                const m = (file?.mimeType || '').toLowerCase();
                return acc + ((tp === 'IMAGE' || m.startsWith('image/')) ? 1 : 0);
              }
              if (st === 'assetSelector') {
                const conf = (s as any)?.data?.config || {};
                if (conf.selectedAsset) acc += (((conf.selectedAsset.type || '').toUpperCase() === 'IMAGE' || (conf.selectedAsset.mimeType || '').toLowerCase().startsWith('image/')) ? 1 : 0);
                if (Array.isArray(conf.subjects) && conf.subjects.length > 0) return acc + ((conf.subjects[0].images || []).length || 0);
                return acc;
              }
              if (st === 'aiImage') {
                const u = (s as any)?.data?.config?.generatedImageUrl;
                return acc + (u ? 1 : 0);
              }
              if (st === 'imagePreview') {
                const u = (s as any)?.data?.imageUrl;
                return acc + (u ? 1 : 0);
              }
              return acc;
            }, 0);
            // 预估此次新增的图片数量（资产选择器可能是多图）
            let addCount = 1;
            if (sourceNode.type === 'assetSelector') {
              const conf = (sourceNode as any)?.data?.config || {};
              if (conf.selectedAsset) {
                addCount = (((conf.selectedAsset.type || '').toUpperCase() === 'IMAGE' || (conf.selectedAsset.mimeType || '').toLowerCase().startsWith('image/')) ? 1 : 0);
              } else if (Array.isArray(conf.subjects) && conf.subjects.length > 0) {
                addCount = (conf.subjects[0].images || []).length || 0;
              }
            } else if (sourceNode.type === 'upload') {
              const file = (sourceNode as any)?.data?.config?.uploadedFiles?.[0] || null;
              const tp = (file?.type || '').toUpperCase();
              const m = (file?.mimeType || '').toLowerCase();
              addCount = ((tp === 'IMAGE' || m.startsWith('image/')) ? 1 : 0);
            } else if (sourceNode.type === 'aiImage') {
              const u = (sourceNode as any)?.data?.config?.generatedImageUrl;
              addCount = u ? 1 : 0;
            } else if (sourceNode.type === 'imagePreview') {
              const u = (sourceNode as any)?.data?.imageUrl;
              addCount = u ? 1 : 0;
            }
            const modelId = (targetNode as any)?.data?.config?.modelId;
            const modelItem = aiModels.find((m: any) => m.id === modelId);
            const cfg = modelItem?.config || {};
            const maxImages = cfg.maxReferenceImages || cfg.supportedReferenceImagesLimit || cfg.referenceImagesLimit || 10;
            if (existingImageCount + addCount > maxImages) {
              toast.error(`图片节点已达到图片上限（${maxImages}张）`);
              connectionCompletedRef.current = false;
              return;
            }
          }
        }
      }

      // 若目标是语音克隆节点且源为音频，直接把音频URL传递到目标节点
      try {
        const tgt = nodes.find(n => n.id === params.target);
        const src = nodes.find(n => n.id === params.source);
        const getAudioUrlFromSource = (node: any): string | null => {
          if (!node) return null;
          const t = String(node.type || '').toLowerCase();
          if (t === 'upload') {
            const f = (node.data?.config?.uploadedFiles || []).find((x: any) => {
              const tp = (x?.type || '').toUpperCase();
              const m = (x?.mimeType || '').toLowerCase();
              return tp === 'AUDIO' || m.startsWith('audio/');
            });
            return f?.url || null;
          }
          if (t === 'assetSelector') {
            const a = node.data?.config?.selectedAsset;
            const tp = (a?.type || '').toUpperCase();
            const m = (a?.mimeType || '').toLowerCase();
            if (tp === 'AUDIO' || m.startsWith('audio/')) return a?.url || null;
          }
          return null;
        };
        const nodeTypeTarget = String(tgt?.type || '');
        if (nodeTypeTarget === 'audioVoice') {
          const audioUrl = getAudioUrlFromSource(src);
          if (audioUrl) {
            setNodes((nds) => nds.map((n) => n.id === tgt!.id ? { ...n, data: { ...n.data, config: { ...(n.data as any).config, audioUrl } } } : n));
          }
        }
      } catch { }

      // 确保连接使用平滑曲线
      // 生成边的唯一ID
      const edgeId = `edge-${params.source}-${params.target}-${Date.now()}`;
      const edge: Edge = {
        id: edgeId,
        source: params.source!,
        target: params.target!,
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle,
        type: 'aurora',
        animated: true,
        style: { stroke: 'currentColor', strokeWidth: 2 },
      };
      // 若刚从文生视频自动切换到其他模式，延迟一次渲染后再加边，避免立即被节点内部副作用移除
      setTimeout(() => {
        setEdges((eds) => addEdge(edge, eds));
        // 广播边添加事件给其他协作者
        emitEdgeAdd(edge);
      }, 0);
      pendingConnectionRef.current = null;
      connectionCompletedRef.current = true;
    },
    [setEdges, nodes, agents, aiModels, edges, emitEdgeAdd]
  );

  // 双击连接线断开连接
  const onEdgeDoubleClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      // 检查边的源节点或目标节点是否在非隐藏编组内（非隐藏编组内节点的连接不允许断开）
      // hidden: true 的编组是分镜工作流的默认编组，不限制
      const isSourceInGroup = nodeGroupsRef.current.some(g => !g.hidden && g.nodeIds?.includes(edge.source));
      const isTargetInGroup = nodeGroupsRef.current.some(g => !g.hidden && g.nodeIds?.includes(edge.target));
      if (isSourceInGroup || isTargetInGroup) {
        toast.error('编组内的节点连接不允许断开');
        return;
      }
      
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      // 广播边删除事件给其他协作者
      emitEdgeDelete(edge.id);
      toast.success('已断开连接');
    },
    [setEdges, emitEdgeDelete]
  );

  const handleNodesDelete = useCallback((_deleted: Node[]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    try {
      const suppressedRaw = localStorage.getItem('suppressedPreviewTasks') || '[]';
      const suppressed: Array<{ sourceNodeId?: string; taskId?: string; messageId?: string }> = JSON.parse(suppressedRaw);
      const addItem = (item: { sourceNodeId?: string; taskId?: string; messageId?: string }) => {
        suppressed.push(item);
      };
      for (const n of Array.isArray(_deleted) ? _deleted : []) {
        if (n?.type === 'imagePreview') {
          const srcId = (n as any)?.data?.midjourneyData?.sourceNodeId;
          const tid = (n as any)?.data?.midjourneyData?.taskId;
          const mid = (n as any)?.data?.midjourneyData?.messageId;
          if (srcId || tid || mid) {
            addItem({ sourceNodeId: srcId, taskId: tid, messageId: mid });
          } else {
            const edge = edgesRef.current.find((e) => e.target === n.id);
            if (edge) {
              const srcNode = nodesRef.current.find((nn) => nn.id === edge.source) as any;
              const taskId = srcNode?.data?.config?.taskId;
              if (taskId) addItem({ taskId });
            }
          }
        } else if (n?.type === 'videoPreview') {
          const edge = edgesRef.current.find((e) => e.target === n.id);
          if (edge) {
            const srcNode = nodesRef.current.find((nn) => nn.id === edge.source) as any;
            const taskId = srcNode?.data?.config?.taskId;
            if (taskId) addItem({ taskId });
          }
        }
      }
      const trimmed = suppressed.slice(Math.max(0, suppressed.length - 500));
      localStorage.setItem('suppressedPreviewTasks', JSON.stringify(trimmed));
    } catch { }
    try {
      const tasks: Promise<any>[] = [];
      for (const n of Array.isArray(_deleted) ? _deleted : []) {
        const projectName = n?.data?.workflowContext?.project?.name;
        // 只有预览节点才移到回收站，手动上传的素材（upload节点）不移到回收站
        if (n?.type === 'imagePreview' && n?.data?.imageUrl) {
          tasks.push(apiClient.tenant.post('/assets/recycle/record', { url: n.data.imageUrl, type: 'IMAGE', projectName }));
        } else if (n?.type === 'videoPreview' && n?.data?.videoUrl) {
          tasks.push(apiClient.tenant.post('/assets/recycle/record', { url: n.data.videoUrl, type: 'VIDEO', projectName }));
        }
        // upload 节点和其他节点不记录到回收站
      }
      if (tasks.length > 0) {
        Promise.allSettled(tasks).then(() => { });
      }
    } catch { }
    const deletedCount = Array.isArray(_deleted) ? _deleted.length : 0;
    // 立即保存，避免用户刷新前未保存
    // 注意：必须在 setTimeout 之前捕获 prevLen，因为 useEffect 会在 setTimeout 执行前更新 lastNodesLengthRef
    const prevLen = lastNodesLengthRef.current;
    setTimeout(() => {
      const currentLen = nodesRef.current.length;
      const expectedLen = Math.max(prevLen - deletedCount, 0);
      if (currentLen !== expectedLen) {
        return;
      }
      // 立即保存，不使用 autoSave 的延时
      saveWorkflow();
    }, 100); // 减少到 100ms，确保节点状态已更新
  }, []);

  // 带权限检查的节点删除处理器
  const handleNodesDeleteWithPermission = useCallback((deleted: Node[]) => {
    // 首先过滤掉非隐藏编组内的节点（所有人都不能删除非隐藏编组内节点）
    // hidden: true 的编组是分镜工作流的默认编组，不限制
    const nonGroupedNodes = deleted.filter(node => {
      const isInGroup = nodeGroupsRef.current.some(g => !g.hidden && g.nodeIds?.includes(node.id));
      if (isInGroup) {
        toast.error('编组内的节点不允许删除');
        return false;
      }
      return true;
    });
    
    if (nonGroupedNodes.length === 0) return;
    
    // 工作流所有者可以删除任何非编组节点
    if (isWorkflowOwner) {
      handleNodesDelete(nonGroupedNodes);
      // 广播节点删除事件给其他协作者
      nonGroupedNodes.forEach(node => emitNodeDelete(node.id));
      return;
    }
    
    // 协作者只能删除自己创建的节点及其生成的内容节点
    const deletableNodes = nonGroupedNodes.filter(node => {
      // 检查节点创建者
      const nodeCreatedBy = node.data?.createdBy;
      const creatorId = typeof nodeCreatedBy === 'object' ? nodeCreatedBy?.id : nodeCreatedBy;
      
      // 没有 createdBy 的节点视为所有者创建的旧节点，协作者不能删除
      if (!creatorId) {
        return false;
      }
      
      if (creatorId === currentUserIdRef.current) {
        return true;
      }
      
      // 对于预览节点，检查源节点的创建者
      const isPreviewNode = ['imagePreview', 'videoPreview', 'audioPreview', 'textPreview'].includes(node.type || '');
      if (isPreviewNode) {
        const incomingEdge = edgesRef.current.find(e => e.target === node.id);
        if (incomingEdge) {
          const sourceNode = nodesRef.current.find(n => n.id === incomingEdge.source);
          if (sourceNode) {
            const sourceCreatedBy = sourceNode.data?.createdBy;
            const sourceCreatorId = typeof sourceCreatedBy === 'object' ? sourceCreatedBy?.id : sourceCreatedBy;
            // 源节点也必须有 createdBy 且是当前用户
            if (sourceCreatorId && sourceCreatorId === currentUserIdRef.current) {
              return true;
            }
          }
        }
      }
      
      return false;
    });
    
    if (deletableNodes.length > 0) {
      handleNodesDelete(deletableNodes);
      // 广播节点删除事件给其他协作者
      deletableNodes.forEach(node => emitNodeDelete(node.id));
    }
  }, [isWorkflowOwner, handleNodesDelete, emitNodeDelete]);

  const handleEdgesDelete = useCallback((_deleted: Edge[]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    setTimeout(() => {
      autoSave();
    }, 250);
  }, []);

  // 带权限检查的边变更处理器（禁止删除涉及非隐藏编组内节点的边）
  const handleEdgesChangeWithPermission = useCallback((changes: any[]) => {
    const filteredChanges = changes.filter((change: any) => {
      // 允许非删除变更
      if (change.type !== 'remove') return true;
      
      // 查找要删除的边
      const edgeToRemove = edgesRef.current.find(e => e.id === change.id);
      if (!edgeToRemove) return true;
      
      // 检查边的源节点或目标节点是否在非隐藏编组内
      // hidden: true 的编组是分镜工作流的默认编组，不限制
      const isSourceInGroup = nodeGroupsRef.current.some(g => !g.hidden && g.nodeIds?.includes(edgeToRemove.source));
      const isTargetInGroup = nodeGroupsRef.current.some(g => !g.hidden && g.nodeIds?.includes(edgeToRemove.target));
      
      if (isSourceInGroup || isTargetInGroup) {
        toast.error('编组内的节点连接不允许删除');
        return false;
      }
      
      return true;
    });
    
    onEdgesChange(filteredChanges);
  }, [onEdgesChange]);

  // 带权限检查的边删除处理器
  const handleEdgesDeleteWithPermission = useCallback((deleted: Edge[]) => {
    // 过滤掉涉及非隐藏编组内节点的边
    // hidden: true 的编组是分镜工作流的默认编组，不限制
    const deletableEdges = deleted.filter(edge => {
      const isSourceInGroup = nodeGroupsRef.current.some(g => !g.hidden && g.nodeIds?.includes(edge.source));
      const isTargetInGroup = nodeGroupsRef.current.some(g => !g.hidden && g.nodeIds?.includes(edge.target));
      
      if (isSourceInGroup || isTargetInGroup) {
        toast.error('编组内的节点连接不允许删除');
        return false;
      }
      return true;
    });
    
    if (deletableEdges.length > 0) {
      handleEdgesDelete(deletableEdges);
      // 广播边删除事件给其他协作者
      deletableEdges.forEach(edge => emitEdgeDelete(edge.id));
    }
  }, [handleEdgesDelete, emitEdgeDelete]);

  // 右键菜单处理
  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();

    // 协作者只读模式下禁用右键菜单
    if (isReadOnly) {
      return;
    }

    // 计算菜单位置，确保始终在视口内可见
    const menuWidth = 200; // 菜单宽度
    const menuHeight = 400; // 菜单大致高度
    const padding = 10; // 与边缘的距离

    let x = event.clientX;
    let y = event.clientY;

    // 检查右侧是否超出
    if (x + menuWidth + padding > window.innerWidth) {
      x = window.innerWidth - menuWidth - padding;
    }

    // 检查底部是否超出
    if (y + menuHeight + padding > window.innerHeight) {
      y = window.innerHeight - menuHeight - padding;
    }

    // 确保不会超出左侧和顶部
    x = Math.max(padding, x);
    y = Math.max(padding, y);

    setContextMenu({ x, y });
  }, [isReadOnly]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setShowAgentSubmenu(false);
    setShowVideoSubmenu(false);
  }, []);

  // 打开资产面板为指定节点选择资产
  const handleOpenAssetPanelForNode = useCallback((nodeId: string) => {
    setActiveAssetSelectorNodeId(nodeId);
    setIsAssetPanelOpen(true);
  }, []);

  // 确保所有资产选择器节点都有 onOpenAssetPanel 函数（刷新页面后恢复）
  useEffect(() => {
    if (nodes.length > 0) {
      const needsUpdate = nodes.some(
        (node) => node.type === 'assetSelector' && !node.data.onOpenAssetPanel
      );

      if (needsUpdate) {
        
        setNodes((nds) =>
          nds.map((node) => {
            // 如果是资产选择器节点且没有 onOpenAssetPanel 函数，则添加
            if (node.type === 'assetSelector' && !node.data.onOpenAssetPanel) {
              return {
                ...node,
                data: {
                  ...node.data,
                  onOpenAssetPanel: handleOpenAssetPanelForNode,
                  // 保留 models，不要覆盖
                  models: node.data.models || aiModels,
                },
              };
            }
            return node;
          })
        );
      }
    }
  }, [nodes.length, handleOpenAssetPanelForNode, aiModels]); // 添加 aiModels 依赖

  // 从资产面板选择资产
  const handleAssetSelectFromPanel = useCallback((asset: any) => {
    if (activeAssetSelectorNodeId) {
      // 更新AssetSelectorNode的数据
      setNodes((nds) => {
        const updated = nds.map((node) =>
          node.id === activeAssetSelectorNodeId
            ? {
              ...node,
              data: {
                ...node.data,
                config: {
                  ...node.data.config,
                  ...(asset.images
                    ? (asset.images.length === 1
                      ? {
                        selectedInput: {
                          id: asset.images[0].id,
                          name: asset.images[0].name,
                          originalName: asset.images[0].name,
                          type: 'IMAGE',
                          mimeType: 'image/jpeg',
                          size: 0,
                          url: asset.images[0].url,
                        },
                        selectedAsset: {
                          id: asset.images[0].id,
                          name: asset.images[0].name,
                          originalName: asset.images[0].name,
                          type: 'IMAGE',
                          mimeType: 'image/jpeg',
                          size: 0,
                          url: asset.images[0].url,
                        },
                        subjects: undefined,
                        referenceImages: undefined,
                      }
                      : {
                        selectedInput: asset,
                        subjects: [{ name: asset.name, images: asset.images.map((i: any) => i.url) }],
                        referenceImages: asset.images.map((i: any) => ({ id: i.id, url: i.url, name: i.name })),
                      })
                    : {
                      selectedInput: {
                        id: asset.id,
                        name: asset.name,
                        originalName: asset.originalName,
                        type: asset.type,
                        mimeType: asset.mimeType,
                        size: asset.size,
                        url: asset.url,
                      },
                      selectedAsset: {
                        id: asset.id,
                        name: asset.name,
                        originalName: asset.originalName,
                        type: asset.type,
                        mimeType: asset.mimeType,
                        size: asset.size,
                        url: asset.url,
                      },
                      subjects: undefined,
                      referenceImages: undefined,
                    }),
                },
              },
            }
            : node
        );
        return updated;
      });
      setIsAssetPanelOpen(false);
      setActiveAssetSelectorNodeId(null);
      toast.success(`已选择素材：${asset.name}`);
    }
  }, [activeAssetSelectorNodeId, setNodes]);

  const getDefaultConfigForVideoNode = (nt: string) => {
    const map: Record<string, string> = {
      aiVideo_t2v: '文生视频',
      aiVideo_i2v_first: '首帧',
      aiVideo_i2v_last: '尾帧',
      aiVideo_first_last: '首尾帧',
      aiVideo_reference: '参考图',
      aiVideo_swap: '视频换人',
      aiVideo_lipsync: '对口型',
      aiVideo_style: '风格转换',
    };
    const gen = map[nt] || '文生视频';
    const accepted = gen === '文生视频' ? ['TEXT'] : (gen === '视频换人' ? ['TEXT', 'IMAGE', 'VIDEO'] : (gen === '对口型' ? ['VIDEO', 'AUDIO', 'IMAGE', 'TEXT'] : (gen === '风格转换' ? ['VIDEO'] : ['TEXT', 'IMAGE'])));
    const modelsGen = aiModels.filter((m: any) => m.type === 'VIDEO_GENERATION');
    const modelsEdit = aiModels.filter((m: any) => m.type === 'VIDEO_EDITING');
    const normalize = (t: string) => {
      const s = (t || '').toLowerCase();
      if (s.includes('text') || s.includes('文生')) return '文生视频';
      if (s.includes('first-last') || s.includes('首尾')) return '首尾帧';
      if (s.includes('first') || s.includes('首帧')) return '首帧';
      if (s.includes('last') || s.includes('尾帧')) return '尾帧';
      if (s.includes('参考')) return '参考图';
      if (s.includes('换人')) return '视频换人';
      return t;
    };
    let modelItem: any = null;
    if (gen === '视频换人') {
      modelItem = modelsEdit.find((m: any) => Array.isArray(m?.config?.supportedEditingCapabilities) && m.config.supportedEditingCapabilities.includes('视频换人'))
        || modelsGen.find((m: any) => {
          const types = Array.isArray(m?.config?.supportedGenerationTypes) ? m.config.supportedGenerationTypes.map((t: string) => normalize(t)) : [];
          return (types.includes('视频换人') && m?.config?.supportsVideoEditing === true);
        });
    } else if (gen === '对口型') {
      modelItem = modelsEdit.find((m: any) => Array.isArray(m?.config?.supportedEditingCapabilities) && m.config.supportedEditingCapabilities.includes('对口型')) || null;
    } else if (gen === '风格转换') {
      modelItem = modelsEdit.find((m: any) => Array.isArray(m?.config?.supportedEditingCapabilities) && m.config.supportedEditingCapabilities.includes('风格转换')) || null;
    } else {
      modelItem = modelsGen.find((m: any) => {
        const types = Array.isArray(m?.config?.supportedGenerationTypes) ? m.config.supportedGenerationTypes.map((t: string) => normalize(t)) : [];
        if (gen === '首帧' || gen === '尾帧') return types.includes('首帧') || types.includes('尾帧');
        return types.includes(gen);
      });
    }
    return {
      modelId: modelItem?.id,
      modelName: modelItem?.name,
      generationType: gen,
      lockedGenerationType: gen,
      hideGenerationTypeSelector: true,
      acceptedInputs: accepted,
    } as any;
  };

  // 添加节点
  const addNode = (
    type: string,
    label: string,
    nodeType: string,
    agentId?: string,
    agentName?: string,
    presetModelId?: string,
    presetModelName?: string,
    presetConfig?: Record<string, any>
  ) => {
    if (!contextMenu) return;

    // 将屏幕坐标转换为画布坐标（考虑缩放和平移）
    const position = screenToFlowPosition({
      x: contextMenu.x,
      y: contextMenu.y,
    });

    const newNodeId = `${type}-${Date.now()}`;

    // 查找新节点所在的编组：若带有幕镜参数，则归入该编组（隐藏边框）
    const nodeGroup = currentShotGroupId ? (nodeGroups.find(g => g.id === currentShotGroupId) || null) : (nodeGroups.find(g => g.nodeIds.includes(newNodeId)) || null);

    // 根据节点类型决定默认展开状态
    // AI图片、AI视频、Midjourney节点默认展开，其他节点默认收缩
    const defaultExpanded = nodeType === 'aiImage' || (nodeType as string).startsWith('aiVideo') || nodeType === 'midjourney';

    const defaultVideoConfig = nodeType.startsWith('aiVideo') ? getDefaultConfigForVideoNode(nodeType) : {};
    const finalConfig = agentId ? { agentId } : defaultVideoConfig;
    if (nodeType.startsWith('aiVideo') && presetModelId) {
      (finalConfig as any).modelId = presetModelId;
      (finalConfig as any).modelName = presetModelName;
    }
    if (nodeType.startsWith('aiVideo') && presetConfig) {
      Object.assign(finalConfig as any, presetConfig);
    }

    const newNode: Node = {
      id: newNodeId,
      type: nodeType,
      position,
      data: {
        label: agentName || label,
        type,
        config: finalConfig,
        models: aiModels, // 传递模型数据
        isExpanded: defaultExpanded, // AI节点默认展开，其他节点默认收缩
        onOpenAssetPanel: nodeType === 'assetSelector' ? handleOpenAssetPanelForNode : undefined,
        createdBy: currentUser ? { id: currentUser.id, nickname: currentUser.nickname, avatar: currentUser.avatar } : undefined, // 记录创建者
        // 添加上下文信息用于资产自动命名
        workflowContext: {
          project,
          episode,
          nodeGroup,
          nodeGroups,
        },
      },
    };

    setNodes((nds) => [...nds, newNode]);
    
    // 广播节点添加事件给其他协作者
    emitNodeAdd(newNode);
    
    if (currentShotGroupId) {
      setNodeGroups(prev => prev.map(g => {
        if (g.id !== currentShotGroupId) return g;
        const updatedIds = Array.from(new Set([...(g.nodeIds || []), newNodeId]));
        const b = calculateGroupBounds(updatedIds) || g.bounds;
        return { ...g, nodeIds: updatedIds, bounds: b } as NodeGroup;
      }));
      nodeGroupsRef.current = nodeGroupsRef.current.map(g => {
        if (g.id !== currentShotGroupId) return g;
        const updatedIds = Array.from(new Set([...(g.nodeIds || []), newNodeId]));
        const b = calculateGroupBounds(updatedIds) || g.bounds;
        return { ...g, nodeIds: updatedIds, bounds: b } as NodeGroup;
      });
    }
    closeContextMenu();
    toast.success(`已添加${agentName || label}节点`);

    // 如果是资产选择器节点，立即打开资产面板
    if (nodeType === 'assetSelector') {
      setTimeout(() => {
        handleOpenAssetPanelForNode(newNode.id);
      }, 100);
    }
  };

  const [connectionMenu, setConnectionMenu] = useState<{ x: number; y: number; sourceNodeId: string; handleType: 'source' | 'target' } | null>(null);
  const connectionCompletedRef = useRef(false);
  const pendingConnectionRef = useRef<{ nodeId: string; handleType: 'source' | 'target' } | null>(null);

  type ConnectionMenuFilters = { showAgent: boolean; showAiImage: boolean; showAudio: boolean; showVideo: boolean; showEdit?: boolean; showMidjourney: boolean; showUpload: boolean; showAssetSelector: boolean; showSuperCanvas?: boolean };
  const connectionMenuFilters: ConnectionMenuFilters = useMemo(() => {
    const defaults: ConnectionMenuFilters = { showAgent: true, showAiImage: true, showAudio: true, showVideo: true, showEdit: true, showMidjourney: true, showUpload: true, showAssetSelector: true, showSuperCanvas: true };
    if (!connectionMenu) return defaults;
    const isDraggingFromInput = connectionMenu.handleType === 'target';
    const normalize = (t?: string) => {
      const s = (t || '').toLowerCase().replace(/[_\-\s]+/g, ' ');
      if (!s) return '';
      if (s.includes('文生') || s.includes('text to video') || s.includes('t2v')) return '文生视频';
      if (s.includes('首尾') || s.includes('first last') || s.includes('two frame') || s.includes('frame pair')) return '首尾帧';
      if (s.includes('首帧') || s.includes('first frame') || s.includes('start frame') || s.includes('initial frame') || s.includes('keyframe')) return '首帧';
      if (s.includes('尾帧') || s.includes('last frame') || s.includes('end frame') || s.includes('final frame')) return '尾帧';
      if (s.includes('主体参考') || s.includes('subject reference')) return '参考图';
      if (s.includes('参考') || s.includes('reference image') || s.includes('image reference') || s.includes('ref image')) return '参考图';
      return t || '';
    };
    if (isDraggingFromInput) {
      const targetNode = nodes.find(n => n.id === connectionMenu.sourceNodeId);
      const t = (targetNode?.type || '') as string;
      const isVideo = t.startsWith('aiVideo');
      const gen = normalize((targetNode as any)?.data?.config?.generationType);
      const isT2V = t === 'aiVideo_t2v' || gen === '文生视频';
      // AI图片节点：左拉仅显示 智能体/上传素材/资产选择器；且智能体仅允许一个，图片上限来自模型配置
      if (t === 'aiImage') {
        const connectedEdges = edges.filter(e => e.target === (targetNode as any)?.id);
        const hasAgent = connectedEdges.some((e) => {
          const src = nodes.find(n => n.id === e.source);
          return (src?.type || '') === 'agent';
        });
        const imageCount = connectedEdges.reduce((acc, e) => {
          const src = nodes.find(n => n.id === e.source);
          const st = (src?.type || '') as string;
          if (st === 'upload') {
            const file = (src as any)?.data?.config?.uploadedFiles?.[0] || null;
            const tp = (file?.type || '').toUpperCase();
            const m = (file?.mimeType || '').toLowerCase();
            return acc + ((tp === 'IMAGE' || m.startsWith('image/')) ? 1 : 0);
          }
          if (st === 'assetSelector') {
            const conf = (src as any)?.data?.config || {};
            if (conf.selectedAsset) return acc + (((conf.selectedAsset.type || '').toUpperCase() === 'IMAGE' || (conf.selectedAsset.mimeType || '').toLowerCase().startsWith('image/')) ? 1 : 0);
            if (conf.subjects && conf.subjects.length > 0) return acc + ((conf.subjects[0].images || []).length || 0);
          }
          return acc;
        }, 0);
        const modelId = (targetNode as any)?.data?.config?.modelId;
        const modelItem = aiModels.find((m: any) => m.id === modelId);
        const cfg = modelItem?.config || {};
        const maxImages = cfg.maxReferenceImages || cfg.supportedReferenceImagesLimit || cfg.referenceImagesLimit || 10;
        if (hasAgent) {
          // 已有智能体 → 仅显示素材来源（上传/资产选择器）
          return { showAgent: false, showAiImage: false, showAudio: false, showVideo: false, showMidjourney: false, showUpload: true, showAssetSelector: true };
        }
        if (imageCount >= maxImages) {
          // 已达图片上限 → 仅显示智能体
          return { showAgent: true, showAiImage: false, showAudio: false, showVideo: false, showMidjourney: false, showUpload: false, showAssetSelector: false };
        }
        // 默认：显示智能体/上传素材/资产选择器
        return { showAgent: true, showAiImage: false, showAudio: false, showVideo: false, showMidjourney: false, showUpload: true, showAssetSelector: true };
      }
      if (isVideo) {
        const connectedEdges = edges.filter(e => e.target === (targetNode as any)?.id);
        const hasAgent = connectedEdges.some((e) => {
          const src = nodes.find(n => n.id === e.source);
          return (src?.type || '') === 'agent';
        });
        const imageCount = connectedEdges.reduce((acc, e) => {
          const src = nodes.find(n => n.id === e.source);
          const st = (src?.type || '') as string;
          if (st === 'aiImage' || st === 'imagePreview') return acc + 1;
          if (st === 'upload') {
            const file = (src as any)?.data?.config?.uploadedFiles?.[0] || null;
            const tp = (file?.type || '').toUpperCase();
            const m = (file?.mimeType || '').toLowerCase();
            return acc + ((tp === 'IMAGE' || m.startsWith('image/')) ? 1 : 0);
          }
          if (st === 'assetSelector') {
            const conf = (src as any)?.data?.config || {};
            if (conf.selectedAsset) return acc + (((conf.selectedAsset.type || '').toUpperCase() === 'IMAGE' || (conf.selectedAsset.mimeType || '').toLowerCase().startsWith('image/')) ? 1 : 0);
            if (conf.subjects && conf.subjects.length > 0) return acc + ((conf.subjects[0].images || []).length || 0);
          }
          return acc;
        }, 0);
        if (isT2V) {
          // 文生视频：仅允许一个智能体；如果已连接，则不显示任何选项
          if (hasAgent) return { showAgent: false, showAiImage: false, showAudio: false, showVideo: false, showMidjourney: false, showUpload: false, showAssetSelector: false };
          return { showAgent: true, showAiImage: false, showAudio: false, showVideo: false, showMidjourney: false, showUpload: false, showAssetSelector: false };
        }
        const isFirstOrLast = t === 'aiVideo_i2v_first' || t === 'aiVideo_i2v_last' || gen === '首帧' || gen === '尾帧';
        if (isFirstOrLast) {
          if (hasAgent && imageCount >= 1) {
            return { showAgent: false, showAiImage: false, showAudio: false, showVideo: false, showMidjourney: false, showUpload: false, showAssetSelector: false };
          }
          if (imageCount >= 1) {
            return { showAgent: true, showAiImage: false, showAudio: false, showVideo: false, showMidjourney: false, showUpload: false, showAssetSelector: false };
          }
          if (hasAgent) {
            return { showAgent: false, showAiImage: false, showAudio: false, showVideo: false, showMidjourney: false, showUpload: true, showAssetSelector: true };
          }
          return { showAgent: true, showAiImage: false, showAudio: false, showVideo: false, showMidjourney: false, showUpload: true, showAssetSelector: true };
        }
        const isFirstLast = t === 'aiVideo_first_last' || gen === '首尾帧';
        if (isFirstLast) {
          if (hasAgent && imageCount >= 2) {
            return { showAgent: false, showAiImage: false, showAudio: false, showVideo: false, showMidjourney: false, showUpload: false, showAssetSelector: false };
          }
          if (hasAgent) {
            return { showAgent: false, showAiImage: false, showAudio: false, showVideo: false, showMidjourney: false, showUpload: true, showAssetSelector: true };
          }
          if (imageCount >= 2) {
            return { showAgent: true, showAiImage: false, showAudio: false, showVideo: false, showMidjourney: false, showUpload: false, showAssetSelector: false };
          }
          if (imageCount === 1) {
            return { showAgent: true, showAiImage: false, showAudio: false, showVideo: false, showMidjourney: false, showUpload: true, showAssetSelector: true };
          }
          return { showAgent: true, showAiImage: false, showAudio: false, showVideo: false, showMidjourney: false, showUpload: true, showAssetSelector: true };
        }
        const isReference = t === 'aiVideo_reference' || gen === '参考图';
        if (isReference) {
          if (hasAgent && imageCount >= 7) {
            return { showAgent: false, showAiImage: false, showAudio: false, showVideo: false, showMidjourney: false, showUpload: false, showAssetSelector: false };
          }
          if (hasAgent) {
            return { showAgent: false, showAiImage: false, showAudio: false, showVideo: false, showMidjourney: false, showUpload: true, showAssetSelector: true };
          }
          if (imageCount >= 7) {
            return { showAgent: true, showAiImage: false, showAudio: false, showVideo: false, showMidjourney: false, showUpload: false, showAssetSelector: false };
          }
          return { showAgent: true, showAiImage: false, showAudio: false, showVideo: false, showMidjourney: false, showUpload: true, showAssetSelector: true };
        }
        // 其它视频类型（参考图）：保持允许智能体/素材
        return { showAgent: true, showAiImage: false, showAudio: false, showVideo: false, showMidjourney: false, showUpload: true, showAssetSelector: true };
      }
      // 非视频节点输入端拖拽：沿用默认
      return defaults;
    }
    // 从输出端拖拽：目标必须是可接受输入的节点，隐藏不接受输入的节点
    const sourceNode = nodes.find(n => n.id === connectionMenu.sourceNodeId);

    const getNodeOutputType = (node: any): string | null => {
      if (!node) return null;
      const nodeType = node.type as string;
      const nodeData = node.data;

      if (nodeType === 'upload' && Array.isArray(nodeData.config?.uploadedFiles) && nodeData.config.uploadedFiles.length > 0) {
        const files = nodeData.config.uploadedFiles as any[];
        const hasImage = files.some((f) => {
          const t = (f?.type || '').toUpperCase();
          const m = (f?.mimeType || '').toLowerCase();
          return t === 'IMAGE' || m.startsWith('image/');
        });
        if (hasImage) return 'IMAGE';
        const hasVideo = files.some((f) => {
          const t = (f?.type || '').toUpperCase();
          const m = (f?.mimeType || '').toLowerCase();
          return t === 'VIDEO' || m.startsWith('video/');
        });
        if (hasVideo) return 'VIDEO';
        const hasAudio = files.some((f) => {
          const t = (f?.type || '').toUpperCase();
          const m = (f?.mimeType || '').toLowerCase();
          return t === 'AUDIO' || m.startsWith('audio/');
        });
        if (hasAudio) return 'AUDIO';
        return null;
      }

      if (nodeType === 'assetSelector') {
        if (nodeData.config?.subjects) return 'IMAGE';
        if (nodeData.config?.selectedAsset) {
          const asset = nodeData.config.selectedAsset;
          const t = (asset.type || '').toUpperCase();
          const m = (asset.mimeType || '').toLowerCase();
          if (t === 'IMAGE' || m.startsWith('image/')) return 'IMAGE';
          if (t === 'VIDEO' || m.startsWith('video/')) return 'VIDEO';
          if (t === 'AUDIO' || m.startsWith('audio/')) return 'AUDIO';
          return t || null;
        }
      }

      if (nodeType === 'aiImage' || nodeType === 'imagePreview') return 'IMAGE';
      if (nodeType === 'midjourney') return 'IMAGE'; // Midjourney outputs image
      if ((nodeType || '').startsWith('aiVideo') || nodeType === 'videoPreview') return 'VIDEO';
      if (nodeType === 'agent' || nodeType === 'textPreview') return 'TEXT';
      return null;
    };

    const outputType = getNodeOutputType(sourceNode);
    const sourceNodeType = sourceNode?.type as string;

    // 视频预览节点特殊处理：只显示智能体和视频编辑
    if (sourceNodeType === 'videoPreview') {
      return {
        showAgent: true,
        showAiImage: false,
        showAudio: false,
        showVideo: false,
        showEdit: true,
        showMidjourney: false,
        showUpload: false,
        showAssetSelector: false,
        showSuperCanvas: false
      };
    }

    // 图片预览节点特殊处理：添加视频编辑菜单项
    if (sourceNodeType === 'imagePreview') {
      return {
        showAgent: false,
        showAiImage: true,
        showAudio: false,
        showVideo: true,
        showEdit: true,
        showMidjourney: true,
        showUpload: false,
        showAssetSelector: false,
        showSuperCanvas: true
      };
    }

    return {
      showAgent: outputType === 'TEXT',
      showAiImage: outputType === 'IMAGE' || outputType === 'TEXT',
      showAudio: outputType === 'AUDIO',
      showVideo: outputType === 'VIDEO' || outputType === 'IMAGE' || outputType === 'TEXT',
      showEdit: outputType === 'VIDEO',
      showMidjourney: outputType === 'IMAGE' || outputType === 'TEXT',
      showUpload: false,
      showAssetSelector: false,
      showSuperCanvas: outputType === 'IMAGE'
    };
  }, [connectionMenu, nodes, edges, aiModels]);

  // 从连接点拖动创建新节点
  const handleConnectStart = useCallback((_event: any, { nodeId, handleType }: any) => {
    
    if (!nodeId) {
      pendingConnectionRef.current = null;
      return;
    }

    if (handleType === 'target') {
      const node = nodes.find(n => n.id === nodeId);
      const t = (node?.type || '') as string;
      if (t === 'agent' || t === 'aiImage' || t === 'midjourney' || t.startsWith('aiVideo')) {
        toast.error('请从素材的输出端连接到该节点的输入端');
        pendingConnectionRef.current = null;
        return;
      }
    }

    // 禁止AI节点的输出连接点拖拽（因为AI节点会自动创建预览节点）
    if (handleType === 'source') {
      const node = nodes.find(n => n.id === nodeId);
      if (node && (node.type === 'aiImage' || (node.type as string).startsWith('aiVideo'))) {
        
        pendingConnectionRef.current = null;
        return;
      }
    }

    connectionCompletedRef.current = false;
    pendingConnectionRef.current = {
      nodeId: nodeId,
      handleType: handleType === 'target' ? 'target' : 'source',
    };
    // 关闭其他菜单
    closeContextMenu();
    setConnectionMenu(null);
  }, [closeContextMenu, nodes]);

  // 连接结束时的处理
  const handleConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    

    // 立即保存pending，避免被其他事件清空
    const pending = pendingConnectionRef.current;

    if (!pending) {
      
      return;
    }

    // 获取鼠标位置
    let clientX = 0;
    let clientY = 0;
    if ('changedTouches' in event && event.changedTouches.length > 0) {
      clientX = event.changedTouches[0].clientX;
      clientY = event.changedTouches[0].clientY;
    } else if ('clientX' in event) {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    

    // 延迟100ms检查，让 onConnect 先执行
    setTimeout(() => {
      

      if (connectionCompletedRef.current) {
        
        connectionCompletedRef.current = false;
        pendingConnectionRef.current = null;
        return;
      }

      // 没有完成连接，仅当鼠标在空白画布上时才弹出菜单
      const targetEl = (event as any).target as HTMLElement | null;
      const isOnPane = !!targetEl && !!targetEl.closest('.react-flow__pane');
      const isOnNodeOrHandle = !!targetEl && (targetEl.closest('.react-flow__node') || targetEl.closest('.react-flow__handle'));
      if (!isOnPane || isOnNodeOrHandle) {
    
        connectionCompletedRef.current = false;
        pendingConnectionRef.current = null;
        return;
      }
      

      setConnectionMenu({
        x: clientX,
        y: clientY,
        sourceNodeId: pending.nodeId,
        handleType: pending.handleType,
      });

      connectionCompletedRef.current = false;
    }, 100);

    // 立即清空，避免重复触发
    pendingConnectionRef.current = null;
  }, []);

  // 从连接菜单创建节点
  const createNodeFromConnection = (nodeType: string, label: string, type: string, agentId?: string, agentName?: string, presetConfig?: Record<string, any>) => {
    if (!connectionMenu) return;

    // 将屏幕坐标（相对于wrapper）转换为流坐标
    const flowPosition = screenToFlowPosition({
      x: connectionMenu.x,
      y: connectionMenu.y,
    });

    const newNodeId = `${type}-${Date.now()}`;

    // 查找源节点所在的编组，新节点应该加入同一个编组
    const sourceNode = nodes.find(n => n.id === connectionMenu.sourceNodeId);
    const sourceNodeGroup = sourceNode ? nodeGroups.find(g => g.nodeIds.includes(sourceNode.id)) : null;

    // 根据节点类型决定默认展开状态
    // AI图片、AI视频、Midjourney节点默认展开，其他节点默认收缩
    const defaultExpanded = nodeType === 'aiImage' || (nodeType as string).startsWith('aiVideo') || nodeType === 'midjourney';

    const defaultVideoConfig = nodeType.startsWith('aiVideo') ? getDefaultConfigForVideoNode(nodeType) : {};
    const finalConfig = agentId ? { agentId } : defaultVideoConfig;
    if (nodeType.startsWith('aiVideo') && presetConfig) {
      Object.assign(finalConfig as any, presetConfig);
    }

    const newNode: Node = {
      id: newNodeId,
      type: nodeType,
      position: flowPosition,
      data: {
        label: agentName || label,
        type,
        config: finalConfig,
        models: aiModels,
        isExpanded: defaultExpanded, // AI节点默认展开，其他节点默认收缩
        onOpenAssetPanel: nodeType === 'assetSelector' ? handleOpenAssetPanelForNode : undefined,
        createdBy: currentUser ? { id: currentUser.id, nickname: currentUser.nickname, avatar: currentUser.avatar } : undefined, // 记录创建者
        // 添加上下文信息用于资产自动命名
        workflowContext: {
          project,
          episode,
          nodeGroup: sourceNodeGroup,
          nodeGroups,
        },
      },
    };

    setNodes((nds) => [...nds, newNode]);

    // 如果源节点在编组中，将新节点也添加到该编组
    if (sourceNodeGroup) {
      setNodeGroups(prev => prev.map(g => {
        if (g.id !== sourceNodeGroup.id) return g;
        const updatedIds = Array.from(new Set([...g.nodeIds, newNodeId]));
        return { ...g, nodeIds: updatedIds };
      }));
      nodeGroupsRef.current = nodeGroupsRef.current.map(g => {
        if (g.id !== sourceNodeGroup.id) return g;
        const updatedIds = Array.from(new Set([...g.nodeIds, newNodeId]));
        return { ...g, nodeIds: updatedIds };
      });
    }

    // 自动连接节点
    if (connectionMenu.handleType === 'source') {
      // 从输出连接到新节点的输入
      const src = nodes.find(n => n.id === connectionMenu.sourceNodeId);
      const tgt = newNode as any;
      const normalize = (t?: string) => {
        const s = (t || '').toLowerCase().replace(/[_\-\s]+/g, ' ');
        if (!s) return '';
        if (s.includes('文生') || s.includes('text to video') || s.includes('t2v')) return '文生视频';
        if (s.includes('首尾') || s.includes('first last') || s.includes('two frame') || s.includes('frame pair')) return '首尾帧';
        if (s.includes('首帧') || s.includes('first frame') || s.includes('start frame') || s.includes('initial frame') || s.includes('keyframe')) return '首帧';
        if (s.includes('尾帧') || s.includes('last frame') || s.includes('end frame') || s.includes('final frame')) return '尾帧';
        if (s.includes('主体参考') || s.includes('subject reference')) return '主体参考';
        if (s.includes('参考') || s.includes('reference image') || s.includes('image reference') || s.includes('ref image')) return '参考图';
        return t || '';
      };
      const getNodeOutputType = (node: any): string | null => {
        const nodeType = node.type as string;
        const nodeData = node.data;
        if (nodeType === 'upload' && Array.isArray(nodeData.config?.uploadedFiles) && nodeData.config.uploadedFiles.length > 0) {
          const files = nodeData.config.uploadedFiles as any[];
          const hasVideo = files.some((f) => {
            const t = (f?.type || '').toUpperCase();
            const m = (f?.mimeType || '').toLowerCase();
            return t === 'VIDEO' || m.startsWith('video/');
          });
          const hasImage = files.some((f) => {
            const t = (f?.type || '').toUpperCase();
            const m = (f?.mimeType || '').toLowerCase();
            return t === 'IMAGE' || m.startsWith('image/');
          });
          const hasAudio = files.some((f) => {
            const t = (f?.type || '').toUpperCase();
            const m = (f?.mimeType || '').toLowerCase();
            return t === 'AUDIO' || m.startsWith('audio/');
          });
          if ((tgt?.type as string) === 'aiVideo_swap') {
            if (hasVideo) return 'VIDEO';
            if (hasImage) return 'IMAGE';
            if (hasAudio) return 'AUDIO';
            return null;
          }
          if (hasImage) return 'IMAGE';
          if (hasVideo) return 'VIDEO';
          if (hasAudio) return 'AUDIO';
          return null;
        }
        if (nodeType === 'assetSelector') {
          if (nodeData.config?.subjects) return 'IMAGE';
          if (nodeData.config?.selectedAsset) {
            const asset = nodeData.config.selectedAsset;
            const t = (asset.type || '').toUpperCase();
            const m = (asset.mimeType || '').toLowerCase();
            if (t === 'IMAGE' || m.startsWith('image/')) return 'IMAGE';
            if (t === 'VIDEO' || m.startsWith('video/')) return 'VIDEO';
            if (t === 'AUDIO' || m.startsWith('audio/')) return 'AUDIO';
            return t || null;
          }
        }
        if (nodeType === 'aiImage' || nodeType === 'imagePreview') return 'IMAGE';
        if ((nodeType || '').startsWith('aiVideo') || nodeType === 'videoPreview') return 'VIDEO';
        if (nodeType === 'agent') return 'TEXT';
        return null;
      };
      const countImagesFromSourceNode = (node: any): number => {
        const outType = getNodeOutputType(node);
        if (outType !== 'IMAGE') return 0;
        if (node.type === 'upload') {
          const files = node.data?.config?.uploadedFiles || [];
          return files.filter((f: any) => f.type === 'IMAGE' || (f.mimeType || '').startsWith('image/')).length;
        }
        if (node.type === 'assetSelector') {
          const conf = node.data?.config || {};
          if (conf.subjects && conf.subjects.length > 0) return (conf.subjects[0].images || []).length;
          if (conf.selectedAsset && conf.selectedAsset.type === 'IMAGE') return 1;
          return 0;
        }
        if (node.type === 'imagePreview' || node.type === 'aiImage') return 1;
        return 1;
      };
      const getMaxImagesAllowedForVideoTarget = (node: any): number => {
        const gt = normalize(node.data?.config?.generationType);
        if (gt === '文生视频') return 0;
        if (gt === '首帧' || gt === '尾帧') return 1;
        if (gt === '首尾帧') return 2;
        if (gt === '参考图' || gt === '主体参考') return 7;
        const modelId = node.data?.config?.modelId;
        const models = node.data?.models || aiModels;
        const modelItem = models.find((m: any) => m.id === modelId);
        const types: string[] = Array.isArray(modelItem?.config?.supportedGenerationTypes)
          ? (modelItem.config.supportedGenerationTypes as string[]).map((t) => normalize(t))
          : [];
        if (types.includes('参考图') || types.includes('主体参考')) return 7;
        if (types.includes('首尾帧')) return 2;
        if (types.includes('首帧') || types.includes('尾帧')) return 1;
        if (types.includes('文生视频')) return 0;
        return 0;
      };
      const outType = src ? getNodeOutputType(src) : null;
      if ((tgt.type as string).startsWith('aiVideo') && outType === 'IMAGE') {
        const tgtGen = normalize(tgt.data?.config?.generationType);
        if (tgtGen === '首尾帧' && src && src.type === 'assetSelector') {
          const conf = src.data?.config || {};
          if (conf.subjects && ((conf.subjects[0]?.images || []).length > 0)) {
            toast.error('首尾帧不接受角色组，请连接两张单图');
            setConnectionMenu(null);
            pendingConnectionRef.current = null;
            connectionCompletedRef.current = false;
            return;
          }
        }
        const connectedEdges = edges.filter(e => e.target === tgt.id);
        let currentImagesCount = 0;
        connectedEdges.forEach((e) => {
          const s = nodes.find(n => n.id === e.source);
          if (s) currentImagesCount += countImagesFromSourceNode(s);
        });
        const incomingImages = src ? countImagesFromSourceNode(src) : 0;
        const maxAllowed = getMaxImagesAllowedForVideoTarget(tgt);
        const totalAfterConnect = currentImagesCount + incomingImages;
        if (maxAllowed === 0) {
          toast.error('该视频模型仅支持文生视频，不接收图片');
          setConnectionMenu(null);
          pendingConnectionRef.current = null;
          connectionCompletedRef.current = false;
          return;
        }
        if (totalAfterConnect > maxAllowed) {
          toast.error(`该视频模型最多接收${maxAllowed}张参考图（当前将接入${totalAfterConnect}张）`);
          setConnectionMenu(null);
          pendingConnectionRef.current = null;
          connectionCompletedRef.current = false;
          return;
        }
      }
      let targetHandle: string | undefined;
      if (newNode.type === 'superCanvas') {
        targetHandle = 'input-image';
      } else if (newNode.type === 'midjourney') {
        if (outType === 'IMAGE') {
          targetHandle = 'omni-ref';
        } else if (outType === 'TEXT') {
          targetHandle = 'text-input';
        }
      }

      const newEdge = {
        id: `edge-${connectionMenu.sourceNodeId}-${newNode.id}`,
        source: connectionMenu.sourceNodeId,
        target: newNode.id,
        targetHandle,
        type: 'aurora',
        animated: true,
        style: { stroke: 'currentColor', strokeWidth: 2 },
      };
      setEdges((eds) => [...eds, newEdge]);
    } else if (connectionMenu.handleType === 'target') {
      const tgt = nodes.find(n => n.id === connectionMenu.sourceNodeId);
      const t = (tgt?.type || '') as string;
      if (t === 'agent' || t === 'aiImage' || t === 'midjourney' || t.startsWith('aiVideo')) {
        toast.error('请从素材的输出端连接到该节点的输入端');
        setConnectionMenu(null);
        pendingConnectionRef.current = null;
        connectionCompletedRef.current = false;
        return;
      }
      // 从新节点的输出连接到输入
      const src = newNode as any;
      const tgt2 = nodes.find(n => n.id === connectionMenu.sourceNodeId);
      const normalize = (t?: string) => {
        const s = (t || '').toLowerCase();
        if (!s) return '';
        if (s.includes('文生')) return '文生视频';
        if (s.includes('首尾')) return '首尾帧';
        if (s.includes('首帧')) return '首帧';
        if (s.includes('尾帧')) return '尾帧';
        if (s.includes('主体参考')) return '主体参考';
        if (s.includes('参考')) return '参考图';
        if (s.includes('text-to-video')) return '文生视频';
        if (s.includes('first-last')) return '首尾帧';
        if (s.includes('first')) return '首帧';
        if (s.includes('last')) return '尾帧';
        if (s.includes('subject')) return '主体参考';
        if (s.includes('reference')) return '参考图';
        return t || '';
      };
      const getNodeOutputType = (node: any): string | null => {
        const nodeType = node.type as string;
        const nodeData = node.data;
        if (nodeType === 'upload' && nodeData.config?.uploadedFiles?.length > 0) {
          const file = nodeData.config.uploadedFiles[0];
          const t = (file.type || '').toUpperCase();
          const m = (file.mimeType || '').toLowerCase();
          if (t === 'IMAGE' || m.startsWith('image/')) return 'IMAGE';
          if (t === 'VIDEO' || m.startsWith('video/')) return 'VIDEO';
          if (t === 'AUDIO' || m.startsWith('audio/')) return 'AUDIO';
          return t || null;
        }
        if (nodeType === 'assetSelector') {
          if (nodeData.config?.subjects) return 'IMAGE';
          if (nodeData.config?.selectedAsset) {
            const asset = nodeData.config.selectedAsset;
            const t = (asset.type || '').toUpperCase();
            const m = (asset.mimeType || '').toLowerCase();
            if (t === 'IMAGE' || m.startsWith('image/')) return 'IMAGE';
            if (t === 'VIDEO' || m.startsWith('video/')) return 'VIDEO';
            if (t === 'AUDIO' || m.startsWith('audio/')) return 'AUDIO';
            return t || null;
          }
        }
        if (nodeType === 'aiImage' || nodeType === 'imagePreview') return 'IMAGE';
        if (nodeType === 'aiVideo' || nodeType === 'videoPreview') return 'VIDEO';
        if (nodeType === 'agent') return 'TEXT';
        return null;
      };
      // 连接阶段不再计算图片数量或模型限制，统一交由生成前校验
      const outType = getNodeOutputType(src);
      if (tgt2 && tgt2.type === 'aiVideo' && outType === 'IMAGE') {
        const tgtGen = normalize(tgt2.data?.config?.generationType);
        if (tgtGen === '首尾帧' && src && src.type === 'assetSelector') {
          const conf = src.data?.config || {};
          if (conf.subjects && conf.subjects.length > 0) {
            toast.error('首尾帧不接受角色组输入，请连接两张单图');
            setConnectionMenu(null);
            pendingConnectionRef.current = null;
            connectionCompletedRef.current = false;
            return;
          }
        }

      }
      const newEdge = {
        id: `edge-${newNode.id}-${connectionMenu.sourceNodeId}`,
        source: newNode.id,
        sourceHandle: newNode.type === 'superCanvas' ? 'output-image' : undefined,
        target: connectionMenu.sourceNodeId,
        type: 'aurora',
        animated: true,
        style: { stroke: 'currentColor', strokeWidth: 2 },
      };
      setEdges((eds) => [...eds, newEdge]);
    }

    setConnectionMenu(null);
    pendingConnectionRef.current = null;
    connectionCompletedRef.current = false;
    toast.success(`已添加${label}节点并自动连接`);

    // 如果是资产选择器节点，立即打开资产面板
    if (nodeType === 'assetSelector') {
      setTimeout(() => {
        handleOpenAssetPanelForNode(newNode.id);
      }, 100);
    }
  };

  // 计算节点组的边界
  const calculateGroupBounds = useCallback((nodeIds: string[]) => {
    const groupNodes = nodes.filter(n => nodeIds.includes(n.id));
    if (groupNodes.length === 0) return null;

    const padding = 50; // 边框与节点的距离：50px
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    groupNodes.forEach((node) => {
      const x = node.position.x;
      const y = node.position.y;
      // 使用节点的实际尺寸，如果没有则使用默认值
      const width = (node.width || 320);
      const height = (node.height || 200);

      // 找最左、最上、最右、最下的边界
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    });

    // 应用50px的边距
    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    };
  }, [nodes]);

  // 切换文本标注模式
  const toggleTextAnnotationMode = useCallback(() => {
    setIsTextAnnotationMode(prev => !prev);
    setIsSelectionMode(false); // 退出框选模式
  }, []);

  // 在指定位置添加文本标注节点
  const insertTextAnnotationAt = useCallback((x: number, y: number) => {
    const newNode = {
      id: `text-annotation-${Date.now()}`,
      type: 'textAnnotation',
      position: { x: x - 100, y: y - 20 },
      data: {
        text: '双击编辑文本',
        fontSize: 36, // 默认36px
        width: 200,
        bold: false,
        createdBy: currentUser ? { id: currentUser.id, nickname: currentUser.nickname, avatar: currentUser.avatar } : undefined, // 记录创建者
      },
    };
    
    setNodes((nds) => [...nds, newNode]);
    setIsTextAnnotationMode(false); // 插入后退出模式
  }, [setNodes, currentUser]);

  // 创建编组
  const createGroup = useCallback(() => {
    // 只有工作流所有者可以创建编组
    if (!isWorkflowOwner) {
      toast.error('只有工作流所有者可以创建编组');
      return;
    }
    
    const selectedNodes = nodes.filter(n => n.selected);
    if (selectedNodes.length === 0) {
      toast.error('请先选择节点（点击顶部"选择"按钮进入框选模式）');
      return;
    }

    if (selectedNodes.length < 2) {
      toast.error('编组需要至少2个节点');
      return;
    }

    const nodeIdsArray = selectedNodes.map(n => n.id);

    // 检查这些节点是否已经在其他编组中
    const alreadyGrouped = nodeGroups.some(group =>
      group.nodeIds.some(id => nodeIdsArray.includes(id))
    );

    if (alreadyGrouped) {
      toast.error('选中的节点已在其他编组中，请先解除编组');
      return;
    }

    // 计算编组边界（基于选中节点的位置）
    const bounds = calculateGroupBounds(nodeIdsArray);
    

    if (!bounds) {
      toast.error('无法计算编组边界');
      return;
    }

    // 创建新编组
    const newGroup: NodeGroup = {
      id: `group-${Date.now()}`,
      nodeIds: nodeIdsArray,
      bounds,
    };

    

    setNodeGroups(prev => {
      const updated = [...prev, newGroup];
      
      // 广播编组更新给其他协作者
      emitGroupsUpdate(updated);
      
      // 创建编组后立即保存
      setTimeout(() => {
        autoSave();
      }, 100);
      return updated;
    });

    setSelectedGroupId(newGroup.id); // 自动选中新创建的编组
    

    // 保持节点可拖动（拖动节点=拖动编组），但禁用删除，并更新上下文信息
    setNodes(nds => {
      // 获取所有从编组内节点输出的预览节点
      const previewNodeIds = new Set<string>();
      edges.forEach(edge => {
        if (nodeIdsArray.includes(edge.source)) {
          const targetNode = nds.find(n => n.id === edge.target);
          if (targetNode && (targetNode.type === 'imagePreview' || targetNode.type === 'videoPreview')) {
            previewNodeIds.add(edge.target);
          }
        }
      });

      return nds.map(node => {
        // 更新编组内的节点
        if (nodeIdsArray.includes(node.id)) {
          return {
            ...node,
            draggable: true, // 允许拖动（拖动时移动整个编组）
            connectable: false,
            deletable: false,
            selected: false,
            data: {
              ...node.data,
              workflowContext: {
                ...node.data.workflowContext,
                nodeGroup: newGroup,
                nodeGroups: [...nodeGroups, newGroup],
              },
            },
          };
        }
        // 同时更新相关的预览节点
        if (previewNodeIds.has(node.id)) {
          return {
            ...node,
            data: {
              ...node.data,
              workflowContext: {
                ...node.data.workflowContext,
                nodeGroup: newGroup,
                nodeGroups: [...nodeGroups, newGroup],
              },
            },
          };
        }
        return node;
      });
    });

    toast.success(`已创建编组，包含 ${nodeIdsArray.length} 个节点`);
  }, [nodes, calculateGroupBounds, nodeGroups, setNodes]);

  // 解除编组
  const ungroupNodes = useCallback(() => {
    // 只有工作流所有者可以解除编组
    if (!isWorkflowOwner) {
      toast.error('只有工作流所有者可以解除编组');
      return;
    }
    
    if (!selectedGroupId) {
      toast.error('请先选择一个编组');
      return;
    }

    const group = nodeGroups.find(g => g.id === selectedGroupId);
    if (!group) return;

    // 恢复节点的拖动、连接和删除能力，并更新上下文信息
    setNodes(nds => nds.map(node => {
      if (group.nodeIds.includes(node.id)) {
        return {
          ...node,
          draggable: true,
          connectable: true,
          deletable: true,
          data: {
            ...node.data,
            workflowContext: {
              ...node.data.workflowContext,
              nodeGroup: null,
              nodeGroups: nodeGroups.filter(g => g.id !== selectedGroupId),
            },
          },
        };
      }
      return node;
    }));

    // 删除编组
    setNodeGroups(prev => {
      const updated = prev.filter(g => g.id !== selectedGroupId);
      
      // 广播编组更新给其他协作者
      emitGroupsUpdate(updated);
      
      // 解除编组后立即保存
      setTimeout(() => {
        autoSave();
      }, 100);
      return updated;
    });
    setSelectedGroupId(null);

    toast.success('已解除编组');
  }, [selectedGroupId, nodeGroups, setNodes, emitGroupsUpdate]);

  // 打开命名对话框
  const openNamingDialog = useCallback(() => {
    if (!selectedGroupId) {
      toast.error('请先选择一个编组');
      return;
    }
    setNamingGroupId(selectedGroupId);
    setShowNamingDialog(true);
  }, [selectedGroupId]);

  // 开始拖动编组框
  const handleGroupMouseDown = useCallback((e: React.MouseEvent, groupId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingGroupId(null);
    setSelectedGroupId(groupId);
    setDragStart(null);
  }, []);

  // 全局监听鼠标移动和抬起事件（用于编组拖动）
  useEffect(() => {
    if (!draggingGroupId || !dragStart) return;

    let lastDragX = dragStart.x;
    let lastDragY = dragStart.y;

    const handleMouseMove = (e: MouseEvent) => {
      const currentDraggingGroupId = draggingGroupIdRef.current;
      if (!currentDraggingGroupId) return;

      const viewport = getViewport();
      const deltaX = (e.clientX - lastDragX) / viewport.zoom;
      const deltaY = (e.clientY - lastDragY) / viewport.zoom;

      // 只有实际移动时才更新
      if (Math.abs(deltaX) < 0.01 && Math.abs(deltaY) < 0.01) return;

      // 批量更新：先更新编组，再更新节点
      const currentGroup = nodeGroupsRef.current.find(g => g.id === currentDraggingGroupId);
      if (!currentGroup) return;

      // 使用函数式更新，避免闭包问题
      setNodeGroups(prev => {
        return prev.map(g => {
          if (g.id === currentDraggingGroupId) {
            return {
              ...g,
              bounds: {
                ...g.bounds,
                x: g.bounds.x + deltaX,
                y: g.bounds.y + deltaY,
              }
            };
          }
          return g;
        });
      });

      // 移动编组内的所有节点
      setNodes(nds => {
        return nds.map(node => {
          if (currentGroup.nodeIds.includes(node.id)) {
            return {
              ...node,
              position: {
                x: node.position.x + deltaX,
                y: node.position.y + deltaY,
              },
            };
          }
          return node;
        });
      });

      lastDragX = e.clientX;
      lastDragY = e.clientY;
    };

    const handleMouseUp = () => {
      setDraggingGroupId(null);
      setDragStart(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingGroupId, dragStart]);

  // 点击画布空白区域，缩略所有节点
  const handlePaneClick = useCallback((event: React.MouseEvent) => {
    // 如果处于文本标注模式，在点击位置插入文本框
    if (isTextAnnotationMode) {
      const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      insertTextAnnotationAt(flowPosition.x, flowPosition.y);
      return;
    }
    
    // 简单处理：点击空白处关闭菜单
    closeContextMenu();
    setConnectionMenu(null);
    pendingConnectionRef.current = null;
    setSelectedGroupId(null); // 取消选中编组
    connectionCompletedRef.current = false;
  }, [closeContextMenu, isTextAnnotationMode, screenToFlowPosition, insertTextAnnotationAt]);

  // 🚀 监听viewport变化，更新编组框位置（节流优化，避免频繁重渲染）
  const handleMoveThrottleRef = useRef<number | null>(null);
  const handleMove = useCallback(() => {
    if (nodeGroups.length > 0 && !handleMoveThrottleRef.current) {
      handleMoveThrottleRef.current = window.requestAnimationFrame(() => {
        setViewportKey(prev => prev + 1);
        handleMoveThrottleRef.current = null;
      });
    }
  }, [nodeGroups.length]);

  // 查找节点所属的编组
  const findGroupByNodeId = useCallback((nodeId: string): NodeGroup | null => {
    return nodeGroups.find(group => group.nodeIds.includes(nodeId)) || null;
  }, [nodeGroups]);

  // 节点开始拖动
  const handleNodeDragStart = useCallback((_event: React.MouseEvent, node: Node) => {
    if (isFrozenByStoryboard) return;
    if ((node as any)?.data?.freeDrag) return;
    const group = findGroupByNodeId(node.id);
    if (group) {
      // 非隐藏编组（用户手动创建的编组）只有所有者可以拖动
      if (!group.hidden && !isWorkflowOwner) return;
      draggedNodeIdRef.current = node.id;
      lastNodePositionRef.current = { x: node.position.x, y: node.position.y };
    }
  }, [findGroupByNodeId, isWorkflowOwner]);

  // 节点拖动中
  const handleNodeDrag = useCallback((_event: React.MouseEvent, node: Node) => {
    if (isFrozenByStoryboard) return;
    if ((node as any)?.data?.freeDrag) return;
    if (!lastNodePositionRef.current || draggedNodeIdRef.current !== node.id) return;

    const group = findGroupByNodeId(node.id);
    if (!group) return;

    // 检查是否是非隐藏编组（快速创作中的用户手动编组）
    const isNonHiddenGroup = !group.hidden;
    
    // 非隐藏编组只有所有者可以拖动
    if (isNonHiddenGroup && !isWorkflowOwner) return;
    
    if (isNonHiddenGroup) {
      // 非隐藏编组：拖动任意节点时移动整个编组
      const deltaX = node.position.x - lastNodePositionRef.current.x;
      const deltaY = node.position.y - lastNodePositionRef.current.y;
      
      // 先计算编组内所有节点的新位置
      const movedNodes: Array<{ id: string; position: { x: number; y: number } }> = [];
      const nodeIds = group.nodeIds || [];
      
      // 基于当前 nodesRef 计算新位置
      nodesRef.current.forEach(n => {
        if (nodeIds.includes(n.id)) {
          const newPosition = {
            x: n.id === node.id ? node.position.x : n.position.x + deltaX,
            y: n.id === node.id ? node.position.y : n.position.y + deltaY,
          };
          movedNodes.push({ id: n.id, position: newPosition });
        }
      });
      
      // 移动编组内所有节点
      setNodes(nds => nds.map(n => {
        const moved = movedNodes.find(m => m.id === n.id);
        return moved ? { ...n, position: moved.position } : n;
      }));
      
      // 广播编组内所有节点的位置变化给协作者
      if (movedNodes.length > 0) {
        emitNodesMove(movedNodes);
      }
      
      // 同时更新编组边界
      setNodeGroups(prev => {
        const updated = prev.map(g => {
          if (g.id === group.id) {
            return {
              ...g,
              bounds: {
                ...g.bounds,
                x: g.bounds.x + deltaX,
                y: g.bounds.y + deltaY,
              }
            };
          }
          return g;
        });
        // 更新 ref 以便在 handleNodeDragStop 中使用
        nodeGroupsRef.current = updated;
        return updated;
      });
      
      lastNodePositionRef.current = { x: node.position.x, y: node.position.y };
    } else {
      // 隐藏编组（分镜工作流）：限制节点拖拽在编组边界内
      const gx = group.bounds.x;
      const gy = group.bounds.y;
      const gw = group.bounds.width;
      const gh = group.bounds.height;
      const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(val, max));
      const clampedX = clamp(node.position.x, gx + 10, gx + gw - 10);
      const clampedY = clamp(node.position.y, gy + 10, gy + gh - 10);

      setNodes(nds => nds.map(n => n.id === node.id ? { ...n, position: { x: clampedX, y: clampedY } } : n));
      lastNodePositionRef.current = { x: clampedX, y: clampedY };
    }
  }, [setNodes, setNodeGroups, findGroupByNodeId, isWorkflowOwner, emitNodesMove]);

  // 节点拖动结束
  const handleNodeDragStop = useCallback(() => {
    // 自由拖动节点不参与编组拖拽状态
    draggedNodeIdRef.current = null;
    lastNodePositionRef.current = null;
    draggingGroupIdRef.current = null;
    draggedNodeIdRef.current = null;
    lastNodePositionRef.current = null;
    draggingGroupIdRef.current = null;
    setDraggingGroupId(null);
    
    // 拖动结束后广播最新的编组状态给协作者
    // 使用 ref 获取最新的编组状态
    if (nodeGroupsRef.current.length > 0) {
      emitGroupsUpdate(nodeGroupsRef.current);
    }
    // 已有自动定位，移除拖拽后的全局避让，保留用户排版自由
  }, [emitGroupsUpdate]);

  // 节点点击事件
  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const group = findGroupByNodeId(node.id);
    if (group) {
      setSelectedGroupId(group.id);
    }
  }, [findGroupByNodeId]);

  // 边连接合法性校验：禁止非智能体连接到 Midjourney 的文本输入
  useEffect(() => {
    if (edges.length === 0 || nodes.length === 0) return;
    const invalidEdges = edges.filter((e: any) => {
      const src = nodes.find((n) => n.id === e.source);
      const tgt = nodes.find((n) => n.id === e.target);
      return tgt?.type === 'midjourney' && e.targetHandle === 'text-input' && src?.type !== 'agent';
    });
    if (invalidEdges.length > 0) {
      setEdges((eds) => eds.filter((e) => !invalidEdges.some((ie) => ie.id === e.id)));
      toast.error('Midjourney 文本输入仅接受智能体节点的连接');
    }
  }, [edges, nodes, setEdges]);


  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-tiffany-500 mb-4"></div>
          <p className="text-text-dark-secondary">加载中...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="h-full flex items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-red-400 mb-3">warning</span>
          <p className="text-text-dark-secondary mb-2">项目数据未加载</p>
          <p className="text-text-dark-tertiary text-sm">请返回项目列表重试，或检查网络/登录状态</p>
        </div>
      </div>
    );
  }

  // 检查是否有选中2个及以上的节点
  const hasSelectedNode = nodes.filter(n => n.selected).length >= 2;
  // 检查是否选中了编组
  const isGroupSelected = !!selectedGroupId;

  return (
    <div className="h-screen w-screen flex bg-background-light dark:bg-background-dark">
      {/* React Flow Canvas - 三层结构：画布(底层) -> 编组框(中层) -> 节点和连线(顶层) */}
      <div ref={reactFlowWrapper} className="flex-1 relative overflow-hidden">
        {/* 只读模式指示器 */}
        {isReadOnly && (
          <div className="absolute top-0 left-0 right-0 z-[200] bg-amber-500/90 backdrop-blur-sm text-white py-2 px-4 flex items-center justify-center gap-2 shadow-lg">
            <span className="material-symbols-outlined text-lg">visibility</span>
            <span className="text-sm font-medium">
              {workflowOwner 
                ? `只读模式 - 来自 ${workflowOwner.nickname || '项目所有者'} 的共享内容` 
                : '只读模式 - 您只有查看权限，无法进行编辑操作'}
            </span>
          </div>
        )}

        {/* 左上角项目名称 - 与顶部按钮和分镜列表对齐 */}
        {project && (
          <div className={`absolute left-4 ${isReadOnly ? 'top-14' : 'top-5'} z-[100] h-11 flex items-center`}>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {isEpisodeWorkflow && episode
                ? `《${project.name}》第${episode.episodeNumber}集${!isShotWorkflow && sceneParam && shotParam ? ` 第${sceneParam}幕第${shotParam}镜` : ''}`
                : `《${project.name}》`
              }
            </h1>
          </div>
        )}

        {/* 左侧分镜列表（无背景，可滚动） - 在镜头工作流中隐藏 */}
        {!isShotWorkflow && nodeGroups.filter(g => g.scene !== undefined && g.shot !== undefined).length > 0 && (
          <div className="absolute left-4 top-20 bottom-4 z-[100] w-48 overflow-y-auto scrollbar-hide">
            <div className="space-y-2">
              {nodeGroups
                .filter(g => g.scene !== undefined && g.shot !== undefined)
                .sort((a, b) => {
                  if (a.scene !== b.scene) return (a.scene || 0) - (b.scene || 0);
                  return (a.shot || 0) - (b.shot || 0);
                })
                .map((group) => (
                  <button
                    key={group.id}
                    onClick={() => {
                      setSelectedGroupId(group.id);

                      // 定位到编组中心，并自动调整缩放以完整显示
                      const centerX = group.bounds.x + group.bounds.width / 2;
                      const centerY = group.bounds.y + group.bounds.height / 2;

                      // 获取视口容器尺寸
                      const container = reactFlowWrapper.current;
                      if (container) {
                        const viewportWidth = container.clientWidth;
                        const viewportHeight = container.clientHeight;

                        // 添加边距（20%）确保编组不会紧贴边缘
                        const padding = 0.2;
                        const availableWidth = viewportWidth * (1 - padding);
                        const availableHeight = viewportHeight * (1 - padding);

                        // 计算合适的缩放比例（取两个方向中较小的那个）
                        const zoomX = availableWidth / group.bounds.width;
                        const zoomY = availableHeight / group.bounds.height;
                        const optimalZoom = Math.min(zoomX, zoomY, 1.5); // 最大不超过1.5倍
                        const finalZoom = Math.max(optimalZoom, 0.3); // 最小不低于0.3倍

                        setCenter(centerX, centerY, { zoom: finalZoom, duration: 800 });
                      } else {
                        // 容器未准备好时使用默认缩放
                        setCenter(centerX, centerY, { zoom: 1, duration: 800 });
                      }
                    }}
                    className={`w-full px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${selectedGroupId === group.id
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600 dark:to-pink-600 text-white shadow-lg'
                      : 'bg-white/90 dark:bg-white/10 text-slate-800 dark:text-slate-300 hover:bg-white dark:hover:bg-white/20'
                      }`}
                  >
                    {group.name}
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* 虚拟滚动性能指标 - 暂时禁用 */}
        {false && nodes.length > 300 && (
          <div className="absolute top-5 right-5 z-[100] bg-gray-900/90 backdrop-blur-sm px-4 py-3 rounded-xl border border-gray-700 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-green-400 text-sm">speed</span>
              <div className="text-xs text-gray-300">
                <div className="font-medium">
                  渲染: <span className="text-green-400 font-bold">{nodes.length}</span>
                  <span className="text-gray-500"> / {nodes.length}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 顶部编组控制按钮 - 精致图标按钮 */}
        <div className={`absolute ${isReadOnly ? 'top-14' : 'top-5'} left-1/2 transform -translate-x-1/2 z-[100] flex gap-2`}>
          <button
            onClick={() => {
              if (isEpisodeWorkflow && projectId && episodeId) {
                // 如果是分镜工作流，返回时保持当前分镜视图
                const shotQuery = isShotWorkflow && sceneParam && shotParam ? `?shot=${shotParam}` : '';
                navigate(`/projects/${projectId}/episodes/${episodeId}${shotQuery}`);
              } else {
                navigate('/quick');
              }
            }}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 bg-white/90 dark:bg-gray-800/80 text-slate-800 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700/90 shadow-md hover:shadow-lg hover:scale-105`}
            title={isEpisodeWorkflow ? '返回剧集详情' : '返回项目列表'}
          >
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </button>
          {/* 以下按钮在只读模式下隐藏 */}
          {!isReadOnly && (
            <>
              {/* 编组相关按钮仅所有者可用 */}
              <button
                onClick={() => { if (!isFrozenByStoryboard && isWorkflowOwner) setIsSelectionMode(!isSelectionMode); }}
                disabled={isFrozenByStoryboard || !isWorkflowOwner}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 ${(isFrozenByStoryboard || !isWorkflowOwner)
                  ? 'bg-slate-200/50 dark:bg-gray-800/50 text-slate-400 dark:text-gray-500 cursor-not-allowed shadow-sm'
                  : (isSelectionMode
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600 dark:to-pink-600 text-white hover:shadow-lg shadow-md hover:scale-105'
                    : 'bg-white/90 dark:bg-gray-800/80 text-slate-800 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700/90 shadow-md hover:shadow-lg hover:scale-105')
                  }`}
                title={isWorkflowOwner ? "框选模式 (Shift+拖动)" : "仅所有者可使用"}
              >
                <span className="material-symbols-outlined text-xl">
                  {isSelectionMode ? 'check_box' : 'select_all'}
                </span>
              </button>
              <button
                onClick={() => { if (!isFrozenByStoryboard && isWorkflowOwner) createGroup(); }}
                disabled={isFrozenByStoryboard || !isWorkflowOwner || !hasSelectedNode}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 ${(isFrozenByStoryboard || !isWorkflowOwner)
                  ? 'bg-slate-200/50 dark:bg-gray-800/50 text-slate-400 dark:text-gray-500 cursor-not-allowed shadow-sm'
                  : (hasSelectedNode
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600 dark:to-pink-600 text-white hover:shadow-lg shadow-md hover:scale-105'
                    : 'bg-slate-200/50 dark:bg-gray-800/50 text-slate-400 dark:text-gray-500 cursor-not-allowed shadow-sm')
                  }`}
                title={isWorkflowOwner ? "创建编组 (需选中2个以上节点)" : "仅所有者可使用"}
              >
                <span className="material-symbols-outlined text-xl">group_work</span>
              </button>
              <button
                onClick={() => { if (!isFrozenByStoryboard && isWorkflowOwner) ungroupNodes(); }}
                disabled={isFrozenByStoryboard || !isWorkflowOwner || !isGroupSelected}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 ${(isFrozenByStoryboard || !isWorkflowOwner)
                  ? 'bg-slate-200/50 dark:bg-gray-800/50 text-slate-400 dark:text-gray-500 cursor-not-allowed shadow-sm'
                  : (isGroupSelected
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600 dark:to-pink-600 text-white hover:shadow-lg shadow-md hover:scale-105'
                    : 'bg-slate-200/50 dark:bg-gray-800/50 text-slate-400 dark:text-gray-500 cursor-not-allowed shadow-sm')
                  }`}
                title={isWorkflowOwner ? "解除编组" : "仅所有者可使用"}
              >
                <span className="material-symbols-outlined text-xl">group_off</span>
              </button>
              <button
                onClick={() => { if (!isFrozenByStoryboard && isWorkflowOwner) openNamingDialog(); }}
                disabled={isFrozenByStoryboard || !isWorkflowOwner || !isGroupSelected}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 ${(isFrozenByStoryboard || !isWorkflowOwner)
                  ? 'bg-slate-200/50 dark:bg-gray-800/50 text-slate-400 dark:text-gray-500 cursor-not-allowed shadow-sm'
                  : (isGroupSelected
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600 dark:to-pink-600 text-white hover:shadow-lg shadow-md hover:scale-105'
                    : 'bg-slate-200/50 dark:bg-gray-800/50 text-slate-400 dark:text-gray-500 cursor-not-allowed shadow-sm')
                  }`}
                title={isWorkflowOwner ? "命名编组" : "仅所有者可使用"}
              >
                <span className="material-symbols-outlined text-xl">edit</span>
              </button>
              <button
                onClick={() => toggleTextAnnotationMode()}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 ${isTextAnnotationMode
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600 dark:to-pink-600 text-white hover:shadow-lg shadow-md hover:scale-105'
                    : 'bg-white/90 dark:bg-gray-800/80 text-slate-800 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700/90 shadow-md hover:shadow-lg hover:scale-105'
                  }`}
                title={isTextAnnotationMode ? '点击画布插入文本（按 Esc 取消）' : '添加文本标注'}
              >
                <span className="material-symbols-outlined text-xl">text_fields</span>
              </button>
            </>
          )}
        </div>

        {/* 在线协作者头像 - 右上角 */}
        {isSharedWorkflow && onlineUsers.length > 0 && (
          <div className={`absolute ${isReadOnly ? 'top-14' : 'top-5'} right-5 z-[100] flex items-center gap-1`}>
            {/* 显示最多8个头像 */}
            <div className="flex gap-1">
              {onlineUsers.slice(0, 8).map((user) => (
                <div
                  key={user.id}
                  className="w-9 h-9 rounded-full border-2 border-white dark:border-gray-800 bg-purple-200 dark:bg-purple-800 flex items-center justify-center overflow-hidden shadow-sm"
                  title={user.nickname || '用户'}
                >
                  {user.avatar ? (
                    <img
                      src={user.avatar.startsWith('http') ? user.avatar : `${import.meta.env.VITE_API_URL || ''}${user.avatar}`}
                      alt={user.nickname || '用户'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="material-symbols-outlined text-sm text-purple-600 dark:text-purple-300">person</span>
                  )}
                </div>
              ))}
            </div>
            {/* 超过8人显示数字 */}
            {onlineUsers.length > 8 && (
              <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-medium text-slate-600 dark:text-slate-300 shadow-sm">
                +{onlineUsers.length - 8}
              </div>
            )}
          </div>
        )}

        {/* ReactFlow 画布（底层） */}
        <div className={`absolute inset-0 ${isSelectionMode ? 'cursor-crosshair' : ''} ${isTextAnnotationMode ? 'cursor-text' : ''}`} style={{ zIndex: 1 }}>
          <ReactFlow
            nodes={nodesWithPermission}
            edges={edges}
            onNodesChange={isReadOnly ? undefined : handleNodesChangeWithPermission}
            onEdgesChange={isReadOnly ? undefined : handleEdgesChangeWithPermission}
            onNodesDelete={isReadOnly ? undefined : handleNodesDeleteWithPermission}
            onEdgesDelete={isReadOnly ? undefined : handleEdgesDeleteWithPermission}
            onConnect={isReadOnly ? undefined : onConnect}
            onConnectStart={isReadOnly ? undefined : handleConnectStart}
            onConnectEnd={isReadOnly ? undefined : handleConnectEnd}
            onEdgeDoubleClick={isReadOnly ? undefined : onEdgeDoubleClick}
            onPaneContextMenu={isReadOnly ? undefined : onPaneContextMenu}
            onPaneClick={isReadOnly ? undefined : handlePaneClick}
            onMove={handleMove}
            onNodeClick={isReadOnly ? undefined : handleNodeClick}
            onNodeDragStart={isReadOnly ? undefined : handleNodeDragStart}
            onNodeDrag={isReadOnly ? undefined : handleNodeDrag}
            onNodeDragStop={isReadOnly ? undefined : handleNodeDragStop}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={true} // 由节点的 draggable 属性单独控制
            nodesConnectable={!isReadOnly}
            elementsSelectable={!isReadOnly}
            noDragClassName="nodrag"
            className={`bg-background-light dark:bg-background-dark ${isSelectionMode ? 'cursor-crosshair' : ''} ${isReadOnly ? 'readonly-workflow' : ''}`}
            minZoom={0.1}
            maxZoom={4}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            defaultEdgeOptions={{
              type: 'aurora',
              animated: false,
              style: { stroke: 'currentColor', strokeWidth: 2 },
            }}
            connectionLineType={'bezier' as any}
            connectionLineStyle={{
              stroke: '#a855f7',
              strokeWidth: 2,
              strokeLinecap: 'round' as const,
            }}
            selectionOnDrag={isReadOnly ? false : isSelectionMode}
            panOnDrag={!isSelectionMode ? [1, 0] : false}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            proOptions={{ hideAttribution: true }}
            // 🚀 性能优化
            elevateNodesOnSelect={false}
            elevateEdgesOnSelect={false}
          >
            {/* 移除背景网格，保留纯色画布 */}
            <Controls
              position="bottom-right"
              showInteractive={false}
            />
          </ReactFlow>
        </div>

        {/* 编组框层（顶层 - 边框可见） */}
        <div key={viewportKey} className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
          <svg className="w-full h-full">
            <defs>
              <linearGradient id="group-border-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="50%" stopColor="#d946ef" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
            </defs>
            {nodeGroups.filter((group) => !group.hidden).map((group) => {
              const viewport = getViewport();
              const x = group.bounds.x * viewport.zoom + viewport.x;
              const y = group.bounds.y * viewport.zoom + viewport.y;
              const width = group.bounds.width * viewport.zoom;
              const height = group.bounds.height * viewport.zoom;
              const radius = 12 * viewport.zoom;
              const borderWidth = Math.max(1.25, 1.25 * viewport.zoom);
              const isDark = document.documentElement.classList.contains('dark');
              const isSelected = selectedGroupId === group.id;

              return (
                <g key={group.id}>
                  {/* 编组框矩形 - 只有边框，无填充 */}
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    rx={radius}
                    ry={radius}
                    fill="none"
                    stroke={isSelected ? 'url(#group-border-gradient)' : (isDark ? '#e5e7eb' : '#4b5563')}
                    strokeWidth={borderWidth}
                    style={{
                      filter: isSelected
                        ? 'drop-shadow(0 0 20px rgba(168, 85, 247, 0.5))'
                        : 'drop-shadow(0 0 15px rgba(168, 85, 255, 0.3))',
                    }}
                  />
                  {/* 边框点击区域 - 可拖动（只有边框区域可点击，不遮挡节点） */}
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    rx={radius}
                    ry={radius}
                    fill="transparent"
                    stroke="transparent"
                    strokeWidth={borderWidth * 3}
                    style={{
                      pointerEvents: 'stroke',
                      cursor: draggingGroupId === group.id ? 'grabbing' : 'grab',
                    }}
                    onMouseDown={(e: any) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleGroupMouseDown(e, group.id);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedGroupId(group.id);
                    }}
                  />
                </g>
              );
            })}
          </svg>
        </div>

        {/* 编组名称标签层（最顶层 - 在边框上方） */}
        <div key={`labels-${viewportKey}`} className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
          {nodeGroups.filter((group) => !group.hidden).map((group) => {
            if (!group.name) return null;

            const viewport = getViewport();
            const x = group.bounds.x * viewport.zoom + viewport.x;
            const y = group.bounds.y * viewport.zoom + viewport.y;
            const fontSize = 40 * viewport.zoom;
            const padding = 10 * viewport.zoom; // 距离边框的固定距离
            const extraOffset = 15 * viewport.zoom; // 额外的向上偏移

            return (
              <div
                key={`label-${group.id}`}
                className="absolute font-bold whitespace-nowrap pointer-events-auto select-none text-slate-900 dark:text-white"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleGroupMouseDown(e, group.id);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedGroupId(group.id);
                }}
                style={{
                  left: x + padding,
                  top: y - fontSize - padding - extraOffset, // 移到边框上方，再往上一点
                  fontSize: `${fontSize}px`,
                  cursor: draggingGroupId === group.id ? 'grabbing' : 'grab',
                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
                }}
              >
                {group.name}
              </div>
            );
          })}
        </div>

        {/* 右键上下文菜单 */}
        {contextMenu && (
          <div
            className="fixed z-[200] bg-[#171718] dark:bg-[#171718] bg-[#fcfdfe] backdrop-blur-xl border border-white/10 dark:border-white/10 border-gray-200 rounded-lg shadow-2xl py-1 min-w-48"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <style>
              {`
                @keyframes submenuSlideDown { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
                .menu-icon { font-variation-settings: 'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 20; }
                button .text-sm, div .text-sm { font-weight: 400; }
              `}
            </style>

            {/* 智能体二级菜单 */}
            <div
              className="relative"
              onMouseEnter={() => {
                if (ctxSubmenuTimeoutRef.current) {
                  clearTimeout(ctxSubmenuTimeoutRef.current);
                  ctxSubmenuTimeoutRef.current = null;
                }
                setActiveCtxSubmenu('agent');
              }}
              onMouseLeave={() => {
                ctxSubmenuTimeoutRef.current = window.setTimeout(() => {
                  setActiveCtxSubmenu(null);
                }, 300);
              }}
            >
              <button
                onMouseEnter={() => setActiveCtxSubmenu('agent')}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setActiveCtxSubmenu('agent'); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveCtxSubmenu('agent'); }}
                className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center justify-between text-gray-900 dark:text-white"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">psychology</span>
                  <div className="text-sm">智能体</div>
                </div>
                <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">chevron_right</span>
              </button>

              {/* 智能体子菜单 */}
              {activeCtxSubmenu === 'agent' && (
                <div
                  onMouseEnter={() => {
                    if (ctxSubmenuTimeoutRef.current) {
                      clearTimeout(ctxSubmenuTimeoutRef.current);
                      ctxSubmenuTimeoutRef.current = null;
                    }
                    setActiveCtxSubmenu('agent');
                  }}
                  onMouseLeave={(e) => {
                    const parent = (e.currentTarget as HTMLElement).parentElement;
                    const rt = e.relatedTarget as HTMLElement | null;
                    if (!parent || !parent.contains(rt)) {
                      ctxSubmenuTimeoutRef.current = window.setTimeout(() => {
                        setActiveCtxSubmenu(null);
                      }, 300);
                    }
                  }}
                  className="absolute left-full top-0 bg-[#171718] dark:bg-[#171718] bg-[#fcfdfe] backdrop-blur-xl border border-white/10 dark:border-white/10 border-gray-200 rounded-lg shadow-2xl py-1 max-h-80 overflow-y-auto w-full"
                  style={{ animation: 'submenuSlideDown 0.18s ease-out' }}
                >
                  {agents.length > 0 ? (
                    agents.map((agent) => (
                      <button
                        key={agent.id}
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addNode('agent', agent.name, 'agent', agent.id, agent.name); }}
                        className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white"
                      >
                        <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">smart_toy</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{agent.name}</div>
                          {agent.description && (
                            <div className="text-xs text-purple-400 truncate">{agent.description}</div>
                          )}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-2 text-sm text-purple-400">
                      暂无可用智能体
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => addNode('image', '图片生成', 'aiImage')}
              className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white"
            >
              <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">image</span>
              <div className="text-sm">图片生成</div>
            </button>

            <div
              className="relative"
              onMouseEnter={() => {
                if (imageEditSubmenuTimeoutRef.current) {
                  clearTimeout(imageEditSubmenuTimeoutRef.current);
                  imageEditSubmenuTimeoutRef.current = null;
                }
                setShowImageEditSubmenu(true);
              }}
              onMouseLeave={() => {
                imageEditSubmenuTimeoutRef.current = window.setTimeout(() => {
                  setShowImageEditSubmenu(false);
                }, 200);
              }}
            >
              <button
                onMouseEnter={() => { setActiveCtxSubmenu('imageEdit'); }}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setActiveCtxSubmenu('imageEdit'); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveCtxSubmenu('imageEdit'); }}
                className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center justify-between text-gray-900 dark:text-white"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">tune</span>
                  <div className="text-sm">图片编辑</div>
                </div>
                <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">chevron_right</span>
              </button>
              {showImageEditSubmenu && (
                <div
                  onMouseEnter={() => {
                    if (imageEditSubmenuTimeoutRef.current) {
                      clearTimeout(imageEditSubmenuTimeoutRef.current);
                      imageEditSubmenuTimeoutRef.current = null;
                    }
                    setShowImageEditSubmenu(true);
                  }}
                  onMouseLeave={(e) => {
                    const parent = (e.currentTarget as HTMLElement).parentElement;
                    const rt = e.relatedTarget as HTMLElement | null;
                    if (!parent || !parent.contains(rt)) {
                      imageEditSubmenuTimeoutRef.current = window.setTimeout(() => {
                        setShowImageEditSubmenu(false);
                      }, 120);
                    }
                  }}
                  className="absolute left-full top-0 -ml-px bg-[#171718] dark:bg-[#171718] bg-[#fcfdfe] backdrop-blur-xl border border-white/10 dark:border-white/10 border-gray-200 rounded-lg shadow-2xl py-1 w-full max-h-none overflow-y-visible"
                  style={{ animation: 'submenuSlideLR 0.22s ease-out' }}
                >
                  <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addNode('image', '智能溶图', 'imageFusion'); }} className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white">
                    <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">auto_awesome</span>
                    <div className="text-sm">智能溶图</div>
                  </button>
                  <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addNode('image', '智能分镜', 'smartStoryboard'); }} className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white">
                    <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">grid_view</span>
                    <div className="text-sm">智能分镜</div>
                  </button>
                  <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addNode('image', '高清放大', 'hdUpscale'); }} className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white">
                    <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">high_quality</span>
                    <div className="text-sm">高清放大</div>
                  </button>
                  <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addNode('superCanvas', '自由画布', 'superCanvas'); }} className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white">
                    <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">brush</span>
                    <div className="text-sm">自由画布</div>
                  </button>
                </div>
              )}
            </div>

            <div
              className="relative"
              onMouseEnter={() => {
                if (videoSubmenuTimeoutRef.current) {
                  clearTimeout(videoSubmenuTimeoutRef.current);
                  videoSubmenuTimeoutRef.current = null;
                }
                setShowVideoSubmenu(true);
              }}
              onMouseLeave={() => {
                videoSubmenuTimeoutRef.current = window.setTimeout(() => {
                  setShowVideoSubmenu(false);
                }, 200);
              }}
            >
              <button
                onMouseEnter={() => { setActiveCtxSubmenu('video'); }}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setActiveCtxSubmenu('video'); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveCtxSubmenu('video'); }}
                className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center justify-between text-gray-900 dark:text-white"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">movie</span>
                  <div className="text-sm">视频生成</div>
                </div>
                <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">chevron_right</span>
              </button>
              {showVideoSubmenu && (
                <div
                  onMouseEnter={() => {
                    if (videoSubmenuTimeoutRef.current) {
                      clearTimeout(videoSubmenuTimeoutRef.current);
                      videoSubmenuTimeoutRef.current = null;
                    }
                    setShowVideoSubmenu(true);
                  }}
                  onMouseLeave={(e) => {
                    const parent = (e.currentTarget as HTMLElement).parentElement;
                    const rt = e.relatedTarget as HTMLElement | null;
                    if (!parent || !parent.contains(rt)) {
                      videoSubmenuTimeoutRef.current = window.setTimeout(() => {
                        setShowVideoSubmenu(false);
                      }, 120);
                    }
                  }}
                  className="absolute left-full top-0 -ml-px bg-[#171718] dark:bg-[#171718] bg-[#fcfdfe] backdrop-blur-xl border border-white/10 dark:border-white/10 border-gray-200 rounded-lg shadow-2xl py-1 w-full max-h-none overflow-y-visible"
                  style={{ animation: 'submenuSlideLR 0.22s ease-out' }}
                >
                  <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addNode('video', 'Sora2Video', 'soraVideo'); }} className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white">
                    <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">movie</span>
                    <div className="text-sm">Sora2Video</div>
                  </button>
                  <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addNode('video', 'Sora角色生成', 'soraCharacter'); }} className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white">
                    <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">face</span>
                    <div className="text-sm">Sora角色生成</div>
                  </button>
                  {supportedVideoTypes.has('文生视频') && (
                    <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addNode('video', '文生视频', 'aiVideo_t2v'); }} className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white">
                      <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">movie</span>
                      <div className="text-sm">文生视频</div>
                    </button>
                  )}
                  {supportedVideoTypes.has('首帧') && (
                    <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addNode('video', '图生视频（首帧）', 'aiVideo_i2v_first'); }} className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white">
                      <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">movie</span>
                      <div className="text-sm">图生视频（首帧）</div>
                    </button>
                  )}
                  {supportedVideoTypes.has('尾帧') && (
                    <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addNode('video', '图生视频（尾帧）', 'aiVideo_i2v_last'); }} className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white">
                      <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">movie</span>
                      <div className="text-sm">图生视频（尾帧）</div>
                    </button>
                  )}
                  {supportedVideoTypes.has('首尾帧') && (
                    <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addNode('video', '首尾帧生成', 'aiVideo_first_last'); }} className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white">
                      <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">movie</span>
                      <div className="text-sm">首尾帧生成</div>
                    </button>
                  )}
                  {(supportedVideoTypes.has('参考图') || supportedVideoTypes.has('视频换人')) && (
                    <>
                      <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addNode('video', '参考图生成', 'aiVideo_reference'); }} className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white">
                        <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">movie</span>
                        <div className="text-sm">参考图生成</div>
                      </button>
                      {supportedVideoTypes.has('视频换人') && (
                        <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addNode('video', '视频换人', 'aiVideo_swap', undefined, undefined, undefined, undefined, { selectedEditingCapability: '视频换人' }); }} className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white">
                          <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">movie</span>
                          <div className="text-sm">视频换人</div>
                        </button>
                      )}
                    </>
                  )}
                  
                  {/* 广告成片 */}
                  <button 
                    onMouseDown={(e) => { 
                      e.preventDefault(); 
                      e.stopPropagation(); 
                      addNode('video', '广告成片', 'commercialVideo'); 
                    }} 
                    className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white border-t border-white/5 dark:border-white/5 border-gray-200"
                  >
                    <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">featured_video</span>
                    <div className="text-sm">广告成片</div>
                  </button>
                </div>
              )}
            </div>

            <div
              className="relative"
              onMouseEnter={() => {
                if (ctxSubmenuTimeoutRef.current) {
                  clearTimeout(ctxSubmenuTimeoutRef.current);
                  ctxSubmenuTimeoutRef.current = null;
                }
                setActiveCtxSubmenu('edit');
              }}
              onMouseLeave={() => {
                ctxSubmenuTimeoutRef.current = window.setTimeout(() => {
                  setActiveCtxSubmenu(null);
                }, 300);
              }}
            >
              <button
                onMouseEnter={() => { setActiveCtxSubmenu('edit'); }}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setActiveCtxSubmenu('edit'); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveCtxSubmenu('edit'); }}
                className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center justify-between text-gray-900 dark:text-white"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">movie</span>
                  <div className="text-sm">视频编辑</div>
                </div>
                <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">chevron_right</span>
              </button>
              {activeCtxSubmenu === 'edit' && (
                <div
                  onMouseEnter={() => {
                    if (ctxSubmenuTimeoutRef.current) {
                      clearTimeout(ctxSubmenuTimeoutRef.current);
                      ctxSubmenuTimeoutRef.current = null;
                    }
                    setActiveCtxSubmenu('edit');
                  }}
                  onMouseLeave={(e) => {
                    const parent = (e.currentTarget as HTMLElement).parentElement;
                    const rt = e.relatedTarget as HTMLElement | null;
                    if (!parent || !parent.contains(rt)) {
                      ctxSubmenuTimeoutRef.current = window.setTimeout(() => {
                        setActiveCtxSubmenu(null);
                      }, 300);
                    }
                  }}
                  className="absolute left-full top-0 -ml-px bg-[#171718] dark:bg-[#171718] bg-[#fcfdfe] backdrop-blur-xl border border-white/10 dark:border-white/10 border-gray-200 rounded-lg shadow-2xl py-1 w-full max-h-none overflow-y-visible"
                  style={{ animation: 'submenuSlideLR 0.22s ease-out' }}
                >
                  {videoEditingCapabilities.filter((cap) => getModelsForEditingCapability(cap).length > 0).map((cap) => (
                    <button
                      key={cap}
                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); if (cap === '对口型') { addNode('video', '视频编辑·对口型', 'aiVideo_lipsync'); } else if (cap === '风格转换') { addNode('video', '视频编辑·风格转换', 'aiVideo_style'); } else { addNode('video', cap === '动作克隆' ? '动作克隆' : `视频编辑·${cap}`, 'aiVideo_swap', undefined, undefined, undefined, undefined, { selectedEditingCapability: cap }); } setShowVideoEditSubmenu(false); }}
                      className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white"
                    >
                      <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">movie_edit</span>
                      <div className="text-sm">{cap}</div>
                    </button>
                  ))}
                  
                  {videoEditingCapabilities.every((cap) => getModelsForEditingCapability(cap).length === 0) && (
                    <div className="px-4 py-2 text-sm text-purple-400">暂无支持视频编辑能力的模型</div>
                  )}
                </div>
              )}
            </div>

            <div className="h-px bg-white/10 my-1"></div>

            <button
              onClick={() => addNode('midjourney', 'Midjourney', 'midjourney')}
              className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white"
            >
              <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">auto_awesome</span>
              <div className="text-sm">Midjourney</div>
            </button>

            <div className="h-px bg-white/10 dark:bg-white/10 bg-gray-200 my-1"></div>

            <button
              onClick={() => addNode('upload', '上传素材', 'upload')}
              className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white"
            >
              <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">upload_file</span>
              <div className="text-sm">上传素材</div>
            </button>

            <button
              onClick={() => addNode('assetSelector', '资产选择器', 'assetSelector')}
              className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white"
            >
              <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">photo_library</span>
              <div className="text-sm">资产选择器</div>
            </button>

          </div>
        )}

        {/* 连接点拖动菜单 */}
        {connectionMenu && (
          <div
            className="fixed z-[200] bg-[#171718] dark:bg-[#171718] bg-[#fcfdfe] backdrop-blur-xl border border-white/10 dark:border-white/10 border-gray-200 rounded-lg shadow-2xl py-1 min-w-48"
            style={{ left: connectionMenu.x + 5, top: connectionMenu.y + 5 }}
          >

            {/* 智能体二级菜单 */}
            {connectionMenuFilters.showAgent && (
              <div
                className="relative"
                onMouseEnter={() => {
                  setActiveConnSubmenu(null);
                  if (connectionAgentSubmenuTimeoutRef.current) {
                    clearTimeout(connectionAgentSubmenuTimeoutRef.current);
                    connectionAgentSubmenuTimeoutRef.current = null;
                  }
                  setShowConnectionAgentSubmenu(true);
                }}
                onMouseLeave={() => {
                  connectionAgentSubmenuTimeoutRef.current = window.setTimeout(() => {
                    setShowConnectionAgentSubmenu(false);
                  }, 1200);
                }}
              >
                <button
                  onMouseEnter={() => setShowConnectionAgentSubmenu(true)}
                  onMouseLeave={() => setShowConnectionAgentSubmenu(false)}
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setShowConnectionAgentSubmenu(true); }}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowConnectionAgentSubmenu(true); }}
                  className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center justify-between text-gray-900 dark:text-white"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">psychology</span>
                    <div className="text-sm">智能体</div>
                  </div>
                  <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">chevron_right</span>
                </button>

                {/* 智能体子菜单 */}
                {showConnectionAgentSubmenu && (
                  <div
                    onMouseEnter={() => {
                      if (connectionAgentSubmenuTimeoutRef.current) {
                        clearTimeout(connectionAgentSubmenuTimeoutRef.current);
                        connectionAgentSubmenuTimeoutRef.current = null;
                      }
                      setShowConnectionAgentSubmenu(true);
                    }}
                    onMouseLeave={() => {
                      connectionAgentSubmenuTimeoutRef.current = window.setTimeout(() => {
                        setShowConnectionAgentSubmenu(false);
                      }, 300);
                    }}
                    className="absolute left-full top-0 -ml-px bg-[#171718] dark:bg-[#171718] bg-[#fcfdfe] backdrop-blur-xl border border-white/10 dark:border-white/10 border-gray-200 rounded-lg shadow-2xl py-1 min-w-48 max-h-80 overflow-y-auto"
                  >
                    {agents.length > 0 ? (
                      agents.map((agent) => (
                        <button
                          key={agent.id}
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); createNodeFromConnection('agent', agent.name, 'agent', agent.id, agent.name); }}
                          className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white"
                        >
                          <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">smart_toy</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate">{agent.name}</div>
                            {agent.description && (
                              <div className="text-xs text-purple-400 truncate">{agent.description}</div>
                            )}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-2 text-sm text-purple-400">
                        暂无可用智能体
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {connectionMenuFilters.showAiImage && (
              <button
                onMouseEnter={() => setActiveConnSubmenu(null)}
                onClick={() => createNodeFromConnection('aiImage', '图片生成', 'image')}
                className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white"
              >
                <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">image</span>
                <div className="text-sm">图片生成</div>
              </button>
            )}

            {connectionMenuFilters.showAiImage && (
              <div
                className="relative"
                onMouseEnter={() => {
                  if (connSubmenuTimeoutRef.current) {
                    clearTimeout(connSubmenuTimeoutRef.current);
                    connSubmenuTimeoutRef.current = null;
                  }
                  setActiveConnSubmenu('imageEdit');
                }}
                onMouseLeave={() => {
                  connSubmenuTimeoutRef.current = window.setTimeout(() => {
                    setActiveConnSubmenu(null);
                  }, 200);
                }}
              >
                <button
                  onMouseEnter={() => setActiveConnSubmenu('imageEdit')}
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setActiveConnSubmenu('imageEdit'); }}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveConnSubmenu('imageEdit'); }}
                  className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center justify-between text-gray-900 dark:text-white"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">tune</span>
                    <div className="text-sm">图片编辑</div>
                  </div>
                  <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">chevron_right</span>
                </button>
                {activeConnSubmenu === 'imageEdit' && (
                  <div
                    onMouseEnter={() => {
                      if (connSubmenuTimeoutRef.current) {
                        clearTimeout(connSubmenuTimeoutRef.current);
                        connSubmenuTimeoutRef.current = null;
                      }
                      setActiveConnSubmenu('imageEdit');
                    }}
                    onMouseLeave={(e) => {
                      const parent = (e.currentTarget as HTMLElement).parentElement;
                      const rt = e.relatedTarget as HTMLElement | null;
                      if (!parent || !parent.contains(rt)) {
                        connSubmenuTimeoutRef.current = window.setTimeout(() => {
                          setActiveConnSubmenu(null);
                        }, 120);
                      }
                    }}
                    className="absolute left-full top-0 -ml-px bg-[#171718] dark:bg-[#171718] bg-[#fcfdfe] backdrop-blur-xl border border-white/10 dark:border-white/10 border-gray-200 rounded-lg shadow-2xl py-1 min-w-48"
                    style={{ animation: 'submenuSlideLR 0.22s ease-out' }}
                  >
                    <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); createNodeFromConnection('imageFusion', '智能溶图', 'image'); }} className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white">
                      <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">auto_awesome</span>
                      <div className="text-sm">智能溶图</div>
                    </button>
                    <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); createNodeFromConnection('smartStoryboard', '智能分镜', 'image'); }} className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white">
                      <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">grid_view</span>
                      <div className="text-sm">智能分镜</div>
                    </button>
                    <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); createNodeFromConnection('hdUpscale', '高清放大', 'image'); }} className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white">
                      <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">high_quality</span>
                      <div className="text-sm">高清放大</div>
                    </button>
                  </div>
                )}
              </div>
            )}

            {connectionMenuFilters.showVideo && (
              <div
                className="relative"
                onMouseEnter={() => {
                  if (connSubmenuTimeoutRef.current) {
                    clearTimeout(connSubmenuTimeoutRef.current);
                    connSubmenuTimeoutRef.current = null;
                  }
                  setActiveConnSubmenu('video');
                }}
                onMouseLeave={() => {
                  connSubmenuTimeoutRef.current = window.setTimeout(() => {
                    setActiveConnSubmenu(null);
                  }, 200);
                }}
              >
                <button
                  onMouseEnter={() => setActiveConnSubmenu('video')}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center justify-between text-gray-900 dark:text-white"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">movie</span>
                    <div className="text-sm">视频生成</div>
                  </div>
                  <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">chevron_right</span>
                </button>
                {activeConnSubmenu === 'video' && (
                  <div
                    onMouseEnter={() => {
                      if (connSubmenuTimeoutRef.current) {
                        clearTimeout(connSubmenuTimeoutRef.current);
                        connSubmenuTimeoutRef.current = null;
                      }
                      setActiveConnSubmenu('video');
                    }}
                    onMouseLeave={(e) => {
                      const parent = (e.currentTarget as HTMLElement).parentElement;
                      const rt = e.relatedTarget as HTMLElement | null;
                      if (!parent || !parent.contains(rt)) {
                        connSubmenuTimeoutRef.current = window.setTimeout(() => {
                          setActiveConnSubmenu(null);
                        }, 120);
                      }
                    }}
                    className="absolute left-full top-0 -ml-px bg-[#171718] dark:bg-[#171718] bg-[#fcfdfe] backdrop-blur-xl border border-white/10 dark:border-white/10 border-gray-200 rounded-lg shadow-2xl py-1 w-full max-h-none overflow-y-visible"
                  >
                    <button
                      onClick={() => createNodeFromConnection('soraVideo', 'Sora2Video', 'video')}
                      className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white"
                    >
                      <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">movie</span>
                      <div className="text-sm">Sora2Video</div>
                    </button>
                    {supportedVideoTypes.has('文生视频') && (
                      <button
                        onClick={() => createNodeFromConnection('aiVideo_t2v', '文生视频', 'video')}
                        className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white"
                      >
                        <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">movie</span>
                        <div className="text-sm">文生视频</div>
                      </button>
                    )}
                    {supportedVideoTypes.has('首帧') && (
                      <button
                        onClick={() => createNodeFromConnection('aiVideo_i2v_first', '图生视频（首帧）', 'video')}
                        className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white"
                      >
                        <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">movie</span>
                        <div className="text-sm">图生视频（首帧）</div>
                      </button>
                    )}
                    {supportedVideoTypes.has('尾帧') && (
                      <button
                        onClick={() => createNodeFromConnection('aiVideo_i2v_last', '图生视频（尾帧）', 'video')}
                        className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white"
                      >
                        <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">movie</span>
                        <div className="text-sm">图生视频（尾帧）</div>
                      </button>
                    )}
                    {supportedVideoTypes.has('首尾帧') && (
                      <button
                        onClick={() => createNodeFromConnection('aiVideo_first_last', '首尾帧生成', 'video')}
                        className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover-bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white"
                      >
                        <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">movie</span>
                        <div className="text-sm">首尾帧生成</div>
                      </button>
                    )}
                    {(supportedVideoTypes.has('参考图') || supportedVideoTypes.has('视频换人')) && (
                      <>
                        <button
                          onClick={() => createNodeFromConnection('aiVideo_reference', '参考图生成', 'video')}
                          className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white"
                        >
                          <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">movie</span>
                          <div className="text-sm">参考图生成</div>
                        </button>
                        {supportedVideoTypes.has('视频换人') && (
                          <button
                            onClick={() => createNodeFromConnection('aiVideo_swap', '视频换人', 'video', undefined, undefined, { selectedEditingCapability: '视频换人' })}
                            className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white"
                          >
                            <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">movie</span>
                            <div className="text-sm">视频换人</div>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 视频编辑二级菜单 */}
            {connectionMenuFilters.showEdit && (
            <div
              className="relative"
              onMouseEnter={() => {
                setActiveConnSubmenu(null);
                if (connectionEditSubmenuTimeoutRef.current) {
                  clearTimeout(connectionEditSubmenuTimeoutRef.current);
                  connectionEditSubmenuTimeoutRef.current = null;
                }
                setShowVideoEditSubmenu(true);
              }}
              onMouseLeave={() => {
                connectionEditSubmenuTimeoutRef.current = window.setTimeout(() => {
                  setShowVideoEditSubmenu(false);
                }, 1800);
              }}
            >
              <button
                onMouseEnter={() => setShowVideoEditSubmenu(true)}
                onMouseLeave={() => setShowVideoEditSubmenu(false)}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowVideoEditSubmenu(true); }}
                onMouseOver={() => setActiveConnSubmenu(null)}
                className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center justify-between text-gray-900 dark:text-white"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">movie_edit</span>
                  <div className="text-sm">视频编辑</div>
                </div>
                <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">chevron_right</span>
              </button>
              {showVideoEditSubmenu && (
                <div
                  onMouseEnter={() => {
                    if (connectionEditSubmenuTimeoutRef.current) {
                      clearTimeout(connectionEditSubmenuTimeoutRef.current);
                      connectionEditSubmenuTimeoutRef.current = null;
                    }
                    setShowVideoEditSubmenu(true);
                  }}
                  onMouseLeave={(e) => {
                    const parent = (e.currentTarget as HTMLElement).parentElement;
                    const rt = e.relatedTarget as HTMLElement | null;
                    if (!parent || !parent.contains(rt)) {
                      connectionEditSubmenuTimeoutRef.current = window.setTimeout(() => {
                        setShowVideoEditSubmenu(false);
                      }, 300);
                    }
                  }}
                  className="absolute left-full top-0 -ml-px bg-[#171718] dark:bg-[#171718] bg-[#fcfdfe] backdrop-blur-xl border border-white/10 dark:border-white/10 border-gray-200 rounded-lg shadow-2xl py-1 w-full max-h-none overflow-y-visible"
                >
                  {videoEditingCapabilities.filter((cap) => getModelsForEditingCapability(cap).length > 0).map((cap) => (
                    <button
                      key={`conn-${cap}`}
                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); if (cap === '对口型') { createNodeFromConnection('aiVideo_lipsync', '视频编辑·对口型', 'video'); } else if (cap === '风格转换') { createNodeFromConnection('aiVideo_style', '视频编辑·风格转换', 'video'); } else { createNodeFromConnection('aiVideo_swap', cap === '动作克隆' ? '动作克隆' : `视频编辑·${cap}`, 'video'); } setShowVideoEditSubmenu(false); }}
                      className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white"
                    >
                      <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">movie_edit</span>
                      <div className="text-sm">{cap}</div>
                    </button>
                  ))}
                  
                  {videoEditingCapabilities.every((cap) => getModelsForEditingCapability(cap).length === 0) && (
                    <div className="px-4 py-2 text-sm text-purple-400">暂无支持视频编辑能力的模型</div>
                  )}
                </div>
              )}
            </div>
            )}

            <div className="h-px bg-white/10 dark:bg-white/10 bg-gray-200 my-1"></div>

            {connectionMenuFilters.showMidjourney && (
              <button
                onMouseEnter={() => setActiveConnSubmenu(null)}
                onClick={() => createNodeFromConnection('midjourney', 'Midjourney', 'midjourney')}
                className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white"
              >
                <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">auto_awesome</span>
                <div className="text-sm">Midjourney</div>
              </button>
            )}

            <div className="h-px bg-white/10 dark:bg-white/10 bg-gray-200 my-1"></div>

            {connectionMenuFilters.showUpload && (
              <button
                onMouseEnter={() => setActiveConnSubmenu(null)}
                onClick={() => createNodeFromConnection('upload', '上传素材', 'upload')}
                className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white"
              >
                <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">upload_file</span>
                <div className="text-sm">上传素材</div>
              </button>
            )}

            {connectionMenuFilters.showAssetSelector && (
              <button
                onMouseEnter={() => setActiveConnSubmenu(null)}
                onClick={() => createNodeFromConnection('assetSelector', '资产选择器', 'assetSelector')}
                className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white"
              >
                <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">photo_library</span>
                <div className="text-sm">资产选择器</div>
              </button>
            )}

            {connectionMenuFilters.showSuperCanvas && (
              <button
                onMouseEnter={() => setActiveConnSubmenu(null)}
                onClick={() => createNodeFromConnection('superCanvas', '自由画布', 'superCanvas')}
                className="w-full px-4 py-2 text-left hover:bg-white/5 dark:hover:bg-white/5 hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-900 dark:text-white"
              >
                <span className="material-symbols-outlined menu-icon text-sm text-gray-400 dark:text-gray-400 text-gray-600">brush</span>
                <div className="text-sm">自由画布</div>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 资产库面板 */}
      <AssetLibraryPanel
        isOpen={isAssetPanelOpen}
        onClose={() => {
          setIsAssetPanelOpen(false);
          setActiveAssetSelectorNodeId(null);
        }}
        onAssetSelect={handleAssetSelectFromPanel}
      />

      {/* 命名编组对话框 */}
      {showNamingDialog && namingGroupId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowNamingDialog(false)}>
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6 w-96 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 dark:text-text-dark-primary mb-4">命名编组</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-600 dark:text-text-dark-secondary mb-2">第几幕</label>
                <input
                  type="number"
                  min="1"
                  placeholder="输入幕数（整数）"
                  id="scene-input"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-text-dark-primary focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 dark:text-text-dark-secondary mb-2">第几镜</label>
                <input
                  type="number"
                  min="1"
                  placeholder="输入镜数（整数）"
                  id="shot-input"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-text-dark-primary focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowNamingDialog(false)}
                  className="flex-1 px-4 py-2 bg-slate-200 dark:bg-gray-600 hover:bg-slate-300 dark:hover:bg-gray-700 text-slate-800 dark:text-white rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    const sceneInput = document.getElementById('scene-input') as HTMLInputElement;
                    const shotInput = document.getElementById('shot-input') as HTMLInputElement;
                    const scene = parseInt(sceneInput?.value || '0');
                    const shot = parseInt(shotInput?.value || '0');

                    if (scene > 0 && shot > 0) {
                      // 检查是否已存在相同的命名（排除当前编组）
                      const existingGroup = nodeGroups.find(g =>
                        g.id !== namingGroupId && g.scene === scene && g.shot === shot
                      );

                      if (existingGroup) {
                        toast.error(`已存在相同的编组名称：第${scene}幕-第${shot}镜`);
                        return;
                      }

                      setNodeGroups(prev => {
                        const updated = prev.map(g =>
                          g.id === namingGroupId
                            ? { ...g, scene, shot, name: `第${scene}幕-第${shot}镜` }
                            : g
                        );

                        // 更新节点上下文信息
                        const namedGroup = updated.find(g => g.id === namingGroupId);
                        if (namedGroup) {
                          setNodes(nds => {
                            // 获取所有从编组内节点输出的预览节点
                            const previewNodeIds = new Set<string>();
                            edges.forEach(edge => {
                              if (namedGroup.nodeIds.includes(edge.source)) {
                                const targetNode = nds.find(n => n.id === edge.target);
                                if (targetNode && (targetNode.type === 'imagePreview' || targetNode.type === 'videoPreview')) {
                                  previewNodeIds.add(edge.target);
                                }
                              }
                            });

                            // 更新编组内节点和相关预览节点的上下文
                            return nds.map(node => {
                              if (namedGroup.nodeIds.includes(node.id) || previewNodeIds.has(node.id)) {
                                return {
                                  ...node,
                                  data: {
                                    ...node.data,
                                    workflowContext: {
                                      ...node.data.workflowContext,
                                      nodeGroup: namedGroup,
                                      nodeGroups: updated,
                                    },
                                  },
                                };
                              }
                              return node;
                            });
                          });
                        }

                        // 命名后立即保存（不等待防抖）
                        setTimeout(() => {
                          autoSave();
                        }, 100);
                        return updated;
                      });
                      setShowNamingDialog(false);
                      setNamingGroupId(null);
                      toast.success(`已命名为：第${scene}幕-第${shot}镜`);
                    } else {
                      toast.error('请输入有效的幕数和镜数（大于0的整数）');
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600 dark:to-pink-600 hover:shadow-lg text-white rounded-lg transition-all"
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const WorkflowEditorPage = () => {
  return (
    <ReactFlowProvider>
      <WorkflowUsersProvider>
        <WorkflowEditorInner />
      </WorkflowUsersProvider>
    </ReactFlowProvider>
  );
};

export default WorkflowEditorPage;
