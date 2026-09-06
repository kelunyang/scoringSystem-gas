# 型別清理計畫（`any` 收斂）

> **這份文件是給「沒有上下文的新 session」看的。**
> 起草 2026-09-05，2026-09-06 大幅更新。
>
> **接手的話，照這個順序讀：**
> 1. 本節下方的「現況」——知道還剩什麼
> 2. 「動手之前必讀」——三個會讓你做白工的陷阱，其中兩個是量測工具本身失效
> 3. [issue.md](issue.md) **#011**——它決定剩下那批要怎麼做，**開工前一定要讀**
> 4. [pitfalls.md](pitfalls.md) 2026-09-06 的四條——這輪踩到的坑
>
> 承接 2026-09-05 那輪底層安全檢查（[issue.md](issue.md) #010）。

---

## 現況（2026-09-06，已驗證）

```
pnpm type-check   通過（含 vue-tsc）
pnpm test         398 passed / 0 skipped
pnpm lint         0 error, 878 warning
```

| 套件 | any | 起點 |
|------|-----|------|
| backend | **0** | 460 |
| shared | **0** | 22（原記為 0，因為沒被 lint 掃到）|
| frontend | 801 | 888 |

frontend 另有 77 個非 any 的 warning（`vue/no-required-prop-with-default` 28、
`vue/require-default-prop` 22、`vue/no-template-shadow` 13、`vue/no-v-html` 12、
`vue/multi-word-component-names` 2），與本計畫無關，可另案處理。

### 已完成的批次

| 批次 | 狀態 |
|------|------|
| 1 `types/api.ts` ＋ API 契約 | ✅ 2026-09-06 |
| 2 `catch (e: any)` | ✅ 全庫 46 → 0 |
| 3 backend handler | ✅ 460 → 0 |
| 5 shared | ✅ 22 → 0 |
| 4 frontend 元件 | **未做**（801 處，見下） |

2026-09-06 那輪共 22 個 commit，範圍 `b7b7b60..ec8d832`。

### 過程中找到並修好的 bug

型別清理的價值主要在這裡，全部有守門或行為測試（測試數 389 → 398）：

1. **後端 error 回應有兩種形狀**（112 處 router 守衛 vs 743 處
   `errorResponse()`）。前端沒有一種寫法能同時對：10 處顯示
   `[object Object]`，另外 23 處把 403 的真正理由吞掉。
2. **115 個錯誤碼一律回 HTTP 500**——`PERMISSION_DENIED`、
   `COMMENT_NOT_FOUND`、`ALREADY_VOTED` 全被報成 Internal Server Error。
3. **事件資源端點的權限收窄從來沒執行過**（權限層級讀錯一層，
   值在 `.data` 底下）。路由只擋專案層級的 view，於是任何組員
   都能看到專案內任何一份成果。同一端點的評論路徑另外因為
   JOIN 在不存在的 `c.authorId` 上，從來沒成功過。
4. **階段評論頁的 `userReaction` 永遠是 null**，因此 reaction
   無法取消（再按一次是重複新增）。
5. **根 `pnpm type-check` 從來沒檢查過任何 `.vue`**；
   **`packages/shared` 沒有 lint script**。
6. 兩份互相矛盾且都不等於後端回傳的 `SystemStats`。

詳見 [pitfalls.md](pitfalls.md) 2026-09-06 的四條。

---

## 動手之前必讀

### 1. 量測工具本身曾經沒有在跑（三次）

`packages/backend/package.json` 的 lint script 原本是
`eslint src/**/*.ts`——**沒有引號**，glob 被 shell 先展開，
zsh 預設 `**` 等同 `*`，只掃到單層目錄。加引號後數字從 118 跳到 460。

`packages/shared` 則是**根本沒有 lint script**，而根指令是
`pnpm --recursive lint`，對沒有該 script 的 package 不會報錯，
靜靜跳過。計畫最初寫「shared: 0 any」就是這麼來的，實際 22 處。

第三個最嚴重：根 `type-check` 是 `tsc --build`，而 `vue-tsc`
只掛在 frontend 自己的 script 上，**沒有人呼叫它**——
整個前端的 `.vue` 從來沒有進過型別檢查。三者皆已修。

**要驗證數字時請用 `pnpm lint` / `pnpm type-check`**，
不要自己在終端機打 `npx eslint src/**/*.ts`——那會重蹈覆轍。
需要單獨跑時記得加引號：

```bash
npx eslint 'packages/backend/src/**/*.ts'
```

且注意 **`tsc --build` 是增量的**：同一次 session 內跑第二次不會重報錯誤，
要看完整結果請加 `--force`。

### 2. 這個 codebase 的病症是「寫了沒接上」

2026-09-05 那輪找到的問題，超過一半是同一個形狀：
函式寫好沒人呼叫、驗證掛在預檢端點而非真正的邊界、測試被 skip、
guard 只擋一個方法。**型別檢查、code review、既有測試都看不出來。**

移除 `any` 時如果冒出「這裡的型別對不上」，**先確認是不是真的 bug**，
不要直接 `as unknown as X` 壓過去。那正是這件事的價值所在。

### 3. 文件的未提交段落已經清空（2026-09-06 更新）

2026-09-05 的計畫提醒：`plan/issue.md` 與 `plan/pitfalls.md` 工作區裡
同時含有使用者未提交的段落（CountdownButton pitfall 與 `@property` 裁決），
提交時要做分離暫存。**這些段落已於 b7b7b60 之前提交完畢**，
2026-09-06 開工時工作區是乾淨的，可以正常編輯這兩個檔案。

仍然適用的原則：動這兩個檔案之前先 `git status --short` 確認，
若有未提交內容且不確定來源，先問使用者，不要混進自己的 commit。

---

## 做法：分批，按價值排序

**不要一次全掃。** 每批做完跑完整驗證再進下一批：

```bash
cd scoringSystem-cf
pnpm type-check && pnpm test && pnpm lint
pnpm --filter @repo/frontend build     # 動到前端時
```

### ~~批次 1：`types/api.ts`~~ ✅ 已完成 2026-09-06

見上面「批次 1 已完成」。結果與原計畫預期不同：那 32 個 `any`
不是「換成具體型別」，而是**整份檔案除了 `ApiResponse` 系列以外全是死碼**。
真正的工作在統一前後端的錯誤契約。

### ~~批次 2：`catch (e: any)`~~ ✅ 已完成 2026-09-06

實際做的不只換標註：15 處重複的 sudo 判斷收成 `isSudoWriteBlocked()`、
5 處 UNIQUE constraint 判斷收成 `isUniqueConstraintViolation()`。
以下為當時的規劃。

`tsconfig.base.json` 是 `strict: true`，所以拿掉標註後 catch 變數是
`unknown`，`e.message` 會編譯失敗。**必須搭配既有的 helper**：

- backend：`utils/response.ts` 的 `getErrorMessage(error: unknown)`
- frontend：`utils/errorHandler.ts` 的 `getErrorMessage`。
  ~~兩份要合併~~——`utils/error-handler.ts`（連字號那份）零引用，
  已於 2026-09-06 刪除，現在只有一份。

### ~~批次 3：backend handler~~ ✅ 已完成 2026-09-06

以下為當時的規劃，保留作為紀錄。


D1 查詢結果幾乎都是 `(row: any)`。這裡是實際會出錯的地方——
2026-09-05 就抓到 `.first()` 用在「使用者可能有多筆」的查詢上
（`submissions/manage.ts`、`versions.ts`）。

建議順序（依 any 數量）：

| 檔案 | any |
|------|-----|
| `handlers/submissions/manage.ts` | 30 |
| `handlers/comments/manage.ts` | 28 |
| `handlers/projects/list.ts` | 25 |
| `handlers/groups/members.ts` | 21 |
| `handlers/scoring/pre-settlement-validation.ts` | 21 |
| `handlers/eventlogs/query.ts` | 16 |
| `router/auth.ts` | 16 |
| `router/admin.ts` | 15 |

D1 的 `.first<T>()` / `.all<T>()` 支援泛型，優先用它而不是事後斷言。

### 批次 4：frontend 元件（未做，801 處）

**開工前先讀 [issue.md](issue.md) #011。** 它會決定你這一批要怎麼做。

#### 801 處分成兩半，性質完全不同

用「這個檔案有沒有碰 `rpcClient` / `fetchWithAuth` / `adminApi`」切開：

| 類別 | 檔案數 | any 數 |
|------|-------|-------|
| 會碰 API 回應 | 48 | **389** |
| 純前端狀態 | 68 | **412** |

**那 389 處清了會長回來。** 它們的型別來源是 `rpcClient`，而
`frontend/src/types/backend.d.ts` 裡 `AppType = any`——整個 RPC 層
本來就沒有型別。在 #011 有結論之前動它們，等於用手寫型別去描述
一個沒人驗證的契約，和批次 1 刪掉的 `types/api.ts` 是同一種東西。

**那 412 處可以現在做。** 它們是元件內部狀態、圖表資料、
UI 輔助函式，型別由前端自己決定，不依賴後端契約。

#### 建議順序

1. 先讀 #011，決定 RPC 型別要不要處理、走哪條路
2. 不論 #011 怎麼決定，都可以先做那 412 處「純前端狀態」
3. #011 有結論之後再回來處理 389 處 API 邊界

#### 目前 any 最多的檔案

| 檔案 | any | 碰 API？ |
|------|-----|---------|
| `components/ProjectDetail.vue` | 56 | 是 |
| `composables/admin/useProjects.ts` | 38 | 是 |
| `components/TeacherVoteModal.vue` | 32 | 是 |
| `components/GroupSubmissionApprovalModal.vue` | 26 | 是 |
| `components/StageGroupSubmissions.vue` | 25 | **否** |
| `composables/useModalManager.ts` | 22 | 是 |
| `components/charts/WalletLadder.vue` | 21 | **否** |
| `components/shared/AwardPointsDrawer.vue` | 20 | 是 |
| `components/charts/StageGrowthChart.vue` | 18 | **否** |
| `components/shared/ContributionChart/AllGroupsChart.vue` | 18 | **否** |

重跑這份分類：

```bash
cd scoringSystem-cf/packages/frontend
pnpm exec eslint . -f json | python3 -c '
import sys,json
from collections import Counter
d=json.load(sys.stdin); c=Counter()
for f in d:
    n=sum(1 for m in f["messages"] if m.get("ruleId")=="@typescript-eslint/no-explicit-any")
    if n: c[f["filePath"].split("/src/")[-1]]=n
for k,v in c.most_common(20): print(f"{v:4} {k}")
print("---", sum(c.values()), "／", len(c))'
```

#### 前面四批累積的作法

- **先找跨檔案的重複模式，不要一開始就逐檔掃。**
  最大的幾筆收穫都來自「某個型別已經存在，只是沒接上」——
  `HonoVariables`、`Threat`、`ProjectInfo`、`DurableObjectNamespace`
  都是這樣。整輪批次 3 裡，「補一個 import」比「寫一個新型別」更常見。
- **注意被 `/* */` 註解掉的死碼。** lint 照樣把它算進 any 統計，
  批次 3 有三處是這樣（都是已停用的 tags 系統）。刪掉即可。
- **函式簽章說謊時，改簽章而不是在呼叫端轉型。**
  `updateUserProfile`、`createGlobalGroup`、`validateCommentEligibility`
  都是宣告成必填、實際可能收到 undefined，而函式自己有擋。
- **驗證函式回傳 `{ valid: boolean; data?: T }` 時改成判別聯集**，
  呼叫端就不必再檢查一次或加 `!`。
- **`ref<any>` 先看賦值來源**，多半能直接用既有型別。

### ~~批次 5：`packages/shared`~~ ✅ 已完成 2026-09-06

排在批次 3 之後是對的：這些欄位的形狀由 backend handler 決定，
而那些 handler 當時自己還是 `any`，先定就是猜。等 handler 定完型再回頭，
形狀是查出來的。新增了 GroupVotingData、ParticipationProposal、
RankingDisplayData、EventResourceData。

---

## ⚠ 這輪的修復還沒部署

2026-09-06 的 22 個 commit 全部只在 `main` 分支上，**沒有部署**。
其中有三項是行為變更，不是純型別：

1. **API 錯誤回應的形狀變了**——112 處 router 守衛從
   `{ error: '字串', errorCode }` 改成 `{ error: { code, message } }`。
   前後端必須一起部署，不能只部署一邊。
2. **115 個錯誤碼的 HTTP 狀態碼變了**（多數從 500 改成 400/403/404）。
   如果有任何監控或告警是看 5xx 比率的，數字會明顯下降——那是修好了，不是壞了。
3. **事件資源端點的權限收窄開始真的生效**。在此之前任何組員都能看到
   專案內任何一份成果；修好之後組員只看得到自己的、組長只看得到自己組的。
   **如果有人已經習慣看得到，這會像是「壞掉」，但那才是原本設計的行為。**

部署指令見 [CLAUDE.md](../.claude/CLAUDE.md)「遠端部署」節。
schema 沒有變更，不需要跑 migration。

---

## 這輪新增的守門測試（別讓它們失效）

| 測試 | 擋什麼 |
|------|--------|
| `backend/tests/error-response-shape.test.ts` | 手寫 `error: '字串'` 的回應；錯誤碼漏進 `HTTP_STATUS_BY_ERROR_CODE` 對照表 |
| `backend/tests/handlers/comments/user-reaction.test.ts` | `getStageComments` 與 `getAllStagesComments` 的 `userReaction` 分歧 |
| `backend/tests/handlers/eventlogs/resource-details.test.ts` | 事件資源端點的權限收窄失效；評論路徑的 SQL 欄位名 |

後兩者跑真的 in-memory SQLite ＋ 完整 migrations
（`createSqliteD1(schema())`，schema 由 `migrations/*.sql` 依序串起來）。
**要寫新的 handler 行為測試，直接抄 `user-reaction.test.ts` 的 seed 段落**——
資料表欄位和你以為的不一樣（`users` 沒有 `createdTime`、
`submissions` 是 `contentMarkdown` 不是 `content`、
`projectviewers.assignedBy` 是 NOT NULL），照抄可以省掉來回試。

---

## 不要做的事

- **不要為了消掉 warning 而用 `as unknown as X` 或 `@ts-ignore`。**
  那只是把 `any` 換個寫法，還讓下一個人更難發現。
  真的無法定型的地方用 `unknown` 並加註解說明為什麼。
- **不要動 `packages/shared/src/schemas/`** 的 Zod schema 形狀。
  它們是前後端契約，改動要一起改兩邊並跑完整測試。
- **不要為了型別而改執行時行為。** 如果發現型別不符是因為程式有 bug，
  分開處理：先寫測試證明 bug，修它，再改型別。

---

## 完成的判準

```
pnpm lint    0 error, 0 no-explicit-any warning
pnpm test    全過，且測試數量沒有減少
pnpm type-check    通過
```

過程中若發現真正的 bug（很可能會），依 CLAUDE.md 的規則落檔：
未解決的進 [issue.md](issue.md) A 區，已修且有教訓價值的寫成
[pitfalls.md](pitfalls.md) 條目。

---

## 本計畫之外、仍然開放的項目

見 [issue.md](issue.md) #010 戊節與 #005：

- **權限查詢的 KV 快取**：`authMiddleware` 每個請求查兩次 D1。
  卡在快取失效策略——改群組權限要多久生效是使用者要決定的取捨，
  **不要自己決定就做下去**。
- **`database/schema.sql` 已不是任何流程的輸入**（2026-09-05 移除
  `db:sync-schema` 之後）。它比生產環境少三張表。
  要嘛刪除，要嘛加註說明它已退役——目前留著會誤導人。
- **153 段手寫權限 SQL 的機械式收斂**：已稽核過、錯誤已修、
  高風險類別有守門測試（`tests/permission-sql-audit.test.ts`）。
  收斂剩下的是整潔工作，優先度低。
