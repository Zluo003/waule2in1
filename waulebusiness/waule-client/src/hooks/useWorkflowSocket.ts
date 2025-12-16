import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Node, Edge } from 'reactflow';
import { useAuthStore } from '../store/authStore';
import { useTenantAuthStore } from '../store/tenantAuthStore';

// Socket.io 需要连接到服务器根地址（不是 /api）
const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

// 在线用户信息
interface OnlineUser {
  id: string;
  nickname?: string;
  avatar?: string;
  joinedAt?: string;
}

interface WorkflowSocketOptions {
  workflowId: string | null;
  isSharedWorkflow: boolean;
  isReadOnly: boolean;
  onNodeAdd?: (node: Node, userId: string) => void;
  onNodeUpdate?: (nodeId: string, changes: any, userId: string) => void;
  onNodeDelete?: (nodeId: string, userId: string) => void;
  onNodeMove?: (nodeId: string, position: { x: number; y: number }, userId: string) => void;
  onNodesMove?: (nodes: Array<{ id: string; position: { x: number; y: number } }>, userId: string) => void;
  onEdgeAdd?: (edge: Edge, userId: string) => void;
  onEdgeDelete?: (edgeId: string, userId: string) => void;
  onGroupsUpdate?: (groups: any[], userId: string) => void;
  onUserJoin?: (user: { id: string; nickname?: string; avatar?: string }) => void;
}

interface WorkflowSocketReturn {
  isConnected: boolean;
  onlineUsers: OnlineUser[];
  emitNodeAdd: (node: Node) => void;
  emitNodeUpdate: (nodeId: string, changes: any) => void;
  emitNodeDelete: (nodeId: string) => void;
  emitNodeMove: (nodeId: string, position: { x: number; y: number }) => void;
  emitNodesMove: (nodes: Array<{ id: string; position: { x: number; y: number } }>) => void;
  emitEdgeAdd: (edge: Edge) => void;
  emitEdgeDelete: (edgeId: string) => void;
  emitGroupsUpdate: (groups: any[]) => void;
}

/**
 * 工作流实时协作 Socket Hook
 * 仅在共享工作流中启用，用于实时同步节点和边的变更
 */
export function useWorkflowSocket(options: WorkflowSocketOptions): WorkflowSocketReturn {
  const {
    workflowId,
    isSharedWorkflow,
    isReadOnly,
    onNodeAdd,
    onNodeUpdate,
    onNodeDelete,
    onNodeMove,
    onNodesMove,
    onEdgeAdd,
    onEdgeDelete,
    onGroupsUpdate,
    onUserJoin,
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const isConnectedRef = useRef(false);
  const { token: platformToken } = useAuthStore();
  const { token: tenantToken } = useTenantAuthStore();
  // 优先使用租户版 token，其次平台版 token
  const token = tenantToken || platformToken;
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);

  // 连接和断开逻辑
  useEffect(() => {
    // 仅共享工作流才连接
    if (!isSharedWorkflow || !workflowId || !token) {
      return;
    }

    console.log('[Socket] 正在连接...', { workflowId, isReadOnly });

    // 创建 Socket 连接
    const socket = io(API_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    // 连接成功
    socket.on('connect', () => {
      console.log('[Socket] 已连接:', socket.id, '工作流:', workflowId);
      isConnectedRef.current = true;
      
      // 加入工作流房间
      console.log('[Socket] 加入工作流房间:', workflowId);
      socket.emit('join-workflow', workflowId);
      socket.emit('user:join', { workflowId });
    });
    
    // 服务器错误
    socket.on('error', (data: { message: string }) => {
      console.error('[Socket] 服务器错误:', data.message);
    });

    // 连接断开
    socket.on('disconnect', (reason) => {
      console.log('[Socket] 已断开:', reason);
      isConnectedRef.current = false;
    });

    // 连接错误
    socket.on('connect_error', (error) => {
      console.error('[Socket] 连接错误:', error.message);
    });

    // ========== 监听协作事件 ==========

    // 节点添加
    socket.on('node:add', (data: { node: Node; userId: string }) => {
      console.log('[Socket] 收到 node:add:', data.node.id);
      onNodeAdd?.(data.node, data.userId);
    });

    // 节点更新
    socket.on('node:update', (data: { nodeId: string; changes: any; userId: string }) => {
      console.log('[Socket] 收到 node:update:', data.nodeId);
      onNodeUpdate?.(data.nodeId, data.changes, data.userId);
    });

    // 节点删除
    socket.on('node:delete', (data: { nodeId: string; userId: string }) => {
      console.log('[Socket] 收到 node:delete:', data.nodeId);
      onNodeDelete?.(data.nodeId, data.userId);
    });

    // 节点移动
    socket.on('node:move', (data: { nodeId: string; position: { x: number; y: number }; userId: string }) => {
      onNodeMove?.(data.nodeId, data.position, data.userId);
    });

    // 批量节点移动
    socket.on('nodes:move', (data: { nodes: Array<{ id: string; position: { x: number; y: number } }>; userId: string }) => {
      onNodesMove?.(data.nodes, data.userId);
    });

    // 边添加
    socket.on('edge:add', (data: { edge: Edge; userId: string }) => {
      console.log('[Socket] 收到 edge:add:', data.edge.id);
      onEdgeAdd?.(data.edge, data.userId);
    });

    // 边删除
    socket.on('edge:delete', (data: { edgeId: string; userId: string }) => {
      console.log('[Socket] 收到 edge:delete:', data.edgeId);
      onEdgeDelete?.(data.edgeId, data.userId);
    });

    // 编组更新
    socket.on('groups:update', (data: { groups: any[]; userId: string }) => {
      console.log('[Socket] 收到 groups:update:', data.groups.length, '个编组');
      onGroupsUpdate?.(data.groups, data.userId);
    });

    // 用户加入
    socket.on('user:join', (data: { user: { id: string; nickname?: string; avatar?: string } | null }) => {
      if (!data.user) {
        console.warn('[Socket] 收到 user:join 但 user 为空');
        return;
      }
      console.log('[Socket] 用户加入:', data.user.nickname || data.user.id);
      onUserJoin?.(data.user);
    });

    // 在线用户列表更新
    socket.on('users:online', (data: { users: OnlineUser[] }) => {
      console.log('[Socket] 在线用户更新:', data.users.length, '人', data.users.map(u => u.nickname || u.id));
      setOnlineUsers(data.users);
    });
    
    // 加入房间成功确认
    socket.on('joined-workflow', (data: { workflowId: string }) => {
      console.log('[Socket] 成功加入工作流房间:', data.workflowId);
    });

    // 清理
    return () => {
      console.log('[Socket] 断开连接');
      if (socketRef.current) {
        socketRef.current.emit('leave-workflow', workflowId);
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      isConnectedRef.current = false;
      setOnlineUsers([]);
    };
  }, [workflowId, isSharedWorkflow, token]);

  // ========== 发送事件方法 ==========

  const emitNodeAdd = useCallback((node: Node) => {
    if (socketRef.current && isConnectedRef.current && workflowId && !isReadOnly) {
      socketRef.current.emit('node:add', { workflowId, node });
    }
  }, [workflowId, isReadOnly]);

  const emitNodeUpdate = useCallback((nodeId: string, changes: any) => {
    if (socketRef.current && isConnectedRef.current && workflowId && !isReadOnly) {
      socketRef.current.emit('node:update', { workflowId, nodeId, changes });
    }
  }, [workflowId, isReadOnly]);

  const emitNodeDelete = useCallback((nodeId: string) => {
    if (socketRef.current && isConnectedRef.current && workflowId && !isReadOnly) {
      socketRef.current.emit('node:delete', { workflowId, nodeId });
    }
  }, [workflowId, isReadOnly]);

  const emitNodeMove = useCallback((nodeId: string, position: { x: number; y: number }) => {
    if (socketRef.current && isConnectedRef.current && workflowId && !isReadOnly) {
      socketRef.current.emit('node:move', { workflowId, nodeId, position });
    }
  }, [workflowId, isReadOnly]);

  const emitNodesMove = useCallback((nodes: Array<{ id: string; position: { x: number; y: number } }>) => {
    if (socketRef.current && isConnectedRef.current && workflowId && !isReadOnly) {
      socketRef.current.emit('nodes:move', { workflowId, nodes });
    }
  }, [workflowId, isReadOnly]);

  const emitEdgeAdd = useCallback((edge: Edge) => {
    if (socketRef.current && isConnectedRef.current && workflowId && !isReadOnly) {
      socketRef.current.emit('edge:add', { workflowId, edge });
    }
  }, [workflowId, isReadOnly]);

  const emitEdgeDelete = useCallback((edgeId: string) => {
    if (socketRef.current && isConnectedRef.current && workflowId && !isReadOnly) {
      socketRef.current.emit('edge:delete', { workflowId, edgeId });
    }
  }, [workflowId, isReadOnly]);

  const emitGroupsUpdate = useCallback((groups: any[]) => {
    if (socketRef.current && isConnectedRef.current && workflowId && !isReadOnly) {
      console.log('[Socket] 发送 groups:update:', groups.length, '个编组');
      socketRef.current.emit('groups:update', { workflowId, groups });
    }
  }, [workflowId, isReadOnly]);

  return {
    isConnected: isConnectedRef.current,
    onlineUsers,
    emitNodeAdd,
    emitNodeUpdate,
    emitNodeDelete,
    emitNodeMove,
    emitNodesMove,
    emitEdgeAdd,
    emitEdgeDelete,
    emitGroupsUpdate,
  };
}
