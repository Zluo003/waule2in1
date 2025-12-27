/**
 * PM2 配置文件
 * 
 * 使用方法：
 * 1. 安装 PM2: npm install -g pm2
 * 2. 启动服务: pm2 start ecosystem.config.js
 * 3. 查看状态: pm2 status
 * 4. 查看日志: pm2 logs
 * 5. 停止服务: pm2 stop waule-tenant-server
 * 6. 重启服务: pm2 restart waule-tenant-server
 * 7. 开机自启: pm2 startup && pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'waule-tenant-server',
      script: 'dist/index.js',
      cwd: __dirname,
      
      // 集群模式 - 2 个进程
      instances: 2,
      exec_mode: 'cluster',
      
      // 环境变量
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
      
      // 内存限制 (32G 内存，每个进程限制 2G)
      max_memory_restart: '2G',
      
      // 自动重启配置
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 1000,
      
      // 日志配置
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
      
      // 优雅关闭
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};
