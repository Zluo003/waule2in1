/**
 * PM2 部署配置文件 - waule 主服务
 * waule-api 使用 Docker 部署
 * 
 * 服务器配置: 4核心 8G 内存
 * 
 * 使用方法:
 *   pm2 start ecosystem.config.js
 *   pm2 restart all
 *   pm2 logs
 */

module.exports = {
  apps: [
    // ==================== waule 主服务 ====================
    {
      name: 'waule-server',
      cwd: './waule/server',
      script: 'dist/index.js',
      instances: 2,  // 4核心可以开2个实例
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_file: './waule/server/.env',
      error_file: './logs/waule-server-error.log',
      out_file: './logs/waule-server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
