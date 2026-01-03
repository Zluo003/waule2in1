module.exports = {
  apps: [{
    name: 'ai-gateway',
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
  }]
};
