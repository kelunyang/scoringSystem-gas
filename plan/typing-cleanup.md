# 型別清理計畫（`any` 收斂）

> **這份文件是給「沒有上下文的新 session」看的。**
> 起草 2026-09-05，2026-09-06 兩輪大幅更新。
>
> **接手的話，照這個順序讀：**
> 1. 本節下方的「現況」——知道還剩什麼
> 2. 「動手之前必讀」——四個會讓你做白工的陷阱
> 3. [issue.md](issue.md) **#011**——剩下的 381 處全部卡在這裡，
>    已經有實測結論與三條路的取捨表，**這是使用者要做的架構決策**
> 4. [pitfalls.md](pitfalls.md) 2026-09-06 的六條——兩輪踩到的坑
>
> 承接 2026-09-05 那輪底層安全檢查（[issue.md](issue.md) #010）。

---

## 現況（2026-09-06 第二輪後，已驗證）

```
pnpm type-check   通過（含 vue-tsc）
pnpm test         406 passed / 0 skipped
pnpm lint         0 error
pnpm --filter @repo/frontend build   成功
```

| 套件 | any | 起點 |
|------|-----|------|
| backend | **0** | 460 |
| shared | **0** | 22（原記為 0，因為沒被 lint 掃到）|
| frontend | 382 | 888 |

frontend 剩下的 382 處：**381 處在 API 邊界（48 檔），1 處是
`AppType = any` 本身**。純前端狀態那 412 處已經歸零。
API 邊界那批卡在 [issue.md](issue.md) **#011**，那裡已經有實測結論
與三條路的取捨表，**要不要投入是架構決策，不該由清理順手決定**。

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
| 4a frontend 純前端狀態 | ✅ 2026-09-06 第二輪（412 → 0） |
| 4b frontend API 邊界 | **未做**（381 處，卡在 #011） |

2026-09-06 那輪共 22 個 commit，範圍 `b7b7b60..ec8d832`。

### 過程中找到並修好的 bug

型別清理的價值主要在這裡（測試數 389 → 406）：

**第二輪（2026-09-06 下午，批次 4a）**

7. **「本組尚未提交」警告從來沒顯示過。**
   `hasCurrentGroupSubmitted()` 回傳 `{ submitted, approved, groupData }`
   物件，`useConsensusWarning` 把它當布林用。已修，附 8 個回歸測試。
8. **同一個檔案裡兩份權限實作，被呼叫的那份是對的，另一份不是。**
   死掉的 `useDetailedProjectPermissions` composable 從 `usergroups`
   關聯列讀 `allowChange`（那裡沒有這個欄位），組長恆得到管理權限。
   已刪除死碼。
9. **`Project.userGroups` 在 shared 宣告成 `Group[]`，實際是
   `usergroups` 關聯列。** 新增 `UserGroupRecord` 扶正，改完之後
   tsc 立刻點出四個讀錯欄位的地方（第 8 條就是這樣找到的）。
10. **`UserEditorDrawer` 的 avatarOptions 在 runtime 是 JSON 字串，
    卻被 `{ ...options }` 展開**（會變成逐字元的鍵）。已改走
    `parseAvatarOptions`。
11. **前端與 shared 的 `StageStatus` 分歧**（6 值 vs 9 值），
    **shared 的 `Stage` 少了 `reportRewardPool`/`commentRewardPool`**。
    皆已對齊。

**第一輪（2026-09-06 上午，批次 1/2/3/5）**

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

### 4. 改了 `packages/shared` 的型別，要先 build 才看得到

frontend 的 `@repo/shared` 路徑指向 `../shared/src`，但實際解析時
會走到 `packages/shared/dist/types/*.d.ts`（vue-tsc 的錯誤訊息裡
看得到 `shared/dist/` 的路徑）。**改了 `shared/src/types/entities.ts`
之後不 build，`vue-tsc` 看到的還是舊型別**，你會以為改動沒生效。

```bash
pnpm --filter @repo/shared build && pnpm --filter @repo/frontend exec vue-tsc --noEmit -p tsconfig.json
```

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

### ~~批次 4a：frontend 純前端狀態~~ ✅ 已完成 2026-09-06 第二輪（412 → 0）

用「這個檔案有沒有碰 `rpcClient` / `fetchWithAuth` / `adminApi`」把
801 處切成兩半，先做不碰 API 的那 412 處。分七個 commit，
`f2c4649..17b7a0f`。

重跑這份分類（**接手後第一件事就跑它，確認數字**）：

```bash
cd scoringSystem-cf/packages/frontend
pnpm exec eslint . -f json > /tmp/fe.json
python3 - <<'EOF'
import json,re
from collections import Counter
d=json.load(open("/tmp/fe.json"))
api=Counter(); pure=Counter()
pat=re.compile(r'rpcClient|fetchWithAuth|adminApi')
for f in d:
    n=sum(1 for m in f["messages"] if m.get("ruleId")=="@typescript-eslint/no-explicit-any")
    if not n: continue
    rel=f["filePath"].split("/src/")[-1]
    src=open(f["filePath"],encoding="utf-8").read()
    (api if pat.search(src) else pure)[rel]=n
print("API 邊界", sum(api.values()), len(api))
print("純前端  ", sum(pure.values()), len(pure))
for k,v in api.most_common(20): print(f"{v:4} {k}")
EOF
```

#### 這一輪學到、下一輪用得上的

- **Vue 的泛型 SFC 是「欄位名由呼叫端決定」那類元件的正解。**
  `VersionTimeline`／`RankingComparison`／`CommentRankingTransfer`／
  `DraggableRankingList` 四個純呈現元件，項目型別本來都是 `any[]`，
  因為欄位名靠 props（`itemKey`／`itemLabel`／`displayFields`）傳進來。
  改成 `<script setup lang="ts" generic="T extends object">` ＋ 一個
  `readField()` 集中做動態取值，呼叫端就會被檢查，元件本身仍然不必
  知道那是什麼。**已確認 `pnpm --filter @repo/frontend build` 能編。**
- **`Record<string, unknown>` 不能拿來當「任意物件」的參數型別。**
  TypeScript 只讓 type alias 有隱含索引簽章，`Comment` 這種 interface
  不行。想收任意物件就用泛型，不要退回 `any`。
- **`(window as any).X` 一律先查 `env.d.ts`。** 那裡本來就有
  turnstile 與 d3 的宣告，這輪又補了三個。全庫 `(window as any)` 現在是 0。
- **d3 的 `Ref<any>` 值得標。** selection 與 scale 都有現成泛型，
  標出來之後底下整條鏈的 `(d: any)` 就自己消失了。
  兩個 TsumTsum 圖表的 yScale 其實一個是 scaleBand、一個是
  scaleLinear——標成 `any` 時看不出來。
- **函式回傳型別靠 `any` 推導時，呼叫端拿到什麼沒人知道。**
  `usePointCalculation` 兩個主要函式都是這樣，補上具名回傳型別後
  才發現有欄位在下游被當必填用。

### 批次 4b：frontend API 邊界（進行中，381 處）

**#011 已經動工並修好前兩層**（路由 schema、回應信封），
第三層（handler 的資料型別）未完，前端接線暫存在
`wip/rpc-frontend-wiring` 分支，尚有 138 個型別錯誤。

**這 381 處不要再手動清了。** 它們的型別應該由契約推導出來——
接線完成之後絕大多數會自己消失。硬清只會種下另一批「看起來合理、
然後跟後端悄悄漂走」的手寫介面。

詳細狀態、剩餘工作分類與接手指令見 [issue.md](issue.md) #011。

目前 any 最多的檔案（全部都在 API 邊界）：

| 檔案 | any |
|------|-----|
| `components/ProjectDetail.vue` | 56 |
| `composables/admin/useProjects.ts` | 38 |
| `components/TeacherVoteModal.vue` | 32 |
| `components/GroupSubmissionApprovalModal.vue` | 26 |
| `components/shared/AwardPointsDrawer.vue` | 20 |

#### 前面幾批累積的作法（仍然適用）

- **先找跨檔案的重複模式，不要一開始就逐檔掃。**
  最大的幾筆收穫都來自「某個型別已經存在，只是沒接上」——
  `HonoVariables`、`Threat`、`ProjectInfo`、`DurableObjectNamespace`、
  `GroupVotingData`、`ViewportChangePayload` 都是這樣。
- **注意被 `/* */` 註解掉的死碼。** lint 照樣把它算進 any 統計。
- **函式簽章說謊時，改簽章而不是在呼叫端轉型。**
  第二輪光是這一項就修掉四個：`calculateStagesWithEarnings`、
  `isTransactionReversed`、`settleStage`、`useProjectPermissions`
  的 `projectData`。
- **驗證函式回傳 `{ valid: boolean; data?: T }` 時改成判別聯集。**
- **`ref<any>` 先看賦值來源**，多半能直接用既有型別。
- **同一個概念出現兩份型別定義時，先確認哪一份是活的。**
  `VoteRecord`、`StageStatus`、權限計算都出現過這個形狀。

### ~~批次 5：`packages/shared`~~ ✅ 已完成 2026-09-06

排在批次 3 之後是對的：這些欄位的形狀由 backend handler 決定，
而那些 handler 當時自己還是 `any`，先定就是猜。等 handler 定完型再回頭，
形狀是查出來的。新增了 GroupVotingData、ParticipationProposal、
RankingDisplayData、EventResourceData。

---

## ⚠ 這輪的修復還沒部署

2026-09-06 兩輪共 30 個 commit 全部只在 `main` 分支上，**沒有部署**。
其中有四項是行為變更，不是純型別：

1. **API 錯誤回應的形狀變了**——112 處 router 守衛從
   `{ error: '字串', errorCode }` 改成 `{ error: { code, message } }`。
   前後端必須一起部署，不能只部署一邊。
2. **115 個錯誤碼的 HTTP 狀態碼變了**（多數從 500 改成 400/403/404）。
   如果有任何監控或告警是看 5xx 比率的，數字會明顯下降——那是修好了，不是壞了。
3. **事件資源端點的權限收窄開始真的生效**。在此之前任何組員都能看到
   專案內任何一份成果；修好之後組員只看得到自己的、組長只看得到自己組的。
   **如果有人已經習慣看得到，這會像是「壞掉」，但那才是原本設計的行為。**
4. **「本組尚未提交報告」警告會開始出現**（第二輪修的）。
   這個警告從來沒顯示過，使用者會第一次看到它。

部署指令見 [CLAUDE.md](../.claude/CLAUDE.md)「遠端部署」節。
schema 沒有變更，不需要跑 migration。

---

## 這輪新增的守門測試（別讓它們失效）

| 測試 | 擋什麼 |
|------|--------|
| `backend/tests/error-response-shape.test.ts` | 手寫 `error: '字串'` 的回應；錯誤碼漏進 `HTTP_STATUS_BY_ERROR_CODE` 對照表 |
| `backend/tests/handlers/comments/user-reaction.test.ts` | `getStageComments` 與 `getAllStagesComments` 的 `userReaction` 分歧 |
| `backend/tests/handlers/eventlogs/resource-details.test.ts` | 事件資源端點的權限收窄失效；評論路徑的 SQL 欄位名 |
| `frontend/src/composables/__tests__/useConsensusWarning.test.ts` | 把「本組是否已提交」的回傳物件當布林用 |

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
pnpm --filter @repo/frontend build    成功
```

**現在卡在 381 處 API 邊界 ＋ 1 處 `AppType = any`。**
這 382 處要不要清、怎麼清，取決於 [issue.md](issue.md) #011 的決定，
不是靠再掃一輪就能收掉的。

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
