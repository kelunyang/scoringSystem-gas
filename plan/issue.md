# 疑難雜症與待決事項（Issues）

> 收「還沒解決的問題」與「已裁決、但值得封存免得重想的設計疑問」。
> 新項目往上加。
>
> **與 [pitfalls.md](pitfalls.md) 的分工**：
> - 本檔 = 未解決 / 已裁決但需留存結論
> - pitfalls.md = 已踩過並解決的事故（症狀 → 根因 → 教訓與防護）
>
> **流轉**：A 區項目修好後移出；若過程有教訓價值，轉寫成 pitfalls.md 條目。
>
> `issues_backlog.md.bak` 是 GAS 時代退役遺物（iframe 沙盒等），勿參考勿復活。

---

## A. 未解決 Issues

### #007 ｜ 邀請碼的 `targetEmail` 從未被比對 ｜ 中

**問題**：`scoringSystem-cf/packages/backend/src/handlers/auth/register.ts:332`
的 `validateInvitationCode(db, code)` 只收 code，簽名裡根本沒有 email 參數。
查詢是 `SELECT * FROM invitation_codes_with_status WHERE invitationCode = ? AND status = 'active'`
（`:341`），**沒有任何一處比對 `targetEmail`**。

但 `GenerateInvitationRequestSchema`（`packages/shared/src/schemas/invitations.ts:13`）
把 `targetEmail` 設為必填。

**後果**：發給 A 的邀請碼，B 只要拿到就能用，且能用任何信箱註冊。
實際控制只有「持有」。此行為在寫多角色測試 fixture 時被利用（一個碼註冊任意帳號），
確認可重現。

**待決**：這是刻意的「持有即有效」設計，還是漏檢？
- 若是刻意的：`targetEmail` 應改為 optional，或改名為 `sentTo` 以免誤導
- 若是漏檢：加上比對會影響「把碼轉寄給別人」的既有流程，需先確認實務用法

---

### #006 ｜ 前端有四套權限實作，其中兩套幾乎全死 ｜ 中

**問題**：`packages/frontend/src/composables/` 底下有四個各自計算權限的地方：

| 檔案 | 被誰用 | 實際被讀的部分 |
|------|--------|----------------|
| `useProjectPermissions.ts` | ProjectDetail.vue | 5 個旗標（`ProjectDetail.vue:1530-1534`） |
| `useDetailedProjectPermissions.ts` | Dashboard.vue → `project.permissions` | ProjectCard 讀 3 個 |
| `useProjectRole.ts` | Wallet.vue | **只有 `permissionLevel`**，其餘 9 個旗標無人讀 |
| `usePermissionConfig.ts` | 1 處 | 另一套機制 |

且**不是拿後端算好的答案**——`Dashboard.vue:532` 的 `calculateProjectPermissions(project, globalPermissions)`
是前端自己從 `viewerRole` + `userGroups` 重算一遍。

**已確認的死旗標**：
- `canManageMembers`：全前端只剩 `ProjectCard.vue:667` 的一行註解說它被移除了
- `canViewAll`：composable 算了但沒人讀

**已確認的分歧**：`useDetailedProjectPermissions.ts:65-66` 把
`create_project` 也算成 Level 0 管理員，後端的 `checkProjectPermission` 只認 `system_admin`。
目前無人觸發（唯一的 Global PM 兩個權限都有），但一旦開出「能開課、非系統管理員」的
帳號就會炸：按鈕全在，按下去全部 403。

**建議方向**：後端回專案資料時一併回傳 `permissions` 物件，前端直接用，不要自己算。
四套變兩套（一套判斷、一套顯示）。**優先度低於補測試**——前端算錯最多是按鈕多顯示或
少顯示，按下去後端還是會擋。

---

### #005 ｜ 71 段權限判斷的原始 SQL 尚未收斂 ｜ 中

**問題**：全庫仍有 16 個檔案直接對權限表寫 SQL 做授權判斷，重複的只有三件事：

```
自己查「是不是 system_admin」        30 次
自己查「是不是 teacher/observer」    24 次
自己查「是不是建立者」              17 次
```

2026-08-31 那一輪已修掉其中 6 段寫錯的（`u.userId = gu.userEmail`、
`global_user_groups` 表名、`createdBy === userEmail` ×2、缺 `isActive` ×4），
但**沒有逐一讀過全部 71 段**，剩下的錯誤比例不明。

**目標形狀**：除了一個模組，其他地方不准對權限表寫 SQL。
加一條 grep 守門（CI 或 pre-commit）：`handlers/` 與 `router/` 底下出現
`FROM globalusergroups` 就擋。

**前置條件**：多角色測試已在 2026-08-31 補上
（`packages/security-tests/tests/test_permission_matrix.py`，22 項），
但目前只覆蓋 canEnter／canSubmit／canManageStages／canTeacherVote／分組管理。
收斂前應先把斷言補到覆蓋這三類判斷的主要呼叫點。

---

### #004 ｜ WebSocket 端點路徑不符，4 個測試長期跳過 ｜ 低

**問題**：`packages/security-tests/tests/test_websocket.py` 連 `/ws/notifications`
拿到 404「Endpoint not found」，4 個測試因此 skip。
`index.ts:251` 掛的是 `app.route('/ws', websocketRouter)`，實際子路徑待確認。

**後果**：WebSocket 的認證與授權從未被測試覆蓋。

---

以下三項皆已讀原始碼確認，非推測。均為 2026-07-17 討論 JWT 認證機制時順帶挖出。

### #001 ｜ 2FA 帳號鎖定實際上沒生效 🔥 高

**問題**：`lockUntil` 只在 `scoringSystem-cf/packages/backend/src/handlers/auth/login.ts:113`
的 `authenticateUser()` 內被檢查，但該函式 grep 全庫**只有 `tests/handlers/auth/login.test.ts` 呼叫**——
線上沒有任何路由用到它。

實際的線上路由是 `scoringSystem-cf/packages/backend/src/router/auth.ts:302`
`POST /auth/login-verify-password`，它只檢查 `status === 'disabled'`，
**不看 `lockUntil`，也不觸發「5 分鐘內 3 次失敗即停用」的 Layer 1 同步防護**。

**後果**：
1. `check2FAFailureAndLock`（`login.ts:837`）鎖定帳號後（3 次鎖 15 分／5 次鎖 1 小時／7 次永久），
   使用者**仍能通過密碼驗證**進到 2FA 步驟——鎖等於白鎖。
2. 密碼暴力破解缺乏同步節流。Layer 2（`queues/login-events-consumer.ts`）是非同步的，
   batch 10 / 30s timeout，有 30 秒以上延遲；期間只有 `status === 'disabled'` 擋得住。

**注意**：測試全綠，因為測試打的是 `authenticateUser()`——那個沒上線的函式。
這正是「測試覆蓋到的不是線上路徑」的典型。

---

### #002 ｜ 改密碼／重設密碼無法撤銷既有 JWT ｜ 中

**問題**：JWT 是 bearer token，簽發後在 exp 前恆有效。改密碼不會讓舊 token 失效。
`scoringSystem-cf/packages/backend/src/handlers/auth/password-reset.ts:580-593`
已有 TODO 承認此事並列出兩個選項。

**後果**：舊 token 最長可用滿 24 小時（`SESSION_TIMEOUT = 86400000`）。
更糟的是 sliding expiration（`middleware/auth.ts:97-116`，token 壽命過半即重簽）
會讓被竊 token **無限續期**——只要每 12 小時用一次就永不過期。

**建議解法（不必放棄 JWT）**：加 `users.password_changed_at` 欄位或 token version，
在 `middleware/auth.ts` **既有的** D1 查詢裡一併比對。
該 middleware 每個 request 本來就查 D1 兩次（`users.status` + 全域權限），
所以增量成本趨近於零——stateless JWT 省 DB 查詢的好處我們早就沒在享受了。

**不要**因為這個問題而改用 server-side session，理由見 B 區。

---

### #003 ｜ 文件與實作不符：PBKDF2 迭代數 ｜ 低

`.claude/CLAUDE.md` 寫 PBKDF2-SHA256 **600,000** iterations，
但 `scoringSystem-cf/packages/shared/src/utils/password.ts:19` 實際是 **100,000**。

**這是 Cloudflare Workers 的硬上限**，不是實作偷懶——原始碼註解已載明：
「Pbkdf2 failed: iteration counts above 100000 are not supported」，
且註記 OWASP 建議 600,000。

**該修的是文件，不是程式。**

---

## B. 已裁決的疑問（封存，勿重啟）

### 2026-08-31 ｜ `utils/permissions.ts` 和 `middleware/permissions.ts` 該留哪一套？→ 兩套都留，它們是不同層

**疑問**：兩個檔案對每個角色的定義都不一樣，看起來是同一件事的兩份實作，該合併成一套。

**結論**：不是競爭關係，是**分層**。合併會出事。

**證據**：

`utils/permissions.ts` 的 `PROJECT_PERMISSIONS` 共 24 個權限，
**沒有 `submit`、沒有 `vote`、沒有「發表留言」**。跟 comment 有關的只有兩個：

```
MODERATE_COMMENTS: 'moderate_comments'   ← 管別人的留言
DELETE_ANY_COMMENT: 'delete_any_comment' ← 刪別人的留言
```

全部 24 個都是「你能對別人的東西做什麼」——它是**角色能力表**，
從來不打算回答「學生能不能交作業」。

而交作業／投票實際上怎麼擋？`router/submissions.ts:70` 的註解寫得很清楚：

```
// Check basic project access - handler will verify group membership
checkProjectPermission(..., 'view')
```

router 只擋「進不進得來」，真正的資格（有沒有在分組裡、階段開了沒）由 handler
自己查 `usergroups` 和 stage 狀態。

實際用到的權限字串統計：`'view'` 36 次、`'manage'` 22 次、`'comment'` 2 次，
**`'submit'` 和 `'vote'` 各 0 次**——middleware 白名單裡那兩個是死字彙。

**所以正確的理解是**：

| | 在回答什麼 |
|---|---|
| `middleware/permissions.ts` | 門口的粗略關卡：進不進得來、大概哪一級 |
| `utils/permissions.ts` | 門內的角色能力表：這個身分能行使哪些權力 |
| 交作業／投票資格 | 不歸權限系統管，靠分組成員資格 + 階段狀態 |

**推論**：早先「utils 認為學生連交作業都不行，所以 utils 是壞的」這個判斷是誤讀，
已撤回。utils 的 member 只給 `view_project` 是正確的——在它的字彙裡，交作業不是一種
「權力」。

**但 utils 確實沒寫完**：它宣告的 24 個權限中有 13 個從未發給任何角色，包括
`manage_groups`、`manage_members`、`invite_members`、`delete_project`、
`edit_project_settings`、`create_stages`/`edit_stages`/`delete_stages`、
`reverse_transactions` 等。老師的白名單只有 9 個，`manage_groups` 不在裡面——
所以就算當初改成傳 `'manage_groups'` 給 utils，老師一樣建不了分組。

**待辦（未決）**：那 13 個要一個一個決定發給誰，還是先用一條「老師 = 專案內全部管理權」
的粗規則？目前傾向後者，細分等真有需求再拆。

---

### 2026-08-31 ｜ 五個角色的能力邊界（依使用者裁決）

**背景**：合併權限實作前必須先確定角色語意，否則會在大 diff 裡順手替使用者做產品決策。
以下為 2026-08-31 逐題確認的結果。

| 問題 | 裁決 |
|------|------|
| 系統管理員該有全部權限嗎？ | **純行政**。可開關階段、改設定、看全部、管錢包、刪別人留言；**不能**自己發言、交作業、投票。使用者每次進專案都會切換身分，需要留言時是以老師身分 |
| 建立者跟老師是同一件事嗎？ | 老師可以建立自己的專案，建立者視同該專案的完整權限持有者 |
| 老師能改錢包／發點數嗎？ | 可以，限自己的專案 |
| 觀察者看得到什麼？ | 專案內**全部資訊**，跟老師的差別只在**不能操作** |
| 組長比組員多什麼？ | 依 `utils/permissions.ts` 現有定義（`view_all_submissions`、`invite_members`） |

**實作對照結果**：

- 管理員純行政 → `middleware/permissions.ts:247` 維持 `['manage', 'view']`。
  曾一度依「管理員什麼都有」改為全部通過，確認裁決後**已退回**，行為與原本完全一致，
  只補上說明註解與裁決日期
- 觀察者看全部但不能操作 → 已符合。錢包**寫入**擋 `'manage'`（觀察者被擋），
  **讀取**走 `checkIsTeacherOrAbove`（觀察者通過）
- 老師改錢包 → 已符合，錢包寫入擋 `'manage'`，老師通過
- 前端有三處 `canComment: false, // Admins don't comment` 與此裁決一致，不需更動

**注意**：`utils/permissions.ts:186` 的 `hasProjectPermission` 對 system_admin 是無條件
`return true`。這與「純行政」看似矛盾，但不衝突——utils 的字彙裡沒有 comment/submit/vote，
它回答不了那個問題（見上一條）。

---

### 2026-08-31 ｜ 該不該重構權限層？→ 該，但順序是「先修洞、再補測試、最後才合併」

**疑問**：發現八份實作各自為政後，是否應直接重構成一套。

**結論**：不要直接跳到合併。理由是**失敗方向會反轉**。

現在那些壞掉的路徑是 fail-closed：SQL 對著不存在的欄位查 → 拋錯 → 被 `catch` 吞掉
→ `return false` → 拒絕。壞掉 = 擋住。

合併成一支能跑的實作之後，這些路徑會**開始真的放行**。也就是重構的淨效果是
「一次放寬十幾個授權點」，而當時沒有任何測試能分辨「這是修好了」還是「這開太大了」。

**實證**：2026-08-31 補上多角色測試後，第一次跑就抓到
`projects/manage.ts` 的 `checkProjectAccess` 漏查 `projectviewers`；
而**修正的第一版開太大**（放行了任何 `projectviewers` 列，連沒分組的成員都能讀專案），
也是測試立刻擋下來的。沒有測試的話這兩件事都會靜默上線。

**已完成的順序**：
1. 修安全洞（撤銷失效、壞掉的 SQL、子字串比對）
2. 換 import 修老師的分組權限
3. 刪死碼（5 支查不存在欄位／表的函式）
4. 補多角色測試 fixture ← **合併的前置條件**

**剩下**：第 5 步（71 段 SQL 收斂）見 A 區 #005。

---
### 2026-08-30 ｜ Email 2FA 恢復自動寄信（撤回 2026-07-06 的 SMTP 防禦性調整）

**背景**：commit `0648802`（2026-07-06）把「密碼驗證通過即自動寄出第一封驗證信」
改成使用者手動按鈕觸發，理由是當時 SMTP 會退信、信件常寄不出去，
自動寄信會讓倒數計時在信根本沒送出時就開跑。

**現況**：SMTP 已修好，不再退信。

**裁決**（`packages/backend/src/router/auth.ts` `login-verify-password`）：
**只有「沒有 passkey／TOTP」的使用者**在密碼驗證通過後自動收到驗證信
（產碼、存檔、寄出，回傳 `emailSent: true` 與 `expiresAt`，前端直接進入倒數）。
寄送失敗對這類使用者是致命的（email 是他唯一的第二因素），維持回 500 `EMAIL_ERROR`。

**已啟用 passkey／TOTP 的使用者不寄信**，`preferredMethod` 維持 passkey > totp > email。
理由：他們登入時根本不會用到那封信，每次登入都寄等於製造垃圾信與無謂的 SMTP 負載。
email 仍留在 `availableMethods` 當備援分頁，但那條路徑的第一封信只在使用者
主動按「寄發密碼驗證信」時才寄（走 `resend-2fa`）。

**曾經考慮過並否決**：把 email 設成所有人的預設分頁。預設分頁要能直接輸入，
信就得先寄出去 —— 代價是 TOTP／passkey 使用者每次登入都收信，不划算。

**順帶修正**：忘記密碼流程的 step 1 本來就會寄碼，但 `ForgotPasswordForm.vue`
沒有把寄送時間傳給 `TwoFactorStep`，導致畫面顯示「請點擊下方按鈕寄信」的手動按鈕，
與實際狀態不符。已補上 `lastEmailSentAt`。

### 2026-08-30 ｜ Email 2FA 驗證碼改為 6 位純數字後，後端如何分辨 email OTP 與 TOTP？→ 由前端明示 `method` 欄位

**背景**：Email 2FA 原本是 12 碼（A-Z 去除 I/O，加 @#!，格式 XXXX-XXXX-XXXX），
與驗證器的 6 位數字明顯不同，因此
`packages/backend/src/router/auth.ts` 的 `login-verify-2fa` **靠碼的長相分流**：
6 位數字 → TOTP、8 碼 → 備用碼、其餘（12 碼）→ email OTP。

**問題**：把 email 碼改成 6 位數字後，兩者長相完全一樣，格式分流失效。
對「已啟用 TOTP 但選擇改收 email 驗證信」的使用者（email 是全域 fallback），
6 位數字會被誤判成 TOTP，走錯驗證路徑而必定失敗。

**裁決**：請求體新增 `method: 'email' | 'totp'`（`packages/shared/src/schemas/auth.ts`
`LoginVerify2FARequestSchema`），前端 `TwoFactorStep.vue` 依當前分頁送出；
後端優先依 `method` 分流，`method` 缺席時才退回舊的格式判斷（相容尚未更新的前端）。
8 碼備用碼不受影響，一律走 TOTP 路徑。

**為何不用「先試 TOTP、失敗再試 email」**：兩條路徑各自有嘗試次數與漸進式鎖定
（`check2FAFailureAndLock`），互試會讓一次輸入吃掉兩邊的失敗額度，鎖定行為變得不可預期。

**熵的取捨**：6 位數字約 19.9 bits，遠低於原本的約 57 bits。安全性改由周邊控制承擔——
10 分鐘有效期、單碼 3 次嘗試上限、漸進式帳號鎖定。此為與驗證器體驗一致的刻意取捨。
（注意：A 區 #001 指出漸進式鎖定目前並未真正生效，該項修好前這裡的防護是打折的。）

### 2026-07-17 ｜「用 KV 快取取代 D1 查詢會不會更快？」→ 會，但代價打在要害上。目前無必要

**背景**：`middleware/auth.ts` 每個請求查 D1 兩次（`users.status` + 全域權限），
直覺上像是可以用 KV（edge-cached，個位數毫秒）取代。

**KV 確實比較快**：KV 熱資料是 edge-cached；D1 非邊緣複製，有單一 primary location，
遠端 region 讀取需跨洲 round-trip。**效能差距是真實的。**

**但 KV 是最終一致的**（寫入最多 60 秒才全球傳播），而那行 D1 查詢的存在意義，
`middleware/auth.ts:78` 註解寫得很清楚：`// 3. Check user status in database (real-time disabling)`。
把 status 搬進 KV = 管理員停用帳號後對方仍可用最多 60 秒 —— **為了省幾十毫秒，
把「即時停權」換成「大概一分鐘內」，而那正是這行程式碼唯一的功能。**

這與 CacheService 的困境**是同一個形狀**：快取層贏效能、輸撤銷能力，而撤銷正是我們要的。

**裁決**：目前無必要，且**沒有任何實測數據支撐「D1 太慢」這個前提** ——
D1 的 primary 位置、實際 p50/p99、使用者地理分布都未知。
為了未證實的效能問題去換掉正在運作的安全機制，順序是反的。

**若日後真的量到慢**：正解不是 KV，而是 **D1 Read Replication（Sessions API）** ——
Cloudflare 官方機制，讀取走就近複本且保有一致性保證，不必犧牲即時停權。

---

### 2026-07-17 ｜「GAS CacheService（server-side session）是否比 JWT 安全？」→ 否

**技術上不可行**：CacheService 是 Google Apps Script runtime 專屬 API，CF Worker 呼叫不到。
目前開發版本是 `scoringSystem-cf/`。

**這不是新方案，是我們已經遷移離開的舊方案**：舊 GAS 版本本來就用 CacheService 做 session
（`GAS/scripts/auth.js`，token 是 `sess-` 前綴的隨機 UUID，PropertiesService 僅 fallback）。

> **易誤讀，特此澄清**：GAS 版**有**用 CacheService，而且它是 session 的**主要儲存**
> （`auth.js` 的 83、175、278、306 行），這部分實作正常。
> 形同虛設的是**記憶體 Map** —— `auth.js:7` 的 `sessionCache` 與 `database.js:377` 的 `dataCache`。
> GAS 每個請求都是全新 instance，module-level 變數不跨請求存活，這兩層永遠是空的。
> 所以 GAS 的問題不是「沒用 CacheService」，而是「在 CacheService 前面疊了一層永不命中的假快取」。
> （同一個原因也導致登入速率限制被移除，見 `plan/GAS/propertiesService.md`。）

**GAS 為何非用 CacheService 不可 —— 是效能，不是安全**：GAS 的「查庫」是讀 Google Sheets。
`GAS/scripts/database.js:376` 的 `readGlobalData()` 為了驗一個 session，
會 `readFullSheet()` **整整五張表**（Projects / Users / SystemConfigs / InvitationCodes / GlobalGroups），
無 WHERE、無索引、純全表掃描。Sheets 單次讀取動輒數百毫秒到數秒 ——
每請求這樣搞不可能。**CacheService 是救命稻草，不是安全設計。**

**它拿不到 server-side session 唯一值錢的優勢**：server-side session 勝過 JWT 的地方只有
**可撤銷性**，而 CacheService **不支援 key 列舉**，做不到「撤銷某使用者的所有 session」——
`GAS/scripts/password_reset.js:337-347` 的註解就是當初想做卻放棄的現場證據。
等於付了 server-side session 的成本，卻沒拿到它唯一的好處。

**其他面向是平手——此處最容易誤判**：
- opaque session ID 存 sessionStorage，跟 JWT 存 sessionStorage，**XSS 竊取難度完全相同**。
  攻擊者不需要看懂 token，拿去用就行；session ID 不會因為是隨機字串就比較難偷。
- 真正決定防竊的是 **token 存在哪裡**（httpOnly cookie），這與 session/JWT 的選擇**正交**。
  可以把 JWT 放進 httpOnly cookie，也可以把 session ID 丟在 localStorage 裸奔（GAS 版就是後者）。
- GAS 版反而更差：session ID 是 `Math.random()` 產的 UUID，**無簽章**；JWT 至少有 HMAC，偽造不了。

**CF 版在架構上確實已比 GAS 版安全**：
| 面向 | GAS 版 | CF 版 |
|------|--------|-------|
| 密碼雜湊 | SHA-256 迭代 10 輪 | PBKDF2-SHA256 100,000 輪 |
| Token | 無簽章隨機 UUID | HS256 簽章 JWT |
| 前端儲存 | localStorage | sessionStorage |
| Rate limit | **不可能**（每請求新實例，`auth.js:7` 的 `Map` 形同虛設） | 可跨請求共享 |
| 威脅偵測 | 無 | Queue 非同步分析（分散式攻擊、地理／裝置異常） |
| Turnstile | 無 | 有（目前 `TURNSTILE_ENABLED = "false"`） |

**關鍵架構差異：D1 不是 JWT 的驗證機制**（此點易誤解，且是 #002 成本估算的基礎）：

JWT 是**自我驗證**的 —— HMAC 簽章 + exp，純運算，`verifyToken()` 不碰資料庫。
D1 是在驗證**通過之後**才登場，做兩件**補充**的事：即時停權檢查、權限查詢。
GAS 剛好相反：`sess-xxxx` 那個 UUID **本身沒有任何意義**，純粹是一把查表的鑰匙。

| | GAS | CF |
|---|---|---|
| Token 效力來源 | 查得到 CacheService 才有效 | **簽章本身即有效** |
| 儲存層掛掉 | token 全部失效 | token 仍有效，只是暫時無法服務 |
| 儲存層角色 | **唯一真相**（必需） | **補充檢查**（可選） |

正因為 D1 這層是「可選的補充」而非「必需的真相」，才能用極低成本加強它。

**結論**：要補撤銷能力，做 #002 的 token version 即可 —— 只是在那個**本來就在跑**的 `SELECT`
上多帶一個欄位比對，不多一次 round-trip。既保留 JWT 自我驗證的韌性，又補上撤銷能力，
這是 GAS 架構下拿不到的組合。不需要放棄 JWT，更不需要繞回 GAS。
