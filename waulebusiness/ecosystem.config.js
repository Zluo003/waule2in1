module.exports = {
  apps: [
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
