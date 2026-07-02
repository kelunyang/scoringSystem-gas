import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { writeFileSync, mkdirSync } from 'fs'
import { STAGE_COLORS, BUTTON_COLORS } from '../shared/src/theme/colors.config'

/**
 * 自動生成主題 SCSS 變量的 Vite 插件
 *
 * 此插件會在構建開始時從 @repo/shared/theme/colors.config.ts 讀取配色方案，
 * 並自動生成 CSS 變量和 SCSS 變量文件。
 */
function generateThemeScssPlugin() {
  return {
    name: 'generate-theme-scss',
    buildStart() {
      const timestamp = new Date().toISOString()
      const scssContent = `
// ========================================
// 🎨 自動生成的主題變量 - 請勿手動編輯
// ========================================
// 來源: @repo/shared/theme/colors.config.ts
// 生成時間: ${timestamp}
//
// 此文件由 Vite 插件自動生成，任何手動修改都會在下次構建時被覆蓋。
// 如需修改配色，請編輯 packages/shared/src/theme/colors.config.ts
// ========================================

// CSS 變量定義（全局可用）
:root {
  // 階段狀態顏色${Object.entries(STAGE_COLORS).map(([status, config]) => `
  --stage-${status}-bg: ${config.background};
  --stage-${status}-text: ${config.text};
  --stage-${status}-contrast: ${config.contrast};`).join('')}

  // 按鈕顏色${Object.entries(BUTTON_COLORS).map(([type, config]) => `
  --btn-${type}-bg: ${config.background};
  --btn-${type}-text: ${config.text};
  --btn-${type}-hover: ${config.hover};
  --btn-${type}-contrast: ${config.contrast};`).join('')}
}

// ========================================
// SCSS 變量定義（向後兼容）
// ========================================

// 階段狀態 SCSS 變量
${Object.entries(STAGE_COLORS).map(([status]) => `$stage-${status}-bg: var(--stage-${status}-bg);
$stage-${status}-text: var(--stage-${status}-text);`).join('\n')}

// 按鈕 SCSS 變量
${Object.entries(BUTTON_COLORS).map(([type]) => `$btn-${type}-bg: var(--btn-${type}-bg);
$btn-${type}-text: var(--btn-${type}-text);
$btn-${type}-hover: var(--btn-${type}-hover);`).join('\n')}

// ========================================
// 配色說明
// ========================================

// 階段狀態配色
${Object.entries(STAGE_COLORS).map(([status, config]) => `// ${status}: ${config.description}`).join('\n')}

// 按鈕配色（語義化方案A）
${Object.entries(BUTTON_COLORS).map(([type, config]) => `// ${type}: ${config.description}`).join('\n')}
`

      // 確保目錄存在
      const outputDir = resolve(__dirname, 'src/styles')
      try {
        mkdirSync(outputDir, { recursive: true })
      } catch (e) {
        // 目錄已存在，忽略錯誤
      }

      // 寫入文件
      const outputPath = resolve(outputDir, '_theme-generated.scss')
      writeFileSync(outputPath, scssContent)
      console.log('✅ [Theme Plugin] 主題 SCSS 已生成:', outputPath)
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => ({
  plugins: [
    vue(),
    generateThemeScssPlugin()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@repo/shared': resolve(__dirname, '../shared/src')
    }
  },
  optimizeDeps: {
    include: ['@repo/shared']
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler'
      }
    }
  },
  build: {
    outDir: 'dist',
    minify: command === 'build' ? 'esbuild' : false,  // 只在 build 时压缩，dev 模式保留代码
    rollupOptions: {
      output: {
        // 使用函數形式的 manualChunks 進行代碼分割
        // 支援 pnpm 的 .pnpm 資料夾結構
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            // 處理 pnpm 的 .pnpm 資料夾結構
            const modulePath = id.split('node_modules/')[1]
            if (!modulePath) return 'vendor'

            let packageName: string
            if (modulePath.startsWith('.pnpm/')) {
              // pnpm 結構: .pnpm/package@version/node_modules/package
              const parts = modulePath.split('/')
              const scopedName = parts[1] // e.g., "vue@3.4.15" or "@vue+runtime-core@3.4.15"
              if (scopedName.startsWith('@')) {
                // Scoped package: @vue+runtime-core@3.4.15 -> @vue/runtime-core
                packageName = scopedName.split('@')[0].replace('+', '/')
                if (!packageName) packageName = '@' + scopedName.split('@')[1].split('+')[0]
              } else {
                packageName = scopedName.split('@')[0]
              }
            } else {
              // 標準 node_modules 結構
              packageName = modulePath.split('/')[0]
              if (packageName.startsWith('@')) {
                packageName = modulePath.split('/').slice(0, 2).join('/')
              }
            }

            // 按依賴類型分組
            // Vue 生態系統
            if (packageName === 'vue' || packageName.startsWith('@vue/') ||
                packageName === 'vue-router' || packageName.startsWith('@vueuse/')) {
              return 'vue-vendor'
            }
            // Element Plus UI 框架
            if (packageName === 'element-plus' || packageName.startsWith('@element-plus/')) {
              return 'element-plus'
            }
            // TanStack (Query + Table)
            if (packageName.startsWith('@tanstack/')) {
              return 'tanstack'
            }
            // Markdown 渲染相關（不含 diff2html，它有複雜的內部依賴需要保留在 vendor）
            if (['marked', 'dompurify'].includes(packageName)) {
              return 'markdown'
            }
            // Diff 比對工具（highlight.js, diff2html 等保留在 vendor 讓 Rollup 處理依賴）
            if (packageName === 'diff') {
              return 'diff'
            }
            // 物理引擎
            if (packageName === 'matter-js') {
              return 'physics'
            }
            // 動畫庫（@vueuse/motion, @vueuse/gesture）
            if (packageName.startsWith('@vueuse/motion') || packageName.startsWith('@vueuse/gesture')) {
              return 'animation'
            }
            // 其他 node_modules 分到 vendor chunk
            return 'vendor'
          }
          return undefined
        }
      }
    },
    cssCodeSplit: true,  // 啟用 CSS 分割
    copyPublicDir: true
  },
  // 明確配置 esbuild - dev 模式保留 console，build 模式移除
  esbuild: {
    drop: command === 'build' ? ['console', 'debugger'] : []
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
    '__VUE_PROD_DEVTOOLS__': mode !== 'development',
    '__VUE_OPTIONS_API__': true
  },
  server: {
    port: 5173,
    hmr: {
      overlay: true,
      clientPort: 5173
    },
    proxy: {
      // /api 開頭的路徑直接代理（後端已經是 /api/* 路由）
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false
      },
      // 以下路徑需要 rewrite 加上 /api 前綴
      '/users': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => `/api${path}`
      },
      '/projects': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => `/api${path}`
      },
      '/submissions': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => `/api${path}`
      },
      '/system': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => `/api${path}`
      },
      '/wallets': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => `/api${path}`
      },
      '/invitations': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => `/api${path}`
      },
      '/groups': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => `/api${path}`
      },
      '/stages': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => `/api${path}`
      },
      '/rankings': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => `/api${path}`
      },
      '/comments': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => `/api${path}`
      },
      '/scoring': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => `/api${path}`
      },
      '/eventlogs': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => `/api${path}`
      },
      '/settlement': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => `/api${path}`
      },
      '/maintenance': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => `/api${path}`
      },
      '/ws': {
        target: 'ws://localhost:8787',
        changeOrigin: true,
        ws: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err) => {
            console.log('[WS Proxy Error]', err.message)
          })
          proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
            socket.on('error', (_err) => {
              // Silently handle socket errors
            })
          })
        }
      }
    }
  }
}))
