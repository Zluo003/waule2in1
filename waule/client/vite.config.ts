import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // 代码分割优化
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React 核心库
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) {
            return 'react-vendor';
          }
          // ReactFlow 单独分割
          if (id.includes('node_modules/reactflow') || id.includes('node_modules/@reactflow')) {
            return 'reactflow';
          }
          // 🚀 Fabric.js 单独分割（大型 Canvas 库）
          if (id.includes('node_modules/fabric')) {
            return 'fabric';
          }
          // UI 组件库 (radix)
          if (id.includes('node_modules/@radix-ui')) {
            return 'ui-vendor';
          }
          // 其他大型依赖
          if (id.includes('node_modules/axios') || id.includes('node_modules/lodash')) {
            return 'utils';
          }
        },
      },
    },
    // 使用 esbuild 压缩（更快）
    minify: 'esbuild',
    // 分块大小警告阈值
    chunkSizeWarningLimit: 600,
  },
  esbuild: {
    // 生产环境移除 console.log 和 debugger
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
  server: {
    port: 8088, // 前端开发服务器端口
    strictPort: true,
    host: '0.0.0.0', // 监听所有网络接口，允许从Windows访问
    allowedHosts: ['waule.com', 'www.waule.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true, // 启用 WebSocket 代理
      },
    },
  },
});
