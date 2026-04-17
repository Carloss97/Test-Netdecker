import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
const apiProxyTarget = process.env.API_URL || process.env.VITE_API_URL || '';
const proxyConfig = apiProxyTarget
  ? {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    }
  : undefined;

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
  server: {
    port: 3000,
    // Only enable /api proxy when an API URL is explicitly provided in env
    proxy: proxyConfig,
  }
})
