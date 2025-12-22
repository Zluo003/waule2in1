module.exports = {
  apps: [
    {
      name: 'waule-server',
      cwd: './server',
      script: 'dist/index.js',
      // 🚀 集群模式：4核CPU，前端用Nginx静态，waule-api(Docker)占1核，剩余3核给后端
      instances: 3,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Shanghai',
      },
      // 🔧 内存管理优化：3实例 x 1.5GB = 4.5GB，留足系统和其他服务空间
      max_memory_restart: '1500M',  // 单实例超过 1500M 自动重启
      node_args: '--max-old-space-size=1400 --expose-gc',  // 限制堆内存 1400MB，暴露 GC 供手动调用
      // 🔄 优雅重启
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      // 📊 日志配置
      error_file: './logs/server-error.log',
      out_file: './logs/server-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // 🛡️ 稳定性保护
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 1000,
      // 📈 监控
      exp_backoff_restart_delay: 100,
    },
    // 注：前端使用 Nginx 静态代理，Midjourney 服务已迁移到 waule-api (Docker)
  ]
};
