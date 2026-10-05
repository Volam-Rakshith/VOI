import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * GitHub Pages notes
 * ------------------
 * The app uses hash based routing (see src/lib/router.jsx) and relative asset
 * URLs, so the very same `dist/` bundle works when served from:
 *
 *   https://username.github.io/               (user/org page - root)
 *   https://username.github.io/repository/    (project page - sub path)
 *   file:///.../dist/index.html               (opened locally)
 *
 * If you prefer absolute asset paths you can build with a base path:
 *   VITE_BASE_PATH=/repository-name/ npm run build
 */
const basePath = process.env.VITE_BASE_PATH || './'

/**
 * Pages serves 404.html for unknown paths. Because routing lives in the hash,
 * a copy of index.html there makes even weird URLs (e.g. /repo/some/deep/path)
 * boot the app instead of showing GitHub's default 404 page.
 */
function pagesFallback() {
  return {
    name: 'imposter-pages-fallback',
    apply: 'build',
    closeBundle() {
      const dist = resolve(process.cwd(), 'dist')
      const index = resolve(dist, 'index.html')
      if (existsSync(index)) {
        copyFileSync(index, resolve(dist, '404.html'))
        // Pages/Jekyll safety: an empty .nojekyll stops Pages from processing
        // the site through Jekyll (which would ignore _-prefixed paths).
        writeFileSync(resolve(dist, '.nojekyll'), '')
      }
    },
  }
}

export default defineConfig({
  base: basePath,
  plugins: [react(), pagesFallback()],
  build: {
    target: 'es2019',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          motion: ['framer-motion'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // Dev/preview tunnels (Arena preview proxy, ngrok, LAN) use their own Host header.
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
})
