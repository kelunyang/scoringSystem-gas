# 開發與部署指南

## 環境需求

- Node.js >= 20
- pnpm >= 9
- Cloudflare 帳號

## 本地開發

```bash
# 安裝依賴
pnpm install

# 啟動開發伺服器 (前後端同時)
pnpm dev

# 分別啟動
pnpm dev:frontend    # http://localhost:5173
pnpm dev:backend     # http://localhost:8787
```

### 跳過 2FA 驗證（本地開發）

本地開發時，如果不想設定 SMTP 發送驗證碼，可以在 `packages/backend/.dev.vars` 中**註解掉 SMTP 相關設定**：

```bash
# packages/backend/.dev.vars
JWT_SECRET=your-secret...

# 註解掉以下 SMTP 設定，系統會在 console 顯示驗證碼
#SMTP_HOST=smtp.gmail.com
#SMTP_PORT=587
#SMTP_USERNAME=your-email@gmail.com
#SMTP_PASSWORD=your-app-password
#SMTP_FROM_NAME=Your Name
#SMTP_FROM_EMAIL=your-email@gmail.com
```

當 SMTP 未設定時，2FA 驗證碼會直接輸出到 backend 的 console log，你可以從那裡複製驗證碼登入。

## 測試

```bash
# 後端測試
pnpm test:backend

# E2E 測試 (Playwright)
pnpm test:e2e

# 類型檢查
pnpm type-check

# Lint
pnpm lint
```

## 部署到遠端

### Backend (Cloudflare Workers)

```bash
cd packages/backend
wrangler deploy
```

### Frontend (Cloudflare Pages)

```bash
cd packages/frontend
npx vite build
wrangler pages deploy dist --project-name=scoring-system-frontend
```

### Database Migration

```bash
# 本地 D1
pnpm migrate:local

# 遠端 D1
pnpm migrate:remote
```

## 環境變數

### 本地開發

複製 `.dev.vars.example` 為 `.dev.vars`：

```bash
cp .dev.vars.example .dev.vars
cp packages/backend/.dev.vars.example packages/backend/.dev.vars
```

### 遠端部署

使用 Wrangler secrets：

```bash
cd packages/backend
wrangler secret put JWT_SECRET
wrangler secret put SMTP_PASS
```

## 部署 URLs

| 項目 | URL |
|------|-----|
| Backend API | https://scoring-system.kelunyang.workers.dev |
| Frontend | https://scoring.kelunyang.online |
