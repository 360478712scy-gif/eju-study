import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// This archived frontend needs the matching v2 shared engine.
const shared = process.env.EJU_V2_SHARED_DIR;
if (!shared) throw new Error('Set EJU_V2_SHARED_DIR to the shared directory of the v2 checkout (a43d5f4).');
export default defineConfig({
  root: path.resolve(import.meta.dirname),
  plugins: [react()],
  resolve: { alias: { '@shared': path.resolve(shared) } },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:18763', changeOrigin: true, headers: { origin: 'http://127.0.0.1:18763' } },
      '/content': { target: 'http://127.0.0.1:18763', changeOrigin: true },
      '/assets': { target: 'http://127.0.0.1:18763', changeOrigin: true },
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    // /assets/* is reserved for media served from public/assets.
    assetsDir: 'app',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    target: 'safari16',
  },
});
