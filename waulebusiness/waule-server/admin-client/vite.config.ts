import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: '/admin/', // Admin 前端的基础路径
  build: {
    outDir: '../dist/admin', // 构建输出到 waule-server/dist/admin
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/axios') || id.includes('node_modules/zustand')) {
            return 'utils';
          }
        },
      },
    },
    minify: 'esbuild',
    chunkSizeWarningLimit: 500,
  },
  server: {
    port: 8853, // Admin 管理后台开发服务器端口
    strictPort: true,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});

