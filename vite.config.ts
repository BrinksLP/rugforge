import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// The GitHub Pages preview is served from https://<user>.github.io/rugforge/
// so the app must be built with that base path. Local dev stays at '/'.
const base = process.env.GITHUB_PAGES === 'true' ? '/rugforge/' : '/'

// onnxruntime-web loads its WASM runtime at runtime by URL. We copy the two
// files the `onnxruntime-web/wasm` (single-thread SIMD) build needs into
// `<base>ort/` so segmentation works completely offline — no CDN.
const ortDist = 'node_modules/onnxruntime-web/dist'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: `${ortDist}/ort-wasm-simd-threaded.{wasm,mjs}`,
          dest: 'ort',
          rename: { stripBase: true },
        },
      ],
    }),
  ],
  // ort ships its own wasm glue; pre-bundling it just slows dev startup
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
