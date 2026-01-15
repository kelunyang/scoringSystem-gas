# API Specification

Scoring System Backend API (Cloudflare Workers + Hono)

## Base URL

| Environment | URL |
|-------------|-----|
| Production | `https://scoring-system.kelunyang.workers.dev` |
| Development | `http://localhost:8787` |

## Authentication

所有 API (除非特別標註 Public) 需要在 Header 帶入 JWT Token：

```
Authorization: Bearer <jwt_token>
```

Token 透過 `/api/auth/login-verify-2fa` 取得，有效期由系統設定 `SESSION_TIMEOUT` 控制。

### SUDO Mode (觀察者模式)

學生可使用 SUDO 模式以觀察者身份查看專案：

**Headers:**
```
X-Sudo-As: <target_user_id>
X-Sudo-Project: <project_id>
```

**限制：**
- 僅限學生使用
- 僅限唯讀操作（寫入操作會回傳 `SUDO_NO_WRITE` 錯誤）
- 所有 SUDO 操作會被記錄

---

## API Modules

### 1. Authentication (`/api/auth/`)

使用者認證與登入管理。

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | Public | 註冊新使用者 (需邀請碼) |
| POST | `/login-verify-password` | Public | 登入第一步：驗證密碼 |
| POST | `/login-verify-2fa` | Public | 登入第二步：驗證 2FA 碼 |
| POST | `/resend-2fa` | Public | 重發 2FA 驗證碼 |
| POST | `/logout` | Required | 登出 |
| POST | `/validate` | Required | 驗證 Token |
| POST | `/current-user` | Required | 取得當前使用者資訊 (含滑動過期) |
| POST | `/refresh-token` | Required | 刷新 Token |
| POST | `/change-password` | Required | 更改密碼 |
| GET | `/check-email` | Public | 檢查 Email 是否可用 |
| POST | `/verify-email-for-reset` | Public | 密碼重設第一步 |
| POST | `/password-reset-verify-code` | Public | 密碼重設第二步 |
| POST | `/reset-password` | Public | 密碼重設第三步 |

---

### 2. Users (`/api/users/`)

使用者個人資料管理。

| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| POST | `/avatar/generate` | Public | - | 生成頭像資料 |
| POST | `/profile` | Required | - | 取得使用者資料 |
| POST | `/profile/update` | Required | - | 更新個人資料 |
| POST | `/update` | Required | - | 更新使用者資訊 |
| POST | `/update-settings` | Required | - | 更新使用者設定 |
| POST | `/avatar/update` | Required | - | 更新頭像 |
| POST | `/avatar/regenerate` | Required | - | 重新生成頭像種子 |
| POST | `/search` | Required | - | 搜尋使用者 |
| POST | `/display-names` | Required | project:view | 批次取得顯示名稱 |

---

### 3. Admin (`/api/admin/`)

系統管理功能 (需 system_admin 或特定權限)。

#### User Management

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET/POST | `/users/list` | manage_users | 取得所有使用者 |
| POST | `/users/update-status` | manage_users | 更新使用者狀態 |
| POST | `/user-profile` | manage_users | 更新使用者資料 |
| POST | `/users/reset-password` | manage_users | 重設密碼 |
| POST | `/users/unlock` | manage_users | 解鎖帳號 |
| POST | `/users/batch-update-status` | manage_users | 批次更新狀態 |
| POST | `/users/batch-reset-password` | manage_users | 批次重設密碼 |
| POST | `/user-global-groups` | manage_users | 取得使用者全域群組 |
| POST | `/user-project-groups` | manage_users | 取得使用者專案群組 |
| POST | `/users/activity` | manage_users/self | 取得使用者活動統計 |
| POST | `/users/update-permissions` | system_admin | 更新使用者權限 |

#### Global Group Management

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET/POST | `/global-groups` | manage_global_groups | 取得所有全域群組 |
| POST | `/create-global-group` | manage_global_groups | 建立全域群組 |
| POST | `/update-global-group` | manage_global_groups | 更新全域群組 |
| POST | `/deactivate-global-group` | manage_global_groups | 停用全域群組 |
| POST | `/activate-global-group` | manage_global_groups | 啟用全域群組 |
| POST | `/global-groups/members` | manage_global_groups | 取得群組成員 |
| POST | `/global-groups/add-user` | manage_global_groups | 新增成員 |
| POST | `/global-groups/remove-user` | manage_global_groups | 移除成員 |
| POST | `/global-groups/batch-add-users` | manage_global_groups | 批次新增成員 |
| POST | `/global-groups/batch-remove-users` | manage_global_groups | 批次移除成員 |
| POST | `/batch-deactivate-global-groups` | manage_global_groups | 批次停用群組 |
| POST | `/batch-activate-global-groups` | manage_global_groups | 批次啟用群組 |

#### System Management

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET/POST | `/system/stats` | system_admin | 系統統計資料 |
| POST | `/system/logs` | view_system_logs | 系統日誌 |
| GET/POST | `/system/log-statistics` | view_system_logs | 日誌統計 |
| POST | `/system/entity-details` | system_admin | 實體詳細資料 |

#### Properties Management

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/properties/get-all` | system_admin | 取得所有系統設定 |
| POST | `/properties/update` | system_admin | 更新系統設定 |
| POST | `/properties/reset` | system_admin | 重設為預設值 |

#### Notification Management

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/notifications/list` | notification_manager | 列出所有通知 |
| POST | `/notifications/send-single` | notification_manager | 發送單一通知郵件 |
| POST | `/notifications/send-batch` | notification_manager | 批次發送通知郵件 |
| POST | `/notifications/delete` | notification_manager | 刪除通知 |

#### Email Logs Management

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/email-logs/query` | manage_email_logs | 查詢郵件日誌 |
| POST | `/email-logs/statistics` | manage_email_logs | 郵件統計 |
| POST | `/email-logs/resend-single` | manage_email_logs | 重發單一郵件 |
| POST | `/email-logs/resend-batch` | manage_email_logs | 批次重發郵件 |

#### AI Service Logs Management

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/ai-service-logs/query` | system_admin | 查詢 AI 服務日誌 |
| POST | `/ai-service-logs/statistics` | system_admin | AI 服務統計 |
| GET | `/ai-service-logs/:callId` | system_admin | 取得 AI 呼叫詳情 |

#### Robots Management

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/robots/status` | system_admin | 取得機器人狀態 |
| POST | `/robots/notification-patrol` | system_admin | 執行通知巡邏 |
| POST | `/robots/notification-patrol/config` | system_admin | 取得巡邏設定 |
| POST | `/robots/notification-patrol/update-config` | system_admin | 更新巡邏設定 |
| POST | `/robots/notification-patrol/pending` | system_admin | 取得待發送通知 |
| POST | `/robots/notification-patrol/statistics` | system_admin | 巡邏統計 |

#### Security Management

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/security/suspicious-logins` | system_admin | 檢查可疑登入 |

#### SMTP Configuration

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/smtp/get-config` | system_admin | 取得 SMTP 設定 |
| POST | `/smtp/update-config` | system_admin | 更新 SMTP 設定 |
| POST | `/smtp/test-connection` | system_admin | 測試 SMTP 連線 |

---

### 4. Projects (`/api/projects/`)

專案管理。

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/create` | create_project | 建立專案 |
| POST | `/get` | project:view | 取得專案詳情 |
| POST | `/update` | project:manage | 更新專案 |
| POST | `/delete` | project:manage | 刪除專案 |
| POST | `/list` | - | 列出使用者專案 |
| POST | `/list-with-stages` | - | 列出專案含階段 |
| POST | `/core` | project:view | 取得專案核心資料 |
| POST | `/content` | project:view | 取得專案內容資料 |
| POST | `/clone` | create_project | 複製專案 |
| POST | `/viewers/list` | project:view | 列出專案檢視者 |
| POST | `/viewers/add` | project:manage | 新增檢視者 |
| POST | `/viewers/add-batch` | project:manage | 批次新增檢視者 |
| POST | `/viewers/remove` | project:manage | 移除檢視者 |
| POST | `/viewers/remove-batch` | project:manage | 批次移除檢視者 |
| POST | `/viewers/update-role` | project:manage | 更新檢視者角色 |
| POST | `/viewers/update-roles-batch` | project:manage | 批次更新檢視者角色 |
| POST | `/viewers/mark-unassigned` | project:view | 標記未分組成員 |
| POST | `/mark-unassigned-members` | project:manage | 批次標記未分組成員 |
| GET | `/:projectId/scoring-config` | project:view | 取得評分設定 |
| PUT | `/:projectId/scoring-config` | project:manage | 更新評分設定 |
| GET | `/system/scoring-defaults` | system_admin | 取得系統預設評分設定 |
| PUT | `/system/scoring-defaults` | system_admin | 更新系統預設評分設定 |

---

### 5. Stages (`/api/stages/`)

階段管理。

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/create` | project:manage | 建立階段 |
| POST | `/get` | project:view | 取得階段詳情 |
| POST | `/update` | project:manage | 更新階段 |
| POST | `/delete` | project:manage | 刪除階段 |
| POST | `/list` | project:view | 列出專案階段 |
| POST | `/clone` | project:manage | 複製階段 |
| POST | `/clone-to-projects` | project:manage | 複製階段至多個專案 |
| POST | `/check-voting-lock` | project:view | 檢查投票鎖定 |
| POST | `/force-transition` | project:manage | 強制轉換狀態 |
| POST | `/config` | project:view | 取得階段設定 |
| POST | `/config/get` | project:view | 取得階段設定 (alias) |
| POST | `/config/update` | project:manage | 更新階段設定 |
| POST | `/config/reset` | project:manage | 重設階段設定 |
| POST | `/pause` | project:manage | 暫停階段 |
| POST | `/resume` | project:manage | 恢復暫停的階段 |

---

### 6. Submissions (`/api/submissions/`)

作業繳交管理。

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/submit` | project:view + active stage | 繳交作業 |
| POST | `/list` | project:view | 列出階段繳交 |
| POST | `/get` | project:view | 取得單一繳交 |
| POST | `/details` | project:view | 取得繳交詳情 |
| POST | `/delete` | project:view + active stage | 刪除繳交 |
| POST | `/upload-url` | project:view + active stage | 取得上傳 URL |
| POST | `/download` | project:view | 下載繳交檔案 |
| POST | `/versions` | project:view | 取得版本歷史 |
| POST | `/restore` | project:view | 還原版本 |
| POST | `/participation-status` | project:view | 取得參與確認狀態 |
| POST | `/voting-history` | project:view | 取得投票歷史 |
| POST | `/confirm-participation` | project:view + active stage | 確認參與 |
| POST | `/force-withdraw` | teacher | 教師強制撤回繳交 |

---

### 7. Rankings (`/api/rankings/`)

排名與投票管理。

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/stage-rankings` | project:view | 取得階段排名 |
| POST | `/all-stages-rankings` | project:view | 批次取得多個階段排名 |
| POST | `/teacher-vote-history` | project:view | 教師投票歷史 |
| POST | `/teacher-ranking-versions` | teacher | 教師排名版本 |
| POST | `/proposals` | project:view | 取得排名提案 |
| POST | `/teacher-comprehensive-vote` | teacher | 教師綜合投票 |
| POST | `/submit` | group member | 提交群組排名提案 |
| POST | `/vote` | group member | 投票排名提案 |
| POST | `/withdraw` | group member | 撤回排名提案 |
| POST | `/reset-votes` | group leader | 重設投票 |
| POST | `/stage-vote` | group member | 提交階段排名投票 |
| POST | `/voting-status` | project:view | 取得投票狀態 |
| POST | `/teacher-rankings` | teacher | 取得教師排名 |
| POST | `/ai-providers` | teacher | 取得 AI 提供者列表 |
| POST | `/ai-suggestion` | teacher | AI 排名建議 (Rate Limited) |
| POST | `/ai-bt-suggestion` | teacher | Bradley-Terry AI 排名建議 (Rate Limited) |
| POST | `/ai-multi-agent-suggestion` | teacher | 多代理議會模式 AI 排名 (Rate Limited) |
| POST | `/ai-history` | teacher | AI 排名歷史記錄 |
| POST | `/ai-detail` | teacher | AI 排名呼叫詳情 |

---

### 8. Comments (`/api/comments/`)

留言管理。

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/create` | project:comment + active/voting | 建立留言 |
| POST | `/details` | project:view | 取得留言詳情 |
| POST | `/stage` | project:view | 取得階段留言 |
| POST | `/all-stages` | project:view | 批次取得多個階段留言 |
| POST | `/reactions/add` | mentioned student | 新增反應 |
| POST | `/reactions/remove` | project:view | 移除反應 |
| POST | `/reactions/get` | project:view | 取得反應 |
| POST | `/voting-eligibility` | project:view | 檢查投票資格 |
| POST | `/ranking` | project:comment | 提交留言排名 |
| POST | `/rankings` | project:view | 取得單一留言排名 |
| POST | `/stage-rankings` | project:view | 取得階段留言排名 |
| POST | `/settlement-analysis` | project:view | 結算分析 |
| POST | `/ranking-history` | project:view | 排名歷史 |

---

### 9. Groups (`/api/groups/`)

專案群組管理。

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/create` | project:manage | 建立群組 |
| POST | `/batch-create` | project:manage | 批次建立群組 |
| POST | `/details` | project:view | 取得群組詳情 |
| POST | `/update` | project:manage/leader | 更新群組 |
| POST | `/delete` | project:manage | 刪除群組 |
| POST | `/deactivate` | project:manage | 停用群組 |
| POST | `/activate` | project:manage | 啟用群組 |
| POST | `/add-member` | project:manage/leader | 新增成員 |
| POST | `/batch-add-members` | project:manage/leader | 批次新增成員 |
| POST | `/remove-member` | project:manage/leader | 移除成員 |
| POST | `/batch-remove-members` | project:manage/leader | 批次移除成員 |
| POST | `/update-member-role` | project:manage | 更新成員角色 |
| POST | `/batch-update-roles` | project:manage | 批次更新角色 |
| POST | `/list` | project:view | 列出群組 |
| POST | `/mention-data` | project:view | 取得 @mention 資料 |
| POST | `/batch-update-status` | project:manage | 批次更新狀態 |
| POST | `/batch-update-allow-change` | project:manage | 批次更新允許變更 |

---

### 10. Wallets (`/api/wallets/`)

錢包與積分管理 (Ledger 架構)。

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/get` | project:view | 取得使用者錢包 |
| POST | `/transactions` | project:view | 取得交易歷史 |
| POST | `/transactions/all` | project:manage | 取得專案所有交易 |
| POST | `/award` | project:manage | 獎勵積分 |
| POST | `/reverse` | project:manage | 撤銷交易 |
| POST | `/project-ladder` | project:view | 專案錢包排行 |
| POST | `/leaderboard` | project:view | 錢包排行榜 |
| POST | `/group-stats` | project:view | 群組財富統計 |
| POST | `/export` | project:manage | 匯出錢包摘要 |
| POST | `/stage-growth` | project:view | 階段成長資料 |

---

### 11. Invitations (`/api/invitations/`)

邀請碼管理。

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/verify` | Public | 驗證邀請碼 |
| POST | `/generate` | generate_invites | 產生邀請碼 |
| POST | `/generate-batch` | generate_invites | 批次產生邀請碼 |
| POST | `/list` | generate_invites | 列出邀請碼 |
| POST | `/deactivate` | generate_invites | 停用邀請碼 |
| POST | `/reactivate` | generate_invites | 重新啟用邀請碼 |
| POST | `/resend-email` | generate_invites | 重發邀請郵件 |
| POST | `/email-status` | generate_invites | 取得郵件發送狀態 |

---

### 12. Notifications (`/api/notifications/`)

通知管理。

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/count` | - | 取得未讀數量 |
| POST | `/list` | - | 列出通知 |
| POST | `/mark-read` | - | 標記已讀 |
| POST | `/mark-all-read` | - | 全部標記已讀 |
| POST | `/delete` | - | 刪除通知 |

---

### 13. Scoring (`/api/scoring/`)

評分與結算。

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/validate-settlement` | project:manage | 驗證結算前條件 |
| POST | `/settle` | project:manage | 執行結算 |
| POST | `/submission-voting-data` | project:view | 取得作業投票資料 |
| POST | `/comment-voting-data` | project:view | 取得留言投票資料 |

---

### 14. Settlement (`/api/settlement/`)

結算歷史管理。

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/reverse` | project:manage | 撤銷結算 |
| POST | `/reverse-preview` | project:manage | 預覽撤銷影響 |
| POST | `/history` | project:view | 結算歷史 |
| POST | `/details` | project:view | 結算詳情 |
| POST | `/transactions` | project:view | 結算交易記錄 |
| POST | `/stage-rankings` | project:view | 階段結算排名 |
| POST | `/comment-rankings` | project:view | 留言結算排名 |

---

### 15. Event Logs (`/api/eventlogs/`)

專案事件日誌。

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/project` | project:view | 專案事件日誌 |
| POST | `/user` | project:view | 使用者事件日誌 |
| POST | `/resource` | project:view | 資源詳細資料 |

---

### 16. System (`/api/system/`)

系統資訊與設定。

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/turnstile-config` | Public | Turnstile 設定 |
| GET/POST | `/info` | Public | 系統資訊 |
| POST | `/logs` | view_system_logs | 系統日誌 |
| POST | `/logs/stats` | view_system_logs | 日誌統計 |
| POST | `/ai-providers/list` | system_admin | AI 提供者列表 |
| POST | `/ai-providers/create` | system_admin | 建立 AI 提供者 |
| POST | `/ai-providers/update` | system_admin | 更新 AI 提供者 |
| POST | `/ai-providers/delete` | system_admin | 刪除 AI 提供者 |
| POST | `/ai-providers/test` | system_admin | 測試 AI 提供者連線 |
| POST | `/ai-prompts/get` | system_admin | 取得 AI 提示設定 |
| POST | `/ai-prompts/update` | system_admin | 更新 AI 提示設定 |

---

### 17. Utility Endpoints

基礎端點。

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API 狀態與資料庫初始化資訊 |
| GET | `/health` | 健康檢查 |
| GET | `/api` | API 版本與端點列表 |
| POST | `/auth/init-system` | 初始化資料庫 (首次使用) |

---

## Permission Levels

### Global Permissions

| Permission | Description |
|------------|-------------|
| `system_admin` | 完整系統管理權限 |
| `create_project` | 建立專案 |
| `generate_invites` | 產生邀請碼 |
| `manage_users` | 管理使用者 |
| `manage_global_groups` | 管理全域群組 |
| `view_system_logs` | 檢視系統日誌 |
| `notification_manager` | 管理通知 |
| `manage_email_logs` | 管理郵件日誌 |

### Project Roles

| Role | Permission Level | Description |
|------|-----------------|-------------|
| Creator/Admin | Level 0 | 專案建立者，完整管理權限 |
| Teacher | Level 1 | 教師，可評分與管理 |
| Observer | Level 2 | 觀察者，僅可檢視 |
| Group Leader | Level 3 | 群組組長，可管理組員 |
| Member | Level 4 | 一般成員 |

### Project Permissions

| Permission | Allowed Roles |
|------------|---------------|
| `view` | Level 0-4 |
| `comment` | Level 0-1, Level 3-4 (not Observer) |
| `manage` | Level 0-1 |

---

## Response Format

### Success Response

```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

### Common Error Codes

#### Authentication Errors (401)

| Code | Description |
|------|-------------|
| `NO_SESSION` | 無 Session |
| `UNAUTHORIZED` | 未認證 |
| `INVALID_SESSION` | Session 無效 |
| `SESSION_EXPIRED` | Session 已過期 |
| `INVALID_CREDENTIALS` | 認證資訊無效 |

#### Authorization Errors (403)

| Code | Description |
|------|-------------|
| `FORBIDDEN` | 禁止存取 |
| `INSUFFICIENT_PERMISSIONS` | 權限不足 |
| `NOT_PROJECT_MEMBER` | 非專案成員 |
| `ACCESS_DENIED` | 拒絕存取 |
| `SUDO_NO_WRITE` | SUDO 模式為唯讀 |
| `NOT_GROUP_MEMBER` | 非群組成員 |
| `NOT_GROUP_LEADER` | 非群組組長 |
| `NOT_AUTHORIZED` | 未授權操作 |
| `USER_DISABLED` | 使用者已停用 |

#### Not Found Errors (404)

| Code | Description |
|------|-------------|
| `NOT_FOUND` | 資源不存在 |
| `USER_NOT_FOUND` | 使用者不存在 |
| `PROJECT_NOT_FOUND` | 專案不存在 |
| `STAGE_NOT_FOUND` | 階段不存在 |
| `SUBMISSION_NOT_FOUND` | 繳交不存在 |
| `GROUP_NOT_FOUND` | 群組不存在 |
| `ENTITY_NOT_FOUND` | 實體不存在 |
| `PROPOSAL_NOT_FOUND` | 提案不存在 |

#### Validation Errors (400)

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | 請求驗證失敗 |
| `INVALID_INPUT` | 輸入無效 |
| `MISSING_PARAMETER` | 缺少必要參數 |
| `MISSING_FIELDS` | 缺少必要欄位 |
| `INVALID_INVITATION_CODE` | 邀請碼無效 |
| `USERNAME_TAKEN` | 使用者名稱已被使用 |
| `EMAIL_TAKEN` | Email 已被使用 |

#### Business Logic Errors (400)

| Code | Description |
|------|-------------|
| `STAGE_NOT_ACTIVE` | 階段非進行中 |
| `SUBMISSION_DEADLINE_PASSED` | 繳交期限已過 |
| `ALREADY_SUBMITTED` | 已繳交過 |
| `USER_ALREADY_IN_PROJECT_GROUP` | 使用者已在專案群組中 |
| `INSUFFICIENT_BALANCE` | 餘額不足 |
| `TRANSACTION_FAILED` | 交易失敗 |
| `GROUP_EXISTS` | 群組已存在 |
| `PROPOSAL_EXISTS` | 提案已存在 |
| `PROPOSAL_NOT_PENDING` | 提案非待處理狀態 |
| `LIMIT_EXCEEDED` | 超過限制 |
| `NO_GROUP_MEMBERS` | 群組無成員 |
| `NO_VOTES` | 無投票 |
| `NOT_ALL_VOTED` | 尚有成員未投票 |
| `PROPOSAL_PASSED` | 提案已通過 |
| `RESET_LIMIT_EXCEEDED` | 重設次數超過限制 |
| `RESET_FAILED` | 重設失敗 |
| `ALREADY_WITHDRAWN` | 已撤回 |
| `CANNOT_WITHDRAW` | 無法撤回 |
| `CANNOT_WITHDRAW_SETTLED` | 無法撤回已結算提案 |
| `WITHDRAW_FAILED` | 撤回失敗 |

#### Rate Limiting (429)

| Code | Description |
|------|-------------|
| `RATE_LIMIT_EXCEEDED` | 請求過於頻繁 |

#### Server Errors (500)

| Code | Description |
|------|-------------|
| `INTERNAL_ERROR` | 內部錯誤 |
| `DATABASE_ERROR` | 資料庫錯誤 |
| `UNKNOWN_ERROR` | 未知錯誤 |

---

## Rate Limiting

部分端點有請求頻率限制：

| Endpoint | Limit |
|----------|-------|
| `/api/rankings/ai-suggestion` | 10/分鐘, 60/小時 |
| `/api/rankings/ai-bt-suggestion` | 10/分鐘, 60/小時 |
| `/api/rankings/ai-multi-agent-suggestion` | 10/分鐘, 60/小時 |
| `/api/admin/notifications/send-batch` | Email 發送限制 |

超過限制時回傳 HTTP 429 並包含 `Retry-After` header。

---

## CORS Configuration

允許的來源：
- `https://scoring.kelunyang.online` (Production)
- `http://localhost:5173` (Development)
- `http://localhost:8787` (Development)

允許的方法：`GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`

允許的 Headers：`Content-Type`, `Authorization`, `X-Session-Id`
