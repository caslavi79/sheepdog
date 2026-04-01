import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// No `base` needed — deployed at root via CNAME (app.sheepdogtexas.com).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
})
