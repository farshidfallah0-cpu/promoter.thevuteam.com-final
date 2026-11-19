import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Each build gets an id, baked into the JS and written to /version.json, so a tab
// still running an older build can notice a deploy and reload itself (see versionCheck.js).
const BUILD_ID = String(Date.now())

const emitVersionFile = () => ({
  name: 'emit-version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) })
  },
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), emitVersionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
