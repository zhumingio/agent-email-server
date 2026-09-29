import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // 无论从哪个目录调用 vite，都以本文件所在目录为项目根（修复 App 构建时找不到 index.html）
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/mcp': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1600 },
});
