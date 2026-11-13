import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Tauri 用的纯前端构建：只构建渲染层，输出与 electron-vite 相同。 */
export default defineConfig({
  root: resolve('src/renderer'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: resolve('out/renderer'),
    emptyOutDir: true,
    minify: 'oxc'
  }
})
