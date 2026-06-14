import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rawProxyTarget =
    env.API_URL ||
    env.VITE_API_PROXY_TARGET ||
    (env.VITE_API_URL?.startsWith('http') ? env.VITE_API_URL : '') ||
    'http://127.0.0.1:3333';

  const apiProxyTarget = rawProxyTarget.replace(/\/+api\/?$/, '').replace(/\/+$/, '');

  return {
    plugins: [react()],
    test: {
      environment: 'happy-dom',
      setupFiles: './src/test/setup.ts',
      globals: true,
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
})
