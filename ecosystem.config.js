module.exports = {
  apps: [
    {
      name: 'ai-gateway',
      cwd: '/home/waule2in1/ai-gateway',
      script: 'dist/index.js',
      instances: 4,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
        PORT: 9000
      }
    },
    {
      name: 'waule-server',
      cwd: '/home/waule2in1/waulebusiness/waule-server',
      script: 'dist/index.js',
      instances: 8,
      exec_mode: 'cluster',
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'waule-update-server',
      cwd: '/home/waule2in1/waulebusiness/waule-update-server',
      script: 'dist/index.js',
      instances: 1,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
