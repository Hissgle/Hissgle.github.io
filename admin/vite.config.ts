import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // `vercel dev` 同时提供 Vite 页面和 /api 函数；本地只用 vite 时也能把
      // 请求转给 3000 端口的 Vercel dev server。
      '/api': 'http://127.0.0.1:3000',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});