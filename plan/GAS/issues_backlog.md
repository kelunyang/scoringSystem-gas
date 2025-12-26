# Issues Backlog - Scoring System GAS

## 更新日期: 2025-08-28

## 核心問題解決方案

### 1. ✅ iframe URL 參數問題
**問題**: iframe 內無法讀取 URL 參數
**解決方案**: 
- 使用 localStorage 在同一 iframe 內保持狀態
- 邀請碼系統不依賴 URL 參數
- 頁面切換使用 `?page=xxx` 參數（在同一 iframe 內有效）

### 2. ✅ 新用戶註冊流程
**問題**: 無法透過 URL 帶入邀請資訊
**解決方案**:
- 實作邀請碼系統（`inv_xxxxxxxxxx`）
- 用戶手動輸入邀請碼
- 郵件只包含邀請碼文字，不含連結

### 3. 🔄 資料輸入方式
**更新**: 使用 Markdown 編輯器取代分屏設計
**實作方式**:
- 單一 Markdown 文字區域
- 即時預覽功能（可選）
- 支援 Markdown 語法高亮
- 自動儲存草稿

## 待實作功能

### Phase 1: 核心功能 (MVP)
- [x] 基礎認證系統
- [x] 邀請碼系統
- [x] Google Sheets 多分片架構
- [ ] 專案管理介面
- [ ].Stage 管理功能
- [ ] 用戶群組管理
- [ ] 基本評分功能

### Phase 2: 進階功能
- [ ] Markdown 編輯器整合
- [ ] 即時協作功能
- [ ] 評分統計與報表
- [ ] 權限管理系統
- [ ] 活動日誌

### Phase 3: 優化與擴展
- [ ] 效能優化
- [ ] 批次操作
- [ ] 資料匯出功能
- [ ] 進階搜尋
- [ ] 自訂評分標準

## 技術債務

### 1. 資料庫操作優化
**問題**: 目前每個操作都是單獨的 API 呼叫
**計畫**: 實作批次操作減少 API 請求

### 2. 錯誤處理
**問題**: 需要更完整的錯誤處理機制
**計畫**: 
- 統一錯誤格式
- 用戶友善的錯誤訊息
- 錯誤日誌記錄

### 3. 測試覆蓋率
**問題**: 目前測試覆蓋率不足
**計畫**:
- 增加單元測試
- 整合測試
- E2E 測試（使用 GAS 測試框架）

## 已移除功能

### ❌ 分屏編輯器
- 原因：簡化介面，使用 Markdown 取代
- 影響：無

### ❌ 多語言支援
- 原因：初期不需要
- 影響：簡化開發流程

### ❌ URL 參數導航
- 原因：iframe 限制
- 替代：localStorage 狀態管理

## 開發指南

### 本地開發
```bash
# 安裝依賴
npm install

# 開發模式
npm run dev

# 執行測試
npm test

# 構建部署
npm run deploy:gas
```

### GAS 部署
1. 確保已安裝 clasp：`npm install -g @google/clasp`
2. 登入 Google：`clasp login`
3. 部署：`npm run deploy:gas`

### 文件結構
```
scoringSystem-gas/
├── scripts/          # 源代碼（.js）
├── *.gs             # 構建產物（自動生成）
├── build/           # 構建腳本
├── tests/           # 測試文件
└── plan/            # 專案文檔
```

## 注意事項

1. **iframe 限制**：所有功能設計都需考慮 iframe 環境限制
2. **Google Sheets API**：注意配額限制，實作批次操作
3. **Cache 使用**：善用 GAS Cache Service 提升效能
4. **Session 管理**：使用 localStorage + Cache Service 雙重機制

## 下一步行動

1. 完成專案管理介面的基本 CRUD
2. 實作 Stage 流程管理
3. 整合 Markdown 編輯器
4. 建立完整的測試套件

---

更新者：Claude
最後更新：2025-08-28