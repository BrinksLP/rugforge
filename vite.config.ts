import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

// The GitHub Pages preview is served from https://<user>.github.io/rugforge/
// so the app must be built with that base path. Local dev stays at '/'.
const base = process.env.GITHUB_PAGES === 'true' ? '/rugforge/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
