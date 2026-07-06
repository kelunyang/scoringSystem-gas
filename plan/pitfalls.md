# 踩坑紀錄（Pitfalls Log）

> 記錄開發與維護過程中踩過的坑：症狀 → 根因 → 教訓與防護。
> 新坑往上加，讓最近的教訓最先被看到。

---

## 2026-07-02 ｜ Vite 8 advancedChunks 手動分組 → production 白屏 🔥

**症狀**：Vite 8（Rolldown）升級部署後 production 白屏，console 報
`Uncaught TypeError: v is not a function`（vue-vendor chunk 初始化階段）。
**dev 模式完全正常，e2e 全綠**。

**根因**：用 `advancedChunks`（`includeDependenciesRecursively: false`）重建舊
manualChunks 的 vendor 分組，造成 vendor ↔ vue-vendor 跨 chunk 循環引用、
模組初始化順序錯亂。dev 模式不分塊所以不受影響。

**為什麼漏掉**：e2e 全部跑 dev server；preview 部署只用 curl 檢查 200（curl 不執行 JS）。
production 建置從未被瀏覽器實測過。

**教訓與防護**：
1. **「dev 正常」對建置類變更毫無意義**——分塊、minify、tree-shaking 都只作用於 production build。
2. 已新增 `pnpm test:e2e:preview`（`playwright.preview.config.ts`）：對 `vite preview` 的
   production 產物做瀏覽器級掛載/pageerror 驗證。**任何動到 vite/rolldown 設定的變更必跑**。
3. 部署後驗證要用 headless 瀏覽器實測（掛載 + pageerror），不是 curl。
4. 不要在 Rolldown 重建手動 vendor 分組；預設自動分塊實測更優（3.4MB 巨石 → 細粒度塊）。
   若真要加，只加葉子型套件且過 preview-smoke。

---

## 2026-07-02 ｜ tsc 轉譯副本 vite.config.js 遮蔽 vite.config.ts

**症狀**：改 `vite.config.ts` 完全沒效果，兩次建置產物 hash 一模一樣。

**根因**：`tsconfig.node.json` 的 `composite: true` 且未設 `outDir`，每次 `tsc --build`
都把轉譯的 `vite.config.js` 吐在套件根目錄；**Vite 載入順序 .js 優先於 .ts**，
真正生效的一直是舊的轉譯副本（且被 git 追蹤）。

**教訓與防護**：composite tsconfig 一律明設 `outDir` 到暫存位置；`vite.config.js/.d.ts`
已加入 .gitignore。懷疑設定沒生效時，先 `ls vite.config.*` 查有無同名 .js。

---

## 2026-07-02 ｜ e2e 測試從未真正執行過

**症狀**：Playwright 報 `No tests found`。

**根因**：e2e 檔命名 `smoke-test.e2e-spec.ts`，不符合 Playwright 預設
testMatch（`*.spec.ts` / `*.test.ts`）——**自建立起就從未跑過**，沒人發現。

**教訓與防護**：已在 `playwright.config.ts` 明設 `testMatch: '**/*.e2e-spec.ts'`。
新增測試設施時，第一件事是確認它真的會執行（`--list` 查一次）。

---

## 2026-07 ｜ WSL /mnt/d 慢 IO + Vite 冷快取 → e2e 必 flake

**症狀**：依賴變更或清除 `node_modules/.vite` 後，e2e 整批 timeout，
頁面卡在靜態 loading 畫面。看起來像升級造成的回歸。

**根因**：WSL2 + NTFS（/mnt/d）IO 極慢；Vite 冷啟 dep optimization 會觸發頁面重載，
首次載入超過 30 秒預設 timeout。**暖快取後只要 0.3 秒**。

**教訓與防護**：e2e 失敗且卡 loading 畫面 → 先重跑一次（第一輪失敗本身會暖快取）再判斷。
playwright.config.ts 已放寬 timeout 120s / navigationTimeout 90s。

---

## 2026-07 ｜ Rolldown advancedChunks 的 includeDependenciesRecursively 語意

**症狀**：分組結果與 manualChunks 完全不同——element-plus chunk 異常肥大（吞掉 vue、
@vueuse），vue-vendor 只剩 29KB，tanstack 分組消失。

**根因**：`advancedChunks` 預設 `includeDependenciesRecursively: true`——先命中的分組會
**遞迴吞掉其所有依賴**，與 manualChunks「按模組自身 id 分組」語意完全不同。

**教訓**：Rolldown 的選項名字像 Rollup 不代表語意像。遷移 bundler 設定時逐項查
預設值，並用建置產物（chunk 清單 + 大小）比對驗收。
（後續：手動分組整個移除，見最上方白屏事故。）

---

## 2026-07 ｜ 其他小坑備忘

- **wrangler.toml 不入版控**：compatibility_date 等變更只存在本地檔案，換機器/協作者
  要另外同步（目前 compat date = 2026-06-01）。
- **cdnjs 版本落後 npm**：KaTeX npm 已出 0.17，cdnjs 最新只到 0.16.44。CDN 升級前先查
  `api.cdnjs.com/libraries/<name>` 實際可用版本，SRI hash 一律重新產生並實測內容。
- **vitest 4.1 的 vite peer 警告**：vitest 4.1 要求 vite ≥6，但它自帶 vite 跑測試，
  專案本身還在舊 vite 時警告可忽略（升上去自然消失）。
- **element-plus 2.14 el-table slot 型別**：slot scope 從 any 改為 `DefaultRow`，
  傳給有型別的 handler 需在 template 加 `as` 斷言。
- **katex npm 套件是死依賴**：執行期 KaTeX 來自 index.html CDN（`declare const katex`），
  npm 套件裝了也沒用到——查依賴時注意 CDN 全域變數這條隱形路徑（d3 同理）。
