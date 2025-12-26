# Google Apps Script PropertiesService 配置清單

## 概述

本文件列出專案評分系統需要在 Google Apps Script PropertiesService 中設定的所有配置項目。PropertiesService 用於存儲系統核心參數，提供毫秒級存取速度和高安全性。

## ✨ 2025年最新更新

系統已完成大規模清理和優化，配置管理更加簡潔高效：

- ✅ **移除冗餘配置**: 刪除未使用的功能開關和廢棄參數
- ✅ **移除冗餘資料表**: InvitationUsages 表已移除（改用 InvitationCodes.usedCount）
- ✅ **Session 管理優化**: Sessions 完全由 CacheService 管理（自動過期）
- ✅ **IP 位址記錄**: 整合 ipify.org API，所有登入嘗試記錄真實 IP
- ✅ **可疑登入偵測**: 自動分析暴力破解和分散式攻擊
- ✅ **日誌歸檔整合**: 日誌歸檔納入定期維護機制
- ✅ **狀態追蹤完善**: 所有機器人執行狀態均記錄時間戳

## 📋 配置項目總覽

### 1. 資料庫配置 (Database Configuration)

#### 1.1 核心資料庫設定
```javascript
// 🔑 必須手動設定（系統初始化前）
DATABASE_FOLDER = "your-google-drive-folder-id-here"

// 🤖 自動生成（由 initSystem() 創建）
GLOBAL_WORKBOOK_ID = "auto-generated-global-spreadsheet-id"
LOG_SPREADSHEET_ID = "auto-generated-log-spreadsheet-id"
NOTIFICATION_SPREADSHEET_ID = "auto-generated-notification-spreadsheet-id"
```

**說明**:
- `DATABASE_FOLDER`: 唯一需要手動設定的配置，所有資料庫檔案存放位置
- `GLOBAL_WORKBOOK_ID`: 全域資料庫（存放 Users, Projects, InvitationCodes 等）
- `LOG_SPREADSHEET_ID`: 系統日誌資料庫
- `NOTIFICATION_SPREADSHEET_ID`: 通知記錄資料庫

#### 1.2 資料庫架構變更記錄

**已移除的資料表**:
- `InvitationUsages`: 冗餘表格，改用 `InvitationCodes.usedCount` 欄位直接計數
- `EventLogs.userAgent`: 從未填充的欄位，已移除

**保留的資料表欄位**:
- `EventLogs.ipAddress`: 保留用於記錄真實使用者 IP（透過 ipify.org 取得）
- `InvitationCodes.usedCount`: 直接記錄使用次數，取代 InvitationUsages 表

### 2. 認證系統配置 (Authentication Configuration)

#### 2.1 Session 管理
```javascript
// Session 有效時間 (毫秒)
SESSION_TIMEOUT = "86400000"       // 24小時 (24*60*60*1000)
```

**重要變更**:
- ✅ Sessions 完全由 **CacheService** 管理，自動過期
- ✅ 無需手動清理 Session（CacheService 自動處理）
- ✅ 移除所有 PropertiesService 中的 `session_*` 動態 key
- ✅ 移除登入速率限制（GAS 每次請求都是新實例，Map 無法共享）

**已移除的配置**:
- `SESSION_CACHE_TIMEOUT`: CacheService 超時未單獨配置
- `SESSION_TIMEOUT_HOURS`: 重複配置，只使用 SESSION_TIMEOUT（毫秒）

#### 2.2 密碼安全
```javascript
// 密碼雜湊設定
PASSWORD_SALT_ROUNDS = "10"        // bcrypt equivalent rounds
```

#### 2.3 邀請碼系統
```javascript
// 邀請碼有效期限 (毫秒)
INVITE_CODE_TIMEOUT = "604800000"  // 7天 (7*24*60*60*1000)

// 每日最大邀請碼產生數量
MAX_INVITES_PER_DAY = "50"
```

### 3. 系統限制配置 (System Limits Configuration)

#### 3.1 內容限制
```javascript
// 專案名稱最大長度
MAX_PROJECT_NAME_LENGTH = "100"

// 群組名稱最大長度
MAX_GROUP_NAME_LENGTH = "50"
```

#### 3.2 業務邏輯限制
```javascript
// 每個專案最大群組數
MAX_GROUPS_PER_PROJECT = "20"

// 每個群組最大成員數
MAX_MEMBERS_PER_GROUP = "10"

// 每個階段最大天數
MAX_STAGE_DURATION_DAYS = "30"

// 同時進行的專案數量限制
MAX_CONCURRENT_PROJECTS = "5"
```

### 4. 日誌系統配置 (Logging Configuration)

#### 4.1 日誌輸出控制
```javascript
// 日誌 Console 輸出控制
LOG_CONSOLE = "true"               // 開發: 'true', 生產: 'false'
```

**說明**:
- `'true'`: 日誌同時輸出到 console 和 LOG_SPREADSHEET（開發友善）
- `'false'`: 僅記錄到 LOG_SPREADSHEET（生產環境，減少噪音）
- 可使用 `setConsoleLogging(false)` 函數即時切換

#### 4.2 IP 位址記錄

**整合說明**:
- 使用 **ipify.org** 免費 API 取得真實使用者 IP
- 所有登入嘗試自動記錄 IP 位址到 LOG_SPREADSHEET
- 前端 `api.js` 自動附加 `clientIP` 參數
- 後端 `auth.js` 所有認證函數接受 `clientIP` 參數

**相關檔案**:
- `frontend-vue/src/utils/ip.js`: IP 取得工具（含 5 分鐘快取）
- `scripts/auth.js`: 認證流程整合 IP 記錄
- `scripts/logging.js`: LOG_SPREADSHEET 記錄格式

### 5. 系統狀態監控 (System State Monitoring)

#### 5.1 初始化狀態
```javascript
// 系統初始化狀態標記
SYSTEM_INITIALIZED = "true"         // 系統是否已初始化

// 系統初始化時間戳
INITIALIZATION_TIME = "timestamp"   // 系統初始化的時間戳

// 超級管理員用戶 ID
SUPER_ADMIN_USER_ID = "usr_admin"   // 預設管理員用戶 ID

// 超級管理員用戶名
SUPER_ADMIN_USERNAME = "admin"      // 預設管理員用戶名
```

#### 5.2 機器人執行狀態（唯讀，由系統自動更新）

**每日清理機器人**:
```javascript
// 上次每日清理執行時間
LAST_CLEANUP = "2025-01-15T08:00:00.000Z"

// 上次每日清理錯誤記錄（若有）
LAST_CLEANUP_ERROR = "error_details"
```

**每週維護機器人**:
```javascript
// 上次週期性維護執行時間
LAST_WEEKLY_MAINTENANCE = "2025-01-14T03:00:00.000Z"

// 上次週期性維護錯誤記錄（若有）
LAST_WEEKLY_MAINTENANCE_ERROR = "error_details"
```

**通知巡檢機器人**:
```javascript
// 上次通知巡檢執行時間
LAST_NOTIFICATION_PATROL = "2025-01-15T09:00:00.000Z"

// 上次通知巡檢錯誤記錄（若有）
LAST_NOTIFICATION_PATROL_ERROR = "error_details"
```

**通知歸檔機器人**:
```javascript
// 上次通知歸檔執行時間
LAST_NOTIFICATION_ARCHIVE = "2025-01-10T02:00:00.000Z"

// 上次通知歸檔錯誤記錄（若有）
LAST_NOTIFICATION_ARCHIVE_ERROR = "error_details"
```

**日誌歸檔機器人（新增）**:
```javascript
// 上次日誌歸檔執行時間
LAST_LOG_ARCHIVE = "2025-01-12T01:00:00.000Z"

// 上次日誌歸檔錯誤記錄（若有）
LAST_LOG_ARCHIVE_ERROR = "error_details"
```

**說明**:
- 所有 `LAST_*` 狀態均為 **唯讀**，由系統自動記錄
- 時間戳格式: ISO 8601 (e.g., `2025-01-15T08:00:00.000Z`)
- 可透過 SystemSettings.vue 查看和觸發執行

### 6. 動態 Key 命名規則 (Dynamic Key Patterns)

#### 6.1 快取相關 Keys（臨時性）
```javascript
// 邀請碼快取 (動態產生)
inv_[inviteCode] = "cache_data"

// 一般快取資料
cache_[identifier] = "cached_data"

// 臨時資料
temp_[identifier] = "temporary_data"

// 鎖定機制
lock_[resource] = "lock_data"
```

**已移除的動態 Keys**:
- `session_*`: Sessions 已移至 CacheService，不存在於 PropertiesService
- `rst_*`: 密碼重設已改為直接重發密碼，不使用 token 機制

## 🚀 快速開始指南

### 步驟 1: 設定資料庫文件夾
```javascript
PropertiesService.getScriptProperties().setProperty('DATABASE_FOLDER', 'your_folder_id');
```

### 步驟 2: 執行系統初始化
```javascript
initSystem(); // 自動檢查配置、創建資料庫、設定預設值
```

### 步驟 3: 驗證系統狀態
```javascript
checkSystemStatus(); // 查看完整的系統配置狀態
```

## 🔐 安全與隱私

### 可疑登入偵測機制

系統已整合自動安全監控功能：

**偵測模式**:
1. **暴力破解偵測**: 24小時內 ≥5 次登入失敗
2. **分散式攻擊偵測**: 24小時內 ≥3 個不同 IP 各有 ≥3 次失敗

**自動回應**:
- 每日執行 `scheduledTask()` 時自動檢查
- 偵測到可疑活動時，自動寄送警告信給所有系統管理員
- 管理員 = `globalPermissions` 包含 `system_admin` 的使用者

**相關函數**:
- `analyzeSuspiciousLogins()`: 分析 LOG_SPREADSHEET 中的登入記錄
- `checkSuspiciousLogins()`: 執行檢查並發送通知
- `getSystemAdministrators()`: 取得系統管理員列表

**手動觸發**:
可在 SystemSettings.vue 的「機器人控制區」手動執行檢查。

## 📊 配置分類總覽

| 類型 | 數量 | 設定方式 | 範例 |
|-----|-----|---------|-----|
| **🔑 手動必設** | 1個 | 手動設定 | `DATABASE_FOLDER` |
| **🤖 自動生成** | 3個 | initSystem() 創建 | `GLOBAL_WORKBOOK_ID`, `LOG_SPREADSHEET_ID`, `NOTIFICATION_SPREADSHEET_ID` |
| **⚙️ 預設配置** | 15個 | properties_manager.js | `SESSION_TIMEOUT`, `MAX_INVITES_PER_DAY`, 等 |
| **📊 狀態監控** | 10個 | 機器人自動更新 | `LAST_CLEANUP`, `LAST_NOTIFICATION_PATROL`, 等 |
| **🔄 動態配置** | 無限 | 運行時生成 | `inv_*`, `cache_*`, `temp_*`, `lock_*` |

## 🗑️ 已移除的配置項目

### 移除原因: 從未實際使用

以下配置項目在程式碼中從未被引用，已完全移除：

**功能開關類**:
- `DEBUG_MODE`: 未在程式碼中使用
- `ENABLE_AUTO_BACKUP`: 未實現自動備份功能
- `ENABLE_SCORING_MODULE`: 評分功能始終啟用，無開關
- `ENABLE_WALLET_MODULE`: 錢包功能始終啟用，無開關

**外部服務類**:
- `DRIVE_API_DAILY_QUOTA`: 配額管理未實現
- `SHEETS_API_DAILY_QUOTA`: 配額管理未實現
- `WEBHOOK_URL`: 未實現 Webhook 功能
- `ADMIN_EMAIL`: 通知改用動態查詢系統管理員

**快取管理類**:
- `CACHE_DEFAULT_TIMEOUT`: 快取超時時間硬編碼在程式中
- `SESSION_CACHE_TIMEOUT`: CacheService 超時未單獨配置
- `SESSION_TIMEOUT_HOURS`: 重複配置，只保留 SESSION_TIMEOUT（毫秒）

**其他**:
- `SCRIPT_ID`: 未使用

### 移除原因: 架構變更

**Session 管理相關**:
- `session_*` 動態 keys: Sessions 改用 CacheService 管理，完全不存在於 PropertiesService
- 移除原因: CacheService 自動過期，無需手動清理

**密碼重設相關**:
- `rst_*` 動態 keys: 密碼重設改為直接重發密碼
- 移除原因: 不再使用 token 機制

**速率限制相關**:
- 所有登入速率限制相關程式碼
- 移除原因: GAS 每次請求都是新實例，記憶體 Map 無法跨請求共享

## 📖 實際使用的配置清單

### 資料庫相關 (4個)
| 配置名稱 | 使用位置 | 預設值 | 類型 |
|---------|---------|--------|------|
| `DATABASE_FOLDER` | database.js, init_system.js | 無（必須手動設定） | 🔑 手動 |
| `GLOBAL_WORKBOOK_ID` | database.js, properties_manager.js | 自動生成 | 🤖 自動 |
| `LOG_SPREADSHEET_ID` | logging.js, init_system.js | 自動生成 | 🤖 自動 |
| `NOTIFICATION_SPREADSHEET_ID` | notification_mailer.js | 自動生成 | 🤖 自動 |

### 認證系統相關 (2個)
| 配置名稱 | 使用位置 | 預設值 |
|---------|---------|--------|
| `SESSION_TIMEOUT` | auth.js:16 | 86400000ms (24小時) |
| `PASSWORD_SALT_ROUNDS` | auth_password.js:23,58 | 10 |

### 日誌系統相關 (1個)
| 配置名稱 | 使用位置 | 預設值 | 說明 |
|---------|---------|--------|------|
| `LOG_CONSOLE` | logging.js | 'true' | 控制日誌是否輸出到 console |

### 邀請系統相關 (2個)
| 配置名稱 | 使用位置 | 預設值 |
|---------|---------|--------|
| `MAX_INVITES_PER_DAY` | invitation.js:26 | 50 |
| `INVITE_CODE_TIMEOUT` | invitation.js:37 | 604800000ms (7天) |

### 業務邏輯限制 (6個)
| 配置名稱 | 使用位置 | 預設值 |
|---------|---------|--------|
| `MAX_PROJECT_NAME_LENGTH` | projects_api.js:29 | 100 |
| `MAX_CONCURRENT_PROJECTS` | projects_api.js:39 | 5 |
| `MAX_GROUP_NAME_LENGTH` | groups_api.js:52 | 50 |
| `MAX_GROUPS_PER_PROJECT` | groups_api.js:67 | 20 |
| `MAX_MEMBERS_PER_GROUP` | groups_api.js:420 | 10 |
| `MAX_STAGE_DURATION_DAYS` | stages_api.js:63 | 30 |

### 系統狀態管理 (4個 + 10個機器人狀態)
| 配置名稱 | 使用位置 | 類型 |
|---------|---------|------|
| `SYSTEM_INITIALIZED` | init_system.js | 布林值 |
| `SUPER_ADMIN_USER_ID` | init_system.js | 字串 |
| `SUPER_ADMIN_USERNAME` | init_system.js | 字串 |
| `INITIALIZATION_TIME` | init_system.js | ISO 8601 時間戳 |
| `LAST_CLEANUP` | scheduled_tasks.js | ISO 8601 時間戳（唯讀） |
| `LAST_CLEANUP_ERROR` | scheduled_tasks.js | 字串（唯讀） |
| `LAST_WEEKLY_MAINTENANCE` | scheduled_tasks.js | ISO 8601 時間戳（唯讀） |
| `LAST_WEEKLY_MAINTENANCE_ERROR` | scheduled_tasks.js | 字串（唯讀） |
| `LAST_NOTIFICATION_PATROL` | notification_mailer.js | ISO 8601 時間戳（唯讀） |
| `LAST_NOTIFICATION_PATROL_ERROR` | notification_mailer.js | 字串（唯讀） |
| `LAST_NOTIFICATION_ARCHIVE` | notification_mailer.js | ISO 8601 時間戳（唯讀） |
| `LAST_NOTIFICATION_ARCHIVE_ERROR` | notification_mailer.js | 字串（唯讀） |
| `LAST_LOG_ARCHIVE` | logging.js | ISO 8601 時間戳（唯讀） |
| `LAST_LOG_ARCHIVE_ERROR` | logging.js | 字串（唯讀） |

## 🔧 進階配置管理

### 使用 properties_manager.js

系統提供完整的配置管理 API：

```javascript
// 取得配置（含預設值）
const config = getPropertyWithDefault('SESSION_TIMEOUT');

// 批次取得配置
const allConfigs = getAllRequiredProperties();

// 驗證配置
const validation = validateAllProperties();

// 重設為預設值（不影響資料庫 ID）
resetPropertiesToDefaults();
```

### SystemSettings.vue 管理介面

**功能**:
1. **配置檢視與編輯**: 所有可編輯參數的圖形化介面
2. **資料庫 ID 驗證**: 檢查 Spreadsheet ID 是否存在
3. **一鍵重設**: 重設所有可配置參數（不含資料庫 ID）
4. **機器人控制區**: 查看執行狀態，手動觸發維護任務
5. **可疑登入檢查**: 手動觸發安全分析，查看結果

**輸入控制元件**:
- **Spreadsheet ID**: 文字輸入 + 驗證按鈕
- **數字**: el-slider 拖動調整
- **布林值**: el-switch 開關
- **逾時時間**: el-slider（小時），後端自動轉換為毫秒

## ⚠️ 重要注意事項

### 安全性
1. **DATABASE_FOLDER** 是系統最核心的配置，請妥善保管
2. 不要將 PropertiesService 配置提交到版本控制系統
3. 定期檢查可疑登入記錄

### 效能
1. PropertiesService 讀取速度極快（毫秒級）
2. 配置變更後建議清除相關快取
3. 單個值不超過 9KB

### 維護
1. 部署新版本前請備份現有配置
2. 使用 `checkSystemStatus()` 定期驗證配置
3. 機器人執行狀態自動記錄，可透過 UI 查看

## 📚 相關文件

- [系統初始化指南](../SYSTEM_INIT_GUIDE.md)
- [資料庫架構說明](./database_schema.md)
- [安全性最佳實踐](./security_best_practices.md)

## 總結

**現代化的配置管理**: 1 個手動配置 + 1 個初始化函數 = 完整可用的系統

系統自動處理：
- ✅ Google Sheets 資料庫的創建和配置
- ✅ 使用者認證和 Session 管理（CacheService 自動過期）
- ✅ 所有業務邏輯限制和預設值
- ✅ 日誌和通知系統的初始化
- ✅ 完整的錯誤檢查和友善提示
- ✅ IP 位址記錄和可疑登入偵測
- ✅ 系統維護和狀態追蹤
- ✅ 日誌歸檔和通知歸檔

**開發者只需專注於業務邏輯，系統配置完全自動化！** 🎉
