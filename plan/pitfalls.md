# 踩坑紀錄（Pitfalls Log）

> 記錄開發與維護過程中踩過的坑：症狀 → 根因 → 教訓與防護。
> 新坑往上加，讓最近的教訓最先被看到。

---
## 2026-08-31 ｜ 權限層八份實作各自為政，撤銷失效、老師被鎖在門外 🔥

**症狀**：三類同時存在，方向相反所以互相掩蓋。

1. **擋太多**：`projectviewers.role='teacher'` 的老師無法建立／刪除分組、改成員角色；
   連 `/api/projects/get` 都拿到 403「No access to this project」，而學生讀得到。
2. **放太寬**：把使用者踢出全域群組後，`system_admin` 不會被收回，登出重登也一樣。
   把老師移出專案後，他仍能提交老師評分。
3. **從未執行**：`utils/security.ts` 的 `notifyAdmins` 與 `disableUserAccount` 對著
   不存在的表和欄位下查詢，必定拋錯。惡意登入偵測的警報信八個月來一封都沒寄出。

**根因**：同一個問題有八份實作，每份的 WHERE 條件都不一樣。

- `utils/permissions.ts` 用長字彙（`manage_project`／`view_project`）
- `middleware/permissions.ts` 用短字彙（`manage`／`view`／`comment`）
- 另外六份散在 handler 裡自己刻（`groups/manage.ts`、`groups/members.ts`、
  `projects/manage.ts`、`projects/list.ts`、`projects/create.ts`、`users/profile.ts`）

`router/groups.ts` 用短字彙守門（正確），handler 的 wrapper 卻把同樣的字串轉手丟給
長字彙那支——老師過了第一關、被第二關擋下。全庫另有 71 段直接對權限表寫的 SQL，
重複的其實只有三件事：「是不是 system_admin」30 次、「是不是 teacher/observer」24 次、
「是不是建立者」17 次。抄 71 遍，抄錯的比例不是零。

軟刪除的撤銷失效同源：`globalusergroups` 和 `projectviewers` 的移除都是
`SET isActive = 0`，但多數查詢只濾了群組的 `isActive`，沒濾成員資格的。

**為什麼漏掉**：資料剛好讓每個洞都繞過去了。

- `projectviewers` 裡 `role='teacher'` 只有 8 筆，**全部是同一個人**
- 那 8 個專案的 `createdBy` 也是他
- 全站唯一有 `system_admin` 的還是他

每個老師都走 system_admin 捷徑，所以「老師被擋」從來沒發生過。
`globalusergroups` 116 筆全是 `isActive=1`、`users` 116 筆全是 `active`——
沒有人被踢出過群組、沒有帳號被停用過，所以撤銷失效也沒被觸發。

`notifyAdmins` 的呼叫端有 `try/catch`，錯誤只印一行 `console.error` 就吞掉；
`sys_logs` 查無 `CRITICAL_SECURITY_FAILURE`，代表那條路徑根本沒被走到過。

`git log` 佐證：`middleware/permissions.ts` **一輩子只有一個 commit**，就是專案第一天的
`init build`（2025-12-26），八個月沒人動過。2026-07 那個月改了 49 次，一次都沒踩到權限層。

**教訓與防護**：

1. **「同一個問題只能有一個函式回答」比「權限用什麼字彙」重要得多。**
   `middleware/permissions.ts` 那套短字彙本身寫得是對的，`router/` 全線用它也沒出事。
   出事的是同一件事被抄了八遍。
2. **軟刪除的每一個消費端都要濾 `isActive`。** 寫下 `SET isActive = 0` 的當下，
   就要 grep 全庫確認所有讀取端都跟著濾——漏一個，撤銷就是假的。
3. **fail-closed 的 bug 一樣要修。** 這批 bug 幾乎全是「擋太多」，所以沒有資安事故，
   但它同時代表功能從沒被使用過。「沒人抱怨」不等於「沒壞」。
4. **一種角色只有一個人時，等於沒有測試那個角色。**
   已補 `packages/security-tests/utils/role_scenario.py`：建立五種角色各一個帳號的
   完整專案。上線第一次跑就抓到 `projects/manage.ts` 的存取漏洞，
   以及我自己第一版修正開太大（放行了沒分組的成員）。
5. **拿前端的權限表當規格來源。** `useDetailedProjectPermissions.ts` 是角色模型唯一
   被完整寫下來的地方。但要先分辨活旗標與死旗標——`canManageMembers` 和 `canViewAll`
   由 composable 計算但無人讀取，抄進測試等於把使用者觀察不到的行為凍結成契約。

---

## 2026-08-31 ｜ 2FA 改 6 位數字，整套 OWASP 測試登不進去

**症狀**：`pnpm test:security` 所有需要驗證的測試全數失敗，
`2FA verification failed: 400 ... Invalid verification code format`。

**根因**：兩層，第二層只改第一層修不好。

1. 測試用的佔位碼 `'DEVMODE'` 是 7 個字元。`FlexibleVerificationCodeSchema`
   （`packages/shared/src/schemas/auth.ts:75`）只接受 6 位數字或 8 碼備用碼，
   於是在 Zod 驗證層就被擋下，走不到 `router/auth.ts:782-785`
   「SMTP 未設定則跳過驗證」的 dev 分支。
2. 改成 6 位數字仍然失敗：email OTP 與 TOTP 現在長相相同，
   `router/auth.ts:609-614` 在請求未帶 `method` 時退回格式判斷，會把 6 位數字當成 TOTP。
   TOTP 是真的驗證、沒有 dev 繞道，而測試管理員帳號 `totpEnabled=1`。

**為什麼漏掉**：2FA 那個 commit（`70dff12`）只跑了 unit test（Vitest），
沒跑 `pnpm test:security`——後者需要先啟動 backend，不在預設流程裡。

**教訓與防護**：

1. **動到 auth schema 就要跑 `pnpm test:security`**，unit test 不會發現，
   因為它不打真的 HTTP 端點。
2. 修法寫進 `AuthHelper.login()` 的 docstring 了（送 `method='email'` 的理由），
   下次再調整 2FA 時先看那段。
3. 順帶發現 `AuthHelper.register_user` 送的欄位名是 `email`，
   schema 要的是 `userEmail`——**這支從來沒成功執行過**，
   因為需要它的 fixture 一直因缺少邀請碼而跳過。壞了兩層都沒人知道。

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
