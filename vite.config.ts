import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const marketPort = env.MARKET_API_PORT || '8787'
  const proxy = {
    '/api': {
      target: `http://127.0.0.1:${marketPort}`,
      changeOrigin: true,
      ws: true,
    },
  }
  return {
    plugins: [react(), tailwindcss()],
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: 5173, proxy },
  }
})
