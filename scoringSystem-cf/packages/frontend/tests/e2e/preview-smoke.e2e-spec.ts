import { test, expect } from '@playwright/test';

/**
 * Production Build 冒煙測試（跑在 vite preview，不是 dev server）
 *
 * 存在理由：2026-07 Vite 8 升級時，advancedChunks 手動分組造成的模組初始化
 * 順序錯誤只在 production 建置出現（dev 模式不分塊、不會觸發），dev server 上的
 * e2e 全綠但 production 白屏。此測試確保「dev 正常、build 壞掉」這類問題不再溜過。
 *
 * 執行方式：pnpm test:e2e:preview（需先 pnpm build 產出 dist/）
 * 由 playwright.config.ts 的 preview-smoke project 啟動 vite preview。
 */
test.describe('Production Build Smoke (vite preview)', () => {
  test('production 建置應成功掛載且無執行期錯誤', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.goto('/');
    await page.waitForLoadState('load');

    // App 必須真的掛載（#app 有子節點；白屏時只有 index.html 的靜態 loading 畫面）
    const app = page.locator('#app > *').first();
    await expect(app).toBeVisible({ timeout: 15000 });

    // 模組初始化階段不得有任何未捕捉錯誤（chunk 順序錯亂的典型症狀）
    expect(pageErrors, `production build 有執行期錯誤:\n${pageErrors.join('\n')}`).toEqual([]);
  });
});
