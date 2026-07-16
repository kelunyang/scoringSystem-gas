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
