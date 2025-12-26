# 評分系統 API 文檔

## 概述

本文檔描述了基於 Google Apps Script 的評分系統後端 API。系統使用 Google Sheets 作為資料庫，提供完整的專案管理、用戶認證、群組管理、階段管理、提交評分等功能。

## 基本資訊

- **基礎 URL**: `https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec`
- **Content-Type**: `application/json`
- **認證方式**: Session-based (sessionId 參數)

## 實際使用的 API 列表

本節列出前端實際使用的 API 端點。

### 核心功能 API
- ✅ `/auth/login` - 用戶登入
- ✅ `/auth/logout` - 用戶登出  
- ✅ `/auth/current-user` - 獲取當前用戶
- ✅ `/auth/register` - 用戶註冊
- ✅ `/auth/change-password` - 修改密碼
- ✅ `/projects/list` - 獲取專案列表
- ✅ `/projects/create` - 創建專案
- ✅ `/projects/get` - 獲取專案詳情
- ✅ `/projects/update` - 更新專案
- ✅ `/projects/complete-data` - 獲取完整專案數據
- ✅ `/wallets/transactions` - 獲取錢包交易記錄
- ✅ `/invitations/generate` - 生成邀請碼

### 管理員專用 API
- ✅ `/admin/users/list` - 獲取所有用戶 (含avatar和global groups)
- ✅ `/admin/user-profile` - 更新用戶設定檔 (修正端點名稱)
- ✅ `/admin/users/update-status` - 更新用戶狀態
- ✅ `/admin/users/reset-password` - 重設用戶密碼
- ✅ `/admin/system/stats` - 獲取系統統計
- ✅ `/admin/system/logs` - 獲取系統日誌 (舊版，建議使用 /system/logs)

### 系統日誌 API
- ✅ `/system/logs` - 獲取系統日誌
- ✅ `/system/logs/stats` - 獲取日誌統計
- ✅ `/system/logs/archive` - 手動歸檔日誌

### 系統配置 API
- ✅ `/system/console-logging/status` - 獲取Console日誌輸出狀態

### 專案內容 API
- ✅ `/projects/core` - 獲取專案核心數據 (階段結構)
- ✅ `/projects/content` - 獲取專案內容數據 (報告、評論)

### 群組管理 API
- ✅ `/groups/create` - 建立群組
- ✅ `/groups/list` - 獲取專案群組列表
- ✅ `/groups/get` - 獲取群組詳情
- ✅ `/groups/details` - 獲取群組詳情 (別名)
- ✅ `/groups/update` - 更新群組
- ✅ `/groups/delete` - 刪除群組
- ✅ `/groups/add-user` - 新增群組成員
- ✅ `/groups/add-member` - 新增群組成員 (別名)
- ✅ `/groups/remove-user` - 移除群組成員
- ✅ `/groups/remove-member` - 移除群組成員 (別名)

### 評論系統 API
- ✅ `/comments/create` - 建立評論
- ✅ `/comments/list` - 獲取階段評論
- ✅ `/comments/stage` - 獲取階段評論 (別名)
- ✅ `/comments/ranking` - 提交評論排名
- ✅ `/comments/voting-eligibility` - 檢查投票資格

### 提交與投票 API
- ✅ `/submissions/submit` - 提交報告
- ✅ `/submissions/list` - 獲取階段提交
- ✅ `/rankings/submit` - 提交群組排名提案 (包含版本控制和安全驗證)
- ✅ `/rankings/vote` - 對排名提案投票 (僅限同組成員，防自投票)
- ✅ `/rankings/proposals` - 獲取階段排名提案 (支援版本歷史和群組過濾)
- ✅ `/stages/patrol` - 巡邏階段狀態，自動轉換到voting狀態
- ✅ `/stages/update` - 更新階段 (支援active/voting/completed狀態)

### 標籤管理 API
- ✅ `/tags/create` - 建立標籤 (移除category屬性)
- ✅ `/tags/list` - 獲取標籤列表 (移除category屬性)
- ✅ `/tags/update` - 更新標籤 (移除category屬性)
- ✅ `/tags/delete` - 刪除標籤 (移除category屬性)
- ✅ `/tags/assign/project` - 為專案指派標籤
- ✅ `/tags/assign/user` - 為用戶指派標籤
- ✅ `/tags/remove/project` - 移除專案標籤
- ✅ `/tags/remove/user` - 移除用戶標籤
- ✅ `/tags/project` - 獲取專案標籤
- ✅ `/tags/user` - 獲取用戶標籤
- ✅ `/tags/batch/user` - 批次更新用戶標籤
- ✅ `/tags/batch/project` - 批次更新專案標籤

### 頭像管理 API
- ✅ `/users/avatar/update` - 更新用戶頭像設定
- ✅ `/users/avatar/regenerate` - 重新生成頭像種子

### 通知系統 API
- ✅ `/notifications/count` - 獲取未讀通知數量
- ✅ `/notifications/list` - 獲取用戶通知列表（支援分頁和過濾）
- ✅ `/notifications/mark-read` - 標記單個通知為已讀
- ✅ `/notifications/mark-all-read` - 標記所有通知為已讀
- ✅ `/notifications/delete` - 刪除通知（軟刪除）

## 通用回應格式

### 成功回應
```json
{
  "success": true,
  "data": { /* 回應資料 */ },
  "message": "操作成功訊息",
  "timestamp": 1640995200000
}
```

### 錯誤回應
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "錯誤描述",
    "context": "額外上下文資訊",
    "timestamp": 1640995200000
  }
}
```

## 認證 API

### 用戶登入
- **路徑**: `/auth/login`
- **方法**: POST
- **參數**:
  ```json
  {
    "username": "用戶帳號",
    "password": "用戶密碼"
  }
  ```
- **回應**:
  ```json
  {
    "success": true,
    "data": {
      "sessionId": "session_uuid",
      "user": {
        "userId": "usr_uuid",
        "username": "username",
        "userEmail": "user@email.com",
        "displayName": "顯示名稱",
        "status": "active"
      }
    }
  }
  ```

### 用戶註冊
- **路徑**: `/auth/register`
- **方法**: POST
- **參數**:
  ```json
  {
    "invitationCode": "ABCD-EFGH-IJKL",
    "userData": {
      "username": "用戶帳號",
      "password": "用戶密碼",
      "userEmail": "user@email.com",
      "displayName": "顯示名稱",
      "avatarSeed": "custom_seed_value",
      "avatarStyle": "avataaars",
      "avatarOptions": {
        "backgroundColor": "b6e3f4",
        "clothesColor": "3c4858",
        "skinColor": "ae5d29"
      }
    }
  }
  ```
- **說明**: 註冊時可選擇自訂頭像設定，若未提供將使用系統預設值

### 用戶登出
- **路徑**: `/auth/logout`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid"
  }
  ```

### 取得目前用戶
- **路徑**: `/auth/current-user`
- **方法**: GET
- **參數**: `sessionId=session_uuid`

### 修改密碼
- **路徑**: `/auth/change-password`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "oldPassword": "舊密碼",
    "newPassword": "新密碼"
  }
  ```

## 專案管理 API

### 建立專案
- **路徑**: `/projects/create`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectData": {
      "projectName": "專案名稱",
      "description": "專案描述"
    }
  }
  ```

### 取得專案列表
- **路徑**: `/projects/list`
- **方法**: GET
- **參數**: 
  - `sessionId=session_uuid`
  - `filters.status=active` (選填)
  - `filters.createdBy=me` (選填)

### 取得專案詳情
- **路徑**: `/projects/get`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `projectId=proj_uuid`

### 更新專案
- **路徑**: `/projects/update`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "updates": {
      "projectName": "新名稱",
      "description": "新描述",
      "status": "active|completed|archived"
    }
  }
  ```

### 刪除專案
- **路徑**: `/projects/delete`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid"
  }
  ```

### 複製專案
- **路徑**: `/projects/clone`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "newProjectName": "新專案名稱"
  }
  ```
- **說明**: 複製整個專案包括：
  - 專案基本設定（名稱、描述、分數範圍）
  - 專案標籤
  - 所有階段及其配置（獎金池、設定等）
  - 階段時間會自動調整為未來時間（每個階段相隔7天）
  - 不包含群組、成員、提交內容等使用者相關資料

### 取得完整專案資料
- **路徑**: `/projects/complete-data`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `projectId=proj_uuid`

### 匯出專案
- **路徑**: `/projects/export`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `projectId=proj_uuid`
  - `format=json` (預設)

## 群組管理 API

### 建立群組
- **路徑**: `/groups/create`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "groupData": {
      "groupName": "群組名稱",
      "description": "群組描述",
      "allowChange": true
    }
  }
  ```
- **說明**: 支援批量建立功能，前端可透過滑桿選擇1-20個群組數量，系統會自動建立相應數量的學生分組並賦予預設名稱（如：學生分組1、學生分組2等）

### 取得專案群組列表
- **路徑**: `/groups/list`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `projectId=proj_uuid`
  - `includeInactive=false` (選填)

### 取得群組詳情
- **路徑**: `/groups/get`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `projectId=proj_uuid`
  - `groupId=grp_uuid`

### 更新群組
- **路徑**: `/groups/update`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "groupId": "grp_uuid",
    "updates": {
      "groupName": "新名稱",
      "description": "新描述",
      "allowChange": false
    }
  }
  ```

### 刪除群組
- **路徑**: `/groups/delete`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "groupId": "grp_uuid"
  }
  ```

### 新增用戶到群組
- **路徑**: `/groups/add-user`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "groupId": "grp_uuid",
    "userEmail": "user@email.com",
    "role": "member|leader"
  }
  ```

### 移除用戶從群組
- **路徑**: `/groups/remove-user`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "groupId": "grp_uuid",
    "userEmail": "user@email.com"
  }
  ```

### 設定群組角色權限
- **路徑**: `/groups/set-role`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "groupId": "grp_uuid",
    "groupRole": "pm|deliverable_team|reviewer|observer",
    "permissions": ["submit", "vote", "rank", "comment", "manage", "view"]
  }
  ```

## 階段管理 API

### 建立階段
- **路徑**: `/stages/create`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "stageData": {
      "stageName": "階段名稱",
      "description": "階段描述",
      "startDate": 1640995200000,
      "endDate": 1641081600000,
      "consensusDeadline": 1641038400000
    }
  }
  ```

### 取得專案階段列表
- **路徑**: `/stages/list`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `projectId=proj_uuid`

### 取得階段詳情
- **路徑**: `/stages/get`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `projectId=proj_uuid`
  - `stageId=stg_uuid`

### 更新階段
- **路徑**: `/stages/update`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "stageId": "stg_uuid",
    "updates": {
      "stageName": "新名稱",
      "description": "新描述",
      "status": "pending|active|voting|completed"
    }
  }
  ```

### 複製階段
- **路徑**: `/stages/clone`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "stageId": "stg_uuid",
    "newStageName": "新階段名稱"
  }
  ```
- **說明**: 複製階段設定（包括獎金池和配置）但不包含提交內容，新階段將設定為一週後開始、兩週後結束，並加入複製標註

### 階段狀態巡邏 (自動化)
- **路徑**: `/stages/patrol`
- **方法**: POST
- **用途**: GAS定時觸發器調用，自動檢查並更新過期階段狀態
- **說明**: 將已到期的active階段自動轉換為voting狀態，並發送通知
- **參數**:
  ```json
  {
    "triggerType": "time_based" // 由GAS時間觸發器調用
  }
  ```

### 更新階段配置
- **路徑**: `/stages/config`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "stageId": "stg_uuid",
    "configUpdates": {
      "rank1Reward": 100,
      "rank2Reward": 60,
      "rank3Reward": 30,
      "comment1stReward": 20,
      "comment2ndReward": 15,
      "comment3rdReward": 10,
      "approvalThreshold": 0.67,
      "pmWeight": 0.3
    }
  }
  ```

## 用戶管理 API

### 取得用戶資料
- **路徑**: `/users/profile`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `userId=usr_uuid` (選填，預設為目前用戶)

### 更新用戶資料
- **路徑**: `/users/profile`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "updates": {
      "displayName": "新顯示名稱",
      "preferences": {
        "theme": "dark",
        "lang": "zh-TW"
      }
    }
  }
  ```

### 搜尋用戶
- **路徑**: `/users/search`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `query=搜尋關鍵字`
  - `limit=10` (選填)

### 取得用戶專案
- **路徑**: `/users/projects`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `userId=usr_uuid` (選填)

### 取得用戶統計
- **路徑**: `/users/stats`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `userId=usr_uuid` (選填)

### 更新用戶頭像設定
- **路徑**: `/users/avatar/update`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "avatarData": {
      "avatarSeed": "custom_seed_value",
      "avatarStyle": "avataaars",
      "avatarOptions": {
        "backgroundColor": "b6e3f4",
        "clothesColor": "3c4858",
        "skinColor": "ae5d29"
      }
    }
  }
  ```
- **說明**: 更新用戶的頭像設定，包含種子值、風格和顏色選項
- **頭像風格選項**: 
  - `avataaars`: 卡通人物風格
  - `bottts`: 機器人風格
  - `identicon`: 抽象圖案
  - `initials`: 文字縮寫
  - `personas`: 簡約人物風格

### 重新生成頭像種子
- **路徑**: `/users/avatar/regenerate`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid"
  }
  ```
- **回應**:
  ```json
  {
    "success": true,
    "data": {
      "avatarSeed": "new_generated_seed_value"
    },
    "message": "Avatar seed regenerated successfully"
  }
  ```
- **說明**: 為當前用戶生成新的頭像種子值，生成基於用戶 email 和當前時間戳

## 提交與排名 API

### 提交成果
- **路徑**: `/submissions/submit`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "stageId": "stg_uuid",
    "submissionData": {
      "content": "Markdown 內容",
      "authors": ["author1@email.com", "author2@email.com"],
      "participationProposal": {"author1": 0.6, "author2": 0.4}
    }
  }
  ```

### 提交群組排名
- **路徆**: `/rankings/submit`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "stageId": "stg_uuid",
    "rankingData": {
      "grp_uuid1": 1,
      "grp_uuid2": 2,
      "grp_uuid3": 3
    }
  }
  ```

### 投票排名提案
- **路徑**: `/rankings/vote`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "proposalId": "prop_uuid",
    "agree": true,
    "comment": "投票意見"
  }
  ```

### 取得階段提交
- **路徑**: `/submissions/list`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `projectId=proj_uuid`
  - `stageId=stg_uuid`

## 評論 API

### 建立評論
- **路徑**: `/comments/create`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "stageId": "stg_uuid",
    "commentData": {
      "content": "評論內容，支援 @群組 提及",
      "parentCommentId": "cmt_uuid" // 選填，回覆評論時使用
    }
  }
  ```

### 取得階段評論
- **路徑**: `/comments/list`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `projectId=proj_uuid`
  - `stageId=stg_uuid`

### 提交評論排名
- **路徑**: `/comments/ranking`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "stageId": "stg_uuid",
    "rankingData": {
      "cmt_uuid1": 1,
      "cmt_uuid2": 2,
      "cmt_uuid3": 3
    }
  }
  ```

## 錢包 API

### 取得用戶錢包
- **路徑**: `/wallets/get`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `projectId=proj_uuid`
  - `userEmail=user@email.com` (選填，預設為目前用戶)

### 取得交易記錄
- **路徑**: `/wallets/transactions`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `projectId=proj_uuid`
  - `userEmail=user@email.com` (選填)
  - `limit=50` (選填)

### 獲得積分排行榜
- **路徑**: `/wallets/leaderboard`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `projectId=proj_uuid`
  - `limit=10` (選填)

### 獎勵積分 (管理員)
- **路徑**: `/wallets/award`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "userEmail": "user@email.com",
    "amount": 50,
    "transactionType": "manual_adjustment",
    "source": "獎勵原因",
    "relatedId": "相關實體ID" // 選填
  }
  ```

## 邀請碼 API

### 生成邀請碼
- **路徑**: `/invitations/generate`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "maxUses": 1,
    "validDays": 7
  }
  ```

### 驗證邀請碼
- **路徑**: `/invitations/validate`
- **方法**: GET
- **參數**:
  - `invitationCode=ABCD-EFGH-IJKL`

### 取得用戶邀請碼列表
- **路徑**: `/invitations/list`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`

### 停用邀請碼
- **路徑**: `/invitations/deactivate`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "invitationId": "inv_uuid"
  }
  ```

## 系統 API

### 系統初始化
- **路徑**: `/system/initialize`
- **方法**: POST
- **說明**: 初始化資料庫系統，建立全域活頁簿

### 健康檢查
- **路徑**: `/system/health`
- **方法**: GET
- **回應**:
  ```json
  {
    "success": true,
    "data": {
      "status": "healthy",
      "timestamp": 1640995200000,
      "version": "1.0.0"
    }
  }
  ```

## 管理員 API

### 獲取所有用戶
- **路徑**: `/admin/users/list`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
- **權限**: 需要系統管理員權限
- **回應**:
  ```json
  {
    "success": true,
    "data": [
      {
        "userId": "usr_uuid",
        "username": "username",
        "userEmail": "user@email.com",
        "displayName": "顯示名稱",
        "status": "active",
        "registrationTime": 1640995200000,
        "lastLoginTime": 1640995200000
      }
    ]
  }
  ```

### 更新用戶狀態
- **路徑**: `/admin/users/update-status`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "userEmail": "user@email.com",
    "status": "active|inactive"
  }
  ```
- **權限**: 需要系統管理員權限

### 重設用戶密碼
- **路徑**: `/admin/users/reset-password`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "userEmail": "user@email.com",
    "newPassword": "new_password"
  }
  ```
- **權限**: 需要系統管理員權限

### 獲取系統統計
- **路徑**: `/admin/system/stats`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
- **權限**: 需要系統管理員權限
- **回應**:
  ```json
  {
    "success": true,
    "data": {
      "totalUsers": 150,
      "activeUsers": 120,
      "totalProjects": 20,
      "activeProjects": 10,
      "totalGroups": 80,
      "totalTransactions": 5000
    }
  }
  ```

### 獲取系統日誌
- **路徑**: `/admin/system/logs`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `limit=100` (選填)
- **權限**: 需要系統管理員權限

## 標籤管理 API

### 建立標籤
- **路徑**: `/tags/create`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "tagData": {
      "tagName": "標籤名稱",
      "tagColor": "#3498db",
      "description": "標籤描述"
    }
  }
  ```
- **權限**: 需要系統管理員權限
- **回應**:
  ```json
  {
    "success": true,
    "data": {
      "tagId": "tag_uuid",
      "tagName": "標籤名稱",
      "tagColor": "#3498db",
      "description": "標籤描述",
      "isActive": true,
      "createdBy": "admin@email.com",
      "createdTime": 1640995200000,
      "lastModified": 1640995200000
    }
  }
  ```

### 獲取標籤列表
- **路徑**: `/tags/list`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `filters.isActive=true` (選填)
  - `filters.search=搜尋關鍵字` (選填)
- **回應**:
  ```json
  {
    "success": true,
    "data": [
      {
        "tagId": "tag_uuid",
        "tagName": "標籤名稱",
        "tagColor": "#3498db",
        "description": "標籤描述",
        "category": "general",
        "isActive": true,
        "createdBy": "admin@email.com",
        "createdTime": 1640995200000,
        "lastModified": 1640995200000
      }
    ]
  }
  ```

### 更新標籤
- **路徑**: `/tags/update`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "tagId": "tag_uuid",
    "updates": {
      "tagName": "新標籤名稱",
      "tagColor": "#e74c3c",
      "description": "新描述",
      "category": "priority",
      "isActive": true
    }
  }
  ```
- **權限**: 需要系統管理員權限

### 刪除標籤 (軟刪除)
- **路徑**: `/tags/delete`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "tagId": "tag_uuid"
  }
  ```
- **權限**: 需要系統管理員權限
- **說明**: 執行軟刪除，將標籤設為非活躍狀態，同時停用所有相關的標籤指派

### 為專案指派標籤
- **路徑**: `/tags/assign/project`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "tagId": "tag_uuid"
  }
  ```
- **權限**: 需要專案管理權限或系統管理員權限
- **回應**:
  ```json
  {
    "success": true,
    "data": {
      "assignmentId": "assignment_uuid",
      "projectId": "proj_uuid",
      "tagId": "tag_uuid",
      "assignedBy": "user@email.com",
      "assignedTime": 1640995200000,
      "isActive": true
    }
  }
  ```

### 為用戶指派標籤
- **路徑**: `/tags/assign/user`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "userEmail": "user@email.com",
    "tagId": "tag_uuid"
  }
  ```
- **權限**: 需要系統管理員權限

### 移除專案標籤
- **路徑**: `/tags/remove/project`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "tagId": "tag_uuid"
  }
  ```
- **權限**: 需要專案管理權限或系統管理員權限

### 移除用戶標籤
- **路徑**: `/tags/remove/user`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "userEmail": "user@email.com",
    "tagId": "tag_uuid"
  }
  ```
- **權限**: 需要系統管理員權限

### 獲取專案標籤
- **路徑**: `/tags/project`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `projectId=proj_uuid`
- **回應**:
  ```json
  {
    "success": true,
    "data": [
      {
        "tagId": "tag_uuid",
        "tagName": "標籤名稱",
        "tagColor": "#3498db",
        "description": "標籤描述",
        "category": "general",
        "isActive": true,
        "assignmentId": "assignment_uuid",
        "assignedBy": "user@email.com",
        "assignedTime": 1640995200000
      }
    ]
  }
  ```

### 獲取用戶標籤
- **路徑**: `/tags/user`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `userEmail=user@email.com`
- **回應**: 與專案標籤格式相同，包含用戶的所有標籤

### 批次更新用戶標籤
- **路徑**: `/tags/batch/user`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "userEmail": "user@email.com",
    "tagOperations": [
      { "tagId": "tag_1", "action": "add" },
      { "tagId": "tag_2", "action": "remove" },
      { "tagId": "tag_3", "action": "add" }
    ]
  }
  ```
- **權限**: 需要系統管理員權限
- **說明**: 一次處理多個標籤變更操作，提高效率並確保資料一致性
- **回應**:
  ```json
  {
    "success": true,
    "data": {
      "userEmail": "user@email.com",
      "results": [
        {
          "tagId": "tag_1",
          "action": "add",
          "success": true,
          "data": { "assignmentId": "assignment_uuid" }
        },
        {
          "tagId": "tag_2",
          "action": "remove", 
          "success": true,
          "data": { "assignmentId": "assignment_uuid" }
        },
        {
          "tagId": "tag_3",
          "action": "add",
          "success": false,
          "error": "Cannot assign archived/inactive tag"
        }
      ],
      "summary": {
        "total": 3,
        "successful": 2,
        "failed": 1
      }
    }
  }
  ```

### 批次更新專案標籤
- **路徑**: `/tags/batch/project`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "tagOperations": [
      { "tagId": "tag_1", "action": "add" },
      { "tagId": "tag_2", "action": "remove" }
    ]
  }
  ```
- **權限**: 需要專案管理權限或系統管理員權限
- **回應**: 與用戶批次更新格式相同

## 通知系統 API

### 獲取未讀通知數量
- **路徑**: `/notifications/count`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
- **回應**:
  ```json
  {
    "success": true,
    "data": {
      "unreadCount": 5
    }
  }
  ```
- **說明**: 獲取目前用戶的未讀通知數量

### 獲取用戶通知列表
- **路徑**: `/notifications/list`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `limit=20` (選填，預設20)
  - `offset=0` (選填，預設0)
  - `unreadOnly=false` (選填，只顯示未讀通知)
- **回應**:
  ```json
  {
    "success": true,
    "data": {
      "notifications": [
        {
          "notificationId": "noti_uuid",
          "type": "user_mention",
          "title": "您被提及",
          "content": "張同學 在 專案管理系統 - 階段一 的評論中提及了您",
          "projectId": "proj_uuid",
          "stageId": "stg_uuid",
          "commentId": "cmt_uuid",
          "isRead": false,
          "emailSent": false,
          "createdTime": 1640995200000,
          "readTime": null,
          "metadata": {
            "projectName": "專案管理系統",
            "stageName": "階段一",
            "authorName": "張同學"
          }
        }
      ],
      "total": 15,
      "hasMore": true
    }
  }
  ```

### 標記通知為已讀
- **路徑**: `/notifications/mark-read`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "notificationId": "noti_uuid"
  }
  ```
- **回應**:
  ```json
  {
    "success": true,
    "data": {
      "notificationId": "noti_uuid",
      "isRead": true,
      "readTime": 1640995300000
    },
    "message": "Notification marked as read"
  }
  ```

### 標記所有通知為已讀
- **路徑**: `/notifications/mark-all-read`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid"
  }
  ```
- **回應**:
  ```json
  {
    "success": true,
    "data": {
      "markedCount": 8,
      "readTime": 1640995300000
    },
    "message": "8 notifications marked as read"
  }
  ```

### 刪除通知
- **路徑**: `/notifications/delete`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "notificationId": "noti_uuid"
  }
  ```
- **回應**:
  ```json
  {
    "success": true,
    "data": {
      "notificationId": "noti_uuid",
      "isDeleted": true,
      "deletedTime": 1640995400000
    }
  }
  ```

### 通知接收者範圍總覽

系統通知遵循以下接收者規則：

| 通知類別 | 接收者範圍 | 說明 |
|---------|-----------|------|
| **專案/階段相關** | 專案全體參與者 | stage_created, stage_status_changed, stage_settled, project_updated, group_created |
| **提交/投票相關** | 僅同組成員 | submission_created_group, voting_proposal_created, consensus_reached, submission_withdrawn |
| **評論相關** | 個人（被提及/被回覆） | comment_mention, comment_group_mention, comment_reply |
| **點數相關** | 個人（接收者） | points_awarded |

### 通知類型說明

系統支援 20+ 種通知類型，涵蓋所有業務場景：

#### 評論互動通知
- **`comment_mention`**: 用戶被提及 - 當評論中使用 @username 時觸發，通知被提及的用戶
- **`comment_group_mention`**: 群組被提及 - 當評論中使用 @groupname 時觸發，通知該組所有成員
- **`comment_reply`**: 評論被回覆 - 當有人回覆您的評論時觸發

#### 專案管理通知
- **`project_updated`**: 專案更新 - 專案資訊變更時通知所有參與者
- **`group_created`**: 群組建立 - 新群組建立時通知專案成員
- **`group_updated`**: 群組更新 - 群組資訊變更時通知相關成員

#### 階段生命週期通知
- **`stage_created`**: 階段建立 - 新階段建立時通知所有參與者
- **`stage_status_changed`**: 階段狀態變更 - 階段狀態改變時通知（開始、暫停、投票、完成等）
- **`stage_settled`**: 階段結算完成 - 階段分數結算完成時通知所有參與者

#### 成果與投票通知（僅通知同組成員）
- **`submission_created_group`**: 組內新提交 - 同組成員提交新作品時通知**同組其他成員**（排除提交者）
- **`submission_withdrawn`**: 作品撤回 - 作品被撤回時通知**同組成員**
- **`submission_restored`**: 作品恢復 - 作品從歷史版本恢復時通知**同組成員**
- **`voting_proposal_created`**: 投票提案創建 - 組別創建新的排名提案時通知**同組成員**（排除提案者）
- **`proposal_vote`**: 提案獲得支持 - 有人投支持票時通知**提案創建者個人**
- **`consensus_reached`**: 達成共識 - 組別在排名投票中達成共識時通知**所有組員**

#### 點數與獎勵通知
- **`points_awarded`**: 點數獲得 - 獲得點數時的通知（正數為獲得，負數為扣除）
  - 包含獎勵來源、階段資訊、獎勵者資訊
  - 支援各種交易類型：成果獎勵、評論獎勵、排名獎勵、手動調整等

#### 系統通知
- **`welcome`**: 歡迎通知 - 新用戶註冊時發送的歡迎訊息

### 通知觸發機制

通知系統已全面整合到所有核心 API，自動觸發相應通知：

#### 評論系統 (comments_api.js)
- `createComment()` - 創建評論時：
  - 自動檢測 @user 提及並發送 `comment_mention` 通知
  - 自動檢測 @group 提及並發送 `comment_group_mention` 通知給組員
  - 若為回覆評論，發送 `comment_reply` 通知給原評論作者

#### 專案管理 (projects_api.js)
- `updateProject()` - 更新專案資訊時：
  - 發送 `project_updated` 通知給所有專案成員（排除操作者）

#### 群組管理 (groups_api.js)
- `createGroup()` - 創建群組時：
  - 發送 `group_created` 通知給所有專案成員（排除創建者）
- `updateGroup()` - 更新群組時：
  - 發送 `group_updated` 通知給群組成員（排除更新者）

#### 階段管理 (stages_api.js)
- `createStage()` - 創建階段時：
  - 發送 `stage_created` 通知給所有專案成員（排除創建者）
- `updateStage()` - 更新階段狀態時：
  - 狀態變為 `active`：發送 `stage_status_changed` 通知（pending → active）
  - 狀態變為 `voting`：發送 `stage_status_changed` 通知（active → voting）
  - 狀態變為 `completed`：發送 `stage_status_changed` 通知（voting → completed）
  - 其他狀態變更（paused, closed, settled）：統一發送 `stage_status_changed` 通知

#### 提交與投票 (submissions_api.js) - **僅通知同組成員**
- `submitDeliverable()` - 提交作品時：
  - 發送 `submission_created_group` 通知給**同組成員**（排除提交者）
  - ⚠️ **不通知其他組或專案成員**
- `submitGroupRanking()` - 提交排名提案時：
  - 發送 `voting_proposal_created` 通知給**同組成員**（排除提案者）
- `voteOnRankingProposal()` - 對提案投支持票時：
  - 發送 `proposal_vote` 通知給**提案創建者個人**（僅支持票才通知）
- `withdrawSubmission()` - 撤回作品時：
  - 發送 `submission_withdrawn` 通知給**同組成員**
- `restoreSubmission()` - 恢復作品時：
  - 發送 `submission_restored` 通知給**同組成員**

#### 分數結算 (scoring_api.js)
- `settleStageAPI()` - 階段結算時：
  - 發送 `stage_settled` 通知給所有參與者
  - 包含結算者資訊和階段名稱

#### 點數系統 (wallets_api.js)
- `awardPoints()` - 獎勵點數時：
  - 發送 `points_awarded` 通知給接收者（僅非系統操作）
  - 包含點數數量、來源、階段、獎勵者等資訊
- `reverseTransaction()` - 撤銷交易時：
  - 發送 `points_awarded` 通知（負數點數）給受影響用戶
  - 包含撤銷原因和操作者資訊

#### 用戶註冊 (users_api.js)
- `createUser()` - 新用戶註冊時：
  - 發送 `welcome` 歡迎通知給新用戶

### 郵件通知系統

系統包含自動郵件通知機制：

#### 定時發送機制
- **每日巡檢**: 定時觸發器執行 `runDailyNotificationPatrol()` 函數
  - 檢查所有 `isRead=false`, `emailSent=false`, `isDeleted=false` 的通知
  - 按用戶分組，批次發送（每批 50 個用戶）
  - 發送成功後標記 `emailSent: true` 和 `emailSentTime`

#### 郵件內容格式
- **HTML 格式**: 使用精美的 HTML 模板，包含：
  - 系統品牌顏色（橙色主題）
  - 通知類型圖標和標題
  - 通知內容預覽（截斷過長內容）
  - 相關專案和階段資訊
  - 操作時間和操作者
  - 前往系統的 CTA 按鈕

#### 自動歸檔機制
- **spreadsheet 備份**: 當通知表超過 50,000 行時：
  - 自動重命名當前表為 `系統通知_歷史檔案_YYYY-MM-DD`
  - 創建新的通知表
  - 更新 `NOTIFICATION_SPREADSHEET_ID` PropertiesService 參數
  - 記錄歸檔次數和日期

#### 狀態追蹤
- `emailSent`: 布爾值，標記郵件是否已發送
- `emailSentTime`: 時間戳，記錄郵件發送時間
- 完整保留通知發送歷史供審計

### 通知系統配置

#### PropertiesService 參數
- `NOTIFICATION_SPREADSHEET_ID`: 當前通知表的 Spreadsheet ID
- `NOTIFICATION_ARCHIVE_COUNT`: 已歸檔次數
- `LAST_NOTIFICATION_ARCHIVE_DATE`: 最後歸檔日期
- `LAST_NOTIFICATION_PATROL`: 最後巡檢結果（JSON）
- `LAST_NOTIFICATION_PATROL_ERROR`: 最後巡檢錯誤（JSON）

#### 定時觸發器設置
建議在 GAS 中設置以下觸發器：
1. **每日通知巡檢**: `runDailyNotificationPatrol` - 每天執行一次（建議晚上）
2. **每日系統維護**: `runDailyCleanup` - 包含通知維護在內的全系統清理

## 錯誤碼說明

| 錯誤碼 | 說明 |
|--------|------|
| `SESSION_INVALID` | Session 無效或已過期 |
| `ACCESS_DENIED` | 權限不足 |
| `INVALID_INPUT` | 輸入參數無效 |
| `USER_NOT_FOUND` | 用戶不存在 |
| `PROJECT_NOT_FOUND` | 專案不存在 |
| `GROUP_NOT_FOUND` | 群組不存在 |
| `STAGE_NOT_FOUND` | 階段不存在 |
| `LIMIT_EXCEEDED` | 超過系統限制 |
| `AUTHENTICATION_FAILED` | 認證失敗 |
| `USER_EXISTS` | 用戶已存在 |
| `GROUP_EXISTS` | 群組已存在 |
| `INVITATION_EXPIRED` | 邀請碼已過期 |
| `INVITATION_USED` | 邀請碼已使用 |
| `TAG_NOT_FOUND` | 標籤不存在 |
| `TAG_EXISTS` | 標籤已存在 |
| `TAG_INACTIVE` | 標籤已封存/停用，無法指派 |
| `ASSIGNMENT_EXISTS` | 標籤指派已存在 |
| `ASSIGNMENT_NOT_FOUND` | 標籤指派不存在 |
| `SYSTEM_ERROR` | 系統錯誤 |

## 權限系統

### 群組角色
- **pm**: 專案管理者
- **deliverable_team**: 交成果團隊
- **reviewer**: 審核者
- **observer**: 觀察者

### 權限類型
- **submit**: 提交成果
- **vote**: 參與投票
- **rank**: 進行排名
- **comment**: 撰寫評論
- **manage**: 管理權限
- **view**: 查看權限

## 使用範例

### JavaScript 前端調用範例

```javascript
// 登入
const loginResponse = await fetch('https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec', {
  method: 'POST',
  body: JSON.stringify({
    path: '/auth/login',
    username: 'user123',
    password: 'password123'
  })
});

const loginData = await loginResponse.json();
if (loginData.success) {
  const sessionId = loginData.data.sessionId;
  // 儲存 sessionId 供後續使用
}

// 取得專案列表
const projectsResponse = await fetch(`https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec?path=/projects/list&sessionId=${sessionId}`);
const projectsData = await projectsResponse.json();

// 建立專案
const createResponse = await fetch('https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec', {
  method: 'POST',
  body: JSON.stringify({
    path: '/projects/create',
    sessionId: sessionId,
    projectData: {
      projectName: '新專案',
      description: '專案描述'
    }
  })
});
```

## 系統日誌 API

### 獲取系統日誌
- **路徑**: `/system/logs`
- **方法**: GET
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "limit": 20,
    "level": "INFO",
    "search": "搜尋關鍵字",
    "startDate": "2025-09-01",
    "endDate": "2025-09-09"
  }
  ```
- **權限**: 需要系統管理員權限 (`system_admin`)
- **回應**:
  ```json
  {
    "success": true,
    "data": {
      "logs": [
        {
          "timestamp": "2025-09-09T14:30:45.123Z",
          "level": "INFO",
          "functionName": "authenticateUser",
          "userId": "usr_123",
          "sessionId": "sess_456",
          "action": "用戶登入",
          "details": "登入成功",
          "requestData": "",
          "responseStatus": "success",
          "executionTime": 145,
          "ipAddress": "192.168.1.100",
          "userAgent": "Mozilla/5.0..."
        }
      ],
      "total": 1500,
      "hasMore": true
    }
  }
  ```
- **說明**: 支援多種過濾條件，返回按時間倒序排列的日誌記錄

### 獲取日誌統計
- **路徑**: `/system/logs/stats`
- **方法**: GET
- **參數**:
  ```json
  {
    "sessionId": "session_uuid"
  }
  ```
- **權限**: 需要系統管理員權限
- **回應**:
  ```json
  {
    "success": true,
    "data": {
      "totalLogs": 15000,
      "levelCounts": {
        "DEBUG": 500,
        "INFO": 10000,
        "WARN": 3000,
        "ERROR": 1400,
        "FATAL": 100
      },
      "oldestLog": "2025-08-01T00:00:00.000Z",
      "newestLog": "2025-09-09T14:30:45.123Z",
      "spreadsheetId": "1BxYz...abc",
      "spreadsheetName": "系統日誌_2025-09-09",
      "executionTime": 245
    }
  }
  ```
- **說明**: 提供日誌總覽資訊，包含等級分布、時間範圍等統計數據

### 手動歸檔日誌
- **路徑**: `/system/logs/archive`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "maxRows": 50000
  }
  ```
- **權限**: 需要系統管理員權限
- **回應**:
  ```json
  {
    "success": true,
    "data": {
      "archived": true,
      "oldRows": 52000,
      "oldSpreadsheetName": "系統日誌_2025-09-08_歷史檔案_2025-09-09",
      "newSpreadsheetId": "1CzAb...def",
      "message": "成功歸檔52000行日誌，創建新日誌表"
    }
  }
  ```
- **說明**: 
  - 當日誌表超過指定行數時觸發歸檔
  - 自動重命名當前試算表並創建新的日誌表
  - 更新 PropertiesService 中的日誌表ID
  - 若未達歸檔條件，返回 `archived: false`

### 日誌等級說明
- **DEBUG**: 開發調試資訊，生產環境通常關閉
- **INFO**: 正常業務操作記錄 (登入、建立專案、提交報告等)
- **WARN**: 警告事件，系統可正常運作 (權限檢查失敗、參數驗證警告等)
- **ERROR**: 錯誤事件，操作失敗但不影響系統穩定 (API調用失敗、資料驗證錯誤等)
- **FATAL**: 嚴重錯誤，可能影響系統運作 (資料庫連接失敗、系統配置錯誤等)

### 自動維護功能
系統包含自動維護機制：
- **每日維護**: 凌晨2-3點執行 `runDailyCleanup()` 函數
- **自動歸檔**: 日誌表超過50,000行時自動執行歸檔
- **會話清理**: 清理超過24小時的過期會話
- **邀請碼清理**: 清理已過期的邀請碼
- **通知維護**: 每日通知巡檢和郵件發送 (runDailyNotificationPatrol)
- **統計更新**: 更新系統統計數據
- **日誌統計**: 提供完整的日誌統計和查詢功能
- **管理員通知**: 重要維護事件會發送Email通知

### 日誌安全與隱私
- **資料脫敏**: 密碼、敏感個資等不會記錄到日誌中
- **存取控制**: 只有具備 `system_admin` 權限的用戶可存取日誌
- **自動歸檔**: 確保單一日誌表不會過於龐大，影響查詢效能
- **定期清理**: 建議定期備份並清理超過6個月的歷史日誌

## Console 日誌控制 API

### 獲取Console日誌輸出狀態
- **路徑**: `/system/console-logging/status`
- **方法**: GET
- **參數**: 無需參數
- **權限**: 公開端點，無需認證
- **回應**:
  ```json
  {
    "success": true,
    "data": {
      "enabled": true,
      "currentSetting": "enabled",
      "description": "Console output enabled for both frontend and backend"
    }
  }
  ```
- **說明**: 
  - 獲取後端 `LOG_CONSOLE` PropertiesService 參數狀態
  - 前端根據此狀態決定是否啟用console輸出
  - `enabled: true` 表示前後端都會輸出到console
  - `enabled: false` 表示前後端都不輸出到console，僅記錄到日誌系統

### Console日誌同步機制

#### 統一日誌系統架構
系統已完全整合console輸出與結構化日誌記錄：
- **雙重記錄**: 所有輸出同時記錄到Google Sheets和console (根據LOG_CONSOLE設定)
- **API生命週期**: 自動記錄所有API請求開始/成功/失敗狀態
- **前後端同步**: 前端透過google.script.run調用後端API同步console設定

#### 前後端同步原理
1. **後端控制**: 透過 PropertiesService 的 `LOG_CONSOLE` 參數控制
2. **前端同步**: 啟動時自動調用 `/system/console-logging/status` API
3. **統一行為**: 確保前後端console輸出行為一致
4. **結構化記錄**: 所有console輸出都包裝為結構化日誌函數 (log, logErr, logWrn)

#### 使用場景
- **開發環境**: `LOG_CONSOLE=true` - 前後端都有console輸出，便於即時除錯
- **生產環境**: `LOG_CONSOLE=false` - 前後端都靜音console，減少噪音
- **動態調整**: 管理員可隨時透過 PropertiesService 調整設定

#### 前端實作
```javascript
// 前端會在啟動時自動同步console設定
import { syncConsoleSettings, forceLog } from './utils/logSync.js'

// 應用啟動時執行
await syncConsoleSettings()

// 一般輸出（遵循LOG_CONSOLE設定）
console.log('這會根據LOG_CONSOLE設定決定是否輸出')

// 強制輸出（不受LOG_CONSOLE影響）
forceLog('重要系統訊息，一定會輸出')
```

#### 後端實作
```javascript
// 統一日誌系統已完全替代console輸出
// 原本的113個console.log/error/warn調用已全部遷移

log('一般資訊', { context: 'data' });        // 根據LOG_CONSOLE決定console輸出
logErr('錯誤訊息', error);                   // 根據LOG_CONSOLE決定console輸出
logWrn('警告訊息', { warning: 'details' });  // 根據LOG_CONSOLE決定console輸出

// API生命週期自動記錄
function handleAPIRequest(method, path, params) {
  logInfo('handleAPIRequest', `${method} ${path}`, { // 自動記錄API開始
    requestData: JSON.stringify({path, method}),
    userId: userId, sessionId: sessionId
  });
  // ... API處理邏輯
  logInfo('handleAPIRequest', `${method} ${path} - 成功`, { // 自動記錄成功
    responseStatus: 'success', executionTime: duration
  });
}

// 所有輸出都會記錄到日誌系統，不受LOG_CONSOLE影響
```

### 設定方法

#### 開啟Console輸出
```javascript
PropertiesService.getScriptProperties().setProperty('LOG_CONSOLE', 'true');
```

#### 關閉Console輸出
```javascript
PropertiesService.getScriptProperties().setProperty('LOG_CONSOLE', 'false');
```

### 初始化預設值
系統初始化時會自動設定 `LOG_CONSOLE='true'`，確保開發友善的預設行為。

### 技術特點
- **無縫整合**: 前後端console行為完全同步
- **零配置**: 前端自動檢測並應用後端設定
- **即時生效**: 後端設定變更後，前端重新載入即生效
- **完全遷移**: 所有API文件已遷移至統一日誌系統 (113個console調用)
- **API監控**: 自動記錄所有API請求/響應/錯誤的完整生命週期
- **強制輸出**: 提供不受設定影響的強制輸出功能
- **性能影響**: 對API執行性能無顯著影響，日誌記錄異步進行

## 標籤作用域 (Tag Scope) 機制

### 嚴格標籤匹配規則

系統實施**嚴格標籤作用域**機制，確保資料隔離和安全：

#### 基本原則
- **完全匹配**: 只有**完全相同**標籤集合的用戶/專案才能互相訪問
- **無部分匹配**: 不允許部分標籤匹配，如 [台大][護理系] 無法看到 [台大][社會系]
- **系統管理員例外**: 具有 system_admin 權限的用戶可以訪問所有作用域

#### 影響範圍
- **用戶搜尋**: `/users/search` 只返回相同標籤集合的用戶
- **專案列表**: `/projects/list` 只顯示相同標籤集合的專案
- **群組成員**: 只能將相同標籤集合的用戶加入群組
- **數據可見性**: 所有業務數據都受標籤作用域限制

#### API 行為變更
```javascript
// 範例：用戶A有標籤 [台大, 護理系]
// 只能看到同樣有 [台大, 護理系] 的其他用戶和專案
// 無法看到 [台大, 社會系] 或 [台大] 或 [護理系] 的資源
```

#### 實現細節
- 使用 `arraysEqual()` 函數進行精確數組比較
- 標籤數組會自動排序後比較，確保順序無關
- 空標籤集合視為無權限（除系統管理員外）

## 部署指南

1. **設定 PropertiesService**:
   ```javascript
   // 在 GAS 編輯器中執行一次
   function setupProperties() {
     PropertiesService.getScriptProperties().setProperties({
       'DATABASE_FOLDER_ID': 'your-google-drive-folder-id',
       'SESSION_TIMEOUT': '86400000', // 24小時
       'MAX_GROUPS_PER_PROJECT': '20',
       'MAX_MEMBERS_PER_GROUP': '10'
     });
   }
   ```

2. **部署為網路應用程式**:
   - 在 GAS 編輯器中點選「部署」→「新增部署」
   - 選擇「網路應用程式」類型
   - 設定執行身分為「我」
   - 設定存取權限為「所有人」
   - 複製部署 URL 作為 API 基礎 URL

3. **初始化系統**:
   ```javascript
   // 呼叫系統初始化 API
   POST /system/initialize
   ```

## 注意事項

1. **Google Apps Script 限制**:
   - 執行時間限制：6 分鐘
   - 記憶體限制：約 100MB
   - 併發請求限制：30 個

2. **Google Sheets 限制**:
   - 單一試算表最大 500 萬個儲存格
   - 單一工作表最大 40,000 行

3. **安全性建議**:
   - 定期更換 Session
   - 實作 Rate Limiting
   - 敏感操作加入額外驗證

4. **效能優化**:
   - 善用快取機制
   - 批次操作減少 API 調用
   - 定期清理過期資料

## 排名投票 API 詳細說明

### 提交群組排名提案
- **路徑**: `/rankings/submit`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid", 
    "stageId": "stg_uuid",
    "rankingData": {
      "grp_uuid1": 1,
      "grp_uuid2": 2,
      "grp_uuid3": 3
    }
  }
  ```
- **安全規則**:
  - 用戶必須是項目中的活躍組員
  - 只能為自己所屬的組提交排名提案
  - 階段狀態必須為 `voting`
  - 自動版本控制：新提案會標記為下一版本，舊提案狀態變為 `superseded`
- **回應**:
  ```json
  {
    "success": true,
    "data": {
      "proposalId": "prop_uuid",
      "version": "v2",
      "status": "active",
      "createdTime": 1640000000000
    }
  }
  ```

### 對排名提案投票
- **路徑**: `/rankings/vote`
- **方法**: POST
- **參數**:
  ```json
  {
    "sessionId": "session_uuid",
    "projectId": "proj_uuid",
    "proposalId": "prop_uuid",
    "agree": true,
    "comment": "投票意見（選填）"
  }
  ```
- **安全規則**:
  - 只能對自己組的提案投票
  - 不能對自己提交的提案投票
  - 每個提案每人只能投票一次
  - 只能對狀態為 `active` 的提案投票
- **回應**:
  ```json
  {
    "success": true,
    "data": {
      "vote": {
        "voteId": "vote_uuid",
        "agree": true,
        "timestamp": 1640000000000
      },
      "updatedCounts": {
        "supportCount": 3,
        "opposeCount": 1
      }
    }
  }
  ```

### 獲取階段排名提案
- **路徑**: `/rankings/proposals`
- **方法**: GET
- **參數**:
  - `sessionId=session_uuid`
  - `projectId=proj_uuid`
  - `stageId=stg_uuid`
  - `groupId=grp_uuid` (選填，管理員可查看其他組)
  - `includeVersionHistory=true` (選填，是否包含版本歷史)
- **安全規則**:
  - 非管理員用戶只能查看自己組的提案
  - 管理員可以查看所有組的提案
- **回應**:
  ```json
  {
    "success": true,
    "data": {
      "proposals": [
        {
          "proposalId": "prop_uuid",
          "groupId": "grp_uuid",
          "groupName": "Group A",
          "proposer": "Alice Chen",
          "rankingData": "{\"grp_uuid1\": 1, \"grp_uuid2\": 2}",
          "version": "v2",
          "status": "active",
          "createdTime": 1640000000000,
          "supportCount": 3,
          "opposeCount": 1,
          "totalGroupMembers": 5,
          "hasUserVoted": true,
          "userVote": true,
          "votes": [
            {
              "voteId": "vote_uuid",
              "voter": "Bob Wilson",
              "agree": true,
              "timestamp": 1640100000000,
              "comment": "同意這個排名"
            }
          ]
        }
      ],
      "proposalsByGroup": {
        "grp_uuid": [/* 按版本排序的該組所有提案 */]
      },
      "metadata": {
        "totalProposals": 1,
        "activeProposals": 1,
        "userGroupId": "grp_uuid",
        "filteredByGroup": "grp_uuid"
      }
    }
  }
  ```

### 版本控制機制
- 每個組在同一階段可以提交多個版本的排名提案
- 新提案自動標記為下一版本（v1, v2, v3...）
- 舊版本自動標記為 `superseded` 狀態
- 只有 `active` 狀態的提案可以接受投票
- 前端可以查看完整的版本歷史用於參考

這個 API 文檔提供了完整的後端 API 介面說明，涵蓋了專案評分系統的所有核心功能。