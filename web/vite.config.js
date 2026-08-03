import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // file watching + HMR must work through the Docker bind mount
    watch: { usePolling: true, interval: 300 },
    hmr: { clientPort: 5173 },
    // never let the browser cache dev assets
    headers: { 'Cache-Control': 'no-store' }
  }
});
