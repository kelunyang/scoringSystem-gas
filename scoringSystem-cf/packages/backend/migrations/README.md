# D1 Migrations — 實際狀態說明

**動手改這個目錄之前先讀完。** 這裡的編號是壞的，而且修復需要先確認遠端實際狀態。

## 為什麼會亂

兩件事疊在一起：

1. **schema 不是 migration 建的。** `0001_initial.sql` 只建了一張佔位表，
   註解說 schema 由 `POST /auth/init-system` 端點建立。實際的 34 張表定義在
   `0003_init_schema.sql`（36KB），但它從未被 `wrangler d1 migrations apply` 套用過。
2. **`.gitignore` 的 `*.sql` 規則曾經吃掉整個目錄**（已於 commit 21a57f6 修正為
   `!packages/backend/migrations/*.sql`），但當時只補 `git add` 了一部分檔案，
   另一半留在 untracked 狀態直到 2026-09-05。

結果是兩套並行的編號序列，撞號在 0001/0003/0004/0005/0006。

## 本地 D1 的實測結果（2026-09-05）

```
d1_migrations 表內容：
  0001_initial.sql          2025-12-18
  0001_add_aiservicecalls.sql   2026-01-13
  0002_add_announcements.sql    2026-01-13
  0003_add_totp_support.sql     2026-04-14

實際表數：38
users 欄位：無 passkeyEnabled / passkeyEnabledAt
```

也就是說：**只有 4 個 migration 被記錄套用，schema 卻是完整的**（init 端點建的），
而 passkey 相關的 migration 一個都沒套用——本地環境的 passkey 功能其實是壞的
（`user.passkeyEnabled` 讀到 undefined，永遠是 false）。

## 已經做的處理

- 把先前 untracked 的 migration 全部納入版控。
- **刪除重複的 `0007_add_passkey_support.sql`**。它和 `0004_add_passkey_support.sql`
  都執行 `ALTER TABLE users ADD COLUMN passkeyEnabled`，兩份都跑必然
  `duplicate column name` 失敗。保留 git 已追蹤的 0004 為準。
  0007 獨有的 `idx_passkey_credentials_lastused` 索引已併入 `0008_2fa_binding.sql`。
  （0007 另有 FK 與可為 null 的 `transports`，SQLite 無法用 ALTER 補 FK，
  差異就此接受。）

## 遠端實測結果（2026-09-05）

```
d1_migrations（7 筆，全部是 git 已追蹤的那一系列）：
  0001_initial.sql
  0001_add_aiservicecalls.sql
  0002_add_announcements.sql
  0003_add_totp_support.sql
  0004_add_passkey_support.sql
  0005_add_withdraw_reason.sql
  0006_add_rate_limit_counters.sql

schema 抽查：
  stages.pausedTime                 存在
  projects.maxVoteResetCount        存在
  two_factor_codes.context          不存在
  idx_invitation_active_email       不存在（已被刪過）
  stages_with_status 含 paused 分支  是
  users.passkeyEnabled/-At          存在
```

**結論**：遠端從未套用過先前 untracked 的那一系列，但它們的 schema 變更
**早就以手動方式套用了**。也就是說資料庫狀態是對的，只有記帳是錯的。

`0007_add_passkey_support.sql` 從未上過遠端，所以刪除它是安全的；
`0004_add_passkey_support.sql` 有記錄且欄位存在，不會撞 duplicate column。

### 這造成的地雷

wrangler 讀目錄、不讀 git，所以它會認為以下五個檔案「還沒套用」：

| 順序 | 檔案 | 重跑安全嗎 |
|------|------|------------|
| 1 | `0003_init_schema.sql` | ✅ 全部 `IF NOT EXISTS`（含 5 個 VIEW），no-op |
| 2 | `0004_fix_invitation_unique_index.sql` | ✅ `DROP INDEX IF EXISTS`，冪等 |
| 3 | `0005_add_stage_pause.sql` | ❌ **`ALTER TABLE stages ADD COLUMN pausedTime` 會失敗** |
| 4 | `0006_add_max_vote_reset_count.sql` | ❌ **同樣是 ADD COLUMN，會失敗** |
| 5 | `0008_2fa_binding.sql` | ✅ 但排在第 3 個失敗之後，永遠輪不到 |

SQLite 的 `ALTER TABLE ADD COLUMN` 沒有 `IF NOT EXISTS`，無法改寫成冪等。

### 修法：補登記錄，不要改檔案

```sql
INSERT OR IGNORE INTO d1_migrations (name) VALUES
  ('0003_init_schema.sql'),
  ('0004_fix_invitation_unique_index.sql'),
  ('0005_add_stage_pause.sql'),
  ('0006_add_max_vote_reset_count.sql');
```

只動記帳表，不碰業務資料。跑完之後 `migrate:remote` 只會套用 `0008`。

**為什麼不是刪掉 0005／0006**：`0003_init_schema.sql` 的 `stages` 表沒有
`pausedTime`、`projects` 表沒有 `maxVoteResetCount`，全新環境仍然需要這兩步。
刪掉它們會讓乾淨環境少兩個欄位。

## 長期該做的事

`/auth/init-system` 這條建庫路徑應該廢掉，讓 migrations 成為唯一事實來源。
在那之前，**不要在乾淨環境用 `migrations apply` 重建資料庫**——
順序是錯的（`0001_add_aiservicecalls` 和 `0003_add_totp_support` 都會在
`0003_init_schema` 建表之前執行 `ALTER TABLE users`）。
