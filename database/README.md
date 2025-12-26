# Database Schema

Cloudflare D1 (SQLite) 資料庫結構說明。

## 資料來源

- **Schema 定義**: [schema.sql](schema.sql)
- **Migration**: `scoringSystem-cf/packages/backend/migrations/`

## 資料表概覽

### 核心資料表 (30 個)

| 類別 | 資料表 |
|------|--------|
| **使用者** | users, globalgroups, globalusergroups, invitation_codes, two_factor_codes |
| **專案** | projects, groups, usergroups, projectviewers, stages |
| **作業** | submissions, submissionapprovalvotes |
| **評分** | rankings, rankingproposals, proposalvotes, commentrankingproposals |
| **教師評分** | teachercommentrankings, teachersubmissionrankings |
| **結算** | settlementhistory, stagesettlements, commentsettlements |
| **互動** | comments, reactions |
| **錢包** | transactions, transactionlogs |
| **日誌** | eventlogs, sys_logs, notifications, globalemaillogs |
| **冪等性** | email_idempotency, notification_idempotency |

### VIEWs (5 個)

用於自動計算狀態，取代原本的 status 欄位：

| VIEW | 說明 |
|------|------|
| stages_with_status | 階段狀態 (pending/active/voting/completed/archived) |
| submissions_with_status | 提交狀態 (submitted/approved/withdrawn) |
| rankingproposals_with_status | 投票提案狀態 + 投票結果 |
| invitation_codes_with_status | 邀請碼狀態 (active/used/expired/deactivated) |
| stages_vote_status | 檢查階段是否有投票 |

### Triggers (2 個)

專案評分配置驗證 (INSERT/UPDATE)。

### Indexes (64 個)

針對常用查詢優化的索引。

## 狀態計算架構

採用 VIEW-based 狀態計算，避免 TOCTOU 競態條件：

```
狀態 = CASE WHEN timestamp IS NOT NULL THEN status END
```

所有狀態欄位改為 timestamp 驅動，由 VIEW 即時計算。

## 同步指令

修改 schema.sql 後，同步到 migration：

```bash
cd scoringSystem-cf/packages/backend
pnpm db:sync-schema
```
