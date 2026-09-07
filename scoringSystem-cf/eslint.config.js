import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import { withVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import prettierSkip from 'eslint-config-prettier'
import globals from 'globals'

// 單一 root flat config：ESLint >=9 會從被 lint 檔案的目錄向上尋找，
// 各 package 的 lint script 都會解析到這份設定。
export default withVueTs(
  {
    ignores: [
      '**/dist/',
      '**/node_modules/',
      '**/.wrangler/',
      '**/coverage/',
      'packages/backend/migrations/',
      'packages/frontend/playwright-report/',
      'packages/frontend/test-results/',
      'packages/frontend/bak/',
      'packages/frontend/build.mjs',
      'packages/security-tests/',
      'scripts/',
      '**/*.log',
    ],
  },

  js.configs.recommended,
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,

  // Backend（Cloudflare Workers）：沿用原 .eslintrc.cjs 的兩條自訂規則
  {
    files: ['packages/backend/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.worker },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // Frontend（Vue 3 SPA）：瀏覽器環境
  {
    files: ['packages/frontend/src/**/*.{ts,vue}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'vue/multi-word-component-names': 'warn',
      // Vue 3 沒有 filter；此規則會把 template 中 TS union type 的 | 誤判為 Vue 2 filter
      'vue/no-deprecated-filter': 'off',
    },
  },

  // 測試檔
  {
    files: ['**/*.{test,spec}.ts', '**/__tests__/**', '**/tests/**'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // 正確性規則：既有違規已於 2026-07 全數清理，維持 error 防止回歸
  {
    files: ['**/*.{ts,vue,js,mjs,cjs}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-empty-object-type': 'error',
      '@typescript-eslint/no-unused-expressions': 'error',
      'preserve-caught-error': 'error',
      'no-useless-assignment': 'error',
      'no-case-declarations': 'error',
      'no-useless-escape': 'error',
      'vue/no-unused-vars': 'error',
      'vue/no-side-effects-in-computed-properties': 'error',
      // shallowOnly：僅禁止整個 prop 重新賦值；深層欄位寫入是本專案
      // 「父層共享 form 物件、子層 v-model 欄位」的刻意模式
      'vue/no-mutating-props': ['error', { shallowOnly: true }],
      // 2026-09-07 清到 0 之後升回 error。規則是 warn 的期間，
      // 「pnpm lint 0 error」並不代表沒有 any——那讓「已歸零」的錯誤
      // 結論連續發生三次，見 plan/pitfalls.md 同日條目。
      // 測試檔仍為 off（下方區塊），mock 用 any 是合理的。
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // prettier 負責格式，關閉衝突的 stylistic 規則
  prettierSkip,
)
