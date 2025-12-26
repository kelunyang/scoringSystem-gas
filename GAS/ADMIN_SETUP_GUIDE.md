# 管理員設置指南

## 概述

`npm run generate:admin` 腳本已更新，現在會同時生成：
1. **管理員用戶資料** - 存儲在 `Users` 工作表
2. **總PM群組資料** - 存儲在 `GlobalGroups` 工作表  
3. **群組成員關係** - 存儲在 `GlobalUserGroups` 工作表

## 新的權限系統架構

### 資料庫表結構

1. **GlobalGroups 表**（全域工作簿）
   - 存儲全域權限群組
   - 包含 `globalPermissions` JSON 欄位

2. **GlobalUserGroups 表**（全域工作簿）
   - 連接用戶與全域權限群組
   - 管理群組成員關係

### 總PM權限

總PM群組包含以下權限：
- `create_project` - 建立專案
- `system_admin` - 系統管理
- `manage_users` - 用戶管理
- `manage_groups` - 群組管理  
- `generate_invites` - 生成邀請碼

## 使用步驟

### 1. 生成管理員資料

```bash
npm run generate:admin
```

腳本會提示輸入：
- 帳號 (用戶名)
- 密碼 (8個字符以上，需包含大小寫字母和數字)
- Email
- 顯示名稱 (可選)

### 2. 設置資料庫工作表

確保你的全域工作簿包含以下工作表：

#### GlobalGroups 工作表欄位：
```
groupId | groupName | groupDescription | isActive | allowJoin | createdBy | createdTime | globalPermissions
```

#### GlobalUserGroups 工作表欄位：
```
membershipId | groupId | userEmail | role | isActive | joinTime | addedBy | removedBy | removedTime
```

### 3. 複製資料到工作表

腳本會輸出三行製表符分隔的資料：

1. **Users 工作表** - 管理員用戶資料
2. **GlobalGroups 工作表** - 總PM群組資料
3. **GlobalUserGroups 工作表** - 成員關係資料

### 4. 驗證設置

登入後該用戶將具備：
- ✅ 建立專案權限
- ✅ 系統管理權限  
- ✅ 用戶管理權限
- ✅ 系統設置存取權限

## 自動化遷移

系統包含自動遷移功能：
- 當用戶首次登入時會自動檢查並建立必要的資料庫表
- 無需手動執行遷移腳本
- 向後相容既有的資料庫

## 範例輸出

```
1️⃣  Users 工作表 - 用戶資料：
usr_12345678	admin	$salt$hashedpassword	admin@company.com	系統管理員	1234567890	active	{"theme":"light"}

2️⃣  GlobalGroups 工作表 - 總PM群組：
grp_87654321	總PM群組	系統總PM群組，擁有建立專案和系統管理權限	true	false	system	1234567890	["create_project","system_admin"]

3️⃣  GlobalUserGroups 工作表 - 群組成員關係：
mem_11223344	grp_87654321	admin@company.com	admin	true	1234567890	system		
```

## 故障排除

### 問題：用戶無法建立專案
**解決方案**：檢查用戶是否在總PM群組中，確認 GlobalUserGroups 表中有對應記錄

### 問題：系統設置頁面無法訪問  
**解決方案**：檢查用戶是否有 `system_admin` 權限

### 問題：權限檢查失敗
**解決方案**：確認 GlobalGroups 表中的 `globalPermissions` 欄位格式正確（JSON數組）