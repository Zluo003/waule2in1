/**
 * Node.js 原生集群模式
 * 充分利用多核 CPU 提升并发性能
 */
import cluster from 'cluster';
import os from 'os';

// 使用 CPU 核心数的 1/4（至少 1 个，最多 4 个进程）
const numCPUs = Math.min(Math.max(Math.floor(os.cpus().length / 4), 1), 4);

// 获取本机 IP
function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

if (cluster.isPrimary) {
  const localIP = getLocalIP();
  const port = process.env.PORT || 3002;

  console.log(`[Cluster] 主进程 ${process.pid} 启动`);
  console.log(`[Cluster] 启动 ${numCPUs} 个工作进程...`);
  console.log(`[Cluster] 服务地址: http://${localIP}:${port}`);

  // 启动工作进程（第一个 worker 负责心跳）
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork(i === 0 ? { HEARTBEAT_WORKER: 'true' } : {});
  }

  // 工作进程退出时自动重启
  cluster.on('exit', (worker, code, signal) => {
    console.log(`[Cluster] 工作进程 ${worker.process.pid} 退出 (code: ${code}, signal: ${signal})`);
    console.log('[Cluster] 正在重启工作进程...');
    cluster.fork();
  });

  cluster.on('online', (worker) => {
    console.log(`[Cluster] 工作进程 ${worker.process.pid} 已上线`);
  });
} else {
  // 工作进程启动服务
  require('./index');
}
