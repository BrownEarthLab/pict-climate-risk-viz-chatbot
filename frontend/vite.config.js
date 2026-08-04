import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Vite 8 bundles with Rolldown; `rollupOptions` is a deprecated alias for
    // `rolldownOptions`. The production build input names the application
    // entry ONLY (architecture.md Decision 1): the workbench is excluded by
    // never being an entry, not by filtering afterwards. The dev server
    // serves /workbench.html on request regardless of this list.
    rolldownOptions: {
      input: 'index.html',
    },
  },
})
