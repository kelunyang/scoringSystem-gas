import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 配置 - Production Build 冒煙測試
 *
 * 與 playwright.config.ts（dev server）分離：此配置對 `vite preview` 跑
 * production 建置產物，專抓「dev 正常、build 壞掉」的問題（例如 chunk
 * 初始化順序錯誤）。執行前需先 `pnpm build` 產出 dist/。
 *
 * 執行：pnpm test:e2e:preview
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/preview-smoke.e2e-spec.ts',

  timeout: 60 * 1000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,

  reporter: [['list']],

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'preview-smoke',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30 * 1000,
  },
});
