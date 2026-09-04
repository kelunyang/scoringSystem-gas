# 踩坑紀錄（Pitfalls Log）

> 記錄開發與維護過程中踩過的坑：症狀 → 根因 → 教訓與防護。
> 新坑往上加，讓最近的教訓最先被看到。

---
## 2026-09-04 ｜ 元件測試裡 `el-tooltip` 包住的 DOM 全部消失，斷言抓到 0 個元素

**症狀**：新寫的 `StagePointsShareChart` 元件測試，`wrapper.findAll('.share-seg')`
永遠回傳 0 個，但同一個 wrapper 讀 `.hero-value`、`.legend-row` 都正常。
元件在瀏覽器裡明明畫得出來。

**根因**：`src/test/setup.ts:211` 的 `config.global.stubs` 把 `el-tooltip` 整個
stub 成 `true`（空殼 stub）。空殼 stub **不渲染 default slot**，所以任何被
`<el-tooltip>` 包住的內容在測試環境裡都不存在，渲染出來只剩
`<el-tooltip-stub></el-tooltip-stub>`。這一條對 `el-button`、`el-dialog`、
`el-row`、`el-col` 等同樣成立——清單裡 15 個以上元件都是空殼 stub。

**修法**：在該測試的 mount options 覆寫成只渲染 slot、不加包裹層的 stub：

```ts
global: {
  plugins: [ElementPlus],
  stubs: { 'el-tooltip': { template: '<slot />' } }
}
```

用 `<slot />` 當根（多根 template）而不是 `<div><slot /></div>`，是為了不多插一層
DOM，讓 `.share-bar > .share-seg` 這種父子／flex 結構在測試裡跟正式環境一致。

**教訓與防護**：

1. **測試斷言抓到 0 個元素時，先 `console.log(wrapper.html())` 看實際渲染。**
   看到 `xxx-stub` 就知道是全域 stub 吃掉了，不要往元件邏輯裡找。
2. **`config.global.stubs` 的空殼 stub 會吞 slot。** 只要測試需要斷言被
   Element Plus 容器包住的內容（tooltip、dialog、card、row/col 裡的東西），
   就得在該測試就地覆寫 stub，全域清單不要動（動了會影響既有測試）。
3. 正式環境沒這個問題：`el-tooltip` 用 `OnlyChild` 直接渲染唯一子節點、不加包裹層，
   所以放在 flex/grid 容器裡的子元素版面正常（`ProjectDetail.vue` 的 `.hud-tile`
   早就這樣用了）。

---
## 2026-09-04 ｜ 手機直向一進 dashboard 就被滿版通知抽屜蓋住

**症狀**：手機（直向）登入後進 dashboard，只要有未讀通知，通知中心抽屜就自動彈出來
把整個畫面蓋掉，要先手動關掉才看得到專案列表。橫向與桌機不會，因為抽屜只有 600px。

**根因**：兩件事疊在一起。

1. `MainLayout.vue` 的 auto-open watcher（`:589`）只看「有沒有未讀」和使用者偏好
   `autoOpenNotificationCenter`，完全沒有考慮螢幕方向。
2. 抽屜寬度是 `600px` 固定值（`NotificationCenter.vue:425` 的 `drawerSize`，
   只有 `variant="sidebar"` 才是 `100%`）。手機視窗寬度普遍小於 600px，
   所以「600px 的抽屜」在手機上就等於滿版。桌機看起來沒問題，是因為視窗夠寬。

**修法**：直向時不自動開，改成跳一則 toast 告訴使用者有幾則未讀、去左上角選單看。
偏好設定關掉 auto-open 的人依然完全不會被打擾（判斷放在 `autoOpen` 之後）。

順手修掉 `composables/useMediaQuery.ts` 的一個潛在雷：`isPortrait` 原本只在
`onMounted` 才第一次賦值，setup 階段讀到的一律是 `false`。凡是在 mount 前做方向判斷
（例如這次的 watcher，`{ immediate: true }` 會在 setup 就跑一次）都會誤判成橫向。
改成宣告 ref 時就用 `window.matchMedia` 取初始值。

**教訓與防護**：

1. **「自動彈出」類的行為要先問一句：在最小的螢幕上它會蓋掉多少？**
   桌機看不出問題不代表沒問題，px 固定寬度的抽屜／彈窗在手機上都是滿版。
2. **`onMounted` 裡才賦值的 ref，在 setup 階段是預設值。**
   `watch(..., { immediate: true })` 與 computed 的第一次求值都發生在 mount 之前，
   拿這種 ref 做判斷會安靜地走錯分支。需要在 setup 就正確，就在宣告時取值。

---
## 2026-09-04 ｜ 子組件把資料 emit 出去，父層卻讀自己那份永遠是空的 state 🔥

**症狀**：後台「群組帳號管理 → 存取者清單 → 專案存取權設定」裡，勾選一批人、
選好目標角色（教師／觀察者／成員）、按「轉換角色」，只會跳一句
「請選擇要更新的存取者」，什麼都沒發生。批次刪除同樣壞掉。
兩個入口（`GroupManagement.vue`、`ProjectManagement.vue`）都壞，症狀一模一樣。

**根因**：`ViewerManagementDrawer.vue` 自己持有勾選清單與目標角色
（`selectedViewers`、`batchRole`，`:466-467`），按下按鈕時把它們 emit 出來：

```ts
emit('batch-update-roles', { users: selectedViewers.value, newRole: batchRole.value })
```

但兩個父層的 handler **簽章不收參數**，改去讀自己檔案裡同名的 ref：

```ts
const batchUpdateRoles = async () => {
  if (selectedViewers.value.length === 0) {   // ← 父層這份從來沒人寫進去
    handleError('請選擇要更新的存取者')
    return
  }
```

父層那兩個 ref 是抽離 drawer 時留下的殘骸：勾選 UI 搬進子組件了，
state 卻兩邊都留著一份。父層那份永遠是 `[]`，所以每次都在第一個 if 就 return。
TypeScript 也擋不住——Vue 的 `@event="handler"` 對「handler 少收參數」是合法的。

**同一批程式碼還藏了第二個錯**：批次 API 回的是
`data.summary = { updated, unchanged, notFound }`（`handlers/projects/viewers.ts:1163`），
前端卻寫 `const { updated, unchanged, notFound } = response.data`，三個值全是 `undefined`。
就算第一個 bug 修好，成功訊息也會是空字串。這種錯只在「成功路徑」才會現形，
而成功路徑當時根本走不到，於是被上一個 bug 蓋住。

**教訓與防護**：

1. **把 UI 搬進子組件時，要連 state 一起搬走，不要留一份在父層。**
   留下的同名 ref 不會報錯，只會安靜地讓 handler 讀到空值。
   判斷法：抽離後在父層 grep 那個 ref，若只剩「被 handler 讀」沒有「被寫」，就是殘骸。
2. **`@event="handler"` 不檢查參數。** 子組件 emit 的 payload 型別再嚴謹，
   父層寫成無參數函式依然編譯得過。跨組件的資料傳遞要靠測試釘住，型別釘不住。
3. **每個 emit → API 的路徑至少要有一個測試斷言 payload 原封不動傳到底。**
   已補在 `ProjectManagement.spec.ts`「G. 存取者批次操作」：從 drawer stub emit，
   斷言批次 mutation 收到同一批 email 與角色。把 handler 改回舊寫法，該測試會紅。
4. **後端回傳巢狀 summary 時，前端解構要對齊。** 這類錯誤只在成功路徑現形，
   容易被前面的 early-return 蓋掉——修好一個 bug 之後，要把成功路徑整條再走一次。

---
## 2026-09-03 ｜ 寫好的 email 速率限制沒接上，任何人都能把全系統的寄信額度打光 🔥

**症狀**：沒有症狀——這是最麻煩的地方。`middleware/rate-limit.ts` 有 508 行完整的
email 速率限制程式碼，看起來一切正常，實際上**沒有任何一處 import 它**。
同一個檔案的 `aiRateLimitMiddleware` 有掛（`router/rankings.ts:476, 501, 571`），
所以掃過去會以為整檔都在服役。

**根因**：三層互相掩蓋。

1. **中介層是死碼**。`emailRateLimitMiddleware`、`batchEmailRateLimitMiddleware`
   從未被掛上任何路由。
2. **唯一「用到」的檢查永遠不會觸發**。`/admin/notifications/send-batch`
   呼叫 `getRateLimitStatus` 想擋批次寄信，但因為沒人呼叫 `updateRateLimitCounter`，
   KV 裡永遠沒有 `rate_limit:email:*` 這個 key，`remaining` 永遠等於 limit，
   `remaining === 0` 恆為 false。**讀了計數器，但沒人寫過它。**
3. **就算接上也不會準**。原本存在 KV：同一個 key 約每秒只能寫一次、讀取是最終一致。
   一節課 40 人同時登入打同一個計數器，KV 會嚴重漏算。

**看起來像防線、但都不擋的四樣東西**：

| 東西 | 為什麼不擋 |
|------|-----------|
| Turnstile | `wrangler.toml` 是 `TURNSTILE_ENABLED = "false"`；而且 `/resend-2fa`、`/verify-email-for-reset`、`/password-reset-verify-code`、`/login-verify-password` 的 schema 宣告了 `turnstileToken`，router 卻**從未呼叫 `verifyTurnstileMiddleware`**。加上 `TurnstileTokenSchema` 是 `z.string().optional()`，連有沒有給都不驗 |
| 前端 60 秒倒數 | `TwoFactorStep.vue` 的純 UI，curl 直接繞過 |
| Queue idempotency | key 含 `queueMessageId`，每次請求都不同，只防 Cloudflare 自己的重試 |
| 登入失敗鎖帳號 | 只分析 `login_failed`／`login_success`，而 `resend-2fa` 不產生 login event |

**後果**：不是騷擾，是 DoS。SMTP 走 Gmail 直連，額度是硬牆。有人打光額度之後，
**全系統**的登入驗證碼、邀請信、通知信都寄不出去。而且不用有攻擊者——
400 人的登入信（最多 400/日）＋ 通知彙整信（每次最多 400、每天 2 次）
＋ 期初邀請信（一次 400），正常操作就會撞牆。

**教訓與防護**：

1. **「有寫」不等於「有接」**。死掉的中介層比沒有中介層危險，因為它會讓人以為問題解決了。
   新增守衛時，同一個 commit 裡要有一個測試證明它真的會拒絕，不是只證明函式回傳正確。
2. **只讀不寫的計數器是永遠不會響的警報**。看到 `getXxxStatus()` 被用來做判斷時，
   先 grep 誰在寫那個計數器。
3. **KV 不是計數器**。同 key 每秒一寫、讀取最終一致。要精確計數就用 D1
   （單語句 upsert 是原子的）或 Durable Object。這次改用 D1，
   `rate_limit_counters` 表，測試用 `node:sqlite` 跑真的 SQLite 驗證 upsert 語意。
4. **限流的 key 選錯會製造新的 DoS**。兩個實例：
   - 學校整班 40 人共用一個 NAT 出口 IP，所以「每 IP 限制」只能套在**不需要密碼**
     的端點（重寄驗證碼、忘記密碼）。一般登入若也套，整班會互相把對方擠掉。
   - 若免密碼端點和登入共用同一個「每信箱」計數器，攻擊者狂打重寄就能耗光受害者額度，
     害本人也登不進來。所以拆成 `open`／`verified` 兩個獨立的桶。
5. **限流要在密碼驗證之後才扣**。在之前扣的話，任何人用錯誤密碼就能燒掉別人的額度。
6. **全域預算要分優先級，不能一刀切**。早上 8 點的通知彙整機器人若吃光當日額度，
   10 點上課的人就登不進來——被電子報鎖在門外。現在 bulk 用到 50%、normal 用到 65%
   就停，剩下的保留給登入驗證碼。
7. **對外部額度要用滾動視窗**。Gmail 算的是滾動 24 小時；用「每日午夜歸零」的固定視窗，
   跨日邊界會放行到 2 倍額度，剛好撞破上限。

**追記（2026-09-03 稍晚）｜ 反過來的坑：把「沒被 import」當成「防線缺口」**

修完速率限制後掃全庫找同類死模組，一口氣列了四項「防線沒接上」。
逐項查證後**三項是誤判**——它們都有另一支實作接手，我只看了 handler 沒看路由層。

最典型的是 `requireActiveOrVotingStage`：它確實沒人用，而且對應的
`stage-vote.ts:46` 撈了 `status` 欄位卻沒讀，看起來像鐵證。
實際上守衛在路由層的 `checkStageAcceptsRankings`（`utils/stage-validation.ts:48`），
掛在 5 條路由上，而且比死掉那支更嚴格。

**教訓（與上面那條互為鏡像）**：
在一個「同一件事有三四份實作」的 codebase 裡（見 issue #005、#006），
「這支死了」的**預設解讀應該是「另一支贏了」**，不是「沒人做這件事」。
判定順序必須是：
1. 先在 `router/` 找**同語意的路由**（不是同名函式）
2. 看那條路由呼叫誰
3. 呼叫別人 = 重構孤兒（刪）；查無路由 = 真的缺（補）

只 grep 函式名會同時產生兩種錯誤方向：
速率限制那次是**漏掉**真洞（死中介層看起來像活的），
這次是**捏造**假洞（活守衛換了名字看起來像沒有）。

**再追記（2026-09-03 清理死碼時學到的三件事）**：

1. **跨 package 的同名符號會製造假相依**。前端的 `groupBy`、`exportProject` 被判定為
   「參照了後端同名函式」。查證後：**全 repo 沒有任何一處 `import from '@repo/backend'`**
   （package.json 有宣告但原始碼沒用）。判定相依前要先確認**依賴方向真的存在**。
2. **註解會冒充使用**。`CommentVotingAnalysisModal.vue:654` 的
   「與後端 calculateCommentRankings 一致」讓那支函式看起來活著。掃描要先剝註解。
3. **連鎖孤兒必須迭代到收斂**。刪掉 `UserTableVirtual.vue` 之後，
   只被它使用的 `UserRow.vue` 才浮現；刪掉 `getUserStats` 之後，
   `getUserProjects` 才變成零參照。**跑到掃描回報 0 為止，一輪絕對不夠。**

另外，自動刪除程式碼時**不要去找配對的 `}`**——多行函式簽章會讓你提早在簽章的
收尾括號停住，留下孤兒函式體（後端這樣壞了三次）。改成
**「刪到下一個頂層宣告為止」**，前端 105 個符號一次過。
真正的保命符是 `tsc`：三次孤兒殘骸都是 TS1128 當場抓到的。

**修法落點**：`utils/rate-limiter.ts`（通用計數器）、`utils/email-budget.ts`（政策與優先級）、
`middleware/rate-limit.ts`（改用 D1）、`migrations/0006_add_rate_limit_counters.sql`。
守衛接在 `/auth/login-verify-password`、`/auth/resend-2fa`、`/auth/verify-email-for-reset`、
邀請碼發送／重送、管理員批次通知與重送郵件；全域預算接在 `services/email-service.ts`
的 `sendEmail`——那是每封信唯一都會經過的地方，含 cron 機器人。

**還沒修的**：Turnstile 那四支路由仍未驗證 token（見 issue.md B 區）。

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
