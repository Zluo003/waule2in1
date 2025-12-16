module.exports = {
  apps: [
    {
      name: 'aivider-server',
      cwd: './server',
      script: 'dist/index.js',
      // 🚀 集群模式：使用8个实例
      instances: 8,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Shanghai',
        ENABLE_DISCORD: 'false',  // 禁用 Discord，通过队列转发到专用实例
      },
      // 🔧 内存管理优化
      max_memory_restart: '1500M',  // 单实例超过 1200M 自动重启
      node_args: '--max-old-space-size=1024 --expose-gc',  // 限制堆内存 1024MB，暴露 GC 供手动调用
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
    {
      name: 'aivider-mj',
      cwd: './server',
      script: 'dist/index.js',
      // 🎨 Midjourney 专用实例：独占 Discord 连接
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Shanghai',
        ENABLE_DISCORD: 'true',  // 启用 Discord，消费队列任务
        PORT: '3001',  // 使用不同端口，避免冲突
      },
      max_memory_restart: '1200M',
      node_args: '--max-old-space-size=1024 --expose-gc',
      kill_timeout: 10000,
      wait_ready: true,
      listen_timeout: 15000,
      error_file: './logs/mj-error.log',
      out_file: './logs/mj-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_restarts: 5,
      min_uptime: '30s',
      restart_delay: 5000,
    },
    {
      name: 'aivider-client',
      cwd: './client',
      script: '/usr/bin/serve',
      args: '-s dist -l 8088',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Shanghai'
      },
      error_file: './logs/client-error.log',
      out_file: './logs/client-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
