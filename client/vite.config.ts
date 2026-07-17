import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Proxy target for the API. Defaults to localhost:3001 (API running in podman
// with the port published to the host). When the client itself runs inside a
// container (podman-compose `client` service), override with the compose
// network hostname, e.g. VITE_PROXY_TARGET=http://api:3001.
const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
});
