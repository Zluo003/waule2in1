module.exports = {
  apps: [
    {
      name: 'node-gateway',
      cwd: '/app/node-gateway',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'sora-api',
      cwd: '/app/sora-api',
      script: 'main.py',
      interpreter: 'python',
      instances: 1,
      max_memory_restart: '1G',
      env: {
        PYTHONUNBUFFERED: '1'
      }
    }
  ]
};
