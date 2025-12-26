import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 配置 - 前端 E2E 自動化測試
 *
 * 此配置支援：
 * - Headless 模式 (無需 GUI)
 * - 自動啟動 Vite dev server
 * - 多瀏覽器測試 (Chromium, Firefox, WebKit)
 * - 自動截圖與錯誤捕獲
 */
export default defineConfig({
  // 測試文件目錄
  testDir: './tests/e2e',

  // 並行執行測試
  fullyParallel: true,

  // CI 環境禁止 .only 測試
  forbidOnly: !!process.env.CI,

  // CI 環境失敗重試 2 次
  retries: process.env.CI ? 2 : 0,

  // CI 環境使用單一 worker，本地使用 CPU 核心數
  workers: process.env.CI ? 1 : undefined,

  // 測試報告格式
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list']
  ],

  // 全局測試配置
  use: {
    // 前端 dev server 地址
    baseURL: 'http://localhost:5173',

    // 失敗重試時記錄追蹤
    trace: 'on-first-retry',

    // 失敗時自動截圖
    screenshot: 'only-on-failure',

    // 失敗時保存視頻
    video: 'retain-on-failure',

    // 瀏覽器啟動選項
    launchOptions: {
      // Headless 模式 (無 GUI)
      headless: true,
      // 慢動作執行 (ms)，用於 debug
      slowMo: process.env.PWDEBUG ? 100 : 0,
    },
  },

  // 測試專案 - 多瀏覽器支援
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 捕獲所有 console 訊息
        contextOptions: {
          recordVideo: {
            dir: 'test-results/videos/',
          },
        },
      },
    },

    // 可選：其他瀏覽器測試
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    // 可選：移動端測試
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
  ],

  // 自動啟動 dev server
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 120 * 1000, // 120 秒超時
  },
});
