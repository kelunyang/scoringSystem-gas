import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: 'dist',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: undefined,
        inlineDynamicImports: true
      }
    },
    cssCodeSplit: false
  },
  define: {
    'process.env.NODE_ENV': '"production"',
    '__VUE_PROD_DEVTOOLS__': false,
    '__VUE_OPTIONS_API__': true
  }
})