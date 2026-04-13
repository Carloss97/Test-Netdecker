import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        // Use API_URL env when provided, otherwise target backend on 3334
        target: process.env.API_URL || 'http://localhost:3334',
        changeOrigin: true,
      }
    }
  }
})
