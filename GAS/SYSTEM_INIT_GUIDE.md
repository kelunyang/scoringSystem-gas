# 系統初始化指南

## 概述
本指南說明如何使用 `initSystem()` 函數來完整初始化整個評分系統。

⚠️ **重要警告**：`initSystem()` 函數會執行**完整系統重置**，刪除所有現有資料並從頭重建。請謹慎使用！

## 初始化步驟

### 1. 準備所有必要的 Google 文件

在初始化之前，你必須：

#### A. 創建資料庫文件夾
1. 在 Google Drive 中創建一個新文件夾（例如：「評分系統資料庫」）
2. 從 URL 中複製文件夾 ID（在 `/folders/` 後面的部分）

#### B. 創建必要的試算表
在上述文件夾中創建三個 Google Sheets：
1. **全域資料庫試算表** - 存放專案、用戶、群組等核心資料
2. **日誌系統試算表** - 存放系統日誌
3. **通知系統試算表** - 存放通知記錄

每個試算表創建後，記錄其 ID（從 URL 中的 `/spreadsheets/d/` 後面部分）

### 2. 設定 PropertiesService

在 Google Apps Script 編輯器中執行以下命令：

```javascript
// 設定資料庫文件夾 ID
PropertiesService.getScriptProperties().setProperty('DATABASE_FOLDER', 'your_folder_id_here');

// 設定全域資料庫試算表 ID
PropertiesService.getScriptProperties().setProperty('GLOBAL_WORKBOOK_ID', 'your_global_spreadsheet_id_here');

// 設定日誌系統試算表 ID
PropertiesService.getScriptProperties().setProperty('LOG_SPREADSHEET_ID', 'your_log_spreadsheet_id_here');

// 設定通知系統試算表 ID
PropertiesService.getScriptProperties().setProperty('NOTIFICATION_SPREADSHEET_ID', 'your_notification_spreadsheet_id_here');
```

### 3. 修改預設管理員帳號（可選）

編輯 `scripts/init_system.js` 文件，修改以下變數：

```javascript
const DEFAULT_ADMIN_USERNAME = 'admin';      // 預設管理員帳號
const DEFAULT_ADMIN_PASSWORD = 'admin123456'; // 預設管理員密碼
const DEFAULT_ADMIN_EMAIL = 'admin@example.com';
const DEFAULT_ADMIN_DISPLAY_NAME = '系統管理員';
```

### 4. 執行系統初始化

在 Google Apps Script 編輯器中執行：

```javascript
initSystem()
```

系統會自動執行以下操作：
1. **驗證所有必要的 PropertiesService 設定**
2. **創建/覆蓋全域資料庫（Google Sheets）**
3. **🚨 刪除所有現有資料表並重新創建**
4. **創建總PM群組並設定權限**
5. **創建預設管理員帳號**
6. **將管理員加入總PM群組**
7. **重新初始化日誌和通知系統**
8. **設定預設系統配置**

⚠️ **資料安全提醒**：所有現有的專案、用戶、群組等資料都會被永久刪除！

### 5. 檢查系統狀態

執行以下函數來確認系統初始化成功：

```javascript
checkSystemStatus()
```

這會顯示：
- 資料庫設定狀態
- 各資料表及其記錄數
- 管理員帳號狀態
- 總PM群組狀態

## 初始化後的操作

### 1. 部署 Web App

1. 在 GAS 編輯器中，選擇「部署」→「新增部署」
2. 選擇類型為「網頁應用程式」
3. 設定執行身分和存取權限
4. 點擊「部署」

### 2. 登入系統

使用預設管理員帳號登入：
- 帳號：`admin`（或您設定的值）
- 密碼：`admin123456`（或您設定的值）

**重要**：請登入後立即修改密碼！

### 3. 開始使用

登入後，您可以：
- 創建新專案
- 管理用戶
- 生成邀請碼
- 配置系統設定

## 輔助函數

### 重置系統（危險操作）

如需完全重置系統：

```javascript
resetSystem()
```

**警告**：這會刪除所有資料！僅在開發/測試環境使用。

### 查看系統日誌

在執行初始化時，所有步驟都會記錄在 GAS 的執行日誌中。您可以透過「執行」→「執行記錄」查看詳細資訊。

## 常見問題

### Q: 忘記管理員密碼怎麼辦？

A: 您可以直接在 Google Sheets 中的 Users 表重新設定密碼：
1. 開啟全域資料庫（Workbook ID 在系統屬性中）
2. 找到 Users 工作表
3. 使用以下程式碼生成新密碼的雜湊值：
   ```javascript
   hashPassword('your_new_password')
   ```
4. 將新的雜湊值更新到 password 欄位

### Q: 如何添加更多管理員？

A: 登入系統後，在「使用者管理」中：
1. 生成邀請碼
2. 讓新管理員註冊
3. 在「系統設定」→「權限管理」中將其加入總PM群組

### Q: 系統初始化失敗怎麼辦？

A: 檢查以下事項：
1. DATABASE_FOLDER 是否正確設定
2. 是否有 Google Drive 的存取權限
3. 查看執行日誌中的錯誤訊息
4. 必要時執行 `resetSystem()` 後重新初始化

## 安全建議

1. **立即修改預設密碼**：初始化後第一時間修改管理員密碼
2. **限制文件夾權限**：確保資料庫文件夾只有必要的人員可存取
3. **定期備份**：使用 Google Drive 的版本控制功能
4. **監控日誌**：定期檢查系統日誌中的異常活動

## 更新記錄

- 2024-01-10：初始版本，整合權限系統
- 移除舊的 npm run generate:admin 指令
- 改為 GAS 內建的 initSystem() 函數