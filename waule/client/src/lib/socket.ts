import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { toast } from 'sonner';

// Socket.io 客户端实例
let socket: Socket | null = null;

// 获取或创建 Socket 连接
export const getSocket = (): Socket => {
  if (!socket) {
    // 使用当前页面的origin，通过Vite代理连接到后端
    // 这样无论是localhost还是局域网IP访问都能正确连接
    const serverUrl = window.location.origin;
    
    console.log('[Socket] 创建连接到:', serverUrl);
    socket = io(serverUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      path: '/socket.io', // 确保路径正确，通过Vite代理
      auth: (cb) => {
        // 每次连接时动态获取最新 token
        const token = useAuthStore.getState().token;
        cb({ token });
      },
    });
    
    socket.on('connect', () => {
      console.log('[Socket] 已连接, socket.id:', socket?.id);
    });
    
    socket.on('disconnect', () => {
      console.log('[Socket] 已断开');
    });
    
    socket.on('connect_error', (err) => {
      console.error('[Socket] 连接错误:', err.message);
    });
    
    // 🔒 单点登录：监听强制退出事件
    socket.on('force-logout', (data: { reason: string }) => {
      console.log('[Socket] 收到强制退出事件:', data.reason);
      useAuthStore.getState().clearAuth();
      toast.error(data.reason || '您的账号已在其他设备登录');
      window.location.href = '/login';
    });
  }
  return socket;
};

// 连接 Socket
export const connectSocket = (): void => {
  const token = useAuthStore.getState().token;
  if (!token) {
    console.log('[Socket] 未登录，跳过连接');
    return;
  }
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
};

// 断开 Socket
export const disconnectSocket = (): void => {
  if (socket?.connected) {
    socket.disconnect();
  }
};

// 加入工作流房间（协作者用于接收更新）
export const joinWorkflow = (workflowId: string): void => {
  const s = getSocket();
  connectSocket();
  console.log('[Socket] 加入工作流房间:', workflowId);
  s.emit('join-workflow', workflowId);
};

// 离开工作流房间
export const leaveWorkflow = (workflowId: string): void => {
  const s = getSocket();
  console.log('[Socket] 离开工作流房间:', workflowId);
  s.emit('leave-workflow', workflowId);
};

// 广播工作流更新信号（所有者使用）
export const broadcastWorkflowUpdate = (workflowId: string): void => {
  const s = getSocket();
  connectSocket();
  console.log('[Socket] 广播工作流更新:', workflowId);
  s.emit('workflow-updated', workflowId);
};

// 监听工作流更新事件（协作者使用）
export const onWorkflowChanged = (callback: (data: { workflowId: string }) => void): void => {
  const s = getSocket();
  console.log('[Socket] 开始监听 workflow-changed 事件');
  s.on('workflow-changed', (data) => {
    console.log('[Socket] 收到 workflow-changed 事件:', data);
    callback(data);
  });
};

// 移除工作流更新监听
export const offWorkflowChanged = (callback?: (data: { workflowId: string }) => void): void => {
  const s = getSocket();
  if (callback) {
    s.off('workflow-changed', callback);
  } else {
    s.off('workflow-changed');
  }
};
