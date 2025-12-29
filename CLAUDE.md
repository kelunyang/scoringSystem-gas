**我們現在處理的是 cloudflare-worker 版本！**

# AI Code Generation Guidelines for Scoring System Project

## 1. 概覽 Overview

### 專案目錄說明

- **當前開發版本**: `scoringSystem-cf/` 目錄下的 Cloudflare Worker 版本
- **系統設計文檔**: 參見 [plan/GAS/updated_project_spec.md](plan/GAS/updated_project_spec.md)
- **詳細實現文檔**: 參見 [scoringSystem-cf/README.md](scoringSystem-cf/README.md)
- **舊版參考**: `Backup/` 目錄包含已廢棄的 GAS 版本
- **備份文檔**: GAS 初始化和 Playwright 詳細文檔在 `claude.bak`

### Monorepo 結構 (pnpm workspaces)

| 目錄 | 說明 |
|------|------|
| `packages/backend/` | @repo/backend - Cloudflare Workers (TypeScript) |
| `packages/frontend/` | @repo/frontend - Vue 3 SPA (TypeScript) |
| `packages/shared/` | @repo/shared - 共享類型與 Schemas |

### 技術棧總覽

| 層級 | 技術 |
|------|------|
| **Backend** | TypeScript (strict), Hono, Cloudflare D1 (SQLite), JWT (jose), Zod, Gmail API |
| **Frontend** | TypeScript, Vue 3 Composition API, Element Plus, Vite, TanStack Query, D3.js |
| **Shared** | Zod schemas, TypeScript types, 共享常數 |

---

## 2. 架構 Architecture

### Cloudflare Worker 架構

- **環境與 Bindings**: 參見 [packages/backend/src/types.ts](scoringSystem-cf/packages/backend/src/types.ts)
- **API Routing (Hono)**: 參見 [packages/backend/src/index.ts](scoringSystem-cf/packages/backend/src/index.ts)

#### 效能優化原則
- Leverage edge caching with Cache API
- Use D1 batch operations for multiple queries
- Minimize round-trips with GraphQL-like queries
- Cache JWT validation results in KV
- Use Durable Objects for WebSocket connections

### 認證架構 (JWT)

| 流程 | 說明 |
|------|------|
| Registration | Invitation code required → Create user → Issue JWT |
| Login | Username/password validation → Issue JWT with sliding expiration |
| Token Validation | Every API call extends token expiration |
| Security | Malicious login detection, rate limiting |

**實現檔案**:
- JWT: [packages/backend/src/handlers/auth/jwt.ts](scoringSystem-cf/packages/backend/src/handlers/auth/jwt.ts)
- Password: [packages/shared/src/utils/password.ts](scoringSystem-cf/packages/shared/src/utils/password.ts) (PBKDF2-SHA256, 600,000 iterations)
- Register: [packages/backend/src/handlers/auth/register.ts](scoringSystem-cf/packages/backend/src/handlers/auth/register.ts)

---

## 3. 資料庫 Database

### Cloudflare D1 (SQLite)

**IMPORTANT**: 使用 Cloudflare D1 database (SQLite)，不是 Google Sheets。

#### 資料庫結構 (38 Tables)
- **Core Tables**: Users, Projects, GlobalGroups, InvitationCodes
- **Project Tables**: Stages, Submissions, Rankings, ProjectGroups
- **Wallet Tables**: Transactions, WalletTransactions (ledger-only)
- **Logging**: EventLogs, Notifications

#### 設計原則
- **Migrations**: `packages/backend/migrations/`
- **Indexes**: Optimized for common queries
- **Constraints**: Foreign keys, unique constraints, check constraints
- **Performance**: Batch operations, prepared statements

**查詢範例**: 參見 [packages/backend/src/db/](scoringSystem-cf/packages/backend/src/db/)

### Ledger Wallet 系統

- **No Balance Storage**: Balances calculated via SQL aggregation
- **Transaction Ledger**: Immutable transaction records
- **Reversals**: Negative transactions instead of modifications

---

## 4. 樣式 Styling

### Color Design System - 熱帶島嶼風格 (Tropical Island)

**設計原則**：所有配色符合 WCAG 2.0 AA 標準（對比度 ≥ 4.5:1）

**來源文件**：[packages/shared/src/theme/colors.config.ts](scoringSystem-cf/packages/shared/src/theme/colors.config.ts)

### 階段狀態色 (Stage Status Colors)

| 狀態 | 背景色 | 用途 |
|------|--------|------|
| pending | `#f39c12` 橙 | 尚未開始 |
| active | `#198754` 綠 | 進行中 |
| voting | `#c82333` 紅 | 投票中 |
| completed | `#5a6268` 灰 | 已完成 |

### Drawer 按鈕配色

**語意化按鈕選擇** (在 `.drawer-actions` 內)：
- `type="primary"` - 主要操作（送出、確認、儲存）
- `type="danger"` - 危險/破壞性操作（刪除、撤銷）
- `type="warning"` - 清除/重置操作
- `type="success"` - 獎勵/正向操作
- `type="info"` - 資訊/導航操作
- 無 type (default) - 中性操作（取消、關閉）

**來源文件**：[packages/frontend/src/styles/drawer-unified.scss](scoringSystem-cf/packages/frontend/src/styles/drawer-unified.scss)

---

## 5. 前端 Frontend

### Vue 3 + TypeScript 開發指南

#### 開發規範
- **Components**: Use `<script setup lang="ts">`
- **API Calls**: Use TanStack Query hooks
- **UI Components**: Element Plus
- **State**: TanStack Query for server state, ref/reactive for local state
- **Type Safety**: Import types from `@repo/shared`

### El-Drawer Design Standards (CRITICAL)

**完整文檔**: [plan/cloudflare/Cloudflare迁移指南.md - Phase 4.9](plan/cloudflare/Cloudflare迁移指南.md)

#### Quick Reference

| 顏色 | 用途 |
|------|------|
| `drawer-navy` | Normal operations (edit, view, create) |
| `drawer-maroon` | Destructive operations (delete, reverse) |
| `drawer-green` | System information (logs, audits) |
| `drawer-tutorial` | 首次使用教學 |

**方向選擇**:
- `direction="btt"` - Standard operations
- `direction="ttb"` - Dangerous operations (pairs with maroon)

**Size**: Always `size="100%"` (full-screen)

**範例檔案**:
- Normal: [UserEditorDrawer.vue](scoringSystem-cf/packages/frontend/src/components/admin/user/UserEditorDrawer.vue)
- Dangerous: [TransactionReversalDrawer.vue](scoringSystem-cf/packages/frontend/src/components/admin/wallet/TransactionReversalDrawer.vue)

### DrawerAlertZone (CRITICAL)

All drawer components MUST use `<DrawerAlertZone />` instead of individual `<el-alert>`.

**實現檔案**: [DrawerAlertZone.vue](scoringSystem-cf/packages/frontend/src/components/common/DrawerAlertZone.vue)
**Composable**: [useDrawerAlerts.ts](scoringSystem-cf/packages/frontend/src/composables/useDrawerAlerts.ts)

### Vue Router 與 Deep Linking

**路由檔案**: [packages/frontend/src/router/index.ts](scoringSystem-cf/packages/frontend/src/router/index.ts)
**Composable**: [useRouteDrawer.ts](scoringSystem-cf/packages/frontend/src/composables/useRouteDrawer.ts)

### Vue 3 Best Practices (CRITICAL)

#### ❌ DO NOT USE
- `getCurrentInstance()` - Type unsafe, difficult to test

#### ✅ Correct Patterns

| 用途 | 正確做法 | 參考檔案 |
|------|----------|----------|
| Authentication | `useAuth()` composable | [useAuth.ts](scoringSystem-cf/packages/frontend/src/composables/useAuth.ts) |
| Element Plus | Direct import: `import { ElMessage } from 'element-plus'` | - |
| API Calls | `rpcClient` | [rpc-client.ts](scoringSystem-cf/packages/frontend/src/utils/rpc-client.ts) |
| Error Handling | `handleError`, `showSuccess` | [errorHandler.ts](scoringSystem-cf/packages/frontend/src/utils/errorHandler.ts) |

---

## 6. 後端 Backend

### Hono 路由結構

| 目錄 | 說明 |
|------|------|
| `src/index.ts` | Main entry point |
| `src/router/` | API route definitions |
| `src/handlers/` | Business logic handlers |
| `src/db/` | Database operations |
| `src/durable-objects/` | WebSocket & real-time features |

**Handler 範例**: 參見 [packages/backend/src/handlers/](scoringSystem-cf/packages/backend/src/handlers/)

### 錯誤處理

使用 `HTTPException` from `hono/http-exception`，參見現有 handlers 實現。

### 文檔標準 (JSDoc)

所有 public functions 需包含 JSDoc：`@param`, `@returns`, `@example`

### Logging 系統

#### 雙層日誌架構

| Table | 用途 | 權限 | 寫入方式 |
|-------|------|------|----------|
| `sys_logs` | 系統審計追蹤 | 僅管理員可見 | 所有 log functions |
| `eventlogs` | 專案活動日誌 | 多層權限控制 | 自動由 logProjectOperation 同步 |

#### 核心 Logging Functions

| Function | 用途 | 寫入目標 |
|----------|------|----------|
| `logProjectOperation` | 專案範圍操作 | sys_logs + eventlogs |
| `logGlobalOperation` | 全域操作（無專案） | sys_logs only |
| `logApiAction` | API 去重操作 | sys_logs (使用 dedupKey) |

**實現檔案**: [logging.ts](scoringSystem-cf/packages/backend/src/utils/logging.ts)

---

## 7. 開發規範 Code Standards

### 命名規範

| 類型 | 規範 | 範例 |
|------|------|------|
| Functions | camelCase | `getUserGroups`, `calculateScore` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_STAGE_DURATION` |
| Types/Interfaces | PascalCase | `UserData`, `ProjectConfig` |
| Files | kebab-case | `user-groups.ts`, `score-calculator.ts` |
| UUID Prefixes | Maintained | `proj_`, `usr_`, `grp_`, `stg_` |

### 開發守則 Summary

#### Backend (Cloudflare Workers)
1. All code in `scoringSystem-cf/packages/backend/src/`
2. TypeScript strict mode
3. Hono for routing, Zod for validation
4. D1 prepared statements

#### Frontend (Vue 3)
1. All code in `scoringSystem-cf/packages/frontend/src/`
2. `<script setup lang="ts">` syntax
3. TanStack Query for server state
4. Element Plus components

---

## 8. 開發命令 Commands

```bash
cd scoringSystem-cf/

# Development
pnpm dev              # Start both frontend & backend
pnpm dev:backend      # Backend only
pnpm dev:frontend     # Frontend only

# Testing
pnpm test:backend     # Backend tests
pnpm test:e2e         # E2E tests (Playwright)
pnpm type-check       # TypeScript checking
pnpm lint             # ESLint

# Database
pnpm migrate:local    # Apply migrations to local D1
pnpm migrate:remote   # Apply migrations to production D1
```

### 遠端部署 Remote Deployment

#### 完整部署流程（前後端都要部署）

```bash
cd scoringSystem-cf/

# 1. Backend 部署 (Cloudflare Workers)
cd packages/backend && wrangler deploy

# 2. Frontend 部署 (Cloudflare Pages)
cd packages/frontend && pnpm build && wrangler pages deploy dist --project-name=scoring-system-frontend

# 3. Database Migration (如有 schema 變更)
pnpm migrate:remote
```

#### 單獨部署

```bash
# 只部署 Backend
cd scoringSystem-cf/packages/backend && wrangler deploy

# 只部署 Frontend 到 Production
cd scoringSystem-cf/packages/frontend && pnpm build && wrangler pages deploy dist --project-name=scoring-system-frontend --branch=production
```

#### Cloudflare Pages Production 分支設定

> **重要**: Cloudflare Pages 的 Production 分支設定為 `production`（不是 `main`）

| 分支 | 環境 | 說明 |
|------|------|------|
| `production` | Production | 部署到 scoring.kelunyang.online |
| `main` | Preview | 部署到 preview URL (如 xxx.scoring-system-frontend.pages.dev) |

```bash
# 部署到 Production（使用 --branch=production）
wrangler pages deploy dist --project-name=scoring-system-frontend --branch=production

# 部署到 Preview（測試用，不指定 branch）
wrangler pages deploy dist --project-name=scoring-system-frontend
```

### 部署結果 URLs

| 項目 | URL |
|------|-----|
| Backend API | `https://scoring-system.kelunyang.workers.dev` |
| Frontend | `https://scoring.kelunyang.online` |

---

## 9. Session 管理

### /compact 指令使用

When using `/compact`, summarize and update `log.md` with:
1. Tasks completed
2. Key decisions
3. Files modified
4. Next steps

---

## 10. 權限模型 Permissions

系統採用多層權限架構，完整文檔請參見：

**[plan/cloudflare/Cloudflare迁移指南.md](plan/cloudflare/Cloudflare迁移指南.md)**

包含：
- 全域權限 (system_admin, create_project)
- 專案角色 (teacher, observer, member)
- 群組角色 (leader, member)
- EventLogs 5 層權限模型
