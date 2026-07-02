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
  build: {
    outDir: 'dist',
    // Vite 8 (Rolldown)：minify 交由 rolldownOptions.output.minify 控制
    // （需要 compress.dropConsole，頂層 minify 選項不支援細部設定）
    minify: false,
    cssMinify: 'lightningcss',
    rolldownOptions: {
      output: {
        // Oxc minifier：等價於舊 esbuild.drop = ['console', 'debugger']
        minify: command === 'build'
          ? { mangle: true, compress: { dropConsole: true, dropDebugger: true }, codegen: true }
          : false,
        // Rolldown 的 advancedChunks 取代函式版 manualChunks。
        // regex 比對 resolved id 結尾的 /node_modules/<pkg>/ 路徑段，
        // pnpm（.pnpm/xxx/node_modules/<pkg>/）與扁平結構皆適用。
        // 依序比對，第一個命中的分組生效（順序保留舊函式的行為，
        // 含舊有行為：@vueuse/* 全部進 vue-vendor，原 animation 分組從未命中故移除）。
        advancedChunks: {
          // false = 僅依模組自身 id 分組（等同舊 manualChunks 語意）；
          // 預設 true 會讓先命中的分組遞迴吞掉其依賴（element-plus 會吞掉 vue）
          includeDependenciesRecursively: false,
          groups: [
            { name: 'element-plus', test: /node_modules\/(element-plus\/|@element-plus\/)/ },
            { name: 'vue-vendor', test: /node_modules\/(vue\/|vue-router\/|@vue\/|@vueuse\/)/ },
            { name: 'tanstack', test: /node_modules\/@tanstack\// },
            // Markdown 渲染相關（不含 diff2html，它有複雜的內部依賴需要保留在 vendor）
            { name: 'markdown', test: /node_modules\/(marked|dompurify)\// },
            { name: 'diff', test: /node_modules\/diff\// },
            { name: 'physics', test: /node_modules\/matter-js\// },
            { name: 'vendor', test: /node_modules\// }
          ]
        }
      }
    },
    cssCodeSplit: true,  // 啟用 CSS 分割
    copyPublicDir: true
  },
  define: {
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
