import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// No `base` needed — deployed at root via CNAME (app.sheepdogsecurity.net).
// If ever moved to a GitHub Pages subpath (e.g. username.github.io/repo),
// set base: '/repo/' here.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
})
