# 2026 暑期待辦：套件升級檢查報告

> 產出日期：2026-07-01
> 範圍：`scoringSystem-cf/`（backend / frontend / shared 三個 workspace）
> 資料來源：`pnpm outdated -r`（對照 npm registry latest）
> 環境：node v20.19.6、pnpm 10.24.0、lockfile 最後更新 2026-04-27

## ✅ 執行結果（2026-07-02 完成）

**全部升級完成**，分 10 個批次執行（commit `6164fe0`..`db1e31b`），每批 type-check/test/build 綠燈後才推進。
最終 `pnpm outdated -r` 僅剩 `@types/node` 停在 24.x（刻意對齊 Node 24 LTS runtime，26.x 對應非 LTS current）。

| 批次 | 內容 | 結果 |
|------|------|------|
| B0 | pinia/@tanstack/vue-virtual 從 root 搬到 frontend、移除 @types/dompurify、刪多餘 package-lock.json | ✅ |
| B1 | 全部 patch/minor（vue 3.5.39、hono 4.12、zod 4.4、vitest 4.1、Playwright 1.61…）| ✅ 順手修復 e2e testMatch 從未匹配的問題 |
| B2 | 前端 wrangler 3→4、workers-types 三包對齊 4.20260701 | ✅ preview 部署驗證 |
| B3 | jose 6、@hono/zod-validator 0.8、vue-router 5、diff 9、element-plus 2.14、移除死依賴 katex | ✅ el-table slot 型別強化補 7 處斷言 |
| B4 | ESLint 8→10 flat config（typescript-eslint 8、eslint-plugin-vue 10）| ✅ 修 8 個真 bug；2227 warnings 標記為 lint 債 |
| B5 | TypeScript 6 + vue-tsc 3（ts5to6 移除 baseUrl）| ✅ 僅 7 個模板型別錯誤 |
| B6a | Vite 5→7 + plugin-vue 6 | ✅ |
| B6b | Vite 7→8（Rolldown）：advancedChunks、Oxc dropConsole、Lightning CSS | ✅ **建置 1m51s → ~20s**；修復 vite.config.js 轉譯副本遮蔽 .ts 的隱患 |
| B7 | compatibility_date 2024-04-03 → 2026-06-01（nodejs_compat v2）、engines node>=22 | ✅ production 部署 + wrangler tail 驗證 |
| B8 | CDN：KaTeX 0.16.44、Font Awesome 6.7.2 + SRI（cdnjs 尚無 KaTeX 0.17）| ✅ production 前後端皆已部署 |

**環境**：Node 20（EOL）→ 24 LTS、pnpm 10.24。

### 追加：lint 債清償（2026-07-02 完成）

正確性規則的 ~500 處違規已全數修復並升回 error（no-unused-vars、preserve-caught-error、no-useless-assignment、no-case-declarations、no-useless-escape、ban-ts-comment、no-unused-expressions、no-empty-object-type、vue/no-unused-vars、vue/no-side-effects-in-computed-properties、vue/no-mutating-props[shallowOnly]）。含兩個行為保全重構：Dashboard 權限快取去反應化、TopBar 閃爍阈值偵測移到 watcher。

### 追加：Vite 8 白屏事故與修復（2026-07-02）

Batch 6b 的 advancedChunks 手動分組造成 production 白屏（dev 正常、e2e 全綠所以漏掉）。
已修復（改用 Rolldown 預設分塊）並補上 `pnpm test:e2e:preview` 防護網。
完整事故紀錄與其他踩坑見 **[pitfalls.md](pitfalls.md)**。

**遺留待辦**：
- `no-explicit-any` 約 1600 處維持 warn（型別大翻修另案，逐模組清理後升 error；Options API 遷移時順手清償轉換檔）
- Options API → script setup 遷移：殘留 11 檔約 2.4 萬行，完整計畫見 [options-api-migration.md](options-api-migration.md)（含 block-lang 豁免清單清空）
- FA 7 / KaTeX 0.17（等 cdnjs 同步）留待下次

---

以下為原始檢查報告（2026-07-01）：

## 摘要

- 距上次佈署後，多數套件累積了 patch/minor 更新，**低風險可直接升**。
- 有一個明確不一致要修：**前端仍停在 wrangler v3，後端已在 wrangler v4**。
- 少數為 major 版號跳躍（vite、vue-router、typescript、eslint、jose…），屬**高風險、需驗證**，建議分批處理。
- `@types/dompurify` 已被官方標記 **Deprecated**（dompurify 3.x 已自帶型別），應移除。

---

## 一、Cloudflare 核心相關（優先處理）

| 套件 | 目前 | 最新 | 位置 | 風險 | 備註 |
|------|------|------|------|------|------|
| wrangler | 3.114.15（宣告 `^3.0.0`） | 4.106.0 | frontend | **中（major）** | 與後端不一致，需對齊到 v4 |
| wrangler | 4.51.0 | 4.106.0 | backend | 低（minor） | |
| @cloudflare/workers-types | `^4.20240117.0` | 4.20260701.1 | backend、shared | 低 | 三個 workspace 版本不一致，一起對齊 |
| @cloudflare/workers-types | 4.20251128.0 | 4.20260701.1 | frontend | 低 | 同上 |
| miniflare | 4.20260111.0 | 4.20260630.0 | backend | 低 | |
| hono | 4.10.7 | 4.12.27 | backend、frontend | 低（minor） | |
| jose | 5.10.0 | 6.2.3 | backend | **高（major）** | JWT 核心，需驗證登入/2FA/token 續期 |

> 重點：`wrangler` 前後端版本落差最大（v3 vs v4），且 `@cloudflare/workers-types` 三包版號不同，建議一次對齊。

---

## 二、安全升級（patch / minor，低風險，可批次一起做）

### 執行期依賴（frontend / backend / shared）

| 套件 | 目前 | 最新 |
|------|------|------|
| zod | 4.1.13 | 4.4.3 |
| vue | 3.5.25 | 3.5.39 |
| element-plus | 2.11.9 | 2.14.2 |
| @tanstack/vue-query | 5.92.0 | 5.101.2 |
| @tanstack/vue-virtual | 3.13.12 | 3.13.31 |
| @vueuse/core | 14.1.0 | 14.3.0 |
| dompurify | 3.3.0 | 3.4.11 |
| dayjs | 1.11.19 | 1.11.21 |
| papaparse | 5.5.3 | 5.5.4 |
| diff2html | 3.4.52 | 3.4.56 |
| sanitize-html | 2.17.0 | 2.17.5 |
| md-editor-v3 | 6.3.0 | 6.5.3 |
| katex | 0.16.25 | 0.17.0 |
| @number-flow/vue | 0.4.8 | 0.5.1 |
| @hono/zod-validator | 0.7.5 | 0.8.0 |

> 註：`katex`、`@number-flow/vue`、`@hono/zod-validator` 為 0.x 套件，minor 跳號仍可能含破壞性變更，升級後快速冒煙測試即可。

### 開發/測試依賴

| 套件 | 目前 | 最新 |
|------|------|------|
| @playwright/test | 1.57.0 | 1.61.1 |
| vitest / @vitest/coverage-v8 / @vitest/ui | 4.0.17 | 4.1.9 |
| happy-dom | 20.3.0 | 20.10.6 |
| @vue/test-utils | 2.4.6 | 2.4.11 |
| tsx | 4.21.0 | 4.22.4 |
| prettier | 3.7.2 | 3.9.4 |
| sass-embedded | 1.93.3 | 1.100.0 |
| @types/papaparse | 5.5.1 | 5.5.2 |
| @types/sanitize-html | 2.16.0 | 2.16.1 |

---

## 三、重大版號升級（major，高風險，建議分批 + 逐一驗證）

| 套件 | 目前 | 最新 | 影響面 |
|------|------|------|--------|
| jose | 5.10.0 | 6.2.3 | 後端 JWT/認證，API 有破壞性變更 |
| vite | 5.4.21 | 8.1.2 | 前端建置，跨 3 個 major |
| vue-router | 4.6.3 | 5.1.0 | 前端路由與 deep-linking |
| typescript | 5.9.3 | 6.0.3 | 全 workspace 型別檢查 |
| eslint | 8.57.1 | 10.6.0 | 需搭配 flat config，牽動下列 |
| @typescript-eslint/eslint-plugin | 6.21.0 | 8.62.1 | 隨 eslint |
| @typescript-eslint/parser | 6.21.0 | 8.62.1 | 隨 eslint |
| @vue/eslint-config-standard | 8.0.1 | 9.0.1 | 隨 eslint |
| @vitejs/plugin-vue | 4.6.2 | 6.0.7 | 隨 vite |
| vue-tsc | 2.2.12 | 3.3.6 | 隨 typescript |
| diff | 8.0.2 | 9.0.0 | 前端 diff 顯示 |
| @types/node | 20.19.25 | 26.1.0 | 建議跟隨實際 node runtime，不必躁進 |

> 建議把 vite / plugin-vue、eslint 生態系、typescript / vue-tsc 各自視為一個「升級套組」分批處理，避免一次全改難以定位問題。

---

## 四、清理項目

| 套件 | 狀態 | 動作 |
|------|------|------|
| @types/dompurify | 3.2.0（已 Deprecated） | 移除；dompurify 3.x 已內建型別 |

---

## 建議執行順序

1. **第一批（安全）**：第二節全部 + 第一節除 jose 外（含把前端 wrangler 對齊到 v4、workers-types 三包對齊），移除 `@types/dompurify`。升級後跑 `pnpm type-check`、`pnpm test`、`pnpm build`。
2. **第二批（jose 6）**：單獨升 jose，重點驗證登入、2FA、token 續期與撤銷。
3. **第三批（各 major 套組）**：vite 套組 → eslint 套組 → typescript 套組 → 其餘（vue-router、diff、@types/node），逐組升、逐組驗證。

### 驗證指令
```bash
cd scoringSystem-cf/
pnpm install
pnpm type-check      # 型別檢查
pnpm test            # 單元測試
pnpm build           # 前後端建置
pnpm test:e2e        # （可選）E2E
# 佈署前於本機 wrangler dev 冒煙測試登入/主要流程
```
