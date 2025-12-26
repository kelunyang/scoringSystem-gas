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
