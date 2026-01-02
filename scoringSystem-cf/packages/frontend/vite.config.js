import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { STAGE_COLORS, BUTTON_COLORS } from '../shared/src/theme/colors.config';
/**
 * 自動生成主題 SCSS 變量的 Vite 插件
 *
 * 此插件會在構建開始時從 @repo/shared/theme/colors.config.ts 讀取配色方案，
 * 並自動生成 CSS 變量和 SCSS 變量文件。
 */
function generateThemeScssPlugin() {
    return {
        name: 'generate-theme-scss',
        buildStart: function () {
            var timestamp = new Date().toISOString();
            var scssContent = "\n// ========================================\n// \uD83C\uDFA8 \u81EA\u52D5\u751F\u6210\u7684\u4E3B\u984C\u8B8A\u91CF - \u8ACB\u52FF\u624B\u52D5\u7DE8\u8F2F\n// ========================================\n// \u4F86\u6E90: @repo/shared/theme/colors.config.ts\n// \u751F\u6210\u6642\u9593: ".concat(timestamp, "\n//\n// \u6B64\u6587\u4EF6\u7531 Vite \u63D2\u4EF6\u81EA\u52D5\u751F\u6210\uFF0C\u4EFB\u4F55\u624B\u52D5\u4FEE\u6539\u90FD\u6703\u5728\u4E0B\u6B21\u69CB\u5EFA\u6642\u88AB\u8986\u84CB\u3002\n// \u5982\u9700\u4FEE\u6539\u914D\u8272\uFF0C\u8ACB\u7DE8\u8F2F packages/shared/src/theme/colors.config.ts\n// ========================================\n\n// CSS \u8B8A\u91CF\u5B9A\u7FA9\uFF08\u5168\u5C40\u53EF\u7528\uFF09\n:root {\n  // \u968E\u6BB5\u72C0\u614B\u984F\u8272").concat(Object.entries(STAGE_COLORS).map(function (_a) {
                var status = _a[0], config = _a[1];
                return "\n  --stage-".concat(status, "-bg: ").concat(config.background, ";\n  --stage-").concat(status, "-text: ").concat(config.text, ";\n  --stage-").concat(status, "-contrast: ").concat(config.contrast, ";");
            }).join(''), "\n\n  // \u6309\u9215\u984F\u8272").concat(Object.entries(BUTTON_COLORS).map(function (_a) {
                var type = _a[0], config = _a[1];
                return "\n  --btn-".concat(type, "-bg: ").concat(config.background, ";\n  --btn-").concat(type, "-text: ").concat(config.text, ";\n  --btn-").concat(type, "-hover: ").concat(config.hover, ";\n  --btn-").concat(type, "-contrast: ").concat(config.contrast, ";");
            }).join(''), "\n}\n\n// ========================================\n// SCSS \u8B8A\u91CF\u5B9A\u7FA9\uFF08\u5411\u5F8C\u517C\u5BB9\uFF09\n// ========================================\n\n// \u968E\u6BB5\u72C0\u614B SCSS \u8B8A\u91CF\n").concat(Object.entries(STAGE_COLORS).map(function (_a) {
                var status = _a[0];
                return "$stage-".concat(status, "-bg: var(--stage-").concat(status, "-bg);\n$stage-").concat(status, "-text: var(--stage-").concat(status, "-text);");
            }).join('\n'), "\n\n// \u6309\u9215 SCSS \u8B8A\u91CF\n").concat(Object.entries(BUTTON_COLORS).map(function (_a) {
                var type = _a[0];
                return "$btn-".concat(type, "-bg: var(--btn-").concat(type, "-bg);\n$btn-").concat(type, "-text: var(--btn-").concat(type, "-text);\n$btn-").concat(type, "-hover: var(--btn-").concat(type, "-hover);");
            }).join('\n'), "\n\n// ========================================\n// \u914D\u8272\u8AAA\u660E\n// ========================================\n\n// \u968E\u6BB5\u72C0\u614B\u914D\u8272\n").concat(Object.entries(STAGE_COLORS).map(function (_a) {
                var status = _a[0], config = _a[1];
                return "// ".concat(status, ": ").concat(config.description);
            }).join('\n'), "\n\n// \u6309\u9215\u914D\u8272\uFF08\u8A9E\u7FA9\u5316\u65B9\u6848A\uFF09\n").concat(Object.entries(BUTTON_COLORS).map(function (_a) {
                var type = _a[0], config = _a[1];
                return "// ".concat(type, ": ").concat(config.description);
            }).join('\n'), "\n");
            // 確保目錄存在
            var outputDir = resolve(__dirname, 'src/styles');
            try {
                mkdirSync(outputDir, { recursive: true });
            }
            catch (e) {
                // 目錄已存在，忽略錯誤
            }
            // 寫入文件
            var outputPath = resolve(outputDir, '_theme-generated.scss');
            writeFileSync(outputPath, scssContent);
            console.log('✅ [Theme Plugin] 主題 SCSS 已生成:', outputPath);
        }
    };
}
// https://vitejs.dev/config/
export default defineConfig(function (_a) {
    var command = _a.command, mode = _a.mode;
    return ({
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
            minify: command === 'build' ? 'esbuild' : false, // 只在 build 时压缩，dev 模式保留代码
            rollupOptions: {
                output: {
                    // 使用函數形式的 manualChunks 進行代碼分割
                    // 支援 pnpm 的 .pnpm 資料夾結構
                    manualChunks: function (id) {
                        if (id.includes('node_modules')) {
                            // 處理 pnpm 的 .pnpm 資料夾結構
                            var modulePath = id.split('node_modules/')[1];
                            if (!modulePath)
                                return 'vendor';
                            var packageName = void 0;
                            if (modulePath.startsWith('.pnpm/')) {
                                // pnpm 結構: .pnpm/package@version/node_modules/package
                                var parts = modulePath.split('/');
                                var scopedName = parts[1]; // e.g., "vue@3.4.15" or "@vue+runtime-core@3.4.15"
                                if (scopedName.startsWith('@')) {
                                    // Scoped package: @vue+runtime-core@3.4.15 -> @vue/runtime-core
                                    packageName = scopedName.split('@')[0].replace('+', '/');
                                    if (!packageName)
                                        packageName = '@' + scopedName.split('@')[1].split('+')[0];
                                }
                                else {
                                    packageName = scopedName.split('@')[0];
                                }
                            }
                            else {
                                // 標準 node_modules 結構
                                packageName = modulePath.split('/')[0];
                                if (packageName.startsWith('@')) {
                                    packageName = modulePath.split('/').slice(0, 2).join('/');
                                }
                            }
                            // 按依賴類型分組
                            // Vue 生態系統
                            if (packageName === 'vue' || packageName.startsWith('@vue/') ||
                                packageName === 'vue-router' || packageName.startsWith('@vueuse/')) {
                                return 'vue-vendor';
                            }
                            // Element Plus UI 框架
                            if (packageName === 'element-plus' || packageName.startsWith('@element-plus/')) {
                                return 'element-plus';
                            }
                            // TanStack (Query + Table)
                            if (packageName.startsWith('@tanstack/')) {
                                return 'tanstack';
                            }
                            // Markdown 渲染相關（不含 diff2html，它有複雜的內部依賴需要保留在 vendor）
                            if (['marked', 'dompurify'].includes(packageName)) {
                                return 'markdown';
                            }
                            // Diff 比對工具（highlight.js, diff2html 等保留在 vendor 讓 Rollup 處理依賴）
                            if (packageName === 'diff') {
                                return 'diff';
                            }
                            // KaTeX
                            if (packageName === 'katex') {
                                return 'katex';
                            }
                            // Markdown Editor (md-editor-v3)
                            if (packageName === 'md-editor-v3') {
                                return 'md-editor';
                            }
                            // 物理引擎與動畫
                            if (packageName === 'matter-js') {
                                return 'physics';
                            }
                            // 其他 node_modules 分到 vendor chunk
                            return 'vendor';
                        }
                        return undefined;
                    }
                }
            },
            cssCodeSplit: true, // 啟用 CSS 分割
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
                    configure: function (proxy, _options) {
                        proxy.on('error', function (err) {
                            console.log('[WS Proxy Error]', err.message);
                        });
                        proxy.on('proxyReqWs', function (_proxyReq, _req, socket) {
                            socket.on('error', function (_err) {
                                // Silently handle socket errors
                            });
                        });
                    }
                }
            }
        }
    });
});
