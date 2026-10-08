import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  // relative asset paths: the built site works from any sub-path (S3, GitHub Pages, ...)
  base: './',
  // iPhone only exposes the gyroscope on HTTPS, so the dev/preview servers use a self-signed cert
  plugins: [vue(), vueDevTools(), basicSsl()],
  // three.js alone is ~600 kB; that is expected for a WebGL app
  build: { chunkSizeWarningLimit: 800 },
  server: { host: true },
  preview: { host: true },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
