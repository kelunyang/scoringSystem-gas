# 型別清理計畫（`any` 收斂）

> **這份文件是給「沒有上下文的新 session」看的。** 起草於 2026-09-05，
> 承接同日那輪底層安全檢查（見 [issue.md](issue.md) #010 與 [pitfalls.md](pitfalls.md)）。
> 開工前請先讀「動手之前必讀」那一節，它記錄了三個會讓你做白工的陷阱。

---

## 現況（2026-09-06 收工時，已驗證）

```
pnpm type-check   通過（**現在才真的包含 .vue**，見下）
pnpm test         392 passed / 0 skipped
pnpm lint         0 error, 1399 warning
```

| 套件 | any 數量 | 起點 |
|------|---------|------|
| backend | 457 | 460 |
| frontend | 852 | 888 |
| shared | 13 | 22（原本記為 0，是因為沒被 lint 掃到）|

frontend 另有 77 個非 any 的 warning（`vue/no-required-prop-with-default` 28、
`vue/require-default-prop` 22、`vue/no-template-shadow` 13、`vue/no-v-html` 12、
`vue/multi-word-component-names` 2），與本計畫無關，可另案處理。

### 批次 1 已完成（2026-09-06）

三個 commit：`a4fa897`、`33798dc`、`7b1eff7`。做的事和原計畫差很多，
因為一開工就撞到「契約不統一，所以根本無法定型」——詳見
[pitfalls.md](pitfalls.md) 2026-09-06 的兩條。摘要：

- **後端 error 回應有兩種形狀**（handler 用 `errorResponse()`、
  router 權限守衛手寫 `c.json`，112 處）。已統一，並補上守門測試
  `backend/tests/error-response-shape.test.ts`。
- **`getHttpStatus()` 只認得 52 個錯誤碼，實際用 167 個**，
  其餘 115 個一律回 500。已改成完整對照表。
- **八份 `ApiResponse` 定義**收成一份（`@repo/shared/types/api-responses`），
  改成以 `success` 判別的 discriminated union。
- 因此揭出並修掉：10 處對使用者顯示 `[object Object]`、
  兩份互相矛盾且都不等於後端回傳的 `SystemStats`、
  **根 `pnpm type-check` 從來沒檢查過任何 `.vue` 檔**。
- 刪除死碼：`types/api.ts` 的 20 個零引用型別、`types/auth.ts` 的
  `ApiResponse` 三連、`utils/error-handler.ts`（計畫原本擔心要合併的
  兩份 `getErrorMessage`，其實一份沒人用）、shared 的 `Proposal` 介面。

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

### 批次 2：`catch (e: any)`（全庫 46 處）｜ 機械性但要小心

`tsconfig.base.json` 是 `strict: true`，所以拿掉標註後 catch 變數是
`unknown`，`e.message` 會編譯失敗。**必須搭配既有的 helper**：

- backend：`utils/response.ts` 的 `getErrorMessage(error: unknown)`
- frontend：`utils/errorHandler.ts` 的 `getErrorMessage`。
  ~~兩份要合併~~——`utils/error-handler.ts`（連字號那份）零引用，
  已於 2026-09-06 刪除，現在只有一份。

### 批次 3：backend handler 的參數與回傳｜ 最可能抓到 bug

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

### 批次 4：frontend 元件｜ 最大宗，價值最低

| 檔案 | any |
|------|-----|
| `components/ProjectDetail.vue` | 62 |
| `composables/admin/useProjects.ts` | 38 |
| `components/TeacherVoteModal.vue` | 32 |
| `components/GroupSubmissionApprovalModal.vue` | 26 |
| `components/StageGroupSubmissions.vue` | 25 |
| `composables/useModalManager.ts` | 22 |

**注意**：`ProjectDetail.vue` 曾有使用者未提交的改動，2026-09-06 確認已提交。
動它之前仍請先 `git status --short`。

### 批次 5：`packages/shared` 剩餘 13 處｜ 跟批次 3 一起做

2026-09-06 已把 22 收到 13。剩下的是這些欄位：

| 檔案 | 欄位 |
|------|------|
| `types/entities.ts` | `Group.votingData`、`Group.participationProposal`、`Group.voteRankData`、`Group.teacherRankData`、`Submission.teacherRankData`、`Submission.voteRankData`、`EventLog.resource` |
| `types/admin.ts` | `eventData`、`details`、`relatedEntities`、`metadata` ×3 |

**刻意留著**：它們的形狀由 backend handler 決定，而那些 handler
自己還是 `any`（`handlers/eventlogs/query.ts:428` 就寫著
`let resource: any = null`）。在 handler 定型之前替這些欄位挑型別
等於猜，猜錯會比 `any` 更難發現。做完批次 3 再回來收。

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
