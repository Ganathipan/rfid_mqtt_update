import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Use environment variables for backend connection
  const host = env.VITE_BACKEND_HOST || '10.30.6.239'
  const port = env.VITE_BACKEND_PORT || '4000'
  return {
    plugins: [react()],
    server: {
      host: '10.30.6.239',
      // Let Vite find an available port
      proxy: {
        '/api': `http://${host}:${port}`,
      },
    },
  }
})
