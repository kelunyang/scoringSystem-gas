# AGENTS.md - Development Guidelines for Scoring System

> **IMPORTANT**: This project uses Cloudflare Worker version. All code changes must be in `scoringSystem-cf/` directory.

## 1. Development Environment Commands

### Package Management
```bash
cd scoringSystem-cf/

# Install dependencies
pnpm install

# Development
pnpm dev              # Both frontend & backend
pnpm dev:backend      # Backend only
pnpm dev:frontend     # Frontend only
```

### Testing
```bash
# Unit Testing (Vitest)
pnpm test             # All tests (shared + frontend + backend)
pnpm test:ui          # Vitest UI
pnpm test:coverage    # Coverage report

# E2E Testing (Playwright)
pnpm test:e2e

# Security Testing (OWASP)
pnpm test:security    # Requires backend running
```

### Quality Assurance
```bash
pnpm type-check       # TypeScript strict check
pnpm lint             # ESLint
```

### Database Migrations
```bash
pnpm migrate:local    # Apply to local D1
pnpm migrate:remote   # Apply to production D1
```

### Deployment
```bash
cd scoringSystem-cf/

# Full deployment (backend + frontend)
cd packages/backend && pnpm run deploy
cd packages/frontend && pnpm run deploy

# Backend only
cd packages/backend && pnpm run deploy

# Frontend only
cd packages/frontend && pnpm run deploy
```

---

## 2. Monorepo Structure

| Directory | Package | Purpose |
|-----------|---------|---------|
| `packages/backend/` | @repo/backend | Cloudflare Workers (TypeScript) |
| `packages/frontend/` | @repo/frontend | Vue 3 SPA (TypeScript) |
| `packages/shared/` | @repo/shared | Shared types & Zod schemas |

---

## 3. Frontend Development Rules

### Component Syntax
- **MUST** use `<script setup lang="ts">` for all Vue components
- **MUST** import types from `@repo/shared`

### State Management
- **MUST** use TanStack Query for server state
- **MUST** use ref/reactive for local state only
- **MUST NOT** use `getCurrentInstance()`

### API Calls
- **MUST** use `rpcClient` from `@/utils/rpc-client.ts`
- **MUST** use TanStack Query hooks for data fetching

### Element Plus Usage
- **MUST** directly import: `import { ElMessage } from 'element-plus'`
- **MUST NOT** use `getCurrentInstance()` to access Element Plus

### Error Handling
- **MUST** use `handleError` and `showSuccess` from `@/utils/errorHandler.ts`
- **MUST NOT** implement custom error handling patterns

### Drawer Components
- **MUST** use `DrawerAlertZone.vue` instead of individual `<el-alert>`
- **MUST** use `useDrawerAlerts.ts` composable for alert management
- **MUST** use `size="100%"` for drawer size
- **MUST** follow color conventions:
  - `drawer-navy` - Normal operations (edit, view, create)
  - `drawer-maroon` - Destructive operations (delete, reverse)
  - `drawer-green` - System information (logs, audits)
  - `drawer-tutorial` - First-time tutorial
- **MUST** use `direction="btt"` for standard operations
- **MUST** use `direction="ttb"` for dangerous operations (paired with maroon)

### Routing
- **MUST** use `useRouteDrawer.ts` composable for deep linking with drawers

### Auth
- **MUST** use `useAuth()` composable for authentication state

---

## 4. Backend Development Rules

### Code Location
- **MUST** write all backend code in `packages/backend/src/`

### TypeScript
- **MUST** enable strict mode
- **MUST** import types from `@repo/shared`

### Routing (Hono)
- **MUST** place route definitions in `src/router/`
- **MUST** place business logic handlers in `src/handlers/`
- **MUST** place database operations in `src/db/`

### Validation
- **MUST** use Zod for input validation
- **MUST** validate all API inputs with Zod schemas

### Database (D1)
- **MUST** use prepared statements for all queries
- **MUST** use batch operations for multiple queries
- **MUST** place migrations in `packages/backend/migrations/`
- **MUST** use Cloudflare D1 (SQLite), NOT Google Sheets

### Error Handling
- **MUST** use `HTTPException` from `hono/http-exception`

### Documentation
- **MUST** include JSDoc (`@param`, `@returns`, `@example`) for all public functions

### JWT Authentication
- **MUST** implement sliding expiration for tokens
- **MUST** extend token expiration on each API call
- **MUST** implement malicious login detection
- **MUST** implement rate limiting

### Password Hashing
- **MUST** use PBKDF2-SHA256 with 600,000 iterations
- **MUST** use utility from `@repo/shared/src/utils/password.ts`

---

## 5. Logging Rules

### Dual-Logging Architecture
| Table | Purpose | Permission | Write Method |
|-------|---------|------------|--------------|
| `sys_logs` | System audit trail | Admin only | All log functions |
| `eventlogs` | Project activity | Multi-level | `logProjectOperation` only |

### Logging Functions
- `logProjectOperation` - Project-scoped operations (writes to both tables)
- `logGlobalOperation` - Global operations (writes to sys_logs only)
- `logApiAction` - API deduplication (writes to sys_logs with dedupKey)

**MUST** use logging functions from `packages/backend/src/utils/logging.ts`

---

## 6. Database Design Rules

### Wallet System (Ledger-Only)
- **MUST NOT** store balance directly
- **MUST** calculate balances via SQL aggregation
- **MUST** use immutable transaction records
- **MUST** create reversal records as negative transactions (never modify records)

### Constraints
- **MUST** define foreign keys
- **MUST** define unique constraints
- **MUST** define check constraints
- **MUST** create indexes for common queries

---

## 7. Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Functions | camelCase | `getUserGroups`, `calculateScore` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_STAGE_DURATION` |
| Types/Interfaces | PascalCase | `UserData`, `ProjectConfig` |
| Files | kebab-case | `user-groups.ts`, `score-calculator.ts` |
| UUID Prefixes | Maintain consistency | `proj_`, `usr_`, `grp_`, `stg_` |

---

## 8. Styling Rules

### Color System
- **MUST** follow Tropical Island theme from `@repo/shared/src/theme/colors.config.ts`
- **MUST** ensure WCAG 2.0 AA compliance (contrast ratio ≥ 4.5:1)

### Stage Status Colors
| Status | Color | Purpose |
|--------|-------|---------|
| pending | `#f39c12` | Not started |
| active | `#198754` | In progress |
| voting | `#c82333` | Voting |
| completed | `#5a6268` | Completed |

### Button Semantics
- `type="primary"` - Primary actions (submit, confirm, save)
- `type="danger"` - Destructive actions (delete, reverse)
- `type="warning"` - Clear/reset actions
- `type="success"` - Reward/positive actions
- `type="info"` - Information/navigation actions
- No type (default) - Neutral actions (cancel, close)

---

## 9. References

### Core Documentation
- System Design: [plan/GAS/updated_project_spec.md](plan/GAS/updated_project_spec.md)
- Implementation Details: [scoringSystem-cf/README.md](scoringSystem-cf/README.md)

### Architecture
- Backend Bindings: [scoringSystem-cf/packages/backend/src/types.ts](scoringSystem-cf/packages/backend/src/types.ts)
- API Routing: [scoringSystem-cf/packages/backend/src/index.ts](scoringSystem-cf/packages/backend/src/index.ts)
- JWT Implementation: [scoringSystem-cf/packages/backend/src/handlers/auth/jwt.ts](scoringSystem-cf/packages/backend/src/handlers/auth/jwt.ts)
- Password Utility: [scoringSystem-cf/packages/shared/src/utils/password.ts](scoringSystem-cf/packages/shared/src/utils/password.ts)

### Database
- Query Examples: [scoringSystem-cf/packages/backend/src/db/](scoringSystem-cf/packages/backend/src/db/)
- Migrations: [scoringSystem-cf/packages/backend/migrations/](scoringSystem-cf/packages/backend/migrations/)

### Frontend
- Drawer Standards: [plan/cloudflare/Cloudflare迁移指南.md - Phase 4.9](plan/cloudflare/Cloudflare迁移指南.md)
- AlertZone Component: [scoringSystem-cf/packages/frontend/src/components/common/DrawerAlertZone.vue](scoringSystem-cf/packages/frontend/src/components/common/DrawerAlertZone.vue)
- AlertZone Composable: [scoringSystem-cf/packages/frontend/src/composables/useDrawerAlerts.ts](scoringSystem-cf/packages/frontend/src/composables/useDrawerAlerts.ts)
- Auth Composable: [scoringSystem-cf/packages/frontend/src/composables/useAuth.ts](scoringSystem-cf/packages/frontend/src/composables/useAuth.ts)
- Router: [scoringSystem-cf/packages/frontend/src/router/index.ts](scoringSystem-cf/packages/frontend/src/router/index.ts)
- RPC Client: [scoringSystem-cf/packages/frontend/src/utils/rpc-client.ts](scoringSystem-cf/packages/frontend/src/utils/rpc-client.ts)
- Error Handler: [scoringSystem-cf/packages/frontend/src/utils/errorHandler.ts](scoringSystem-cf/packages/frontend/src/utils/errorHandler.ts)
- Theme Colors: [scoringSystem-cf/packages/shared/src/theme/colors.config.ts](scoringSystem-cf/packages/shared/src/theme/colors.config.ts)
- Drawer Styles: [scoringSystem-cf/packages/frontend/src/styles/drawer-unified.scss](scoringSystem-cf/packages/frontend/src/styles/drawer-unified.scss)

### Backend
- Handlers: [scoringSystem-cf/packages/backend/src/handlers/](scoringSystem-cf/packages/backend/src/handlers/)
- Logging: [scoringSystem-cf/packages/backend/src/utils/logging.ts](scoringSystem-cf/packages/backend/src/utils/logging.ts)

### Permissions
- Multi-level permissions: [plan/cloudflare/Cloudflare迁移指南.md](plan/cloudflare/Cloudflare迁移指南.md)

---

## 10. Session Management

When using `/compact`:
1. Summarize tasks completed
2. Document key decisions
3. List files modified
4. Outline next steps
5. Update `log.md` with above information
