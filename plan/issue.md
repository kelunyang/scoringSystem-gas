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

### #009 ｜ 死模組普查：重構殘骸清單 ｜ 已完成清理

> **2026-09-03 完成**：前後端皆已清理。合計 110 個檔案異動、
> **刪除 15 個整檔、淨減約 11,150 行**。四道驗證全過。
> 刻意保留未刪的兩項與理由見本條目末段。

**背景**：2026-09-03 修 email 速率限制時發現 508 行中介層從未被 import。
既然踩過一次，就把整個 codebase 掃一遍。

**結論先講**：**沒有找到新的破洞。** 初判列了四項「防線沒接上」，
逐項查證後三項是誤判——它們都有**另一支實作接手**，只是我只看了 handler 沒看路由層。
剩下的全部是**重構殘骸**：功能還在、由新版服務，舊版沒清掉。
本條目因此從「破洞普查」改為「清理清單」，嚴重性由高降為中。

**掃法**：對每個 `export function/const/class`，分別數「其他檔案的參照」「同檔案內的參照」
「只有測試用到」，三者皆無即為死碼。腳本邏輯見本條目下方註記。

---

#### 甲級：原判「防線沒接上」——**四項有三項是誤判，已全部撤回**

**2026-09-03 當日更正。** 初判把「沒被 import」直接當成「防線缺口」，
沒有先確認**是不是另一支實作接手了**。這個 codebase 的既有病症正是
「同一件事有三、四份實作」（見 #005、#006、pitfalls 2026-08-31），
所以「這支死了」的正常解讀是**「另一支贏了」**，不是「沒人做這件事」。

**甲-1（撤回）｜ 學生階段投票其實有守衛，而且比死掉那支更嚴格**

原判：`requireActiveOrVotingStage` 沒人用，且 `stage-vote.ts:46` 撈了 `status` 沒讀
→ 推論「階段狀態沒檢查」。

**錯。** 守衛在**路由層**，我只看了 handler：
`utils/stage-validation.ts:15` 的 `checkStageAcceptsRankings` 做的正是同一件事
（`:48` `status !== 'active' && status !== 'voting'` → 拒絕），
而且多擋了 `settling`（`:31`）和 `completed`（`:39`）兩種狀態。

它掛在 **5 條路由**上：

| 位置 | 路由 |
|------|------|
| `router/rankings.ts:358` | `/rankings/stage-vote` |
| `router/rankings.ts:296` | `/rankings/vote`（先查提案的 stageId 再驗） |
| `router/rankings.ts:262` | `/rankings/teacher-comprehensive-vote` |
| `router/rankings.ts:222` | `/rankings/proposals` |
| `router/comments.ts:411` | 留言相關 |

所以 `stage-vote.ts` 內不讀 `status` 是**正確的**（路由層已擋）。
`requireActiveOrVotingStage` 是**被取代的第三套實作** → 移至丙級（重構孤兒，可刪）。

**甲-2（保留，但不是新發現）｜ 邀請碼比對函式沒接上**

`handlers/invitations/validate.ts:140` 的 `validateInvitationCodeForEmail` 無人呼叫，
其 JSDoc（`:138`）宣稱「This is called during user registration」——這句是假的。

**洞是真的，但它就是既有的 #007**，普查之前已知且已記錄。
本條的價值只在於：它證明 #007 **偏向漏檢而非刻意設計**——
沒有人會刻意寫一支比對函式再刻意不用它。修法所需的程式碼早就寫好了。

**甲-3（撤回）｜ 前端 UI 是有擋的，只是沒用那個元件**

原判：`PermissionGate.vue` 沒人 import → 推論「權限閘門是死的」。

**錯。** 全前端有 **43 個 .vue 檔**用 `v-if` + 權限旗標直接控制顯示。
`PermissionGate.vue` 是一個**沒被採用的宣告式抽象**，不是缺口
→ 移至丙級（可刪，或反過來推廣它以收斂 #006 的四套實作）。

**另註**：前端權限控制本來就只是 UX，真正的閘門在後端。
就算某個 UI 沒擋，也是體驗問題不是安全問題。

**甲-4（保留，但不是「壞掉」）｜ Turnstile 輔助函式死掉**

`getTurnstileConfig`、`checkTurnstileConfiguration` 無人呼叫。
但 Turnstile 整套本來就是關的（`TURNSTILE_ENABLED = "false"`），
所以這是「第二道防線沒開」，不是「防線壞了」。已記錄於 #008。

---

**甲級結論：這次普查沒有找到任何新的破洞。**
唯一的真洞（#007）在普查之前就已知。其餘全是重構殘骸。

---

#### 乙級：整條管線空轉（Cloudflare 資源配了沒用）

**乙-1 ｜ 排程機器人從來沒有自動跑過，而且解開也會爆**

- `wrangler.toml:184-185`：`[triggers]` / `crons` **整組被註解掉**
- `index.ts:387`：`scheduled` handler **也是註解**
- 註解中的程式碼 import `./handlers/robots/security-patrol`，
  但 **`src/handlers/robots/` 底下只有 `notification-patrol.ts`，那個檔案不存在**

**後果**：通知彙整信「每 12 小時自動寄」是文件上的幻覺，實際只有管理員手動打
`POST /admin/robots/notification-patrol`（`router/admin.ts:1593`）才會跑。
安全巡邏機器人完全不存在（`EmailTrigger.SECURITY_PATROL`、
`queueSecurityReportEmail` 都是死的）。

**2026-09-03 補充（使用者指出）**：這兩隻機器人的工作實際上已被取代——
即時 WebSocket 通知（NotificationHub DO）＋前端通知面板，讓「彙整信」失去存在意義。
所以這不是「壞掉沒修」，是「功能被淘汰但殘骸沒清」。

**✅ 2026-09-03 已清理**：

| 清掉的東西 | 位置 |
|-----------|------|
| 註解掉的 cron 設定區塊 | `wrangler.toml`，換成一段說明「為何刻意沒有 cron」 |
| 註解掉的 `scheduled` handler（102 行） | `index.ts`——它 import 的 `handlers/robots/security-patrol` 根本不存在，解開必爆 |
| `security-patrol-ws` 的註解 import 與 route | `index.ts` |
| 整條安全巡邏報告信路徑 | consumer case、`buildSecurityReportEmailContent`、zod schema、`EmailTrigger.SECURITY_PATROL`、優先級對應 |

**保留**：`handlers/robots/notification-patrol.ts` 與 `/admin/robots/notification-patrol/*`
路由——前端 `api/admin.ts:502-520` 有在用，是**手動觸發**的活功能。

**順帶更正一則過時註解**：`wrangler.toml` 的 `[limits]` 區塊原本寫
「CPU limits require paid plan - commenting out for free plan」。
本專案用了 Queues 和 Durable Objects，**本來就是付費方案**，這句是錯的。
已改寫並指向乙-2 的同步結算 CPU 議題。

**過程中的一個發現**：刪掉 `EmailTrigger.SECURITY_PATROL` 後 `tsc` 沒有報錯，
是**單元測試**抓到的（測試裡引用了該列舉成員）。原因是
`packages/backend/tsconfig.json` 沒有把 `tests/` 納入編譯範圍，
所以型別檢查涵蓋不到測試檔。這本身是個小坑。

**副作用**：這讓每日 email 用量比原先估的低——2026-09-03 的預算估算
把「彙整信每天自動跑 2 次、每次最多 400 封」算進去了，實際不會發生。
預設值偏保守，不需要改，但心裡要有底。

**乙-2 ｜（已解決，2026-09-03 刪除）settlement-queue 從來不可能運作**

原判：`queueSettleStage` 沒人呼叫，整條非同步結算管線空轉。

**再查證後發現比「沒人用」更徹底——它依賴的 `settlementtasks` 表在任何 migration 裡都不存在。**
就算真的送訊息進去，consumer 第一步 `SELECT ... FROM settlementtasks`（`settlement-consumer.ts:36`）
就會炸 `no such table`。所以這不是「寫好沒接」，是**從未完成、也從未能運作**的半成品。

這也讓「接回去」不成為選項：要啟用得先補一支 migration 建表，
等於重做，而不是接線。**已全部刪除。**

**刪除範圍**：

| 刪掉 | 說明 |
|------|------|
| `queues/settlement-producer.ts`、`queues/settlement-consumer.ts` | 整檔 |
| `notifySettlementFailed` | 連鎖孤兒——它是唯一「活著」的 notify 包裝，但唯一的呼叫點就在死掉的 consumer 裡 |
| `SettlementQueueMessageSchema` / `SettlementQueueMessage` | `queues/types.ts` |
| `SETTLEMENT_QUEUE` binding | `types.ts` |
| queue router 的 `case 'settlement-queue'` 與 import | `index.ts` |
| producer binding、consumer 設定、`settlement-dlq` | `wrangler.toml` |

**保留**：`settlement_failed` **通知類型**——`handlers/wallets/transactions.ts:316,449`
有在發，前端 `NotificationManagement.vue` 也有對應 UI。死的只是那個型別化包裝。

**待辦（不是程式碼）**：Cloudflare 帳號上的 `settlement-queue` 與 `settlement-dlq`
兩條佇列現在沒有任何 Worker 綁定，成了孤兒資源。空佇列不計費，
但建議到 dashboard 手動刪除以免日後困惑。

#### 現行結算管線（釐清用）

結算**一直都是同步的**，DO 只是進度條的通道：

1. 教師按下結算 → `POST /api/scoring/settle`（`router/scoring.ts:94`）
2. 權限檢查 `checkProjectPermission(..., 'manage')`
3. **同步** `await settleStage(...)`（`handlers/scoring/settlement.ts:310`，774 行單一函式）
4. 過程中透過 `NOTIFICATION_HUB` Durable Object 用 WebSocket 推
   `settlement_progress` 給該教師（`settlement.ts:106-111`）
5. 前端 `MainLayout.vue:782` 收到事件更新進度條
6. 算完，結果直接由 HTTP response 回傳

所以是「**同步計算 ＋ DO 推進度 ＋ response 回結果**」。
教師按下去看得到進度條、也馬上拿得到結果，設計是連貫的。

**唯一殘留風險**：774 行同步跑在 request 裡，而 `wrangler.toml` 的
`[limits] cpu_ms` 仍是註解狀態（用預設值）。建議實測真實專案規模下的耗時；
若逼近上限，把 `cpu_ms = 30000` 解開即可，不需要改架構。

---

**乙-3 ｜（已撤回，降為丁級）通知系統是活的，死的只是 16 個便利包裝**

**初判錯誤，2026-09-03 當日更正。** 原本寫成「一整套站內通知寫好了沒接」，是錯的。

實際情況：`queueSingleNotification` 被呼叫 **37 次**、`queueBatchNotifications` **11 次**，
遍布 `handlers/` 底下十幾支（admin/users、auth/login、comments/manage、groups/members、
projects/viewers…）。通知面板與 WebSocket 廣播都正常運作。

死的是 16 個**型別化便利包裝**（`notifySubmissionCreated` 之類），
它們只是把資料組好再呼叫泛用版；呼叫端選擇直接用泛用版、自己組資料。

比對「實際產生的 type」與「包裝覆蓋的 type」，只有四個 type 沒有任何地方產生：

| 未產生的 type | 是否真的缺 |
|---------------|-----------|
| `ranking_proposal_submitted` | 可能真的缺 |
| `ranking_proposal_withdrawn` | 可能真的缺 |
| `stage_status_changed` | 否，已被更細的 `stage_paused` / `stage_resumed` / `stage_settled` 取代 |
| `submission_withdrawn` | 否，已被 `submission_force_withdrawn` 取代 |

**結論**：16 個包裝是純死重量（丁級可刪）。唯一值得追的是排名提案送出／撤回
要不要通知組員——那是產品問題，不是死碼問題。

---

#### 丙級：功能寫了但路由不到（後端 handler 無人呼叫）

| 模組 | 死掉的 handler |
|------|----------------|
| comments | `deleteComment`、`updateComment`、`getTargetComments`、`getBatchCommentReactions`、`calculateCommentRankings` |
| submissions | `compareSubmissionVersions`、`getGroupVersionHistory` |
| stages | `deleteStage` |
| wallets | `getWalletLeaderboard`、`getGroupWealthStats`、`getAllProjectTransactions`、`getUserWallet` |
| scoring / settlement | `previewStageScores`、`getSettledStageResults`、`getSettlementTransactions` |
| projects | `exportProject` |
| invitations | `getAllInvitations`、`deleteInvitation`、`cleanupExpiredInvitations` |
| admin / system | `getSystemEventLogs`、`getSystemHealth`、`getNotificationStatistics`、`getSecretsChecklist` |
| ai-service | `getAIServiceCallsByProject`、`updateBTProgress`、`createMultiAgentSubCall`、`updateMultiAgentSubCall` |

前端另有 **10 個 .vue 元件無人 import**（`PermissionGate`、`PlaceholderPage`、
`BatchSelectionBar`、`UserListFilters`、`UserTableVirtual`、`AvatarCustomizer`、
`GlobalGroupBatchActions`、`ProjectGroupBatchActions`、`GroupFilters`、`GroupStatsBar`）
與約 20 個死 composable（`useAvatarManagement`、`useInvitations`、`useProjectCRUD`、
`useStageManagement`、`useBatchOperations` 全套等）。

**2026-09-03 抽驗結果：丙級大多是「重構後的孤兒」，不是「功能沒做完」。**

使用者質疑「前端明明有這些功能」——查證後**使用者是對的**，
但這反而確認了處置方向是刪除：功能還在，只是**由另一支實作在服務**，死的是被取代的舊版。

| 功能 | 前端有？ | 實際服務它的路由與函式 | 死掉的舊版 |
|------|---------|------------------------|-----------|
| 錢包排行榜 | 有（`Wallet.vue`、`ProjectDetail.vue`） | `/wallets/project-ladder` → `getProjectWalletLadder` | `getWalletLeaderboard` |
| 成果版本歷史 | 有 | `/submissions/versions` → `getSubmissionVersions` | `getGroupVersionHistory`、`compareSubmissionVersions` |
| 錢包匯出 | 有 | `/wallets/export` | — |

**例外（確認是真的沒有的功能）**：

- **刪除留言／編輯留言**：後端 `router/comments.ts` **沒有 `/delete` 或 `/update` 路由**；
  前端 `types/composables.ts:116` 的 `deleteComment` 只是**沒人實作的介面型別宣告**；
  `UserActivityDetail.vue:177` 的 `delete_comment` 是活動日誌的**標籤字典**，不是功能。
- **刪除階段**：`router/stages.ts` 只有 create/get/update/list/clone/pause/resume 等，
  沒有 `/delete`；`types/composables.ts:152` 同樣只是型別宣告。
- **`/wallets/group-stats`**：`router/wallets.ts:15` 的**檔頭註解宣稱有這個路由，實際不存在**，
  對應的 `getGroupWealthStats` 也是死的。文件與實作不符。

**判斷方法（要重驗時）**：對每個死 handler，先在 `router/` 找有沒有同語意的路由，
再看那條路由呼叫的是誰。呼叫別人 = 重構孤兒（刪）；查無路由 = 功能沒做完（產品決定）。

---

#### 丁級：純殘留，可直接刪

- `db/operations.ts` 整支（`executeQuery`、`executeBatch`、`readGlobalData`、
  `readProjectData`、`insertRow`、`updateRow`、`deleteRow`）——GAS 時代的資料層殘留
- `utils/id-generator.ts` 12 個沒用的產生器（`generateProjectId`、`generateGroupId`…）
- `utils/array.ts`、`utils/json.ts`、`utils/random.ts`、`utils/validation.ts` 大半
- `utils/email.ts` 的 `sendPasswordResetEmail`、`sendPasswordReset2FAEmail`、`sendBatchEmails`
  （已被 queue + email-service 取代）

---

#### 2026-09-03 刪除執行結果

**已刪除**：105 個匯出符號 + 2 個整檔（`db/operations.ts`、`handlers/users/projects.ts`），
42 個檔案異動，淨減約 3900 行。

**驗證方式（四道）**：`tsc --build` 全 monorepo 通過 → 262 個測試通過 →
`wrangler deploy --dry-run` 打包成功（2593 KiB）→ 前端 `vite build` 成功。

**過程中抓到的三類錯誤，是靠這幾道關卡擋下的**：

1. **跨 package 同名碰撞**：初版掃描把前端的 `groupBy`、`exportProject`、
   `calculateCommentRankings` 當成對後端符號的參照。實際上**全 repo 沒有任何一處
   `import ... from '@repo/backend'`**（package.json 有宣告但原始碼沒用），
   所以後端符號只可能被 `packages/backend/` 內部參照。修正掃描範圍後偽陽性歸零。
2. **註解中的提及被當成使用**：例如
   `CommentVotingAnalysisModal.vue:654` 的註解「與後端 calculateCommentRankings 一致」。
   剝除註解後才正確。
3. **同名定義互指**：`utils/email.ts` 和 `services/email-service.ts` **各自**定義了
   `sendBatchEmails`，互相被判定為「對方的參照」。兩支其實都沒被呼叫
   （真正在用的是 `resendBatchEmails`）。

**兩類刪除後才浮現的問題**：

- **多行函式簽章**害自動刪除的邊界判斷提早收尾（掃描找 `^}` 時撞到簽章的收尾括號），
  在 `utils/turnstile.ts`、`utils/email.ts`、`middleware/rate-limit.ts` 留下孤兒函式體。
  **`tsc` 立刻報 TS1128 抓到**，手動修掉。
- **連鎖孤兒**：`handlers/users/projects.ts` 的 `getUserProjects` 原本只被
  `getUserStats` 使用；刪掉後者之後整檔歸零。**刪除後重掃**才發現。
  → 教訓：批次刪除後**必須重跑掃描**，一次不夠。

#### 前端清理（2026-09-03）

前端比後端難驗，因為 Vue 元件有四種被引用的方式：`<script setup>` 的 PascalCase import、
模板裡的 kebab-case 標籤、router 的路徑動態載入（`() => import('@/components/X.vue')`）、
以及 `<component :is>`。掃描三種都比對（PascalCase / kebab-case / 檔名路徑），
並先確認**專案沒有元件自動註冊**（無 `unplugin-vue-components`、無 `app.component`），
名稱比對才成立。

**成果**：刪除 13 個無法觸及的 .vue 元件、105 + 9 個零參照匯出符號，前端淨減約 7,460 行。
建置時間從 1 分 20 秒降到 26 秒。

**抽驗過、確認是重構孤兒而非功能缺口的三項**：

| 死掉的東西 | 功能其實走哪裡 |
|-----------|---------------|
| `GlobalAuthModal.vue` | 已拆成 LoginForm / ForgotPasswordForm 等。只剩 `useTurnstile.ts:22` 一句註解「in the monolithic GlobalAuthModal.vue」還記得它 |
| `useAuth.ts` 的 `useChangePassword` | `UserSettings.vue:851` 直接呼叫 `rpcClient.api.auth['change-password']`，繞過 composable |
| `rpc-client.ts` 的 `clearSessionToken` | 登出走 `utils/api.ts:80` 的 `clearToken()`。**這項有特別查證**——如果登出真的沒清 token 就是安全問題，結果是重複實作敗下陣 |

**演算法改良**：後端刪除時「多行函式簽章」害邊界判斷提早收尾，手動修了三次。
前端改成**「刪到下一個頂層宣告為止」**（比對行首的 `export` / `/**` / `function` / `const` …），
不再去找配對的 `}`。前端 105 個符號一次過，vue-tsc 零錯誤。

**連鎖孤兒要迭代到收斂**：刪掉 `UserTableVirtual.vue` 之後，
只被它使用的 `UserRow.vue`、`UserActivityExpansion.vue` 才浮現，
連同另外 9 個符號。**跑到掃描回報 0 為止**，一輪不夠。

---

#### 刻意保留未刪的兩項

| 項目 | 理由 |
|------|------|
| `handlers/invitations/validate.ts` 的 `validateInvitationCodeForEmail` | 這是 #007 的修法本體，刪掉等於把答案丟了 |
| `queues/settlement-producer.ts`（`queueSettleStage`、`getSettlementTaskStatus`）＋ consumer ＋ wrangler 佇列設定 | 等「同步結算 vs 非同步結算」的架構決定（見乙-2）。刪掉等於替使用者做了決定 |


**順帶補上的一個缺口**：速率限制（2026-09-03 新增）原本沒有任何解鎖手段——
被鎖的使用者只能等一小時。已把既有的 `getRateLimitStatus` / `resetRateLimit`
接到 `POST /admin/rate-limit/status` 與 `POST /admin/rate-limit/reset`
（`router/admin.ts:1521` 前）。只清 actor 桶，per-recipient 與 per-IP 是防濫用控制，
刻意不清。

---

**掃描腳本邏輯**（要重跑時）：對每個 `export function|const|let|class|enum`，
用 word-boundary regex 分別在「其他 src 檔」「同檔案（>1 次出現）」「tests/」搜尋，
三者皆無 = 完全死碼；只有同檔 = 不該 export；只有測試 = 測試專用。
純 type/interface 匯出已排除（雜訊太多）。
**已知誤判**：字串式呼叫、動態 `await import()` 後解構、
Vue template 內只出現在字串裡的元件名，可能被誤判為死碼——逐項確認過再刪。


### #008 ｜ 四支 auth 路由宣告了 turnstileToken 卻從未驗證 ｜ 中

**問題**：以下四支路由的 request schema 都有 `turnstileToken` 欄位，
router 內卻**沒有呼叫 `verifyTurnstileMiddleware`**：

| 路由 | 定義 | schema |
|------|------|--------|
| `/auth/login-verify-password` | `router/auth.ts:301` | `shared/src/schemas/auth.ts:50` |
| `/auth/resend-2fa` | `router/auth.ts:919` | `auth.ts:198` |
| `/auth/verify-email-for-reset` | `router/auth.ts:1011` | `auth.ts:210` |
| `/auth/password-reset-verify-code` | `router/auth.ts:1033` | `auth.ts:221` |

整個 auth router 只有 `/register`（`:67`）、`/reset-password`（`:1068`）和 `:1634`
真的驗證。而且 `TurnstileTokenSchema = z.string().optional()`
（`shared/src/schemas/common.ts:157`），所以連「有沒有給 token」都不驗——
欄位在 JSDoc 註解裡被寫成必填，實際上是純裝飾。

再加上 `wrangler.toml:135` 是 `TURNSTILE_ENABLED = "false"`，目前整套 CAPTCHA 是關的。

**目前的緩解**：2026-09-03 已補上 D1 版速率限制（見 pitfalls.md 同日條目），
這四支現在都有每信箱冷卻／時窗，免密碼的兩支另有每 IP 限制，
全系統另有每日寄信預算。所以「無限催信」的洞已經堵住，Turnstile 是第二道防線。

**待決**：要不要真的啟用？
- 要啟用：把那四支的 `verifyTurnstileMiddleware` 補上，`TurnstileTokenSchema`
  在需要的地方改成必填，並確認前端這四支都有送 token（目前 `useLogin.ts` 有送，
  但沒驗證過其他路徑）
- 不啟用：把 schema 裡的欄位與 JSDoc 拿掉，免得下一個人以為有保護
  （**最糟的是現狀**：看起來有、實際沒有）

---

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

**2026-09-03 補充**：死模組普查（#009 甲-2）發現
`handlers/invitations/validate.ts:140` 早就有 `validateInvitationCodeForEmail(env, code, userEmail)`，
只是**沒有任何地方呼叫**。它自己的 JSDoc 還寫著「This is called during user registration」。
沒有人會刻意寫一支比對函式再刻意不用它，所以**這題偏向漏檢，不是刻意設計**。

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
