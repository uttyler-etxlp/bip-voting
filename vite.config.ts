import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Change 'bip-vote' to match your GitHub repository name
// e.g. if repo is github.com/etxlaunchpad/bip-vote → base: '/bip-vote/'
export default defineConfig({
  plugins: [react()],
  base: '/bip-vote/',
  build: {
    outDir: 'dist',
  },
})
