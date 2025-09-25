import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Use environment variables for backend connection
  const backendHost = env.VITE_BACKEND_HOST || 'localhost'
  const backendPort = env.VITE_BACKEND_PORT || '4000'
  
  return {
    plugins: [react()],
    server: {
      host: true, // Allow access from network (0.0.0.0)
      port: 5173,
      proxy: {
        '/api': `http://${backendHost}:${backendPort}`,
      },
    },
  }
})
