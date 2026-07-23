import os from 'os'
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // This repo lives in Dropbox, which locks node_modules/.vite mid-rename
  // (EBUSY) and wedges the dep optimizer. Keep the cache outside the synced
  // tree; basename keeps worktree checkouts from sharing one cache.
  cacheDir: path.join(os.tmpdir(), 'vite-cache', path.basename(__dirname)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
