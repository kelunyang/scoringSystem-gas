# Scoring System

教學評分系統，支援分組作業提交、同儕互評、教師評分與積分分配。

## 系統教學影片

[![系統教學](https://img.shields.io/badge/YouTube-教學播放清單-red?style=for-the-badge&logo=youtube)](https://www.youtube.com/playlist?list=PLOJZcQv1uXidHlqLmxhNxaKTih4OMttwM)

完整的系統使用教學請參考上方連結。

## 功能特色

- **分組管理** - 建立專案群組，支援組長/組員角色
- **作業繳交** - 群組作業提交與版本控制
- **同儕互評** - 學生互相評分與留言討論
- **教師評分** - 教師綜合評分與 AI 輔助建議
- **積分系統** - Ledger 架構的積分錢包，支援交易撤銷
- **階段管理** - 多階段作業流程 (進行中/投票中/已結算)
- **通知系統** - 即時通知與郵件提醒
- **權限控制** - 多層級權限 (管理員/教師/觀察者/組長/成員)

## 技術架構

| 版本 | 技術棧 | 資料庫 | 狀態 |
|------|--------|--------|------|
| **Cloudflare Workers** | Hono + Vue 3 + TypeScript | Cloudflare D1 (SQLite) | 主要開發 |
| **Google Apps Script** | GAS + Vue 3 | Google Sheets | 可獨立運作 |

## 專案結構

```
├── scoringSystem-cf/    # Cloudflare Workers 版本 (TypeScript Monorepo)
│   ├── packages/
│   │   ├── backend/     # Hono API Server
│   │   ├── frontend/    # Vue 3 SPA
│   │   └── shared/      # 共享型別與 Schema
│   └── API_SPECIFICATION.md
├── GAS/                 # Google Apps Script 版本
├── database/            # 資料庫 Schema (schema.sql)
└── plan/                # 規劃與設計文檔
```

## 快速開始

### Cloudflare Workers 版本

```bash
# 安裝依賴
cd scoringSystem-cf
pnpm install

# 啟動開發伺服器 (前後端)
pnpm dev

# 同步遠端資料庫後啟動 (下載遠端 D1 + KV 到本地)
pnpm dev:sync-remote

# 前端: http://localhost:5173
# 後端: http://localhost:8787
```

詳細設定請參考 [scoringSystem-cf/SETUP.md](scoringSystem-cf/SETUP.md)

### GAS 版本

參考 `GAS/` 目錄下的指南文檔：
- [管理員設定指南](GAS/ADMIN_SETUP_GUIDE.md)
- [系統初始化指南](GAS/SYSTEM_INIT_GUIDE.md)

## 文檔

| 文檔 | 說明 |
|------|------|
| [SETUP.md](scoringSystem-cf/SETUP.md) | 開發環境設定與部署指南 |
| [API_SPECIFICATION.md](scoringSystem-cf/API_SPECIFICATION.md) | API 規格文件 (150+ 端點) |
| [database/README.md](database/README.md) | 資料庫結構說明 |
| [CLAUDE.md](CLAUDE.md) | AI 輔助開發規範 |

## 單元測試 (Unit Testing)

本專案使用 Vitest 進行單元測試，涵蓋三個套件：

| 套件 | 環境 | 測試範圍 |
|------|------|----------|
| `@repo/shared` | Node.js | 共用工具函數、Schema 驗證 |
| `@repo/frontend` | happy-dom | Vue Composables、工具函數 |
| `@repo/backend` | Cloudflare Workers | API Handlers（計畫中） |

### 運行測試

```bash
cd scoringSystem-cf

# 執行所有測試
pnpm test

# 開啟 Vitest UI（互動式介面）
pnpm test:ui

# 產生覆蓋率報告
pnpm test:coverage
```

### 測試狀態

- **測試數量**: 201+ 個測試案例
- **覆蓋範圍**: 工具函數、Composables、Schema 驗證
- **配置檔案**: `vitest.workspace.ts`（monorepo 配置）

## 安全測試 (OWASP API Security)

本專案包含基於 OWASP API Security Top 10 (2023) 的自動化安全測試。

### 首次設定

```bash
cd scoringSystem-cf/packages/security-tests

# 建立虛擬環境
python3 -m venv venv

# 啟動虛擬環境
source venv/bin/activate    # Linux/Mac
venv\Scripts\activate       # Windows

# 安裝依賴
pip install -r requirements.txt

# 複製環境設定
cp .env.example .env
```

### 運行測試

```bash
# 1. 先啟動後端 (另開終端)
cd scoringSystem-cf && pnpm dev:backend

# 2. 運行安全測試
cd scoringSystem-cf/packages/security-tests
source venv/bin/activate
pytest -v

# 或從專案根目錄
cd scoringSystem-cf
pnpm test:security
```

### 常用命令

| 命令 | 說明 |
|------|------|
| `pytest -v` | 運行所有測試 |
| `pytest -m critical` | 只運行關鍵測試 |
| `pytest -m bola` | BOLA 測試 (API1) |
| `pytest -m auth` | 認證測試 (API2) |
| `pnpm test:security:report` | 產生 HTML 報告 |

詳細說明請參考 [security-tests/README.md](scoringSystem-cf/packages/security-tests/README.md)

## 部署

### 線上環境

| 項目 | URL |
|------|-----|
| Frontend | https://scoring.kelunyang.online |
| Backend API | https://scoring-system.kelunyang.workers.dev |

### 自行部署

```bash
# Backend (Cloudflare Workers)
cd scoringSystem-cf/packages/backend
wrangler deploy

# Frontend (Cloudflare Pages)
cd scoringSystem-cf/packages/frontend
npx vite build
wrangler pages deploy dist --project-name=your-project-name
```

## License

MIT
