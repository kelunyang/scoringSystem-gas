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
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Frontend（Vue 3 SPA）：瀏覽器環境
  {
    files: ['packages/frontend/src/**/*.{ts,vue}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      // 首次導入 lint，噪音規則先降為 warn，逐步清理
      '@typescript-eslint/no-explicit-any': 'warn',
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
      // 剩餘 lint 債（型別大翻修另案處理）：
      // TODO(lint-debt): no-explicit-any 約 1600 處，逐模組清理後升回 error
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // 遺留 JS SFC（options API，轉 TS 屬獨立遷移工程）
  // TODO(lint-debt): 逐檔轉 <script lang="ts"> 後自此清單移除
  {
    files: [
      'packages/frontend/src/components/ProjectCard.vue',
      'packages/frontend/src/components/TopBarUserControls.vue',
      'packages/frontend/src/components/admin/GroupManagement.vue',
    ],
    rules: {
      'vue/block-lang': 'off',
    },
  },

  // prettier 負責格式，關閉衝突的 stylistic 規則
  prettierSkip,
)
