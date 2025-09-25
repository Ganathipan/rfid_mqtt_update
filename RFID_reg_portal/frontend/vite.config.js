import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Force localhost for backend connection
  const host = 'localhost'
  const port = '4000'
  return {
    plugins: [react()],
    server: {
      host: 'localhost',
      // Let Vite find an available port
      proxy: {
        '/api': `http://${host}:${port}`,
      },
    },
  }
})
