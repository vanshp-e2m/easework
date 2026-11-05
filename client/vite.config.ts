import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Overridable so a second copy can run against a test API, e.g.
// WEB_PORT=5174 API_PORT=4200 npx vite
const api = `http://127.0.0.1:${process.env.API_PORT ?? 4100}`

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/api': api,
      '/socket.io': { target: api, ws: true },
    },
  },
})
