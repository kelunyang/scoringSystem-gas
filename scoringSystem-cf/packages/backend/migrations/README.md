# D1 Migrations

**這些 migration 現在可以從零建出完整資料庫。** 這在 2026-09-05 之前不成立，
以下記錄它為什麼壞掉、怎麼修的，以及新增 migration 時要注意什麼。

## 現在怎麼用

```bash
cd scoringSystem-cf/packages/backend

pnpm db:migrate            # 本地：套用所有未套用的 migration
pnpm db:migrate:remote     # 遠端：同上
pnpm init:local            # 建立第一個管理員帳號（只寫資料，不建表）
```

`db:rebuild` = 重設本地 DB → 套用 migrations → 建管理員。

**沒有 `/auth/init-system` 這個端點。** `index.ts` 曾經有訊息指向它，
但它從未被實作過——建庫一直是 CLI 的工作。那些訊息已於 2026-09-05 修正。

## 曾經壞在哪（2026-09-05 修復）

### 1. 兩套編號並行，順序是錯的

`.gitignore` 的 `*.sql` 規則曾經吃掉整個目錄，補救時只 `git add` 了一半，
於是長出兩套各自從 0001 開始的序列，在 0001／0003／0004／0005／0006 撞號。

`wrangler d1 migrations apply` **依檔名排序**執行，所以
`0001_add_aiservicecalls` 和 `0003_add_totp_support`（兩者都
`ALTER TABLE users`）排在建立 users 表的 `0003_init_schema` **之前**。
從零套用會在第一個 ALTER 就中止。

沒人發現，是因為實際跑的資料庫都是手動建起來的。

**修法**：重新編號成正確的相依順序，並同步更新本地與遠端
`d1_migrations` 表裡記錄的檔名（否則 wrangler 會認為它們沒套用過而重跑）。

| 現在 | 原本 |
|------|------|
| `0001_init_schema.sql` | `0003_init_schema.sql` |
| `0002_add_aiservicecalls.sql` | `0001_add_aiservicecalls.sql` |
| `0003_add_announcements.sql` | `0002_add_announcements.sql` |
| `0004_add_totp_support.sql` | `0003_add_totp_support.sql` |
| `0005_add_passkey_support.sql` | `0004_add_passkey_support.sql` |
| `0006_fix_invitation_unique_index.sql` | `0004_fix_invitation_unique_index.sql` |
| `0007_add_stage_pause.sql` | `0005_add_stage_pause.sql` |
| `0008_add_withdraw_reason.sql` | `0005_add_withdraw_reason.sql` |
| `0009_add_max_vote_reset_count.sql` | `0006_add_max_vote_reset_count.sql` |
| `0010_add_rate_limit_counters.sql` | `0006_add_rate_limit_counters.sql` |
| `0011_2fa_binding.sql` | `0008_2fa_binding.sql` |
| `0012_password_changed_at.sql` | `0009_password_changed_at.sql` |

`0001_initial.sql` 已刪除——它只建一張沒人用的 `_migrations` 佔位表，
註解還說 schema 由某個不存在的端點建立。

### 2. `db:sync-schema` 會用更舊的檔案覆蓋 migration

```
"db:sync-schema": "cp ../../../database/schema.sql ./migrations/0003_init_schema.sql"
```

而 `database/schema.sql` **比生產環境少三張表**
（`passkey_credentials`、`rate_limit_counters`、`totp_recovery_codes`）。
`db:reset:*` 和 `db:nuke` 都會先跑它，等於「重設資料庫」會順手把
migration 退回舊版。指令已移除。

`database/schema.sql` 本身留著沒動，但**它不再是任何流程的輸入**。
schema 的唯一來源是這個目錄。

### 3. 重複的 passkey migration

`0004_add_passkey_support.sql` 與 `0007_add_passkey_support.sql` 都執行
`ALTER TABLE users ADD COLUMN passkeyEnabled`，兩份都跑必然
`duplicate column name`。遠端 `d1_migrations` 顯示只套用過前者，
後者已刪除，其獨有的 `idx_passkey_credentials_lastused` 索引併入 `0011`。

## 新增 migration 時

1. `pnpm db:create <描述>` 或手動建檔，**編號接續目前最大值 + 1**。
2. `tests/migrations-build-clean.test.ts` 會驗證：
   - 編號**不重複、不跳號**
   - 全部依序套用到全新的 SQLite 能成功
   - 建出的表、view、關鍵欄位齊全
3. SQLite 的 `ALTER TABLE ADD COLUMN` **沒有 `IF NOT EXISTS`**，
   所以同一個欄位不能在兩個 migration 裡加。加欄位前先確認它還不存在。
4. 對 `users` 之類的核心表做 ALTER，一定要排在 `0001_init_schema` 之後
   ——現在的編號保證了這點，但改名或插號時要重新確認。

## 驗證遠端狀態

```bash
npx wrangler d1 execute scoring-system-db --remote \
  --command "SELECT id, name FROM d1_migrations ORDER BY id"
npx wrangler d1 migrations list scoring-system-db --remote
```

第二個指令應該回報 `No migrations to apply!`。若它列出已經套用過的檔案，
代表記錄的檔名與目錄裡的不符——**不要直接 apply**，先比對兩邊的名稱。
