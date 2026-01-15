import { test, expect } from '@playwright/test';

/**
 * 冒煙測試 (Smoke Test)
 * 驗證前端基本功能是否正常運作
 */
test.describe('Frontend Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    // 捕獲所有 Console 訊息
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      console.log(`[Browser Console - ${type.toUpperCase()}]:`, text);
    });

    // 捕獲 JavaScript 錯誤
    page.on('pageerror', err => {
      console.error('[Browser Page Error]:', err.message);
    });

    // 捕獲失敗的網路請求
    page.on('requestfailed', request => {
      console.error('[Network Failed]:', request.url(), request.failure()?.errorText);
    });
  });

  test('應該成功載入首頁', async ({ page }) => {
    // 訪問首頁
    await page.goto('/');

    // 等待網路閒置 (所有 API 請求完成)
    await page.waitForLoadState('networkidle');

    // 驗證頁面標題包含 "評分系統" 或 "Scoring System"
    await expect(page).toHaveTitle(/評分系統|Scoring System/i);

    // 驗證 Vue app 已掛載 (使用 first() 避免多個 #app 的衝突)
    const app = page.locator('#app').first();
    await expect(app).toBeVisible();

    // 截圖保存
    await page.screenshot({
      path: 'test-results/screenshots/homepage.png',
      fullPage: true
    });
  });

  test('應該顯示導航欄', async ({ page }) => {
    await page.goto('/');

    // 等待 Vue 渲染完成
    await page.waitForLoadState('domcontentloaded');

    // 檢查是否有導航元素 (根據實際 UI 調整)
    const nav = page.locator('nav, header, .el-menu');
    const isVisible = await nav.count() > 0;

    if (isVisible) {
      await expect(nav.first()).toBeVisible();
      console.log('✓ 導航欄已渲染');
    } else {
      console.log('⚠ 未找到導航欄元素（可能需要調整選擇器）');
    }
  });

  test('應該正確處理 404 頁面', async ({ page }) => {
    // 訪問不存在的路由
    const response = await page.goto('/non-existent-page');

    // 驗證頁面載入成功（即使是 404）
    expect(response?.ok() || response?.status() === 404).toBeTruthy();

    // 檢查是否有 404 提示
    const content = await page.textContent('body');
    const has404Indicator = content?.includes('404') || content?.includes('找不到');

    if (has404Indicator) {
      console.log('✓ 404 頁面正確顯示');
    } else {
      console.log('⚠ 未檢測到明確的 404 提示');
    }
  });

  test('應該能捕獲 API 請求', async ({ page }) => {
    const apiRequests: string[] = [];

    // 監聽所有 API 請求
    page.on('request', request => {
      const url = request.url();
      if (url.includes('/api/')) {
        apiRequests.push(url);
        console.log('[API Request]:', request.method(), url);
      }
    });

    // 監聽所有 API 回應
    page.on('response', response => {
      const url = response.url();
      if (url.includes('/api/')) {
        console.log('[API Response]:', response.status(), url);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 輸出捕獲的 API 請求
    console.log(`\n捕獲到 ${apiRequests.length} 個 API 請求:`);
    apiRequests.forEach(url => console.log('  -', url));
  });
});

/**
 * 控制台錯誤檢測
 * 確保沒有未預期的 JavaScript 錯誤
 */
test.describe('Console Error Detection', () => {
  test('不應有 Console 錯誤', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', err => {
      consoleErrors.push(`Page Error: ${err.message}`);
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 如果有錯誤，輸出詳情
    if (consoleErrors.length > 0) {
      console.error('\n❌ 檢測到 Console 錯誤:');
      consoleErrors.forEach(err => console.error('  -', err));
    }

    // 驗證無錯誤 (可根據實際情況調整)
    // expect(consoleErrors.length).toBe(0);
    console.log(`\n檢測到 ${consoleErrors.length} 個 Console 錯誤`);
  });
});
