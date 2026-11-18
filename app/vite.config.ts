import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// 澄学 EJU 3.0 front end. Dev: `npm run dev:app` (proxies API/content/assets to the local server on 18763).
export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
  resolve: { alias: { '@shared': path.resolve(__dirname, '../shared') } },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://127.0.0.1:18763', changeOrigin: true, headers: { origin: 'http://127.0.0.1:18763' } },
      '/content': { target: 'http://127.0.0.1:18763', changeOrigin: true },
      '/assets': { target: 'http://127.0.0.1:18763', changeOrigin: true },
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    assetsDir: 'app',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    target: 'safari16',
  },
});
