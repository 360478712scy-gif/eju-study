import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const backend = new URL('http://127.0.0.1:' + (process.env.EJU_APP_API_PORT || '18763')).origin;

// 澄学 EJU 3.0 front end. Dev: `npm run dev:app` (proxies API/content/assets to the local server on 18763).
export default defineConfig({
  root: path.resolve(import.meta.dirname),
  plugins: [react()],
  resolve: { alias: { '@shared': path.resolve(import.meta.dirname, '../shared') } },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: backend, changeOrigin: true, headers: { origin: backend } },
      '/content': { target: backend, changeOrigin: true },
      '/assets': { target: backend, changeOrigin: true },
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    assetsDir: 'app',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    target: 'safari16',
  },
});
