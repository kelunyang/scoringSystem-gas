# 型別清理計畫（`any` 收斂）

> **這份文件是給「沒有上下文的新 session」看的。** 起草於 2026-09-05，
> 承接同日那輪底層安全檢查（見 [issue.md](issue.md) #010 與 [pitfalls.md](pitfalls.md)）。
> 開工前請先讀「動手之前必讀」那一節，它記錄了三個會讓你做白工的陷阱。

---

## 現況（2026-09-05 收工時，已驗證）

```
pnpm type-check   通過
pnpm test         389 passed / 0 skipped
pnpm lint         0 error, 1426 warning
```

warning 幾乎全是 `@typescript-eslint/no-explicit-any`：

| 套件 | any 數量 | 檔案數 |
|------|---------|--------|
| backend | 460 | 96 |
| frontend | 888 | 124 |
| shared | 0 | — |

frontend 另有 77 個非 any 的 warning（`vue/no-required-prop-with-default` 28、
`vue/require-default-prop` 22、`vue/no-template-shadow` 13、`vue/no-v-html` 12、
`vue/multi-word-component-names` 2），與本計畫無關，可另案處理。

---

## 動手之前必讀

### 1. lint 指令曾經沒有真的在檢查

`packages/backend/package.json` 的 lint script 原本是
`eslint src/**/*.ts`——**沒有引號**，glob 被 shell 先展開，
zsh 預設 `**` 等同 `*`，只掃到單層目錄。加引號後數字從 118 跳到 460。

已修，但**要驗證數字時請用 `pnpm lint`**，不要自己在終端機打
`npx eslint src/**/*.ts`——那會重蹈覆轍。需要單獨跑時記得加引號：

```bash
npx eslint 'packages/backend/src/**/*.ts'
```

### 2. 這個 codebase 的病症是「寫了沒接上」

2026-09-05 那輪找到的問題，超過一半是同一個形狀：
函式寫好沒人呼叫、驗證掛在預檢端點而非真正的邊界、測試被 skip、
guard 只擋一個方法。**型別檢查、code review、既有測試都看不出來。**

移除 `any` 時如果冒出「這裡的型別對不上」，**先確認是不是真的 bug**，
不要直接 `as unknown as X` 壓過去。那正是這件事的價值所在。

### 3. `plan/issue.md` 與 `plan/pitfalls.md` 有使用者自己未提交的段落

工作區裡這兩個檔案同時含有：
- 使用者寫的 CountdownButton pitfall 與 `@property` 裁決（**未提交，不要碰**）
- 助手寫的內容

提交這兩個檔案時要做分離暫存：把使用者的段落暫時移除 → `git add` → 還原檔案。
2026-09-05 那輪的做法可以參考 git log。**不確定就先問使用者**，
不要把他的段落混進你的 commit。

---

## 做法：分批，按價值排序

**不要一次全掃。** 每批做完跑完整驗證再進下一批：

```bash
cd scoringSystem-cf
pnpm type-check && pnpm test && pnpm lint
pnpm --filter @repo/frontend build     # 動到前端時
```

### 批次 1：`types/api.ts`（frontend，32 處）｜ 最高槓桿

API 契約。修好之後下游元件的 `any` 有一部分會自然消失，
所以**必須第一個做**，否則後面會重工。

做法：對照 `packages/shared/src/schemas/` 裡的 Zod schema
與 `packages/backend/src/handlers/` 的實際回傳，把 `any` 換成具體型別。
`@repo/shared` 已經匯出大量型別，優先複用而不是重新定義。

### 批次 2：`catch (e: any)`（全庫 46 處）｜ 機械性但要小心

`tsconfig.base.json` 是 `strict: true`，所以拿掉標註後 catch 變數是
`unknown`，`e.message` 會編譯失敗。**必須搭配既有的 helper**：

- backend：`utils/response.ts` 的 `getErrorMessage(error: unknown)`
- frontend：`utils/error-handler.ts` 與 `utils/errorHandler.ts`
  **各有一份 `getErrorMessage`——這兩個檔案本身就該合併**，
  順手處理掉（先確認兩邊行為是否一致，不一致要問使用者要哪一個）

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

**注意**：`ProjectDetail.vue` 在 2026-09-05 收工時**有使用者未提交的改動**。
動它之前先確認工作區狀態，必要時請使用者先提交。

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
