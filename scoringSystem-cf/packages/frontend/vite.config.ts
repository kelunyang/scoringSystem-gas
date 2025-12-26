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
        manualChunks: undefined,
        inlineDynamicImports: true
      }
    },
    cssCodeSplit: false,
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
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false
      },
      '/users': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false
      },
      '/projects': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false
      },
      '/submissions': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false
      },
      '/api/notifications': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false
      },
      '/system': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false
      },
      '/wallets': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false
      },
      '/invitations': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false
      },
      '/groups': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false
      },
      '/stages': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false
      },
      '/rankings': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false
      },
      '/comments': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false
      },
      '/scoring': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false
      },
      '/eventlogs': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false
      },
      '/settlement': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false
      },
      '/maintenance': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false
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
